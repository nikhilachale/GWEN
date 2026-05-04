// src/tools/restart.ts — relaunch Gwen on user request, no code work.
// Use this when the user explicitly asks to restart/relaunch/reload. It
// triggers the same relaunch path as fix_self_code, so the self-restart
// marker is written and the conversation history is preserved across the
// restart — but no Claude Code subprocess is spawned.
import { relaunchApp } from "../skills/relaunch.js";

export async function run() {
  // Delay matches the fix_self_code pattern: gives TTS time to finish
  // playing the spoken reply before the window dies.
  setTimeout(() => relaunchApp(), 2500);
  return "Restarting myself now.";
}
