// src/core/localFastPath.ts — Local fast path for common requests without LLM
import { dispatchTool } from "./toolDispatcher.js";
import { getPendingTool } from "../skills/security.js";

function formatClock(now = new Date()): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function formatDate(now = new Date()): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

function formatLocalResult(result: string | object): string {
  if (typeof result === "string") return result;
  if (!Array.isArray(result)) return JSON.stringify(result);
  if (!result.length) return "Nothing found.";

  const first = result.slice(0, 3);
  if (first[0]?.start && first[0]?.title) {
    const fmt = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
    });
    return `You have ${result.length} event${result.length === 1 ? "" : "s"}. ` +
      first.map((e) => `${e.title} at ${fmt.format(new Date(e.start))}`).join(". ") +
      (result.length > first.length ? "." : "");
  }

  if (first[0]?.text) {
    return `You have ${result.length} task${result.length === 1 ? "" : "s"} open. ` +
      first.map((t) => t.text).join(". ") +
      (result.length > first.length ? "." : "");
  }

  return JSON.stringify(first);
}

function extractAppName(text: string): string {
  return text
    .replace(/^(open|launch|start)\s+/i, "")
    .replace(/\s+(app|application)$/i, "")
    .trim();
}

function extractTaskText(text: string): string {
  return text
    .replace(/^remind me to\s+/i, "")
    .replace(/^add (a )?task( to (my )?(list|tasks))?\s*/i, "")
    .replace(/^put\s+/i, "")
    .replace(/\s+on my (list|tasks)$/i, "")
    .trim();
}

function wantsSelfCodeWork(text: string): boolean {
  return /\b(self[- ]?(fix|build|building|repair)|fix yourself|fix this( thing| bug| issue)?|change (your|gwen)|edit (your|gwen)|modify (your|gwen)|update (your|gwen)|add .* to gwen|add .* feature|build this feature|build .* feature|build .* (into|for) (yourself|you|gwen)|implement this|implement .* (in|for) (yourself|you|gwen)|make (the )?(changes|change)( in| to)? (the )?code|make .* code changes?|wire .* (into|up)|spawn codex|codex .* (this folder|this repo|gwen|your code)|gwen.*(bug|broken|feature)|daily check-?in|task tracker|input bar|conversation window|loading state|progress animation|visual (indicator|feedback)|updating (yourself|myself)|rewir(e|ing) (yourself|myself))\b/i.test(text);
}

export interface LocalFastPathOptions {
  intentHint?: { type: string; confidence: number };
  skipHistory?: boolean;
  skipAmbient?: boolean;
  broadcastTasks?: () => void;
}

export interface LocalFastPathDeps {
  handlers: Record<string, (input: any) => string | object | Promise<string | object>>;
}

/**
 * Handle clear, deterministic requests without calling the LLM.
 * Returns null when the turn needs the full LLM.
 */
export async function tryLocalFastPath(
  userInput: string,
  deps: LocalFastPathDeps,
  opts: LocalFastPathOptions = {}
): Promise<string | null> {
  const text = String(userInput || "").trim();
  if (!text) return null;
  if (getPendingTool()) return null;
  const lower = text.toLowerCase();
  let reply: string | null = null;

  if (wantsSelfCodeWork(text)) {
    reply = formatLocalResult(await dispatchTool("fix_self_code", { description: text }, deps.handlers));
  } else if (/^(hi|hey|hello|yo|sup)\b[.!?]*$/i.test(text)) {
    // Gwen Stacy energy: slightly detached but warm acknowledgment
    const greetings = [
      "Hey. I'm here.",
      "Hey. You rang?",
      "Yo. What's up?",
      "Hey. I'm listening.",
      "Hey. Miss me?",
      "Hey. What do you need?",
    ];
    reply = greetings[Math.floor(Math.random() * greetings.length)];
  } else if (/^(thanks|thank you|cool|ok|okay|got it|done)\b[.!?]*$/i.test(text)) {
    reply = "Got it.";
  } else if (/\b(what time is it|current time|time now)\b/i.test(text)) {
    reply = `It's ${formatClock()}.`;
  } else if (/\b(what(?:'s| is) the date|today'?s date|what day is it)\b/i.test(text)) {
    reply = `It's ${formatDate()}.`;
  } else if (/^(open|launch|start)\s+[\w .-]+$/i.test(text)) {
    const app = extractAppName(text);
    if (app) reply = formatLocalResult(await dispatchTool("open_app", { name: app }, deps.handlers));
  } else if (/\b(volume|sound)\b/i.test(text)) {
    if (/\bmute\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("set_volume", { action: "mute" }, deps.handlers));
    } else if (/\bunmute\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("set_volume", { action: "unmute" }, deps.handlers));
    } else if (/\b(up|increase|louder)\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("set_volume", { action: "up" }, deps.handlers));
    } else if (/\b(down|decrease|lower|quieter)\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("set_volume", { action: "down" }, deps.handlers));
    } else if (/\b(what|current|get|read)\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("get_volume", {}, deps.handlers));
    }
  } else if (/\bbattery\b/i.test(text)) {
    reply = formatLocalResult(await dispatchTool("get_battery", {}, deps.handlers));
  } else if (/^(lock screen|lock my screen|lock the mac)\b/i.test(lower)) {
    reply = formatLocalResult(await dispatchTool("lock_screen", {}, deps.handlers));
  } else if (/^(sleep|put .* to sleep|sleep the mac)\b/i.test(lower)) {
    reply = formatLocalResult(await dispatchTool("sleep_mac", {}, deps.handlers));
  } else if (/^(my tasks|show my tasks|what.*(tasks|todo|to do|on my plate)|todo list)\b/i.test(lower)) {
    reply = formatLocalResult(await dispatchTool("get_tasks", { filter: "open" }, deps.handlers));
    opts.broadcastTasks?.();
  } else if (/^(remind me to|add (a )?task|put .+ on my (list|tasks))/i.test(text)) {
    const taskText = extractTaskText(text);
    if (taskText) {
      reply = formatLocalResult(await dispatchTool("add_task", { text: taskText }, deps.handlers));
      opts.broadcastTasks?.();
    }
  } else if (opts.intentHint?.type === "calendar" && opts.intentHint.confidence >= 0.95) {
    reply = formatLocalResult(await dispatchTool("get_calendar", { days: 1 }, deps.handlers));
  }

  if (!reply) return null;
  if (!opts.skipHistory) {
    const { recordExchange } = await import("./conversationManager.js");
    await recordExchange(userInput, reply, "local");
  }
  return reply;
}
