import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { PROJECT_ROOT } from "./projectRoot.js";
import {
  classifyMemorySensitivity,
  type MemorySensitivity,
} from "./sensitiveMemory.js";

export type MemoryV2Type =
  | "preference"
  | "profile"
  | "fact"
  | "project"
  | "relationship"
  | "instruction"
  | "context"
  | "other";

export type MemoryV2Source = "manual" | "passive" | "system" | "import";

export type MemoryV2Metadata = Record<string, string | number | boolean | null>;

export type MemoryV2Input = {
  key?: string;
  type?: MemoryV2Type;
  subject?: string | null;
  predicate?: string | null;
  value: string;
  category?: string;
  confidence?: number;
  source?: MemoryV2Source;
  sensitivity?: MemorySensitivity;
  metadata?: MemoryV2Metadata;
};

export type MemoryV2Record = {
  id: string;
  key: string;
  type: MemoryV2Type;
  subject: string | null;
  predicate: string | null;
  value: string;
  category: string;
  confidence: number;
  source: MemoryV2Source;
  sensitivity: MemorySensitivity;
  metadata: MemoryV2Metadata;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  access_count: number;
  archived_at: string | null;
};

export type MemoryV2ListOptions = {
  category?: string;
  type?: MemoryV2Type;
  includeArchived?: boolean;
  limit?: number;
};

const DB_PATH = path.join(PROJECT_ROOT, "data/.gwen-memory.db");
const LEGACY_DB_PATH = path.join(PROJECT_ROOT, "data/.mj-memory.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
    fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);
  }
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  ensureMemoryV2Schema();
  return db;
}

export function ensureMemoryV2Schema(): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
    fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);
  }
  const conn = db ?? new Database(DB_PATH);
  conn.exec(`
    CREATE TABLE IF NOT EXISTS memory_v2 (
      id               TEXT PRIMARY KEY,
      key              TEXT NOT NULL UNIQUE,
      type             TEXT NOT NULL DEFAULT 'fact',
      subject          TEXT,
      predicate        TEXT,
      value            TEXT NOT NULL,
      category         TEXT NOT NULL DEFAULT 'general',
      confidence       REAL NOT NULL DEFAULT 1.0,
      source           TEXT NOT NULL DEFAULT 'manual',
      sensitivity      TEXT NOT NULL DEFAULT 'normal',
      metadata_json    TEXT NOT NULL DEFAULT '{}',
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_accessed_at DATETIME,
      access_count     INTEGER NOT NULL DEFAULT 0,
      archived_at      DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_memory_v2_category ON memory_v2(category);
    CREATE INDEX IF NOT EXISTS idx_memory_v2_type ON memory_v2(type);
    CREATE INDEX IF NOT EXISTS idx_memory_v2_sensitivity ON memory_v2(sensitivity);
    CREATE INDEX IF NOT EXISTS idx_memory_v2_updated_at ON memory_v2(updated_at);
  `);
  if (!db) conn.close();
}

function nowId(): string {
  return randomUUID();
}

function normalizeKey(input: MemoryV2Input): string {
  if (input.key?.trim()) return input.key.trim();
  const parts = [input.type || "fact", input.subject, input.predicate, input.value]
    .filter(Boolean)
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return parts.slice(0, 96) || nowId();
}

function normalizeConfidence(confidence: number | undefined): number {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return 1;
  return Math.min(1, Math.max(0, confidence));
}

function parseMetadata(metadataJson: string): MemoryV2Metadata {
  try {
    const parsed = JSON.parse(metadataJson || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function rowToRecord(row: any): MemoryV2Record {
  return {
    id: row.id,
    key: row.key,
    type: row.type,
    subject: row.subject,
    predicate: row.predicate,
    value: row.value,
    category: row.category,
    confidence: row.confidence,
    source: row.source,
    sensitivity: row.sensitivity,
    metadata: parseMetadata(row.metadata_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_accessed_at: row.last_accessed_at,
    access_count: row.access_count,
    archived_at: row.archived_at,
  };
}

export function upsertMemoryV2(input: MemoryV2Input): MemoryV2Record {
  if (!input.value || !input.value.trim()) {
    throw new Error("Memory value is required.");
  }

  const classification = classifyMemorySensitivity(input.value);
  if (!classification.shouldStore && input.sensitivity !== "secret") {
    throw new Error("Refusing to store secret memory text.");
  }

  const record = {
    id: nowId(),
    key: normalizeKey(input),
    type: input.type || "fact",
    subject: input.subject || null,
    predicate: input.predicate || null,
    value: input.value.trim(),
    category: input.category || "general",
    confidence: normalizeConfidence(input.confidence),
    source: input.source || "manual",
    sensitivity: input.sensitivity || classification.sensitivity,
    metadata_json: JSON.stringify(input.metadata || {}),
  };

  getDb()
    .prepare(
      `INSERT INTO memory_v2 (
         id, key, type, subject, predicate, value, category, confidence, source, sensitivity, metadata_json
       ) VALUES (
         @id, @key, @type, @subject, @predicate, @value, @category, @confidence, @source, @sensitivity, @metadata_json
       )
       ON CONFLICT(key) DO UPDATE SET
         type = excluded.type,
         subject = excluded.subject,
         predicate = excluded.predicate,
         value = excluded.value,
         category = excluded.category,
         confidence = excluded.confidence,
         source = excluded.source,
         sensitivity = excluded.sensitivity,
         metadata_json = excluded.metadata_json,
         updated_at = CURRENT_TIMESTAMP,
         archived_at = NULL`
    )
    .run(record);

  return getMemoryV2ByKey(record.key)!;
}

export function getMemoryV2ByKey(key: string): MemoryV2Record | null {
  const row = getDb().prepare("SELECT * FROM memory_v2 WHERE key = ?").get(key);
  if (!row) return null;
  touchMemoryV2(row.id);
  return rowToRecord(
    getDb().prepare("SELECT * FROM memory_v2 WHERE id = ?").get(row.id)
  );
}

export function getMemoryV2ById(id: string): MemoryV2Record | null {
  const row = getDb().prepare("SELECT * FROM memory_v2 WHERE id = ?").get(id);
  if (!row) return null;
  touchMemoryV2(row.id);
  return rowToRecord(
    getDb().prepare("SELECT * FROM memory_v2 WHERE id = ?").get(row.id)
  );
}

export function listMemoriesV2(options: MemoryV2ListOptions = {}): MemoryV2Record[] {
  const clauses: string[] = [];
  const params: any = { limit: options.limit || 100 };
  if (!options.includeArchived) clauses.push("archived_at IS NULL");
  if (options.category) {
    clauses.push("category = @category");
    params.category = options.category;
  }
  if (options.type) {
    clauses.push("type = @type");
    params.type = options.type;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(`SELECT * FROM memory_v2 ${where} ORDER BY updated_at DESC LIMIT @limit`)
    .all(params)
    .map(rowToRecord);
}

export function searchMemoriesV2(query: string, limit = 20): MemoryV2Record[] {
  const like = `%${query}%`;
  return getDb()
    .prepare(
      `SELECT * FROM memory_v2
       WHERE archived_at IS NULL
         AND (key LIKE @like OR value LIKE @like OR subject LIKE @like OR predicate LIKE @like)
       ORDER BY updated_at DESC
       LIMIT @limit`
    )
    .all({ like, limit })
    .map(rowToRecord);
}

export function archiveMemoryV2(key: string): boolean {
  const info = getDb()
    .prepare("UPDATE memory_v2 SET archived_at = CURRENT_TIMESTAMP WHERE key = ? AND archived_at IS NULL")
    .run(key);
  return info.changes > 0;
}

export function deleteMemoryV2(key: string): boolean {
  const info = getDb().prepare("DELETE FROM memory_v2 WHERE key = ?").run(key);
  return info.changes > 0;
}

export function touchMemoryV2(id: string): void {
  getDb()
    .prepare(
      "UPDATE memory_v2 SET last_accessed_at = CURRENT_TIMESTAMP, access_count = access_count + 1 WHERE id = ?"
    )
    .run(id);
}
