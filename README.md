# Gwen personal  AI Assistant

Voice-first, always-on AI desktop assistant. Claude does the thinking;
ElevenLabs does the talking; macOS does the work.

> See [`CLAUDE.md`](./CLAUDE.md), [`agents/AGENTS.md`](./agents/AGENTS.md), and [`agents/SKILLS.md`](./agents/SKILLS.md) for full architecture.

---

## Quick Start

### 1. Install system dependencies

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
against Electron's Node version.

### 3. Configure environment

```bash
cp .env.example .env
# fill in your API keys
```

You need at minimum:
- `ANTHROPIC_KEY` — to make MJ think
- `OPENAI_KEY` — for Whisper STT
- `ELEVEN_KEY` + `ELEVEN_VOICE_ID` — for TTS

Google + Tavily + Porcupine keys are optional — MJ degrades gracefully without them.

### 4. (Optional) Connect Google

```bash
npm run setup-oauth
```

This opens a browser, you grant `calendar.readonly` + `gmail.readonly`, and the
token is saved to `data/google-token.json`.

### 5. Run

```bash
npm run dev
```

Vite serves the renderer on `localhost:5173`, Electron picks it up.

---

## What MJ can do

### Productivity
- **Calendar** — read upcoming Google Calendar events
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
- **Screen context** — captures and reasons about what's on your screen
- **Translation, definitions, math, conversions** — answered directly by Claude

### Time
- **Timers** — countdown with macOS notification on fire
- **Alarms** — natural-language ("tomorrow 7am", "in 90 minutes")

### Builder
- **`build_software`** — spawns the Claude Code CLI to scaffold real projects

---

## What works out of the box

- Three.js orb (cyan → white → amber → green by state)
- Manual mic trigger (click the orb)
- Whisper STT
- Claude tool-use loop with all tools
- ElevenLabs streaming TTS with audio-reactive orb
- SQLite memory, JSON tasks, markdown notes
- Tavily search
- Google Calendar + Gmail (after `npm run setup-oauth`)
- Screen capture (asks for permission on first use, macOS)
- All macOS system + native-app tools listed above

## What needs setup

- **Wake word** — Porcupine `.ppn` file at `data/wakewords/hey-mj.ppn`
- **Claude Code build pipeline** — works if `claude` CLI is on `$PATH`
- **Bluetooth control** — `brew install blueutil`
- **Phone calls** — paired iPhone with *Calls on Other Devices* enabled
- **Reminders / Notes / Music control** — accept the macOS Automation prompts on first use (System Settings → Privacy & Security → Automation)

---

## Architecture

```
User Voice
    │
    ▼
electron/main.js ──── IPC ──── React Orb
    │
    ├── core/listener.js    → Whisper
    ├── core/brain.js       → Claude (orchestrator) → tools/* → returns text
    └── core/speaker.js     → ElevenLabs (audio level → orb)
```

See `agents/AGENTS.md` for the full hub-and-spoke agent topology.

---

## Tool reference

| Category | Tools |
|---|---|
| Calendar / Email | `get_calendar`, `get_emails` |
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
# Test the brain with a typed prompt
npm run test:brain "What's on my calendar today?"

# Test a single tool
npm run test:tool memory
npm run test:tool calendar
```

---

## Troubleshooting

**`better-sqlite3` errors after install** — run `npx electron-rebuild -f -w better-sqlite3`

**macOS: "MJ can't access the microphone"** — System Settings → Privacy & Security → Microphone → enable for Electron/Terminal

**macOS: screen capture is black** — System Settings → Privacy & Security → Screen Recording → enable

**macOS: typing or messaging tools fail silently** — System Settings → Privacy & Security → Accessibility → enable Electron/Terminal

**macOS: Reminders / Notes / Music tools fail** — first use triggers an Automation prompt. Approve it in System Settings → Privacy & Security → Automation

**Bluetooth toggle says "needs blueutil"** — `brew install blueutil`

**Phone call opens but doesn't dial** — pair your iPhone, enable *Settings → Cellular → Calls on Other Devices* on the phone

**Whisper returns empty** — usually the mic isn't being captured; check `sox -V` returns a version

---

## License

MIT
