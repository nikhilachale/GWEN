// src/skills/passiveMemory.ts — silently extract durable facts about the user
// from each conversation turn and persist them to SQLite. Fire-and-forget; never
// blocks the speech pipeline.
import Anthropic from "@anthropic-ai/sdk";
import { set, listByCategory, del } from "./sqlite.js";
import { embedAndSave } from "./semanticMemory.js";

const EXTRACTION_MODEL = process.env.GWEN_EXTRACT_MODEL || "claude-haiku-4-5-20251001";
const AUTO_CATEGORY = "auto";
const MIN_CONFIDENCE = 0.75;
const MIN_USER_CHARS = 12;          // skip "yes", "ok", "thanks"
const MAX_INJECT_FACTS = 30;        // cap what we put in the system prompt

const EXTRACTION_TOOL = {
  name: "save_facts",
  description: "Save durable facts about the user that should persist across conversations.",
  input_schema: {
    type: "object",
    properties: {
      facts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "Stable snake_case topic, not the value. e.g. 'lives_in', 'sister_name', 'wakes_up_at', 'job_role'.",
            },
            value: {
              type: "string",
              description: "The fact, in third person, plain prose, voice-friendly.",
            },
            confidence: {
              type: "number",
              description: "0.0–1.0. How sure this is durable, accurate, and worth remembering long-term.",
            },
          },
          required: ["key", "value", "confidence"],
        },
      },
    },
    required: ["facts"],
  },
};

const EXTRACTION_SYSTEM = `You silently extract durable facts about the user from a single conversation exchange between the user and an AI assistant named Gwen. A "durable fact" is something true about the user's life, preferences, relationships, work, location, schedule, or context — NOT ephemeral state.

Rules:
- Only extract NEW facts the user revealed about themselves in this exchange
- Skip ephemeral state (their current question, today's task, momentary mood)
- Skip questions — facts come from statements, not from what the user asked about
- Skip anything that's just the assistant performing a tool call
- Each fact: third person, self-contained, plain prose ("Lives in Pune.", not "I live in Pune.")
- Confidence: 0.9+ explicitly stated; 0.75–0.9 strongly implied; below 0.75 don't include
- Keys should describe the topic, not the value: 'sister_name' not 'sister_jane'
- If a fact updates something already known, use the same key so it overwrites
- If nothing is worth saving, call save_facts with an empty array

Always call save_facts exactly once.`;

export async function extractAndSaveFacts({
  userInput,
  assistantText,
}: {
  userInput: string;
  assistantText: string;
}): Promise<void> {
  const memoryProvider = (process.env.GWEN_MEMORY_PROVIDER || "disabled").toLowerCase();
  const client =
    memoryProvider === "anthropic" && process.env.ANTHROPIC_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
      : null;
  if (memoryProvider !== "anthropic" || !client) return;
  if (!userInput || userInput.trim().length < MIN_USER_CHARS) return;

  try {
    const existing = listByCategory(AUTO_CATEGORY) as Array<{ key: string; value: string }>;
    const knownBlock = existing.length
      ? `\n\nFacts already known about the user (only emit if updating one or adding new):\n${existing
          .slice(-MAX_INJECT_FACTS)
          .map((f) => `- ${f.key}: ${f.value}`)
          .join("\n")}`
      : "";

    const response = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 512,
      system: EXTRACTION_SYSTEM + knownBlock,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "save_facts" },
      messages: [
        {
          role: "user",
          content: `User said: ${userInput}\n\nAssistant replied: ${assistantText}`,
        },
      ],
    });

    const toolUse = response.content.find((b: any) => b.type === "tool_use") as any;
    if (!toolUse) return;
    const facts = (toolUse.input?.facts ?? []) as Array<{
      key: string;
      value: string;
      confidence: number;
    }>;

    for (const fact of facts) {
      if (
        typeof fact.confidence === "number" &&
        fact.confidence >= MIN_CONFIDENCE &&
        fact.key &&
        fact.value
      ) {
        const key = fact.key.startsWith("auto_") ? fact.key : `auto_${fact.key}`;
        set(key, fact.value, AUTO_CATEGORY);
        console.log(`[passive-memory] saved ${key} (conf ${fact.confidence.toFixed(2)}): ${fact.value}`);
        embedAndSave(key, fact.value).catch(() => {});
      }
    }
  } catch (err: any) {
    console.warn("[passive-memory] extraction failed:", err?.message || err);
  }
}

export function getAutoFactsBlock(): string {
  const facts = listByCategory(AUTO_CATEGORY) as Array<{ key: string; value: string }>;
  if (!facts.length) return "";
  const lines = facts
    .slice(-MAX_INJECT_FACTS)
    .map((f) => `- ${f.value}`)
    .join("\n");
  return `\n\nThings you've come to know about the user over time (use naturally, never recite as a list):\n${lines}`;
}

export function forgetAutoFact(key: string): boolean {
  const k = key.startsWith("auto_") ? key : `auto_${key}`;
  return del(k);
}
