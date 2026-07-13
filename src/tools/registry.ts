import * as calendarTool from "./calendar.js";
import * as emailTool from "./email.js";
import * as searchTool from "./search.js";
import * as tasksTool from "./tasks.js";
import * as notesTool from "./notes.js";
import * as memoryTool from "./memory.js";
import * as dayPlanTool from "./dayplan.js";
import * as codegenTool from "./codegen.js";
import * as selfFixTool from "./selfFix.js";
import * as repairSelfTool from "./repairSelf.js";
import * as restartTool from "./restart.js";
import * as macTool from "./macControl.js";
import * as filesTool from "./files.js";
import * as systemTool from "./system.js";
import * as shortcutsTool from "./shortcuts.js";
import * as musicTool from "./music.js";
import * as remindersTool from "./reminders.js";
import * as appleNotesTool from "./appleNotes.js";
import * as mapsTool from "./maps.js";
import * as callsTool from "./calls.js";
import * as timersTool from "./timers.js";
import * as weatherTool from "./weather.js";
import * as pdfTool from "./pdf.js";
import * as screenCore from "../core/screen.js";
import * as dailyTasksTool from "./dailyTasks.js";
import * as dailyRoutine from "../skills/dailyRoutine.js";
import { forgetAutoFact } from "../skills/passiveMemory.js";
import { validateSecurityPolicies } from "../skills/security.js";

// ─── Tool definitions ────────────────────────────────────────────────
export const TOOLS = [
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
    name: "forget_memory",
    description: "Forget a passively-learned fact about the user. Use when the user says 'forget that I X', 'I don't actually X anymore', or otherwise corrects something you've stored. The key is the snake_case topic (e.g. 'lives_in', 'sister_name') — the 'auto_' prefix is added automatically. If unsure of the exact key, just pass the topic word and Gwen will try.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Snake_case topic key, e.g. 'lives_in'." },
      },
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
    description: "Spawn Codex to build a separate external software project based on a description. Do not use this for Gwen's own source code, Gwen features, self-building, self-fixing, or changes to this app — those must use fix_self_code.",
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
    description: "Fix, modify, or self-build Gwen's own source code by spawning Codex inside this project. Use when the user reports a bug in Gwen herself, asks you to change your own behavior, asks to add/tweak a feature in your code, says self-build/self-building, or asks to add something to Gwen. Always confirm the change in one sentence and wait for approval before calling. After a successful fix, Gwen automatically restarts herself so the change loads — conversation history is preserved.",
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
    name: "relaunch_self",
    description: "Restart Gwen (the Electron app) without modifying any code. Use this when the user explicitly asks you to restart, relaunch, reload, or reboot yourself. Conversation context is preserved across the restart. Distinct from fix_self_code (which edits source) and repair_self (which runs maintenance commands) — relaunch_self does no work, just bounces the app.",
    input_schema: {
      type: "object",
      properties: {},
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
    name: "scroll_mouse",
    description: "Scroll the currently focused window up or down by a given number of lines. Uses macOS CGEvent scroll-wheel synthesis. Requires Accessibility permission.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down"], description: "Default 'down'." },
        amount:    { type: "number", description: "Number of scroll lines. Default 5." },
      },
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
    name: "read_file",
    description: "Read the text contents of a file (txt, tsx, ts, js, jsx, md, json, source code, config, etc.). Use when the user asks Gwen to read, summarize, or quote from a text-based file. Accepts absolute paths, tilde paths (e.g. '~/Downloads/foo.txt'), or shortcut names like 'desktop'. Returns up to maxChars of text plus file size in bytes.",
    input_schema: {
      type: "object",
      properties: {
        path:     { type: "string", description: "Path to the text file." },
        maxChars: { type: "number", description: "Max characters to return. Default 20000." },
      },
      required: ["path"],
    },
  },
  {
    name: "read_pdf",
    description: "Extract the text content of a PDF file at a given path. Use when the user asks Gwen to read, summarize, or quote from a PDF. Accepts absolute paths or tilde paths (e.g. '~/Downloads/foo.pdf'). Returns up to maxChars of text plus the page count.",
    input_schema: {
      type: "object",
      properties: {
        path:     { type: "string", description: "Path to the PDF file." },
        maxChars: { type: "number", description: "Max characters to return. Default 20000." },
      },
      required: ["path"],
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
  {
    name: "review_daily_tasks",
    description: "Review today's incomplete tasks and decide what to do with each. Use this when the user asks to review incomplete tasks at the end of the day.",
    input_schema: {
      type: "object",
      properties: {
        choices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              taskId: { type: "string", description: "The ID of the task to process." },
              action: { type: "string", enum: ["forward", "pending", "complete"], description: "forward = move to tomorrow, pending = keep as-is, complete = mark done" },
            },
            required: ["taskId", "action"],
          },
        },
      },
    },
  },
  {
    name: "skip_startup_greeting",
    description: "Skip the daily startup greeting for today. Use this when the user says they don't want to hear the welcome message today.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

// ─── Handler map ─────────────────────────────────────────────────────
export function createToolHandlers(options: { onTasksChanged?: () => void } = {}) {
  return {
  get_calendar:       (i) => calendarTool.run(i),
  get_emails:         (i) => emailTool.run(i),
  search_web:         (i) => searchTool.run(i),
  add_task:           async (i) => {
    const result = await tasksTool.add(i);
    options.onTasksChanged?.();
    return result;
  },
  get_tasks:          async (i) => {
    const result = await tasksTool.list(i);
    options.onTasksChanged?.();
    return result;
  },
  save_note:          (i) => notesTool.save(i),
  get_notes:          (i) => notesTool.search(i),
  remember:           (i) => memoryTool.remember(i),
  recall:             (i) => memoryTool.recall(i),
  forget_memory:      (i) => {
    const ok = forgetAutoFact(i?.key || "");
    return ok ? "Forgotten." : "Nothing stored under that key.";
  },
  get_day_plan:       (i) => dayPlanTool.run(i),
  build_software:     (i) => codegenTool.run(i),
  fix_self_code:      (i) => selfFixTool.run(i),
  repair_self:        (i) => repairSelfTool.run(i),
  relaunch_self:      ()  => restartTool.run(),
  get_screen_context: (i) => screenCore.getScreenContext(i?.focus),
  open_app:           (i) => macTool.openApp(i),
  type_text:          (i) => macTool.typeText(i),
  send_imessage:      (i) => macTool.sendIMessage(i),
  send_whatsapp:      (i) => macTool.sendWhatsApp(i),
  scroll_mouse:       (i) => macTool.scrollMouse(i),
  list_files:         (i) => filesTool.listFiles(i),
  open_path:          (i) => filesTool.openPath(i),
  read_file:          (i) => filesTool.readFile(i),
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
  read_pdf:           (i) => pdfTool.readPdf(i),
  review_daily_tasks: (i) => dailyTasksTool.reviewDailyTasks(i?.choices || []),
  skip_startup_greeting: () => {
    dailyRoutine.skipStartupGreeting();
    return "Startup greeting skipped for today.";
  },
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;

export function validateToolRegistry(handlers: ToolHandlers) {
  const schemaNames = new Set(TOOLS.map((t) => t.name));
  const handlerNames = new Set(Object.keys(handlers));
  const missingHandler = [...schemaNames].filter((n) => !handlerNames.has(n));
  const missingSchema = [...handlerNames].filter((n) => !schemaNames.has(n));
  if (missingHandler.length || missingSchema.length) {
    throw new Error(
      "[brain] tool registry out of sync - " +
        `schemas without handlers: [${missingHandler.join(", ")}]; ` +
        `handlers without schemas: [${missingSchema.join(", ")}]`
    );
  }
  validateSecurityPolicies(schemaNames);
}

