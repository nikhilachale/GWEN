# Gwen — Skills Registry
> Place this at `agents/SKILLS.md`
> Skills are reusable capability units that agents can invoke.
> A Skill = a focused capability with defined input, output, and rules.

---

## What is a Skill vs an Agent?

| | Agent | Skill |
|---|---|---|
| **Has a system prompt** | ✅ | ❌ |
| **Makes Claude API calls** | ✅ | ❌ (pure JS) |
| **Reusable across agents** | Sometimes | ✅ Always |
| **Has state** | Sometimes | ❌ Stateless |
| **Example** | Calendar Agent | Parse a date string |

Skills are **pure functions** — same input, same output, no side effects beyond their single purpose.

---

## Skill List

### 1. 🎙️ `skill:stt` — Speech to Text

**File:** `src/skills/stt.js`
**Used by:** Voice Agent
**Description:** Records audio from mic and returns a transcript string

```js
// Interface
async function transcribeAudio(durationMs = 8000): Promise<string>
async function transcribeFile(filePath: string): Promise<string>
```

**Details:**
- Uses Whisper API (`whisper-1` model via OpenAI SDK)
- Records via `node-record-lpcm16` at 16kHz mono WAV
- Saves to temp file `/tmp/mj_input.wav`, cleans up after
- Returns empty string `""` if no speech detected (never throws)
- Silence detection: stops early if >1.2s of silence detected

**Dependencies:** `openai`, `node-record-lpcm16`, `sox` (system binary)

---

### 2. 🔊 `skill:tts` — Text to Speech

**File:** `src/skills/tts.js`
**Used by:** Voice Agent
**Description:** Converts text to JARVIS-style speech audio

```js
// Interface
async function speak(text: string): Promise<void>
async function speakStream(text: string, onChunk: (level: number) => void): Promise<void>
```

**Details:**
- Uses ElevenLabs streaming API
- Voice ID from `ELEVEN_VOICE_ID` env var
- Streams audio chunks → `play-sound` for real-time playback
- Emits audio level (0–1) on each chunk for orb visualization
- Splits long text into sentences before sending (max 500 chars/chunk)
- Handles SSML pauses: `"..."` → 500ms pause, `","` → 100ms

**Dependencies:** `elevenlabs`, `play-sound`

---

### 3. 🌐 `skill:oauth` — Google OAuth2

**File:** `src/skills/oauth.js`
**Used by:** Calendar Agent, Email Agent
**Description:** Handles Google OAuth2 token flow and refresh

```js
// Interface
async function getAuthClient(): Promise<OAuth2Client>
async function refreshTokenIfNeeded(client: OAuth2Client): Promise<void>
function isTokenValid(): boolean
```

**Details:**
- Reads/writes token from `GOOGLE_TOKEN_PATH`
- Auto-refreshes access token when expired
- First-run: opens browser for consent, saves refresh token
- Scopes requested: `calendar.readonly` + `gmail.readonly` only
- Token file is gitignored — never commit

**Dependencies:** `googleapis`

---

### 4. 📅 `skill:date-parse` — Natural Language Date Parsing

**File:** `src/skills/dateParse.js`
**Used by:** Task Agent, Calendar Agent, Planner Agent
**Description:** Converts natural language time expressions to ISO 8601

```js
// Interface
function parseDate(input: string): string  // returns ISO 8601 or null
function formatForVoice(isoDate: string): string  // "tomorrow at 3pm"
function isToday(isoDate: string): boolean
function isFuture(isoDate: string): boolean
function relativeTo(isoDate: string, from?: Date): string  // "in 2 hours"
```

**Examples:**
```
"tomorrow at 3pm"    → "2025-05-03T15:00:00"
"next Monday"        → "2025-05-06T09:00:00"
"in 2 hours"         → "2025-05-02T10:30:00"
"Friday morning"     → "2025-05-09T09:00:00"
```

**Dependencies:** `chrono-node`

---

### 5. 💾 `skill:storage` — Local JSON Storage

**File:** `src/skills/storage.js`
**Used by:** Task Agent, Notes Agent
**Description:** Simple read/write for flat JSON data files

```js
// Interface
function readJSON(filePath: string, defaultValue?: any): any
function writeJSON(filePath: string, data: any): void
function appendToArray(filePath: string, item: any): void
function updateArrayItem(filePath: string, id: string, updates: any): void
function deleteArrayItem(filePath: string, id: string): void
```

**Details:**
- All paths relative to `data/` directory
- Creates file with default value if it doesn't exist
- Atomic writes (write to temp → rename) to prevent corruption
- Uses `crypto.randomUUID()` for IDs

**Dependencies:** none (Node.js built-ins only)

---

### 6. 🧠 `skill:sqlite` — SQLite Memory Store

**File:** `src/skills/sqlite.js`
**Used by:** Memory Agent
**Description:** Thin wrapper over `better-sqlite3` for key-value memory

```js
// Interface
function get(key: string): string | null
function set(key: string, value: string, category?: string): void
function delete(key: string): void
function listAll(): Array<{key, value, category, updated_at}>
function listByCategory(category: string): Array<{key, value}>
function search(query: string): Array<{key, value}>  // LIKE search
```

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS memory (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  category   TEXT DEFAULT 'general',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Dependencies:** `better-sqlite3`

---

### 7. 📸 `skill:screenshot` — Screen Capture

**File:** `src/skills/screenshot.js`
**Used by:** Screen Agent
**Description:** Captures the current screen state as base64 PNG

```js
// Interface
async function captureScreen(): Promise<string>        // returns base64 PNG
async function captureWindow(title: string): Promise<string>
function getActiveAppName(): string                    // e.g. "VS Code"
```

**Details:**
- Uses `screenshot-desktop` npm package
- Returns base64-encoded PNG string (ready for Claude image block)
- Never writes to disk
- `getActiveAppName()` uses `active-win` package
- Resolution capped at 1920×1080 (downscaled if larger)

**Dependencies:** `screenshot-desktop`, `active-win`

---

### 8. 🔍 `skill:search` — Web Search

**File:** `src/skills/search.js`
**Used by:** Search Agent
**Description:** Searches the web and returns clean structured results

```js
// Interface
async function search(query: string, count?: number): Promise<SearchResult[]>
async function fetchPage(url: string): Promise<string>  // returns text content
```

**Result type:**
```js
{
  title: string,
  url: string,
  snippet: string,
  published: string | null,
  score: number
}
```

**Details:**
- Primary: Tavily API (`TAVILY_KEY`)
- Fallback: Brave Search API if Tavily fails
- `fetchPage` strips HTML → clean text via `@mozilla/readability` + `jsdom`
- Max snippet: 300 chars
- Always returns array (empty array on failure, never throws)

**Dependencies:** `tavily`, `@mozilla/readability`, `jsdom`

---

### 9. ⚡ `skill:ipc` — Electron IPC Helper

**File:** `src/skills/ipc.js`
**Used by:** Voice Agent, Code Agent, all tools
**Description:** Typed wrapper for sending events to the renderer

```js
// Interface (main process only)
function sendState(state: 'idle'|'listening'|'thinking'|'speaking'): void
function sendTranscript(role: 'user'|'assistant', text: string): void
function sendAudioLevel(level: number): void  // 0–1
function sendCodeOutput(chunk: string): void
```

**Details:**
- Reads `global.mainWindow` set by `electron/main.js`
- Silently no-ops if window not ready yet
- All channels defined in `CLAUDE.md` IPC table

**Dependencies:** `electron` (main process)

---

### 10. 🔔 `skill:notify` — System Notifications + Reminders

**File:** `src/skills/notify.js`
**Used by:** Task Agent, Planner Agent
**Description:** Schedules and fires reminders

```js
// Interface
function scheduleReminder(task: Task): void
function cancelReminder(taskId: string): void
function checkOverdueTasks(): Task[]
function startReminderLoop(intervalMs?: number): void  // default 30min
```

**Details:**
- Uses `node-cron` for scheduling
- Fires `speak()` + system notification via `node-notifier`
- Reminders fire: 1 hour before + at due time
- `startReminderLoop` called on Gwen startup from `electron/main.js`

**Dependencies:** `node-cron`, `node-notifier`

---

### 11. 🎯 `skill:intent` — Pre-routing Intent Detection

**File:** `src/skills/intent.js`
**Used by:** brain.js (before Claude call)
**Description:** Fast local pattern match for common intents (saves API latency)

```js
// Interface
function detectIntent(text: string): Intent | null
```

**Intent type:**
```js
{
  type: 'calendar'|'email'|'task'|'note'|'memory'|'search'|'build'|'plan'|'screen'|'unknown',
  confidence: number,  // 0–1
  entities: Record<string, string>  // extracted values
}
```

**Patterns (examples):**
```
"what's on my schedule"  → { type: 'calendar', confidence: 0.95 }
"any unread messages"    → { type: 'email', confidence: 0.9 }
"remind me to..."        → { type: 'task', confidence: 0.95 }
"remember that I..."     → { type: 'memory', confidence: 0.9 }
"build me a..."          → { type: 'build', confidence: 0.85 }
"what am I looking at"   → { type: 'screen', confidence: 0.95 }
```

**Details:**
- Regex + keyword matching, no ML
- Used to **pre-select tools** before Claude call (reduces latency ~200ms)
- If confidence < 0.7 → skip, let Claude decide

**Dependencies:** none

---

### 12. 🎨 `skill:orb` — Audio-Reactive Orb (Frontend)

**File:** `src/ui/skills/useOrb.js` (React hook)
**Used by:** `Orb.jsx`
**Description:** Hook that manages orb state, color, and animation parameters

```js
// Interface
function useOrb(): {
  state: OrbState,
  color: string,
  audioLevel: number,
  pulseSpeed: number,
  particleCount: number,
  setState: (state: OrbState) => void,
  setAudioLevel: (level: number) => void,
}
```

**State → visual mapping:**
```
idle      → cyan #00d4ff,   slow breathe,  3000 particles
listening → white #ffffff,  fast pulse,    4000 particles
thinking  → amber #ff9500,  spin + morph,  3500 particles
speaking  → green #00ff88,  audio-reactive, 5000 particles
```

**Details:**
- Subscribes to IPC events via `window.gwenBridge` (preload contextBridge)
- Smoothly interpolates between states (no hard cuts)
- `audioLevel` (0–1) drives particle displacement in `speaking` state
- Uses `lerp` for all value transitions

**Dependencies:** `react`, `three`, `@react-three/fiber`

---

## Skill Dependency Map

```
brain.js
  └── skill:intent (pre-route)
  └── [Claude API call]
       └── skill:stt (input)
       └── skill:tts (output)
            └── skill:ipc (update orb)

calendar-agent
  └── skill:oauth
  └── skill:date-parse

email-agent  
  └── skill:oauth

task-agent
  └── skill:storage
  └── skill:date-parse
  └── skill:notify

notes-agent
  └── skill:storage

memory-agent
  └── skill:sqlite

search-agent
  └── skill:search

screen-agent
  └── skill:screenshot

planner-agent
  └── skill:date-parse
  └── skill:notify

code-agent
  └── skill:ipc (stream output)

Orb.jsx
  └── skill:orb (useOrb hook)
```

---

## Adding a New Skill

1. Create `src/skills/[skillName].js`
2. Export pure functions only — no global state
3. Add JSDoc types for all function signatures
4. Add entry here in `SKILLS.md`
5. Import directly in the agent/tool that needs it
6. Write a test in `scripts/test-skill.js [skillName]`
