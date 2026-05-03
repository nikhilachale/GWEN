# Search Agent

> Web search + result synthesis for voice output.
> Tool name: `search_web` — invoked by the Orchestrator via `tool_use`.

---

## Role

The Search Agent runs web queries via Tavily (with Brave Search as
fallback), strips noise, and synthesizes a 2–3 sentence spoken answer. It
never returns raw search-result objects to the Orchestrator — always a
clean summary or a list of cleaned results.

---

## System Prompt

Used when the Search Agent is invoked as a standalone Claude call to
synthesize results:

```
You are MJ's search module. Given web search results, synthesize a spoken
answer in 2–3 sentences. Cite sources only if asked. Prioritize recent results.
If results are irrelevant, say so and suggest a refined search.
```

---

## Tool Definition (in `brain.js`)

```js
{
  name: "search_web",
  description: "Search the web for current info or facts you're unsure of.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query in natural language.",
      },
      count: {
        type: "number",
        description: "Number of results to fetch. Default 5.",
      },
    },
    required: ["query"],
  },
}
```

---

## Capabilities

Implemented in `src/tools/search.js`:

| Function | Returns |
|---|---|
| `searchWeb(query, count)` | Top N results from Tavily |
| `fetchPage(url)` | Cleaned plaintext from a specific URL |

### Result format

```js
{
  title: string,
  url: string,
  snippet: string,       // ≤300 chars
  published: string|null,// ISO 8601 if available
  score: number,         // Tavily relevance score, 0–1
}
```

---

## API Strategy

1. **Primary:** Tavily (`TAVILY_KEY` env var) — returns clean, ranked, snippet-friendly results
2. **Fallback:** Brave Search API if Tavily returns an error or empty array
3. **Always returns an array** — empty `[]` on total failure, never throws

For deep reads (e.g. "summarize this article"), use `fetchPage(url)` which
runs the URL through `@mozilla/readability` + `jsdom` to extract clean
article text, stripping nav/ads/footer.

---

## Dependencies (Skills)

- `skill:search` — Tavily + Brave wrapper, page fetcher

---

## Example Interactions

**User:** "What time does the F1 race start tomorrow?"
**Orchestrator** → `search_web({ query: "F1 race time tomorrow Monaco" })` →
synthesizes → "The Monaco Grand Prix starts at 3 PM local time tomorrow,
which is 6:30 PM your time."

**User:** "What's the latest on the OpenAI lawsuit?"
**Orchestrator** → `search_web({ query: "OpenAI lawsuit latest news" })` →
"The case is still in discovery — the most recent ruling, last week, allowed
the plaintiffs to subpoena training data logs."

**User:** "How many people live in Bhopal?"
**Orchestrator** → may answer from training data without searching, since this is
relatively stable. If it does search → "Bhopal has a population of around
2.4 million as of the most recent census."

---

## When NOT to Search

The Orchestrator should skip `search_web` for:
- Stable historical facts ("when was Java released")
- Math, code, or pure reasoning
- Personal user data (use `recall`, `get_calendar`, etc. instead)

---

## Error Handling

- Tavily fails → fall back to Brave silently
- Both fail → return string: `"I couldn't reach the web right now."`
- Zero relevant results → return string: `"I didn't find anything useful for
  that — want me to try a different angle?"`

---

## Hard Rules

- ❌ Never read out URLs verbatim — paraphrase ("a Reuters article from yesterday")
- ❌ Never return raw result objects to voice — always synthesize
- ❌ Never include result snippets longer than 300 chars
- ✅ Prioritize results published in the last 30 days for time-sensitive queries
- ✅ Always return an array (possibly empty) — never throw
