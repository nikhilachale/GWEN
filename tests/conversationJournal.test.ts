import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function loadJournal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gwen-journal-test-"));
  process.env.GWEN_MEMORY_DB_PATH = path.join(dir, "memory.db");
  const mod = await import(`../src/skills/conversationJournal.js?case=${Date.now()}${Math.random()}`);
  mod.__resetConversationJournalForTests();
  return mod;
}

test("records exchanges and builds a daily summary", async () => {
  const journal = await loadJournal();

  const summary = journal.recordConversationExchange({
    conversationId: "conv_a",
    conversationTitle: "Daily work",
    userText: "Help me plan the Gwen memory feature.",
    assistantText: "We should store turns and daily context in SQLite.",
    occurredAt: new Date("2026-07-11T09:30:00.000Z"),
  });

  assert.equal(summary.day, "2026-07-11");
  assert.equal(summary.exchange_count, 1);
  assert.match(summary.summary, /Gwen memory feature/);
  assert.equal(journal.listDailyExchanges("2026-07-11").length, 1);
});

test("links keep-in-mind requests into the daily context block", async () => {
  const journal = await loadJournal();

  journal.recordConversationExchange({
    conversationId: "conv_b",
    userText: "Remember that I prefer short direct answers.",
    assistantText: "Got it.",
    occurredAt: new Date("2026-07-11T10:00:00.000Z"),
  });

  const block = journal.getDailyPersonalContextBlock(new Date("2026-07-11T12:00:00.000Z"));

  assert.match(block, /SQLite journal/);
  assert.match(block, /prefer_short_direct_answers/);
  assert.match(block, /running summary/i);
});
