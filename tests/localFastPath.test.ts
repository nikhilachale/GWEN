import test from "node:test";
import assert from "node:assert/strict";

import { tryLocalFastPath } from "../src/core/localFastPath.js";
import { clearPendingTool, getPendingTool, setPendingTool } from "../src/skills/security.js";

test("routes Gwen code-change requests directly to fix_self_code confirmation", async () => {
  clearPendingTool();
  const calls: Array<{ input: any }> = [];

  const reply = await tryLocalFastPath(
    "make code changes so Gwen can spawn Codex in this folder",
    {
      handlers: {
        fix_self_code: async (input) => {
          calls.push({ input });
          return "should not execute before confirmation";
        },
      },
    },
    { skipHistory: true }
  );

  assert.match(reply || "", /Reply "yes"/);
  assert.equal(calls.length, 0);
  assert.equal(getPendingTool()?.name, "fix_self_code");
  clearPendingTool();
});

test("does not intercept replies while a tool confirmation is pending", async () => {
  clearPendingTool();
  setPendingTool("fix_self_code", { description: "test" }, "Fixing herself: test");

  const reply = await tryLocalFastPath(
    "ok",
    {
      handlers: {
        fix_self_code: async () => "executed",
      },
    },
    { skipHistory: true }
  );

  assert.equal(reply, null);
  assert.equal(getPendingTool()?.name, "fix_self_code");
  clearPendingTool();
});

test("routes common feature/fix phrases to fix_self_code confirmation", async () => {
  const examples = [
    "build this feature",
    "make the changes in code",
    "fix this thing",
    "fix this bug",
    "implement this",
  ];

  for (const text of examples) {
    clearPendingTool();
    const reply = await tryLocalFastPath(
      text,
      {
        handlers: {
          fix_self_code: async () => "should not execute before confirmation",
        },
      },
      { skipHistory: true }
    );

    assert.match(reply || "", /Reply "yes"/, text);
    assert.equal(getPendingTool()?.name, "fix_self_code", text);
  }

  clearPendingTool();
});

test("routes visual progress requests to fix_self_code confirmation", async () => {
  clearPendingTool();
  const reply = await tryLocalFastPath(
    "add a loading state or progress animation so I can see when Gwen is updating herself",
    {
      handlers: {
        fix_self_code: async () => "should not execute before confirmation",
      },
    },
    { skipHistory: true }
  );

  assert.match(reply || "", /Reply "yes"/);
  assert.equal(getPendingTool()?.name, "fix_self_code");
  clearPendingTool();
});
