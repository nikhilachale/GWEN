// src/tools/search.js — web search tool
import { search, fetchPage } from "../skills/search.js";

export async function run({ query, count = 5 } = {}) {
  if (!query || !query.trim()) return "What should I search for?";
  const results = await search(query, count);
  if (results.length === 0) {
    return "I couldn't find anything useful for that.";
  }
  return results;
}

export { search, fetchPage };
