// src/skills/sqlite.js — SQLite key-value store for memory
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { PROJECT_ROOT } from "./projectRoot.js";

const DB_PATH = path.join(PROJECT_ROOT, "data/.gwen-memory.db");
const LEGACY_DB_PATH = path.join(PROJECT_ROOT, "data/.mj-memory.db");

let db = null;

function applyMigration(database, version: string, description: string, migrate: () => void) {
  const applied = database
    .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
    .get(version);
  if (applied) return;

  const run = database.transaction(() => {
    migrate();
    database
      .prepare("INSERT INTO schema_migrations (version, description) VALUES (?, ?)")
      .run(version, description);
  });
  run();
}

function ensureDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // Migrate legacy .mj-memory.db → .gwen-memory.db on first run.
  if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
    fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);
  }
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      category   TEXT DEFAULT 'general',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category);
  `);
  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)"
  ).run("000_memory_base", "Create base memory table and category index");
  applyMigration(db, "001_memory_embedding", "Add semantic recall embedding column", () => {
    const cols = db.prepare("PRAGMA table_info(memory)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "embedding")) {
      db.exec("ALTER TABLE memory ADD COLUMN embedding BLOB");
    }
  });
  return db;
}

export function get(key) {
  const row = ensureDb().prepare("SELECT value FROM memory WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function set(key, value, category = "general") {
  ensureDb()
    .prepare(
      `INSERT INTO memory (key, value, category) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         category = excluded.category,
         updated_at = CURRENT_TIMESTAMP`
    )
    .run(key, value, category);
}

export function del(key) {
  const info = ensureDb().prepare("DELETE FROM memory WHERE key = ?").run(key);
  return info.changes > 0;
}

export function listAll() {
  return ensureDb()
    .prepare("SELECT key, value, category, updated_at FROM memory ORDER BY updated_at DESC")
    .all();
}

export function listByCategory(category) {
  return ensureDb()
    .prepare("SELECT key, value FROM memory WHERE category = ?")
    .all(category);
}

export function search(query) {
  const like = `%${query}%`;
  return ensureDb()
    .prepare(
      `SELECT key, value FROM memory
       WHERE key LIKE ? OR value LIKE ?
       ORDER BY updated_at DESC LIMIT 20`
    )
    .all(like, like);
}

// ─── Embedding helpers (Layer 1: semantic recall) ───────────────────
export function setEmbedding(key: string, embedding: Float32Array): void {
  ensureDb()
    .prepare("UPDATE memory SET embedding = ? WHERE key = ?")
    .run(Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength), key);
}

export function getRowsWithEmbeddings(): Array<{
  key: string;
  value: string;
  category: string;
  updated_at: string;
  embedding: Float32Array;
}> {
  const rows = ensureDb()
    .prepare(
      "SELECT key, value, category, updated_at, embedding FROM memory WHERE embedding IS NOT NULL"
    )
    .all() as Array<{
    key: string;
    value: string;
    category: string;
    updated_at: string;
    embedding: Buffer;
  }>;
  return rows.map((r) => ({
    key: r.key,
    value: r.value,
    category: r.category,
    updated_at: r.updated_at,
    embedding: new Float32Array(
      r.embedding.buffer,
      r.embedding.byteOffset,
      r.embedding.byteLength / 4
    ),
  }));
}

export function getRowsMissingEmbeddings(): Array<{ key: string; value: string }> {
  return ensureDb()
    .prepare("SELECT key, value FROM memory WHERE embedding IS NULL")
    .all() as Array<{ key: string; value: string }>;
}

// ─── Hygiene helpers ────────────────────────────────────────────────
export function getFullRowsByCategory(category: string): Array<{
  key: string;
  value: string;
  category: string;
  updated_at: string;
  embedding: Float32Array | null;
}> {
  const rows = ensureDb()
    .prepare(
      "SELECT key, value, category, updated_at, embedding FROM memory WHERE category = ? ORDER BY updated_at DESC"
    )
    .all(category) as Array<{
    key: string;
    value: string;
    category: string;
    updated_at: string;
    embedding: Buffer | null;
  }>;
  return rows.map((r) => ({
    key: r.key,
    value: r.value,
    category: r.category,
    updated_at: r.updated_at,
    embedding: r.embedding
      ? new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)
      : null,
  }));
}

export function countByCategory(): Array<{ category: string; n: number }> {
  return ensureDb()
    .prepare("SELECT category, COUNT(*) as n FROM memory GROUP BY category ORDER BY n DESC")
    .all() as Array<{ category: string; n: number }>;
}
