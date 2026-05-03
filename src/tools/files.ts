// src/tools/files.js — list and reveal files/folders on the user's Mac.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

const SHORTCUTS = {
  desktop: "~/Desktop",
  downloads: "~/Downloads",
  documents: "~/Documents",
  pictures: "~/Pictures",
  movies: "~/Movies",
  music: "~/Music",
  home: "~",
  "~": "~",
};

function resolvePath(input) {
  if (!input) return path.join(os.homedir(), "Desktop");
  const key = input.trim().toLowerCase();
  const expanded = SHORTCUTS[key] || input;
  if (expanded.startsWith("~")) {
    return path.join(os.homedir(), expanded.slice(1).replace(/^\/+/, ""));
  }
  return path.resolve(expanded);
}

/**
 * List files and folders at a path.
 * @param {{ path?: string, foldersOnly?: boolean, limit?: number }} input
 */
export async function listFiles({ path: target, foldersOnly = false, limit = 50 } = {}) {
  const dir = resolvePath(target);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const filtered = entries
      .filter((e) => !e.name.startsWith("."))
      .filter((e) => (foldersOnly ? e.isDirectory() : true))
      .slice(0, limit);

    if (filtered.length === 0) {
      return `${dir} is empty${foldersOnly ? " (no folders)" : ""}.`;
    }

    const folders = filtered.filter((e) => e.isDirectory()).map((e) => e.name);
    const files = filtered.filter((e) => !e.isDirectory()).map((e) => e.name);

    return {
      path: dir,
      folders,
      files: foldersOnly ? [] : files,
      total: entries.length,
      shown: filtered.length,
    };
  } catch (err) {
    if (err.code === "ENOENT") return `No such folder: ${dir}.`;
    if (err.code === "EACCES") return `Permission denied for ${dir}.`;
    return `Couldn't read ${dir}: ${err.message}`;
  }
}

/**
 * Reveal a file or folder in Finder (or open a file with its default app).
 * @param {{ path: string, reveal?: boolean }} input
 */
export async function openPath({ path: target, reveal = false } = {}) {
  if (!target) return "Tell me which path to open.";
  const resolved = resolvePath(target);
  try {
    const flag = reveal ? "-R" : "";
    await execP(`open ${flag} ${shellEscape(resolved)}`);
    return `Opened ${resolved}${reveal ? " (revealed in Finder)" : ""}.`;
  } catch (err) {
    return `Couldn't open ${resolved}: ${err.message}`;
  }
}

function shellEscape(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}
