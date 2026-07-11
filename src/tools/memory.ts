// src/tools/memory.js — long-term memory via SQLite
import { get, set, del, listAll, listByCategory, search as searchMem } from "../skills/sqlite.js";
import { embedAndSave } from "../skills/semanticMemory.js";
import { linkDailyMemory } from "../skills/conversationJournal.js";
import {
  archiveMemoryV2,
  deleteMemoryV2,
  getMemoryV2ByKey,
  listMemoriesV2,
  searchMemoriesV2,
  upsertMemoryV2,
  type MemoryV2Input,
  type MemoryV2ListOptions,
} from "../skills/memoryStore.js";

export async function remember({ key, value, category = "general" } = {}) {
  if (!key) return "I need a key to remember by.";
  if (value == null) return "I need a value to store.";
  set(key, String(value), category);
  try {
    upsertMemoryV2({
      key,
      type: category === "preferences" || category === "preference" ? "preference" : "fact",
      subject: "user",
      predicate: key,
      value: String(value),
      category,
      source: "manual",
      confidence: 1,
      metadata: { legacyCategory: category },
    });
  } catch (err: any) {
    console.warn("[memory] typed remember failed:", err?.message || err);
  }
  linkDailyMemory(key);
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

export async function rememberTyped(input: MemoryV2Input) {
  return upsertMemoryV2(input);
}

export async function recallTyped({ key }: { key?: string } = {}) {
  if (!key) return null;
  return getMemoryV2ByKey(key);
}

export async function listTypedMemories(options: MemoryV2ListOptions = {}) {
  return listMemoriesV2(options);
}

export async function searchTypedMemories({ query, limit = 20 }: { query?: string; limit?: number } = {}) {
  if (!query) return [];
  return searchMemoriesV2(query, limit);
}

export async function archiveTypedMemory(key: string) {
  return archiveMemoryV2(key);
}

export async function forgetTypedMemory(key: string) {
  return deleteMemoryV2(key);
}

export { listByCategory, searchMem as searchMemories };
