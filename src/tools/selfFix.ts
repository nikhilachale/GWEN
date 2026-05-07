// src/tools/selfFix.js — let Gwen fix her own code via Claude Code CLI.
// Spawns `claude --print` in this repo's root so the model edits Gwen's source
// directly. Output streams to the UI via gwen:code-output.
//
// Safety: brain.ts is instructed to confirm with the user before invoking this.
// All changes are made on the working tree; review with `git diff` and revert
// with `git restore .` if the fix breaks something.
import { spawn } from "node:child_process";
import { sendCodeOutput, sendSelfFix, sendCodeDiff, sendActivity } from "../skills/ipc.js";
import { appendSelfBuild } from "../skills/buildLog.js";
import { PROJECT_ROOT } from "../skills/projectRoot.js";
import { relaunchApp } from "../skills/relaunch.js";
import { parseUnifiedDiff } from "../skills/diffParse.js";

export async function run({ description, files, relaunch = true } = {}) {
  if (!description || !description.trim()) {
    return "Tell me what to fix.";
  }

  const prompt = buildPrompt(description, files);

  sendSelfFix(true, "rewriting myself");
  try {
    await runClaudeCode(prompt, PROJECT_ROOT);
    const diff = await captureGitDiff(PROJECT_ROOT);
    if (diff) {
      sendCodeDiff(diff);
      // Stream one card per modified file into the right-column activity feed
      // so Miles can see exactly which files moved and how many lines.
      for (const f of parseUnifiedDiff(diff)) {
        sendActivity({
          kind: "diff",
          summary: `${f.file}  +${f.added} −${f.removed}`,
          detail: f.hunks,
          added: f.added,
          removed: f.removed,
        });
      }
    }
    await appendSelfBuild({
      tool: "fix_self_code",
      action: description,
      result: "ok",
      notes: Array.isArray(files) && files.length ? `files: ${files.join(", ")}` : undefined,
    });
    if (relaunch) {
      // Delay so the spoken reply finishes before the window dies, and the
      // user has a moment to see the diff. The detached `npm run dev` will
      // respawn the dev pipeline; conversation history persists via
      // data/conversation.json so we resume on boot.
      setTimeout(() => relaunchApp(), diff ? 8000 : 2500);
      return "Fix applied. Restarting myself now.";
    }
    return "Fix applied. Review with git diff.";
  } catch (err) {
    await appendSelfBuild({
      tool: "fix_self_code",
      action: description,
      result: "failed",
      notes: err.message,
    });
    if (err.code === "ENOENT") {
      return "Claude Code isn't installed. Run npm install -g @anthropic-ai/claude-code first.";
    }
    return `Self-fix failed: ${err.message}`;
  } finally {
    sendSelfFix(false);
  }
}

function buildPrompt(description, files) {
  const fileHint =
    Array.isArray(files) && files.length
      ? `\n\nFocus on: ${files.join(", ")}`
      : "";
  return `You are editing the Gwen project (this repo). Read CLAUDE.md first.

Fix request: ${description}${fileHint}

Rules:
- Make the smallest targeted change that fixes the issue.
- Do not refactor unrelated code.
- Do not add comments unless the bug requires it.
- Do not run npm install, the dev server, or any tests.
- Do not create new files unless strictly necessary.
- When done, print one sentence describing what you changed.`;
}

function captureGitDiff(cwd) {
  return new Promise((resolve) => {
    const child = spawn("git", ["diff", "--no-color", "HEAD"], { cwd, env: process.env });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve(""));
    child.on("exit", () => resolve(out));
  });
}

function runClaudeCode(prompt, cwd) {
  return new Promise((resolve, reject) => {
    // --permission-mode acceptEdits auto-accepts file edits in non-interactive
    // mode. Without it, Edit/Write tool calls are silently denied and claude
    // exits 0 having made no changes.
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
