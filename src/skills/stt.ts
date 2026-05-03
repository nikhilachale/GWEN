// src/skills/stt.js — local Whisper STT via whisper.cpp (nodejs-whisper)
// Falls back to OpenAI Whisper API only if OPENAI_KEY is set.
import recorder from "node-record-lpcm16";
import fs from "node:fs";
import { createWriteStream } from "node:fs";
import { execSync } from "node:child_process";

const TMP_PATH = "/tmp/mj_input.wav";
const SILENCE_THRESHOLD_MS = 1200;
const SAMPLE_RATE = 16000;
const MODEL_NAME = process.env.MJ_WHISPER_MODEL || "base.en";
const GROQ_MODEL = process.env.MJ_GROQ_STT_MODEL || "whisper-large-v3-turbo";

// Vocabulary biasing — names, apps, and terms MJ should recognize correctly.
// Override with MJ_STT_PROMPT in .env.
const STT_PROMPT =
  process.env.MJ_STT_PROMPT ||
  "Gwen, Nikhil, Achale, WhatsApp, iMessage, FaceTime, " +
  "Spotify, Tavily, Anthropic, Claude, IPL, Mumbai, Bangalore, Chennai.";

// nodejs-whisper uses shelljs, which needs a real Node binary.
// Inside Electron, process.execPath is the Electron binary, so shelljs fails.
// Resolve the system Node once and tell shelljs to use it.
let _shellPatched = false;
async function patchShellExecPath() {
  if (_shellPatched) return;
  try {
    const nodePath =
      process.env.MJ_NODE_PATH ||
      tryWhich("node") ||
      tryPath("/opt/homebrew/bin/node") ||
      tryPath("/usr/local/bin/node") ||
      tryPath("/usr/bin/node");
    if (nodePath) {
      const shell = (await import("shelljs")).default;
      shell.config.execPath = nodePath;
    }
  } catch (err) {
    console.warn("[stt] could not patch shelljs execPath:", err.message);
  }
  _shellPatched = true;
}

function tryWhich(bin) {
  try {
    return execSync(`/usr/bin/which ${bin}`, { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}
function tryPath(p) {
  return fs.existsSync(p) ? p : null;
}

let _nodeWhisper = null;
async function getLocalWhisper() {
  if (_nodeWhisper) return _nodeWhisper;
  await patchShellExecPath();
  const mod = await import("nodejs-whisper");
  _nodeWhisper = mod.nodewhisper;
  return _nodeWhisper;
}

let _openai = null;
async function getOpenAI() {
  if (_openai) return _openai;
  const { default: OpenAI } = await import("openai");
  _openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
  return _openai;
}

/**
 * Record from the default mic and transcribe.
 * @param {number} [maxMs=8000]
 * @returns {Promise<string>} transcript or "" if silence
 */
export async function transcribeAudio(maxMs = 8000) {
  try {
    await recordAudio(TMP_PATH, maxMs);
  } catch (err) {
    console.error("[stt] recording failed:", err.message);
    return "";
  }

  try {
    const stat = fs.statSync(TMP_PATH);
    if (stat.size < 1000) {
      cleanup();
      return "";
    }
  } catch {
    return "";
  }

  const text = await transcribeFile(TMP_PATH);
  cleanup();
  return text.length >= 2 ? text : "";
}

/**
 * Transcribe an existing audio file.
 * Provider chain: Groq (Whisper-large-v3-turbo) > OpenAI Whisper > local nodejs-whisper.
 */
export async function transcribeFile(filePath) {
  if (process.env.GROQ_KEY) {
    try {
      const text = await transcribeGroq(filePath);
      if (text) return text;
    } catch (err) {
      console.warn("[stt] Groq failed, falling back:", err.message);
    }
  }

  if (process.env.OPENAI_KEY) {
    try {
      const openai = await getOpenAI();
      const result = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
        language: "en",
        temperature: 0,
        prompt: STT_PROMPT,
      });
      return (result.text || "").trim();
    } catch (err) {
      console.error("[stt] cloud whisper failed:", err.message);
    }
  }

  try {
    const nodewhisper = await getLocalWhisper();
    const out = await nodewhisper(filePath, {
      modelName: MODEL_NAME,
      autoDownloadModelName: MODEL_NAME,
      removeWavFileAfterTranscription: false,
      whisperOptions: {
        outputInText: true,
        language: "en",
        wordTimestamps: false,
      },
    });
    return cleanWhisperOutput(out);
  } catch (err) {
    console.error("[stt] local whisper failed:", err.message);
    return "";
  }
}

async function transcribeGroq(filePath) {
  const form = new FormData();
  const buf = fs.readFileSync(filePath);
  form.append("file", new Blob([buf], { type: "audio/wav" }), "audio.wav");
  form.append("model", GROQ_MODEL);
  form.append("language", "en");
  form.append("temperature", "0");
  form.append("prompt", STT_PROMPT);
  form.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.text || "").trim();
}

function cleanWhisperOutput(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .split("\n")
    .map((l) => l.replace(/^\[[^\]]+\]\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function recordAudio(outPath, maxMs) {
  return new Promise((resolve, reject) => {
    const rawPath = outPath + ".raw";
    const file = createWriteStream(rawPath);
    const recording = recorder.record({
      sampleRate: SAMPLE_RATE,
      channels: 1,
      audioType: "raw",
      silence: `${(SILENCE_THRESHOLD_MS / 1000).toFixed(1)}`,
      thresholdStart: 0.5,
      thresholdEnd: 1.5,
      endOnSilence: true,
    });

    const stream = recording.stream();
    stream.pipe(file);

    const timer = setTimeout(() => {
      try {
        recording.stop();
      } catch {}
    }, maxMs);

    const finalize = (err) => {
      clearTimeout(timer);
      file.end(() => {
        if (err) {
          try { fs.unlinkSync(rawPath); } catch {}
          return reject(err);
        }
        try {
          const pcm = fs.readFileSync(rawPath);
          fs.writeFileSync(outPath, wrapWav(pcm, SAMPLE_RATE, 1, 16));
          fs.unlinkSync(rawPath);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    };

    stream.on("end", () => finalize());
    stream.on("error", finalize);
  });
}

function wrapWav(pcm, sampleRate, channels, bitDepth) {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

function cleanup() {
  try {
    fs.unlinkSync(TMP_PATH);
  } catch {}
}
