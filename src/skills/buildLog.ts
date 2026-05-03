// src/skills/buildLog.ts — append entries to GWEN-SELF-BUILDS.md.
// Used by fix_self_code and repair_self so every self-modification is logged.
import { appendFile } from "node:fs/promises";
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
