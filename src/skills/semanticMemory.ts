// src/skills/semanticMemory.ts — fetch the top-K memories most relevant to the
// current user input and format them for system-prompt injection. Layer 1 of
// the SMART_MEMORY plan: makes Gwen recall things by meaning, not by exact key.
//
// Scoring v2 (non-destructive noise control):
//   final_score = cosine + recency_bonus + manual_bonus
//   then MMR re-ranking so picks are mutually distinct.
//
// This means duplicate clusters in the DB (e.g. 5 rows about "fullscreen") no
// longer all win top-K slots — the first wins, the rest are penalized for
// being too similar to it. No deletions; just smarter selection.
import { embed, cosine } from "./embeddings.js";
import { setEmbedding, getRowsWithEmbeddings, get as getMem } from "./sqlite.js";

const TOP_K = 5;
const MIN_SCORE = 0.25;

// Recency: bonus decays by half every RECENCY_HALF_LIFE_DAYS. Caps at
// MAX_RECENCY_BONUS so it nudges, never dominates, the cosine signal.
const RECENCY_HALF_LIFE_DAYS = 14;
const MAX_RECENCY_BONUS = 0.08;

// Manual rows (anything not in 'auto') are user-curated and get a small bump.
const MANUAL_BOOST = 0.05;

// MMR diversity: lambda=1 → pure relevance (old behavior). lambda=0 → pure
// diversity (incoherent). 0.7 balances: ~70% relevance, ~30% punish-for-overlap.
const MMR_LAMBDA = 0.7;

type ScoredRow = {
  key: string;
  value: string;
  category: string;
  embedding: Float32Array;
  baseScore: number; // cosine + recency + manual bump
};

function ageDays(updated_at: string): number {
  // SQLite stores UTC without a 'Z'; help Date.parse along.
  const ts = Date.parse(updated_at + "Z");
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, (Date.now() - ts) / (24 * 60 * 60 * 1000));
}

function recencyBonus(updated_at: string): number {
  const age = ageDays(updated_at);
  return MAX_RECENCY_BONUS * Math.pow(0.5, age / RECENCY_HALF_LIFE_DAYS);
}

function manualBonus(category: string, key: string): number {
  if (category === "auto") return 0;
  if (key.startsWith("auto_")) return 0;
  return MANUAL_BOOST;
}

/**
 * Embed text and persist to the memory row keyed by `key`. Fire-and-forget at
 * the call sites — never block the speech pipeline on this.
 */
export async function embedAndSave(key: string, text: string): Promise<void> {
  if (!key || !text) return;
  if (getMem(key) == null) return;
  const vec = await embed(text);
  if (!vec) return;
  try {
    setEmbedding(key, vec);
  } catch (err: any) {
    console.warn("[semantic-memory] setEmbedding failed:", err?.message || err);
  }
}

/**
 * Return the top-K memories most relevant to `query` after MMR diversification.
 * Memories scoring below MIN_SCORE on the base score are filtered out before
 * MMR runs.
 */
export async function recallRelevant(
  query: string,
  k: number = TOP_K
): Promise<Array<{ key: string; value: string; category: string; score: number }>> {
  if (!query || !query.trim()) return [];
  const queryVec = await embed(query);
  if (!queryVec) return [];

  const rows = getRowsWithEmbeddings();
  if (!rows.length) return [];

  // Step 1: base score for every candidate.
  const scored: ScoredRow[] = rows.map((r) => {
    const sim = cosine(queryVec, r.embedding);
    const base = sim + recencyBonus(r.updated_at) + manualBonus(r.category, r.key);
    return {
      key: r.key,
      value: r.value,
      category: r.category,
      embedding: r.embedding,
      baseScore: base,
    };
  });

  // Step 2: prune low-relevance rows up front (cheaper MMR loop).
  const pool = scored
    .filter((r) => r.baseScore >= MIN_SCORE)
    .sort((a, b) => b.baseScore - a.baseScore);

  if (pool.length === 0) return [];

  // Step 3: MMR — greedy pick, penalizing similarity to already-chosen rows.
  // For each candidate, mmr_score = λ·base − (1−λ)·max(sim_to_picked).
  // First pick has nothing to compare against → just takes the top of `pool`.
  const picked: ScoredRow[] = [];
  while (picked.length < k && pool.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      let maxSimToPicked = 0;
      for (const p of picked) {
        const s = cosine(cand.embedding, p.embedding);
        if (s > maxSimToPicked) maxSimToPicked = s;
      }
      const mmr = MMR_LAMBDA * cand.baseScore - (1 - MMR_LAMBDA) * maxSimToPicked;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }
    picked.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }

  return picked.map((p) => ({
    key: p.key,
    value: p.value,
    category: p.category,
    score: p.baseScore,
  }));
}

/**
 * Format relevant memories as a system-prompt block. Empty string when nothing
 * is relevant — that's fine, the brain just sees no extra block that turn.
 */
export async function formatRelevantBlock(query: string): Promise<string> {
  const hits = await recallRelevant(query);
  if (!hits.length) return "";
  const lines = hits.map((h) => `- ${h.value}`).join("\n");
  return `\n\nRelevant things you remember about the user (use naturally if they apply, ignore if not):\n${lines}`;
}
