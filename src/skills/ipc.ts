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

// Show structured tool output as a side panel (tasks, calendar, emails…).
// Pass type=null to hide the panel.
export function sendContextPanel(type, data) {
  safeSend("gwen:context-panel", { type, data });
}
