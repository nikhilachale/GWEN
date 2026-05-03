// src/skills/tts.js — TTS provider chain: Fish > ElevenLabs > macOS `say`.
// Fish path streams MP3 bytes directly into a streaming player (ffplay/mpv/sox)
// so audio starts within ~one chunk of Fish's first response byte.
// Multiple speak() calls open Fish HTTP requests in parallel, but pipe to the
// player serially via an internal queue — so synth overlaps with playback.
import { spawn, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import playSoundFactory from "play-sound";

const player = playSoundFactory({});
const TMP_DIR = "/tmp";
const VOICE = process.env.MJ_TTS_VOICE || "Daniel";
const RATE = process.env.MJ_TTS_RATE || "185";
const FISH_ENDPOINT = process.env.FISH_ENDPOINT || "https://api.fish.audio/v1/tts";
const FISH_LATENCY = process.env.FISH_LATENCY || "balanced";

const STREAM_PLAYER = detectStreamPlayer();

function detectStreamPlayer() {
  const forced = process.env.MJ_STREAM_PLAYER;
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

let _eleven = null;
async function getEleven() {
  if (_eleven) return _eleven;
  const { ElevenLabsClient } = await import("elevenlabs");
  _eleven = new ElevenLabsClient({ apiKey: process.env.ELEVEN_KEY });
  return _eleven;
}

let currentChild = null;
let playQueue = Promise.resolve();
let counter = 0;

export async function speak(text) {
  return speakStream(text, () => {});
}

export async function speakStream(text, onLevel = () => {}) {
  if (!text || !text.trim()) return;

  const provider = pickProvider();
  const chunks = splitLongText(text, 500);

  if (provider === "fish" && STREAM_PLAYER) {
    // Open all Fish HTTP requests in parallel; pipe to player serially.
    const fishStreams = chunks.map((chunk) =>
      fishOpenStream(chunk).catch((err) => {
        console.error("[tts] fish open failed:", err.message);
        return null;
      })
    );
    const playPromise = playQueue.then(async () => {
      for (let i = 0; i < chunks.length; i++) {
        const stream = await fishStreams[i];
        if (stream) await pipeStreamToPlayer(stream, onLevel);
      }
      onLevel(0);
    });
    playQueue = playPromise.catch((err) => console.error("[tts] queue:", err.message));
    return playPromise;
  }

  // Buffered fallback: Eleven, say, or no streaming player.
  const synths = chunks.map((c) => synthesize(c, provider));
  const playPromise = playQueue.then(async () => {
    for (let i = 0; i < chunks.length; i++) {
      const result = await synths[i];
      if (!result) continue;
      if (result.useSay) {
        await playSay(chunks[i], onLevel);
      } else if (result.buffer) {
        const path = `${TMP_DIR}/mj_out_${counter++}.mp3`;
        writeFileSync(path, result.buffer);
        await playFile(path);
      }
    }
    onLevel(0);
  });
  playQueue = playPromise.catch((err) => console.error("[tts] queue:", err.message));
  return playPromise;
}

function pickProvider() {
  const forced = (process.env.MJ_TTS_PROVIDER || "").toLowerCase();
  if (forced === "fish" || forced === "eleven" || forced === "say") return forced;
  if (process.env.FISH_KEY) return "fish";
  if (process.env.ELEVEN_KEY && process.env.ELEVEN_VOICE_ID) return "eleven";
  return "say";
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
    throw new Error(`fish ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return Readable.fromWeb(res.body);
}

function pipeStreamToPlayer(nodeStream, onLevel) {
  return new Promise((resolve) => {
    const proc = spawn(STREAM_PLAYER, streamArgs(STREAM_PLAYER), {
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
    if (provider === "fish") return { buffer: await synthFish(text) };
    if (provider === "eleven") return { buffer: await synthEleven(text) };
    return { useSay: true };
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

async function synthEleven(text) {
  const client = await getEleven();
  const audio = await client.textToSpeech.convert(process.env.ELEVEN_VOICE_ID, {
    text,
    model_id: "eleven_turbo_v2_5",
    output_format: "mp3_44100_128",
  });
  const buffers = [];
  for await (const piece of audio) buffers.push(piece);
  return Buffer.concat(buffers);
}

function playFile(path) {
  return new Promise((resolve) => {
    currentChild = player.play(path, (err) => {
      currentChild = null;
      if (err) console.warn("[tts] play err:", err.message);
      resolve();
    });
  });
}

function playSay(text, onLevel) {
  return new Promise((resolve) => {
    currentChild = spawn("say", ["-v", VOICE, "-r", String(RATE), text]);
    const pulse = setInterval(() => onLevel(0.4 + Math.random() * 0.4), 100);
    currentChild.on("error", (err) => {
      clearInterval(pulse);
      console.warn("[tts] `say` failed (is this macOS?):", err.message);
      currentChild = null;
      resolve();
    });
    currentChild.on("close", () => {
      clearInterval(pulse);
      currentChild = null;
      resolve();
    });
  });
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
