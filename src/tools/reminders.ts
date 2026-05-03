// src/tools/reminders.js — macOS Reminders.app integration via AppleScript.
// Uses chrono-node to parse natural-language due dates.
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as chrono from "chrono-node";

const execP = promisify(exec);

/**
 * Add a reminder to Reminders.app.
 * @param {{ text: string, due?: string, list?: string }} args
 */
export async function add({ text, due, list } = {}) {
  if (!text) return "Tell me what to remind you about.";
  const targetList = list || "Reminders";
  let dueClause = "";
  let spokenDue = "";
  if (due) {
    const parsed = chrono.parseDate(due, new Date(), { forwardDate: true });
    if (parsed) {
      dueClause = `, remind me date:date "${formatAppleDate(parsed)}"`;
      spokenDue = ` for ${parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    }
  }
  try {
    await runAppleScript(`tell application "Reminders"
      tell list "${escape(targetList)}"
        make new reminder with properties {name:"${escape(text)}"${dueClause}}
      end tell
    end tell`);
    return `Reminder added${spokenDue}.`;
  } catch (err) {
    return `Couldn't add reminder: ${err.message}`;
  }
}

/**
 * List reminders in a list.
 * @param {{ list?: string, includeCompleted?: boolean, limit?: number }} args
 */
export async function list({ list: listName, includeCompleted = false, limit = 10 } = {}) {
  const targetList = listName || "Reminders";
  const filter = includeCompleted ? "every reminder" : "(every reminder whose completed is false)";
  try {
    const out = await runAppleScript(`tell application "Reminders"
      tell list "${escape(targetList)}"
        set names to name of ${filter}
        return names as string
      end tell
    end tell`);
    if (!out.trim()) return "No reminders.";
    const items = out.split(", ").slice(0, limit);
    return items;
  } catch (err) {
    return `Couldn't read reminders: ${err.message}`;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

function formatAppleDate(d) {
  const m = d.getMonth() + 1, day = d.getDate(), y = d.getFullYear();
  let h = d.getHours(), min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${m}/${day}/${y} ${h}:${min} ${ampm}`;
}

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e ${shellEscape(script)}`, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}
function shellEscape(s) { return `'${String(s).replace(/'/g, "'\\''")}'`; }
function escape(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
