# MJ — JARVIS-Style AI Assistant

Voice-first, always-on AI desktop assistant.

> See [`CLAUDE.md`](./CLAUDE.md), [`agents/AGENTS.md`](./agents/AGENTS.md), and [`agents/SKILLS.md`](./agents/SKILLS.md) for full architecture.

---

## Quick Start

### 1. Install system dependencies

**macOS:**
```bash
brew install sox
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

## What works out of the box

✅ Three.js orb (cyan → white → amber → green by state)
✅ Manual mic trigger (click the orb)
✅ Whisper STT
✅ Claude tool-use loop with all tools
✅ ElevenLabs streaming TTS with audio-reactive orb
✅ SQLite memory, JSON tasks, markdown notes
✅ Tavily search
✅ Google Calendar + Gmail (after `npm run setup-oauth`)
✅ Screen capture (asks for permission on first use, macOS)

## What's stubbed (drop-in once you have keys)

🟡 Wake word — Porcupine `.ppn` file at `data/wakewords/hey-mj.ppn` required
🟡 Claude Code build pipeline — works if `claude` CLI is on `$PATH`

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

**Whisper returns empty** — usually the mic isn't being captured; check `sox -V` returns a version

---

## License

MIT
# GWEN
