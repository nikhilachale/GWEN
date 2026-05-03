// src/tools/timers.js — in-process timers and alarms with macOS notifications.
// Timers do NOT survive an Gwen restart. For persistent recurring alarms, use a
// Shortcut + run_shortcut, or a Calendar event.
import { exec } from "node:child_process";
import * as chrono from "chrono-node";

const timers = new Map();
let nextId = 1;

/**
 * Set a countdown timer in minutes (or seconds).
 * @param {{ minutes?: number, seconds?: number, label?: string }} args
 */
export async function setTimer({ minutes, seconds, label = "Timer" } = {}) {
  const totalMs = (minutes ? minutes * 60_000 : 0) + (seconds ? seconds * 1000 : 0);
  if (!totalMs || totalMs < 1000) return "Tell me how long.";
  const id = nextId++;
  const fireAt = Date.now() + totalMs;
  const handle = setTimeout(() => {
    notify(label, "Time's up.");
    timers.delete(id);
  }, totalMs);
  timers.set(id, { id, label, fireAt, handle });
  return `${label} set for ${formatDuration(totalMs)}.`;
}

/**
 * Set an alarm at an absolute time ("8am tomorrow", "in 90 minutes", "5/4 14:30").
 * @param {{ time: string, label?: string }} args
 */
export async function setAlarm({ time, label = "Alarm" } = {}) {
  if (!time) return "Tell me when.";
  const parsed = chrono.parseDate(time, new Date(), { forwardDate: true });
  if (!parsed) return `Couldn't parse "${time}".`;
  const ms = parsed.getTime() - Date.now();
  if (ms < 1000) return "That time is in the past.";
  const id = nextId++;
  const handle = setTimeout(() => {
    notify(label, `It's ${parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`);
    timers.delete(id);
  }, ms);
  timers.set(id, { id, label, fireAt: parsed.getTime(), handle });
  const when = parsed.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  return `${label} set for ${when}.`;
}

/**
 * List active timers and alarms.
 */
export async function listTimers() {
  if (!timers.size) return "No active timers.";
  return [...timers.values()].map((t) => {
    const remaining = Math.max(0, t.fireAt - Date.now());
    return `[${t.id}] ${t.label} — ${formatDuration(remaining)} left`;
  });
}

/**
 * Cancel a timer by id. Omit id to cancel all.
 * @param {{ id?: number }} args
 */
export async function cancelTimer({ id } = {}) {
  if (id === undefined) {
    const n = timers.size;
    for (const t of timers.values()) clearTimeout(t.handle);
    timers.clear();
    return n ? `Cancelled ${n} timer${n === 1 ? "" : "s"}.` : "No timers to cancel.";
  }
  const t = timers.get(id);
  if (!t) return `No timer with id ${id}.`;
  clearTimeout(t.handle);
  timers.delete(id);
  return `Cancelled ${t.label}.`;
}

// ─── helpers ─────────────────────────────────────────────────────────

function notify(title, body) {
  const script = `display notification "${escape(body)}" with title "${escape(title)}" sound name "Glass"`;
  exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m${sec ? ` ${sec}s` : ""}`;
  return `${sec}s`;
}

function escape(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
