// src/tools/appleNotes.js — macOS Notes.app (iCloud-synced) via AppleScript.
// Distinct from src/tools/notes.js which manages local markdown files.
import { exec } from "node:child_process";

/**
 * Create a new Apple Note.
 * @param {{ title: string, body?: string, folder?: string }} args
 */
export async function create({ title, body = "", folder } = {}) {
  if (!title) return "Tell me a note title.";
  const folderClause = folder
    ? `tell folder "${escape(folder)}"`
    : `tell default account`;
  const folderEnd = folder ? "end tell" : "end tell";
  try {
    await runAppleScript(`tell application "Notes"
      ${folderClause}
        make new note with properties {name:"${escape(title)}", body:"${escape(htmlBody(title, body))}"}
      ${folderEnd}
    end tell`);
    return `Note "${title}" created.`;
  } catch (err) {
    return `Couldn't create note: ${err.message}`;
  }
}

/**
 * Search Apple Notes by title or body substring.
 * @param {{ query: string, limit?: number }} args
 */
export async function search({ query, limit = 5 } = {}) {
  if (!query) return "Tell me what to search for.";
  try {
    const out = await runAppleScript(`tell application "Notes"
      set hits to (every note whose name contains "${escape(query)}" or body contains "${escape(query)}")
      set titles to {}
      repeat with n in hits
        set end of titles to (name of n)
      end repeat
      return titles as string
    end tell`);
    if (!out.trim()) return `No notes matching "${query}".`;
    return out.split(", ").slice(0, limit);
  } catch (err) {
    return `Couldn't search notes: ${err.message}`;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

function htmlBody(title, body) {
  return `<h1>${escape(title)}</h1><p>${escape(body).replace(/\n/g, "<br>")}</p>`;
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
