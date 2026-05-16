// scripts/backfill-embeddings.ts — one-shot: embed every memory row that
// doesn't have an embedding yet. Safe to re-run; only touches NULL rows.
import { getRowsMissingEmbeddings, setEmbedding } from "../src/skills/sqlite.js";
import { embed } from "../src/skills/embeddings.js";

async function main() {
  const rows = getRowsMissingEmbeddings();
  if (!rows.length) {
    console.log("[backfill] no missing embeddings — nothing to do.");
    return;
  }
  console.log(`[backfill] embedding ${rows.length} memories...`);
  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const vec = await embed(row.value);
    if (!vec) {
      fail++;
      continue;
    }
    setEmbedding(row.key, vec);
    ok++;
    if (ok % 10 === 0) console.log(`[backfill] ${ok}/${rows.length}...`);
  }
  console.log(`[backfill] done. ok=${ok} fail=${fail}`);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
