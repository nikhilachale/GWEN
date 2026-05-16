import test from "node:test";
import assert from "node:assert/strict";

import { detectIntent } from "../src/skills/intent.js";

test("detectIntent returns null for empty input", () => {
  assert.equal(detectIntent(""), null);
  assert.equal(detectIntent("   "), null);
});

test("detectIntent returns null when no pattern matches", () => {
  assert.equal(detectIntent("open sesame"), null);
});

test("detectIntent classifies reminders as task intents and extracts task text", () => {
  assert.deepEqual(detectIntent("remind me to submit the invoice"), {
    type: "task",
    confidence: 0.95,
    entities: { taskText: "submit the invoice" },
  });
});

test("detectIntent prefers the highest-confidence matching pattern", () => {
  const intent = detectIntent("what meetings are on my calendar");

  assert.equal(intent?.type, "calendar");
  assert.equal(intent?.confidence, 0.95);
});

test("detectIntent extracts search queries", () => {
  assert.deepEqual(detectIntent("search nearest coffee shop"), {
    type: "search",
    confidence: 0.8,
    entities: { query: "nearest coffee shop" },
  });
});

test("detectIntent falls back to the full text when an entity trigger has no tail", () => {
  assert.deepEqual(detectIntent("note this"), {
    type: "note",
    confidence: 0.9,
    entities: { noteContent: "note this" },
  });
});
