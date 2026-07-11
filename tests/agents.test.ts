import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";

import { findAgentForTool, listAgents } from "../src/agents/index.js";

test("agent registry maps documented agents to existing docs", async () => {
  const agents = listAgents();

  assert.ok(agents.length > 0);
  await Promise.all(
    agents.map((agent) => access(path.join(process.cwd(), agent.docPath)))
  );
});

test("agent registry maps owned tools back to agent docs", () => {
  assert.equal(findAgentForTool("get_calendar")?.id, "calendar-agent");
  assert.equal(findAgentForTool("remember")?.id, "memory-agent");
  assert.equal(findAgentForTool("fix_self_code")?.id, "code-agent");
  assert.equal(findAgentForTool("unknown_tool"), null);
});
