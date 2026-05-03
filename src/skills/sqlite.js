// src/skills/sqlite.js — SQLite key-value store for memory
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../data/.mj-memory.db");

let db = null;

function ensureDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      category   TEXT DEFAULT 'general',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category);
  `);
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
