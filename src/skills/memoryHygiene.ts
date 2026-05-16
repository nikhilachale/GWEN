// src/skills/memoryHygiene.ts — keep the memory table from drowning in noise.
// Two operations:
//   - dedupCategory: cluster near-duplicate rows by cosine similarity, keep the
//     best representative, delete the rest.
//   - decayStaleAuto: drop auto-extracted facts older than N days. Manual
//     ('general', 'identity', etc.) categories are never decayed.
//
// Both default to dryRun. Pass apply: true to actually mutate the DB.
import {
  countByCategory,
  del,
  getFullRowsByCategory,
  getRowsMissingEmbeddings,
  setEmbedding,
} from "./sqlite.js";
import { embed, cosine } from "./embeddings.js";

const AUTO_CATEGORY = "auto";
const DEFAULT_DUP_THRESHOLD = 0.85;
const DEFAULT_DECAY_DAYS = 30;

export type Cluster = {
  representative: { key: string; value: string; updated_at: string };
  duplicates: Array<{ key: string; value: string; updated_at: string; score: number }>;
};

export type DedupReport = {
  category: string;
  totalRows: number;
  embeddedRows: number;
  clusters: Cluster[];
  toDelete: number;
  applied: boolean;
};

export type DecayReport = {
  olderThanDays: number;
  totalAutoRows: number;
  toDrop: Array<{ key: string; value: string; updated_at: string; ageDays: number }>;
  applied: boolean;
};

/**
 * Embed any rows missing an embedding. Required before dedup since we cluster
 * by cosine similarity. Returns counts.
 */
export async function ensureEmbeddings(): Promise<{ embedded: number; failed: number }> {
  const rows = getRowsMissingEmbeddings();
  let embedded = 0;
  let failed = 0;
  for (const row of rows) {
    const vec = await embed(row.value);
    if (!vec) {
      failed++;
      continue;
    }
    setEmbedding(row.key, vec);
    embedded++;
  }
  return { embedded, failed };
}

/**
 * Pick the best representative from a duplicate cluster. Heuristic:
 *   - Most recent wins on a tie.
 *   - Otherwise the longest value wins (more context, more useful).
 * Manually written keys (no `auto_` prefix) beat auto-extracted ones.
 */
function pickRepresentative<T extends { key: string; value: string; updated_at: string }>(
  rows: T[]
): T {
  return rows.slice().sort((a, b) => {
    const aManual = !a.key.startsWith("auto_");
    const bManual = !b.key.startsWith("auto_");
    if (aManual !== bManual) return aManual ? -1 : 1;
    if (a.value.length !== b.value.length) return b.value.length - a.value.length;
    return b.updated_at.localeCompare(a.updated_at);
  })[0];
}

/**
 * Greedy clustering: walk rows newest-first; each row joins the first existing
 * cluster whose representative scores ≥ threshold; otherwise it starts a new
 * one. Good enough at this scale (hundreds of rows, not thousands).
 */
export async function dedupCategory({
  category = AUTO_CATEGORY,
  threshold = DEFAULT_DUP_THRESHOLD,
  apply = false,
}: { category?: string; threshold?: number; apply?: boolean } = {}): Promise<DedupReport> {
  const rows = getFullRowsByCategory(category);
  const embeddedRows = rows.filter((r) => r.embedding);
  if (embeddedRows.length < 2) {
    return {
      category,
      totalRows: rows.length,
      embeddedRows: embeddedRows.length,
      clusters: [],
      toDelete: 0,
      applied: false,
    };
  }

  type Bucket = {
    rep: typeof embeddedRows[number];
    members: Array<{ row: typeof embeddedRows[number]; score: number }>;
  };
  const buckets: Bucket[] = [];

  for (const row of embeddedRows) {
    let placed = false;
    for (const b of buckets) {
      const score = cosine(b.rep.embedding!, row.embedding!);
      if (score >= threshold) {
        b.members.push({ row, score });
        placed = true;
        break;
      }
    }
    if (!placed) buckets.push({ rep: row, members: [{ row, score: 1 }] });
  }

  const clusters: Cluster[] = [];
  let toDelete = 0;

  for (const b of buckets) {
    if (b.members.length < 2) continue;
    const memberRows = b.members.map((m) => m.row);
    const representative = pickRepresentative(memberRows);
    const dupes = b.members
      .filter((m) => m.row.key !== representative.key)
      .map((m) => ({
        key: m.row.key,
        value: m.row.value,
        updated_at: m.row.updated_at,
        score: m.score,
      }));
    clusters.push({
      representative: {
        key: representative.key,
        value: representative.value,
        updated_at: representative.updated_at,
      },
      duplicates: dupes,
    });
    toDelete += dupes.length;
  }

  if (apply) {
    for (const c of clusters) {
      for (const d of c.duplicates) del(d.key);
    }
  }

  return {
    category,
    totalRows: rows.length,
    embeddedRows: embeddedRows.length,
    clusters,
    toDelete,
    applied: apply,
  };
}

/**
 * Drop auto-category rows whose updated_at is older than `olderThanDays`.
 * Never touches manually written categories — those are user-curated.
 */
export function decayStaleAuto({
  olderThanDays = DEFAULT_DECAY_DAYS,
  apply = false,
}: { olderThanDays?: number; apply?: boolean } = {}): DecayReport {
  const rows = getFullRowsByCategory(AUTO_CATEGORY);
  const cutoffMs = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const toDrop = rows
    .map((r) => {
      const t = Date.parse(r.updated_at + "Z"); // SQLite stores UTC
      const ageDays = (Date.now() - t) / (24 * 60 * 60 * 1000);
      return { key: r.key, value: r.value, updated_at: r.updated_at, ageDays };
    })
    .filter((r) => Date.parse(r.updated_at + "Z") < cutoffMs);

  if (apply) {
    for (const r of toDrop) del(r.key);
  }
  return {
    olderThanDays,
    totalAutoRows: rows.length,
    toDrop,
    applied: apply,
  };
}

export function memoryAudit(): {
  byCategory: Array<{ category: string; n: number }>;
  total: number;
} {
  const byCategory = countByCategory();
  const total = byCategory.reduce((acc, x) => acc + x.n, 0);
  return { byCategory, total };
}
