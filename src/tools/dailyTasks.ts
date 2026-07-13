// src/tools/dailyTasks.ts — Task review and forwarding utilities for daily routine
import { readJSON, updateArrayItem, writeJSON } from "../skills/storage.js";
import { parseDate, isToday } from "../skills/dateParse.js";

const FILE = "tasks.json";

type Task = {
  id: string;
  text: string;
  due?: string;
  done: boolean;
  created: string;
};

type TaskChoice = {
  taskId: string;
  action: "forward" | "pending" | "complete";
};

/**
 * Get count of incomplete tasks due today.
 */
export function getIncompleteTodayCount(): number {
  const all = readJSON(FILE, []);
  return all.filter((t: Task) => !t.done && t.due && isToday(t.due)).length;
}

/**
 * Get all incomplete tasks due today.
 */
export function getIncompleteToday(): Task[] {
  const all = readJSON(FILE, []);
  return all.filter((t: Task) => !t.done && t.due && isToday(t.due));
}

/**
 * Review and process incomplete tasks with user choices.
 * Called by the review_daily_tasks tool.
 */
export function reviewDailyTasks(choices: TaskChoice[]): string {
  if (!Array.isArray(choices) || choices.length === 0) {
    return "No tasks to review.";
  }

  const results: string[] = [];

  for (const choice of choices) {
    const { taskId, action } = choice;
    const task = findTask(taskId);

    if (!task) {
      results.push(`Task ${taskId} not found.`);
      continue;
    }

    switch (action) {
      case "forward":
        forwardToTomorrow(taskId);
        results.push(`"${task.text}" forwarded to tomorrow.`);
        break;
      case "pending":
        results.push(`"${task.text}" kept pending.`);
        break;
      case "complete":
        markComplete(taskId);
        results.push(`"${task.text}" marked complete.`);
        break;
    }
  }

  if (results.length === 0) {
    return "Nothing was updated.";
  }

  return results.join(" ");
}

/**
 * Forward a task to tomorrow by updating its due date.
 */
export function forwardToTomorrow(taskId: string): boolean {
  const all = readJSON(FILE, []);
  const idx = all.findIndex((t: Task) => t.id === taskId);

  if (idx === -1) return false;

  // Calculate tomorrow's date at same time
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM

  all[idx].due = tomorrow.toISOString();
  writeJSON(FILE, all);
  return true;
}

/**
 * Mark a task as complete.
 */
export function markComplete(taskId: string): boolean {
  return updateArrayItem(FILE, taskId, { done: true }) !== null;
}

/**
 * Find a task by ID.
 */
function findTask(taskId: string): Task | null {
  const all = readJSON(FILE, []);
  return all.find((t: Task) => t.id === taskId) || null;
}

/**
 * Get a summary of incomplete tasks for voice output.
 */
export function getIncompleteSummary(): string {
  const incomplete = getIncompleteToday();

  if (incomplete.length === 0) {
    return "All tasks for today are complete.";
  }

  const items = incomplete.map((t, i) => `${i + 1}. ${t.text}`).join(". ");
  return `You have ${incomplete.length} incomplete ${incomplete.length === 1 ? "task" : "tasks"}: ${items}.`;
}
