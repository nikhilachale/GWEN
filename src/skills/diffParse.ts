// src/skills/diffParse.ts — split a unified `git diff` blob into per-file
// chunks with line-add/remove counts. Used so the live activity feed can
// show one card per touched file instead of one giant blob.

export type FileDiff = {
  file: string;
  added: number;
  removed: number;
  hunks: string; // raw hunks for that file, ready to render
};

export function parseUnifiedDiff(diff: string): FileDiff[] {
  if (!diff || !diff.trim()) return [];
  const lines = diff.split("\n");
  const out: FileDiff[] = [];
  let cur: FileDiff | null = null;

  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
      // "diff --git a/path b/path" → take the b/ side.
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const file = match ? match[2] : line.slice("diff --git ".length);
      cur = { file, added: 0, removed: 0, hunks: "" };
      continue;
    }
    if (!cur) continue;
    cur.hunks += (cur.hunks ? "\n" : "") + line;
    if (line.startsWith("+") && !line.startsWith("+++")) cur.added++;
    else if (line.startsWith("-") && !line.startsWith("---")) cur.removed++;
  }
  flush();
  return out;
}
