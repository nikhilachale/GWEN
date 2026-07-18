// src/skills/tts.js — switchable TTS backends.
// Fish streams MP3 bytes directly into a streaming player (ffplay/mpv/sox), so
// audio starts within ~one chunk of Fish's first response byte. macOS uses the
// built-in `say` command for local speech without a TTS API key.
// Multiple speak() calls queue playback serially; Fish synthesis can overlap
// with earlier playback.
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { Readable } from "node:stream";
import playSoundFactory from "play-sound";
import path from "node:path";
import { PROJECT_ROOT } from "./projectRoot.js";

const player = playSoundFactory({});
const TMP_DIR = "/tmp";
const FISH_ENDPOINT = process.env.FISH_ENDPOINT || "https://api.fish.audio/v1/tts";
const FISH_LATENCY = process.env.FISH_LATENCY || "balanced";

const STREAM_PLAYER = detectStreamPlayer();

/**
 * Audio buffer pool for in-memory audio management.
 * Reduces I/O overhead by reusing buffers instead of writing temp files.
 */
class AudioBufferPool {
  private buffers: Map<string, { buffer: Buffer; refCount: number; lastUsed: number }> = new Map();
  private maxPoolSize: number = 10; // Max buffers to keep in memory
  private maxBufferSize: number = 5 * 1024 * 1024; // 5MB max per buffer
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up unused buffers every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  /**
   * Store a buffer in the pool with reference counting.
   */
  store(key: string, buffer: Buffer): void {
    if (buffer.length > this.maxBufferSize) {
      // Too large for pool, skip
      return;
    }

    const existing = this.buffers.get(key);
    if (existing) {
      existing.refCount++;
      existing.lastUsed = Date.now();
    } else {
      // Evict oldest if pool is full
      if (this.buffers.size >= this.maxPoolSize) {
        this.evictOldest();
      }
      this.buffers.set(key, { buffer, refCount: 1, lastUsed: Date.now() });
    }
  }

  /**
   * Retrieve a buffer from the pool.
   */
  get(key: string): Buffer | null {
    const entry = this.buffers.get(key);
    if (entry) {
      entry.refCount++;
      entry.lastUsed = Date.now();
      return entry.buffer;
    }
    return null;
  }

  /**
   * Release a reference to a buffer.
   */
  release(key: string): void {
    const entry = this.buffers.get(key);
    if (entry) {
      entry.refCount = Math.max(0, entry.refCount - 1);
    }
  }

  /**
   * Remove a specific buffer from the pool.
   */
  remove(key: string): void {
    this.buffers.delete(key);
  }

  /**
   * Clean up buffers that haven't been used recently.
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    for (const [key, entry] of this.buffers.entries()) {
      if (entry.refCount === 0 && (now - entry.lastUsed) > staleThreshold) {
        this.buffers.delete(key);
      }
    }
  }

  /**
   * Evict the oldest buffer from the pool.
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.buffers.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.buffers.delete(oldestKey);
    }
  }

  /**
   * Clean up and stop the cleanup interval.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buffers.clear();
  }
}

// Global buffer pool instance
const bufferPool = new AudioBufferPool();

function detectStreamPlayer() {
  const forced = process.env.GWEN_STREAM_PLAYER;
  const candidates = forced ? [forced] : ["ffplay", "mpv", "play", "mpg123"];
  for (const c of candidates) {
    try {
      execSync(`/usr/bin/which ${c}`, { stdio: "ignore" });
      console.log(`[tts] stream player: ${c}`);
      return c;
    } catch {}
  }
  console.log("[tts] no streaming player found — falling back to buffered playback");
  return null;
}

function streamArgs(p) {
  switch (p) {
    case "ffplay":
      return ["-nodisp", "-autoexit", "-loglevel", "quiet", "-fflags", "nobuffer", "-probesize", "32", "-analyzeduration", "0", "-"];
    case "mpv":
      return ["--no-terminal", "--no-video", "--cache=no", "-"];
    case "play":
      return ["-q", "-t", "mp3", "-"];
    case "mpg123":
      return ["-q", "-"];
    default:
      return null;
  }
}

let currentChild = null;
let playQueue: Promise<void> = Promise.resolve();
let counter = 0;
let fishDisabledReason = "";

// Check if text mode is enabled (no TTS)
function isTextMode(): boolean {
  try {
    const settingsPath = path.join(PROJECT_ROOT, "data/settings.json");
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      return settings.textMode === true;
    }
  } catch (err) {
    console.debug("[tts] could not read settings for textMode:", err);
  }
  return false; // Default to voice mode
}

class TtsProviderError extends Error {
  status;

  constructor(provider, status, message) {
    super(`${provider} ${status}: ${message}`);
    this.status = status;
  }
}

export async function speak(text) {
  return speakStream(text, () => {});
}

export async function speakStream(text, onLevel = (_level: number) => {}): Promise<void> {
  if (!text || !text.trim()) return;

  // Check text mode - if enabled, skip TTS entirely
  if (isTextMode()) {
    console.log("[tts] text mode enabled - skipping TTS");
    return;
  }

  const provider = pickProvider();
  if (provider === "macos") {
    const playPromise = playQueue.then(() => speakWithMacOSSay(text, onLevel));
    playQueue = playPromise.catch((err) => console.error("[tts] queue:", err.message));
    return playPromise;
  }

  if (provider === "fish" && !process.env.FISH_KEY) {
    console.error("[tts] Fish provider selected but FISH_KEY is not configured.");
    return;
  }

  const chunks = splitLongText(text, 500);

  if (provider === "fish" && STREAM_PLAYER) {
    // Open all Fish HTTP requests in parallel; pipe to player serially.
    const fishStreams = chunks.map((chunk) =>
      fishOpenStream(chunk).catch((err) => {
        handleFishFailure(err);
        return null;
      })
    );
    const playPromise = playQueue.then(async () => {
      for (let i = 0; i < chunks.length; i++) {
        const result = await fishStreams[i];
        if (!result) continue;
        if (isReadable(result)) {
          await pipeStreamToPlayer(result, onLevel);
        } else if (result.buffer) {
          // Try to play from buffer directly using player stdin
          await playFromBuffer(result.buffer, result.ext || "mp3", onLevel);
        }
      }
      onLevel(0);
    });
    playQueue = playPromise.catch((err) => console.error("[tts] queue:", err.message));
    return playPromise;
  }

  // Buffered Fish playback when no streaming player is available.
  const synths = chunks.map((c) => synthesize(c, provider));
  const playPromise = playQueue.then(async () => {
    for (let i = 0; i < chunks.length; i++) {
      const result = await synths[i];
      if (!result) continue;
      if (result.buffer) {
        // Try to play from buffer, fall back to temp file
        const bufferKey = `chunk_${counter}_${result.ext || "mp3"}`;
        const played = await playFromBuffer(result.buffer, result.ext || "mp3", onLevel);
        if (!played) {
          // Fallback to temp file
          const path = `${TMP_DIR}/mj_out_${counter++}.${result.ext || "mp3"}`;
          writeFileSync(path, result.buffer);
          await playFile(path);
          try { unlinkSync(path); } catch {}
        }
      }
    }
    onLevel(0);
  });
  playQueue = playPromise.catch((err) => console.error("[tts] queue:", err.message));
  return playPromise;
}

function pickProvider() {
  const forced = (process.env.GWEN_TTS_PROVIDER || "").toLowerCase();
  if (forced === "macos") return "macos";
  if (forced && forced !== "fish") {
    console.warn(`[tts] ignoring unknown GWEN_TTS_PROVIDER=${forced}; using fish.`);
  }
  return "fish";
}

function speakWithMacOSSay(text, onLevel): Promise<void> {
  return new Promise<void>((resolve) => {
    if (process.platform !== "darwin") {
      console.warn("[tts] macos provider is only available on macOS.");
      onLevel(0);
      resolve();
      return;
    }

    const args = [];
    if (process.env.GWEN_MACOS_VOICE) args.push("-v", process.env.GWEN_MACOS_VOICE);
    if (process.env.GWEN_MACOS_SAY_RATE) args.push("-r", process.env.GWEN_MACOS_SAY_RATE);
    args.push(text);

    const proc = spawn("/usr/bin/say", args, {
      stdio: ["ignore", "ignore", "ignore"],
    });
    currentChild = proc;
    let done = false;

    let tick = 0;
    const pulse = setInterval(() => {
      tick += 1;
      onLevel(0.28 + Math.sin(tick / 2) * 0.12);
    }, 120);
    const killChild = () => {
      if (proc.exitCode == null && !proc.killed) proc.kill("SIGTERM");
    };

    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(pulse);
      process.off("exit", killChild);
      if (currentChild === proc) currentChild = null;
      onLevel(0);
      resolve();
    };
    process.once("exit", killChild);

    proc.once("error", (err) => {
      console.warn("[tts] macos say failed:", err.message);
      finish();
    });
    proc.once("close", finish);
  });
}

function handleFishFailure(err) {
  if (err?.status === 401 || err?.status === 403) {
    if (!fishDisabledReason) {
      fishDisabledReason = `auth failed (${err.status})`;
      console.error(`[tts] fish disabled: ${fishDisabledReason}`);
    }
    return;
  }
  console.error("[tts] fish open failed:", err?.message || err);
}

async function fishOpenStream(text) {
  const res = await fetch(FISH_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FISH_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      reference_id: process.env.FISH_VOICE_ID || undefined,
      format: "mp3",
      mp3_bitrate: 128,
      chunk_length: 200,
      normalize: true,
      latency: FISH_LATENCY,
    }),
  });
  if (!res.ok || !res.body) {
    throw new TtsProviderError("fish", res.status, await res.text().catch(() => ""));
  }
  return Readable.fromWeb(res.body as any);
}

function isReadable(value) {
  return value && typeof value.pipe === "function" && typeof value.on === "function";
}

function pipeStreamToPlayer(nodeStream, onLevel): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!STREAM_PLAYER) {
      resolve();
      return;
    }
    const proc = spawn(STREAM_PLAYER, streamArgs(STREAM_PLAYER) || [], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    currentChild = proc;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      currentChild = null;
      resolve();
    };
    proc.on("error", (err) => {
      console.warn("[tts] player error:", err.message);
      finish();
    });
    proc.on("close", finish);

    nodeStream.on("data", (chunk) => onLevel(Math.min(1, chunk.length / 4096)));
    nodeStream.on("error", (err) => {
      console.warn("[tts] stream error:", err.message);
      try { proc.stdin.end(); } catch {}
    });
    proc.stdin.on("error", () => {});
    nodeStream.pipe(proc.stdin);
  });
}

async function synthesize(text, provider) {
  try {
    if (provider === "fish") return { buffer: await synthFish(text), ext: "mp3" };
    return null;
  } catch (err) {
    console.error(`[tts] ${provider} synth failed:`, err.message);
    return null;
  }
}

async function synthFish(text) {
  const stream = await fishOpenStream(text);
  const buffers = [];
  for await (const piece of stream) buffers.push(piece);
  return Buffer.concat(buffers);
}

function playFile(path): Promise<void> {
  return new Promise<void>((resolve) => {
    currentChild = player.play(path, (err) => {
      currentChild = null;
      if (err) console.warn("[tts] play err:", err.message);
      resolve();
    });
  });
}

/**
 * Play audio from a buffer without writing to disk.
 * Uses the buffer pool for caching and pipes to player if available.
 * @returns {Promise<boolean>} true if played from buffer, false if fallback needed
 */
async function playFromBuffer(buffer: Buffer, ext: string, onLevel: (level: number) => void): Promise<boolean> {
  // Check buffer pool first
  const bufferKey = `audio_${buffer.length}_${ext}`;
  const cached = bufferPool.get(bufferKey);
  const audioBuffer = cached || buffer;

  if (STREAM_PLAYER) {
    // Try to pipe directly to streaming player
    return new Promise<boolean>((resolve) => {
      const proc = spawn(STREAM_PLAYER, streamArgs(STREAM_PLAYER) || [], {
        stdio: ["pipe", "ignore", "ignore"],
      });

      currentChild = proc;
      let done = false;
      let hasStarted = false;

      const finish = (success: boolean) => {
        if (done) return;
        done = true;
        currentChild = null;
        resolve(success);
      };

      proc.on("error", (err) => {
        console.warn("[tts] buffer player error:", err.message);
        finish(false);
      });

      proc.on("close", () => finish(hasStarted));

      proc.stdin.on("error", () => {
        // Player stdin error - likely couldn't accept buffer
        finish(false);
      });

      // Write buffer to player stdin
      try {
        proc.stdin.write(audioBuffer, (err) => {
          if (err) {
            console.warn("[tts] buffer write error:", err.message);
            finish(false);
            return;
          }
          hasStarted = true;
          proc.stdin.end();
          // Simulate audio level for visualization
          onLevel(0.5);
          setTimeout(() => onLevel(0), 200);
        });
      } catch (err) {
        console.warn("[tts] buffer write failed:", err?.message || err);
        finish(false);
      }

      // Store in pool for future use
      if (!cached) {
        bufferPool.store(bufferKey, buffer);
      }
    });
  }

  // No streaming player available - fallback needed
  return false;
}

function splitLongText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).length > maxLen) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current = current ? current + " " + s : s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}
