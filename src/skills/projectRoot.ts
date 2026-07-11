// src/skills/projectRoot.ts — resolve the gwen project root regardless of
// whether this module is running from src/, compiled into dist-electron/,
// or packaged as an app (.app bundle).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));

function find(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        if (JSON.parse(fs.readFileSync(pkg, "utf8")).name === "gwen") return dir;
      } catch {}
    }
    dir = path.dirname(dir);
  }
  return path.resolve(start, "../..");
}

// Detect if running from a packaged .app bundle
const isPackaged = here.includes("Gwen.app") || process.mainFilename?.includes("Gwen.app");

// For packaged app, use Application Support directory for writable storage
const appSupportPath = path.join(os.homedir(), "Library/Application Support/Gwen");

let projectRoot = find(here);

if (isPackaged) {
  // For packaged app, use Application Support directory
  projectRoot = appSupportPath;
  // Ensure data directory exists
  const dataDir = path.join(projectRoot, "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  console.log(`[projectRoot] packaged mode: ${projectRoot}`);
} else {
  console.log(`[projectRoot] dev mode: ${projectRoot}`);
}

export const PROJECT_ROOT = projectRoot;
