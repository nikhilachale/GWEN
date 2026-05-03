// scripts/test-brain.js — run a typed prompt through the brain
// Usage: npm run test:brain "What's on my schedule today?"
import "dotenv/config";
import { runBrain } from "../src/core/brain.js";

const input = process.argv.slice(2).join(" ");
if (!input) {
  console.error("Usage: npm run test:brain \"your prompt here\"");
  process.exit(1);
}

console.log("→", input, "\n");

try {
  const reply = await runBrain(input);
  console.log("MJ:", reply);
} catch (err) {
  console.error("✗ brain failed:", err);
  process.exit(1);
}
