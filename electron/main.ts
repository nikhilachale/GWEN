// electron/main.js — main process, voice state machine, IPC hub
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

for (const envPath of [
  join(process.cwd(), ".env"),
  join(__dirname, "../../.env"),
  join(__dirname, "../.env"),
]) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    console.log(`[env] loaded ${envPath}`);
    break;
  }
}

const isDev = process.env.NODE_ENV === "development";

// ─── State ────────────────────────────────────────────────────────────
let mainWindow = null;
let currentState = "idle"; // 'idle' | 'listening' | 'thinking' | 'speaking'

// Lazy imports — only load when needed (avoids electron-rebuild errors at boot)
let listener, brain, speaker, screen, ipc, intent, notify, proactive;

async function loadCore() {
  const settingsMod = await import("../src/skills/settings.js");
  await settingsMod.getSettings();
  const listenerMod  = await import("../src/core/listener.js");
  const brainMod     = await import("../src/core/brain.js");
  const speakerMod   = await import("../src/core/speaker.js");
  const screenMod    = await import("../src/core/screen.js");
  const ipcMod       = await import("../src/skills/ipc.js");
  const intentMod    = await import("../src/skills/intent.js");
  const notifyMod    = await import("../src/skills/notify.js");
  const proactiveMod = await import("../src/skills/proactive.js");
  listener  = listenerMod;
  brain     = brainMod;
  speaker   = speakerMod;
  screen    = screenMod;
  ipc       = ipcMod;
  intent    = intentMod;
  notify    = notifyMod;
  proactive = proactiveMod;
}

// ─── Window ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    backgroundColor: "#00000000",
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: true,
    fullscreen: true,
    autoHideMenuBar: true,
    roundedCorners: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Expose globally for skill:ipc to access
  global.mainWindow = mainWindow;

  if (isDev) {
    mainWindow.loadURL("http://localhost:5174");
  } else {
    mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    global.mainWindow = null;
  });

  // External links open in default browser, not in the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ─── State machine helpers ────────────────────────────────────────────
function setState(next) {
  if (currentState === next) return;
  currentState = next;
  ipc.sendState(next);
  console.log(`[gwen] state → ${next}`);
}

global.getGwenState = () => currentState; // exposed for notify skill

// ─── Voice turn ───────────────────────────────────────────────────────
async function runVoiceTurn() {
  if (currentState !== "idle") {
    console.log("[gwen] ignoring trigger — already in", currentState);
    return;
  }

  try {
    setState("listening");
    const transcript = await listener.transcribeAudio(15000);

    if (!transcript) {
      console.log("[gwen] silence — back to idle");
      setState("idle");
      return;
    }

    ipc.sendTranscript("user", transcript);
    setState("thinking");

    // Pre-routing hint (optional)
    const intentHint = intent.detectIntent(transcript);
    if (intentHint && intentHint.confidence >= 0.7) {
      console.log(`[gwen] intent: ${intentHint.type} (${intentHint.confidence})`);
    }

    const reply =
      (await brain.tryLocalFastPath(transcript, { intentHint })) ||
      (await brain.runBrain(transcript, { intentHint }));

    ipc.sendTranscript("assistant", reply);
    setState("speaking");

    await speaker.speakStream(reply, (level) => ipc.sendAudioLevel(level));

    setState("idle");
  } catch (err) {
    console.error("[gwen] voice turn failed:", err);
    try {
      await speaker.speak("Something went wrong on my end.");
    } catch {}
    setState("idle");
  }
}

async function runTextTurn(text) {
  const userText = typeof text === "string" ? text.trim() : "";
  if (!userText) return { ok: false, error: "empty" };
  if (currentState !== "idle") {
    console.log("[gwen] ignoring typed message — already in", currentState);
    return { ok: false, error: "busy" };
  }

  try {
    ipc.sendTranscript("user", userText);
    setState("thinking");

    const intentHint = intent.detectIntent(userText);
    if (intentHint && intentHint.confidence >= 0.7) {
      console.log(`[gwen] typed intent: ${intentHint.type} (${intentHint.confidence})`);
    }

    const reply =
      (await brain.tryLocalFastPath(userText, { intentHint })) ||
      (await brain.runBrain(userText, { intentHint }));

    ipc.sendTranscript("assistant", reply);
    setState("speaking");

    await speaker.speakStream(reply, (level) => ipc.sendAudioLevel(level));

    setState("idle");
    return { ok: true };
  } catch (err) {
    console.error("[gwen] typed turn failed:", err);
    try {
      await speaker.speak("Something went wrong on my end.");
    } catch {}
    setState("idle");
    return { ok: false, error: err.message || "failed" };
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  await loadCore();

  // Manual trigger from renderer (clicking the orb / mic button)
  ipcMain.on("gwen:trigger", () => {
    runVoiceTurn();
  });

  ipcMain.handle("gwen:send-text", async (_event, text) => {
    return runTextTurn(text);
  });

  // Get-state probe for renderer on mount
  ipcMain.handle("gwen:get-state", () => currentState);

  ipcMain.handle("gwen:get-settings", async () => {
    const settingsMod = await import("../src/skills/settings.js");
    return settingsMod.getSettings();
  });

  ipcMain.handle("gwen:update-settings", async (_event, patch) => {
    const settingsMod = await import("../src/skills/settings.js");
    return settingsMod.updateSettings(patch || {});
  });

  ipcMain.handle("gwen:get-health-snapshot", async () => {
    const healthMod = await import("../src/skills/health.js");
    return healthMod.getHealthSnapshot();
  });

  ipcMain.handle("gwen:get-conversations", (_event, query) => {
    return query ? brain.searchConversations(query) : brain.listConversations();
  });

  ipcMain.handle("gwen:get-current-conversation", () => brain.getCurrentConversation());

  ipcMain.handle("gwen:new-conversation", (_event, title) => {
    const conv = brain.newConversation(title);
    ipc.sendConversation(conv);
    return conv;
  });

  ipcMain.handle("gwen:switch-conversation", (_event, id) => {
    const conv = brain.switchConversation(id);
    ipc.sendConversation(conv);
    return conv;
  });

  ipcMain.handle("gwen:rename-conversation", (_event, id, title) => {
    const conv = brain.renameConversation(id, title);
    ipc.sendConversation(conv);
    return conv;
  });

  ipcMain.handle("gwen:pin-conversation", (_event, id, pinned) => {
    const conv = brain.pinConversation(id, pinned);
    ipc.sendConversation(conv);
    return conv;
  });

  ipcMain.handle("gwen:delete-conversation", (_event, id) => {
    const conv = brain.deleteConversation(id);
    ipc.sendConversation(conv);
    return conv;
  });

  ipcMain.handle("gwen:clear-current-conversation", () => {
    const conv = brain.clearCurrentConversation();
    ipc.sendConversation(conv);
    return conv;
  });

  // Initial-load probes for the left panel (tasks + fixes)
  ipcMain.handle("gwen:get-tasks", async () => {
    try {
      const tasksMod = await import("../src/tools/tasks.js");
      return (tasksMod.getAll() || []).filter((t) => !t.done);
    } catch (err) {
      console.warn("[gwen] get-tasks failed:", err.message);
      return [];
    }
  });

  ipcMain.handle("gwen:get-fixes", async () => {
    try {
      const sqlite = await import("../src/skills/sqlite.js");
      const featureRows = sqlite.listByCategory("feature_request") as Array<{
        key: string;
        value: string;
      }>;
      const fixesRows = sqlite.listByCategory("fixes") as Array<{
        key: string;
        value: string;
      }>;
      const items: Array<{ id: string; text: string; source: string }> = [];

      for (const r of featureRows) {
        items.push({ id: `feat:${r.key}`, text: r.value, source: "feature_request" });
      }
      // pending_fixes_list is one row with a numbered list inside it — split.
      for (const r of fixesRows) {
        if (r.key === "pending_fixes_list") {
          const parts = r.value
            .split(/\s*\d+\.\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
          for (let i = 0; i < parts.length; i++) {
            items.push({ id: `fix:${i}`, text: parts[i], source: "fixes" });
          }
        } else {
          items.push({ id: `fix:${r.key}`, text: r.value, source: "fixes" });
        }
      }
      return items;
    } catch (err) {
      console.warn("[gwen] get-fixes failed:", err.message);
      return [];
    }
  });

  ipcMain.handle("gwen:get-home-dashboard", async () => {
    try {
      const dashboardMod = await import("../src/skills/dashboard.js");
      return dashboardMod.getHomeDashboard({
        state: currentState,
        conversations: brain.listConversations(),
      });
    } catch (err) {
      console.warn("[gwen] get-home-dashboard failed:", err.message);
      return null;
    }
  });

  // Reminder loop
  notify.startReminderLoop();

  // Proactive loop — morning brief, calendar nudges, optional stale-task pings
  proactive.startProactiveLoop();

  ipc.sendState("idle");

  if (process.env.GWEN_STARTUP_BRIEFING !== "1") {
    setState("idle");
    return;
  }

  // Startup briefing — Gwen composes it herself using her tools.
  setState("thinking");

  // Recall the user's name and city so the greeting is personal and the
  // weather is for the right place (wttr.in's IP geolocation is unreliable).
  let storedName = null;
  let storedCity = null;
  try {
    const memoryMod = await import("../src/tools/memory.js");
    const [n, c] = await Promise.all([
      memoryMod.recall({ key: "user_name" }),
      memoryMod.recall({ key: "user_city" }),
    ]);
    if (typeof n === "string" && !n.startsWith("I don't")) storedName = n;
    if (typeof c === "string" && !c.startsWith("I don't")) storedCity = c;
  } catch (err) {
    console.warn("[gwen] memory recall failed:", err.message);
  }

  const name = storedName || process.env.GWEN_USER_NAME || "Miles";
  const hour = new Date().getHours();
  const partOfDay =
    hour < 5 ? "late night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";

  // Pre-fetch weather here (in parallel with the rest of the briefing setup)
  // so the briefing model call has it as data and doesn't need to invoke
  // get_weather itself. Eliminates a tool round-trip on every fresh start.
  let weatherSummary = null;
  if (storedCity && !brain.wasResumed()) {
    try {
      const weatherMod = await import("../src/tools/weather.js");
      const result = await weatherMod.getWeather({ location: storedCity });
      if (typeof result === "string" && result.trim() && !/couldn't get weather/i.test(result)) {
        weatherSummary = result.trim();
      }
    } catch (err) {
      console.warn("[gwen] weather pre-fetch failed:", err.message);
    }
  }

  const weatherLine = weatherSummary
    ? `Current conditions where they are: ${weatherSummary}. Use ONLY the temperature and overall feel to colour your greeting (e.g. "warm one out there", "bit of a chill", "still cool out"). One short clause max — not a forecast. NEVER say the city, town, region, or any place name aloud.`
    : `Skip weather entirely — no data available.`;

  // On resume, pull the most recent self-build entry so Gwen can mention the
  // specific fix she just applied — but only if it's fresh (within the same
  // 5-min window the conversation history uses), otherwise it's an old entry
  // unrelated to this restart.
  let lastFixLine = "";
  if (brain.wasResumed()) {
    try {
      const { getLatestSelfBuild } = await import("../src/skills/buildLog.js");
      const entry = await getLatestSelfBuild();
      if (entry && entry.tsMs && Date.now() - entry.tsMs < 5 * 60_000) {
        const resultPart = entry.result && entry.result !== "ok" ? ` (result: ${entry.result})` : "";
        const notesPart = entry.notes ? ` Notes: ${entry.notes}.` : "";
        lastFixLine =
          `The fix you just applied: "${entry.action || "unspecified"}"${resultPart}.${notesPart} ` +
          `Reference this specifically in your callback — paraphrase, don't quote the action verbatim.`;
      }
    } catch (err) {
      console.warn("[gwen] self-build lookup failed:", err.message);
    }
  }

  // If the previous session was resumed (a self-fix or quick restart within
  // the idle window), give a brief "back online" greeting instead of the full
  // briefing — the user is mid-conversation and doesn't need a fresh rundown.
  const briefingPrompt = brain.wasResumed()
    ? `You just came back from a self-fix restart. The user is ${name}. ` +
      `The conversation history above this message is real — that is what ` +
      `the two of you were just doing before you went down. Read the last ` +
      `few exchanges and pick up the thread naturally. ` +
      `${lastFixLine} ` +
      `Greet them in ONE OR TWO short sentences: identify yourself as Gwen ` +
      `(e.g. "Gwen, back online" / "Gwen here"), then a brief callback to ` +
      `what you were just on — paraphrase, don't quote — and offer to ` +
      `continue or confirm the fix landed right. Dry, confident, like nothing ` +
      `dramatic happened. No preamble, no full briefing, no tools. If somehow ` +
      `there is no prior context to reference, fall back to a single "back ` +
      `online" sentence. Two sentences max.`
    : `Welcome ${name} back. It is ${partOfDay} where they are. ` +
      `Open with a warm, familiar greeting — the kind a long-time assistant who knows them well would use. ` +
      `You MUST identify yourself as Gwen in the opening — make it natural, woven in (e.g. "Gwen here", "It's Gwen") — never a robotic announcement. ` +
      `Use their name once, naturally, not formally. Vary the opener; don't say "Good ${partOfDay}" or anything stock — let the time of day and the temperature shape it however feels right to you. ` +
      `Sound like you've been with them a while — dry, witty, calm, but glad they're back. ` +
      `${weatherLine} ` +
      `Do NOT mention any city, town, neighbourhood, or place name. Ever. ` +
      `Do NOT call any other tools — no calendar, no tasks, no reminders, no notes. They will ask if they want a rundown. ` +
      `Keep it to ONE OR TWO short sentences total. End by inviting them to ask what's on today, casually — one short clause, like "want the rundown?" or "anything you want to dig into?". No "Here is your briefing" preambles, no list formatting — just speak.`;

  // Stream the briefing: speak each sentence as soon as the model finishes
  // writing it, so the user hears the opener within ~1–2 sec instead of
  // waiting for the full response. The TTS layer queues sentences serially
  // for playback while their HTTP synth runs in parallel.
  let briefing = "";
  let firstSentenceSpoken = false;
  const speakPromises = [];

  try {
    briefing = await brain.runBrainStream(
      briefingPrompt,
      (sentence) => {
        if (!firstSentenceSpoken) {
          setState("speaking");
          firstSentenceSpoken = true;
        }
        speakPromises.push(
          speaker
            .speakStream(sentence, (level) => ipc.sendAudioLevel(level))
            .catch((err) => console.warn("[gwen] sentence speak failed:", err.message))
        );
      },
      { skipHistory: true, noTools: true, skipAmbient: true }
    );
  } catch (err) {
    console.warn("[gwen] briefing failed:", err.message);
    briefing = `Back online, ${name}.`;
    if (!firstSentenceSpoken) {
      setState("speaking");
      speakPromises.push(
        speaker
          .speakStream(briefing, (level) => ipc.sendAudioLevel(level))
          .catch((e) => console.warn("[gwen] fallback speak failed:", e.message))
      );
    }
  }

  ipc.sendTranscript("assistant", briefing);

  // Wait for all queued sentences to finish playing before flipping idle.
  await Promise.all(speakPromises);
  setState("idle");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
