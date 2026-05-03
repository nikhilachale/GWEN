// src/skills/relaunch.ts — restart the Electron app cleanly.
// In dev, app.relaunch() drops us into a half-broken state because
// `concurrently` tears down vite + tsc-watch when this electron process
// exits. Spawning a detached `npm run dev` *before* we exit keeps the dev
// pipeline alive across the restart. In production, app.relaunch() works
// correctly because there's no sibling toolchain to revive.
import { spawn } from "node:child_process";
import { app } from "electron";
import { PROJECT_ROOT } from "./projectRoot.js";

export function relaunchApp() {
  if (process.env.NODE_ENV === "development") {
    const child = spawn("npm", ["run", "dev"], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
  } else {
    app.relaunch();
  }
  app.exit(0);
}
