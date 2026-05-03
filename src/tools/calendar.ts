// src/tools/calendar.js — Google Calendar (read-only)
import { google } from "googleapis";
import { getAuthClient, isTokenValid } from "../skills/oauth.js";

/**
 * Tool entry point. Called by brain.js handler map.
 */
export async function run({ days = 1, query } = {}) {
  if (!isTokenValid()) {
    return "I don't have access to your calendar yet. Run `npm run setup-oauth` to connect it.";
  }

  try {
    const events = await getCalendarEvents(days);
    const filtered = query
      ? events.filter((e) => (e.title || "").toLowerCase().includes(query.toLowerCase()))
      : events;

    if (filtered.length === 0) return "Your calendar is clear.";
    return filtered;
  } catch (err) {
    console.error("[calendar] fetch failed:", err.message);
    return "I can't reach Google Calendar right now.";
  }
}

export async function getCalendarEvents(days = 1) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return (res.data.items || []).map((e) => ({
    title: e.summary || "(no title)",
    start: e.start?.dateTime || e.start?.date,
    end:   e.end?.dateTime   || e.end?.date,
    location: e.location || "",
    description: (e.description || "").slice(0, 200),
  }));
}

export async function getEventsToday() {
  return getCalendarEvents(1);
}

export async function getNextEvent() {
  const events = await getCalendarEvents(7);
  return events[0] || null;
}

export async function searchEvents(query) {
  const events = await getCalendarEvents(14);
  const q = query.toLowerCase();
  return events.filter((e) => (e.title || "").toLowerCase().includes(q));
}
