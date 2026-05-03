// src/tools/codegen.js — spawns Claude Code CLI to build software
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { sendCodeOutput } from "../skills/ipc.js";
import { appendSelfBuild } from "../skills/buildLog.js";
import * as memoryTool from "./memory.js";

const DEFAULT_BASE = path.join(os.homedir(), "Gwen-projects");

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

function uniqueDir(base) {
  if (!fs.existsSync(base)) return base;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  return `${base}-${stamp}`;
}

export async function run({ request, dir, framework } = {}) {
  if (!request || !request.trim()) return "What should I build?";

  // Resolve dir
  let targetDir = dir;
  if (!targetDir) {
    targetDir = path.join(DEFAULT_BASE, slugify(request) || "untitled");
  }
  targetDir = uniqueDir(targetDir);
  fs.mkdirSync(targetDir, { recursive: true });

  // Resolve framework hint
  let fw = framework;
  if (!fw) {
    const recalled = await memoryTool.recall({ key: "preferred_framework" }).catch(() => null);
    if (typeof recalled === "string" && !recalled.startsWith("I don't")) fw = recalled;
  }

  const prompt = buildPrompt(request, targetDir, fw);

  try {
    await runClaudeCode(prompt, targetDir);
    const tree = summarizeBuild(targetDir);
    await appendSelfBuild({
      tool: "build_software",
      action: request,
      result: "ok",
      notes: `dir: ${targetDir}${fw ? `; framework: ${fw}` : ""}`,
    });
    return `Done. Created files in ${targetDir}.\n\n${tree}`;
  } catch (err) {
    await appendSelfBuild({
      tool: "build_software",
      action: request,
      result: "failed",
      notes: err.message,
    });
    if (err.code === "ENOENT") {
      return "Claude Code isn't installed. Run `npm install -g @anthropic-ai/claude-code` first.";
    }
    return `Claude Code finished with an error: ${err.message}`;
  }
}

function buildPrompt(request, dir, framework) {
  return `${request}

Requirements:
- Framework: ${framework || "your best judgment based on the request"}
- Save all files to: ${dir}
- Create a README.md
- Do not install dependencies automatically
- Do not run any of the built code
- Use the simplest possible solution that satisfies the request`;
}

function runClaudeCode(prompt, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["--print", "--permission-mode", "acceptEdits", prompt],
      { cwd, env: process.env }
    );

    child.stdout.on("data", (d) => sendCodeOutput(d.toString()));
    child.stderr.on("data", (d) => sendCodeOutput(`[err] ${d.toString()}`));

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exit ${code}`));
    });
  });
}

function summarizeBuild(dir) {
  const files = walk(dir).slice(0, 30);
  return files.map((f) => `  ${path.relative(dir, f)}`).join("\n") || "(no files created)";
}

function walk(d) {
  const out = [];
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(d, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
