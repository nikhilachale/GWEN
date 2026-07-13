// src/skills/dailyRoutine.ts — Daily startup greeting and shutdown task review
import { readJSON, writeJSON } from "./storage.js";
import { speak } from "./tts.js";
import * as ipc from "./ipc.js";
import * as memoryTool from "../tools/memory.js";
import * as dailyTasksTool from "../tools/dailyTasks.js";
import notifier from "node-notifier";

const STATE_FILE = "daily-routine-state.json";

type RoutineState = {
  lastStartupDate?: string;
  lastShutdownReviewDate?: string;
  startupSkipped?: boolean;
};

/**
 * Check if this is the first startup of the day and run the welcome routine.
 * Call this from main.ts during app startup.
 */
export async function checkStartupRoutine(): Promise<void> {
  const state = loadState();
  const todayKey = new Date().toISOString().slice(0, 10);

  // Already ran today
  if (state.lastStartupDate === todayKey) {
    return;
  }

  // Check if user skipped today's greeting
  if (state.startupSkipped) {
    // Reset skip flag but don't run routine
    state.startupSkipped = false;
    saveState(state);
    return;
  }

  try {
    await runWelcomeSequence();
    state.lastStartupDate = todayKey;
    saveState(state);
  } catch (err) {
    console.warn("[daily-routine] startup failed:", err);
  }
}

/**
 * Run the shutdown review when the app is quitting.
 * Call this from main.ts during app.on('before-quit').
 */
export async function runShutdownReview(): Promise<void> {
  const state = loadState();
  const todayKey = new Date().toISOString().slice(0, 10);

  // Already reviewed today
  if (state.lastShutdownReviewDate === todayKey) {
    return;
  }

  // Check if skip env var is set
  if (process.env.GWEN_SKIP_SHUTDOWN_REVIEW === "1") {
    return;
  }

  try {
    const incompleteCount = await dailyTasksTool.getIncompleteTodayCount();
    if (incompleteCount === 0) {
      // No incomplete tasks, nothing to review
      return;
    }

    await runShutdownSequence(incompleteCount);
    state.lastShutdownReviewDate = todayKey;
    saveState(state);
  } catch (err) {
    console.warn("[daily-routine] shutdown failed:", err);
  }
}

/**
 * Mark today's startup greeting as skipped (user preference).
 */
export function skipStartupGreeting(): void {
  const state = loadState();
  const todayKey = new Date().toISOString().slice(0, 10);
  state.startupSkipped = true;
  state.lastStartupDate = todayKey; // Also mark as done
  saveState(state);
}

/**
 * Reset the daily state (useful for testing or manual reset).
 */
export function resetDailyState(): void {
  const todayKey = new Date().toISOString().slice(0, 10);
  const state = loadState();
  delete state.lastStartupDate;
  delete state.lastShutdownReviewDate;
  delete state.startupSkipped;
  saveState(state);
}

// ─── Internal Implementation ───────────────────────────────────────

async function runWelcomeSequence(): Promise<void> {
  // Get user's name from memory
  let userName = "Miles"; // Default fallback
  try {
    const nameResult = await memoryTool.recall({ key: "user_name" });
    if (typeof nameResult === "string" && !nameResult.startsWith("I don't")) {
      userName = nameResult;
    }
  } catch {
    // Use default
  }

  // Get time of day for greeting
  const timeOfDay = getTimeOfDay();
  const greeting = `Hi ${userName}, good ${timeOfDay}.`;

  // Speak greeting first
  await fire(greeting);

  // Small pause before second message
  await sleep(800);

  // Second message: ask for tasks
  await fire("What are the tasks of the day?");
}

async function runShutdownSequence(incompleteCount: number): Promise<void> {
  const taskWord = incompleteCount === 1 ? "task" : "tasks";
  const message = `You have ${incompleteCount} incomplete ${taskWord} today. Would you like to review them?`;

  await fire(message);
}

function getTimeOfDay(): string {
  const hr = new Date().getHours();
  if (hr < 12) return "morning";
  if (hr < 17) return "afternoon";
  return "evening";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fire(message: string): Promise<void> {
  // Show notification
  notifier.notify({
    title: "Gwen",
    message,
    sound: false,
    timeout: 6,
  });

  // Send to UI transcript
  try {
    ipc.sendTranscript("assistant", message);
  } catch {
    // IPC may not be ready
  }

  // Speak aloud
  try {
    await speak(message);
  } catch (err) {
    console.warn("[daily-routine] speak failed:", err);
  }
}

function loadState(): RoutineState {
  try {
    return readJSON(STATE_FILE, {}) || {};
  } catch {
    return {};
  }
}

function saveState(state: RoutineState): void {
  try {
    writeJSON(STATE_FILE, state);
  } catch (err) {
    console.warn("[daily-routine] save state failed:", err);
  }
}
