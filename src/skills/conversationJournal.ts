import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { PROJECT_ROOT } from "./projectRoot.js";

const DEFAULT_DB_PATH = path.join(PROJECT_ROOT, "data/.gwen-memory.db");
const LEGACY_DB_PATH = path.join(PROJECT_ROOT, "data/.mj-memory.db");
const MAX_SUMMARY_ITEMS = 12;
const MAX_CONTEXT_EXCHANGES = 6;
const MAX_CONTEXT_MEMORIES = 8;

let db: Database.Database | null = null;

export type ConversationExchangeInput = {
  conversationId: string;
  conversationTitle?: string;
  userText: string;
  assistantText: string;
  occurredAt?: number | Date;
  source?: "voice" | "text" | "local" | "system";
};

export type DailySummary = {
  day: string;
  summary: string;
  exchange_count: number;
  updated_at: string;
};

function dbPath() {
  return process.env.GWEN_MEMORY_DB_PATH || DEFAULT_DB_PATH;
}

function ensureDb(): Database.Database {
  if (db) return db;
  const target = dbPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (target === DEFAULT_DB_PATH && !fs.existsSync(DEFAULT_DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
    fs.copyFileSync(LEGACY_DB_PATH, DEFAULT_DB_PATH);
  }
  db = new Database(target);
  db.pragma("journal_mode = WAL");
  ensureConversationJournalSchema();
  return db;
}

export function ensureConversationJournalSchema(): void {
  const target = dbPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const conn = db ?? new Database(target);
  conn.exec(`
    CREATE TABLE IF NOT EXISTS conversation_exchanges (
      id                 TEXT PRIMARY KEY,
      conversation_id    TEXT NOT NULL,
      conversation_title TEXT,
      day                TEXT NOT NULL,
      user_text          TEXT NOT NULL,
      assistant_text     TEXT NOT NULL,
      source             TEXT NOT NULL DEFAULT 'text',
      occurred_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_exchanges_day
      ON conversation_exchanges(day, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_conversation_exchanges_conversation
      ON conversation_exchanges(conversation_id, occurred_at);

    CREATE TABLE IF NOT EXISTS daily_conversation_summaries (
      day            TEXT PRIMARY KEY,
      summary        TEXT NOT NULL,
      exchange_count INTEGER NOT NULL DEFAULT 0,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_daily_conversation_summaries_updated
      ON daily_conversation_summaries(updated_at);

    CREATE TABLE IF NOT EXISTS daily_memory_refs (
      day        TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      reason     TEXT NOT NULL DEFAULT 'asked_to_keep_in_mind',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(day, memory_key)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_memory_refs_day ON daily_memory_refs(day);
  `);
  if (!db) conn.close();
}

function toDate(input: number | Date | undefined): Date {
  if (input instanceof Date) return input;
  if (typeof input === "number" && Number.isFinite(input)) return new Date(input);
  return new Date();
}

function localDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sqliteDate(date: Date): string {
  return date.toISOString();
}

function compactText(text: string, max = 220): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sentenceFromExchange(row: { user_text: string; assistant_text: string }): string | null {
  const user = compactText(row.user_text, 140);
  const assistant = compactText(row.assistant_text, 160);
  if (!user && !assistant) return null;
  if (!assistant) return `User brought up: ${user}.`;
  if (!user) return `Gwen replied: ${assistant}.`;
  return `User asked about "${user}"; Gwen replied: "${assistant}".`;
}

function detectKeepInMindKeys(text: string): string[] {
  const value = String(text || "").toLowerCase();
  if (!/\b(remember|keep in mind|don't forget|note that|for later)\b/.test(value)) return [];
  return [...value.matchAll(/\b(?:remember|keep in mind|don't forget|note that|for later)\b(?:\s+that)?\s+([^.!?\n]{3,90})/g)]
    .map((m) =>
      m[1]
        .replace(/\b(my|me|i|am|is|are|the|a|an)\b/g, " ")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80)
    )
    .filter(Boolean);
}

function rebuildDailySummary(day: string): DailySummary {
  const rows = ensureDb()
    .prepare(
      `SELECT user_text, assistant_text
       FROM conversation_exchanges
       WHERE day = ?
       ORDER BY occurred_at ASC`
    )
    .all(day) as Array<{ user_text: string; assistant_text: string }>;
  const items = rows
    .map(sentenceFromExchange)
    .filter((item): item is string => !!item)
    .slice(-MAX_SUMMARY_ITEMS);
  const summary = items.length
    ? items.join(" ")
    : "No substantive conversation recorded yet.";
  ensureDb()
    .prepare(
      `INSERT INTO daily_conversation_summaries (day, summary, exchange_count)
       VALUES (@day, @summary, @exchange_count)
       ON CONFLICT(day) DO UPDATE SET
         summary = excluded.summary,
         exchange_count = excluded.exchange_count,
         updated_at = CURRENT_TIMESTAMP`
    )
    .run({ day, summary, exchange_count: rows.length });
  return getDailySummary(day)!;
}

function tableExists(name: string): boolean {
  const row = ensureDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name: string } | undefined;
  return !!row;
}

function getDailyMemoryValues(day: string) {
  const hasMemoryV2 = tableExists("memory_v2");
  const hasLegacyMemory = tableExists("memory");
  if (hasMemoryV2 && hasLegacyMemory) {
    return ensureDb()
      .prepare(
        `SELECT r.memory_key, COALESCE(m.value, legacy.value, r.memory_key) AS value
         FROM daily_memory_refs r
         LEFT JOIN memory_v2 m ON m.key = r.memory_key AND m.archived_at IS NULL
         LEFT JOIN memory legacy ON legacy.key = r.memory_key
         WHERE r.day = ?
         ORDER BY r.created_at DESC
         LIMIT ?`
      )
      .all(day, MAX_CONTEXT_MEMORIES) as Array<{ memory_key: string; value: string }>;
  }
  if (hasMemoryV2) {
    return ensureDb()
      .prepare(
        `SELECT r.memory_key, COALESCE(m.value, r.memory_key) AS value
         FROM daily_memory_refs r
         LEFT JOIN memory_v2 m ON m.key = r.memory_key AND m.archived_at IS NULL
         WHERE r.day = ?
         ORDER BY r.created_at DESC
         LIMIT ?`
      )
      .all(day, MAX_CONTEXT_MEMORIES) as Array<{ memory_key: string; value: string }>;
  }
  if (hasLegacyMemory) {
    return ensureDb()
      .prepare(
        `SELECT r.memory_key, COALESCE(legacy.value, r.memory_key) AS value
         FROM daily_memory_refs r
         LEFT JOIN memory legacy ON legacy.key = r.memory_key
         WHERE r.day = ?
         ORDER BY r.created_at DESC
         LIMIT ?`
      )
      .all(day, MAX_CONTEXT_MEMORIES) as Array<{ memory_key: string; value: string }>;
  }
  return ensureDb()
    .prepare(
      `SELECT memory_key, memory_key AS value
       FROM daily_memory_refs
       WHERE day = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(day, MAX_CONTEXT_MEMORIES) as Array<{ memory_key: string; value: string }>;
}

export function recordConversationExchange(input: ConversationExchangeInput): DailySummary {
  if (!input.conversationId) throw new Error("conversationId is required.");
  if (!compactText(input.userText) && !compactText(input.assistantText)) {
    throw new Error("At least one side of the exchange is required.");
  }
  const at = toDate(input.occurredAt);
  const day = localDay(at);
  ensureDb()
    .prepare(
      `INSERT INTO conversation_exchanges (
         id, conversation_id, conversation_title, day, user_text, assistant_text, source, occurred_at
       ) VALUES (
         @id, @conversation_id, @conversation_title, @day, @user_text, @assistant_text, @source, @occurred_at
       )`
    )
    .run({
      id: randomUUID(),
      conversation_id: input.conversationId,
      conversation_title: input.conversationTitle || null,
      day,
      user_text: input.userText.trim(),
      assistant_text: input.assistantText.trim(),
      source: input.source || "text",
      occurred_at: sqliteDate(at),
    });

  for (const memoryKey of detectKeepInMindKeys(input.userText)) {
    linkDailyMemory(day, memoryKey, "asked_to_keep_in_mind");
  }

  return rebuildDailySummary(day);
}

export function linkDailyMemory(
  dayOrMemoryKey: string,
  memoryKeyOrReason?: string,
  explicitReason = "asked_to_keep_in_mind"
): void {
  const firstIsDay = /^\d{4}-\d{2}-\d{2}$/.test(dayOrMemoryKey);
  const day = firstIsDay ? dayOrMemoryKey : localDay();
  const key = firstIsDay ? memoryKeyOrReason : dayOrMemoryKey;
  const reason = firstIsDay ? explicitReason : memoryKeyOrReason || explicitReason;
  if (!key) return;
  ensureDb()
    .prepare(
      `INSERT INTO daily_memory_refs (day, memory_key, reason)
       VALUES (?, ?, ?)
       ON CONFLICT(day, memory_key) DO UPDATE SET reason = excluded.reason`
    )
    .run(day, key, reason);
}

export function getDailySummary(day = localDay()): DailySummary | null {
  const row = ensureDb()
    .prepare(
      `SELECT day, summary, exchange_count, updated_at
       FROM daily_conversation_summaries
       WHERE day = ?`
    )
    .get(day) as DailySummary | undefined;
  return row || null;
}

export function listDailyExchanges(day = localDay(), limit = 50) {
  return ensureDb()
    .prepare(
      `SELECT id, conversation_id, conversation_title, day, user_text, assistant_text, source, occurred_at
       FROM conversation_exchanges
       WHERE day = ?
       ORDER BY occurred_at DESC
       LIMIT ?`
    )
    .all(day, limit);
}

export function getDailyPersonalContextBlock(date = new Date()): string {
  const day = localDay(date);
  const summary = getDailySummary(day);
  const exchanges = listDailyExchanges(day, MAX_CONTEXT_EXCHANGES) as Array<{
    user_text: string;
    assistant_text: string;
  }>;
  const memoryRefs = getDailyMemoryValues(day);

  const parts: string[] = [];
  if (summary?.summary) {
    parts.push(`Today's running summary for personalization: ${summary.summary}`);
  }
  if (memoryRefs.length) {
    parts.push(
      `Things the user asked Gwen to keep in mind today: ${memoryRefs
        .map((m) => m.value)
        .join("; ")}.`
    );
  }
  if (!summary && exchanges.length) {
    parts.push(
      `Recent conversation today: ${exchanges
        .slice()
        .reverse()
        .map((e) => sentenceFromExchange(e))
        .filter(Boolean)
        .join(" ")}`
    );
  }
  if (!parts.length) return "";
  return `\n\nDaily context from Gwen's SQLite journal. Use this quietly to be specific to the user; do not mention the database unless asked.\n${parts.join("\n")}`;
}

export function __resetConversationJournalForTests(): void {
  if (db) {
    db.close();
    db = null;
  }
}
