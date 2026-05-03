# Notes Agent

> Save and retrieve freeform notes as markdown files.
> Tool names: `save_note`, `get_notes` — invoked by the Orchestrator.

---

## Role

The Notes Agent persists freeform user notes to disk as individual markdown
files. It supports keyword search across all notes and retrieval by title.
Notes are human-readable on disk — the user can open them in any editor.

---

## System Prompt

Used when the Notes Agent is invoked as a standalone Claude call:

```
You are Gwen's notes module. When saving a note, confirm the title and save it.
When retrieving notes, summarize relevant ones for voice. Notes are stored as
markdown files — keep them clean and searchable.
```

---

## Tool Definitions (in `brain.js`)

```js
{
  name: "save_note",
  description: "Save a freeform note as a markdown file.",
  input_schema: {
    type: "object",
    properties: {
      title:   { type: "string", description: "Short title (used as filename slug)." },
      content: { type: "string", description: "Note body in plain text or markdown." },
    },
    required: ["title", "content"],
  },
}

{
  name: "get_notes",
  description: "List or search saved notes.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Optional keyword to search titles + bodies." },
    },
  },
}
```

---

## Capabilities

Implemented in `src/tools/notes.js`:

| Function | Purpose |
|---|---|
| `saveNote(title, content)` | Write `data/notes/{slug}.md` |
| `getNotes(query?)` | List all, or filter by keyword |
| `getNote(title)` | Retrieve a specific note's content |
| `deleteNote(title)` | Remove a note file |

---

## File Format

```md
# Note Title
Date: 2026-05-02

[content here in plain markdown]
```

### Slug rules
- Lowercase
- Spaces → `-`
- Strip non-alphanumeric (keep `-`)
- Truncate to 60 chars
- If a slug collides, append `-2`, `-3`, etc.

Example: `"Q3 Strategy Ideas"` → `data/notes/q3-strategy-ideas.md`

---

## Search Behavior

`getNotes(query)` does a simple case-insensitive substring match across:
1. Filename (slug)
2. First-line title
3. Body content

Returns up to 10 matches, ranked by:
- Title hit > body hit
- More recent `Date:` field > older

For the voice summary, return:
```js
[
  { title: "Q3 Strategy Ideas", date: "2026-04-28", preview: "first 200 chars..." },
  ...
]
```

---

## Dependencies (Skills)

- `skill:storage` — directory + file write helpers (though notes use plain `fs`)

---

## Example Interactions

**User:** "Note this: explore using OpenTelemetry for the backend tracing."
**Orchestrator** → `save_note({ title: "OpenTelemetry idea", content: "..." })` →
"Saved that as 'OpenTelemetry idea'."

**User:** "What did I jot down about the launch?"
**Orchestrator** → `get_notes({ query: "launch" })` → "Three notes — 'Launch
prep checklist' from last Tuesday, 'Launch retro questions' from Friday, and
'Launch day timeline' from this morning."

**User:** "Read me the launch retro questions."
**Orchestrator** → `get_notes` to find it → `getNote("Launch retro questions")`
→ reads back content (or summarizes if long).

---

## Error Handling

- Title empty → return: `"What should I call this note?"`
- File write fails → return: `"I couldn't save that note — disk might be full."`
- Zero search results → return: `"I don't have any notes matching that."`

---

## Hard Rules

- ❌ Never overwrite an existing note silently — append `-2` etc. on slug collision
- ❌ Never read out a full long note — summarize or read first paragraph
- ✅ Always include a `Date:` line on save
- ✅ Notes are plain markdown — never embed binary or base64 content
