// src/skills/screenshot.js — capture screen as base64 PNG (no disk writes)
import screenshot from "screenshot-desktop";
import sharp from "sharp";

const MAX_W = 1920;
const MAX_H = 1080;

/**
 * Capture the primary display as base64 PNG.
 * @returns {Promise<string>}
 */
export async function captureScreen() {
  const raw = await screenshot({ format: "png" });
  let buf = raw;

  try {
    const meta = await sharp(raw).metadata();
    if ((meta.width || 0) > MAX_W || (meta.height || 0) > MAX_H) {
      buf = await sharp(raw)
        .resize(MAX_W, MAX_H, { fit: "inside" })
        .png()
        .toBuffer();
    }
  } catch (err) {
    console.warn("[screenshot] resize skipped:", err.message);
  }

  return buf.toString("base64");
}

/**
 * Capture a specific window (best-effort). Falls back to full screen.
 */
export async function captureWindow(_title) {
  // screenshot-desktop doesn't support window-by-title cross-platform.
  // Fallback to full screen for now.
  return captureScreen();
}

/**
 * Get the active app name. Lazy-loads active-win to keep bootstrap fast.
 */
export async function getActiveAppName() {
  try {
    const { default: activeWin } = await import("active-win");
    const win = await activeWin();
    return win?.owner?.name ?? "unknown";
  } catch {
    return "unknown";
  }
}
