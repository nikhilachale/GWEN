// src/core/screen.js — capture screen + describe with optional cloud vision
import Anthropic from "@anthropic-ai/sdk";
import { captureScreen, getActiveAppName } from "../skills/screenshot.js";

const MODEL = process.env.GWEN_VISION_MODEL || "claude-haiku-4-5-20251001";

const SCREEN_PROMPT = `You are Gwen's vision module. Given a screenshot, describe what the user is
currently working on in 1–2 sentences. Focus on: app name, content summary,
any errors or alerts visible. Be brief — this is context for the main brain,
not a full description for the user.`;

/**
 * Capture the screen and return a 1–2 sentence description.
 * @param {string} [focus] - Optional hint about what to look for.
 * @returns {Promise<string>}
 */
export async function getScreenContext(focus) {
  if (process.env.GWEN_DISABLE_SCREEN === "1") {
    return "Screen access is disabled in your config.";
  }
  const visionProvider = (process.env.GWEN_VISION_PROVIDER || "disabled").toLowerCase();
  const client =
    visionProvider === "anthropic" && process.env.ANTHROPIC_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
      : null;
  if (visionProvider !== "anthropic" || !client) {
    return "Screen understanding is disabled. Set GWEN_VISION_PROVIDER=anthropic and ANTHROPIC_KEY to enable it.";
  }

  try {
    const [base64, app] = await Promise.all([
      captureScreen(),
      getActiveAppName().catch(() => "unknown"),
    ]);

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SCREEN_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: base64 },
            },
            {
              type: "text",
              text: focus
                ? `Active app: ${app}. Focus on: ${focus}. Describe the screen.`
                : `Active app: ${app}. Describe the screen.`,
            },
          ],
        },
      ],
    });

    const text = message.content.find((b) => b.type === "text")?.text;
    return text || `You're in ${app}.`;
  } catch (err) {
    console.error("[screen] capture failed:", err);
    if (err.message?.includes("permission")) {
      return "I don't have screen recording permission — grant it in System Settings.";
    }
    return "I couldn't capture your screen right now.";
  }
}
