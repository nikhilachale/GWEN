# MJ

**A JARVIS-Style AI Assistant**

*Product Overview & Build Status*

**Author:** nikhil
**Version:** 0.1 — May 2, 2026

---

## 1. Executive Summary

MJ is a voice-first, always-on AI desktop assistant — a personal JARVIS. You talk to it; it talks back. It runs as a native desktop application, listens for a wake word, and routes your speech to a Claude-powered orchestrator that decides which tools to use and what to say.

Unlike a chatbot in a browser tab, MJ is ambient. It lives at the edge of your desk, always ready. It knows your calendar, reads your inbox (read-only), tracks your tasks, remembers your preferences, can search the web, can see your screen on demand, and can spawn Claude Code to build software for you — all through natural conversation.

The visual centerpiece is an audio-reactive Three.js particle orb that pulses with MJ's voice and changes color by state: cyan when idle, white when listening, amber when thinking, green when speaking.

### Why this exists

Three reasons. First — the cognitive overhead of switching between calendar, email, notes, and search apps is real. A single voice interface that pulls from all of them is meaningfully faster. Second — Claude is good enough at tool-use now that JARVIS-style orchestration is no longer science fiction; it's a weekend project. Third — owning the agent (vs renting one from a SaaS) means MJ can hold years of personal context without leaking it to a third party.

---

## 2. Vision & Design Philosophy

Five non-negotiable principles guide every decision in this project.

### 1. Voice-first, not voice-also

MJ is designed to be spoken to. Every response is shaped for the ear, not the eye. No markdown bullet points read aloud; no URLs spoken verbatim; no raw timestamps. 1–3 sentences by default. The orb is the only visual.

### 2. Local where it can be, cloud where it must be

Memory, tasks, notes, and the SQLite store all live on disk. Whisper, Claude, and ElevenLabs are cloud calls because nothing local matches their quality yet — but the data those cloud calls touch never gets persisted server-side beyond the request itself.

### 3. Read-only by default

Gmail is read-only — MJ literally cannot send mail because it doesn't request the scope. Calendar is read-only. Claude Code never auto-runs the software it builds. The default posture is observer, not actor.

### 4. Hub-and-spoke, not free-for-all

There is one orchestrator. Sub-agents are scoped and have limited tool access. The orchestrator is the only thing that talks to all tools. This makes the system auditable: any action can be traced to the orchestrator turn that triggered it.

### 5. Graceful degradation

Every tool returns a friendly fallback string instead of throwing. Missing API key? MJ tells you what to set up. Network down? MJ says so and moves on. The voice loop never crashes.

---

## 3. Feature List

Everything MJ can do, organized by capability area.

### Voice interaction

- Wake word detection ("Hey MJ") via Picovoice Porcupine — always-on, low-power
- Speech-to-text via OpenAI Whisper, with automatic silence detection
- Text-to-speech via ElevenLabs streaming API, JARVIS-style voice
- Audio-reactive orb visualization that pulses with MJ's speech
- Manual click-to-talk fallback if wake word fails or isn't configured

### Productivity

- Read upcoming Google Calendar events across N days
- Read unread Gmail messages (read-only — never sends or modifies)
- Add, list, and complete tasks with natural-language due dates ("tomorrow at 6pm")
- Save and search freeform notes as markdown files
- Schedule and fire reminders with both system notifications and voice announcements

### Knowledge & memory

- Persistent key-value memory in SQLite — preferences, facts, identity
- Pre-seeded onboarding for name, location, work hours, top priority
- Web search via Tavily (with Brave Search fallback)
- Clean article extraction from any URL via Mozilla Readability

### Daily operations

- Morning briefing combining calendar, tasks, overdue items, and personal context
- Three briefing tones: standard, casual, motivational
- All briefings capped at ~45 seconds of speech

### Vision & screen awareness

- On-demand screen capture and description via Claude vision
- Active app detection via active-win
- Triggered only by explicit user request — never proactive
- Screenshots are in-memory only, never saved to disk

### Software building

- Spawn Claude Code as a subprocess to build apps, scripts, or websites
- Voice request → composed prompt → live build output streamed to UI
- Default save location: `~/MJ-projects/<slug>/`
- Never auto-runs the built code; never auto-installs dependencies

---

## 4. Technology Stack

Every layer of MJ in one table. JavaScript-only — no Python, no TypeScript.

| Layer | Technology | Why it's here |
|---|---|---|
| Desktop shell | Electron 33 | Cross-platform native window with full Node access |
| Renderer UI | React 18 + Vite | Fast dev loop, component model for the orb |
| 3D visuals | Three.js + React Three Fiber | GPU-accelerated 5,000-particle orb |
| Backend runtime | Node.js (ESM) | Same language as the renderer; tight integration |
| Brain | Claude Sonnet 4.5 (claude-sonnet-4-20250514) | Tool-use orchestration |
| Speech-to-text | OpenAI Whisper API | Best transcription accuracy available |
| Text-to-speech | ElevenLabs streaming | JARVIS-quality voice, low latency |
| Memory store | better-sqlite3 | Synchronous, fast, single-file |
| Calendar / Email | Google APIs (calendar.readonly + gmail.readonly) | Read-only by design |
| Web search | Tavily (primary) + Brave (fallback) | Clean structured results |
| Wake word | Picovoice Porcupine | Local, low-power, custom keyword |
| Article extraction | Mozilla Readability + jsdom | Strip nav/ads from any web page |
| Reminders | node-cron + node-notifier | OS-level alerts + voice announcements |
| Screen capture | screenshot-desktop + sharp | Cross-platform with auto-downscale |
| Software builder | Claude Code CLI (spawned) | Reuses Anthropic's existing agentic coder |

---

## 5. Architecture

MJ uses a hub-and-spoke topology. The orchestrator is the only entry point; sub-agents are scoped behind tool definitions.

### Runtime flow

1. Wake word fires (or user clicks the orb) → state goes to **LISTENING**, orb turns white.
2. Whisper transcribes the audio → state goes to **THINKING**, orb turns amber.
3. Brain runs the Claude tool-use loop, calling 0–N tools, until a final text response is produced.
4. State goes to **SPEAKING**, orb turns green and pulses with the audio level. ElevenLabs streams audio chunks; each chunk's RMS drives the orb's particle displacement.
5. Playback ends → state returns to **IDLE**, orb back to cyan, wake word listener resumes.

### Three layers

The codebase has three crisp layers, each with a single responsibility.

- **Agents** — Claude-backed reasoning units. Each has its own system prompt and a defined tool surface. The Orchestrator is the only one with full tool access.
- **Tools** — Functions exposed to Claude via `tool_use`. Each tool wraps one or more skills and returns voice-friendly strings or structured data.
- **Skills** — Pure JavaScript capabilities. No Claude calls, no system prompts, no state. Same input → same output. Reusable across agents.

### Project structure

The repo lays out cleanly:

```
mj/
├── CLAUDE.md                  ← master instructions for Claude Code
├── electron/                  ← main process + preload
├── src/
│   ├── core/                  ← brain, listener, speaker, screen, wakeword
│   ├── tools/                 ← 8 tool implementations
│   ├── skills/                ← 11 backend skills
│   └── ui/                    ← App, Orb, Transcript + useOrb hook
├── agents/                    ← AGENTS.md, SKILLS.md, 11 per-agent specs
├── scripts/                   ← OAuth setup + test runners
└── data/                      ← memory.db, tasks.json, notes/
```

---

## 6. The 11 Agents

Each agent has a scoped system prompt and a defined responsibility. Most are invoked by the Orchestrator via `tool_use`; a few are pure runtime modules.

| Agent | Tool name | Role |
|---|---|---|
| Orchestrator | (main entry) | Routes everything; only agent with full tool access |
| Voice | (state machine) | STT → brain → TTS coordinator; not a Claude call |
| Calendar | `get_calendar` | Reads Google Calendar events |
| Email | `get_emails` | Reads Gmail (read-only, hard-locked) |
| Search | `search_web` | Tavily / Brave web search + synthesis |
| Task | `add_task` / `get_tasks` | Task CRUD with NL date parsing |
| Notes | `save_note` / `get_notes` | Markdown note save & search |
| Memory | `remember` / `recall` | SQLite key-value persistence |
| Planner | `get_day_plan` | Daily briefing aggregator |
| Code | `build_software` | Spawns Claude Code CLI |
| Screen | `get_screen_context` | Screen capture + Claude vision |

---

## 7. The 12 Skills

Skills are pure functions — no system prompts, no API calls of their own beyond the service they wrap. They're the building blocks every tool composes from.

| Skill | Purpose |
|---|---|
| `stt` | Whisper transcription with mic recording and silence detection |
| `tts` | ElevenLabs streaming TTS with audio-level callbacks |
| `oauth` | Google OAuth2 with token refresh and persistence |
| `dateParse` | Natural language → ISO 8601 ("tomorrow at 3pm" → ISO) |
| `storage` | Atomic JSON read/write with UUID generation |
| `sqlite` | better-sqlite3 wrapper for the memory key-value store |
| `screenshot` | Screen capture with sharp downscaling, in-memory only |
| `search` | Tavily + Brave fallback + Readability page extraction |
| `ipc` | Typed Electron IPC wrappers (main → renderer) |
| `notify` | Cron-based reminder loop + system notifications |
| `intent` | Fast regex-based pre-route hints (saves ~200ms latency) |
| `useOrb` | React hook driving the Three.js orb's state and color |

---

## 8. Build Status

Where the project stands as of this document's date. The scaffold is functional end-to-end; remaining work is polish and the wake-word integration.

### Approximately 70% complete

All foundational systems are built and the voice loop runs end-to-end with click-to-talk. The remaining 30% is the difference between "working demo" and "daily driver."

### ✓ Done — Ready out of the box

- Full Claude tool-use loop with all 12 tools wired up
- Whisper STT with silence detection
- ElevenLabs streaming TTS with audio-reactive orb
- Three.js Fibonacci-sphere orb with state colors and audio displacement
- Click-to-talk via the orb
- Live transcript feed below the orb
- SQLite memory with WAL mode and upsert
- Atomic JSON task storage with UUID + natural-language date parsing
- Markdown note save and search
- Tavily web search with Brave fallback
- Reminder loop with OS notifications and voice announcements
- Screen capture with Claude vision describe call
- Daily briefing aggregator pulling from calendar + tasks + memory
- Intent pre-routing for ~200ms latency reduction
- Claude Code spawn pipeline with stdout streaming to UI

### ✓ Done — Ready after one extra setup step

- Google Calendar read — requires running `npm run setup-oauth` once
- Gmail read — same OAuth flow

### ◐ Stubbed — Code path exists, needs configuration

- Wake word "Hey MJ" — needs Porcupine `.ppn` file + access key

### ✗ Remaining work

#### Must-do for daily-driver feel

- **Wake word integration:** train custom keyword at console.picovoice.ai, drop the `.ppn` file at `data/wakewords/hey-mj.ppn`, add `PORCUPINE_ACCESS_KEY` to `.env`, install the two Picovoice npm packages, wire `wakeWord.start()` into `electron/main.js`. *Estimated effort: 1 hour.*
- **First-time machine setup pass:** install sox, grant mic and screen-recording permissions, verify better-sqlite3 native build. *Estimated effort: 2 hours of debugging.*
- **First-run onboarding flow:** ask name, location, work hours, top priority on first boot, store in memory. Currently you'd configure these via voice. *Estimated effort: 2 hours.*
- **Conversation memory across turns:** maintain message history between voice turns so follow-ups like "what about next week?" work. *Estimated effort: 1 hour.*

#### Should-do for polish

- Smoother orb state transitions and a "wake" animation. *Estimated effort: 3 hours.*
- Speak-to-interrupt: wake word during TTS playback should stop and listen. *Estimated effort: 1 hour.*
- More specific error speech for tool failures. *Estimated effort: 2 hours.*

#### Nice-to-have

- Production `.app`/`.exe` packaging via electron-builder, including macOS code-signing.
- Multi-monitor and per-window screen capture support.
- Streaming Whisper for lower STT latency than the current batch mode.

---

## 9. Realistic Timeline

From scaffold-in-hand to shareable product, with honest estimates.

| Milestone | What you'll have | Effort |
|---|---|---|
| Tonight | Click-to-talk MVP running end-to-end | 2–4 hours |
| This weekend | Wake word + onboarding + conversation memory = daily driver | 1 day |
| Next week | Polish, error handling, production build | 2–3 days |
| Future | Code-signed releases, multi-monitor, streaming STT | Open-ended |

---

## 10. Setup & First Run

### Prerequisites

- macOS, Linux, or Windows
- Node.js 20+
- sox installed (`brew install sox` / `apt install sox` / `choco install sox.portable`)

### Required API keys

At minimum, MJ needs three keys to start producing voice output:

- `ANTHROPIC_KEY` — for the brain
- `OPENAI_KEY` — for Whisper transcription
- `ELEVEN_KEY` plus `ELEVEN_VOICE_ID` — for speech output

Optional: Google OAuth (calendar + email), Tavily (search), Porcupine (wake word). MJ degrades gracefully without any of these.

### Boot sequence

```bash
cp .env.example .env        # then fill in keys
npm install
npm run setup-oauth         # optional, for Google
npm run dev
```

First boot will likely surface platform-specific permission prompts — mic on every OS, screen recording on macOS, audio output device selection. Grant all of them and restart Electron once.

---

## 11. Hard Rules — Things MJ Will Never Do

These are non-negotiable constraints baked into the architecture.

- Never write to Gmail. The send/modify scopes are not requested. Even if a user asks, the agent doesn't have the capability.
- Never auto-execute software that Claude Code builds. The user must explicitly run it.
- Never auto-install dependencies during a `build_software` run.
- Never persist screenshots to disk. Capture happens in-memory; the buffer is discarded after the vision call returns.
- Never store full email bodies in the local database — only sender, subject, date, and a 150-char snippet.
- Never trigger screen capture proactively. It runs only when the user explicitly asks.
- Never commit `.env` or `data/google-token.json`. The `.gitignore` enforces this.
- Never read out raw event IDs, timestamps, or URLs in voice responses.
- Never exceed 130 words in the morning briefing (≈45 seconds of speech).
- Never fire more than two reminders per task — once an hour before, once at the due time.
- Never block the voice loop on a tool failure. Every tool returns a voice-friendly fallback string instead of throwing.

---

## 12. Closing Notes

MJ is built to be lived with, not demoed. The point isn't to impress anyone — it's to remove the friction between thinking of something and acting on it.

The architecture deliberately keeps the surface area small. Eleven agents. Twelve skills. Twelve tools. One orchestrator. One state machine. One orb. Everything else is plumbing.

If something feels off after running it for a few days — a tool that should have fired but didn't, a reminder that came at the wrong time, a phrase MJ keeps mishearing — change it. The codebase is small enough to hold in your head, and every layer is documented.

> *"Sometimes you've got to run before you can walk."*
>
> *Ship it.*
