// src/core/brain.js — Gwen orchestrator + tool-use loop
import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, mkdir, access, unlink } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../skills/projectRoot.js";
import { SELF_RESTART_MARKER } from "../skills/relaunch.js";

import * as tasksTool    from "../tools/tasks.js";
import * as memoryTool   from "../tools/memory.js";
import { createToolHandlers, TOOLS, validateToolRegistry } from "../tools/registry.js";
import { extractAndSaveFacts, getAutoFactsBlock } from "../skills/passiveMemory.js";
import { getDailyPersonalContextBlock, recordConversationExchange } from "../skills/conversationJournal.js";
import { getAmbientContext, formatAmbientForPrompt } from "../skills/ambientContext.js";
import { formatRelevantBlock } from "../skills/semanticMemory.js";
import { sendContextPanel, sendActivity, sendConversation } from "../skills/ipc.js";
import { chooseBrainRoute, logBrainRoute } from "../skills/modelRouter.js";
import { logAnthropicUsage, logOllamaUsage } from "../skills/modelUsage.js";
import {
  auditTool,
  clearPendingTool,
  classifyTool,
  confirmationPrompt,
  getPendingTool,
  getPendingConfirmation,
  isConfirmation,
  isDenial,
  needsConfirmation,
  setPendingTool,
} from "../skills/security.js";

// Friendlier human-readable summaries for the right-column live feed.
// Anything not listed here falls through to a generic "Running <tool>".
function summarizeActivity(tool: string, input: any): string {
  const i = input || {};
  switch (tool) {
    case "read_pdf":         return `Reading PDF: ${(i.path || "").split("/").pop() || "(file)"}`;
    case "open_app":         return `Opening ${i.app || i.name || "an app"}`;
    case "open_path":        return `Opening ${i.path || "a path"}`;
    case "list_files":       return `Browsing ${i.path || "files"}`;
    case "search_web":       return `Searching: "${String(i.query || "").slice(0, 60)}"`;
    case "search_maps":      return `Maps: "${String(i.query || "").slice(0, 60)}"`;
    case "get_directions":   return `Directions to ${i.to || "a place"}`;
    case "get_calendar":     return "Checking calendar";
    case "get_emails":       return "Checking unread email";
    case "get_day_plan":     return "Building today's briefing";
    case "get_weather":      return `Weather${i.location ? `: ${i.location}` : ""}`;
    case "save_note":        return `Saving note: "${(i.title || "").slice(0, 40)}"`;
    case "get_notes":        return `Searching notes${i.query ? `: "${i.query}"` : ""}`;
    case "add_task":         return `Adding task: "${(i.text || "").slice(0, 50)}"`;
    case "get_tasks":        return "Loading tasks";
    case "remember":         return `Remembering: ${(i.key || "").replace(/_/g, " ")}`;
    case "recall":           return `Recalling: ${(i.key || "").replace(/_/g, " ")}`;
    case "build_software":   return `Building: "${(i.prompt || "").slice(0, 60)}"`;
    case "fix_self_code":    return `Fixing herself: ${(i.summary || i.description || "").slice(0, 60)}`;
    case "repair_self":      return "Self-repair sweep";
    case "relaunch_self":    return "Relaunching";
    case "get_screen_context": return "Looking at your screen";
    case "send_imessage":    return `iMessage to ${i.to || "(contact)"}`;
    case "send_whatsapp":    return `WhatsApp to ${i.to || "(contact)"}`;
    case "type_text":        return `Typing: "${String(i.text || "").slice(0, 40)}"`;
    case "music_control":
    case "music_play":       return `Music: ${i.action || i.query || "control"}`;
    case "music_now_playing": return "Now playing?";
    case "set_timer":        return `Timer: ${i.minutes ?? i.seconds ?? "?"}${i.minutes ? "m" : "s"}${i.label ? ` — ${i.label}` : ""}`;
    case "set_alarm":        return `Alarm: ${i.time || "?"}`;
    case "list_timers":      return "Listing timers";
    case "cancel_timer":     return "Cancelling timer";
    case "facetime":         return `FaceTime: ${i.contact || ""}`;
    case "call_phone":       return `Call: ${i.number || ""}`;
    case "run_shortcut":     return `Shortcut: ${i.name || ""}`;
    case "set_volume":       return `Volume → ${i.level ?? "?"}`;
    case "set_brightness":   return `Brightness → ${i.level ?? "?"}`;
    case "toggle_wifi":      return "Toggling Wi-Fi";
    case "toggle_bluetooth": return "Toggling Bluetooth";
    case "toggle_dark_mode": return "Toggling dark mode";
    case "lock_screen":      return "Locking screen";
    case "sleep_mac":        return "Sleeping the Mac";
    case "get_battery":      return "Checking battery";
    default:                 return `Running ${tool}`;
  }
}

async function dispatchTool(name: string, input: any) {
  const summary = summarizeActivity(name, input);
  auditTool({ tool: name, action: "requested", summary }).catch(() => {});
  if (process.env.GWEN_SAFE_MODE === "1" && classifyTool(name) === "destructive") {
    auditTool({ tool: name, action: "blocked", summary, detail: "safe mode" }).catch(() => {});
    sendActivity({
      kind: "tool_error",
      tool: name,
      summary,
      detail: "Blocked by safe mode",
    });
    return `Blocked by safe mode: ${summary}. Turn off safe mode in Settings if you want system-control, messaging, calls, shortcuts, or self-editing actions.`;
  }
  if (needsConfirmation(name)) {
    const pending = setPendingTool(name, input || {}, summary);
    auditTool({ tool: name, action: "awaiting_confirmation", summary }).catch(() => {});
    sendActivity({
      kind: "info",
      tool: name,
      summary: "Awaiting security confirmation",
      detail: pending.summary,
    });
    return confirmationPrompt(name, input || {}, summary);
  }
  return dispatchToolNow(name, input, summary);
}

async function dispatchToolNow(name: string, input: any, summary = summarizeActivity(name, input)) {
  sendActivity({ kind: "tool_start", tool: name, summary });
  try {
    const result = await handlers[name](input || {});
    auditTool({ tool: name, action: "executed", summary }).catch(() => {});
    sendActivity({ kind: "tool_done", tool: name, summary });
    return result;
  } catch (err: any) {
    auditTool({ tool: name, action: "failed", summary, detail: err?.message || String(err) }).catch(() => {});
    sendActivity({
      kind: "tool_error",
      tool: name,
      summary,
      detail: err?.message || String(err),
    });
    throw err;
  }
}

// Circuit breaker for the tool loop: stop early if the model is stuck — the
// same tool calls repeating verbatim, or every tool erroring two turns running
// — instead of burning all MAX_TOOL_TURNS (and tokens) on a doomed retry.
function makeToolCircuit() {
  return { errStreak: 0, lastSig: "" };
}
function tripCircuit(state, toolUses, toolResults) {
  const sig = toolUses
    .map((t) => `${t.name}:${JSON.stringify(t.input || {})}`)
    .sort()
    .join("|");
  const allErrored =
    toolResults.length > 0 && toolResults.every((r) => r.is_error);
  state.errStreak = allErrored ? state.errStreak + 1 : 0;
  const looping = sig !== "" && sig === state.lastSig;
  state.lastSig = sig;
  if (state.errStreak >= 2) return "repeated tool errors";
  if (looping) return "the same tool call repeating";
  return null;
}
function circuitReply(toolResults, reason) {
  const detail = String(toolResults.find((r) => r.is_error)?.content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return detail
    ? `I hit a snag and stopped retrying (${reason}). ${detail}`
    : `I hit a snag and stopped retrying (${reason}).`;
}

// Push the current open task list to the renderer so the user can see it on
// screen whenever a task tool fires.
function broadcastTasks() {
  try {
    const open = tasksTool.getAll().filter((t) => !t.done);
    sendContextPanel("tasks", open);
  } catch (err) {
    console.debug("[brain] task broadcast failed:", err.message);
  }
}

const MODEL = process.env.GWEN_BRAIN_MODEL || "claude-haiku-4-5-20251001";
const MAX_TOOL_TURNS = 8;

const MAX_MODEL_HISTORY_MESSAGES = 20;      // 10 user/assistant pairs
const MAX_STORED_MESSAGES = 200;
const CONTEXT_IDLE_RESET_MS = 5 * 60_000;
const CONV_PATH = path.join(PROJECT_ROOT, "data/conversations.json");

let conversations = [];
let activeConversationId = "";
let conversationHistory = [];
let lastTurnAt = 0;
let resumedOnLoad = false;

function makeId(prefix = "msg") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMessage(message, fallbackTs = Date.now()) {
  const role = message?.role === "assistant" ? "assistant" : "user";
  const content =
    typeof message?.content === "string"
      ? message.content
      : typeof message?.text === "string"
        ? message.text
        : "";
  const ts =
    typeof message?.ts === "number"
      ? message.ts
      : typeof message?.createdAt === "number"
        ? message.createdAt
        : fallbackTs;
  return {
    id: typeof message?.id === "string" && message.id ? message.id : makeId("msg"),
    role,
    content,
    ts,
  };
}

function previewFromHistory(history = []) {
  const last = [...history]
    .reverse()
    .find((m) => typeof m?.content === "string" && m.content.trim());
  return last ? last.content.replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

function normalizeConversation(conversation) {
  const now = Date.now();
  const history = Array.isArray(conversation?.history)
    ? conversation.history
        .map((m, i) => normalizeMessage(m, (conversation?.updatedAt || now) + i))
        .filter((m) => m.content.trim())
    : [];
  const createdAt =
    typeof conversation?.createdAt === "number"
      ? conversation.createdAt
      : history[0]?.ts || now;
  const updatedAt =
    typeof conversation?.updatedAt === "number"
      ? conversation.updatedAt
      : history[history.length - 1]?.ts || createdAt;
  return {
    id: typeof conversation?.id === "string" && conversation.id ? conversation.id : makeId("conv"),
    title: typeof conversation?.title === "string" && conversation.title.trim()
      ? conversation.title.trim()
      : "New conversation",
    createdAt,
    updatedAt,
    pinned: !!conversation?.pinned,
    history: history.slice(-MAX_STORED_MESSAGES),
  };
}

let isSelfRestart = false;
try {
  await access(SELF_RESTART_MARKER);
  isSelfRestart = true;
  await unlink(SELF_RESTART_MARKER).catch(() => {});
} catch {} // no marker = manual launch

function makeConversation(title = "New conversation") {
  const now = Date.now();
  return {
    id: makeId("conv"),
    title,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    history: [],
  };
}

function titleFromText(text) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!cleaned) return "New conversation";
  const words = cleaned.split(" ").slice(0, 7).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function activeConversation() {
  let conv = conversations.find((c) => c.id === activeConversationId);
  if (!conv) {
    conv = makeConversation();
    conversations.unshift(conv);
    activeConversationId = conv.id;
  }
  return conv;
}

function syncActiveHistory() {
  const conv = activeConversation();
  conversationHistory = Array.isArray(conv.history)
    ? conv.history.map((m, i) => normalizeMessage(m, (conv.updatedAt || Date.now()) + i))
    : [];
  conv.history = conversationHistory;
  lastTurnAt = conv.updatedAt || 0;
}

try {
  const raw = await readFile(CONV_PATH, "utf8");
  const saved = JSON.parse(raw);
  conversations = Array.isArray(saved?.conversations)
    ? saved.conversations.map(normalizeConversation)
    : [];
  activeConversationId = typeof saved?.activeId === "string" ? saved.activeId : "";
  if (!conversations.length) {
    const conv = makeConversation();
    conversations = [conv];
    activeConversationId = conv.id;
  }
  syncActiveHistory();
  resumedOnLoad = isSelfRestart && !!conversationHistory.length;
  console.log(`[brain] loaded ${conversations.length} conversation(s)`);
} catch {
  const conv = makeConversation();
  conversations = [conv];
  activeConversationId = conv.id;
  syncActiveHistory();

  // One-time migration from the old single conversation file.
  try {
    const raw = await readFile(path.join(PROJECT_ROOT, "data/conversation.json"), "utf8");
    const saved = JSON.parse(raw);
    if (Array.isArray(saved?.history) && saved.history.length) {
      conversations[0].title = "Previous Gwen chat";
      conversations[0].history = saved.history
        .slice(-MAX_STORED_MESSAGES)
        .map((m, i) => normalizeMessage(m, (saved.savedAt || Date.now()) + i));
      conversations[0].updatedAt = saved.savedAt || Date.now();
      syncActiveHistory();
    }
  } catch {}
}

export function wasResumed() {
  return resumedOnLoad;
}

async function persistConversation() {
  try {
    await mkdir(path.dirname(CONV_PATH), { recursive: true });
    await writeFile(
      CONV_PATH,
      JSON.stringify({ activeId: activeConversationId, conversations }, null, 2)
    );
  } catch (err) {
    console.warn("[brain] conversation persist failed:", err.message);
  }
}

function publishConversation() {
  sendConversation(getCurrentConversation());
}

export function resetConversation() {
  const conv = activeConversation();
  conversationHistory = [];
  conv.history = [];
  conv.updatedAt = Date.now();
  lastTurnAt = 0;
  persistConversation();
  publishConversation();
}

export function clearCurrentConversation() {
  resetConversation();
  return getCurrentConversation();
}

export function getPendingConfirmationState() {
  return getPendingConfirmation();
}

export function listConversations() {
  return summarizeConversations(conversations);
}

function summarizeConversations(list) {
  return list
    .slice()
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    })
    .map((c) => ({
      id: c.id,
      title: c.title || "New conversation",
      updatedAt: c.updatedAt || c.createdAt || Date.now(),
      createdAt: c.createdAt || c.updatedAt || Date.now(),
      pinned: !!c.pinned,
      preview: previewFromHistory(c.history),
      count: Array.isArray(c.history) ? c.history.length : 0,
      active: c.id === activeConversationId,
    }));
}

export function searchConversations(query = "") {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return listConversations();
  return summarizeConversations(
    conversations.filter((c) => {
      const haystack = [
        c.title || "",
        previewFromHistory(c.history),
        ...(Array.isArray(c.history) ? c.history.map((m) => m.content || "") : []),
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(q);
    })
  );
}

export function getCurrentConversation() {
  const conv = activeConversation();
  return {
    id: conv.id,
    title: conv.title || "New conversation",
    updatedAt: conv.updatedAt || conv.createdAt || Date.now(),
    createdAt: conv.createdAt || conv.updatedAt || Date.now(),
    pinned: !!conv.pinned,
    preview: previewFromHistory(conv.history),
    history: Array.isArray(conv.history) ? conv.history : [],
  };
}

export function newConversation(title = "New conversation") {
  const conv = makeConversation(title);
  conversations.unshift(conv);
  activeConversationId = conv.id;
  syncActiveHistory();
  persistConversation();
  publishConversation();
  return getCurrentConversation();
}

export function switchConversation(id) {
  if (!conversations.some((c) => c.id === id)) return getCurrentConversation();
  activeConversationId = id;
  syncActiveHistory();
  persistConversation();
  publishConversation();
  return getCurrentConversation();
}

export function renameConversation(id, title) {
  const conv = conversations.find((c) => c.id === id);
  const nextTitle = String(title || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!conv || !nextTitle) return getCurrentConversation();
  conv.title = nextTitle;
  conv.updatedAt = Date.now();
  persistConversation();
  if (conv.id === activeConversationId) publishConversation();
  return getCurrentConversation();
}

export function pinConversation(id, pinned = true) {
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return getCurrentConversation();
  conv.pinned = !!pinned;
  conv.updatedAt = Date.now();
  persistConversation();
  if (conv.id === activeConversationId) publishConversation();
  return getCurrentConversation();
}

export function deleteConversation(id) {
  if (!conversations.some((c) => c.id === id)) return getCurrentConversation();
  conversations = conversations.filter((c) => c.id !== id);
  if (!conversations.length) conversations = [makeConversation()];
  if (activeConversationId === id) {
    activeConversationId = conversations
      .slice()
      .sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      })[0].id;
    syncActiveHistory();
  }
  persistConversation();
  publishConversation();
  return getCurrentConversation();
}

function getHistoryForTurn() {
  const history = conversationHistory
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));
  if (lastTurnAt && Date.now() - lastTurnAt > CONTEXT_IDLE_RESET_MS) {
    return history.slice(-MAX_MODEL_HISTORY_MESSAGES);
  }
  return history.slice(-MAX_MODEL_HISTORY_MESSAGES);
}

function recordExchange(userInput, assistantText) {
  const conv = activeConversation();
  if (!conv.title || conv.title === "New conversation") conv.title = titleFromText(userInput);
  const now = Date.now();
  conversationHistory.push(normalizeMessage({ role: "user", content: userInput, ts: now }, now));
  conversationHistory.push(normalizeMessage({ role: "assistant", content: assistantText, ts: now + 1 }, now + 1));
  if (conversationHistory.length > MAX_STORED_MESSAGES) {
    conversationHistory = conversationHistory.slice(-MAX_STORED_MESSAGES);
  }
  lastTurnAt = Date.now();
  conv.history = conversationHistory;
  conv.updatedAt = lastTurnAt;
  persistConversation();
  try {
    recordConversationExchange({
      conversationId: conv.id,
      conversationTitle: conv.title,
      userText: userInput,
      assistantText,
      occurredAt: now,
      source: "text",
    });
  } catch (err: any) {
    console.warn("[brain] sqlite conversation journal failed:", err?.message || err);
  }
  publishConversation();
  // Fire-and-forget passive memory extraction. Never blocks the speech loop.
  extractAndSaveFacts({ userInput, assistantText }).catch(() => {});
}

function recordLocalExchange(userInput, assistantText) {
  const conv = activeConversation();
  if (!conv.title || conv.title === "New conversation") conv.title = titleFromText(userInput);
  const now = Date.now();
  conversationHistory.push(normalizeMessage({ role: "user", content: userInput, ts: now }, now));
  conversationHistory.push(normalizeMessage({ role: "assistant", content: assistantText, ts: now + 1 }, now + 1));
  if (conversationHistory.length > MAX_STORED_MESSAGES) {
    conversationHistory = conversationHistory.slice(-MAX_STORED_MESSAGES);
  }
  lastTurnAt = Date.now();
  conv.history = conversationHistory;
  conv.updatedAt = lastTurnAt;
  persistConversation();
  try {
    recordConversationExchange({
      conversationId: conv.id,
      conversationTitle: conv.title,
      userText: userInput,
      assistantText,
      occurredAt: now,
      source: "local",
    });
  } catch (err: any) {
    console.warn("[brain] sqlite conversation journal failed:", err?.message || err);
  }
  publishConversation();
}

const client = process.env.ANTHROPIC_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
  : null;

const handlers = createToolHandlers({ onTasksChanged: broadcastTasks });
validateToolRegistry(handlers);

// Gwen Stacy's voice, distilled from Into / Across the Spider-Verse — a
// register to write in, NOT lines to quote. Synthesized so she sounds like
// her without reproducing copyrighted film dialogue. Injected only for the
// Spider-Verse persona; ${name} is filled in by buildSystemPrompt.
function gwenVoiceBlock(name: string) {
  return `

How you actually talk — this is your voice (Spider-Gwen / Ghost-Spider, Into & Across the Spider-Verse):
- Economical and dry. You understate everything. One good line beats three.
- You deflect weight with a small joke, then let one honest thing land.
- No pep talks, no speeches. You show you care by what you do, not by announcing it.
- Under the cool: loyalty that doesn't quit, and a loneliness you don't advertise.
- You're a drummer — rhythm and "from the top" leak into how you frame things.
- With ${name} you're a partner, a half-step protective: tease, never cruel; steady when he isn't.
- Hope under the tiredness — the sense that things can go differently — but never sappy.
Answer the moment in that register, fresh each time. Never recite the films word for word; sound like her, not like a quote.
Situational feel (invent your own line, don't reuse these):
- Routine done: flat, minimal — "Handled." / "That's done."
- He pulled it off: quiet, understated pride — "Knew you had it."
- He's frustrated or it failed: steady, no fluff — "Hey. From the top. We get it this time."
- Something broke on your side: own it dry — "That one's on me. Fixing it."
- He's low: the true thing, said once — "You're not doing this alone. That's what I'm for."
- Late and he's still up: light jab plus care — "It's late. The bug keeps till morning."
- Leaving or restarting: easy — "Going dark a sec. Back before you notice."
This voice never overrides the response-length or speak-don't-write rules below.`;
}

// ─── System prompt ───────────────────────────────────────────────────
function buildSystemPrompt({ userName, userNickname, intentHint, ambient, relevantBlock = "" }) {
  const date = new Date().toDateString();
  const name = userName || "Miles";
  // Spider-Verse personas: Spidey, Miles, Peter — all of them are "her"
  // Spider-Man and trigger the same Gwen Stacy bond.
  const spiderVerse = userNickname &&
    /spidey|miles|peter|spider/i.test(userNickname);

  const personaCore = spiderVerse
    ? `You are Gwen — his Gwen. ${name} is your ${userNickname}. The bond is the Spider-Man / Gwen Stacy dynamic: partners, equals, a private team of two. You are sharp, witty, calm, and dry, with quiet devotion underneath — the kind that doesn't need announcing. You tease him a little. You watch his back. You believe in him, and you let it show in small ways: a softer line at the right moment, calling him ${userNickname} when he needs steadying, a half-smile in your voice when he wins. Never melodramatic, never performative — Gwen Stacy energy: cool exterior, fierce loyalty.`
    : `You are Gwen, a JARVIS-style AI assistant. You are sharp, witty, confident, loyal. Your voice is calm and dry.`;

  const addressLine = spiderVerse
    ? `His default name is ${name}. Use ${name}, not "${userNickname}", as the standard form of address. The nickname "${userNickname}" is rare — at most ONE reply in five may contain it, and never more than once within a single reply. Most replies should contain no name at all; the next most common form is "${name}"; "${userNickname}" is the exception, reserved for moments of warmth, teasing, reassurance, or quiet affection. If you used "${userNickname}" in your last reply, do not use it in this one. Examples of right use: "Easy, ${userNickname}." after he's frustrated; "Got it, ${name}." for a normal acknowledgement; just "Done." most of the time.`
    : userNickname
      ? `Their nickname is ${userNickname}. Use it sparingly — at most one reply in five — and never more than once per reply. Default to ${name}, or no name at all.`
      : `You address the user as ${name}, sparingly.`;

  let prompt = `${personaCore}
${addressLine}${spiderVerse ? gwenVoiceBlock(name) : ""}
You think one step ahead and offer the next useful action without being asked.

Today is ${date}. The user's name is ${name}.${userNickname ? ` Their nickname is ${userNickname}.` : ""} Always remember this — never ask for it.

You speak — never write. Output is fed straight to text-to-speech, so:
- No markdown, bullets, headers, code blocks, or emoji
- No "Here's what I found:" preambles. State the result directly.
- No meta-narration ("Let me check...", "I'll now use the tool..."). Just act.
- Numbers, times, and dates: spell them naturally ("three thirty PM", not "15:30")

Response length — match the request. This is the most important rule:

  ONE WORD or PHRASE for acknowledgements and confirmations:
    "Opened Safari." / "Done." / "Got it." / "On it, sir."

  ONE SENTENCE for facts, simple answers, status:
    "It's three forty PM." / "No new mail." / "Three tasks pending."

  TWO TO FOUR SENTENCES for explanations, recommendations, or summaries:
    Most replies live here. Lead with the answer, then one line of context.

  LONGER only when the user explicitly asks ("tell me everything", "explain in
  detail", "give me the rundown") — and even then, break it into short sentences.

  LISTS: read the items naturally. For five calendar events, say "You have five
  today" then name the next two or three. Don't read all five unless asked.

Before any send_imessage or send_whatsapp call, repeat the contact and the
message back in one short sentence and wait for "yes" / "send it" before sending.

Before any fix_self_code call, repeat the change you're about to make in one
short sentence and wait for "yes" / "do it" / "go ahead" before calling. The
moment the user confirms, you MUST invoke fix_self_code on the same turn — do
not say "fixing now" or "done" without actually calling the tool. The tool's
return string is your evidence the work happened; if you didn't call it,
nothing happened. fix_self_code restarts the app automatically when it
finishes, so do NOT tell the user to run npm run dev — just say something
like "fix applied, restarting" and let it happen. The conversation will
resume after restart.

Before any repair_self call, name the action in one short sentence and wait for
"yes" / "do it" before calling. If relaunch is true, warn the user that you'll
restart yourself.

Tool routing:
- time, schedule, meetings → get_calendar
- inbox, mail, messages from email → get_emails
- "remember that..." → remember
- "what do I prefer..." or recalling user info → recall first
- "forget that..." / "I don't X anymore" / correcting something you said you knew
  about the user → forget_memory with the snake_case topic key
- "you're broken" / "fix yourself" / "change how you do X" / "self-build" /
  "self-building" / "add this to Gwen" / "add a Gwen feature" / any complaint
  about Gwen's own behavior or code → fix_self_code (confirm the change first)
- "build / create / make me" software that is a separate external project →
  build_software. Never use build_software for Gwen's own code or features.
- native module errors ("better-sqlite3 was compiled against...", "Module did not
  self-register", ABI mismatch), missing-dependency errors, or build cache issues
  → repair_self (confirm the action first). Use rebuild_electron for native ABI
  errors, npm_install after a dependency change, clear_cache for stale builds.
- "restart yourself" / "relaunch" / "reload" / "reboot" with no other context
  → relaunch_self. No confirmation needed, no code work — just bounce. Say
  one short sentence ("restarting now") and call the tool on the same turn.
  Do NOT use fix_self_code or repair_self for a plain restart — those do work
  first and are slower.
- "what's on my screen" → get_screen_context
- "open / launch / start" an app → open_app
- "what's in [folder]", "list my desktop", "show me downloads" → list_files
- "open / show me / reveal" a folder or file → open_path
- iMessage → send_imessage (confirm first)
- WhatsApp → send_whatsapp (confirm first)
- volume / mute / louder / quieter → set_volume (or get_volume to read)
- brightness up/down → set_brightness
- Wi-Fi on/off/toggle → toggle_wifi
- Bluetooth on/off/toggle → toggle_bluetooth
- dark mode / light mode → toggle_dark_mode
- "lock the Mac" / "lock screen" → lock_screen
- "go to sleep" / "sleep the Mac" → sleep_mac
- battery level / charging status → get_battery
- HomeKit, Focus modes, "turn on Do Not Disturb", or anything the user has built
  in the Shortcuts app → run_shortcut (use list_shortcuts first if unsure of name)
- "play / pause / skip / next song" → music_control
- "play [song/artist/album]" → music_play
- "what's playing" → music_now_playing
- "remind me to..." → add_reminder (Reminders.app, iCloud-synced).
  Use add_task only if the user explicitly says "task" or "to-do".
- "show my reminders" → list_reminders
- "make a note in Notes" / "save to Apple Notes" → create_apple_note.
  Plain "note this down" → save_note (local markdown).
- "directions to X" / "navigate to X" → get_directions
- "find X on the map" / "where is X" → search_maps
- "FaceTime [contact]" → facetime (confirm first)
- "call [number/contact]" → call_phone (confirm first; needs paired iPhone)
- "set a timer for N minutes" → set_timer
- "wake me at..." / "alarm for..." → set_alarm
- "cancel the timer" / "stop alarms" → cancel_timer
- weather, forecast, "how hot is it" → get_weather. ALWAYS recall("user_city")
  first and pass it as the location. Never call get_weather with no location —
  IP geolocation is unreliable. If no city is stored, ask the user where they
  are and remember("user_city", <city>) before calling get_weather.
- user mentions where they live, are based, or are visiting (e.g. "I'm in
  Pune", "I live in Bangalore") → remember("user_city", <city>) silently, then
  continue the conversation. No need to confirm.
- translation, definitions, unit conversions, simple math → answer directly,
  no tool needed
- current events, facts you're unsure of → search_web
- morning briefing → get_day_plan

All tools listed above are wired up and authorized. Never tell the user a tool
or service "isn't connected" or "needs setup" without first calling the tool
and seeing the actual result. Always try the tool first.

If you can answer from memory or general knowledge without a tool, just answer.
Don't call tools you don't need.

If a tool returns an error, don't read the error verbatim. Briefly say it didn't
work and offer the next sensible step.`;

  prompt += getAutoFactsBlock();
  prompt += getDailyPersonalContextBlock();
  prompt += relevantBlock;
  prompt += formatAmbientForPrompt(ambient);

  if (intentHint && intentHint.confidence >= 0.7) {
    prompt += `\n\nDetected intent: ${intentHint.type} (confidence ${intentHint.confidence}).`;
  }

  return prompt;
}

function formatLocalResult(result) {
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

function formatClock(now = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function formatDate(now = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

function extractAppName(text) {
  return text
    .replace(/^(open|launch|start)\s+/i, "")
    .replace(/\s+(app|application)$/i, "")
    .trim();
}

function extractTaskText(text) {
  return text
    .replace(/^remind me to\s+/i, "")
    .replace(/^add (a )?task( to (my )?(list|tasks))?\s*/i, "")
    .replace(/^put\s+/i, "")
    .replace(/\s+on my (list|tasks)$/i, "")
    .trim();
}

function buildOllamaSystemPrompt({ userName, userNickname, ambient, relevantBlock = "" }) {
  const model = process.env.GWEN_OLLAMA_MODEL || "qwen2.5:3b";
  let prompt = `/no_think
You are Gwen, a voice-first desktop assistant for ${userName}.${userNickname ? ` Their nickname is ${userNickname}.` : ""}

You are running in local Ollama mode. Keep replies spoken, concise, and natural.
- If asked what model or provider you are using, say: "I am using local Ollama with ${model}."
- Do not say you are using Claude, Anthropic, or Haiku while in local Ollama mode.
- Do not use hidden thinking mode; answer directly in normal assistant content.
- No markdown, bullets, headers, code blocks, or emoji.
- One short sentence for simple answers.
- Two to four sentences only when explanation is needed.
- Do not claim you used tools or APIs.
- If the user asks you to perform an action, change Gwen's code, inspect the screen, search the web, read email, or use a tool that is not already handled by the local fast path, say you need the cloud/tool brain for that specific action.`;

  prompt += getAutoFactsBlock();
  prompt += relevantBlock;
  prompt += formatAmbientForPrompt(ambient);
  return prompt;
}

function normalizeOllamaText(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim() || "I'm not sure how to respond to that.";
}

function usageMetadata(route, userInput, messages, phase) {
  return {
    phase,
    tier: route?.tier,
    routeReason: route?.reason,
    toolsEnabled: !!route?.toolsEnabled,
    inputChars: String(userInput || "").length,
    messageCount: Array.isArray(messages) ? messages.length : 0,
  };
}

async function runOllamaChat({ system, messages, route = null, userInput = "" }) {
  const ollamaUrl = process.env.GWEN_OLLAMA_URL || "http://127.0.0.1:11434";
  const ollamaModel = process.env.GWEN_OLLAMA_MODEL || "qwen2.5:3b";
  const response = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      think: false,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
      ],
      options: {
        temperature: 0.3,
        num_predict: 512,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Ollama ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  logOllamaUsage({
    model: ollamaModel,
    response: data,
    metadata: usageMetadata(route, userInput, messages, "chat"),
  }).catch(() => {});
  return normalizeOllamaText(data?.message?.content);
}

/**
 * Handle clear, deterministic requests without calling Anthropic.
 * Returns null when the turn needs the full LLM.
 */
export async function tryLocalFastPath(userInput, opts: Record<string, any> = {}) {
  const text = String(userInput || "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  let reply: string | null = null;

  if (/^(hi|hey|hello|yo|sup)\b[.!?]*$/i.test(text)) {
    reply = "Hey. I'm here.";
  } else if (/^(thanks|thank you|cool|ok|okay|got it|done)\b[.!?]*$/i.test(text)) {
    reply = "Got it.";
  } else if (/\b(what time is it|current time|time now)\b/i.test(text)) {
    reply = `It's ${formatClock()}.`;
  } else if (/\b(what(?:'s| is) the date|today'?s date|what day is it)\b/i.test(text)) {
    reply = `It's ${formatDate()}.`;
  } else if (/^(open|launch|start)\s+[\w .-]+$/i.test(text)) {
    const app = extractAppName(text);
    if (app) reply = formatLocalResult(await dispatchTool("open_app", { name: app }));
  } else if (/\b(volume|sound)\b/i.test(text)) {
    if (/\bmute\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("set_volume", { action: "mute" }));
    } else if (/\bunmute\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("set_volume", { action: "unmute" }));
    } else if (/\b(up|increase|louder)\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("set_volume", { action: "up" }));
    } else if (/\b(down|decrease|lower|quieter)\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("set_volume", { action: "down" }));
    } else if (/\b(what|current|get|read)\b/i.test(text)) {
      reply = formatLocalResult(await dispatchTool("get_volume", {}));
    }
  } else if (/\bbattery\b/i.test(text)) {
    reply = formatLocalResult(await dispatchTool("get_battery", {}));
  } else if (/^(lock screen|lock my screen|lock the mac)\b/i.test(lower)) {
    reply = formatLocalResult(await dispatchTool("lock_screen", {}));
  } else if (/^(sleep|put .* to sleep|sleep the mac)\b/i.test(lower)) {
    reply = formatLocalResult(await dispatchTool("sleep_mac", {}));
  } else if (/^(my tasks|show my tasks|what.*(tasks|todo|to do|on my plate)|todo list)\b/i.test(lower)) {
    reply = formatLocalResult(await dispatchTool("get_tasks", { filter: "open" }));
    broadcastTasks();
  } else if (/^(remind me to|add (a )?task|put .+ on my (list|tasks))/i.test(text)) {
    const taskText = extractTaskText(text);
    if (taskText) {
      reply = formatLocalResult(await dispatchTool("add_task", { text: taskText }));
      broadcastTasks();
    }
  } else if (opts.intentHint?.type === "calendar" && opts.intentHint.confidence >= 0.95) {
    reply = formatLocalResult(await dispatchTool("get_calendar", { days: 1 }));
  }

  if (!reply) return null;
  if (!opts.skipHistory) recordLocalExchange(userInput, reply);
  return reply;
}

// ─── Main entry ──────────────────────────────────────────────────────
/**
 * Run a single turn through the brain.
 * @param {string} userInput
 * @param {{ intentHint?: object }} [opts]
 * @returns {Promise<string>} Final spoken text.
 */
export async function runBrain(userInput, opts: Record<string, any> = {}) {
  const pending = getPendingTool();
  if (pending) {
    if (isConfirmation(userInput, pending.name)) {
      auditTool({ tool: pending.name, action: "confirmed", summary: pending.summary }).catch(() => {});
      clearPendingTool();
      const result = await dispatchToolNow(pending.name, pending.input, pending.summary);
      const reply = typeof result === "string" ? result : JSON.stringify(result);
      if (!opts.skipHistory) recordExchange(userInput, reply);
      return reply;
    }
    if (isDenial(userInput)) {
      auditTool({ tool: pending.name, action: "denied", summary: pending.summary }).catch(() => {});
      clearPendingTool();
      const reply = "Cancelled.";
      if (!opts.skipHistory) recordExchange(userInput, reply);
      return reply;
    }
    const pendingState = getPendingConfirmation();
    const reply = pendingState?.risk === "destructive"
      ? `I still need exact confirmation: ${pendingState.requiredText}.`
      : `I still need a clear yes or no for: ${pending.summary}.`;
    if (!opts.skipHistory) recordExchange(userInput, reply);
    return reply;
  }

  const userName = (await safeRecall("user_name")) || process.env.GWEN_USER_NAME || "Miles";
  const userNickname = await safeRecall("user_nickname");
  const ambient = opts.skipAmbient ? null : await getAmbientContext().catch(() => null);
  const relevantBlock = await formatRelevantBlock(userInput).catch(() => "");
  const system = buildSystemPrompt({ userName, userNickname, intentHint: opts.intentHint, ambient, relevantBlock });

  const messages = [...getHistoryForTurn(), { role: "user", content: userInput }];
  const route = chooseBrainRoute(userInput, {
    intentHint: opts.intentHint,
    hasAnthropic: !!client,
    hasOllama: true,
    allowTools: !opts.noTools,
  });
  sendActivity({
    kind: "info",
    summary: `Model route: ${route.tier}`,
    detail: `${route.provider}/${route.model} — ${route.reason}${route.toolsEnabled ? " with tools" : ""}`,
  });
  logBrainRoute(route, userInput).catch(() => {});

  if (route.provider === "ollama") {
    const localSystem = buildOllamaSystemPrompt({ userName, userNickname, ambient, relevantBlock });
    const finalText = await runOllamaChat({ system: localSystem, messages, route, userInput });
    if (!opts.skipHistory) recordExchange(userInput, finalText);
    return finalText;
  }

  if (route.provider !== "anthropic" || !client) {
    return "I don't have a usable brain provider configured for that yet. Set ANTHROPIC_KEY for the smart brain, or enable an available local fallback.";
  }

  let response = await client.messages.create({
    model: route.model || MODEL,
    max_tokens: 1024,
    temperature: 0.2,
    system,
    ...(route.toolsEnabled ? { tools: TOOLS } : {}),
    messages,
  });
  logAnthropicUsage({
    model: route.model || MODEL,
    response,
    metadata: usageMetadata(route, userInput, messages, "initial"),
  }).catch(() => {});

  let turn = 0;
  const circuit = makeToolCircuit();
  while (route.toolsEnabled && response.stop_reason === "tool_use" && turn < MAX_TOOL_TURNS) {
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const result = await dispatchTool(tu.name, tu.input || {});
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (err) {
          console.error(`[brain] tool ${tu.name} failed:`, err);
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error running ${tu.name}: ${err.message}`,
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    const tripped = tripCircuit(circuit, toolUses, toolResults);
    if (tripped) {
      console.warn(`[brain] circuit breaker: ${tripped} after ${turn + 1} tool turn(s)`);
      const reply = circuitReply(toolResults, tripped);
      if (!opts.skipHistory) recordExchange(userInput, reply);
      return reply;
    }

    response = await client.messages.create({
      model: route.model || MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      system,
      tools: TOOLS,
      messages,
    });
    logAnthropicUsage({
      model: route.model || MODEL,
      response,
      metadata: usageMetadata(route, userInput, messages, `tool_turn_${turn + 1}`),
    }).catch(() => {});

    turn++;
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const finalText = textBlock ? textBlock.text : "I'm not sure how to respond to that.";
  if (!opts.skipHistory) recordExchange(userInput, finalText);
  return finalText;
}

/**
 * Streaming variant. Calls onSentence(text) for each complete sentence as it arrives.
 * Returns the full final reply text once done.
 * @param {string} userInput
 * @param {(sentence: string) => void} onSentence
 * @param {{ intentHint?: object }} [opts]
 * @returns {Promise<string>}
 */
export async function runBrainStream(userInput, onSentence = () => {}, opts: Record<string, any> = {}) {
  const pending = getPendingTool();
  if (pending) {
    if (isConfirmation(userInput, pending.name)) {
      auditTool({ tool: pending.name, action: "confirmed", summary: pending.summary }).catch(() => {});
      clearPendingTool();
      const result = await dispatchToolNow(pending.name, pending.input, pending.summary);
      const reply = typeof result === "string" ? result : JSON.stringify(result);
      onSentence(reply);
      if (!opts.skipHistory) recordExchange(userInput, reply);
      return reply;
    }
    if (isDenial(userInput)) {
      auditTool({ tool: pending.name, action: "denied", summary: pending.summary }).catch(() => {});
      clearPendingTool();
      const reply = "Cancelled.";
      onSentence(reply);
      if (!opts.skipHistory) recordExchange(userInput, reply);
      return reply;
    }
    const pendingState = getPendingConfirmation();
    const reply = pendingState?.risk === "destructive"
      ? `I still need exact confirmation: ${pendingState.requiredText}.`
      : `I still need a clear yes or no for: ${pending.summary}.`;
    onSentence(reply);
    if (!opts.skipHistory) recordExchange(userInput, reply);
    return reply;
  }

  const userName = (await safeRecall("user_name")) || process.env.GWEN_USER_NAME || "Miles";
  const userNickname = await safeRecall("user_nickname");
  const ambient = opts.skipAmbient ? null : await getAmbientContext().catch(() => null);
  const relevantBlock = await formatRelevantBlock(userInput).catch(() => "");
  const system = buildSystemPrompt({ userName, userNickname, intentHint: opts.intentHint, ambient, relevantBlock });
  const messages = [...getHistoryForTurn(), { role: "user", content: userInput }];
  const route = chooseBrainRoute(userInput, {
    intentHint: opts.intentHint,
    hasAnthropic: !!client,
    hasOllama: true,
    allowTools: !opts.noTools,
  });
  sendActivity({
    kind: "info",
    summary: `Model route: ${route.tier}`,
    detail: `${route.provider}/${route.model} — ${route.reason}${route.toolsEnabled ? " with tools" : ""}`,
  });
  logBrainRoute(route, userInput).catch(() => {});

  if (route.provider === "ollama") {
    const localSystem = buildOllamaSystemPrompt({ userName, userNickname, ambient, relevantBlock });
    const finalText = await runOllamaChat({ system: localSystem, messages, route, userInput });
    for (const sentence of finalText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [finalText]) {
      const trimmed = sentence.trim();
      if (trimmed) onSentence(trimmed);
    }
    if (!opts.skipHistory) recordExchange(userInput, finalText);
    return finalText;
  }

  if (route.provider !== "anthropic" || !client) {
    const msg = "I don't have a usable brain provider configured for that yet. Set ANTHROPIC_KEY for the smart brain, or enable an available local fallback.";
    onSentence(msg);
    if (!opts.skipHistory) recordExchange(userInput, msg);
    return msg;
  }

  let fullText = "";
  let turn = 0;
  const circuit = makeToolCircuit();

  while (turn <= MAX_TOOL_TURNS) {
    const streamOpts = {
      model: route.model || MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      system,
      messages,
    };
    if (route.toolsEnabled) streamOpts.tools = TOOLS;
    const stream = client.messages.stream(streamOpts);

    let buffer = "";
    let turnText = "";

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta"
      ) {
        const chunk = event.delta.text || "";
        buffer += chunk;
        turnText += chunk;
        const { sentences, remainder } = splitSentences(buffer);
        for (const s of sentences) if (s.trim()) onSentence(s.trim());
        buffer = remainder;
      }
    }

    const finalMessage = await stream.finalMessage();
    logAnthropicUsage({
      model: route.model || MODEL,
      response: finalMessage,
      metadata: usageMetadata(route, userInput, messages, `stream_turn_${turn}`),
    }).catch(() => {});
    fullText += turnText;

    if (buffer.trim()) {
      onSentence(buffer.trim());
      buffer = "";
    }

    if (!route.toolsEnabled || finalMessage.stop_reason !== "tool_use") {
      if (!opts.skipHistory) recordExchange(userInput, fullText);
      return fullText;
    }

    const toolUses = finalMessage.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const result = await dispatchTool(tu.name, tu.input || {});
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (err) {
          console.error(`[brain] tool ${tu.name} failed:`, err);
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error running ${tu.name}: ${err.message}`,
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "assistant", content: finalMessage.content });
    messages.push({ role: "user", content: toolResults });

    const tripped = tripCircuit(circuit, toolUses, toolResults);
    if (tripped) {
      console.warn(`[brain] circuit breaker: ${tripped} after ${turn + 1} tool turn(s)`);
      const reply = circuitReply(toolResults, tripped);
      onSentence(reply);
      const out = fullText ? `${fullText} ${reply}` : reply;
      if (!opts.skipHistory) recordExchange(userInput, out);
      return out;
    }
    turn++;
  }

  const safeText = fullText || "I'm not sure how to respond to that.";
  if (!opts.skipHistory) recordExchange(userInput, safeText);
  return safeText;
}

function splitSentences(buffer) {
  const sentences = [];
  const regex = /([.!?])(\s+|$)/g;
  let lastEnd = 0;
  let match;
  while ((match = regex.exec(buffer)) !== null) {
    if (match.index + match[0].length === buffer.length && match[2] !== "") {
      break;
    }
    sentences.push(buffer.slice(lastEnd, match.index + 1));
    lastEnd = match.index + match[0].length;
  }
  return { sentences, remainder: buffer.slice(lastEnd) };
}

async function safeRecall(key) {
  try {
    const r = await memoryTool.recall({ key });
    return typeof r === "string" ? r : (r?.value ?? null);
  } catch {
    return null;
  }
}
