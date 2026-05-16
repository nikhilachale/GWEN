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
 * Resolves the contact name to a phone/email via Contacts, then uses
 * Messages.app's AppleScript `send` command — no UI scripting, no focus games.
 * @param {{ contact: string, message: string }} input
 */
export async function sendIMessage({ contact, message } = {}) {
  if (!contact || !message) return "Need a contact and a message.";

  const handle = await resolveImessageHandle(contact);
  if (!handle) {
    return `Couldn't find a phone number or iMessage email for "${contact}" in Contacts. Try giving me the number directly.`;
  }

  const script = `tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to participant ${asAppleString(handle)} of targetService
    send ${asAppleString(message)} to targetBuddy
  end tell`;

  try {
    await runAppleScript(script);
    return `Sent iMessage to ${contact}.`;
  } catch (err) {
    return `iMessage failed: ${err.message}. Make sure Messages is signed in to iMessage and Automation permission is granted (System Settings → Privacy & Security → Automation).`;
  }
}

/**
 * Resolve a contact string to an iMessage handle (phone or email).
 * Accepts an already-formatted handle (returned as-is) or a name (looked up in Contacts).
 */
async function resolveImessageHandle(contact) {
  const trimmed = String(contact).trim();
  if (!trimmed) return null;

  // Already a phone number?
  if (/^\+?\d[\d\s\-().]{5,}$/.test(trimmed)) {
    return trimmed.replace(/[\s\-().]/g, "");
  }
  // Already an email?
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed;

  // Look it up in Contacts.
  const lookup = `tell application "Contacts"
    set matches to (every person whose name contains ${asAppleString(trimmed)})
    if (count of matches) is 0 then return ""
    set thePerson to item 1 of matches
    try
      return value of first phone of thePerson
    on error
      try
        return value of first email of thePerson
      on error
        return ""
      end try
    end try
  end tell`;

  try {
    const result = await runAppleScript(lookup);
    const cleaned = (result || "").trim();
    if (!cleaned) return null;
    // Strip formatting from a returned phone number; leave emails alone.
    return /@/.test(cleaned) ? cleaned : cleaned.replace(/[\s\-().]/g, "");
  } catch {
    return null;
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

/**
 * Scroll the currently focused window up or down via a synthesized
 * CGEvent scroll-wheel event (JXA → CoreGraphics).
 * @param {{ direction?: "up" | "down", amount?: number }} input
 */
export async function scrollMouse({ direction = "down", amount = 5 } = {}) {
  const dir = String(direction).toLowerCase();
  if (!["up", "down"].includes(dir)) return "Direction must be 'up' or 'down'.";
  const ticks = Math.max(1, Math.floor(Math.abs(Number(amount) || 5)));
  const delta = dir === "up" ? ticks : -ticks;
  const script = `ObjC.import('CoreGraphics');
var e = $.CGEventCreateScrollWheelEvent($(), 1, 1, ${delta});
$.CGEventPost(0, e);`;
  try {
    await execP(`osascript -l JavaScript -e ${shellEscape(script)}`);
    return `Scrolled ${dir} ${ticks}.`;
  } catch (err) {
    return `Couldn't scroll: ${err.message} (Accessibility permission required.)`;
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
