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

export function sendAudioLevel(level) {
  safeSend("gwen:audio-level", Math.max(0, Math.min(1, level)));
}

export function sendCodeOutput(chunk) {
  safeSend("gwen:code-output", chunk);
}

// Lifecycle signal for the self-fix UI overlay.
// active=true → show the "rewriting myself" banner; false → hide.
export function sendSelfFix(active, label) {
  safeSend("gwen:self-fix", { active: !!active, label: label || "" });
}

// Stream a unified diff (output of `git diff`) to the self-fix overlay so the
// user can see the actual lines being changed before Gwen relaunches.
export function sendCodeDiff(diff) {
  safeSend("gwen:code-diff", String(diff || ""));
}

// Show structured tool output as a side panel (tasks, calendar, emails…).
// Pass type=null to hide the panel.
export function sendContextPanel(type, data) {
  safeSend("gwen:context-panel", { type, data });
}

// Live activity feed for the right column. Append-only event stream so the
// user can see exactly what Gwen is doing right now (file reads, tool calls,
// app launches, code edits during self-fix).
export function sendActivity(event: {
  kind: "tool_start" | "tool_done" | "tool_error" | "info" | "diff";
  tool?: string;
  summary: string;
  detail?: string;
  added?: number;
  removed?: number;
}) {
  safeSend("gwen:activity", { ...event, ts: Date.now() });
}
