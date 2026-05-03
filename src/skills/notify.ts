// src/skills/notify.js — task reminders (cron + OS + voice)
import notifier from "node-notifier";
import * as tasksTool from "../tools/tasks.js";
import { speak } from "./tts.js";

let intervalHandle = null;
const fired = new Map(); // taskId → { hourBefore: bool, atDue: bool }

export function startReminderLoop(intervalMs = 30 * 60 * 1000) {
  if (intervalHandle) return;
  console.log("[notify] reminder loop started");
  // Run once at boot
  setTimeout(() => sweep().catch(console.error), 5000);
  intervalHandle = setInterval(() => {
    sweep().catch(console.error);
  }, intervalMs);
}

export function stopReminderLoop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

export function scheduleReminder(_task) {
  // Sweep already handles this; left as a hook for cron-based scheduling later.
}

export function cancelReminder(taskId) {
  fired.delete(taskId);
}

export function checkOverdueTasks() {
  return tasksTool.getOverdue();
}

async function sweep() {
  const tasks = tasksTool.getAll();
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;

  for (const t of tasks) {
    if (t.done || !t.due) continue;
    const dueMs = new Date(t.due).getTime();
    if (isNaN(dueMs)) continue;

    const state = fired.get(t.id) || { hourBefore: false, atDue: false };

    // Hour-before window: due is between now and now+1h
    if (!state.hourBefore && dueMs > now && dueMs - now <= HOUR) {
      await fireReminder(t, "hour-before");
      state.hourBefore = true;
    }

    // At-due window: due is between now-30m and now+5m (slack for sweep timing)
    if (!state.atDue && Math.abs(dueMs - now) <= 30 * 60 * 1000 && dueMs <= now + 5 * 60 * 1000) {
      await fireReminder(t, "at-due");
      state.atDue = true;
    }

    fired.set(t.id, state);
  }
}

async function fireReminder(task, kind) {
  const message = kind === "at-due" ? `Now: ${task.text}` : `In about an hour: ${task.text}`;

  notifier.notify({
    title: "Gwen Reminder",
    message,
    sound: false,
    timeout: 6,
  });

  const mjState = global.getGwenState ? global.getGwenState() : "idle";
  if (mjState === "idle") {
    const phrase = kind === "at-due"
      ? `Reminder — ${task.text}, now.`
      : `Heads up — ${task.text} in about an hour.`;
    try {
      await speak(phrase);
    } catch (err) {
      console.warn("[notify] speak failed:", err.message);
    }
  }
}
