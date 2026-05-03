# Screen Agent

> Captures the screen and describes it as context for the Orchestrator.
> Tool name: `get_screen_context` — invoked by the Orchestrator.

---

## Role

The Screen Agent gives MJ vision. When the user asks "what am I looking at"
or "what's on my screen", the Orchestrator invokes this agent. It captures
the current screen as a base64 PNG, attaches it to a Claude API call as an
image block, and returns a 1–2 sentence description back to the
Orchestrator.

It is invoked **only** when the user explicitly asks about their screen.
Never proactively, never ambient.

---

## System Prompt

Used when the Screen Agent calls Claude with the screenshot:

```
You are MJ's vision module. Given a screenshot, describe what the user is
currently working on in 1–2 sentences. Focus on: app name, content summary,
any errors or alerts visible. Be brief — this is context for the main brain,
not a full description for the user.
```

The output is short and structured because the Orchestrator may use it as
context for a follow-up tool call (e.g. "explain this error" → screen
description → `search_web`).

---

## Tool Definition (in `brain.js`)

```js
{
  name: "get_screen_context",
  description: "Capture the current screen and describe what the user is doing.",
  input_schema: {
    type: "object",
    properties: {
      focus: {
        type: "string",
        description: "Optional hint: what to look for, e.g. 'errors', 'the chart'.",
      },
    },
  },
}
```

---

## Capabilities

Implemented in `src/core/screen.js`:

| Function | Purpose |
|---|---|
| `getScreenContext(focus?)` | Capture + describe via Claude vision |
| `captureRaw()` | Just the base64 PNG, no description |
| `getActiveAppName()` | OS-level active window title via `active-win` |

---

## Capture Flow

```js
import screenshot from "screenshot-desktop";
import activeWin from "active-win";

export async function getScreenContext(focus) {
  const [imgBuffer, win] = await Promise.all([
    screenshot({ format: "png" }),
    activeWin(),
  ]);
  const base64 = imgBuffer.toString("base64");
  // resize if larger than 1920x1080 — done via sharp before encoding

  const description = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    system: SCREEN_AGENT_PROMPT,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
        { type: "text", text: focus ? `Focus on: ${focus}` : "Describe the screen." },
      ],
    }],
  });

  return {
    activeApp: win?.owner?.name ?? "unknown",
    description: description.content[0].text,
    // base64 is intentionally NOT returned — discarded after this turn
  };
}
```

---

## Image Constraints

- Format: PNG (not JPEG — better for text/UI)
- Max resolution: 1920×1080. Anything larger is downscaled via `sharp`.
- Color depth: 8-bit RGB (no alpha)
- Returned as base64 string in the Claude image block — **never written to disk**

---

## Privacy & Security

This is the most sensitive agent. Strict rules:

- ❌ **Never save screenshots to disk** — `screenshot-desktop` returns a buffer; we encode in-memory and discard
- ❌ **Never include screenshots in memory, notes, or any persistent store**
- ❌ **Never trigger automatically** — only on explicit user request
- ❌ **Never include the base64 in the Orchestrator's response** — only the textual description
- ✅ Discard the buffer/base64 immediately after the Claude call
- ✅ The Claude API call for screen context is a separate sub-call from the main Orchestrator turn — the image never enters the main message history

The user can disable screen access entirely via `MJ_DISABLE_SCREEN=1` in
`.env`. If set, the agent returns: `"Screen access is disabled in your config."`

---

## Trigger Patterns

The Orchestrator invokes `get_screen_context` only when intent matches:
- "What am I looking at"
- "What's on my screen"
- "Help me with this" (when context is otherwise unclear)
- "Read this for me"
- "What's this error"

The `skill:intent` regex is roughly `/(my screen|looking at|on screen|this error|help.*this)/i`.

---

## Dependencies (Skills)

- `skill:screenshot` — `screenshot-desktop` + `active-win` wrapper

---

## Example Interactions

**User:** "What am I looking at?"
**Orchestrator** → `get_screen_context()` → "Looks like you're in VS Code,
editing `brain.js` — there's a syntax error highlighted on line 47."

**User:** "What's this error mean?"
**Orchestrator** → `get_screen_context({ focus: "errors" })` → "It's a
TypeScript error: `Property 'foo' does not exist on type 'Bar'`. You're
calling `.foo` on something that doesn't have that property."

**User:** "Help me debug this." (no other context)
**Orchestrator** → `get_screen_context({ focus: "code and any error messages" })`
→ then potentially chains into `search_web` for the error message.

---

## Error Handling

- `screenshot-desktop` throws (permission denied) → return: `"I don't have
  screen recording permission — grant it in System Settings."`
- macOS: requires Screen Recording permission for the Electron app
- Linux: requires X11 or `gnome-screenshot` / `import` from ImageMagick
- Windows: usually works out of the box
- Image too large → downscale via `sharp`, never fail

---

## Hard Rules

- ❌ Never auto-trigger — only on explicit user request
- ❌ Never persist screenshots anywhere
- ❌ Never return base64 to the Orchestrator — only the text description
- ✅ Always discard the buffer immediately after the vision call
- ✅ Respect `MJ_DISABLE_SCREEN=1` env override
