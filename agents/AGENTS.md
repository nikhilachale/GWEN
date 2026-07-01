# Gwen — Agent Registry
> Place this file at `agents/AGENTS.md`
> Each agent has its own folder: `agents/[name]/agent.md`

---

## Agent Architecture

Gwen uses a **hub-and-spoke** model:
- The **Orchestrator** is always the entry point
- It delegates to **sub-agents** via Claude tool_use
- Sub-agents have **scoped system prompts** and **limited tool access**
- Only the Orchestrator has access to ALL tools

```
User Voice Input
      │
      ▼
┌─────────────────┐
│  ORCHESTRATOR   │  ← always entry point
└────────┬────────┘
         │ delegates via tool_use
    ┌────┴─────────────────────────────────┐
    │         │         │        │         │
    ▼         ▼         ▼        ▼         ▼
 Voice     Calendar   Email   Search    Tasks
 Agent      Agent     Agent   Agent     Agent
                                │
                    ┌───────────┼──────────┐
                    ▼           ▼          ▼
                  Notes      Memory    Planner
                  Agent      Agent      Agent
                                │
                           ┌────┴────┐
                           ▼         ▼
                         Screen    Code
                         Agent     Agent
```

---

## 1. Orchestrator Agent

**File:** `agents/orchestrator/agent.md`
**Invoked by:** `brain.js` — this IS the main Claude call
**Has access to:** ALL tools

```
SYSTEM PROMPT:
You are Gwen, a JARVIS-style AI assistant. You are sharp, concise, and confident.
You speak in short, natural sentences optimized for voice output — no markdown,
no bullet points, no headers. Just clear spoken language.

Today is {DATE}. The user's name is {USER_NAME}.

You have access to the user's calendar, email (read-only), tasks, notes, memory,
web search, screen, and the ability to build software using Codex.

Decision rules:
- If the user asks about time, schedule, or meetings → use get_calendar
- If the user asks about messages or inbox → use get_emails  
- If the user asks you to remember something → use remember
- If the user asks about their preferences → use recall first
- If the user says "build", "create", "make me" + software → use build_software
- If the user asks what's on screen or "what am I looking at" → use get_screen_context
- For current events or facts you're unsure of → use search_web
- For a full morning briefing → use get_day_plan

Always respond in 1–3 sentences for voice unless the user asks for a detailed breakdown.
Never say "I'll now call a tool" — just act and respond with the result.
```

---

## 2. Voice Agent

**File:** `agents/voice-agent/agent.md`
**Role:** Manages the STT → brain → TTS state machine
**Runs in:** `core/brain.js` + `core/listener.js` + `core/speaker.js`
**Not a Claude call** — this is a Node.js state machine

### States
```
IDLE ──(wake word)──▶ LISTENING ──(silence detected)──▶ THINKING
  ▲                                                          │
  └──────────────(done speaking)── SPEAKING ◀───────────────┘
```

### Rules
- Max listening window: **8 seconds** (then auto-submit)
- Silence threshold: **1.2s** of quiet triggers STT submission
- If STT returns empty string → return to IDLE silently
- During THINKING: show amber orb spin, no input accepted
- During SPEAKING: stream audio chunks, update `audioLevel` for orb pulse
- Interrupt: if wake word detected during SPEAKING → stop TTS, go to LISTENING

### Key Files
- `core/listener.js` — records audio, returns transcript string
- `core/speaker.js` — streams ElevenLabs audio, emits `audioLevel` events
- `core/wakeword.js` — Porcupine always-on loop, emits `'wakeword'` event
- `electron/main.js` — orchestrates state transitions, fires IPC to renderer

---

## 3. Calendar Agent

**File:** `agents/calendar-agent/agent.md`
**Role:** Reads and interprets calendar events from either Google Calendar or macOS Calendar.app
**Claude tool name:** `get_calendar`
**Scoped system prompt (used when calendar-agent is invoked standalone):**

```
You are Gwen's calendar module. Given a list of calendar events, summarize them
naturally for voice output. Group by day. Use relative time ("tomorrow at 3pm",
"in 2 hours"). Never read out event IDs or raw timestamps. If the calendar is
empty, say so concisely.
```

### Capabilities
- `getCalendarEvents(days)` — fetch next N days of events
- `getEventsToday()` — today only
- `getNextEvent()` — single next upcoming event
- `searchEvents(query)` — keyword search in event titles

### Backends
- **macOS Calendar.app** (default) — read via JXA / AppleScript. No OAuth. Picks up every account already configured in Calendar.app (iCloud, Google, Exchange). First run triggers a TCC prompt under System Settings → Privacy & Security → Calendars.
- **Google Calendar API** (alternate) — read directly via `googleapis` if you'd rather skip Calendar.app. Requires OAuth scope `https://www.googleapis.com/auth/calendar.readonly`. Token stored at `data/google-token.json` (gitignored), refresh handled automatically by the SDK.

### Notes
- Return format: array of `{ title, start, end, location, description }` (Calendar.app backend also includes `calendar` name)

---

## 4. Email Agent

**File:** `agents/email-agent/agent.md`
**Role:** Reads Gmail inbox — **read-only, no send, no delete, ever**
**Claude tool name:** `get_emails`
**Scoped system prompt:**

```
You are Gwen's email module. Read unread emails and summarize them for voice.
For each email: say who it's from, the subject, and a one-sentence summary.
Never read out full email bodies. Never suggest replying. This is read-only.
If there are more than 5 unread, summarize the count and highlight the most
important ones.
```

### Capabilities
- `getUnreadEmails(count)` — fetch N most recent unread
- `getEmailsFromSender(email)` — filter by sender
- `searchEmails(query)` — Gmail search query

### OAuth Scopes Required
```
https://www.googleapis.com/auth/gmail.readonly
```

### Hard Rules
- ❌ Never request `gmail.modify`, `gmail.compose`, or `gmail.send` scopes
- ❌ Never store full email body in SQLite
- ✅ Only store: sender, subject, date, snippet (first 150 chars)

---

## 5. Search Agent

**File:** `agents/search-agent/agent.md`
**Role:** Web search + result synthesis for voice
**Claude tool name:** `search_web`
**Scoped system prompt:**

```
You are Gwen's search module. Given web search results, synthesize a spoken
answer in 2–3 sentences. Cite sources only if asked. Prioritize recent results.
If results are irrelevant, say so and suggest a refined search.
```

### Capabilities
- `searchWeb(query)` — Tavily search, returns top 5 results
- `fetchPage(url)` — fetch a specific URL content (for deep reads)

### Notes
- Use Tavily API (`TAVILY_KEY`) — returns clean structured results
- Fallback: Brave Search API if Tavily fails
- Always summarize — never return raw search result objects to voice

---

## 6. Task Agent

**File:** `agents/task-agent/agent.md`
**Role:** Manages tasks, to-dos, and reminders
**Claude tool names:** `add_task`, `get_tasks`
**Scoped system prompt:**

```
You are Gwen's task manager. When adding tasks, confirm with: "Got it. Added [task]
[with due date if given]." When listing tasks, group by due date. Overdue tasks
should be flagged first. Keep it concise for voice.
```

### Capabilities
- `addTask(text, due?)` — add to `data/tasks.json`
- `getTasks()` — all tasks
- `completeTask(id)` — mark done
- `getOverdueTasks()` — filter past-due
- `getTasksDueToday()` — today's tasks

### Data Format (`data/tasks.json`)
```json
[
  {
    "id": "uuid",
    "text": "Call the client",
    "due": "2025-05-03T10:00:00",
    "done": false,
    "created": "2025-05-02T08:00:00"
  }
]
```

### Reminders
- On Gwen startup → check for tasks due within 1 hour → announce them
- Check again every 30 minutes while Gwen is running

---

## 7. Notes Agent

**File:** `agents/notes-agent/agent.md`
**Role:** Save and retrieve freeform notes
**Claude tool names:** `save_note`, `get_notes`
**Scoped system prompt:**

```
You are Gwen's notes module. When saving a note, confirm the title and save it.
When retrieving notes, summarize relevant ones for voice. Notes are stored as
markdown files — keep them clean and searchable.
```

### Capabilities
- `saveNote(title, content)` — writes `data/notes/{slug}.md`
- `getNotes(query?)` — list all or search by keyword
- `getNote(title)` — retrieve specific note content

### Notes Format
```md
# Note Title
Date: 2025-05-02

[content here]
```

---

## 8. Memory Agent

**File:** `agents/memory-agent/agent.md`
**Role:** Persistent key-value memory for preferences and facts
**Claude tool names:** `remember`, `recall`
**Scoped system prompt:**

```
You are Gwen's memory module. Store facts and preferences the user tells you.
When recalling, return the exact stored value naturally in a sentence.
If not found, say so and offer to store it.
```

### Capabilities
- `remember(key, value)` — upsert into SQLite
- `recall(key)` — fetch by key
- `listMemories()` — dump all stored memories
- `forgetKey(key)` — delete a memory

### SQLite Schema
```sql
CREATE TABLE memory (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  category   TEXT DEFAULT 'general',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Pre-seeded Memory Keys
On first run, Gwen asks for and stores:
- `user_name` — "What should I call you?"
- `location` — "What city are you based in?"
- `work_start` — "What time do you usually start work?"
- `top_priority` — "What's your top focus area right now?"

---

## 9. Planner Agent

**File:** `agents/planner-agent/agent.md`
**Role:** Synthesizes calendar + tasks + memory into a daily briefing
**Claude tool name:** `get_day_plan`
**Scoped system prompt:**

```
You are Gwen's daily planner. Given calendar events, tasks, and user preferences,
generate a spoken morning briefing. Structure: (1) greet by name, (2) overview
of the day's meetings, (3) top tasks to complete, (4) any overdue items,
(5) one motivational closer. Keep total briefing under 45 seconds of speech.
```

### Capabilities
- `getDayPlan()` — aggregates all sources, returns structured plan object
- `generateBriefing(plan)` — sends plan to Claude planner prompt → spoken text

---

## 10. Code Agent

**File:** `agents/code-agent/agent.md`
**Role:** Interfaces with Codex CLI to build software
**Claude tool name:** `build_software`
**Scoped system prompt:**

```
You are Gwen's software builder. When the user asks to build something, clarify:
(1) what to build, (2) where to save it (default: ~/Gwen-projects/).
Then spawn Codex with a precise prompt. Stream output back to the user.
Announce when done and what was created. Never auto-run the built software.
```

### Capabilities
- `runCodex(prompt, dir)` — spawns `codex exec --cd "{dir}" "{prompt}"`
- Streams stdout back via IPC `gwen:code-output` channel
- Returns summary of what was created

### Codex Prompt Template
```
{userRequest}

Requirements:
- Framework: {recalled preference or ask user}
- Save all files to: {dir}
- Create a README.md
- Do not install dependencies automatically
```

### Safety Rules
- ❌ Never run `npm install` automatically
- ❌ Never execute built code without user confirmation
- ✅ Always show a file tree of what was created when done

---

## 11. Screen Agent

**File:** `agents/screen-agent/agent.md`
**Role:** Captures screen context and describes it to the Orchestrator
**Claude tool name:** `get_screen_context`
**Scoped system prompt:**

```
You are Gwen's vision module. Given a screenshot, describe what the user is
currently working on in 1–2 sentences. Focus on: app name, content summary,
any errors or alerts visible. Be brief — this is context for the main brain,
not a full description for the user.
```

### Capabilities
- `getScreenContext()` — `screenshot-desktop` → base64 PNG
- Passed directly to Claude as an image block alongside the user's text

### Privacy Rules
- ❌ Never save screenshots to disk
- ❌ Never include screenshots in memory or notes
- ✅ Only used in-context, discarded after the turn
- ✅ Only triggered when user explicitly asks about their screen

---

## Agent Communication Pattern

```js
// brain.js — how agents are invoked via tool_use
const handlers = {
  get_calendar:       (input) => calendarAgent.run(input),
  get_emails:         (input) => emailAgent.run(input),
  search_web:         (input) => searchAgent.run(input),
  add_task:           (input) => taskAgent.add(input),
  get_tasks:          (input) => taskAgent.list(input),
  save_note:          (input) => notesAgent.save(input),
  get_notes:          (input) => notesAgent.search(input),
  remember:           (input) => memoryAgent.remember(input),
  recall:             (input) => memoryAgent.recall(input),
  get_day_plan:       (input) => plannerAgent.run(input),
  build_software:     (input) => codeAgent.run(input),
  get_screen_context: (input) => screenAgent.capture(input),
};
```

---

## Adding a New Agent

1. Create `agents/[name]/agent.md` with system prompt
2. Create `src/tools/[name].js` with exported functions
3. Add tool definition to `TOOLS` array in `brain.js`
4. Add handler to `handlers` map in `brain.js`
5. Document it here in `AGENTS.md`
