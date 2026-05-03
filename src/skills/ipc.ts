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
  safeSend("mj:state", state);
}

export function sendTranscript(role, text) {
  safeSend("mj:transcript", { role, text });
}

export function sendAudioLevel(level) {
  safeSend("mj:audio-level", Math.max(0, Math.min(1, level)));
}

export function sendCodeOutput(chunk) {
  safeSend("mj:code-output", chunk);
}
