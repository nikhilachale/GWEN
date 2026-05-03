// src/tools/macControl.js — open Mac apps, type text, send messages.
// macOS only. Requires Accessibility permission for `type_text`/`send_*`
// (System Settings → Privacy & Security → Accessibility → enable Terminal/Electron).
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

// Friendly aliases → real macOS app names. Extend as needed.
const APP_ALIASES = {
  browser: "Safari",
  chrome: "Google Chrome",
  code: "Visual Studio Code",
  vscode: "Visual Studio Code",
  terminal: "Terminal",
  messages: "Messages",
  imessage: "Messages",
  whatsapp: "WhatsApp",
  slack: "Slack",
  notes: "Notes",
  reminders: "Reminders",
  calendar: "Calendar",
  mail: "Mail",
  spotify: "Spotify",
  music: "Music",
  finder: "Finder",
};

function resolveApp(name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return APP_ALIASES[key] || name.trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Open a Mac application by name.
 * @param {{ name: string, path?: string }} input
 */
export async function openApp({ name, path } = {}) {
  if (!name && !path) return "Tell me which app to open.";
  const app = resolveApp(name);
  try {
    if (path) {
      await execP(`open -a ${shellEscape(app)} ${shellEscape(path)}`);
      return `Opened ${path} in ${app}.`;
    }
    await execP(`open -a ${shellEscape(app)}`);
    return `Opened ${app}.`;
  } catch (err) {
    return `Couldn't open ${app}: ${err.message}`;
  }
}

/**
 * Type text into the currently focused app. Optionally open an app first.
 * @param {{ text: string, app?: string, pressEnter?: boolean, focusDelayMs?: number }} input
 */
export async function typeText({ text, app, pressEnter = false, focusDelayMs = 600 } = {}) {
  if (!text) return "Nothing to type.";
  if (app) {
    await openApp({ name: app });
    await sleep(focusDelayMs);
  }
  try {
    await runAppleScript(`tell application "System Events" to keystroke ${asAppleString(text)}`);
    if (pressEnter) {
      await sleep(120);
      await runAppleScript(`tell application "System Events" to key code 36`);
    }
    return `Typed${app ? ` into ${resolveApp(app)}` : ""}.`;
  } catch (err) {
    return `Couldn't type: ${err.message} (Accessibility permission required.)`;
  }
}

/**
 * Send an iMessage to a contact via the Messages app.
 * @param {{ contact: string, message: string }} input
 */
export async function sendIMessage({ contact, message } = {}) {
  if (!contact || !message) return "Need a contact and a message.";
  await openApp({ name: "Messages" });
  await sleep(700);
  try {
    // ⌘N → new message → type contact → Tab → type body → Enter
    await runAppleScript(`tell application "System Events"
      keystroke "n" using {command down}
      delay 0.4
      keystroke ${asAppleString(contact)}
      delay 0.6
      key code 36
      delay 0.3
      key code 48
      delay 0.2
      keystroke ${asAppleString(message)}
      delay 0.2
      key code 36
    end tell`);
    return `Sent iMessage to ${contact}.`;
  } catch (err) {
    return `iMessage failed: ${err.message}`;
  }
}

/**
 * Draft + send a WhatsApp message via keystroke automation.
 * Opens WhatsApp Desktop, finds the contact, sends the message.
 * @param {{ contact: string, message: string, draftOnly?: boolean }} input
 */
export async function sendWhatsApp({ contact, message, draftOnly = false } = {}) {
  if (!contact || !message) return "Need a contact and a message.";
  await openApp({ name: "WhatsApp" });
  await sleep(1200);
  try {
    await runAppleScript(`tell application "System Events"
      keystroke "f" using {command down}
      delay 0.4
      keystroke ${asAppleString(contact)}
      delay 0.7
      key code 36
      delay 0.4
      keystroke ${asAppleString(message)}
    end tell`);
    if (!draftOnly) {
      await sleep(200);
      await runAppleScript(`tell application "System Events" to key code 36`);
      return `Sent WhatsApp to ${contact}.`;
    }
    return `Drafted WhatsApp to ${contact}. Hit enter to send.`;
  } catch (err) {
    return `WhatsApp failed: ${err.message}`;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    const child = exec(`osascript -e ${shellEscape(script)}`, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
    child.on("error", reject);
  });
}

function asAppleString(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function shellEscape(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}
