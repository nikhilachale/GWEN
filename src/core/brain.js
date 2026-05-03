// src/core/brain.js — Claude orchestrator + tool-use loop
import Anthropic from "@anthropic-ai/sdk";

import * as calendarTool from "../tools/calendar.js";
import * as emailTool    from "../tools/email.js";
import * as searchTool   from "../tools/search.js";
import * as tasksTool    from "../tools/tasks.js";
import * as notesTool    from "../tools/notes.js";
import * as memoryTool   from "../tools/memory.js";
import * as dayPlanTool  from "../tools/dayplan.js";
import * as codegenTool  from "../tools/codegen.js";
import * as macTool      from "../tools/macControl.js";
import * as filesTool    from "../tools/files.js";
import * as screenCore   from "./screen.js";

const MODEL = process.env.MJ_BRAIN_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_TURNS = 8;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ─── Tool definitions ────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_calendar",
    description: "Get upcoming Google Calendar events for the next N days.",
    input_schema: {
      type: "object",
      properties: {
        days:  { type: "number", description: "How many days ahead. Default 1." },
        query: { type: "string", description: "Optional keyword filter." },
      },
    },
  },
  {
    name: "get_emails",
    description: "Get unread Gmail messages. Read-only.",
    input_schema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Max unread to fetch. Default 5." },
        from:  { type: "string", description: "Sender filter." },
        query: { type: "string", description: "Gmail search query." },
      },
    },
  },
  {
    name: "search_web",
    description: "Search the web for current info.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        count: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "add_task",
    description: "Add a task or reminder.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        due:  { type: "string", description: "Natural language, e.g. 'tomorrow at 3pm'." },
      },
      required: ["text"],
    },
  },
  {
    name: "get_tasks",
    description: "List tasks.",
    input_schema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["all", "today", "overdue", "open"] },
      },
    },
  },
  {
    name: "save_note",
    description: "Save a freeform note as markdown.",
    input_schema: {
      type: "object",
      properties: {
        title:   { type: "string" },
        content: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "get_notes",
    description: "List or search saved notes.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
    },
  },
  {
    name: "remember",
    description: "Store a fact or preference in long-term memory.",
    input_schema: {
      type: "object",
      properties: {
        key:      { type: "string" },
        value:    { type: "string" },
        category: { type: "string" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "recall",
    description: "Retrieve a stored memory by key.",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    name: "get_day_plan",
    description: "Generate the morning briefing combining calendar, tasks, and memory.",
    input_schema: {
      type: "object",
      properties: {
        tone: { type: "string", enum: ["briefing", "casual", "motivational"] },
      },
    },
  },
  {
    name: "build_software",
    description: "Spawn Claude Code to build software based on a description.",
    input_schema: {
      type: "object",
      properties: {
        request:   { type: "string" },
        dir:       { type: "string" },
        framework: { type: "string" },
      },
      required: ["request"],
    },
  },
  {
    name: "get_screen_context",
    description: "Capture and describe the user's current screen.",
    input_schema: {
      type: "object",
      properties: {
        focus: { type: "string" },
      },
    },
  },
  {
    name: "open_app",
    description: "Open a Mac application by name (e.g. 'Safari', 'WhatsApp', 'code'). Use friendly names — aliases are resolved automatically.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "App name or alias." },
        path: { type: "string", description: "Optional file or URL to open inside the app." },
      },
      required: ["name"],
    },
  },
  {
    name: "type_text",
    description: "Type text into the currently focused Mac app. Optionally focus an app first. Requires Accessibility permission.",
    input_schema: {
      type: "object",
      properties: {
        text:       { type: "string" },
        app:        { type: "string", description: "Optional app to focus before typing." },
        pressEnter: { type: "boolean", description: "Press Return after typing. Default false." },
      },
      required: ["text"],
    },
  },
  {
    name: "send_imessage",
    description: "Send an iMessage to a contact via the macOS Messages app. Confirm with the user before sending.",
    input_schema: {
      type: "object",
      properties: {
        contact: { type: "string", description: "Contact name, phone number, or email." },
        message: { type: "string" },
      },
      required: ["contact", "message"],
    },
  },
  {
    name: "send_whatsapp",
    description: "Send a WhatsApp message via WhatsApp Desktop. Confirm with the user before sending. Set draftOnly to leave the user to press send.",
    input_schema: {
      type: "object",
      properties: {
        contact:   { type: "string" },
        message:   { type: "string" },
        draftOnly: { type: "boolean", description: "If true, type message but don't press send. Default false." },
      },
      required: ["contact", "message"],
    },
  },
  {
    name: "list_files",
    description: "List files and folders at a path on the user's Mac. Accepts shortcuts like 'desktop', 'downloads', 'documents', 'home', or any absolute/tilde path. Defaults to Desktop. Hidden files (.*) excluded.",
    input_schema: {
      type: "object",
      properties: {
        path:        { type: "string", description: "Path or shortcut. Default 'desktop'." },
        foldersOnly: { type: "boolean", description: "Only return folders. Default false." },
        limit:       { type: "number", description: "Max entries to return. Default 50." },
      },
    },
  },
  {
    name: "open_path",
    description: "Open a file or folder in Finder (or its default app). Set reveal=true to highlight it in Finder instead of opening it.",
    input_schema: {
      type: "object",
      properties: {
        path:   { type: "string", description: "Path or shortcut (e.g. 'desktop', '~/Downloads', or absolute path)." },
        reveal: { type: "boolean", description: "Reveal in Finder instead of opening. Default false." },
      },
      required: ["path"],
    },
  },
];

// ─── Handler map ─────────────────────────────────────────────────────
const handlers = {
  get_calendar:       (i) => calendarTool.run(i),
  get_emails:         (i) => emailTool.run(i),
  search_web:         (i) => searchTool.run(i),
  add_task:           (i) => tasksTool.add(i),
  get_tasks:          (i) => tasksTool.list(i),
  save_note:          (i) => notesTool.save(i),
  get_notes:          (i) => notesTool.search(i),
  remember:           (i) => memoryTool.remember(i),
  recall:             (i) => memoryTool.recall(i),
  get_day_plan:       (i) => dayPlanTool.run(i),
  build_software:     (i) => codegenTool.run(i),
  get_screen_context: (i) => screenCore.getScreenContext(i?.focus),
  open_app:           (i) => macTool.openApp(i),
  type_text:          (i) => macTool.typeText(i),
  send_imessage:      (i) => macTool.sendIMessage(i),
  send_whatsapp:      (i) => macTool.sendWhatsApp(i),
  list_files:         (i) => filesTool.listFiles(i),
  open_path:          (i) => filesTool.openPath(i),
};

// ─── System prompt ───────────────────────────────────────────────────
function buildSystemPrompt({ userName, intentHint }) {
  const date = new Date().toDateString();
  let prompt = `You are MJ, a JARVIS-style AI assistant. You are sharp, witty, confident, loyal.
Your voice is calm and dry. You address the user as "sir" or by name, sparingly.
You think one step ahead and offer the next useful action without being asked.

Today is ${date}. The user's name is ${userName || "sir"}.

You speak — never write. Output is fed straight to text-to-speech, so:
- No markdown, bullets, headers, code blocks, or emoji
- No "Here's what I found:" preambles. State the result directly.
- No meta-narration ("Let me check...", "I'll now use the tool..."). Just act.
- Numbers, times, and dates: spell them naturally ("three thirty PM", not "15:30")

Response length — match the request. This is the most important rule:

  ONE WORD or PHRASE for acknowledgements and confirmations:
    "Opened Safari." / "Done." / "Got it." / "On it, sir."

  ONE SENTENCE for facts, simple answers, status:
    "It's three forty PM." / "No new mail." / "Three tasks pending."

  TWO TO FOUR SENTENCES for explanations, recommendations, or summaries:
    Most replies live here. Lead with the answer, then one line of context.

  LONGER only when the user explicitly asks ("tell me everything", "explain in
  detail", "give me the rundown") — and even then, break it into short sentences.

  LISTS: read the items naturally. For five calendar events, say "You have five
  today" then name the next two or three. Don't read all five unless asked.

Before any send_imessage or send_whatsapp call, repeat the contact and the
message back in one short sentence and wait for "yes" / "send it" before sending.

Tool routing:
- time, schedule, meetings → get_calendar
- inbox, mail, messages from email → get_emails
- "remember that..." → remember
- "what do I prefer..." or recalling user info → recall first
- "build / create / make me" software → build_software
- "what's on my screen" → get_screen_context
- "open / launch / start" an app → open_app
- "what's in [folder]", "list my desktop", "show me downloads" → list_files
- "open / show me / reveal" a folder or file → open_path
- iMessage → send_imessage (confirm first)
- WhatsApp → send_whatsapp (confirm first)
- current events, facts you're unsure of → search_web
- morning briefing → get_day_plan

All tools listed above are wired up and authorized. Never tell the user a tool
or service "isn't connected" or "needs setup" without first calling the tool
and seeing the actual result. Always try the tool first.

If you can answer from memory or general knowledge without a tool, just answer.
Don't call tools you don't need.

If a tool returns an error, don't read the error verbatim. Briefly say it didn't
work and offer the next sensible step.`;

  if (intentHint && intentHint.confidence >= 0.7) {
    prompt += `\n\nDetected intent: ${intentHint.type} (confidence ${intentHint.confidence}).`;
  }

  return prompt;
}

// ─── Main entry ──────────────────────────────────────────────────────
/**
 * Run a single turn through the brain.
 * @param {string} userInput
 * @param {{ intentHint?: object }} [opts]
 * @returns {Promise<string>} Final spoken text.
 */
export async function runBrain(userInput, opts = {}) {
  const userName = await safeRecall("user_name");
  const system = buildSystemPrompt({ userName, intentHint: opts.intentHint });

  const messages = [{ role: "user", content: userInput }];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.2,
    system,
    tools: TOOLS,
    messages,
  });

  let turn = 0;
  while (response.stop_reason === "tool_use" && turn < MAX_TOOL_TURNS) {
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const result = await handlers[tu.name](tu.input || {});
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (err) {
          console.error(`[brain] tool ${tu.name} failed:`, err);
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error running ${tu.name}: ${err.message}`,
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
    temperature: 0.2,
      system,
      tools: TOOLS,
      messages,
    });

    turn++;
  }

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "I'm not sure how to respond to that.";
}

/**
 * Streaming variant. Calls onSentence(text) for each complete sentence as it arrives.
 * Returns the full final reply text once done.
 * @param {string} userInput
 * @param {(sentence: string) => void} onSentence
 * @param {{ intentHint?: object }} [opts]
 * @returns {Promise<string>}
 */
export async function runBrainStream(userInput, onSentence = () => {}, opts = {}) {
  const userName = await safeRecall("user_name");
  const system = buildSystemPrompt({ userName, intentHint: opts.intentHint });
  const messages = [{ role: "user", content: userInput }];

  let fullText = "";
  let turn = 0;

  while (turn <= MAX_TOOL_TURNS) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
    temperature: 0.2,
      system,
      tools: TOOLS,
      messages,
    });

    let buffer = "";
    let turnText = "";

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta"
      ) {
        const chunk = event.delta.text || "";
        buffer += chunk;
        turnText += chunk;
        const { sentences, remainder } = splitSentences(buffer);
        for (const s of sentences) if (s.trim()) onSentence(s.trim());
        buffer = remainder;
      }
    }

    const finalMessage = await stream.finalMessage();
    fullText += turnText;

    if (buffer.trim()) {
      onSentence(buffer.trim());
      buffer = "";
    }

    if (finalMessage.stop_reason !== "tool_use") return fullText;

    const toolUses = finalMessage.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const result = await handlers[tu.name](tu.input || {});
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (err) {
          console.error(`[brain] tool ${tu.name} failed:`, err);
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error running ${tu.name}: ${err.message}`,
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "assistant", content: finalMessage.content });
    messages.push({ role: "user", content: toolResults });
    turn++;
  }

  return fullText || "I'm not sure how to respond to that.";
}

function splitSentences(buffer) {
  const sentences = [];
  const regex = /([.!?])(\s+|$)/g;
  let lastEnd = 0;
  let match;
  while ((match = regex.exec(buffer)) !== null) {
    if (match.index + match[0].length === buffer.length && match[2] !== "") {
      break;
    }
    sentences.push(buffer.slice(lastEnd, match.index + 1));
    lastEnd = match.index + match[0].length;
  }
  return { sentences, remainder: buffer.slice(lastEnd) };
}

async function safeRecall(key) {
  try {
    const r = await memoryTool.recall({ key });
    return typeof r === "string" ? r : (r?.value ?? null);
  } catch {
    return null;
  }
}
