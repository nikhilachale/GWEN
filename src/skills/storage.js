// src/skills/storage.js — atomic JSON storage
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(DATA_DIR, filePath);
}

export function readJSON(filePath, defaultValue = []) {
  const fp = resolvePath(filePath);
  if (!fs.existsSync(fp)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch (err) {
    console.error(`[storage] corrupt JSON at ${fp}`, err);
    throw err;
  }
}

export function writeJSON(filePath, data) {
  const fp = resolvePath(filePath);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, fp);
}

export function appendToArray(filePath, item) {
  const arr = readJSON(filePath, []);
  if (!item.id) item.id = crypto.randomUUID();
  arr.push(item);
  writeJSON(filePath, arr);
  return item;
}

export function updateArrayItem(filePath, id, updates) {
  const arr = readJSON(filePath, []);
  const idx = arr.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  arr[idx] = { ...arr[idx], ...updates };
  writeJSON(filePath, arr);
  return arr[idx];
}

export function deleteArrayItem(filePath, id) {
  const arr = readJSON(filePath, []);
  const next = arr.filter((x) => x.id !== id);
  if (next.length === arr.length) return false;
  writeJSON(filePath, next);
  return true;
}
