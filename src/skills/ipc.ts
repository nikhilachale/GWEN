// src/skills/ipc.js — Electron IPC helpers (main process only)
// All sends are no-ops if mainWindow isn't ready, so this is safe to import early.

function safeSend(channel, payload) {
  const win = global.mainWindow;
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send(channel, payload);
  } catch (err) {
    console.debug("[ipc] send skipped:", err.message);
  }
}

export function sendState(state) {
  safeSend("gwen:state", state);
}

export function sendTranscript(role, text) {
  safeSend("gwen:transcript", { role, text });
}

export function sendConversation(conversation) {
  safeSend("gwen:conversation", conversation);
}

export function sendAudioLevel(level) {
  safeSend("gwen:audio-level", Math.max(0, Math.min(1, level)));
}

// Live stdout/stderr stream from the coding agent while Gwen rewrites or rebuilds
// herself (fix_self_code / build_software / repair_self). The SelfFixOverlay
// renders this so Miles can watch the edits happen in real time.
export function sendCodeOutput(chunk: string) {
  safeSend("gwen:code-output", chunk);
}

// The full unified `git diff HEAD` captured after a self-fix completes, so
// the overlay can show exactly which lines changed before the relaunch.
export function sendCodeDiff(diff: string) {
  safeSend("gwen:code-diff", diff);
}

// Document text Gwen just read (PDF, file) — the renderer puts this on the
// center stage so Miles can read it while she talks about it.
export function sendDoc(doc: { title: string; text: string; pages?: number }) {
  safeSend("gwen:doc", doc);
}

// Lifecycle signal for the self-fix UI overlay.
// active=true → show the "rewriting myself" banner; false → hide.
export function sendSelfFix(active, label) {
  safeSend("gwen:self-fix", { active: !!active, label: label || "" });
}

// Show structured tool output as a side panel (tasks, calendar, emails…).
// Pass type=null to hide the panel.
export function sendContextPanel(type, data) {
  safeSend("gwen:context-panel", { type, data });
}

// Live activity feed for the right column. Append-only event stream so the
// user can see exactly what Gwen is doing right now (file reads, tool calls,
// app launches).
export function sendActivity(event: {
  kind: "tool_start" | "tool_done" | "tool_error" | "info";
  tool?: string;
  summary: string;
  detail?: string;
}) {
  safeSend("gwen:activity", { ...event, ts: Date.now() });
}
