# Calendar Agent

> Reads Google Calendar events and summarizes them for voice.
> Tool name: `get_calendar` — invoked by the Orchestrator via `tool_use`.

---

## Role

The Calendar Agent is read-only. It queries Google Calendar, returns
structured event data to the Orchestrator, and (when invoked standalone)
synthesizes voice-friendly summaries.

---

## System Prompt

Used when the Calendar Agent is invoked as a standalone Claude call (e.g.
`generateCalendarSummary(events)` in `tools/calendar.js`):

```
You are MJ's calendar module. Given a list of calendar events, summarize them
naturally for voice output. Group by day. Use relative time ("tomorrow at 3pm",
"in 2 hours"). Never read out event IDs or raw timestamps. If the calendar is
empty, say so concisely.
```

In the default flow, the Orchestrator calls `get_calendar` and synthesizes
the summary itself — this scoped prompt is only used if the Calendar Agent
is invoked directly by another sub-agent (e.g. the Planner Agent).

---

## Tool Definition (in `brain.js`)

```js
{
  name: "get_calendar",
  description: "Get upcoming Google Calendar events for the next N days.",
  input_schema: {
    type: "object",
    properties: {
      days: {
        type: "number",
        description: "How many days ahead to fetch. Default 1 (today only).",
      },
      query: {
        type: "string",
        description: "Optional keyword filter on event titles.",
      },
    },
  },
}
```

---

## Capabilities

Implemented in `src/tools/calendar.js`:

| Function | Returns |
|---|---|
| `getCalendarEvents(days)` | Array of events for next N days |
| `getEventsToday()` | Today only (00:00 → 23:59 local) |
| `getNextEvent()` | Single next upcoming event, or null |
| `searchEvents(query)` | Keyword match in `summary` field |

### Event format

```js
{
  title: string,        // event.summary
  start: string,        // ISO 8601
  end: string,          // ISO 8601
  location: string,     // event.location || ""
  description: string,  // event.description || "" (trimmed to 200 chars)
}
```

Event IDs and raw `dateTime` objects are intentionally stripped — the
Orchestrator never needs them, and they pollute Claude's context window.

---

## OAuth Scopes

```
https://www.googleapis.com/auth/calendar.readonly
```

That's the **only** scope this agent requests. Never request `calendar`
(read-write), `calendar.events`, or any broader scope.

Token storage and refresh is handled by `skill:oauth`. Token file path is
configured via `GOOGLE_TOKEN_PATH` (default: `./data/google-token.json`),
which is gitignored.

---

## Dependencies (Skills)

- `skill:oauth` — Google OAuth2 client + auto-refresh
- `skill:date-parse` — relative time formatting (`"tomorrow at 3pm"`)

---

## Example Interactions

**User:** "What's on tomorrow?"
**Orchestrator** → `get_calendar({ days: 2 })` → filters to tomorrow only → "You've
got a 1:1 with Anjali at nine, then design review at eleven, and the rest of
the day is clear."

**User:** "When's my next meeting?"
**Orchestrator** → `get_calendar({ days: 7 })` → picks earliest future event →
"Your next meeting is the all-hands at three this afternoon."

**User:** "Anything about the launch this week?"
**Orchestrator** → `get_calendar({ days: 7, query: "launch" })` → "Two: a launch
prep sync on Wednesday morning, and the launch retro on Friday at four."

---

## Error Handling

- If the OAuth token is missing or unrefreshable → return string: `"I don't have
  access to your calendar yet. Run the setup script to connect it."`
- If the Google API returns a network error → return string: `"I can't reach
  Google Calendar right now."`
- If the calendar has zero events in range → return string: `"Your calendar is
  clear."`

Never throw — always return a voice-friendly fallback string. The
Orchestrator will speak it directly.

---

## Hard Rules

- ❌ Never request write scopes
- ❌ Never read out event IDs or raw `start.dateTime` timestamps
- ❌ Never include event descriptions longer than 200 chars
- ✅ Always group multi-day output by day (today, tomorrow, "Friday")
- ✅ Always use relative time when within 48 hours
