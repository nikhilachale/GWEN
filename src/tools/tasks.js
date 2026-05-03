// src/tools/tasks.js — task CRUD
import {
  readJSON,
  writeJSON,
  appendToArray,
  updateArrayItem,
  deleteArrayItem,
} from "../skills/storage.js";
import { parseDate, isToday, isFuture } from "../skills/dateParse.js";

const FILE = "tasks.json";

export async function add({ text, due } = {}) {
  if (!text || !text.trim()) return "What should I remind you about?";
  const dueIso = due ? parseDate(due) : null;
  const task = appendToArray(FILE, {
    text: text.trim(),
    due: dueIso,
    done: false,
    created: new Date().toISOString(),
  });
  if (due && !dueIso) {
    return `Got it — saved "${task.text}", but I couldn't parse the due time.`;
  }
  return dueIso
    ? `Got it. Added "${task.text}" for ${due}.`
    : `Got it. Added "${task.text}".`;
}

export async function list({ filter = "open" } = {}) {
  const all = readJSON(FILE, []);
  let result;
  switch (filter) {
    case "all":     result = all; break;
    case "today":   result = all.filter((t) => !t.done && t.due && isToday(t.due)); break;
    case "overdue": result = all.filter((t) => !t.done && t.due && !isFuture(t.due)); break;
    case "open":
    default:        result = all.filter((t) => !t.done); break;
  }
  if (result.length === 0) {
    return filter === "overdue" ? "Nothing overdue." : "No tasks on the list.";
  }
  return result.map((t) => ({
    id: t.id,
    text: t.text,
    due: t.due,
    done: t.done,
  }));
}

export function getAll() {
  return readJSON(FILE, []);
}

export function getOverdue() {
  return getAll().filter((t) => !t.done && t.due && !isFuture(t.due));
}

export function getDueToday() {
  return getAll().filter((t) => !t.done && t.due && isToday(t.due));
}

export function complete(id) {
  return updateArrayItem(FILE, id, { done: true });
}

export function remove(id) {
  return deleteArrayItem(FILE, id);
}
