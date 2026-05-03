// electron/main.js — main process, voice state machine, IPC hub
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === "development";

// ─── State ────────────────────────────────────────────────────────────
let mainWindow = null;
let currentState = "idle"; // 'idle' | 'listening' | 'thinking' | 'speaking'

// Lazy imports — only load when needed (avoids electron-rebuild errors at boot)
let listener, brain, speaker, screen, ipc, intent, notify;

async function loadCore() {
  const listenerMod = await import("../src/core/listener.js");
  const brainMod    = await import("../src/core/brain.js");
  const speakerMod  = await import("../src/core/speaker.js");
  const screenMod   = await import("../src/core/screen.js");
  const ipcMod      = await import("../src/skills/ipc.js");
  const intentMod   = await import("../src/skills/intent.js");
  const notifyMod   = await import("../src/skills/notify.js");
  listener = listenerMod;
  brain    = brainMod;
  speaker  = speakerMod;
  screen   = screenMod;
  ipc      = ipcMod;
  intent   = intentMod;
  notify   = notifyMod;
}

// ─── Window ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    backgroundColor: "#000000",
    transparent: false,
    frame: true,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Expose globally for skill:ipc to access
  global.mainWindow = mainWindow;

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
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

    const reply = await brain.runBrain(transcript, { intentHint });

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

// ─── App lifecycle ────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  await loadCore();

  // Manual trigger from renderer (clicking the orb / mic button)
  ipcMain.on("gwen:trigger", () => {
    runVoiceTurn();
  });

  // Get-state probe for renderer on mount
  ipcMain.handle("gwen:get-state", () => currentState);

  // Reminder loop
  notify.startReminderLoop();

  ipc.sendState("idle");

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

  const name = storedName || process.env.GWEN_USER_NAME || "Nikhil";
  const hour = new Date().getHours();
  const partOfDay =
    hour < 5 ? "late night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";

  const cityLine = storedCity
    ? `Their city is ${storedCity} — call get_weather with location="${storedCity}" and weave the conditions in casually (one short clause, not a forecast).`
    : `You don't know their city yet — skip weather, and at the end casually ask where they're based so you can remember it for next time.`;

  // If the previous session was resumed (a self-fix or quick restart within
  // the idle window), give a brief "back online" greeting instead of the full
  // briefing — the user is mid-conversation and doesn't need a fresh rundown.
  const briefingPrompt = brain.wasResumed()
    ? `You just came back from a self-fix restart. The user is ${name}. ` +
      `Greet them with a single short sentence acknowledging you're back — dry, ` +
      `confident, like nothing dramatic happened. No preamble, no briefing, no ` +
      `tools. One sentence only.`
    : `Welcome ${name} back. It is ${partOfDay} where they are. ` +
      `Open with a warm, familiar greeting — the kind a long-time assistant who knows them well would use. ` +
      `Use their name once, naturally, not formally. Vary the opener; don't say "Good ${partOfDay}" or anything stock. ` +
      `Sound like you've been with them a while — dry, witty, calm, but glad they're back. ` +
      `${cityLine} ` +
      `Then check their calendar for today, their tasks, and their Reminders. ` +
      `If something is pending, mention it the way a friend would — not a status readout — and ask what they want to tackle first. ` +
      `If nothing is pending, ask what they feel like doing today. ` +
      `Keep it to three or four short sentences. No "Here is your briefing" preambles, no list formatting — just speak.`;

  let briefing;
  try {
    // skipHistory: the synthetic startup turn shouldn't be recorded — but if
    // we just resumed, we still want the existing on-disk history preserved.
    briefing = await brain.runBrain(briefingPrompt, { skipHistory: true });
  } catch (err) {
    console.warn("[gwen] briefing failed:", err.message);
    briefing = `Back online, ${name}.`;
  }

  setState("speaking");
  ipc.sendTranscript("assistant", briefing);
  try {
    await speaker.speakStream(briefing, (level) => ipc.sendAudioLevel(level));
  } catch (err) {
    console.warn("[gwen] greeting failed:", err.message);
  }
  setState("idle");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
