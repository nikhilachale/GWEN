// src/core/brain.js — Claude orchestrator + tool-use loop
import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../skills/projectRoot.js";

import * as calendarTool from "../tools/calendar.js";
import * as emailTool    from "../tools/email.js";
import * as searchTool   from "../tools/search.js";
import * as tasksTool    from "../tools/tasks.js";
import * as notesTool    from "../tools/notes.js";
import * as memoryTool   from "../tools/memory.js";
import * as dayPlanTool  from "../tools/dayplan.js";
import * as codegenTool  from "../tools/codegen.js";
import * as selfFixTool  from "../tools/selfFix.js";
import * as repairSelfTool from "../tools/repairSelf.js";
import * as macTool      from "../tools/macControl.js";
import * as filesTool    from "../tools/files.js";
import * as systemTool   from "../tools/system.js";
import * as shortcutsTool from "../tools/shortcuts.js";
import * as musicTool    from "../tools/music.js";
import * as remindersTool from "../tools/reminders.js";
import * as appleNotesTool from "../tools/appleNotes.js";
import * as mapsTool     from "../tools/maps.js";
import * as callsTool    from "../tools/calls.js";
import * as timersTool   from "../tools/timers.js";
import * as weatherTool  from "../tools/weather.js";
import * as screenCore   from "./screen.js";

const MODEL = process.env.GWEN_BRAIN_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_TURNS = 8;

// Conversation context: keep the last N user/assistant text exchanges so Gwen
// can answer follow-ups like "and tomorrow?" or "what about the second one?".
// Tool calls/results are dropped from history to keep token cost flat.
const MAX_HISTORY_MESSAGES = 20;            // 10 user/assistant pairs
const CONTEXT_IDLE_RESET_MS = 5 * 60_000;   // wipe after 5 min idle

// Persist history so a self-fix relaunch can resume the conversation.
// Same idle threshold applies: a fresh session after an hour starts clean.
const CONV_PATH = path.join(PROJECT_ROOT, "data/conversation.json");

let conversationHistory = [];
let lastTurnAt = 0;
let resumedOnLoad = false;

try {
  const raw = await readFile(CONV_PATH, "utf8");
  const saved = JSON.parse(raw);
  if (
    Array.isArray(saved?.history) &&
    typeof saved.savedAt === "number" &&
    Date.now() - saved.savedAt < CONTEXT_IDLE_RESET_MS
  ) {
    conversationHistory = saved.history;
    lastTurnAt = saved.savedAt;
    resumedOnLoad = true;
    console.log(`[brain] resumed conversation (${saved.history.length} msgs)`);
  }
} catch {} // first launch or corrupt file — start fresh

export function wasResumed() {
  return resumedOnLoad;
}

async function persistConversation() {
  try {
    await mkdir(path.dirname(CONV_PATH), { recursive: true });
    await writeFile(
      CONV_PATH,
      JSON.stringify({ savedAt: lastTurnAt, history: conversationHistory })
    );
  } catch (err) {
    console.warn("[brain] conversation persist failed:", err.message);
  }
}

export function resetConversation() {
  conversationHistory = [];
  lastTurnAt = 0;
  persistConversation();
}

function getHistoryForTurn() {
  if (lastTurnAt && Date.now() - lastTurnAt > CONTEXT_IDLE_RESET_MS) {
    conversationHistory = [];
  }
  return conversationHistory;
}

function recordExchange(userInput, assistantText) {
  conversationHistory.push({ role: "user", content: userInput });
  conversationHistory.push({ role: "assistant", content: assistantText });
  if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  }
  lastTurnAt = Date.now();
  persistConversation();
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ─── Tool definitions ────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_calendar",
    description: "Get upcoming events from the macOS Calendar.app for the next N days. Reads all local accounts (iCloud, Google, Exchange) — no OAuth needed.",
    input_schema: {
      type: "object",
      properties: {
        days:  { type: "number", description: "How many days ahead. Default 1." },
        query: { type: "string", description: "Optional keyword filter." },
      },
    },
  },
  {
    name: "get_emails",
    description: "Get unread Gmail messages. Read-only.",
    input_schema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Max unread to fetch. Default 5." },
        from:  { type: "string", description: "Sender filter." },
        query: { type: "string", description: "Gmail search query." },
      },
    },
  },
  {
    name: "search_web",
    description: "Search the web for current info.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        count: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "add_task",
    description: "Add a task or reminder.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        due:  { type: "string", description: "Natural language, e.g. 'tomorrow at 3pm'." },
      },
      required: ["text"],
    },
  },
  {
    name: "get_tasks",
    description: "List tasks.",
    input_schema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["all", "today", "overdue", "open"] },
      },
    },
  },
  {
    name: "save_note",
    description: "Save a freeform note as markdown.",
    input_schema: {
      type: "object",
      properties: {
        title:   { type: "string" },
        content: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "get_notes",
    description: "List or search saved notes.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
    },
  },
  {
    name: "remember",
    description: "Store a fact or preference in long-term memory.",
    input_schema: {
      type: "object",
      properties: {
        key:      { type: "string" },
        value:    { type: "string" },
        category: { type: "string" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "recall",
    description: "Retrieve a stored memory by key.",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    name: "get_day_plan",
    description: "Generate the morning briefing combining calendar, tasks, and memory.",
    input_schema: {
      type: "object",
      properties: {
        tone: { type: "string", enum: ["briefing", "casual", "motivational"] },
      },
    },
  },
  {
    name: "build_software",
    description: "Spawn Claude Code to build software based on a description.",
    input_schema: {
      type: "object",
      properties: {
        request:   { type: "string" },
        dir:       { type: "string" },
        framework: { type: "string" },
      },
      required: ["request"],
    },
  },
  {
    name: "fix_self_code",
    description: "Fix or modify Gwen's own source code by spawning Claude Code inside this project. Use when the user reports a bug in Gwen herself, asks you to change your own behavior, or asks to add/tweak a feature in your code. Always confirm the change in one sentence and wait for approval before calling. After a successful fix, Gwen automatically restarts herself so the change loads — conversation history is preserved.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "What to fix or change. Be specific — name the symptom and any relevant file/function if known.",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Optional paths to focus on, relative to project root.",
        },
        relaunch: {
          type: "boolean",
          description: "Restart the app after a successful fix so the change loads. Defaults to true. Pass false only if the user asks you not to restart.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "repair_self",
    description: "Run a maintenance command on Gwen's own install (rebuild native modules, reinstall dependencies, clear build cache). Use this when Gwen herself fails to start a feature due to an env/build issue — e.g. better-sqlite3 ABI mismatch, missing module after a dependency change, stale build output. Distinct from fix_self_code, which edits source. Always confirm with the user before calling.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["rebuild_electron", "npm_install", "clear_cache"],
          description: "rebuild_electron: rebuild native modules against Electron's ABI (fixes better-sqlite3 errors). npm_install: reinstall node_modules. clear_cache: remove dist/dist-electron/vite cache.",
        },
        relaunch: {
          type: "boolean",
          description: "Restart Gwen after the command finishes. Defaults to the action's recommended setting.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_screen_context",
    description: "Capture and describe the user's current screen.",
    input_schema: {
      type: "object",
      properties: {
        focus: { type: "string" },
      },
    },
  },
  {
    name: "open_app",
    description: "Open a Mac application by name (e.g. 'Safari', 'WhatsApp', 'code'). Use friendly names — aliases are resolved automatically.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "App name or alias." },
        path: { type: "string", description: "Optional file or URL to open inside the app." },
      },
      required: ["name"],
    },
  },
  {
    name: "type_text",
    description: "Type text into the currently focused Mac app. Optionally focus an app first. Requires Accessibility permission.",
    input_schema: {
      type: "object",
      properties: {
        text:       { type: "string" },
        app:        { type: "string", description: "Optional app to focus before typing." },
        pressEnter: { type: "boolean", description: "Press Return after typing. Default false." },
      },
      required: ["text"],
    },
  },
  {
    name: "send_imessage",
    description: "Send an iMessage to a contact via the macOS Messages app. Confirm with the user before sending.",
    input_schema: {
      type: "object",
      properties: {
        contact: { type: "string", description: "Contact name, phone number, or email." },
        message: { type: "string" },
      },
      required: ["contact", "message"],
    },
  },
  {
    name: "send_whatsapp",
    description: "Send a WhatsApp message via WhatsApp Desktop. Confirm with the user before sending. Set draftOnly to leave the user to press send.",
    input_schema: {
      type: "object",
      properties: {
        contact:   { type: "string" },
        message:   { type: "string" },
        draftOnly: { type: "boolean", description: "If true, type message but don't press send. Default false." },
      },
      required: ["contact", "message"],
    },
  },
  {
    name: "list_files",
    description: "List files and folders at a path on the user's Mac. Accepts shortcuts like 'desktop', 'downloads', 'documents', 'home', or any absolute/tilde path. Defaults to Desktop. Hidden files (.*) excluded.",
    input_schema: {
      type: "object",
      properties: {
        path:        { type: "string", description: "Path or shortcut. Default 'desktop'." },
        foldersOnly: { type: "boolean", description: "Only return folders. Default false." },
        limit:       { type: "number", description: "Max entries to return. Default 50." },
      },
    },
  },
  {
    name: "open_path",
    description: "Open a file or folder in Finder (or its default app). Set reveal=true to highlight it in Finder instead of opening it.",
    input_schema: {
      type: "object",
      properties: {
        path:   { type: "string", description: "Path or shortcut (e.g. 'desktop', '~/Downloads', or absolute path)." },
        reveal: { type: "boolean", description: "Reveal in Finder instead of opening. Default false." },
      },
      required: ["path"],
    },
  },
  {
    name: "set_volume",
    description: "Control system output volume. Use level (0-100) for absolute, or action: 'up'/'down'/'mute'/'unmute'/'toggle_mute'.",
    input_schema: {
      type: "object",
      properties: {
        level:  { type: "number", description: "Absolute level 0–100." },
        action: { type: "string", enum: ["up", "down", "mute", "unmute", "toggle_mute"] },
      },
    },
  },
  {
    name: "get_volume",
    description: "Read current system output volume and mute state.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_brightness",
    description: "Step display brightness up or down. For an exact level, use run_shortcut with a Brightness shortcut.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["up", "down"] },
      },
      required: ["action"],
    },
  },
  {
    name: "toggle_wifi",
    description: "Turn Wi-Fi on, off, or toggle. Omit 'on' to toggle.",
    input_schema: {
      type: "object",
      properties: { on: { type: "boolean" } },
    },
  },
  {
    name: "toggle_bluetooth",
    description: "Turn Bluetooth on, off, or toggle. Requires the blueutil CLI.",
    input_schema: {
      type: "object",
      properties: { on: { type: "boolean" } },
    },
  },
  {
    name: "toggle_dark_mode",
    description: "Switch macOS appearance. Omit 'on' to toggle.",
    input_schema: {
      type: "object",
      properties: { on: { type: "boolean" } },
    },
  },
  {
    name: "lock_screen",
    description: "Lock the Mac screen.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "sleep_mac",
    description: "Put the Mac to sleep.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_battery",
    description: "Get battery percentage and charging state.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "run_shortcut",
    description: "Run a macOS Shortcut by name. Use this for HomeKit, Focus modes, custom automations, and anything in the user's Shortcuts app. Optionally pass text input.",
    input_schema: {
      type: "object",
      properties: {
        name:  { type: "string", description: "Exact shortcut name." },
        input: { type: "string", description: "Optional text input passed to the shortcut." },
      },
      required: ["name"],
    },
  },
  {
    name: "list_shortcuts",
    description: "List installed macOS Shortcuts. Optionally filter by substring.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional name filter." },
      },
    },
  },
  {
    name: "music_control",
    description: "Play, pause, skip, go back, or stop in Apple Music or Spotify.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["play", "pause", "playpause", "next", "previous", "stop"] },
        app:    { type: "string", enum: ["music", "spotify"], description: "Default music." },
      },
      required: ["action"],
    },
  },
  {
    name: "music_play",
    description: "Search the Apple Music library for a track/album/artist and start playing it.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "music_now_playing",
    description: "What is currently playing in Apple Music or Spotify.",
    input_schema: {
      type: "object",
      properties: { app: { type: "string", enum: ["music", "spotify"] } },
    },
  },
  {
    name: "add_reminder",
    description: "Add a reminder to the macOS Reminders.app (iCloud-synced). Distinct from add_task which uses Gwen's local store. Use this when the user says 'remind me'.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        due:  { type: "string", description: "Natural language date/time, e.g. 'tomorrow 9am'." },
        list: { type: "string", description: "Reminders list name. Default 'Reminders'." },
      },
      required: ["text"],
    },
  },
  {
    name: "list_reminders",
    description: "List reminders from a Reminders.app list.",
    input_schema: {
      type: "object",
      properties: {
        list:             { type: "string" },
        includeCompleted: { type: "boolean" },
        limit:            { type: "number" },
      },
    },
  },
  {
    name: "create_apple_note",
    description: "Create a note in macOS Notes.app (iCloud-synced). Distinct from save_note which writes a local markdown file.",
    input_schema: {
      type: "object",
      properties: {
        title:  { type: "string" },
        body:   { type: "string" },
        folder: { type: "string", description: "Optional folder name." },
      },
      required: ["title"],
    },
  },
  {
    name: "search_apple_notes",
    description: "Search Notes.app titles and bodies.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_directions",
    description: "Open Apple Maps with directions to a destination.",
    input_schema: {
      type: "object",
      properties: {
        to:   { type: "string" },
        from: { type: "string", description: "Optional starting point. Defaults to current location." },
        mode: { type: "string", enum: ["driving", "walking", "transit"] },
      },
      required: ["to"],
    },
  },
  {
    name: "search_maps",
    description: "Search Apple Maps for a place.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "facetime",
    description: "Start a FaceTime video or audio call. Confirm with the user first.",
    input_schema: {
      type: "object",
      properties: {
        contact: { type: "string", description: "Phone number, email, or Apple ID." },
        audio:   { type: "boolean", description: "Audio-only. Default false." },
      },
      required: ["contact"],
    },
  },
  {
    name: "call_phone",
    description: "Place a phone call via iPhone Continuity. Requires a paired iPhone with Calls on Other Devices enabled. Confirm with the user first.",
    input_schema: {
      type: "object",
      properties: {
        number: { type: "string", description: "Phone number, ideally in E.164 format (+15551234567)." },
      },
      required: ["number"],
    },
  },
  {
    name: "set_timer",
    description: "Start a countdown timer. Gwen will play a notification when it fires.",
    input_schema: {
      type: "object",
      properties: {
        minutes: { type: "number" },
        seconds: { type: "number" },
        label:   { type: "string" },
      },
    },
  },
  {
    name: "set_alarm",
    description: "Set an alarm for an absolute time (natural language: 'tomorrow 7am', 'in 90 minutes').",
    input_schema: {
      type: "object",
      properties: {
        time:  { type: "string" },
        label: { type: "string" },
      },
      required: ["time"],
    },
  },
  {
    name: "list_timers",
    description: "List active timers and alarms.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cancel_timer",
    description: "Cancel a timer or alarm by id, or all if id is omitted.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
    },
  },
  {
    name: "get_weather",
    description: "Get current weather and a short forecast. Defaults to caller's IP location if no place given.",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string", description: "City, airport code, or 'lat,lon'." },
        days:     { type: "number", description: "Forecast days, 1–3. Default 1." },
      },
    },
  },
];

// ─── Handler map ─────────────────────────────────────────────────────
const handlers = {
  get_calendar:       (i) => calendarTool.run(i),
  get_emails:         (i) => emailTool.run(i),
  search_web:         (i) => searchTool.run(i),
  add_task:           (i) => tasksTool.add(i),
  get_tasks:          (i) => tasksTool.list(i),
  save_note:          (i) => notesTool.save(i),
  get_notes:          (i) => notesTool.search(i),
  remember:           (i) => memoryTool.remember(i),
  recall:             (i) => memoryTool.recall(i),
  get_day_plan:       (i) => dayPlanTool.run(i),
  build_software:     (i) => codegenTool.run(i),
  fix_self_code:      (i) => selfFixTool.run(i),
  repair_self:        (i) => repairSelfTool.run(i),
  get_screen_context: (i) => screenCore.getScreenContext(i?.focus),
  open_app:           (i) => macTool.openApp(i),
  type_text:          (i) => macTool.typeText(i),
  send_imessage:      (i) => macTool.sendIMessage(i),
  send_whatsapp:      (i) => macTool.sendWhatsApp(i),
  list_files:         (i) => filesTool.listFiles(i),
  open_path:          (i) => filesTool.openPath(i),
  set_volume:         (i) => systemTool.setVolume(i),
  get_volume:         ()  => systemTool.getVolume(),
  set_brightness:     (i) => systemTool.setBrightness(i),
  toggle_wifi:        (i) => systemTool.toggleWifi(i),
  toggle_bluetooth:   (i) => systemTool.toggleBluetooth(i),
  toggle_dark_mode:   (i) => systemTool.toggleDarkMode(i),
  lock_screen:        ()  => systemTool.lockScreen(),
  sleep_mac:          ()  => systemTool.sleepMac(),
  get_battery:        ()  => systemTool.getBattery(),
  run_shortcut:       (i) => shortcutsTool.runShortcut(i),
  list_shortcuts:     (i) => shortcutsTool.listShortcuts(i),
  music_control:      (i) => musicTool.control(i),
  music_play:         (i) => musicTool.play(i),
  music_now_playing:  (i) => musicTool.nowPlaying(i),
  add_reminder:       (i) => remindersTool.add(i),
  list_reminders:     (i) => remindersTool.list(i),
  create_apple_note:  (i) => appleNotesTool.create(i),
  search_apple_notes: (i) => appleNotesTool.search(i),
  get_directions:     (i) => mapsTool.directions(i),
  search_maps:        (i) => mapsTool.search(i),
  facetime:           (i) => callsTool.facetime(i),
  call_phone:         (i) => callsTool.phone(i),
  set_timer:          (i) => timersTool.setTimer(i),
  set_alarm:          (i) => timersTool.setAlarm(i),
  list_timers:        ()  => timersTool.listTimers(),
  cancel_timer:       (i) => timersTool.cancelTimer(i),
  get_weather:        (i) => weatherTool.getWeather(i),
};

// ─── System prompt ───────────────────────────────────────────────────
function buildSystemPrompt({ userName, userNickname, intentHint }) {
  const date = new Date().toDateString();
  const name = userName || "Nikhil";
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
${addressLine}
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
- "build / create / make me" software → build_software
- "you're broken" / "fix yourself" / "change how you do X" / any complaint about
  Gwen's own behavior or code → fix_self_code (confirm the change first)
- native module errors ("better-sqlite3 was compiled against...", "Module did not
  self-register", ABI mismatch), missing-dependency errors, or build cache issues
  → repair_self (confirm the action first). Use rebuild_electron for native ABI
  errors, npm_install after a dependency change, clear_cache for stale builds.
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

  if (intentHint && intentHint.confidence >= 0.7) {
    prompt += `\n\nDetected intent: ${intentHint.type} (confidence ${intentHint.confidence}).`;
  }

  return prompt;
}

// ─── Main entry ──────────────────────────────────────────────────────
/**
 * Run a single turn through the brain.
 * @param {string} userInput
 * @param {{ intentHint?: object }} [opts]
 * @returns {Promise<string>} Final spoken text.
 */
export async function runBrain(userInput, opts = {}) {
  const userName = (await safeRecall("user_name")) || process.env.GWEN_USER_NAME || "Nikhil";
  const userNickname = await safeRecall("user_nickname");
  const system = buildSystemPrompt({ userName, userNickname, intentHint: opts.intentHint });

  const messages = [...getHistoryForTurn(), { role: "user", content: userInput }];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.2,
    system,
    tools: TOOLS,
    messages,
  });

  let turn = 0;
  while (response.stop_reason === "tool_use" && turn < MAX_TOOL_TURNS) {
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const result = await handlers[tu.name](tu.input || {});
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

    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
    temperature: 0.2,
      system,
      tools: TOOLS,
      messages,
    });

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
export async function runBrainStream(userInput, onSentence = () => {}, opts = {}) {
  const userName = (await safeRecall("user_name")) || process.env.GWEN_USER_NAME || "Nikhil";
  const userNickname = await safeRecall("user_nickname");
  const system = buildSystemPrompt({ userName, userNickname, intentHint: opts.intentHint });
  const messages = [...getHistoryForTurn(), { role: "user", content: userInput }];

  let fullText = "";
  let turn = 0;

  while (turn <= MAX_TOOL_TURNS) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
    temperature: 0.2,
      system,
      tools: TOOLS,
      messages,
    });

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
    fullText += turnText;

    if (buffer.trim()) {
      onSentence(buffer.trim());
      buffer = "";
    }

    if (finalMessage.stop_reason !== "tool_use") {
      if (!opts.skipHistory) recordExchange(userInput, fullText);
      return fullText;
    }

    const toolUses = finalMessage.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const result = await handlers[tu.name](tu.input || {});
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
