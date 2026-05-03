// src/tools/music.js — Apple Music and Spotify control via AppleScript.
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

const APPS = { music: "Music", spotify: "Spotify" };

function appName(app) {
  const key = (app || "music").toLowerCase();
  return APPS[key] || "Music";
}

/**
 * Play / pause / skip / previous / stop.
 * @param {{ action: "play"|"pause"|"playpause"|"next"|"previous"|"stop", app?: string }} args
 */
export async function control({ action, app } = {}) {
  if (!action) return "Tell me play, pause, next, previous, or stop.";
  const target = appName(app);
  const cmd = {
    play:      "play",
    pause:     "pause",
    playpause: "playpause",
    next:      "next track",
    previous:  "previous track",
    stop:      "stop",
  }[action];
  if (!cmd) return `Unknown action: ${action}.`;
  try {
    await runAppleScript(`tell application "${target}" to ${cmd}`);
    return action === "next" ? "Skipping." : action === "previous" ? "Going back." : `${capitalize(action)}.`;
  } catch (err) {
    return `${target} couldn't ${action}: ${err.message}`;
  }
}

/**
 * Search and play a track/album/artist in Apple Music.
 * @param {{ query: string }} args
 */
export async function play({ query } = {}) {
  if (!query) return "Tell me what to play.";
  try {
    await runAppleScript(`tell application "Music"
      activate
      set results to (every track of library playlist 1 whose name contains "${escape(query)}" or artist contains "${escape(query)}" or album contains "${escape(query)}")
      if (count of results) > 0 then
        play item 1 of results
        return name of item 1 of results & " by " & artist of item 1 of results
      else
        return "no match"
      end if
    end tell`);
    return `Playing ${query}.`;
  } catch (err) {
    return `Couldn't play ${query}: ${err.message}`;
  }
}

/**
 * Get the currently playing track.
 * @param {{ app?: string }} args
 */
export async function nowPlaying({ app } = {}) {
  const target = appName(app);
  try {
    const out = await runAppleScript(`tell application "${target}"
      if player state is playing then
        return (name of current track) & " — " & (artist of current track)
      else
        return "Not playing."
      end if
    end tell`);
    return out || "Nothing playing.";
  } catch (err) {
    return `Couldn't read ${target}: ${err.message}`;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e ${shellEscape(script)}`, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}
function shellEscape(s) { return `'${String(s).replace(/'/g, "'\\''")}'`; }
function escape(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function capitalize(s) { return s[0].toUpperCase() + s.slice(1); }
