# Gwen — JARVIS-Style AI Assistant
> Project instructions. Read this fully before touching any file.

> ⚠️ **A running Gwen instance rewrites her own source.** `fix_self_code`
> spawns Codex CLI against this repo; `repair_self` runs maintenance commands and then
> `relaunch_self` restarts the app. If Gwen is running, your manual edits can
> be reverted concurrently. Check for a live `electron .` / `npm run dev`
> process and stop it before editing.

---

## 🧠 Project Overview

**Gwen** is a voice-first, always-on AI desktop assistant built with:
- **Electron** — desktop shell (`electron/main.ts`, `electron/preload.cts`)
- **TypeScript / ESM** — all backend logic, compiled to `dist-electron/` (no Python, no CommonJS source)
- **React + Vite** — renderer UI (`.tsx`), Vite dev server on `localhost:5174`
- **Three.js** (+ `@react-three/fiber`) — audio-reactive orb visualization
- **Model router** — chooses local/simple, discussion, or smart/tool-capable brain per turn
- **Speech-to-text** — provider chain: Groq → OpenAI Whisper → local `nodejs-whisper` (whisper.cpp, offline fallback)
- **Text-to-speech** — Fish Audio only
- **Google APIs** — Calendar (read) + Gmail (read-only); calendar also reads macOS Calendar.app
- **better-sqlite3** — persistent memory store + **`@xenova/transformers`** for local semantic-memory embeddings
- **Codex CLI** — spawned as a subprocess for software builds and Gwen's own self-edits

---

## 📁 Project Structure

Source is **TypeScript**, compiled by `tsc` to `dist-electron/` (Electron/Node)
and bundled by Vite to `dist/` (renderer). Run the compiled output, never the
`.ts` directly.

```
mj-scaffold/
├── CLAUDE.md                     ← YOU ARE HERE
├── .env / .env.example           ← secrets (never commit .env)
├── package.json                  ← "type": "module", scripts below
├── vite.config.ts                ← renderer build, dev port 5174
├── tsconfig*.json                ← node / test tsconfigs
├── electron/
│   ├── main.ts                   ← main process, voice state machine, IPC hub
│   └── preload.cts               ← contextBridge (gwenBridge)
├── src/
│   ├── core/                     ← brain, listener, speaker, wakeword, screen
│   │   ├── brain.ts              ← Gwen orchestrator + tool loop (~1200 lines)
│   │   ├── listener.ts           ← shim → skills/stt.ts
│   │   ├── speaker.ts            ← shim → skills/tts.ts
│   │   ├── wakeword.ts           ← Porcupine "Hey Gwen" (deps not in package.json)
│   │   └── screen.ts             ← screenshot-desktop → base64
│   ├── skills/                   ← ~20 cross-cutting modules:
│   │                               stt, tts, ipc, relaunch, proactive, notify,
│   │                               semanticMemory, embeddings, passiveMemory,
│   │                               ambientContext, oauth, sqlite, intent,
│   │                               buildLog, diffParse, dateParse, storage,
│   │                               screenshot, search, projectRoot, memoryHygiene
│   ├── tools/                    ← ~25 brain-callable tool modules (see registry)
│   ├── ui/                       ← React .tsx: App, Orb, Stage, HUD, SpectrumRing,
│   │                               SpeedLines, LeftPanel, ActivityFeed,
│   │                               ContextPanel, Transcript, SelfFixOverlay
│   └── types/                    ← global.d.ts, modules.d.ts
├── agents/                       ← AGENTS.md + per-agent agent.md specs
├── scripts/                      ← *.ts: setup-google-oauth, test-*, backfill-embeddings, clean-memory
├── tests/                        ← *.test.ts (node --test via dist-test/)
├── data/                         ← tasks.json, notes/, conversation.json,
│                                   .mj-memory.db (SQLite), google-token.json
└── dist-electron/                ← tsc build output (this is what runs)
```

---

## ⚙️ Environment Variables (`.env`)

Auto routing is the default brain mode. It uses cheap no-LLM fast paths first,
routes brainstorming/discussion separately from tool-capable turns, and logs
decisions to `data/model-router.jsonl`. Code reads the **`GWEN_*`** prefix
(not `MJ_*`). See `.env.example` for the full annotated list.

```env
# Core
GWEN_BRAIN_PROVIDER=auto
GWEN_DEFAULT_PROVIDER=anthropic
GWEN_DISCUSSION_PROVIDER=anthropic
GWEN_SMART_PROVIDER=anthropic

# Anthropic cloud mode
ANTHROPIC_KEY=sk-ant-...
# GWEN_BRAIN_MODEL=claude-haiku-4-5-20251001

# STT (all optional — local whisper.cpp is the fallback)
# GROQ_KEY=                         # preferred (whisper-large-v3-turbo)
# OPENAI_KEY=                       # alternative (whisper-1)
# GWEN_WHISPER_MODEL=base.en        # local model
# GWEN_STT_PROVIDER=macos            # local macOS Speech framework testing only

# TTS
FISH_KEY=
FISH_VOICE_ID=
GWEN_TTS_PROVIDER=fish               # set to macos only for local `say` testing

# Google (Calendar + Gmail read-only)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_TOKEN_PATH=./data/google-token.json

# Search / Wake word / misc
TAVILY_KEY=...
# PORCUPINE_ACCESS_KEY=             # Picovoice console
# GWEN_DISABLE_SCREEN=1  GWEN_PROACTIVE_ENABLED=  GWEN_MORNING_HOUR=
```

---

## 🧩 Coding Conventions

### General
- **TypeScript + ESM** — `import/export`, never `require()`; `"type": "module"`
- Typing is light — `any`-friendly, `tsc` runs with `--noCheck` for the Electron build; favor runtime safety over strict types
- **Async/await** everywhere — no raw `.then()` chains
- **Error handling** — every `async` tool function has `try/catch`, logs to console, and returns a safe fallback string so Gwen never crashes on tool failure

### Naming
- Files: `camelCase.ts` (tools/skills/core), `PascalCase.tsx` (React components)
- Functions: `camelCase` · Constants: `SCREAMING_SNAKE_CASE`

### Tool Response Format
Every tool in `src/tools/` returns either a plain **string** (voice-friendly) or
a **plain object** that `brain.ts` `JSON.stringify`s before sending to Claude.

### Brain Tool Loop
`brain.ts` runs `while (response.stop_reason === "tool_use" && turn < MAX_TOOL_TURNS)`
(cap 8). Claude can chain/parallelize tool calls in one turn — tool uses are
dispatched with `Promise.all`. Never short-circuit this. `runBrainStream`
additionally speaks each sentence as it streams.

### IPC Channels (Electron, via `skills/ipc.ts`)
| Channel | Direction | Payload |
|---|---|---|
| `gwen:state` | main → renderer | `'idle' \| 'listening' \| 'thinking' \| 'speaking'` |
| `gwen:transcript` | main → renderer | `{ role, text }` |
| `gwen:audio-level` | main → renderer | `number 0–1` |
| `gwen:code-output` | main → renderer | streaming coding-agent stdout |
| `gwen:code-diff` | main → renderer | self-edit diff for the Stage |
| `gwen:doc` | main → renderer | doc/PDF content for center Stage |
| `gwen:self-fix` | main → renderer | self-fix progress for `SelfFixOverlay` |
| `gwen:context-panel` | main → renderer | left-panel data (e.g. tasks) |
| `gwen:activity` | main → renderer | live tool activity feed (right column) |
| `gwen:trigger` | renderer → main | manual listen trigger (tap orb) |
| `gwen:get-state` / `gwen:get-tasks` / `gwen:get-fixes` | renderer → main | initial-mount probes (`ipcMain.handle`) |

---

## 🛠️ Tools Registry

Every tool is registered in `brain.ts` in BOTH the `TOOLS` array (schemas for
Claude) AND the `handlers` map (~50 entries). Keep them in sync. By module:

| File | Tools |
|---|---|
| `tools/calendar.ts` / `email.ts` | `get_calendar`, `get_emails` |
| `tools/search.ts` | `search_web` |
| `tools/tasks.ts` | `add_task`, `get_tasks` |
| `tools/notes.ts` | `save_note`, `get_notes` |
| `tools/memory.ts` (+ `skills/passiveMemory`) | `remember`, `recall`, `forget_memory` |
| `tools/dayplan.ts` | `get_day_plan` |
| `tools/codegen.ts` | `build_software` |
| `tools/selfFix.ts` / `repairSelf.ts` / `restart.ts` | `fix_self_code`, `repair_self`, `relaunch_self` |
| `core/screen.ts` | `get_screen_context` |
| `tools/macControl.ts` | `open_app`, `type_text`, `send_imessage`, `send_whatsapp`, `scroll_mouse` |
| `tools/files.ts` | `list_files`, `open_path`, `read_file` |
| `tools/system.ts` | `set_volume`, `get_volume`, `set_brightness`, `toggle_wifi`, `toggle_bluetooth`, `toggle_dark_mode`, `lock_screen`, `sleep_mac`, `get_battery` |
| `tools/shortcuts.ts` | `run_shortcut`, `list_shortcuts` |
| `tools/music.ts` | `music_control`, `music_play`, `music_now_playing` |
| `tools/reminders.ts` | `add_reminder`, `list_reminders` |
| `tools/appleNotes.ts` | `create_apple_note`, `search_apple_notes` |
| `tools/maps.ts` | `get_directions`, `search_maps` |
| `tools/calls.ts` | `facetime`, `call_phone` |
| `tools/timers.ts` | `set_timer`, `set_alarm`, `list_timers`, `cancel_timer` |
| `tools/weather.ts` | `get_weather` |
| `tools/pdf.ts` | `read_pdf` |

---

## 🤖 Agents

See `agents/AGENTS.md` for full agent specs. Quick summary:

| Agent | Role |
|---|---|
| `orchestrator` | Main Gwen brain — routes to all tools/agents |
| `voice-agent` | Manages STT/TTS pipeline + state machine |
| `calendar-agent` / `email-agent` | Calendar (macOS/Google) / Gmail read-only |
| `search-agent` | Web search + result summarization |
| `task-agent` / `notes-agent` / `memory-agent` | Task / note / SQLite-memory logic |
| `planner-agent` | Synthesizes calendar+tasks into daily plan |
| `code-agent` | Interfaces with Codex CLI |
| `screen-agent` | Captures screen context and describes it |

---

## 🎨 UI Rules

- **Transparent, frameless** window (overlay), not a solid black box — `main.ts` sets `transparent: true`, `frame: false`
- **3-column grid** `1fr | 3fr | 1fr`: `LeftPanel` (tasks/fixes) · center Orb+`Stage`+`SpectrumRing`+`Transcript` · `ActivityFeed` (live tool feed)
- Persona styling is **Spider-Verse / Ghost-Spider** (red/pink/cyan, chromatic-aberration text), evolved from the original cyan JARVIS look
- `Stage` takes over center when Gwen is mid-action (code diff / PDF / self-fix); idle renders nothing so Orb + Transcript show
- Orb color by state: `idle` cyan `#00d4ff` · `listening` white · `thinking` amber `#ff9500` · `speaking` green `#00ff88`
- Tap the orb to trigger a manual listen turn (`gwen:trigger`)

---

## 🚫 Hard Rules

1. **Never write to Gmail** — read-only by design
2. **Never auto-execute** Codex build output without showing the user first
3. **Never store raw email content** in SQLite — only metadata
4. **Never commit `.env`** or `data/google-token.json`
5. **Screen capture** only when the user explicitly asks Gwen about their screen
6. **No hot-reloading in production** — Vite dev server only in dev mode
7. **All API keys** come from `process.env` — never hardcoded
8. **Self-edit safety** — `fix_self_code`/`repair_self` modify this repo and relaunch; never trigger them blindly, and assume a running instance may overwrite manual edits

---

## 🧪 Testing & Running

Scripts compile first (`tsc`) then run from `dist-*`. Use the npm scripts, not
`node scripts/*.ts` directly:

```bash
npm run dev              # concurrently: Vite + tsc --watch + Electron (port 5174)
npm run build            # build:renderer (Vite) + build:electron (tsc)
npm run dist             # electron-builder package
npm run setup-oauth      # one-time Google OAuth flow

npm run test:brain "What's on my schedule today?"   # full brain, typed input
npm run test:tool calendar                          # single tool
npm run test:voice                                  # voice pipeline
npm run test:tts                                    # TTS only
npm test                                            # node --test (tests/*.test.ts)
npm run backfill:embeddings                         # semantic-memory embeddings
npm run clean:memory                                # ⚠️ memory hygiene — do NOT run unprompted
```
