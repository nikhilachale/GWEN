import test from "node:test";
import assert from "node:assert/strict";

import { runVoiceTurn } from "../src/core/voicePipeline.js";

test("runVoiceTurn sends STT transcript through brain and TTS", async () => {
  const spoken: string[] = [];

  const result = await runVoiceTurn(
    { maxMs: 2500, brainOptions: { skipHistory: true } },
    {
      transcribe: async (maxMs) => {
        assert.equal(maxMs, 2500);
        return "what time is it";
      },
      think: async (input, opts) => {
        assert.equal(input, "what time is it");
        assert.deepEqual(opts, { skipHistory: true });
        return "It's three thirty PM.";
      },
      speak: async (text) => {
        spoken.push(text);
      },
    }
  );

  assert.deepEqual(result, {
    transcript: "what time is it",
    response: "It's three thirty PM.",
    spoken: true,
  });
  assert.deepEqual(spoken, ["It's three thirty PM."]);
});

test("runVoiceTurn stops when STT returns silence", async () => {
  let brainCalled = false;
  let ttsCalled = false;

  const result = await runVoiceTurn(
    {},
    {
      transcribe: async () => "   ",
      think: async () => {
        brainCalled = true;
        return "Should not run.";
      },
      speak: async () => {
        ttsCalled = true;
      },
    }
  );

  assert.deepEqual(result, { transcript: "", response: "", spoken: false });
  assert.equal(brainCalled, false);
  assert.equal(ttsCalled, false);
});
