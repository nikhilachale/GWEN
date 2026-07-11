// src/core/conversationManager.ts — Conversation CRUD, history, and persistence
import { readFile, writeFile, mkdir, access, unlink } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../skills/projectRoot.js";
import { SELF_RESTART_MARKER } from "../skills/relaunch.js";
import { sendConversation } from "../skills/ipc.js";
import { recordConversationExchange } from "../skills/conversationJournal.js";

const MAX_STORED_MESSAGES = 200;
const CONV_PATH = path.join(PROJECT_ROOT, "data/conversations.json");

export interface ConversationMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  ts?: number;
  createdAt?: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  history: ConversationMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  pinned: boolean;
  preview: string;
  count: number;
  active: boolean;
}

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string;
  conversationHistory: ConversationMessage[];
  lastTurnAt: number;
  resumedOnLoad: boolean;
}

let state: ConversationState = {
  conversations: [],
  activeConversationId: "",
  conversationHistory: [],
  lastTurnAt: 0,
  resumedOnLoad: false,
};

function makeId(prefix = "msg") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeMessage(message: ConversationMessage, fallbackTs = Date.now()): ConversationMessage {
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

function previewFromHistory(history: ConversationMessage[] = []): string {
  const last = [...history]
    .reverse()
    .find((m) => typeof m?.content === "string" && m.content.trim());
  return last ? last.content.replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

export function normalizeConversation(conversation: Partial<Conversation>): Conversation {
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

function makeConversation(title = "New conversation"): Conversation {
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

function titleFromText(text: string): string {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!cleaned) return "New conversation";
  const words = cleaned.split(" ").slice(0, 7).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function activeConversation(): Conversation {
  let conv = state.conversations.find((c) => c.id === state.activeConversationId);
  if (!conv) {
    conv = makeConversation();
    state.conversations.unshift(conv);
    state.activeConversationId = conv.id;
  }
  return conv;
}

function syncActiveHistory() {
  const conv = activeConversation();
  state.conversationHistory = Array.isArray(conv.history)
    ? conv.history.map((m, i) => normalizeMessage(m, (conv.updatedAt || Date.now()) + i))
    : [];
  conv.history = state.conversationHistory;
  state.lastTurnAt = conv.updatedAt || 0;
}

export async function persistConversation() {
  try {
    await mkdir(path.dirname(CONV_PATH), { recursive: true });
    await writeFile(
      CONV_PATH,
      JSON.stringify({ activeId: state.activeConversationId, conversations: state.conversations }, null, 2)
    );
  } catch (err) {
    console.warn("[conversationManager] persist failed:", err);
  }
}

function publishConversation() {
  sendConversation(getCurrentConversation());
}

function summarizeConversations(list: Conversation[]): ConversationSummary[] {
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
      active: c.id === state.activeConversationId,
    }));
}

export async function recordExchange(userInput: string, assistantText: string, source: "text" | "local" = "text") {
  const conv = activeConversation();
  if (!conv.title || conv.title === "New conversation") conv.title = titleFromText(userInput);
  const now = Date.now();
  state.conversationHistory.push(normalizeMessage({ role: "user", content: userInput, ts: now }, now));
  state.conversationHistory.push(normalizeMessage({ role: "assistant", content: assistantText, ts: now + 1 }, now + 1));
  if (state.conversationHistory.length > MAX_STORED_MESSAGES) {
    state.conversationHistory = state.conversationHistory.slice(-MAX_STORED_MESSAGES);
  }
  state.lastTurnAt = Date.now();
  conv.history = state.conversationHistory;
  conv.updatedAt = state.lastTurnAt;
  await persistConversation();
  try {
    await recordConversationExchange({
      conversationId: conv.id,
      conversationTitle: conv.title,
      userText: userInput,
      assistantText,
      occurredAt: now,
      source,
    });
  } catch (err: any) {
    console.warn("[conversationManager] sqlite journal failed:", err?.message || err);
  }
  publishConversation();
}

export function getHistoryForTurn(maxMessages: number = 20, idleResetMs: number = 5 * 60_000): Array<{ role: string; content: string }> {
  const history = state.conversationHistory
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));
  if (state.lastTurnAt && Date.now() - state.lastTurnAt > idleResetMs) {
    return history.slice(-maxMessages);
  }
  return history.slice(-maxMessages);
}

// Public API
export function wasResumed(): boolean {
  return state.resumedOnLoad;
}

export function resetConversation() {
  const conv = activeConversation();
  state.conversationHistory = [];
  conv.history = [];
  conv.updatedAt = Date.now();
  state.lastTurnAt = 0;
  persistConversation();
  publishConversation();
}

export function clearCurrentConversation(): Conversation {
  resetConversation();
  return getCurrentConversation();
}

export function listConversations(): ConversationSummary[] {
  return summarizeConversations(state.conversations);
}

export function searchConversations(query = ""): ConversationSummary[] {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return listConversations();
  return summarizeConversations(
    state.conversations.filter((c) => {
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

export function getCurrentConversation(): Conversation {
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

export function newConversation(title = "New conversation"): Conversation {
  const conv = makeConversation(title);
  state.conversations.unshift(conv);
  state.activeConversationId = conv.id;
  syncActiveHistory();
  persistConversation();
  publishConversation();
  return getCurrentConversation();
}

export function switchConversation(id: string): Conversation {
  if (!state.conversations.some((c) => c.id === id)) return getCurrentConversation();
  state.activeConversationId = id;
  syncActiveHistory();
  persistConversation();
  publishConversation();
  return getCurrentConversation();
}

export function renameConversation(id: string, title: string): Conversation {
  const conv = state.conversations.find((c) => c.id === id);
  const nextTitle = String(title || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!conv || !nextTitle) return getCurrentConversation();
  conv.title = nextTitle;
  conv.updatedAt = Date.now();
  persistConversation();
  if (conv.id === state.activeConversationId) publishConversation();
  return getCurrentConversation();
}

export function pinConversation(id: string, pinned = true): Conversation {
  const conv = state.conversations.find((c) => c.id === id);
  if (!conv) return getCurrentConversation();
  conv.pinned = !!pinned;
  conv.updatedAt = Date.now();
  persistConversation();
  if (conv.id === state.activeConversationId) publishConversation();
  return getCurrentConversation();
}

export function deleteConversation(id: string): Conversation {
  if (!state.conversations.some((c) => c.id === id)) return getCurrentConversation();
  state.conversations = state.conversations.filter((c) => c.id !== id);
  if (!state.conversations.length) state.conversations = [makeConversation()];
  if (state.activeConversationId === id) {
    state.activeConversationId = state.conversations
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

// Initialize on load
export async function initConversationManager(): Promise<void> {
  let isSelfRestart = false;
  try {
    await access(SELF_RESTART_MARKER);
    isSelfRestart = true;
    await unlink(SELF_RESTART_MARKER).catch(() => {});
  } catch {
    // no marker = manual launch
  }

  try {
    const raw = await readFile(CONV_PATH, "utf8");
    const saved = JSON.parse(raw);
    state.conversations = Array.isArray(saved?.conversations)
      ? saved.conversations.map(normalizeConversation)
      : [];
    state.activeConversationId = typeof saved?.activeId === "string" ? saved.activeId : "";
    if (!state.conversations.length) {
      const conv = makeConversation();
      state.conversations = [conv];
      state.activeConversationId = conv.id;
    }
    syncActiveHistory();
    state.resumedOnLoad = isSelfRestart && !!state.conversationHistory.length;
    console.log(`[conversationManager] loaded ${state.conversations.length} conversation(s)`);
  } catch {
    const conv = makeConversation();
    state.conversations = [conv];
    state.activeConversationId = conv.id;
    syncActiveHistory();

    // One-time migration from the old single conversation file.
    try {
      const raw = await readFile(path.join(PROJECT_ROOT, "data/conversation.json"), "utf8");
      const saved = JSON.parse(raw);
      if (Array.isArray(saved?.history) && saved.history.length) {
        state.conversations[0].title = "Previous Gwen chat";
        state.conversations[0].history = saved.history
          .slice(-MAX_STORED_MESSAGES)
          .map((m, i) => normalizeMessage(m, (saved.savedAt || Date.now()) + i));
        state.conversations[0].updatedAt = saved.savedAt || Date.now();
        syncActiveHistory();
      }
    } catch {
      // Migration failed, start fresh
    }
  }
}
