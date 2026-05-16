// src/skills/ambientContext.ts — passive context: active app, window title,
// recent clipboard. Injected into the system prompt every turn so Gwen knows
// what the user is looking at without spending a tool call.
//
// Privacy: clipboard is dropped if it looks like a secret, is too long, or if
// GWEN_AMBIENT_CLIPBOARD=0. Active app/title are always read.

const CACHE_MS = 5_000;
const CLIPBOARD_MAX = 500;
const TITLE_MAX = 80;

const SECRET_RE = [
  /\bsk-[a-z0-9_-]{16,}/i,            // API keys (Anthropic, OpenAI, etc.)
  /\bBearer\s+[A-Za-z0-9._-]{16,}/,   // bearer tokens
  /-----BEGIN [A-Z ]+-----/,          // PEM blocks
  /[A-Za-z0-9+/]{60,}={0,2}/,         // long base64-ish blobs
];

const CLIPBOARD_ENABLED = process.env.GWEN_AMBIENT_CLIPBOARD !== "0";

let cached = null;
let cachedAt = 0;
let _clipboard = undefined; // undefined=unloaded, null=unavailable

async function getClipboardModule() {
  if (_clipboard !== undefined) return _clipboard;
  try {
    const electron = await import("electron");
    _clipboard = electron.clipboard ?? null;
  } catch {
    _clipboard = null;
  }
  return _clipboard;
}

export async function getAmbientContext() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;

  const [winInfo, clip] = await Promise.all([
    getActiveWindow(),
    readClipboardSafely(),
  ]);

  cached = {
    activeApp: winInfo.app,
    windowTitle: winInfo.title,
    clipboard: clip,
  };
  cachedAt = now;
  return cached;
}

export function formatAmbientForPrompt(ambient) {
  if (!ambient) return "";
  const parts = [];
  if (ambient.activeApp && ambient.activeApp !== "unknown") {
    parts.push(`app="${ambient.activeApp}"`);
  }
  if (ambient.windowTitle) {
    const t = ambient.windowTitle.length > TITLE_MAX
      ? ambient.windowTitle.slice(0, TITLE_MAX) + "…"
      : ambient.windowTitle;
    parts.push(`window="${t}"`);
  }
  if (ambient.clipboard) {
    const c = ambient.clipboard.replace(/\s+/g, " ").trim();
    parts.push(`clipboard="${c}"`);
  }
  if (parts.length === 0) return "";
  return `\n\nPassive context (what the user is looking at right now — may or may not be relevant): ${parts.join(" ")}. Use this only if the user's request implicitly refers to it (e.g. "what is this", "summarize this", "fix this"). Do not narrate it.`;
}

async function getActiveWindow() {
  try {
    const { default: activeWin } = await import("active-win");
    const win = await activeWin();
    return {
      app: win?.owner?.name ?? "unknown",
      title: win?.title ?? "",
    };
  } catch {
    return { app: "unknown", title: "" };
  }
}

async function readClipboardSafely() {
  if (!CLIPBOARD_ENABLED) return null;
  const clip = await getClipboardModule();
  if (!clip) return null;
  try {
    const text = clip.readText() || "";
    if (!text.trim()) return null;
    if (text.length > CLIPBOARD_MAX) return null;
    if (SECRET_RE.some((re) => re.test(text))) return null;
    return text;
  } catch {
    return null;
  }
}
