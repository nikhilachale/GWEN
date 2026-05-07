// scripts/clean-memory.ts — audit + dedup + decay Gwen's memory store.
//
// Usage:
//   npm run clean:memory                 # dry-run, prints report only
//   npm run clean:memory -- --apply      # actually delete duplicates + stale rows
//   npm run clean:memory -- --threshold 0.9 --decay-days 60 --apply
//
// Safe to re-run. Never deletes manually-written rows (anything outside the
// 'auto' category). Default similarity threshold 0.85 — lower = more
// aggressive merging.
import {
  dedupCategory,
  decayStaleAuto,
  ensureEmbeddings,
  memoryAudit,
} from "../src/skills/memoryHygiene.js";

function parseArgs(argv: string[]): {
  apply: boolean;
  threshold: number;
  decayDays: number;
} {
  const args = { apply: false, threshold: 0.85, decayDays: 30 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--threshold") args.threshold = parseFloat(argv[++i]);
    else if (a === "--decay-days") args.decayDays = parseInt(argv[++i], 10);
  }
  return args;
}

async function main() {
  const { apply, threshold, decayDays } = parseArgs(process.argv.slice(2));

  console.log("\n=== Memory audit ===");
  const audit = memoryAudit();
  console.log(`Total rows: ${audit.total}`);
  for (const c of audit.byCategory) console.log(`  ${c.category.padEnd(20)} ${c.n}`);

  console.log("\n=== Embedding backfill ===");
  const { embedded, failed } = await ensureEmbeddings();
  console.log(`Embedded: ${embedded} | Failed: ${failed}`);

  console.log(`\n=== Dedup (threshold=${threshold}, ${apply ? "APPLY" : "dry-run"}) ===`);
  const dedup = await dedupCategory({ threshold, apply });
  console.log(
    `Auto rows: ${dedup.totalRows} (embedded: ${dedup.embeddedRows}) | clusters with dupes: ${dedup.clusters.length} | rows to delete: ${dedup.toDelete}`
  );
  for (const c of dedup.clusters) {
    console.log(`\n  KEEP   ${c.representative.key}`);
    console.log(`         "${c.representative.value.slice(0, 100)}${c.representative.value.length > 100 ? "..." : ""}"`);
    for (const d of c.duplicates) {
      console.log(`  DROP   ${d.key} (sim ${d.score.toFixed(3)})`);
      console.log(`         "${d.value.slice(0, 100)}${d.value.length > 100 ? "..." : ""}"`);
    }
  }

  console.log(`\n=== Decay (older than ${decayDays} days, ${apply ? "APPLY" : "dry-run"}) ===`);
  const decay = decayStaleAuto({ olderThanDays: decayDays, apply });
  console.log(`Auto rows: ${decay.totalAutoRows} | rows to drop: ${decay.toDrop.length}`);
  for (const d of decay.toDrop) {
    console.log(`  DROP   ${d.key} (age ${d.ageDays.toFixed(1)}d)`);
  }

  console.log(
    `\n${apply ? "Applied." : "Dry-run only. Re-run with --apply to actually mutate the DB."}`
  );
}

main().catch((err) => {
  console.error("[clean-memory] failed:", err);
  process.exit(1);
});
