# Code Agent

> Interfaces with the Claude Code CLI to build software on demand.
> Tool name: `build_software` — invoked by the Orchestrator.

---

## Role

The Code Agent is Gwen's hands. When the user says "build me X", "make me Y",
or "create a script for Z", the Orchestrator routes to this agent. The Code
Agent spawns the Claude Code CLI as a subprocess with a precise prompt,
streams its output back to the user via IPC, and announces completion.

It does **not** run the built code. It does **not** install dependencies.
It only writes files.

---

## System Prompt

Used when the Code Agent is invoked as a standalone Claude call to clarify
requirements before spawning Claude Code:

```
You are Gwen's software builder. When the user asks to build something, clarify:
(1) what to build, (2) where to save it (default: ~/Gwen-projects/).
Then spawn Claude Code with a precise prompt. Stream output back to the user.
Announce when done and what was created. Never auto-run the built software.
```

In practice, the Orchestrator usually has enough context to skip clarification
— the Code Agent's main job is to compose a strong prompt for Claude Code.

---

## Tool Definition (in `brain.js`)

```js
{
  name: "build_software",
  description: "Spawn Claude Code to build a piece of software based on a prompt.",
  input_schema: {
    type: "object",
    properties: {
      request: {
        type: "string",
        description: "Plain-English description of what to build.",
      },
      dir: {
        type: "string",
        description: "Directory to save files. Default ~/Gwen-projects/{slug}/.",
      },
      framework: {
        type: "string",
        description: "Optional framework hint (e.g. 'React + Vite', 'FastAPI').",
      },
    },
    required: ["request"],
  },
}
```

---

## Capabilities

Implemented in `src/tools/codegen.js`:

| Function | Purpose |
|---|---|
| `runClaudeCode(prompt, dir)` | Spawns `claude --print "{prompt}"` in `dir` |
| `streamOutput(child, ipcChannel)` | Pipes stdout to renderer via `gwen:code-output` |
| `summarizeBuild(dir)` | Lists files created, returns a tree string |

---

## Claude Code Prompt Template

```
{userRequest}

Requirements:
- Framework: {recalled preference or framework param or ask user}
- Save all files to: {dir}
- Create a README.md
- Do not install dependencies automatically
- Do not run any of the built code
- Use the simplest possible solution that satisfies the request
```

The `{recalled preference}` is fetched via `memoryTool.recall("preferred_framework")`
or `recall("preferred_language")` — fallback chain before asking the user.

---

## Spawn Flow

```js
import { spawn } from "node:child_process";
import { sendCodeOutput } from "../skills/ipc.js";

export async function runClaudeCode(prompt, dir) {
  await fs.mkdir(dir, { recursive: true });
  const child = spawn("claude", ["--print", prompt], {
    cwd: dir,
    env: { ...process.env, CLAUDE_NONINTERACTIVE: "1" },
  });
  child.stdout.on("data", (d) => sendCodeOutput(d.toString()));
  child.stderr.on("data", (d) => sendCodeOutput(`[err] ${d}`));
  await new Promise((res, rej) => {
    child.on("exit", (code) => code === 0 ? res() : rej(new Error(`exit ${code}`)));
  });
  return summarizeBuild(dir);
}
```

The renderer's transcript view subscribes to `gwen:code-output` and streams
the build log inline below the orb.

---

## Default Save Locations

- Default base: `~/Gwen-projects/`
- Slug from request: `"build me a CLI todo app"` → `~/Gwen-projects/cli-todo-app/`
- If the dir already exists with files, append a timestamp: `cli-todo-app-2026-05-02-1430/`

---

## Dependencies (Skills)

- `skill:ipc` — streams stdout to renderer
- (uses `child_process` directly — no skill needed)

---

## Example Interactions

**User:** "Build me a CLI todo app in Python."
**Orchestrator** → `build_software({ request: "CLI todo app", framework: "Python click" })`
→ "On it. Spawning Claude Code now — I'll let you know when it's done."
→ [streams build output to UI]
→ "Done. Created seven files in Gwen-projects, including a README and a
test file. Want me to walk through the structure?"

**User:** "Make me a tiny landing page for my side project, just HTML."
**Orchestrator** → `build_software({ request: "...", framework: "static HTML + CSS" })`
→ streams → "Done — single index.html with embedded styles, ready to open."

---

## Error Handling

- `claude` CLI not found → return: `"Claude Code isn't installed. Run
  `npm install -g @anthropic-ai/claude-code` first."`
- Spawn fails → return: `"I couldn't start Claude Code — check the logs."`
- Non-zero exit → still summarize whatever was created, mention exit code
- Empty output → return: `"Claude Code finished but didn't create any
  files — the prompt may have been too vague."`

---

## Hard Rules

- ❌ **Never run `npm install`** automatically — user must opt in
- ❌ **Never execute** the built code (no `node`, `python`, no `npm start`, etc.)
- ❌ Never spawn Claude Code without `cwd` set to the target dir
- ✅ Always create the target dir if it doesn't exist
- ✅ Always show a file tree on completion via `summarizeBuild()`
- ✅ Always confirm save location verbally before spawning if it's ambiguous
