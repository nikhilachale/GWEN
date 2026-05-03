// src/tools/shortcuts.js — bridge to the macOS Shortcuts app.
// Lets MJ trigger any user-defined Shortcut, which unlocks HomeKit,
// Focus modes, custom automations, etc. without writing more JS.
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

/**
 * Run a Shortcut by name, optionally passing text input.
 * @param {{ name: string, input?: string }} args
 */
export async function runShortcut({ name, input } = {}) {
  if (!name) return "Tell me which shortcut to run.";
  try {
    const cmd = input
      ? `printf %s ${shellEscape(input)} | shortcuts run ${shellEscape(name)}`
      : `shortcuts run ${shellEscape(name)}`;
    const { stdout } = await execP(cmd);
    const out = stdout.trim();
    return out ? `Ran "${name}": ${out}` : `Ran "${name}".`;
  } catch (err) {
    if (/not found/i.test(err.message)) {
      return `No shortcut named "${name}". Use list_shortcuts to see what's available.`;
    }
    return `Shortcut "${name}" failed: ${err.message}`;
  }
}

/**
 * List all installed Shortcuts. Optionally filter by substring.
 * @param {{ query?: string }} args
 */
export async function listShortcuts({ query } = {}) {
  try {
    const { stdout } = await execP(`shortcuts list`);
    let lines = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    if (query) {
      const q = query.toLowerCase();
      lines = lines.filter((l) => l.toLowerCase().includes(q));
    }
    if (!lines.length) return query ? `No shortcuts matching "${query}".` : "No shortcuts installed.";
    return lines;
  } catch (err) {
    return `Couldn't list shortcuts: ${err.message}`;
  }
}

function shellEscape(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}
