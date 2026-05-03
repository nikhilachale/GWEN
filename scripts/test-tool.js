// scripts/test-tool.js — quick smoke test for a single tool
// Usage: npm run test:tool memory
//        npm run test:tool calendar
//        npm run test:tool search "weather in Bhopal"
import "dotenv/config";

const tool = process.argv[2];
const arg = process.argv.slice(3).join(" ");

const tests = {
  async memory() {
    const m = await import("../src/tools/memory.js");
    console.log("→ remember user_name = TestUser");
    console.log(await m.remember({ key: "user_name", value: "TestUser" }));
    console.log("→ recall user_name");
    console.log(await m.recall({ key: "user_name" }));
  },
  async calendar() {
    const c = await import("../src/tools/calendar.js");
    console.log(await c.run({ days: 1 }));
  },
  async email() {
    const e = await import("../src/tools/email.js");
    console.log(await e.run({ count: 3 }));
  },
  async search() {
    const s = await import("../src/tools/search.js");
    console.log(await s.run({ query: arg || "latest tech news" }));
  },
  async tasks() {
    const t = await import("../src/tools/tasks.js");
    console.log(await t.add({ text: "Test task", due: "tomorrow at 3pm" }));
    console.log(await t.list({ filter: "open" }));
  },
  async notes() {
    const n = await import("../src/tools/notes.js");
    console.log(await n.save({ title: "Test note", content: "This is a test" }));
    console.log(await n.search({ query: "test" }));
  },
  async dayplan() {
    const d = await import("../src/tools/dayplan.js");
    console.log(JSON.stringify(await d.run(), null, 2));
  },
  async screen() {
    const s = await import("../src/core/screen.js");
    console.log(await s.getScreenContext());
  },
  async intent() {
    const { detectIntent } = await import("../src/skills/intent.js");
    console.log(detectIntent(arg || "what's on my calendar tomorrow"));
  },
};

if (!tool || !tests[tool]) {
  console.error("Available tools:", Object.keys(tests).join(", "));
  process.exit(1);
}

try {
  await tests[tool]();
} catch (err) {
  console.error("✗ failed:", err);
  process.exit(1);
}
