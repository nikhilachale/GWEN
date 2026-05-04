import test from "node:test";
import assert from "node:assert/strict";

import { formatForVoice, isFuture, isToday, isTomorrow, parseDate, relativeTo } from "../src/skills/dateParse.js";

test("parseDate rejects missing or non-string input", () => {
  assert.equal(parseDate(""), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate(undefined), null);
});

test("formatForVoice returns an empty string for invalid dates", () => {
  assert.equal(formatForVoice(""), "");
  assert.equal(formatForVoice("not-a-date"), "");
});

test("parseDate returns an ISO string for recognizable date text", () => {
  const iso = parseDate("January 1 2030 at 9 AM");

  assert.equal(typeof iso, "string");
  assert.equal(Number.isNaN(new Date(iso as string).getTime()), false);
});

test("formatForVoice describes nearby times relatively", () => {
  assert.equal(formatForVoice(new Date(Date.now() + 30 * 60_000).toISOString()), "in 30 minutes");
  assert.equal(formatForVoice(new Date(Date.now() - 30 * 60_000).toISOString()), "30 minutes ago");
});

test("isToday and isTomorrow identify relative calendar days", () => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  assert.equal(isToday(now.toISOString()), true);
  assert.equal(isTomorrow(tomorrow.toISOString()), true);
});

test("isFuture compares dates against the current time", () => {
  assert.equal(isFuture(new Date(Date.now() + 60_000).toISOString()), true);
  assert.equal(isFuture(new Date(Date.now() - 60_000).toISOString()), false);
});

test("formatForVoice uses calendar labels for later dates", () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
  tomorrow.setHours(9, 0, 0, 0);

  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60_000);
  inThreeDays.setHours(14, 30, 0, 0);

  const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  farFuture.setHours(8, 15, 0, 0);

  assert.equal(formatForVoice(tomorrow.toISOString()), "tomorrow at 9 AM");
  assert.match(formatForVoice(inThreeDays.toISOString()), /^[A-Za-z]+ at 2:30 PM$/);
  assert.match(formatForVoice(farFuture.toISOString()), /^[A-Za-z]+ \d{1,2} at 8:15 AM$/);
});

test("relativeTo delegates to voice-friendly formatting", () => {
  assert.equal(relativeTo(new Date(Date.now() + 30 * 60_000).toISOString()), "in 30 minutes");
});
