// src/tools/dayplan.js — daily briefing synthesizer
import * as calendarTool from "./calendar.js";
import * as tasksTool    from "./tasks.js";
import * as memoryTool   from "./memory.js";

/**
 * Aggregate calendar + tasks + memory into a structured plan.
 * brain.js will speak the result; we just return structured data.
 */
export async function run({ tone = "briefing" } = {}) {
  const [eventsResult, todayTasksResult, overdueTasksResult, name, priority] = await Promise.all([
    calendarTool.run({ days: 1 }).catch(() => null),
    tasksTool.list({ filter: "today" }).catch(() => null),
    tasksTool.list({ filter: "overdue" }).catch(() => null),
    memoryTool.recall({ key: "user_name" }).catch(() => null),
    memoryTool.recall({ key: "top_priority" }).catch(() => null),
  ]);

  const meetings = Array.isArray(eventsResult) ? eventsResult : [];
  const today    = Array.isArray(todayTasksResult) ? todayTasksResult.slice(0, 3) : [];
  const overdue  = Array.isArray(overdueTasksResult) ? overdueTasksResult.slice(0, 3) : [];

  const greeting = {
    name: typeof name === "string" && !name.startsWith("I don't") ? name : null,
    timeOfDay: getTimeOfDay(),
  };

  const context = {
    topPriority: typeof priority === "string" && !priority.startsWith("I don't") ? priority : null,
  };

  return {
    tone,
    greeting,
    meetings,
    topTasks: today,
    overdueTasks: overdue,
    context,
  };
}

function getTimeOfDay() {
  const hr = new Date().getHours();
  if (hr < 12) return "morning";
  if (hr < 17) return "afternoon";
  return "evening";
}
