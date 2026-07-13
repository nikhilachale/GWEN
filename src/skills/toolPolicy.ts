// src/skills/toolPolicy.ts - central security policy registry for brain tools.

export type ToolRisk = "safe" | "sensitive" | "destructive";

export type ToolPolicy = {
  risk: ToolRisk;
  confirmation: "none" | "required";
  reason: string;
};

const POLICIES = {
  get_calendar: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Reads private calendar data.",
  },
  get_emails: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Reads private email data.",
  },
  search_web: {
    risk: "safe",
    confirmation: "none",
    reason: "Queries the public web.",
  },
  add_task: {
    risk: "safe",
    confirmation: "none",
    reason: "Writes to Gwen's local task list.",
  },
  get_tasks: {
    risk: "safe",
    confirmation: "none",
    reason: "Reads Gwen's local task list.",
  },
  save_note: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Writes user-authored local notes.",
  },
  get_notes: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Reads private local notes.",
  },
  remember: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Writes long-term memory about the user.",
  },
  recall: {
    risk: "safe",
    confirmation: "none",
    reason: "Reads a specific stored memory key.",
  },
  forget_memory: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Deletes long-term memory about the user.",
  },
  get_day_plan: {
    risk: "safe",
    confirmation: "none",
    reason: "Combines existing local context into a briefing.",
  },
  build_software: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Spawns Codex to create or modify software outside Gwen.",
  },
  fix_self_code: {
    risk: "destructive",
    confirmation: "required",
    reason: "Modifies Gwen's own source code.",
  },
  relaunch_self: {
    risk: "safe",
    confirmation: "none",
    reason: "Restarts Gwen without editing code.",
  },
  repair_self: {
    risk: "destructive",
    confirmation: "required",
    reason: "Runs maintenance commands against Gwen's install.",
  },
  get_screen_context: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Captures and reads the user's current screen.",
  },
  open_app: {
    risk: "safe",
    confirmation: "none",
    reason: "Opens a local application.",
  },
  type_text: {
    risk: "destructive",
    confirmation: "required",
    reason: "Controls the focused app by typing text.",
  },
  send_imessage: {
    risk: "destructive",
    confirmation: "required",
    reason: "Sends a message to another person.",
  },
  send_whatsapp: {
    risk: "destructive",
    confirmation: "required",
    reason: "Sends a message to another person.",
  },
  scroll_mouse: {
    risk: "safe",
    confirmation: "none",
    reason: "Scrolls the focused window.",
  },
  list_files: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Lists local filesystem contents.",
  },
  open_path: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Opens or reveals a local file path.",
  },
  set_volume: {
    risk: "safe",
    confirmation: "none",
    reason: "Changes local audio volume.",
  },
  get_volume: {
    risk: "safe",
    confirmation: "none",
    reason: "Reads local audio volume.",
  },
  set_brightness: {
    risk: "safe",
    confirmation: "none",
    reason: "Changes local display brightness.",
  },
  toggle_wifi: {
    risk: "destructive",
    confirmation: "required",
    reason: "Changes network connectivity.",
  },
  toggle_bluetooth: {
    risk: "destructive",
    confirmation: "required",
    reason: "Changes Bluetooth connectivity.",
  },
  toggle_dark_mode: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Changes macOS appearance settings.",
  },
  lock_screen: {
    risk: "destructive",
    confirmation: "required",
    reason: "Locks the user's Mac.",
  },
  sleep_mac: {
    risk: "destructive",
    confirmation: "required",
    reason: "Puts the user's Mac to sleep.",
  },
  get_battery: {
    risk: "safe",
    confirmation: "none",
    reason: "Reads local battery state.",
  },
  run_shortcut: {
    risk: "destructive",
    confirmation: "required",
    reason: "Runs user-defined macOS automation.",
  },
  list_shortcuts: {
    risk: "safe",
    confirmation: "none",
    reason: "Lists installed macOS Shortcuts names.",
  },
  music_control: {
    risk: "safe",
    confirmation: "none",
    reason: "Controls local media playback.",
  },
  music_play: {
    risk: "safe",
    confirmation: "none",
    reason: "Starts local media playback.",
  },
  music_now_playing: {
    risk: "safe",
    confirmation: "none",
    reason: "Reads current media playback state.",
  },
  add_reminder: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Writes to the user's Reminders app.",
  },
  list_reminders: {
    risk: "safe",
    confirmation: "none",
    reason: "Reads reminders from the user's Reminders app.",
  },
  create_apple_note: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Writes to the user's Notes app.",
  },
  search_apple_notes: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Reads from the user's Notes app.",
  },
  get_directions: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Opens Maps with route information.",
  },
  search_maps: {
    risk: "safe",
    confirmation: "none",
    reason: "Searches Apple Maps.",
  },
  facetime: {
    risk: "destructive",
    confirmation: "required",
    reason: "Starts a FaceTime call.",
  },
  call_phone: {
    risk: "destructive",
    confirmation: "required",
    reason: "Places a phone call.",
  },
  set_timer: {
    risk: "safe",
    confirmation: "none",
    reason: "Starts a local timer.",
  },
  set_alarm: {
    risk: "safe",
    confirmation: "none",
    reason: "Starts a local alarm.",
  },
  list_timers: {
    risk: "safe",
    confirmation: "none",
    reason: "Lists local timers and alarms.",
  },
  cancel_timer: {
    risk: "safe",
    confirmation: "none",
    reason: "Cancels a local timer or alarm.",
  },
  read_file: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Reads local file contents.",
  },
  read_pdf: {
    risk: "sensitive",
    confirmation: "required",
    reason: "Reads local PDF contents.",
  },
  get_weather: {
    risk: "safe",
    confirmation: "none",
    reason: "Fetches weather information.",
  },
  review_daily_tasks: {
    risk: "safe",
    confirmation: "none",
    reason: "Updates Gwen's local task list during the daily review.",
  },
  skip_startup_greeting: {
    risk: "safe",
    confirmation: "none",
    reason: "Updates Gwen's local startup greeting state.",
  },
} as const satisfies Record<string, ToolPolicy>;

export const TOOL_POLICIES: Readonly<Record<string, ToolPolicy>> = POLICIES;

export function getToolPolicy(name: string): ToolPolicy {
  const policy = TOOL_POLICIES[name];
  if (!policy) {
    throw new Error(`[security] no tool policy registered for "${name}"`);
  }
  return policy;
}

export function validateToolPolicies(toolNames: Iterable<string>) {
  const tools = new Set(toolNames);
  const policies = new Set(Object.keys(TOOL_POLICIES));
  const missingPolicies = [...tools].filter((name) => !policies.has(name));
  const stalePolicies = [...policies].filter((name) => !tools.has(name));
  if (missingPolicies.length || stalePolicies.length) {
    throw new Error(
      "[security] tool policy registry out of sync - " +
        `tools without policies: [${missingPolicies.join(", ")}]; ` +
        `policies without tools: [${stalePolicies.join(", ")}]`
    );
  }
}
