import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  clearPendingTool,
  getPendingConfirmation,
  isConfirmation,
  requiredConfirmationText,
  setPendingTool,
} from "../src/skills/security.js";
import { TOOL_POLICIES, validateToolPolicies } from "../src/skills/toolPolicy.js";

test("registered brain tools and security policies stay in sync", async () => {
  const brainSource = await readFile(path.join(process.cwd(), "src/core/brain.ts"), "utf8");
  const toolsBlock = brainSource.slice(
    brainSource.indexOf("const TOOLS = ["),
    brainSource.indexOf("// ─── Handler map")
  );
  const names = [...toolsBlock.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(names.length > 0);
  validateToolPolicies(names);
  assert.deepEqual(new Set(names), new Set(Object.keys(TOOL_POLICIES)));
});

test("sensitive tools accept ordinary confirmation", () => {
  assert.equal(isConfirmation("yes", "get_calendar"), true);
  assert.equal(isConfirmation("go ahead", "get_calendar"), true);
});

test("destructive tools require exact confirmation text", () => {
  assert.equal(requiredConfirmationText("send_imessage"), "confirm send");
  assert.equal(isConfirmation("yes", "send_imessage"), false);
  assert.equal(isConfirmation("send it", "send_imessage"), false);
  assert.equal(isConfirmation("confirm send", "send_imessage"), true);
});

test("pending confirmation exposes the required approval phrase", () => {
  clearPendingTool();
  setPendingTool("call_phone", { number: "555-0100" }, "Call 555-0100");
  const pending = getPendingConfirmation();
  assert.equal(pending?.name, "call_phone");
  assert.equal(pending?.risk, "destructive");
  assert.equal(pending?.requiredText, "confirm call");
  clearPendingTool();
});
