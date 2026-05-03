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
  console.log(`[mj] state → ${next}`);
}

global.getMjState = () => currentState; // exposed for notify skill

// ─── Voice turn ───────────────────────────────────────────────────────
async function runVoiceTurn() {
  if (currentState !== "idle") {
    console.log("[mj] ignoring trigger — already in", currentState);
    return;
  }

  try {
    setState("listening");
    const transcript = await listener.transcribeAudio(8000);

    if (!transcript) {
      console.log("[mj] silence — back to idle");
      setState("idle");
      return;
    }

    ipc.sendTranscript("user", transcript);
    setState("thinking");

    // Pre-routing hint (optional)
    const intentHint = intent.detectIntent(transcript);
    if (intentHint && intentHint.confidence >= 0.7) {
      console.log(`[mj] intent: ${intentHint.type} (${intentHint.confidence})`);
    }

    const reply = await brain.runBrain(transcript, { intentHint });

    ipc.sendTranscript("assistant", reply);
    setState("speaking");

    await speaker.speakStream(reply, (level) => ipc.sendAudioLevel(level));

    setState("idle");
  } catch (err) {
    console.error("[mj] voice turn failed:", err);
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
  ipcMain.on("mj:trigger", () => {
    runVoiceTurn();
  });

  // Get-state probe for renderer on mount
  ipcMain.handle("mj:get-state", () => currentState);

  // Reminder loop
  notify.startReminderLoop();

  ipc.sendState("idle");

  // Startup greeting
  const greeting = process.env.MJ_GREETING || "Hi Nikhil. MJ online.";
  setState("speaking");
  ipc.sendTranscript("assistant", greeting);
  try {
    await speaker.speakStream(greeting, (level) => ipc.sendAudioLevel(level));
  } catch (err) {
    console.warn("[mj] greeting failed:", err.message);
  }
  setState("idle");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
