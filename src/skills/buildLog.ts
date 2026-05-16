// src/skills/buildLog.ts — append entries to GWEN-SELF-BUILDS.md.
// Used by fix_self_code and repair_self so every self-modification is logged.
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "./projectRoot.js";

const LOG_PATH = path.join(PROJECT_ROOT, "GWEN-SELF-BUILDS.md");

export async function appendSelfBuild({ tool, action, result, notes } = {}) {
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lines = [
    `## ${ts} — ${tool}`,
    `**Action:** ${action || "(unspecified)"}`,
    `**Result:** ${result || "ok"}`,
  ];
  if (notes) lines.push(`**Notes:** ${notes}`);
  lines.push("", "");
  try {
    await appendFile(LOG_PATH, lines.join("\n"));
  } catch (err) {
    console.warn("[buildLog] append failed:", err.message);
  }
}

// Returns the most recent self-build entry, or null if the log is missing/empty.
// Shape: { ts, tsMs, tool, action, result, notes }. tsMs is epoch ms parsed
// from the stored "YYYY-MM-DD HH:MM" UTC stamp, so callers can check freshness.
export async function getLatestSelfBuild() {
  let raw;
  try {
    raw = await readFile(LOG_PATH, "utf8");
  } catch {
    return null; // file doesn't exist yet
  }

  const blocks = raw.split(/^## /m).filter((b) => b.trim());
  if (!blocks.length) return null;
  const last = blocks[blocks.length - 1];

  const headerMatch = last.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+—\s+(\S+)/);
  if (!headerMatch) return null;
  const [, ts, tool] = headerMatch;
  const action = last.match(/\*\*Action:\*\*\s*(.+)/)?.[1]?.trim() || null;
  const result = last.match(/\*\*Result:\*\*\s*(.+)/)?.[1]?.trim() || null;
  const notes  = last.match(/\*\*Notes:\*\*\s*(.+)/)?.[1]?.trim() || null;

  const tsMs = Date.parse(`${ts.replace(" ", "T")}:00Z`);

  return { ts, tsMs: Number.isNaN(tsMs) ? null : tsMs, tool, action, result, notes };
}
