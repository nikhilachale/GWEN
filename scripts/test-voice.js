// scripts/test-voice.js — end-to-end voice loop with streaming brain → pipelined TTS
// Usage: npm run test:voice
import "dotenv/config";
import { transcribeAudio } from "../src/skills/stt.js";
import { speak } from "../src/skills/tts.js";
import { runBrainStream } from "../src/core/brain.js";

console.log("→ Speak now (cuts off on silence, max 8s)...");
const tStart = Date.now();
const text = await transcribeAudio(8000);
const tStt = Date.now();

if (!text) {
  console.log("✗ No speech detected.");
  process.exit(0);
}

console.log(`you: ${text}    [stt ${tStt - tStart}ms]`);
console.log("→ thinking + speaking...");

let firstSentenceAt = null;
const speakCalls = [];

const fullReply = await runBrainStream(text, (sentence) => {
  if (!firstSentenceAt) firstSentenceAt = Date.now();
  console.log(`MJ: ${sentence}`);
  // Fire each speak() immediately — synthesis runs in parallel,
  // playback is serialized by the internal queue inside tts.js.
  speakCalls.push(speak(sentence));
});

await Promise.all(speakCalls);
const tDone = Date.now();

if (firstSentenceAt) {
  console.log(`\n⏱  stt: ${tStt - tStart}ms | first-token: ${firstSentenceAt - tStt}ms | total: ${tDone - tStart}ms`);
} else {
  console.log(`\n⏱  total: ${tDone - tStart}ms (no streamed sentences)`);
}
console.log(fullReply ? "✓ done" : "✗ empty reply");
