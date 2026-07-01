// src/tools/codegen.js — spawns Codex CLI to build software
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { appendSelfBuild } from "../skills/buildLog.js";
import { sendCodeOutput } from "../skills/ipc.js";
import * as memoryTool from "./memory.js";

const DEFAULT_BASE = path.join(os.homedir(), "Gwen-projects");

function codexBin() {
  return process.env.CODEX_CLI_PATH && fs.existsSync(process.env.CODEX_CLI_PATH)
    ? process.env.CODEX_CLI_PATH
    : "codex";
}

function claudeBin() {
  return process.env.CLAUDE_CLI_PATH && fs.existsSync(process.env.CLAUDE_CLI_PATH)
    ? process.env.CLAUDE_CLI_PATH
    : "claude";
}

function codeAgent() {
  return (process.env.GWEN_CODE_AGENT || "codex").toLowerCase();
}

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
    await runCodeAgent(prompt, targetDir);
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
      return `${codeAgent()} CLI isn't installed or isn't on Gwen's PATH. Update GWEN_CODE_AGENT or the CLI path, then try again.`;
    }
    return `Codex finished with an error: ${err.message}`;
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

function runCodex(prompt, cwd) {
  return new Promise((resolve, reject) => {
    let out = "";
    const cap = (text) => {
      out += text;
      if (out.length > 20000) out = out.slice(-20000);
    };
    const child = spawn(
      codexBin(),
      [
        "--ask-for-approval",
        "never",
        "exec",
        "--cd",
        cwd,
        "--sandbox",
        "workspace-write",
        "--color",
        "never",
        prompt,
      ],
      { cwd, env: process.env }
    );

    child.stdout.on("data", (d) => {
      const text = d.toString();
      cap(text);
      sendCodeOutput(text);
    });
    child.stderr.on("data", (d) => {
      const text = `[err] ${d.toString()}`;
      cap(text);
      sendCodeOutput(text);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else {
        const tail =
          out.trim().split("\n").filter(Boolean).slice(-8).join(" ").slice(-600) ||
          `exit ${code}`;
        reject(new Error(tail));
      }
    });
  });
}

function runCodeAgent(prompt, cwd) {
  if (codeAgent() === "claude") return runClaudeCode(prompt, cwd);
  return runCodex(prompt, cwd);
}

function runClaudeCode(prompt, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      claudeBin(),
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
