// src/tools/repairSelf.ts — narrow self-maintenance tool.
// Runs a hardcoded whitelist of safe commands (rebuild native modules, npm
// install, clear build cache) and optionally relaunches the Electron app so
// changes take effect. The action name maps to a fixed command — no shell
// interpolation from the model.
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { sendSelfFix } from "../skills/ipc.js";
import { appendSelfBuild } from "../skills/buildLog.js";
import { PROJECT_ROOT } from "../skills/projectRoot.js";
import { relaunchApp } from "../skills/relaunch.js";

const ACTIONS = {
  rebuild_electron: {
    label: "rebuilding native modules for Electron",
    run: () => spawnCmd("npm", ["run", "rebuild:electron"]),
    relaunch: true,
  },
  npm_install: {
    label: "installing dependencies",
    run: () => spawnCmd("npm", ["install"]),
    relaunch: true,
  },
  clear_cache: {
    label: "clearing build cache",
    run: async () => {
      for (const dir of ["dist-electron", "dist", "node_modules/.vite"]) {
        await rm(path.join(PROJECT_ROOT, dir), { recursive: true, force: true });
      }
    },
    relaunch: false,
  },
};

export async function run({ action, relaunch } = {}) {
  const op = ACTIONS[action];
  if (!op) {
    return `Unknown repair action. Options: ${Object.keys(ACTIONS).join(", ")}.`;
  }

  sendSelfFix(true, op.label);
  try {
    await op.run();

    const shouldRelaunch = relaunch ?? op.relaunch;
    await appendSelfBuild({
      tool: "repair_self",
      action: action,
      result: "ok",
      notes: shouldRelaunch ? "relaunched" : undefined,
    });

    if (shouldRelaunch) {
      setTimeout(() => relaunchApp(), 1500);
      return `${capitalize(op.label)} complete. Relaunching now.`;
    }
    return `${capitalize(op.label)} complete.`;
  } catch (err) {
    await appendSelfBuild({
      tool: "repair_self",
      action: action,
      result: "failed",
      notes: err.message,
    });
    return `Repair failed: ${err.message}`;
  } finally {
    // Keep banner visible briefly past relaunch trigger so the user sees
    // the result before the window restarts.
    setTimeout(() => sendSelfFix(false), 1200);
  }
}

function spawnCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: PROJECT_ROOT, env: process.env });
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exit ${code}`));
    });
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
