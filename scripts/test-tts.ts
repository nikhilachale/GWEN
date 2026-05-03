// scripts/test-tts.js — speak text through the active TTS provider with timing.
// Usage:
//   node scripts/test-tts.js "Hello, I am MJ."
//   MJ_TTS_PROVIDER=fish node scripts/test-tts.js "Compare this voice."
//   MJ_TTS_PROVIDER=eleven node scripts/test-tts.js "Now compare this one."
import "dotenv/config";
import { speak } from "../src/skills/tts.js";

const text = process.argv.slice(2).join(" ").trim()
  || "Good morning. All systems are online and ready.";

const forced = process.env.MJ_TTS_PROVIDER;
const active = forced
  || (process.env.FISH_KEY && "fish")
  || (process.env.ELEVEN_KEY && process.env.ELEVEN_VOICE_ID && "eleven")
  || "say";

console.log(`→ provider: ${active}${forced ? " (forced)" : ""}`);
console.log(`→ text: ${text}`);

const t0 = Date.now();
await speak(text);
console.log(`✓ done in ${Date.now() - t0}ms`);
