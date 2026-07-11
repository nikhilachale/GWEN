# Gwen — Personal AI Assistant

Voice-first, always-on AI desktop assistant. A model router chooses the cheapest
capable brain for each turn, Codex handles software builds and self-fixes, Fish
Audio does the talking, and macOS does the work.

## Demo

https://github.com/user-attachments/assets/26a0933e-3693-482c-96d8-a24dceb88bb8

> ▶︎ [`public/demo.mp4`](./public/demo.mp4) — 100 s walkthrough: wake word, the audio-reactive orb, and live tool calls.

> See [`CLAUDE.md`](./CLAUDE.md), [`agents/AGENTS.md`](./agents/AGENTS.md), and [`agents/SKILLS.md`](./agents/SKILLS.md) for full architecture.

---

## Quick Start

### 1. Install system dependencies

Use **Node.js 22.12 or newer**. The repo includes `.nvmrc` and
`.node-version`; with `nvm`, run:

```bash
nvm use
```

**macOS:**
```bash
brew install sox
brew install blueutil   # optional, for Bluetooth toggle
```

**Ubuntu:**
```bash
sudo apt install sox libsqlite3-dev
```

**Windows:**
```bash
choco install sox.portable
```

### 2. Install npm dependencies

```bash
npm install
```

This will run `electron-rebuild` automatically to compile `better-sqlite3`
against Electron's Node version. If tests report a `better-sqlite3` ABI
mismatch, run `npm run rebuild:node`; if Electron reports one, run
`npm run rebuild:electron`.

### 3. Configure environment

```bash
cp .env.example .env
# fill in your API keys
```

The hard requirements are `ANTHROPIC_KEY` for Gwen's brain and `FISH_KEY` for
Gwen's voice:

- **STT** — `GROQ_KEY` (preferred, `whisper-large-v3-turbo`) or `OPENAI_KEY`
  (`whisper-1`). With neither, Gwen transcribes locally via whisper.cpp
  (`nodejs-whisper`, `base.en`) — no key, fully offline, slower.
- **TTS** — Fish Audio only. Set `FISH_KEY` and optionally `FISH_VOICE_ID`.
- **Google / Tavily / Porcupine** — optional. Calendar reads from macOS
  Calendar.app without OAuth; Gwen degrades gracefully without the rest.

### 4. (Optional) Connect Gmail

```bash
npm run setup-oauth
```

This opens a browser, you grant `gmail.readonly`, and the token is saved to
`data/google-token.json`. Skip this if you don't want email — calendar reads
straight from macOS Calendar.app, no OAuth required.

### 5. Run

```bash
npm run dev
```

Vite serves the renderer on `localhost:5174`, Electron picks it up.

---

## What Gwen can do

### Productivity
- **Calendar** — read upcoming events from macOS Calendar.app (covers iCloud, Google, Exchange — whatever accounts you've added there)
- **Email** — check unread Gmail (read-only by design)
- **Tasks** — local task store (`add_task`, `get_tasks`)
- **Notes** — local markdown notes (`save_note`, `get_notes`)
- **Reminders.app** — iCloud-synced via AppleScript (`add_reminder`, `list_reminders`)
- **Notes.app** — iCloud-synced (`create_apple_note`, `search_apple_notes`)
- **Day plan** — combined morning briefing from calendar + tasks + memory
- **Memory** — persistent SQLite store for preferences and facts

### macOS control
- **Apps** — open any Mac app by name or alias (`open_app`)
- **Files** — list / open / reveal anything in Finder (`list_files`, `open_path`)
- **Keystroke** — type into the focused app (`type_text`, requires Accessibility)
- **Messaging** — send iMessage and WhatsApp (confirms before sending)
- **System** — volume, brightness, Wi-Fi, Bluetooth, dark mode, lock, sleep, battery
- **Shortcuts bridge** — run any macOS Shortcut by name; unlocks HomeKit, Focus modes, custom automations without writing more JS

### Calls & navigation
- **FaceTime** — video or audio call
- **Phone** — placed via iPhone Continuity
- **Maps** — directions and place search

### Knowledge
- **Web search** — Tavily
- **Weather** — current + forecast via wttr.in (no API key)
- **Screen context** — optional cloud vision when configured
- **Translation, definitions, math, conversions** — answered directly by the configured brain provider

### Time
- **Timers** — countdown with macOS notification on fire
- **Alarms** — natural-language ("tomorrow 7am", "in 90 minutes")

### Builder
- **`build_software`** — spawns the Codex CLI to scaffold real projects

---

## What works out of the box

- Three.js orb (cyan → white → amber → green by state)
- Manual mic trigger (click the orb)
- Global push-to-talk shortcut (`Cmd+Option+G` on macOS by default; set `GWEN_GLOBAL_SHORTCUT` to change it)
- Speech-to-text — Groq → OpenAI → local whisper.cpp fallback chain; macOS Speech via Swift for local testing
- Model router for normal chat, brainstorming, and tool-capable turns
- Streaming TTS — Fish Audio only, audio-reactive orb
- SQLite memory, JSON tasks, markdown notes
- Tavily search
- macOS Calendar.app (no setup — first run triggers a TCC prompt)
- Gmail (after `npm run setup-oauth`)
- Screen capture (asks for permission on first use, macOS)
- All macOS system + native-app tools listed above

## What needs setup

- **Wake word** — Porcupine `.ppn` file at `data/wakewords/hey-gwen.ppn`
- **Codex build pipeline** — works if `codex` CLI is on `$PATH`
- **Bluetooth control** — `brew install blueutil`
- **Phone calls** — paired iPhone with *Calls on Other Devices* enabled
- **Calendar / Reminders / Notes / Music control** — accept the macOS Automation prompts on first use (System Settings → Privacy & Security → Automation)

---

## Architecture

```
User Voice
    │
    ▼
electron/main.ts ──── IPC ──── React UI (Orb + 3-column HUD)
    │
    ├── core/listener.ts  → STT chain:  Groq → OpenAI → local whisper.cpp
    │                       (`GWEN_STT_PROVIDER=macos` uses Swift local testing)
    ├── core/brain.ts     → model router → brain/tool loop → tools/* → returns text
    └── core/speaker.ts   → TTS: Fish Audio by default; macOS `say` for local testing
                            (streamed audio level → orb)
```

Source is TypeScript, compiled to `dist-electron/`. `core/listener.ts` and
`core/speaker.ts` are thin shims; STT provider logic lives in
`src/skills/stt.ts`, while switchable Fish/macOS TTS lives in `src/skills/tts.ts`.

See `agents/AGENTS.md` for the full hub-and-spoke agent topology.

---

## How Gwen Works

### Input Methods

1. **Voice mode** — Press `Cmd+Option+G` or click the orb
2. **Text mode** — Type in the input box and click Send
3. **Settings** — Toggle "Text mode (quiet)" to disable TTS for silent operation

### Voice Turn Flow

```
IDLE → LISTENING → THINKING → SPEAKING → IDLE
  │       │          │         │
  │       │          │         └─ speaker.speakStream() → Fish Audio/macOS
  │       │          │             └─ Text mode: skips TTS, shows text only
  │       │          └─ brain.runBrain()
  │       │              ├─ Model router: local → discussion → smart
  │       │              ├─ System prompt: facts + context + memories
  │       │              └─ Tool loop (max 8): calendar, tasks, search, etc.
  │       └─ listener.transcribeAudio()
  │           └─ Groq → OpenAI → local whisper.cpp
  └─ Trigger: shortcut or orb click
```

### Text Turn Flow

```
Type input → Send → THINKING → SPEAKING → IDLE
                          └─ Same brain flow, no STT step
```

### Model Routing

Gwen automatically routes to the cheapest capable model:

- **Local fast path** — Time, battery, apps, tasks (no LLM)
- **Discussion** — Creative talk, brainstorming (Haiku, cheap)
- **Smart/tools** — Calendar, search, tools (full model)

### Tool Execution

```
Request → Security check → Tool dispatch → Result → Response
           │                         │
    safe/sensitive/        Calendar, Email, Tasks,
    destructive             Memory, Search, Apps,
                            System, Music, Maps...
```

Destructive tools (calls, messaging, system changes) require confirmation.

---

## Tool reference

| Category | Tools |
|---|---|
| Calendar (macOS) / Email (Gmail) | `get_calendar`, `get_emails` |
| Tasks / Notes | `add_task`, `get_tasks`, `save_note`, `get_notes` |
| Memory | `remember`, `recall` |
| Day plan | `get_day_plan` |
| Web | `search_web` |
| Screen | `get_screen_context` |
| Apps & files | `open_app`, `list_files`, `open_path`, `type_text` |
| Messaging | `send_imessage`, `send_whatsapp` |
| System | `set_volume`, `get_volume`, `set_brightness`, `toggle_wifi`, `toggle_bluetooth`, `toggle_dark_mode`, `lock_screen`, `sleep_mac`, `get_battery` |
| Shortcuts | `run_shortcut`, `list_shortcuts` |
| Music | `music_control`, `music_play`, `music_now_playing` |
| Reminders.app | `add_reminder`, `list_reminders` |
| Notes.app | `create_apple_note`, `search_apple_notes` |
| Maps | `get_directions`, `search_maps` |
| Calls | `facetime`, `call_phone` |
| Time | `set_timer`, `set_alarm`, `list_timers`, `cancel_timer` |
| Weather | `get_weather` |
| Builder | `build_software` |

---

## Testing without voice

```bash
# Type-check renderer and Electron code
npm run check

# Run unit tests; this rebuilds better-sqlite3 for the active Node runtime
npm test

# Test the brain with a typed prompt
npm run test:brain "What's on my calendar today?"

# Test a single tool
npm run test:tool memory
npm run test:tool calendar
```

## Safety

Sensitive and destructive actions require confirmation by default. Destructive
actions require exact approval phrases such as `confirm send`, `confirm call`,
or `confirm type`; Gwen shows the required phrase in the UI when an action is
pending. Enable Safe demo mode in Settings to block destructive tools while
keeping chat and safe local tools available.



## License

MIT
