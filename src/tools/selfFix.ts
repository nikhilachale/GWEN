// src/tools/selfFix.js — let Gwen fix her own code via Codex CLI.
// Spawns `codex exec` in this repo's root so the model edits Gwen's source
// directly.
//
// Safety: brain.ts is instructed to confirm with the user before invoking this.
// All changes are made on the working tree; review with `git diff` and revert
// with `git restore .` if the fix breaks something.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { sendSelfFix, sendCodeOutput, sendCodeDiff } from "../skills/ipc.js";
import { appendSelfBuild } from "../skills/buildLog.js";
import { PROJECT_ROOT } from "../skills/projectRoot.js";
import { relaunchApp } from "../skills/relaunch.js";

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

export async function run({ description, files, relaunch = true } = {}) {
  if (!description || !description.trim()) {
    return "Tell me what to fix.";
  }

  const prompt = buildPrompt(description, files);

  sendSelfFix(true, "rewriting myself");
  try {
    await runCodeAgent(prompt, PROJECT_ROOT);
    const diff = await captureGitDiff(PROJECT_ROOT);
    if (diff) sendCodeDiff(diff);

    // Build gate: never relaunch into source that doesn't compile. The build
    // uses `tsc --noCheck`, which still fails on parse/syntax errors — exactly
    // the catastrophic case, because a broken self-edit plus auto-relaunch is a
    // crash loop (conversation.json resumes the broken state on every boot).
    if (diff && relaunch) {
      sendSelfFix(true, "verifying the build");
      const build = await runBuildGate(PROJECT_ROOT);
      if (!build.ok) {
        const stashed = await stashChanges(PROJECT_ROOT);
        await appendSelfBuild({
          tool: "fix_self_code",
          action: description,
          result: "failed",
          notes: `build failed; changes ${stashed ? "rolled back to a git stash" : "left in tree"}: ${build.tail}`,
        });
        return stashed
          ? `I wrote that fix but it didn't compile, so I rolled it back instead of relaunching into a broken state. The attempt is saved in a git stash — run "git stash pop" to recover it. Build error: ${build.tail}`
          : `I wrote that fix but it didn't compile, and I couldn't cleanly roll it back, so I'm not relaunching. Run "git diff" to inspect. Build error: ${build.tail}`;
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
      return diff
        ? "Fix applied and it compiles. Restarting myself now."
        : "Fix applied. Restarting myself now.";
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
      return `${codeAgent()} CLI isn't installed or isn't on Gwen's PATH. Update GWEN_CODE_AGENT or the CLI path, then try self-fix again.`;
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

// Run the real Electron build and report whether it succeeded, plus a short
// tail of output for a voice-friendly error message.
function runBuildGate(cwd) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "build:electron"], { cwd, env: process.env });
    let out = "";
    const cap = (d) => {
      out += d.toString();
      if (out.length > 20000) out = out.slice(-20000);
    };
    child.stdout.on("data", (d) => { cap(d); sendCodeOutput(d.toString()); });
    child.stderr.on("data", (d) => { cap(d); sendCodeOutput(`[build] ${d.toString()}`); });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, tail: "build timed out after 120s" });
    }, 120000);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, tail: `build could not start: ${e.message}` });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const tail =
        out.trim().split("\n").filter(Boolean).slice(-6).join(" ").slice(-400) ||
        `exit ${code}`;
      resolve({ ok: code === 0, tail });
    });
  });
}

// Non-destructive rollback: stash tracked + untracked changes (NOT gitignored
// files, so data/ and .env survive). Recoverable with `git stash pop`.
function stashChanges(cwd) {
  return new Promise((resolve) => {
    const msg = `gwen-failed-selffix ${new Date().toISOString()}`;
    const child = spawn(
      "git",
      ["stash", "push", "--include-untracked", "-m", msg],
      { cwd, env: process.env }
    );
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
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
      { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] }
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

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("code agent timed out after 180s"));
    }, 180000);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
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
      { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] }
    );

    child.stdout.on("data", (d) => sendCodeOutput(d.toString()));
    child.stderr.on("data", (d) => sendCodeOutput(`[err] ${d.toString()}`));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("code agent timed out after 180s"));
    }, 180000);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`exit ${code}`));
    });
  });
}
