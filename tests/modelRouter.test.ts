import test from "node:test";
import assert from "node:assert/strict";

import { chooseBrainRoute } from "../src/skills/modelRouter.js";

test("routes Gwen feature requests to the tool-capable self-fix brain", () => {
  const route = chooseBrainRoute(
    "build the task tracker into memory and wire up the daily check-in prompt",
    { hasAnthropic: true, hasOllama: true, allowTools: true }
  );

  assert.equal(route.provider, "anthropic");
  assert.equal(route.toolsEnabled, true);
  assert.match(route.reason, /Gwen code\/self-fix/);
});

test("routes generic daily check-in feature requests to tools", () => {
  const route = chooseBrainRoute(
    "add a daily check-in feature so you ask about my tasks every morning",
    { hasAnthropic: true, hasOllama: true, allowTools: true }
  );

  assert.equal(route.provider, "anthropic");
  assert.equal(route.toolsEnabled, true);
  assert.match(route.reason, /Gwen code\/self-fix/);
});
