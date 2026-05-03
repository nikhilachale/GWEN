// src/tools/email.js — Gmail (read-only)
import { google } from "googleapis";
import { getAuthClient, isTokenValid } from "../skills/oauth.js";

export async function run({ count = 5, from, query } = {}) {
  if (!isTokenValid()) {
    return "I don't have access to your inbox yet. Run `npm run setup-oauth` to connect Gmail.";
  }

  try {
    let q = "is:unread";
    if (from)  q += ` from:${from}`;
    if (query) q += ` ${query}`;

    const emails = await fetchByQuery(q, Math.min(count, 20));
    if (emails.length === 0) return "Inbox is empty — nothing unread.";
    return emails;
  } catch (err) {
    console.error("[email] fetch failed:", err.message);
    return "I can't reach Gmail right now.";
  }
}

async function fetchByQuery(q, max) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const list = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: max,
  });

  const ids = (list.data.messages || []).map((m) => m.id);

  const messages = await Promise.all(
    ids.map((id) =>
      gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      })
    )
  );

  return messages.map((m) => {
    const headers = m.data.payload?.headers || [];
    const get = (n) => headers.find((h) => h.name === n)?.value || "";
    return {
      from:    get("From"),
      subject: get("Subject"),
      date:    get("Date"),
      snippet: (m.data.snippet || "").slice(0, 150),
    };
  });
}

export async function getUnreadEmails(count = 5) {
  return fetchByQuery("is:unread", count);
}

export async function getEmailsFromSender(email) {
  return fetchByQuery(`from:${email}`, 5);
}

export async function searchEmails(query) {
  return fetchByQuery(query, 5);
}
