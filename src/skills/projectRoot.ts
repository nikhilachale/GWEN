// src/skills/projectRoot.ts — resolve the gwen project root regardless of
// whether this module is running from src/ or compiled into dist-electron/.
// Walks up the directory tree until it finds a package.json with name "gwen".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export const PROJECT_ROOT = find(here);
