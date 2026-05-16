// src/skills/relaunch.ts — restart the Electron app cleanly.
// In dev, app.relaunch() drops us into a half-broken state because
// `concurrently` tears down vite + tsc-watch when this electron process
// exits. Spawning a detached `npm run dev` *before* we exit keeps the dev
// pipeline alive across the restart. In production, app.relaunch() works
// correctly because there's no sibling toolchain to revive.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, openSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { PROJECT_ROOT } from "./projectRoot.js";

// Marker that tells brain.ts on the next boot "this restart was self-initiated
// — load the prior conversation." Manual quit-and-relaunch leaves no marker,
// so brain.ts starts clean. brain.ts deletes the marker after reading it.
export const SELF_RESTART_MARKER = path.join(PROJECT_ROOT, "data/.self-restart");

// When Gwen relaunches herself, the new `npm run dev` is detached from any
// terminal — its stdout/stderr would normally vanish. Pipe it to a log file
// so the dev can `tail -f` it, and persist the PID so the dev can kill it.
export const RELAUNCH_LOG = path.join(PROJECT_ROOT, "data/relaunch.log");
export const RELAUNCH_PID = path.join(PROJECT_ROOT, "data/relaunch.pid");

export function relaunchApp() {
  // Write the marker synchronously — the process is about to exit and we
  // can't rely on async work completing.
  try {
    mkdirSync(path.dirname(SELF_RESTART_MARKER), { recursive: true });
    writeFileSync(SELF_RESTART_MARKER, String(Date.now()));
  } catch (err) {
    console.warn("[relaunch] could not write self-restart marker:", err.message);
  }

  if (process.env.NODE_ENV === "development") {
    // Truncate the previous log and write a header so each relaunch starts a
    // fresh, easy-to-read log instead of accumulating forever.
    let logFd = null;
    try {
      const header = `\n========== relaunch @ ${new Date().toISOString()} ==========\n`;
      writeFileSync(RELAUNCH_LOG, header); // truncate + header
      logFd = openSync(RELAUNCH_LOG, "a");
    } catch (err) {
      console.warn("[relaunch] could not open log file:", err.message);
    }

    // The old `concurrently -k` pipeline still owns Vite on port 5174 — it
    // only reaps its Vite/tsc siblings *after* the old Electron exits (our
    // app.exit(0) below). If the new `npm run dev` starts before that, the
    // new Vite hits `strictPort: true` on 5174, exits 1, and `concurrently
    // -k` then SIGTERMs the entire new pipeline — the relaunch silently
    // dies. So wait (bounded ~30s) for 5174 to free before starting; if it
    // never frees, proceed anyway and let Vite surface a real error.
    const waitThenDev =
      'echo "[relaunch] waiting for old dev pipeline to release port 5174...";' +
      "i=0; while [ $i -lt 60 ]; do " +
      "lsof -nP -iTCP:5174 -sTCP:LISTEN >/dev/null 2>&1 || break; " +
      "sleep 0.5; i=$((i+1)); done;" +
      'echo "[relaunch] port 5174 free after ${i} ticks, starting npm run dev";' +
      "exec npm run dev";

    const child = spawn("sh", ["-c", waitThenDev], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: logFd != null ? ["ignore", logFd, logFd] : "ignore",
      env: process.env,
    });

    try {
      writeFileSync(RELAUNCH_PID, String(child.pid));
    } catch {}

    // Log to the *current* (about-to-die) parent so the dev sees it in the
    // terminal that ran the original `npm run dev` before that terminal's
    // pipeline tears down.
    console.log(`[relaunch] spawned dev pipeline detached (pid ${child.pid})`);
    console.log(`[relaunch]   logs:  tail -f ${RELAUNCH_LOG}`);
    console.log(`[relaunch]   stop:  kill ${child.pid}     (or: kill -- -${child.pid} to kill the whole group)`);

    child.unref();
  } else {
    app.relaunch();
  }
  app.exit(0);
}
