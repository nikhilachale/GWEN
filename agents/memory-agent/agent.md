# Memory Agent

> Persistent key-value memory for preferences and facts.
> Tool names: `remember`, `recall` — invoked by the Orchestrator.

---

## Role

The Memory Agent is Gwen's long-term memory. It stores user preferences,
facts the user has explicitly told Gwen to remember, and seed values
collected on first run. Memory is keyed and lives in SQLite at
`data/.gwen-memory.db`.

This is **not** conversation history — only structured key-value facts.
The Orchestrator uses `recall` proactively before guessing user
preferences.

---

## System Prompt

Used when the Memory Agent is invoked as a standalone Claude call:

```
You are Gwen's memory module. Store facts and preferences the user tells you.
When recalling, return the exact stored value naturally in a sentence.
If not found, say so and offer to store it.
```

---

## Tool Definitions (in `brain.js`)

```js
{
  name: "remember",
  description: "Persist a fact or preference to long-term memory.",
  input_schema: {
    type: "object",
    properties: {
      key:      { type: "string", description: "Snake_case key, e.g. 'preferred_language'." },
      value:    { type: "string", description: "The value to store." },
      category: { type: "string", description: "Optional grouping, default 'general'." },
    },
    required: ["key", "value"],
  },
}

{
  name: "recall",
  description: "Retrieve a stored memory by key. Returns null if not found.",
  input_schema: {
    type: "object",
    properties: {
      key: { type: "string", description: "The key to look up." },
    },
    required: ["key"],
  },
}
```

---

## Capabilities

Implemented in `src/tools/memory.js`:

| Function | Purpose |
|---|---|
| `remember(key, value, category?)` | Upsert into SQLite |
| `recall(key)` | Fetch by exact key |
| `listMemories()` | Dump all stored memories |
| `listByCategory(cat)` | Filter by category |
| `forgetKey(key)` | Delete a memory |
| `searchMemories(query)` | LIKE search across keys + values |

---

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS memory (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  category   TEXT DEFAULT 'general',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category);
```

---

## Pre-seeded Keys

On first run, Gwen asks for and stores these:

| Key | Prompt | Category |
|---|---|---|
| `user_name` | "What should I call you?" | `identity` |
| `location` | "What city are you based in?" | `identity` |
| `work_start` | "What time do you usually start work?" | `routine` |
| `top_priority` | "What's your top focus area right now?" | `goals` |

The setup flow is in `scripts/first-run.js` — runs once if the DB is empty.

---

## Common Key Conventions

| Category | Example keys |
|---|---|
| `identity` | `user_name`, `location`, `timezone`, `pronouns` |
| `routine` | `work_start`, `work_end`, `lunch_time` |
| `goals` | `top_priority`, `current_project`, `learning_goal` |
| `preferences` | `ui_preference`, `preferred_language`, `coffee_order` |
| `relationships` | `partner_name`, `kids_names`, `boss_name` |

Keys are always `snake_case`. The Orchestrator should use these
conventions when storing new memories.

---

## Dependencies (Skills)

- `skill:sqlite` — `better-sqlite3` wrapper

---

## Example Interactions

**User:** "Remember I prefer dark mode."
**Orchestrator** → `remember({ key: "ui_preference", value: "dark mode", category: "preferences" })`
→ "Got it. Dark mode it is."

**User:** "What's my top priority right now?"
**Orchestrator** → `recall({ key: "top_priority" })` → "Shipping the Gwen v1
release — that's what you told me last week."

**User:** "Forget my location."
**Orchestrator** → `forgetKey({ key: "location" })` → "Done — I've forgotten
your location."

**User:** "Build me a quick web app." [Orchestrator should `recall("preferred_language")`
before deciding the framework.]

---

## Error Handling

- Recall miss → return string: `"I don't have that on record. Want me to
  remember it now?"`
- DB locked / corrupt → log error, return: `"I'm having trouble with my
  memory right now."`

---

## Hard Rules

- ❌ Never store sensitive data without explicit user instruction (passwords, SSNs, card numbers)
- ❌ Never overwrite a memory without confirming if the new value differs significantly
- ❌ Never store conversation history here — that's for context windows
- ✅ Always normalize keys to `snake_case`
- ✅ Always `recall` before guessing user preferences in any other tool
