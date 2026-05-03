# Email Agent

> Read-only Gmail access. Never sends, never modifies, never deletes.
> Tool name: `get_emails` — invoked by the Orchestrator via `tool_use`.

---

## Role

The Email Agent reads the user's Gmail inbox and summarizes unread or
filtered messages for voice output. It is **read-only by design** — there
is no `sendEmail`, no `markRead`, no `archive`, no `trash`. Ever.

---

## System Prompt

Used when the Email Agent is invoked as a standalone Claude call:

```
You are Gwen's email module. Read unread emails and summarize them for voice.
For each email: say who it's from, the subject, and a one-sentence summary.
Never read out full email bodies. Never suggest replying. This is read-only.
If there are more than 5 unread, summarize the count and highlight the most
important ones.
```

---

## Tool Definition (in `brain.js`)

```js
{
  name: "get_emails",
  description: "Get unread Gmail messages. Read-only — cannot send or modify.",
  input_schema: {
    type: "object",
    properties: {
      count: {
        type: "number",
        description: "Max number of unread emails to fetch. Default 5, max 20.",
      },
      from: {
        type: "string",
        description: "Optional sender filter (email address or name).",
      },
      query: {
        type: "string",
        description: "Optional Gmail search query (e.g. 'from:boss has:attachment').",
      },
    },
  },
}
```

---

## Capabilities

Implemented in `src/tools/email.js`:

| Function | Returns |
|---|---|
| `getUnreadEmails(count)` | N most recent unread |
| `getEmailsFromSender(email)` | Filter by sender |
| `searchEmails(query)` | Raw Gmail search syntax |

### Email summary format

```js
{
  from: string,      // "Priya Sharma <priya@acme.com>"
  subject: string,
  date: string,      // ISO 8601
  snippet: string,   // first 150 chars of body, plaintext only
}
```

Full email bodies are **never** returned. Snippets are capped at 150 chars
and stripped of HTML.

---

## OAuth Scopes

```
https://www.googleapis.com/auth/gmail.readonly
```

That's the **only** scope this agent requests. Hard rules below enforce
this — never request `gmail.modify`, `gmail.compose`, `gmail.send`, or
`gmail.labels`.

---

## Dependencies (Skills)

- `skill:oauth` — Google OAuth2 client + auto-refresh

---

## Example Interactions

**User:** "Any new emails?"
**Orchestrator** → `get_emails({ count: 5 })` → "Three unread. One from Priya
about the launch deck, one from your bank, and a calendar invite from Rohan
for Thursday."

**User:** "Anything from my boss today?"
**Orchestrator** → `get_emails({ from: "boss@acme.com" })` → "One unread from
your boss — subject is 'Q3 numbers', sent about an hour ago."

**User:** "Check for invoices."
**Orchestrator** → `get_emails({ query: "invoice has:attachment" })` → "Two
invoices in the last week — one from AWS, one from Figma."

---

## Error Handling

- OAuth token missing → return: `"I don't have access to your inbox yet. Run
  the setup script to connect Gmail."`
- Network failure → return: `"I can't reach Gmail right now."`
- Zero unread → return: `"Inbox is empty — nothing unread."`

---

## Hard Rules

- ❌ **Never request write scopes** (`gmail.modify`, `gmail.compose`, `gmail.send`)
- ❌ **Never store full email bodies** in SQLite, JSON, or anywhere else
- ❌ **Never suggest replying** — that's outside this agent's contract
- ❌ **Never read out full bodies** — snippet only
- ✅ Only persisted fields: `from`, `subject`, `date`, `snippet` (≤150 chars)
- ✅ If a sensitive sender is detected (e.g. bank, 2FA codes), say so generically:
     "There's an email from your bank — I won't read out the contents."
