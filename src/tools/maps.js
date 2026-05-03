// src/tools/maps.js — open Apple Maps with directions or a search.
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

const MODE_FLAG = { driving: "d", walking: "w", transit: "r" };

/**
 * Open Maps with directions to a destination.
 * @param {{ to: string, from?: string, mode?: "driving"|"walking"|"transit" }} args
 */
export async function directions({ to, from, mode = "driving" } = {}) {
  if (!to) return "Tell me a destination.";
  const dirflg = MODE_FLAG[mode] || "d";
  const params = new URLSearchParams();
  params.set("daddr", to);
  if (from) params.set("saddr", from);
  params.set("dirflg", dirflg);
  const url = `maps://?${params.toString()}`;
  try {
    await execP(`open ${shellEscape(url)}`);
    return `Directions to ${to}${from ? ` from ${from}` : ""} opened in Maps.`;
  } catch (err) {
    return `Couldn't open Maps: ${err.message}`;
  }
}

/**
 * Search a place in Maps.
 * @param {{ query: string }} args
 */
export async function search({ query } = {}) {
  if (!query) return "Tell me what to search for.";
  const url = `maps://?q=${encodeURIComponent(query)}`;
  try {
    await execP(`open ${shellEscape(url)}`);
    return `Searching Maps for ${query}.`;
  } catch (err) {
    return `Couldn't open Maps: ${err.message}`;
  }
}

function shellEscape(s) { return `'${String(s).replace(/'/g, "'\\''")}'`; }
