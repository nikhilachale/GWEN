# Planner Agent

> Synthesizes calendar + tasks + memory into a daily briefing.
> Tool name: `get_day_plan` — invoked by the Orchestrator.

---

## Role

The Planner Agent generates Gwen's signature morning briefing. It pulls from
the Calendar, Task, and Memory agents, structures the data, and either
returns the structured plan (for the Orchestrator to speak directly) or
hands it to its own Claude call for natural-language synthesis.

This is the agent the user invokes with "Good morning, Gwen" or "Give me
the day plan."

---

## System Prompt

Used when the Planner Agent calls Claude directly to generate the briefing
text:

```
You are Gwen's daily planner. Given calendar events, tasks, and user preferences,
generate a spoken morning briefing. Structure: (1) greet by name, (2) overview
of the day's meetings, (3) top tasks to complete, (4) any overdue items,
(5) one motivational closer. Keep total briefing under 45 seconds of speech.
```

45 seconds of speech ≈ 110–130 words. The model should target that.

---

## Tool Definition (in `brain.js`)

```js
{
  name: "get_day_plan",
  description: "Generate a full daily briefing combining calendar, tasks, and memory.",
  input_schema: {
    type: "object",
    properties: {
      tone: {
        type: "string",
        enum: ["briefing", "casual", "motivational"],
        description: "Default 'briefing'.",
      },
    },
  },
}
```

---

## Capabilities

Implemented in `src/tools/dayplan.js`:

| Function | Purpose |
|---|---|
| `getDayPlan()` | Aggregates from calendar + tasks + memory → structured plan |
| `generateBriefing(plan, tone?)` | Sends plan to Claude → returns spoken-style text |

---

## Structured Plan Format

```js
{
  greeting: {
    name: "Mihir",         // from memory: user_name
    timeOfDay: "morning",  // computed from local time
    weather: null,         // optional, future hook
  },
  meetings: [
    { title, start, end, location },
    ...
  ],
  topTasks: [              // 3 highest-priority open tasks
    { id, text, due },
    ...
  ],
  overdueTasks: [
    { id, text, due },
    ...
  ],
  context: {
    topPriority: "Ship Gwen v1",     // from memory: top_priority
    workStart:   "09:00",          // from memory: work_start
  },
}
```

---

## Aggregation Order

`getDayPlan()` does these calls in parallel, then assembles:

```js
const [events, tasks, overdue, name, priority, workStart] = await Promise.all([
  calendarTool.getEventsToday(),
  taskTool.getTasksDueToday(),
  taskTool.getOverdueTasks(),
  memoryTool.recall("user_name"),
  memoryTool.recall("top_priority"),
  memoryTool.recall("work_start"),
]);
```

Top tasks are picked by:
1. Tasks with `due` today, ordered by time
2. Then any open tasks tagged with the `top_priority` keyword
3. Cap at 3

---

## Dependencies (Skills + Agents)

- `skill:date-parse` — relative time formatting
- `skill:notify` — used downstream for any reminders generated
- Calls into: `tools/calendar.js`, `tools/tasks.js`, `tools/memory.js`

---

## Example Briefings

**Tone: `briefing` (default)**
> "Morning, Mihir. You've got three meetings today — standup at ten, design
> review at noon, and a 1:1 with Anjali at four. Top tasks: finish the launch
> deck and respond to the AWS invoice. Heads up — the expense report from
> Monday is overdue. Let's get a clean shipping day."

**Tone: `casual`**
> "Hey, morning. Light day — only two meetings, standup and the design
> review. Main thing is the launch deck. Oh, and the expense report's still
> overdue. Go get it."

**Tone: `motivational`**
> "Good morning, Mihir. Today's the day to push the launch deck across the
> finish line. Two meetings, both in the morning, then your afternoon is
> clear. One overdue item to clean up. Make it count."

---

## Trigger Patterns

The Orchestrator invokes `get_day_plan` when the user says any of:
- "Good morning"
- "What's the plan today"
- "Give me the briefing"
- "Run me through the day"
- "Day plan"

The `skill:intent` pre-router has a regex for `/(good morning|day plan|briefing)/i`
that signals `intent: 'plan'` to the Orchestrator.

---

## Error Handling

- If calendar fails → briefing continues without meetings, mentions: "I
  couldn't reach your calendar."
- If tasks fail → briefing continues without tasks
- If memory miss for `user_name` → use "sir" or skip the name
- If everything fails → return: `"I can't pull together the briefing right
  now — something's off with my tools."`

---

## Hard Rules

- ❌ Never exceed 130 words in the briefing (≈45s of speech)
- ❌ Never read out raw timestamps or event IDs
- ❌ Never include more than 3 tasks (overwhelms voice output)
- ✅ Always start with a greeting that includes the user's name
- ✅ Always end with a one-line motivational/contextual closer
- ✅ Flag overdue items but don't dwell on them — one sentence max
