// src/tools/system.js — macOS system controls (volume, brightness, Wi-Fi,
// Bluetooth, dark mode, lock, sleep, battery). Pure built-ins where possible;
// Bluetooth requires the optional `blueutil` CLI.
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

// ─── Volume ──────────────────────────────────────────────────────────

/**
 * Control system output volume.
 * @param {{ level?: number, action?: "up"|"down"|"mute"|"unmute"|"toggle_mute" }} input
 */
export async function setVolume({ level, action } = {}) {
  try {
    if (action === "mute") {
      await runAppleScript(`set volume with output muted`);
      return "Muted.";
    }
    if (action === "unmute") {
      await runAppleScript(`set volume without output muted`);
      return "Unmuted.";
    }
    if (action === "toggle_mute") {
      const muted = await runAppleScript(`output muted of (get volume settings)`);
      const next = muted.trim() === "true" ? "without" : "with";
      await runAppleScript(`set volume ${next} output muted`);
      return next === "with" ? "Muted." : "Unmuted.";
    }
    if (action === "up" || action === "down") {
      const current = parseInt(
        await runAppleScript(`output volume of (get volume settings)`),
        10
      ) || 0;
      const next = clamp(current + (action === "up" ? 10 : -10), 0, 100);
      await runAppleScript(`set volume output volume ${next}`);
      return `Volume ${action === "up" ? "up to" : "down to"} ${next} percent.`;
    }
    if (typeof level === "number") {
      const v = clamp(Math.round(level), 0, 100);
      await runAppleScript(`set volume output volume ${v}`);
      return `Volume set to ${v} percent.`;
    }
    return "Tell me a level (0–100) or up/down/mute/unmute.";
  } catch (err) {
    return `Couldn't change volume: ${err.message}`;
  }
}

export async function getVolume() {
  try {
    const v = await runAppleScript(`output volume of (get volume settings)`);
    const m = await runAppleScript(`output muted of (get volume settings)`);
    const muted = m.trim() === "true";
    return muted ? `Muted (was ${v.trim()} percent).` : `Volume is at ${v.trim()} percent.`;
  } catch (err) {
    return `Couldn't read volume: ${err.message}`;
  }
}

// ─── Brightness ──────────────────────────────────────────────────────

/**
 * Adjust display brightness. macOS doesn't expose absolute brightness without
 * a helper CLI, so this only supports up/down via the standard key codes.
 * For absolute levels, create a Shortcut and call run_shortcut.
 * @param {{ action: "up"|"down" }} input
 */
export async function setBrightness({ action } = {}) {
  if (action !== "up" && action !== "down") {
    return "Brightness action must be 'up' or 'down'. For an exact level, use a Shortcut.";
  }
  const keyCode = action === "up" ? 144 : 145;
  try {
    await runAppleScript(`tell application "System Events" to key code ${keyCode}`);
    return `Brightness ${action}.`;
  } catch (err) {
    return `Couldn't change brightness: ${err.message}`;
  }
}

// ─── Wi-Fi ───────────────────────────────────────────────────────────

/**
 * Turn Wi-Fi on, off, or toggle.
 * @param {{ on?: boolean }} input
 */
export async function toggleWifi({ on } = {}) {
  try {
    const device = await getWifiDevice();
    let state;
    if (on === undefined) {
      const { stdout } = await execP(`networksetup -getairportpower ${device}`);
      state = /On$/.test(stdout.trim()) ? "off" : "on";
    } else {
      state = on ? "on" : "off";
    }
    await execP(`networksetup -setairportpower ${device} ${state}`);
    return `Wi-Fi turned ${state}.`;
  } catch (err) {
    return `Couldn't change Wi-Fi: ${err.message}`;
  }
}

async function getWifiDevice() {
  const { stdout } = await execP(`networksetup -listallhardwareports`);
  const match = stdout.match(/Hardware Port: Wi-Fi\s+Device:\s+(\S+)/);
  return match ? match[1] : "en0";
}

// ─── Bluetooth ───────────────────────────────────────────────────────

/**
 * Turn Bluetooth on, off, or toggle. Requires `blueutil` (brew install blueutil).
 * Falls back gracefully if missing.
 * @param {{ on?: boolean }} input
 */
export async function toggleBluetooth({ on } = {}) {
  try {
    await execP(`command -v blueutil`);
  } catch {
    return "Bluetooth control needs blueutil. Run: brew install blueutil. Or create a Shortcut and use run_shortcut.";
  }
  try {
    let target;
    if (on === undefined) {
      const { stdout } = await execP(`blueutil -p`);
      target = stdout.trim() === "1" ? 0 : 1;
    } else {
      target = on ? 1 : 0;
    }
    await execP(`blueutil -p ${target}`);
    return `Bluetooth turned ${target === 1 ? "on" : "off"}.`;
  } catch (err) {
    return `Couldn't change Bluetooth: ${err.message}`;
  }
}

// ─── Dark mode ───────────────────────────────────────────────────────

/**
 * Toggle or set macOS dark mode.
 * @param {{ on?: boolean }} input
 */
export async function toggleDarkMode({ on } = {}) {
  try {
    const expr =
      on === undefined
        ? `set dark mode to not dark mode`
        : `set dark mode to ${on ? "true" : "false"}`;
    await runAppleScript(
      `tell application "System Events" to tell appearance preferences to ${expr}`
    );
    return on === undefined
      ? "Toggled appearance."
      : on
        ? "Dark mode on."
        : "Light mode on.";
  } catch (err) {
    return `Couldn't change appearance: ${err.message}`;
  }
}

// ─── Power ───────────────────────────────────────────────────────────

export async function lockScreen() {
  try {
    await execP(`pmset displaysleepnow`);
    return "Locked.";
  } catch (err) {
    return `Couldn't lock: ${err.message}`;
  }
}

export async function sleepMac() {
  try {
    await execP(`pmset sleepnow`);
    return "Sleeping.";
  } catch (err) {
    return `Couldn't sleep: ${err.message}`;
  }
}

export async function getBattery() {
  try {
    const { stdout } = await execP(`pmset -g batt`);
    const pct = stdout.match(/(\d+)%/)?.[1];
    const charging = /AC Power/i.test(stdout) || /charging/i.test(stdout);
    const remaining = stdout.match(/(\d+:\d+) remaining/)?.[1];
    if (!pct) return stdout.trim().split("\n")[0] || "No battery info.";
    if (charging) return `Battery at ${pct} percent, charging.`;
    if (remaining) return `Battery at ${pct} percent, about ${remaining} remaining.`;
    return `Battery at ${pct} percent.`;
  } catch (err) {
    return `Couldn't read battery: ${err.message}`;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e ${shellEscape(script)}`, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

function shellEscape(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}
