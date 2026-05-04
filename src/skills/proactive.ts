// src/skills/proactive.ts — Gwen pings the user instead of only reacting.
// Three rule sources, all gated on idle so we never interrupt an active turn:
//   1. Morning brief — once per day at GWEN_MORNING_HOUR (default 8am)
//   2. Calendar nudge — N minutes before each upcoming event
//   3. Stale tasks — overdue >24h (off by default; opt in via env var)
//
// State persists to data/proactive-state.json so a relaunch doesn't double-fire.
import notifier from "node-notifier";
import { readJSON, writeJSON } from "./storage.js";
import { speak } from "./tts.js";
import * as ipc from "./ipc.js";
import * as calendarTool from "../tools/calendar.js";
import * as tasksTool from "../tools/tasks.js";

const STATE_FILE = "proactive-state.json";
const TICK_MS = 60_000;
const NUDGE_MIN_BEFORE = 5;
const STALE_TASK_HOURS = 24;
const FIRED_GC_MS = 24 * 60 * 60_000;

const ENABLED = process.env.GWEN_PROACTIVE_ENABLED !== "0";
const STALE_TASK_PINGS = process.env.GWEN_PROACTIVE_STALE_TASKS === "1";
const MORNING_HOUR = clampHour(Number(process.env.GWEN_MORNING_HOUR ?? "8"));

let intervalHandle = null;

export function startProactiveLoop() {
  if (!ENABLED) {
    console.log("[proactive] disabled (GWEN_PROACTIVE_ENABLED=0)");
    return;
  }
  if (intervalHandle) return;
  console.log(`[proactive] loop started — morning brief at ${MORNING_HOUR}:00`);
  setTimeout(() => tick().catch((err) => console.warn("[proactive] tick failed:", err.message)), 10_000);
  intervalHandle = setInterval(() => {
    tick().catch((err) => console.warn("[proactive] tick failed:", err.message));
  }, TICK_MS);
}

export function stopProactiveLoop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

async function tick() {
  if (!isIdle()) return;

  const state = loadState();
  const todayKey = new Date().toISOString().slice(0, 10);

  await tryMorningBrief(state, todayKey);
  if (!isIdle()) return saveState(state);

  await tryCalendarNudges(state);
  if (!isIdle()) return saveState(state);

  if (STALE_TASK_PINGS) await tryStaleTasks(state);

  saveState(state);
}

async function tryMorningBrief(state, todayKey) {
  if (state.briefDate === todayKey) return;
  if (new Date().getHours() < MORNING_HOUR) return;

  try {
    const dayPlan = await import("../tools/dayplan.js");
    const plan = await dayPlan.run({ tone: "briefing" });
    const line = composeBriefLine(plan);
    if (line) await fire(line);
    state.briefDate = todayKey;
  } catch (err) {
    console.warn("[proactive] morning brief failed:", err.message);
  }
}

async function tryCalendarNudges(state) {
  let events;
  try {
    events = await calendarTool.getCalendarEvents(1);
  } catch {
    return;
  }
  if (!Array.isArray(events)) return;

  state.eventIdsFired = state.eventIdsFired || {};
  const now = Date.now();
  const ahead = NUDGE_MIN_BEFORE * 60_000;

  for (const ev of events) {
    const startMs = new Date(ev.start).getTime();
    if (isNaN(startMs)) continue;

    const id = ev.id || `${ev.title}@${ev.start}`;
    if (state.eventIdsFired[id]) continue;

    const delta = startMs - now;
    if (delta > 0 && delta <= ahead) {
      const mins = Math.max(1, Math.round(delta / 60_000));
      const title = (ev.title || "your meeting").trim();
      await fire(`Heads up — ${title} in about ${mins} minute${mins === 1 ? "" : "s"}.`);
      state.eventIdsFired[id] = now;
      if (!isIdle()) return;
    }
  }

  // GC: drop fired records older than 24h so the file doesn't grow forever
  const cutoff = now - FIRED_GC_MS;
  for (const id of Object.keys(state.eventIdsFired)) {
    if (state.eventIdsFired[id] < cutoff) delete state.eventIdsFired[id];
  }
}

async function tryStaleTasks(state) {
  let overdue;
  try {
    overdue = tasksTool.getOverdue();
  } catch {
    return;
  }
  if (!Array.isArray(overdue) || overdue.length === 0) return;

  state.taskIdsFired = state.taskIdsFired || {};
  const cutoff = Date.now() - STALE_TASK_HOURS * 60 * 60_000;

  for (const t of overdue) {
    if (state.taskIdsFired[t.id]) continue;
    const dueMs = new Date(t.due).getTime();
    if (isNaN(dueMs) || dueMs > cutoff) continue;

    await fire(`That task — ${t.text} — has been sitting overdue for a while.`);
    state.taskIdsFired[t.id] = Date.now();
    if (!isIdle()) return;
  }
}

function composeBriefLine(plan) {
  const meetings = plan?.meetings || [];
  const todayTasks = plan?.topTasks || [];
  const overdue = plan?.overdueTasks || [];

  if (meetings.length === 0 && todayTasks.length === 0 && overdue.length === 0) {
    return "Morning. Calendar's clear and nothing pending — your day is yours.";
  }

  const parts = ["Morning."];
  if (meetings.length > 0) {
    parts.push(`You have ${spell(meetings.length)} meeting${meetings.length === 1 ? "" : "s"} today.`);
    if (meetings[0]?.title) parts.push(`First up: ${meetings[0].title}.`);
  }
  if (todayTasks.length > 0) {
    parts.push(`${cap(spell(todayTasks.length))} task${todayTasks.length === 1 ? "" : "s"} on the list.`);
  }
  if (overdue.length > 0) {
    parts.push(`${cap(spell(overdue.length))} overdue.`);
  }
  return parts.join(" ");
}

const NUMS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
function spell(n) { return NUMS[n] || String(n); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function clampHour(h) {
  if (!Number.isFinite(h)) return 8;
  return Math.max(0, Math.min(23, Math.floor(h)));
}

async function fire(message) {
  notifier.notify({ title: "Gwen", message, sound: false, timeout: 6 });
  try {
    ipc.sendTranscript("assistant", message);
  } catch {} // ipc may not be ready before main window mounts
  try {
    await speak(message);
  } catch (err) {
    console.warn("[proactive] speak failed:", err.message);
  }
}

function isIdle() {
  return (global.getGwenState ? global.getGwenState() : "idle") === "idle";
}

function loadState() {
  try {
    return readJSON(STATE_FILE, {} as any) || {};
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    writeJSON(STATE_FILE, state);
  } catch (err) {
    console.warn("[proactive] save state failed:", err.message);
  }
}
