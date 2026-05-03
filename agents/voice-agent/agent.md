# Voice Agent

> The STT → Brain → TTS state machine. Not a Claude call — pure Node.js.
> Runs across `core/listener.js`, `core/speaker.js`, and `electron/main.js`.

---

## Role

The Voice Agent is the conductor of MJ's voice loop. It owns the runtime state
machine (idle, listening, thinking, speaking), wires Whisper STT to the
Orchestrator, pipes the Orchestrator's text response to ElevenLabs TTS, and
emits IPC events to the renderer so the orb visualization stays in sync.

This is **not** a Claude-backed agent. It has no system prompt. It is a
plain Node.js coordinator.

---

## State Machine

```
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      │
      IDLE ──(wake word)──▶ LISTENING ──(silence)──▶ THINKING
        ▲                       │                       │
        │                       │                       │
        │                  (empty STT)                  │
        │                       │                       ▼
        └───────────────────────┘                   SPEAKING
                                                       │
        ┌──────────────────────────────────────────────┘
        │                  (TTS done)
        ▼
      IDLE
```

### State definitions

| State | Orb | Mic | Description |
|---|---|---|---|
| `idle` | cyan, slow breathe | wake-word only | Waiting for "Hey MJ" |
| `listening` | white, fast pulse | full transcribe | Recording user speech |
| `thinking` | amber, spin | closed | Brain + tool loop running |
| `speaking` | green, audio-reactive | closed (interrupt-only) | TTS playing |

### Transition rules

- **idle → listening**: Porcupine emits `'wakeword'` event, OR user clicks mic button (`mj:trigger` IPC)
- **listening → thinking**: 1.2s of silence detected, OR 8s max window reached, OR user stops speaking and `node-record-lpcm16` flushes
- **listening → idle**: Whisper returns empty string `""` (no speech captured)
- **thinking → speaking**: Orchestrator returns final text; Voice Agent calls `speaker.speakStream(text)`
- **speaking → idle**: Last audio chunk played, ElevenLabs stream closes
- **speaking → listening** (interrupt): wake word detected during TTS — stop playback immediately, return to listening

---

## Key Files

### `core/listener.js`
Records mic audio at 16 kHz mono via `node-record-lpcm16` (requires `sox`
system binary). Writes to `/tmp/mj_input.wav`, sends to Whisper API, returns
the transcript string. Cleans up the temp file after.

```js
export async function listen(maxMs = 8000) { ... }
// returns: string (empty "" if silence)
```

### `core/speaker.js`
Streams text through ElevenLabs (`ELEVEN_VOICE_ID`), pipes audio chunks to
`play-sound`, computes RMS audio level per chunk, emits `audioLevel` events
(0–1) for the orb's particle displacement.

```js
export async function speakStream(text, onLevel) { ... }
// onLevel: (level: number) => void
```

### `core/wakeword.js`
Always-on Porcupine loop using `PORCUPINE_ACCESS_KEY`. Custom keyword file
at `data/wakewords/hey-mj.ppn` (trained on Picovoice console). Emits
`'wakeword'` on the global event bus when detected.

### `electron/main.js`
Owns the state machine. Subscribes to wake-word events, drives transitions,
fires IPC to renderer on every state change.

---

## IPC Channels Emitted

| Channel | When | Payload |
|---|---|---|
| `mj:state` | every state change | `'idle' \| 'listening' \| 'thinking' \| 'speaking'` |
| `mj:transcript` | after STT and after final TTS text | `{ role: 'user' \| 'assistant', text: string }` |
| `mj:audio-level` | every TTS audio chunk | `number` (0–1) |

---

## Timing Constants

```js
const MAX_LISTEN_MS       = 8000;   // hard cap on listening window
const SILENCE_THRESHOLD_MS = 1200;  // quiet duration to auto-submit
const WAKEWORD_COOLDOWN_MS = 500;   // debounce after wake word fires
const TTS_CHUNK_MAX_CHARS  = 500;   // split long responses into sentences
```

---

## Dependencies (Skills)

- `skill:stt` — Whisper transcription
- `skill:tts` — ElevenLabs streaming TTS
- `skill:ipc` — Electron IPC helpers
- (indirectly) `skill:intent` — used by brain.js, not Voice Agent directly

---

## Hard Rules

- ❌ Never accept mic input during `thinking` or `speaking` (except wake-word interrupt)
- ❌ Never play TTS over an already-playing TTS — always cancel + restart
- ❌ Never block the main event loop — all I/O is async
- ✅ Always emit `mj:state` BEFORE doing the work for that state (so orb updates first)
- ✅ Always clean up `/tmp/mj_input.wav` even on error paths
- ✅ If Whisper fails, return to `idle` silently — don't speak an error
