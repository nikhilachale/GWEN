// src/skills/dateParse.js — natural-language date parsing
import * as chrono from "chrono-node";

/**
 * Parse a natural language date expression to ISO 8601.
 * @param {string} input
 * @returns {string|null}
 */
export function parseDate(input) {
  if (!input || typeof input !== "string") return null;
  const result = chrono.parseDate(input);
  if (!result || isNaN(result.getTime())) return null;
  return result.toISOString();
}

/**
 * Format an ISO date as voice-friendly text.
 * @param {string} isoDate
 * @returns {string}
 */
export function formatForVoice(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const diffHr = Math.round(diffMs / 3600000);

  // Within next/past 90 minutes — relative
  if (Math.abs(diffMin) < 90) {
    if (diffMin === 0) return "now";
    if (diffMin > 0) return diffMin < 60 ? `in ${diffMin} minutes` : "in about an hour";
    return diffMin > -60 ? `${-diffMin} minutes ago` : "about an hour ago";
  }

  const sameDay = isToday(isoDate);
  const tomorrow = isTomorrow(isoDate);
  const time = formatTime(d);

  if (sameDay) return `at ${time}`;
  if (tomorrow) return `tomorrow at ${time}`;

  // This week
  const daysAhead = Math.floor(diffMs / 86400000);
  if (daysAhead >= 0 && daysAhead < 7) {
    return `${formatDay(d)} at ${time}`;
  }

  // Beyond — full date
  return `${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })} at ${time}`;
}

export function isToday(isoDate) {
  const d = new Date(isoDate);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function isTomorrow(isoDate) {
  const d = new Date(isoDate);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.toDateString() === t.toDateString();
}

export function isFuture(isoDate) {
  return new Date(isoDate).getTime() > Date.now();
}

export function relativeTo(isoDate, from = new Date()) {
  return formatForVoice(isoDate);
}

function formatTime(d) {
  let hr = d.getHours();
  const min = d.getMinutes();
  const ampm = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return min === 0 ? `${hr} ${ampm}` : `${hr}:${String(min).padStart(2, "0")} ${ampm}`;
}

function formatDay(d) {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}
