// src/skills/search.js — Tavily web search + page fetch via Readability
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

/**
 * Run a web search.
 * @param {string} query
 * @param {number} [count=5]
 * @returns {Promise<Array>}
 */
export async function search(query, count = 5) {
  if (!query || !query.trim()) return [];

  if (process.env.TAVILY_KEY) {
    try {
      const results = await searchTavily(query, count);
      if (results.length > 0) return results;
    } catch (err) {
      console.warn("[search] Tavily failed:", err.message);
    }
  }

  if (process.env.BRAVE_KEY) {
    try {
      return await searchBrave(query, count);
    } catch (err) {
      console.warn("[search] Brave failed:", err.message);
    }
  }

  return [];
}

/**
 * Fetch a URL and extract clean article text via Readability.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 MJ-Assistant" },
    });
    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    return (article?.textContent || "").slice(0, 10000).trim();
  } catch (err) {
    console.error("[search] fetchPage failed:", err.message);
    return "";
  }
}

async function searchTavily(query, count) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_KEY,
      query,
      max_results: Math.min(count, 10),
      include_answer: "advanced",
      search_depth: "advanced",
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const data = await res.json();
  const results = (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: (r.content || "").slice(0, 300),
    published: r.published_date || null,
    score: r.score || 0,
  }));
  // Surface Tavily's synthesized answer first so the LLM doesn't have to
  // re-derive it from raw snippets — major quality + latency win on
  // current-events queries.
  if (data.answer) {
    return [{ title: "Tavily summary", url: null, snippet: data.answer, isAnswer: true }, ...results];
  }
  return results;
}

async function searchBrave(query, count) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(count, 10)}`;
  const res = await fetch(url, {
    headers: { "X-Subscription-Token": process.env.BRAVE_KEY, "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Brave ${res.status}`);
  const data = await res.json();
  const items = data?.web?.results || [];
  return items.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: (r.description || "").slice(0, 300),
    published: r.age || null,
    score: 0.5,
  }));
}
