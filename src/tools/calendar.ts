// src/tools/calendar.js — macOS Calendar.app (read-only, via JXA)
// Pulls events from every local Calendar.app account (iCloud, Google, Exchange,
// etc.) so we don't need a separate OAuth flow. First run triggers a TCC prompt.
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

/**
 * Tool entry point. Called by brain.js handler map.
 * @param {{ days?: number, query?: string }} args
 */
export async function run({ days = 1, query } = {}) {
  try {
    const events = await getCalendarEvents(days);
    const filtered = query
      ? events.filter((e) => (e.title || "").toLowerCase().includes(query.toLowerCase()))
      : events;

    if (filtered.length === 0) return "Your calendar is clear.";
    return filtered;
  } catch (err) {
    // Node's `exec` puts "Command failed: <cmd>" in err.message and the
    // actual osascript output in err.stderr — log both so TCC/permission
    // errors are visible.
    const stderr = (err.stderr || "").toString();
    console.error("[calendar] fetch failed:", err.message, stderr ? `\nstderr: ${stderr}` : "");
    const haystack = `${err.message} ${stderr}`;
    if (/not authorized|-1743|access|permission|user canceled/i.test(haystack)) {
      return "I need Calendar access. Grant it in System Settings → Privacy & Security → Automation, then enable Calendar for this app.";
    }
    return "I can't reach Calendar right now.";
  }
}

export async function getCalendarEvents(days = 1) {
  const script = buildJxa(days);
  const { stdout } = await execP(`osascript -l JavaScript -e ${shellEscape(script)}`, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 20_000,
  });
  const raw = stdout.trim();
  if (!raw) return [];
  const events = JSON.parse(raw);
  events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return events;
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
  const q = String(query || "").toLowerCase();
  return events.filter((e) => (e.title || "").toLowerCase().includes(q));
}

// ─── helpers ─────────────────────────────────────────────────────────

function buildJxa(days) {
  return `
    const Calendar = Application('Calendar');
    const now = new Date();
    const end = new Date(now.getTime() + ${Number(days)} * 86400000);
    const out = [];
    const cals = Calendar.calendars();
    for (let i = 0; i < cals.length; i++) {
      const cal = cals[i];
      let events;
      try {
        events = cal.events.whose({
          _and: [
            { startDate: { _greaterThan: now } },
            { startDate: { _lessThan: end } }
          ]
        })();
      } catch (e) { continue; }
      for (let j = 0; j < events.length; j++) {
        const ev = events[j];
        try {
          out.push({
            title: ev.summary() || '(no title)',
            start: ev.startDate().toISOString(),
            end:   ev.endDate().toISOString(),
            location: ev.location() || '',
            description: (ev.description() || '').slice(0, 200),
            calendar: cal.name(),
          });
        } catch (e) {}
      }
    }
    JSON.stringify(out);
  `;
}

function shellEscape(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}
