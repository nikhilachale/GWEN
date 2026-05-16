// src/tools/memory.js — long-term memory via SQLite
import { get, set, del, listAll, listByCategory, search as searchMem } from "../skills/sqlite.js";
import { embedAndSave } from "../skills/semanticMemory.js";

export async function remember({ key, value, category = "general" } = {}) {
  if (!key) return "I need a key to remember by.";
  if (value == null) return "I need a value to store.";
  set(key, String(value), category);
  embedAndSave(key, String(value)).catch(() => {});
  return `Got it. I'll remember ${key.replace(/_/g, " ")}.`;
}

export async function recall({ key } = {}) {
  if (!key) return "Which memory should I recall?";
  const value = get(key);
  if (value == null) {
    return `I don't have anything stored for ${key.replace(/_/g, " ")}.`;
  }
  return value;
}

export async function listMemories() {
  return listAll();
}

export async function forgetKey(key) {
  return del(key);
}

export { listByCategory, searchMem as searchMemories };
