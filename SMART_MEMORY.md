# Gwen Smart Memory — 3-Layer Plan

> **Status:** Plan only. No code shipped yet. Code prototype was reverted because the chosen embedding path required OpenAI usage; this doc now reflects the local-embedding approach that uses zero new vendors and zero recurring cost.

## Goal

Make Gwen know Miles, know how Miles works, and respond smarter every turn — not by switching to a different brain, but by feeding the existing brain (Claude Haiku 4.5) the right memory context on every call.

The current memory is a SQLite key/value store with substring search. Claude only sees stored facts when it explicitly invokes `recall(key)`, and recall requires guessing the exact key. The shift: pre-fetch *relevant* memories every turn and inject them into the system prompt automatically.

## Cost & vendor constraint

Hard rule: **no new vendors, no new API keys, no recurring API spend.** Only use what's already paid for: Anthropic (brain), ElevenLabs (TTS), Tavily (search), Google (calendar/email), Picovoice (wake word). STT runs locally via `nodejs-whisper`.

This rules out:
- OpenAI embeddings (no key)
- Voyage / Cohere / other hosted embedding vendors
- Any "extra" hosted LLM (Hermes via Ollama was already rejected — too heavy)

What it leaves:
- **Local embeddings via `@xenova/transformers`** (Transformers.js). Runs in-process via WASM/ONNX. ~25 MB one-time model download, then forever free, works offline. Lower quality than OpenAI's but solid for short-memory recall.
- **Better keyword search** as a fallback if local embeddings can't be installed (stemming + fuzzy match on top of the existing SQLite `LIKE` query).

---

## Layer 1 — Semantic recall + auto-injection (next)

The foundation. Embed every memory; pre-fetch top-K relevant memories per turn; inject into the system prompt.

**How it'd work:**
1. Every memory write (via `remember()` tool or `passiveMemory` extraction) fires a background embed call to a local Transformers.js pipeline (`all-MiniLM-L6-v2`, 384-dim vectors).
2. Embeddings stored as raw `Float32` BLOB in a new column on the existing `memory` table.
3. Before each brain turn, embed the user's transcript locally, run cosine similarity over all memory embeddings, take top 5 (score ≥ 0.25), inject as a system-prompt block.
4. Runs *alongside* the existing `getAutoFactsBlock` (which dumps all auto-extracted facts) — semantic recall adds situational matches.

**Files to add/touch:**
- `src/skills/sqlite.ts` — add `embedding` BLOB column + migration; helpers `setEmbedding()`, `getRowsWithEmbeddings()`, `getRowsMissingEmbeddings()`
- `src/skills/embeddings.ts` — NEW: Transformers.js pipeline wrapper. First call lazily downloads the model to `~/.cache/huggingface/`; subsequent calls reuse the cached pipeline.
- `src/skills/semanticMemory.ts` — NEW: cosine similarity, `recallRelevant()`, `formatRelevantBlock()`, `embedAndSave()`
- `src/skills/passiveMemory.ts` — fire-and-forget embed after each saved fact
- `src/tools/memory.ts` — fire-and-forget embed in `remember()`
- `src/core/brain.ts` — call `formatRelevantBlock(userInput)` per turn in both `runBrain` and `runBrainStream`; append to system prompt
- `scripts/backfill-embeddings.ts` — NEW: one-shot to embed existing rows
- `package.json` — add `@xenova/transformers` dep + `npm run backfill:embeddings`

**Risks to validate before building:**
- `@xenova/transformers` ships `onnxruntime-node` (native binding). Confirm it works inside Electron's renderer/main process without conflicting with the existing `better-sqlite3` electron-rebuild flow. If native fails, fall back to the WASM backend (slower but no native compile).
- First-run model download is ~25 MB. Need to surface this to the user (briefing line: *"Setting up local memory for the first time — one moment."*).
- Embedding latency in-process: typically 50–200 ms on Apple Silicon CPU. Adds to per-turn time budget. If too slow, run the embed call in a worker thread.

**Verification (when built):**
1. Tell Gwen something specific: *"I take oat milk in flat whites."*
2. End the turn (let her reply).
3. Inspect the DB: row should now have a non-null `embedding` column.
4. New session: ask *"what do I take in coffee?"* — she should answer correctly even though no key matches "coffee."
5. Brain logs should show injected memory block.

---

## Layer 2 — Behavioral preference observer (later)

Today Gwen only remembers things Miles tells her explicitly. She should also notice patterns from how he reacts.

**How it'd work:**
- After each turn, run a small Haiku call with the last 2–3 exchanges asking: *"Did the user push back, interrupt, ask for a different style, or express frustration? If so, what preference does that imply?"*
- Save findings to a new `preference` category (e.g. `prefers_terse_replies`, `dislikes_clarifying_questions`).
- Preference category gets *high-priority* injection — always pulled regardless of semantic match.

**Cost:** ~$0.0001/turn in Haiku tokens (already-budgeted vendor).

**Files (planned):**
- `src/skills/behaviorObserver.ts` — NEW
- `src/core/brain.ts` — fire-and-forget post-turn observer call
- `src/skills/sqlite.ts` — add helper `listPreferences()`
- `src/skills/semanticMemory.ts` — `formatRelevantBlock` always prepends preferences

**Effect:** after the second time Miles says "shorter," Gwen stops giving paragraphs.

---

## Layer 3 — Conversation summarization (later)

Old turns get truncated and lost. Roll them up into long-term memories.

**How it'd work:**
- At session-end (state idle for >10 min) or every N turns, summarize the conversation into one memory entry: *"Worked on UI overhaul — fullscreen overlay, HUD, halftone, task panel; committed da584d4."*
- Stored as `session_log` category, semantically searchable so future "remind me what we did last week" calls actually find it.

**Cost:** one Haiku call per summarization (a few times per day max). Negligible.

**Files (planned):**
- `src/skills/sessionSummarizer.ts` — NEW
- `src/core/brain.ts` — track last-activity timestamp; trigger summarizer on idle threshold or wrap into proactive loop

**Effect:** three weeks from now Gwen can still reference "you wrestled with the orb shader for a while back in early May."

---

## Order of execution (when ready to build)

1. **Layer 1** — foundation. Validate Transformers.js works in Electron first, then build out.
2. **Layer 2** — highest leverage for "she gets me" feel.
3. **Layer 3** — quietest impact, mostly future-proofing.

## Why not Hermes / local LLM (revisited)

Considered. Rejected. Hermes via Ollama is the right shape for *fact extraction* and *summarization*, but for Gwen's volume (one user, light usage) the cost savings are negligible while the friction is real (5–8 GB RAM, 5 GB model download, daemon to manage, slower cold starts, noisier output than Haiku).

Local embeddings via Transformers.js are different — much smaller (25 MB), faster (in-process WASM), single-purpose, no daemon, no LLM quality concerns. Only used to compute similarity, not generate text.

Revisit Hermes if (a) full offline support becomes a goal, or (b) sending fact-extraction prompts to Anthropic becomes a privacy concern.
