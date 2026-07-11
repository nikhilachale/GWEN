// src/tools/files.js — list and reveal files/folders on the user's Mac.
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { classifyPath, pathDeniedMessage, resolveUserPath } from "../skills/pathPolicy.js";
import { redactSensitiveText } from "../skills/redaction.js";

const execP = promisify(exec);

/**
 * List files and folders at a path.
 * @param {{ path?: string, foldersOnly?: boolean, limit?: number }} input
 */
export async function listFiles({ path: target, foldersOnly = false, limit = 50 } = {}) {
  const dir = resolveUserPath(target);
  const policy = classifyPath(dir);
  if (!policy.allowed) return pathDeniedMessage(policy, "listing");

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const filtered = entries
      .filter((e) => !e.name.startsWith("."))
      .filter((e) => classifyPath(`${dir}/${e.name}`).allowed)
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
 * Read the text contents of a file (txt, tsx, md, json, source code, etc.).
 * @param {{ path: string, maxChars?: number }} input
 */
export async function readFile({ path: target, maxChars = 20000 } = {}) {
  if (!target) return "Tell me which file to read.";
  const filePath = resolveUserPath(target);
  const policy = classifyPath(filePath);
  if (!policy.allowed) return pathDeniedMessage(policy, "reading");

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return `${filePath} is a folder, not a file.`;
    const charLimit = Math.max(0, Math.floor(Number(maxChars) || 0));
    const bytesToRead = Math.min(stat.size, Math.max(charLimit * 4, charLimit));
    const handle = await fs.open(filePath, fsConstants.O_RDONLY);
    let text = "";
    let bytesRead = 0;
    try {
      const buffer = Buffer.alloc(bytesToRead);
      const result = await handle.read(buffer, 0, bytesToRead, 0);
      bytesRead = result.bytesRead;
      text = buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
    const trimmed = text.length > charLimit ? text.slice(0, charLimit) : text;
    const redacted = redactSensitiveText(trimmed);
    return {
      path: filePath,
      bytes: stat.size,
      text: redacted.text,
      truncated: stat.size > bytesRead || text.length > charLimit,
      redacted: redacted.redacted,
      redactions: redacted.count,
    };
  } catch (err) {
    if (err.code === "ENOENT") return `No file at ${filePath}.`;
    if (err.code === "EACCES") return `Permission denied for ${filePath}.`;
    if (err.code === "ERR_INVALID_ARG_VALUE" || err.message?.includes("invalid")) {
      return `${filePath} doesn't look like a text file.`;
    }
    return `Couldn't read ${filePath}: ${err.message}`;
  }
}

/**
 * Reveal a file or folder in Finder (or open a file with its default app).
 * @param {{ path: string, reveal?: boolean }} input
 */
export async function openPath({ path: target, reveal = false } = {}) {
  if (!target) return "Tell me which path to open.";
  const resolved = resolveUserPath(target);
  const policy = classifyPath(resolved);
  if (!policy.allowed) return pathDeniedMessage(policy, reveal ? "revealing" : "opening");

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
