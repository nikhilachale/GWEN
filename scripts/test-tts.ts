// scripts/test-tts.js — speak text through the active TTS provider with timing.
// Usage:
//   node scripts/test-tts.js "Hello, I am Gwen."
import "dotenv/config";
import { speak } from "../src/skills/tts.js";

const text = process.argv.slice(2).join(" ").trim()
  || "Good morning. All systems are online and ready.";
const provider = (process.env.GWEN_TTS_PROVIDER || "fish").toLowerCase();

console.log(`→ provider: ${provider}`);
console.log(`→ text: ${text}`);

const t0 = Date.now();
await speak(text);
console.log(`✓ done in ${Date.now() - t0}ms`);
