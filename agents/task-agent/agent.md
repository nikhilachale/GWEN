# Task Agent

> Manages tasks, to-dos, and reminders.
> Tool names: `add_task`, `get_tasks` — invoked by the Orchestrator.

---

## Role

The Task Agent owns the user's task list. It creates tasks (with optional
due dates parsed from natural language), lists them, marks them complete,
and fires reminders when due times approach.

Tasks live in flat JSON at `data/tasks.json`. The agent also schedules
reminders via `skill:notify` so MJ can announce upcoming tasks unprompted.

---

## System Prompt

Used when the Task Agent is invoked as a standalone Claude call:

```
You are MJ's task manager. When adding tasks, confirm with: "Got it. Added [task]
[with due date if given]." When listing tasks, group by due date. Overdue tasks
should be flagged first. Keep it concise for voice.
```

---

## Tool Definitions (in `brain.js`)

```js
{
  name: "add_task",
  description: "Add a task or reminder to the user's list.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "What the task is." },
      due:  { type: "string", description: "Optional natural language due time, e.g. 'tomorrow at 3pm'." },
    },
    required: ["text"],
  },
}

{
  name: "get_tasks",
  description: "List the user's current tasks. Filter by status if given.",
  input_schema: {
    type: "object",
    properties: {
      filter: {
        type: "string",
        enum: ["all", "today", "overdue", "open"],
        description: "Default 'open' (incomplete tasks).",
      },
    },
  },
}
```

---

## Capabilities

Implemented in `src/tools/tasks.js`:

| Function | Purpose |
|---|---|
| `addTask(text, due?)` | Create a task; parses `due` via `skill:date-parse` |
| `getTasks()` | All tasks |
| `completeTask(id)` | Mark `done: true` |
| `getOverdueTasks()` | Past due, `done: false` |
| `getTasksDueToday()` | Today's tasks |
| `deleteTask(id)` | Remove from list |

---

## Data Format (`data/tasks.json`)

```json
[
  {
    "id": "uuid-v4",
    "text": "Call the client about Q3 numbers",
    "due": "2026-05-03T10:00:00",
    "done": false,
    "created": "2026-05-02T08:00:00"
  }
]
```

- `id` from `crypto.randomUUID()`
- `due` is ISO 8601 or `null`
- File is read/written atomically via `skill:storage` (temp file + rename)

---

## Reminder Loop

Started from `electron/main.js` on app boot:

```js
import { startReminderLoop } from "./skills/notify.js";
startReminderLoop(30 * 60 * 1000); // every 30 min
```

The loop runs `getTasksDueToday()` and:
1. Fires a system notification (`node-notifier`) for tasks due within 1 hour
2. Triggers MJ to speak the reminder via `speaker.speak()`
3. Marks the task as "reminded" so it doesn't repeat

Each task gets at most **two** reminders: one at `due - 1 hour` and one at `due`.

---

## Dependencies (Skills)

- `skill:storage` — atomic JSON read/write
- `skill:date-parse` — parse "tomorrow at 3pm" → ISO 8601
- `skill:notify` — schedule + fire reminders

---

## Example Interactions

**User:** "Remind me to call mom tomorrow at 6pm."
**Orchestrator** → `add_task({ text: "Call mom", due: "tomorrow at 6pm" })` →
"Got it. I'll remind you to call mom tomorrow at six."

**User:** "What do I need to do today?"
**Orchestrator** → `get_tasks({ filter: "today" })` → "Three things today —
finish the deck, call mom at six, and review the PR from Anjali."

**User:** "What's overdue?"
**Orchestrator** → `get_tasks({ filter: "overdue" })` → "Two overdue — the
quarterly review from Monday, and submitting the expense report."

**User:** "Mark the deck task as done."
**Orchestrator** → `get_tasks` to find the ID → `completeTask(id)` → "Done."

---

## Error Handling

- Date parse fails → save task without `due`, confirm: `"Got it — saved 'X'
  but I couldn't parse the due time. Want to try again?"`
- File corrupt → restore from `data/tasks.json.bak` if exists, else start fresh
- Empty task text → return: `"What do you want me to remind you about?"`

---

## Hard Rules

- ❌ Never silently drop a task on parse failure — always save the text
- ❌ Never fire more than 2 reminders for the same task
- ✅ Always confirm task creation with the parsed due time spoken back
- ✅ Always group output by today / overdue / upcoming when listing
