# Gwen — JARVIS-Style AI Assistant
> Claude Code project instructions. Read this fully before touching any file.

---

## 🧠 Project Overview

**Gwen** is a voice-first, always-on AI desktop assistant built with:
- **Electron** — desktop shell
- **Node.js / ESM** — all backend logic (no Python, no CommonJS)
- **React + Vite** — renderer UI
- **Three.js** — audio-reactive orb visualization
- **Claude API** (`claude-sonnet-4-20250514`) — brain + tool_use
- **Whisper API** — speech-to-text
- **ElevenLabs** — JARVIS-style text-to-speech
- **Google APIs** — Calendar (read) + Gmail (read-only)
- **better-sqlite3** — persistent memory store
- **Claude Code CLI** — spawned as a subprocess for software builds

---

## 📁 Project Structure

```
gwen/
├── CLAUDE.md                     ← YOU ARE HERE
├── .env                          ← secrets (never commit)
├── package.json
├── vite.config.js
├── electron/
│   ├── main.js                   ← Electron main process + IPC
│   └── preload.js                ← contextBridge API
├── src/
│   ├── core/
│   │   ├── brain.js              ← Claude API orchestrator + tool loop
│   │   ├── listener.js           ← mic recording → Whisper STT
│   │   ├── speaker.js            ← ElevenLabs TTS + audio streaming
│   │   ├── wakeword.js           ← "Hey Gwen" detection via Porcupine
│   │   └── screen.js             ← screenshot-desktop → base64
│   ├── tools/
│   │   ├── calendar.js           ← Google Calendar or macOS Calendar.app read
│   │   ├── email.js              ← Gmail read-only
│   │   ├── search.js             ← Tavily web search
│   │   ├── tasks.js              ← local task/reminder store
│   │   ├── notes.js              ← save/search notes
│   │   ├── memory.js             ← SQLite persistent memory
│   │   ├── dayplan.js            ← calendar + tasks → daily briefing
│   │   └── codegen.js            ← spawns Claude Code CLI
│   └── ui/
│       ├── App.jsx               ← root React component
│       ├── Orb.jsx               ← Three.js particle orb
│       └── Transcript.jsx        ← live conversation feed
├── agents/
│   ├── AGENTS.md                 ← agent registry (this file defines all sub-agents)
│   └── [agent-name]/
│       ├── agent.md              ← sub-agent system prompt
│       └── tools.js              ← tool definitions scoped to agent
├── data/
│   ├── tasks.json                ← flat task store
│   ├── notes/                    ← markdown note files
│   └── .gwen-memory.db            ← SQLite (auto-created)
└── scripts/
    └── setup-google-oauth.js    ← one-time OAuth flow
```

---

## ⚙️ Environment Variables (`.env`)

```env
# Core
ANTHROPIC_KEY=sk-ant-...
OPENAI_KEY=sk-...
ELEVEN_KEY=...
ELEVEN_VOICE_ID=...              # find a JARVIS-like voice on ElevenLabs

# Google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_TOKEN_PATH=./data/google-token.json

# Search
TAVILY_KEY=...

# Wake Word
PORCUPINE_ACCESS_KEY=...         # from Picovoice console
```

---

## 🧩 Coding Conventions

### General
- **ESM only** — use `import/export`, never `require()`
- **`"type": "module"`** in `package.json`
- **No TypeScript** — plain JS with JSDoc comments where types matter
- **Async/await** everywhere — no raw `.then()` chains
- **Error handling** — every `async` function has `try/catch`, logs to console, and returns a safe fallback string so Gwen never crashes on tool failure

### Naming
- Files: `camelCase.js`
- Functions: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- React components: `PascalCase.jsx`

### Tool Response Format
Every tool in `src/tools/` must return either:
- A plain **string** (for voice-friendly responses)
- A **plain object** that `brain.js` stringifies before sending to Claude

```js
// ✅ Good
export async function getTasks() {
  try {
    const tasks = JSON.parse(fs.readFileSync('./data/tasks.json', 'utf8'));
    return tasks; // brain.js will JSON.stringify this
  } catch {
    return "No tasks found.";
  }
}
```

### Brain Tool Loop
`brain.js` runs a `while (response.stop_reason === "tool_use")` loop — Claude can chain multiple tool calls in one turn. Never short-circuit this.

### IPC Channels (Electron)
| Channel | Direction | Payload |
|---|---|---|
| `gwen:state` | main → renderer | `'idle' \| 'listening' \| 'thinking' \| 'speaking'` |
| `gwen:transcript` | main → renderer | `{ role, text }` |
| `gwen:audio-level` | main → renderer | `number 0–1` |
| `gwen:code-output` | main → renderer | `string` (streaming Claude Code output) |
| `gwen:trigger` | renderer → main | `'listen'` (manual button press) |

---

## 🛠️ Tools Registry

All tools must be registered in `brain.js` in BOTH the `TOOLS` array (for Claude) AND the `handlers` map.

| Tool Name | File | Description |
|---|---|---|
| `get_calendar` | `tools/calendar.js` | Read upcoming calendar events |
| `get_emails` | `tools/email.js` | Get unread Gmail messages (read-only) |
| `search_web` | `tools/search.js` | Tavily web search |
| `add_task` | `tools/tasks.js` | Create a task or reminder |
| `get_tasks` | `tools/tasks.js` | List current tasks |
| `save_note` | `tools/notes.js` | Save a markdown note |
| `get_notes` | `tools/notes.js` | Search saved notes |
| `remember` | `tools/memory.js` | Persist a preference/fact in SQLite |
| `recall` | `tools/memory.js` | Retrieve a stored memory |
| `get_day_plan` | `tools/dayplan.js` | Generate a full day briefing |
| `build_software` | `tools/codegen.js` | Spawn Claude Code to build something |
| `get_screen_context` | `core/screen.js` | Capture screen as base64 for Claude |

---

## 🤖 Agents

See `agents/AGENTS.md` for full agent specs. Quick summary:

| Agent | Role |
|---|---|
| `orchestrator` | Main Gwen brain — routes to all tools/agents |
| `voice-agent` | Manages STT/TTS pipeline + state machine |
| `calendar-agent` | Google Calendar or macOS Calendar.app scoped logic |
| `email-agent` | Gmail read-only scoped logic |
| `search-agent` | Web search + result summarization |
| `task-agent` | Task CRUD + reminder scheduling |
| `notes-agent` | Note creation, search, retrieval |
| `memory-agent` | SQLite read/write for preferences |
| `planner-agent` | Synthesizes calendar+tasks into daily plan |
| `code-agent` | Interfaces with Claude Code CLI |
| `screen-agent` | Captures screen context and describes it |

---

## 🎨 UI Rules

- Background: **pure black** (`#000000`)
- Accent: **cyan/blue** (`#00d4ff`) for idle orb
- Font: `'Rajdhani'` or `'Exo 2'` from Google Fonts — JARVIS aesthetic
- The orb lives center-screen, always visible
- Transcript overlays bottom, fades old messages
- No buttons except one mic icon (for manual trigger fallback)
- Orb color changes by state:
  - `idle` → `#00d4ff` (cyan)
  - `listening` → `#ffffff` (white pulse)
  - `thinking` → `#ff9500` (amber spin)
  - `speaking` → `#00ff88` (green breathe)

---

## 🚫 Hard Rules

1. **Never write to Gmail** — read-only by design
2. **Never auto-execute** Claude Code output without showing the user first
3. **Never store raw email content** in SQLite — only metadata
4. **Never commit `.env`** or `data/google-token.json`
5. **Screen capture** only happens when the user explicitly asks Gwen about their screen
6. **No hot-reloading in production** — Vite dev server only in dev mode
7. **All API keys** come from `process.env` — never hardcoded

---

## 🧪 Testing

```bash
# Test voice pipeline (no wake word, just type)
node scripts/test-voice.js

# Test a specific tool
node scripts/test-tool.js calendar
node scripts/test-tool.js memory

# Test full brain with text input
node scripts/test-brain.js "What's on my schedule today?"
```

---

## 🚀 Running Gwen

```bash
# Development
npm run dev          # starts Vite + Electron with hot reload

# Production build
npm run build        # bundles renderer
npm run dist         # packages Electron app

# First-time Google OAuth
node scripts/setup-google-oauth.js
```

---

## 📋 Build Order (follow this sequence)

- [ ] **Step 1** — `package.json` + `vite.config.js` + `electron/main.js` skeleton
- [ ] **Step 2** — `core/listener.js` (Whisper STT) + `core/speaker.js` (ElevenLabs)
- [ ] **Step 3** — `core/brain.js` with echo tool (confirm voice loop works)
- [ ] **Step 4** — `ui/App.jsx` + `ui/Orb.jsx` + IPC wired up
- [ ] **Step 5** — `tools/memory.js` + `tools/tasks.js` + `tools/notes.js`
- [ ] **Step 6** — `tools/calendar.js` (Google Calendar or macOS Calendar.app) + `scripts/setup-google-oauth.js` → `tools/email.js`
- [ ] **Step 7** — `tools/search.js` (Tavily)
- [ ] **Step 8** — `tools/dayplan.js` (combine calendar + tasks)
- [ ] **Step 9** — `core/screen.js` + wire into brain
- [ ] **Step 10** — `tools/codegen.js` (Claude Code CLI spawn)
- [ ] **Step 11** — `core/wakeword.js` (Porcupine "Hey Gwen")
- [ ] **Step 12** — Polish UI, transitions, transcript fade
