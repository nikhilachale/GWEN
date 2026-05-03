// src/tools/calls.js — FaceTime video/audio + Phone (via iPhone Continuity).
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

/**
 * Place a FaceTime call (video or audio).
 * @param {{ contact: string, audio?: boolean }} args
 *   contact = phone number (+15551234567), email, or Apple ID
 */
export async function facetime({ contact, audio = false } = {}) {
  if (!contact) return "Tell me who to call.";
  const scheme = audio ? "facetime-audio" : "facetime";
  const url = `${scheme}://${encodeURIComponent(contact)}`;
  try {
    await execP(`open ${shellEscape(url)}`);
    return `${audio ? "FaceTime audio" : "FaceTime"} call to ${contact}.`;
  } catch (err) {
    return `Couldn't start FaceTime: ${err.message}`;
  }
}

/**
 * Place a phone call via iPhone Continuity. Requires a paired iPhone signed
 * into the same Apple ID with Calls on Other Devices enabled.
 * @param {{ number: string }} args
 */
export async function phone({ number } = {}) {
  if (!number) return "Tell me the number.";
  const url = `tel://${encodeURIComponent(number)}`;
  try {
    await execP(`open ${shellEscape(url)}`);
    return `Calling ${number}.`;
  } catch (err) {
    return `Couldn't place call: ${err.message}`;
  }
}

function shellEscape(s) { return `'${String(s).replace(/'/g, "'\\''")}'`; }
