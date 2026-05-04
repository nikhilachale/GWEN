# Calendar Agent

> Reads calendar events from either macOS Calendar.app or Google Calendar and summarizes them for voice.
> Tool name: `get_calendar` — invoked by the Orchestrator via `tool_use`.

---

## Role

The Calendar Agent is read-only. It queries the user's calendar (macOS
Calendar.app by default, Google Calendar API as an alternate), returns
structured event data to the Orchestrator, and (when invoked standalone)
synthesizes voice-friendly summaries.

---

## System Prompt

Used when the Calendar Agent is invoked as a standalone Claude call (e.g.
`generateCalendarSummary(events)` in `tools/calendar.js`):

```
You are Gwen's calendar module. Given a list of calendar events, summarize them
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
  description: "Get upcoming events from the macOS Calendar.app (or Google Calendar) for the next N days.",
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

## Backends

### macOS Calendar.app (default)
- Read via JXA (`osascript -l JavaScript`) against `Application('Calendar')`
- No OAuth, no API keys — picks up every account already configured in Calendar.app (iCloud, Google, Exchange)
- First run triggers a TCC prompt: System Settings → Privacy & Security → Calendars
- Read-only by convention — this agent never writes events

### Google Calendar API (alternate)
- Read via `googleapis` SDK
- Only scope ever requested: `https://www.googleapis.com/auth/calendar.readonly` — never `calendar` (read-write), `calendar.events`, or any broader scope
- Token storage and refresh handled by `skill:oauth`. Token file path configured via `GOOGLE_TOKEN_PATH` (default: `./data/google-token.json`), gitignored

---

## Dependencies (Skills)

- `skill:oauth` — Google OAuth2 client + auto-refresh (only required for the Google backend)
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

- **macOS backend**, TCC permission denied → return string: `"I need Calendar
  access. Grant it in System Settings → Privacy & Security → Calendars."`
- **Google backend**, OAuth token missing or unrefreshable → return string:
  `"I don't have access to your calendar yet. Run the setup script to connect it."`
- Either backend, transport/network error → return string: `"I can't reach
  Calendar right now."`
- Calendar has zero events in range → return string: `"Your calendar is clear."`

Never throw — always return a voice-friendly fallback string. The
Orchestrator will speak it directly.

---

## Hard Rules

- ❌ Never request write scopes
- ❌ Never read out event IDs or raw `start.dateTime` timestamps
- ❌ Never include event descriptions longer than 200 chars
- ✅ Always group multi-day output by day (today, tomorrow, "Friday")
- ✅ Always use relative time when within 48 hours
