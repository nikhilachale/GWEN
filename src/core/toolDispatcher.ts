// src/core/toolDispatcher.ts — Tool dispatch, summarization, and circuit breaker
import { sendActivity } from "../skills/ipc.js";
import {
  auditTool,
  clearPendingTool,
  classifyTool,
  confirmationPrompt,
  getPendingConfirmation,
  getPendingTool,
  isConfirmation,
  isDenial,
  needsConfirmation,
  setPendingTool,
} from "../skills/security.js";
import {
  withRetry,
  withRetryForProvider,
  DEFAULT_POLICIES,
  type RetryMetrics,
} from "../skills/retry.js";

/**
 * Determine which provider a tool uses for retry policy
 */
function getToolProvider(tool: string): string {
  const providerMap: Record<string, string> = {
    search_web: "tavily",
    get_calendar: "google",
    get_emails: "google",
    get_weather: "weather",
    save_note: "local",
    get_notes: "local",
    add_task: "local",
    get_tasks: "local",
    remember: "local",
    recall: "local",
    build_software: "openai",
    fix_self_code: "openai",
    get_screen_context: "local",
    send_imessage: "local",
    send_whatsapp: "local",
    type_text: "local",
    music_control: "local",
    music_play: "local",
    music_now_playing: "local",
    set_timer: "local",
    set_alarm: "local",
    list_timers: "local",
    cancel_timer: "local",
    facetime: "local",
    call_phone: "local",
    run_shortcut: "local",
    set_volume: "local",
    set_brightness: "local",
    toggle_wifi: "local",
    toggle_bluetooth: "local",
    toggle_dark_mode: "local",
    lock_screen: "local",
    sleep_mac: "local",
    get_battery: "local",
    open_app: "local",
    open_path: "local",
    list_files: "local",
    read_file: "local",
    read_pdf: "local",
    search_maps: "google",
    get_directions: "google",
    create_apple_note: "local",
    search_apple_notes: "local",
    add_reminder: "local",
    list_reminders: "local",
  };
  return providerMap[tool] || "default";
}

export interface ToolHandler {
  (input: any): string | object | Promise<string | object>;
}

export interface ToolHandlers {
  [toolName: string]: ToolHandler;
}

export interface PendingConfirmation {
  name: string;
  input: any;
  summary: string;
  risk: "safe" | "sensitive" | "destructive";
  requiredText: string;
}

// Friendlier human-readable summaries for the right-column live feed.
// Anything not listed here falls through to a generic "Running <tool>".
function summarizeActivity(tool: string, input: any): string {
  const i = input || {};
  switch (tool) {
    case "read_pdf": return `Reading PDF: ${(i.path || "").split("/").pop() || "(file)"}`;
    case "open_app": return `Opening ${i.app || i.name || "an app"}`;
    case "open_path": return `Opening ${i.path || "a path"}`;
    case "list_files": return `Browsing ${i.path || "files"}`;
    case "search_web": return `Searching: "${String(i.query || "").slice(0, 60)}"`;
    case "search_maps": return `Maps: "${String(i.query || "").slice(0, 60)}"`;
    case "get_directions": return `Directions to ${i.to || "a place"}`;
    case "get_calendar": return "Checking calendar";
    case "get_emails": return "Checking unread email";
    case "get_day_plan": return "Building today's briefing";
    case "get_weather": return `Weather${i.location ? `: ${i.location}` : ""}`;
    case "save_note": return `Saving note: "${(i.title || "").slice(0, 40)}"`;
    case "get_notes": return `Searching notes${i.query ? `: "${i.query}"` : ""}`;
    case "add_task": return `Adding task: "${(i.text || "").slice(0, 50)}"`;
    case "get_tasks": return "Loading tasks";
    case "remember": return `Remembering: ${(i.key || "").replace(/_/g, " ")}`;
    case "recall": return `Recalling: ${(i.key || "").replace(/_/g, " ")}`;
    case "build_software": return `Building: "${(i.prompt || "").slice(0, 60)}"`;
    case "fix_self_code": return `Fixing herself: ${(i.summary || i.description || "").slice(0, 60)}`;
    case "repair_self": return "Self-repair sweep";
    case "relaunch_self": return "Relaunching";
    case "get_screen_context": return "Looking at your screen";
    case "send_imessage": return `iMessage to ${i.to || "(contact)"}`;
    case "send_whatsapp": return `WhatsApp to ${i.to || "(contact)"}`;
    case "type_text": return `Typing: "${String(i.text || "").slice(0, 40)}"`;
    case "music_control":
    case "music_play": return `Music: ${i.action || i.query || "control"}`;
    case "music_now_playing": return "Now playing?";
    case "set_timer": return `Timer: ${i.minutes ?? i.seconds ?? "?"}${i.minutes ? "m" : "s"}${i.label ? ` — ${i.label}` : ""}`;
    case "set_alarm": return `Alarm: ${i.time || "?"}`;
    case "list_timers": return "Listing timers";
    case "cancel_timer": return "Cancelling timer";
    case "facetime": return `FaceTime: ${i.contact || ""}`;
    case "call_phone": return `Call: ${i.number || ""}`;
    case "run_shortcut": return `Shortcut: ${i.name || ""}`;
    case "set_volume": return `Volume → ${i.level ?? "?"}`;
    case "set_brightness": return `Brightness → ${i.level ?? "?"}`;
    case "toggle_wifi": return "Toggling Wi-Fi";
    case "toggle_bluetooth": return "Toggling Bluetooth";
    case "toggle_dark_mode": return "Toggling dark mode";
    case "lock_screen": return "Locking screen";
    case "sleep_mac": return "Sleeping the Mac";
    case "get_battery": return "Checking battery";
    default: return `Running ${tool}`;
  }
}

export interface CircuitState {
  errStreak: number;
  lastSig: string;
}

export function makeToolCircuit(): CircuitState {
  return { errStreak: 0, lastSig: "" };
}

export function tripCircuit(state: CircuitState, toolUses: Array<{ name: string; input: any }>, toolResults: any[]): string | null {
  const sig = toolUses
    .map((t) => `${t.name}:${JSON.stringify(t.input || {})}`)
    .sort()
    .join("|");
  const allErrored = toolResults.length > 0 && toolResults.every((r) => r.is_error);
  state.errStreak = allErrored ? state.errStreak + 1 : 0;
  const looping = sig !== "" && sig === state.lastSig;
  state.lastSig = sig;
  if (state.errStreak >= 2) return "repeated tool errors";
  if (looping) return "the same tool call repeating";
  return null;
}

export function circuitReply(toolResults: any[], reason: string): string {
  const detail = String(toolResults.find((r) => r.is_error)?.content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return detail
    ? `I hit a snag and stopped retrying (${reason}). ${detail}`
    : `I hit a snag and stopped retrying (${reason}).`;
}

export async function dispatchTool(
  name: string,
  input: any,
  handlers: ToolHandlers
): Promise<string> {
  const summary = summarizeActivity(name, input);
  auditTool({ tool: name, action: "requested", summary }).catch(() => {});

  if (process.env.GWEN_SAFE_MODE === "1" && classifyTool(name) === "destructive") {
    auditTool({ tool: name, action: "blocked", summary, detail: "safe mode" }).catch(() => {});
    sendActivity({
      kind: "tool_error",
      tool: name,
      summary,
      detail: "Blocked by safe mode",
    });
    return `Blocked by safe mode: ${summary}. Turn off safe mode in Settings if you want system-control, messaging, calls, shortcuts, or self-editing actions.`;
  }

  if (needsConfirmation(name)) {
    const pending = setPendingTool(name, input || {}, summary);
    auditTool({ tool: name, action: "awaiting_confirmation", summary }).catch(() => {});
    sendActivity({
      kind: "info",
      tool: name,
      summary: "Awaiting security confirmation",
      detail: pending.summary,
    });
    return confirmationPrompt(name, input || {}, summary);
  }

  return dispatchToolNow(name, input, summary, handlers);
}

export async function dispatchToolNow(
  name: string,
  input: any,
  summary: string,
  handlers: ToolHandlers
): Promise<string> {
  sendActivity({ kind: "tool_start", tool: name, summary });

  const provider = getToolProvider(name);
  const policy = DEFAULT_POLICIES[provider] || DEFAULT_POLICIES.default;

  // Skip retry for local/destructive tools (they should fail fast)
  const skipRetry = provider === "local" || classifyTool(name) === "destructive";

  try {
    let result: any;
    let metrics: RetryMetrics | undefined;

    if (skipRetry) {
      // Direct execution without retry
      result = await handlers[name](input || {});
    } else {
      // Execute with retry and metrics
      const retryResult = await withRetryMetrics(
        async () => await handlers[name](input || {}),
        policy
      );
      result = retryResult.result;
      metrics = retryResult.metrics;

      // Log retry metrics if multiple attempts were made
      if (metrics.attempts > 1) {
        console.log(
          `[toolDispatcher] ${name} succeeded after ${metrics.attempts} attempts ` +
          `(${metrics.totalDelay}ms total delay)`
        );
      }
    }

    auditTool({ tool: name, action: "executed", summary }).catch(() => {});
    sendActivity({ kind: "tool_done", tool: name, summary });
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (err: any) {
    auditTool({ tool: name, action: "failed", summary, detail: err?.message || String(err) }).catch(() => {});
    sendActivity({
      kind: "tool_error",
      tool: name,
      summary,
      detail: err?.message || String(err),
    });
    throw err;
  }
}

export async function handlePendingConfirmation(
  userInput: string,
  handlers: ToolHandlers,
  opts: Record<string, any> = {}
): Promise<{ handled: boolean; reply?: string }> {
  const pending = getPendingTool();
  if (!pending) return { handled: false };

  if (isConfirmation(userInput, pending.name)) {
    auditTool({ tool: pending.name, action: "confirmed", summary: pending.summary }).catch(() => {});
    clearPendingTool();
    const result = await dispatchToolNow(pending.name, pending.input, pending.summary, handlers);
    return { handled: true, reply: typeof result === "string" ? result : JSON.stringify(result) };
  }

  if (isDenial(userInput)) {
    auditTool({ tool: pending.name, action: "denied", summary: pending.summary }).catch(() => {});
    clearPendingTool();
    return { handled: true, reply: "Cancelled." };
  }

  const pendingState = getPendingConfirmation();
  const reply = pendingState?.risk === "destructive"
    ? `I still need exact confirmation: ${pendingState.requiredText}.`
    : `I still need a clear yes or no for: ${pending.summary}.`;
  return { handled: true, reply };
}
