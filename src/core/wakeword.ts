// src/core/wakeword.js — "Hey MJ" hands-free wake word.
// Disabled by default — MJ falls back to the manual mic button (mj:trigger IPC).
// To enable hands-free:
//   1. Get a free key from https://console.picovoice.ai/
//   2. Train a custom keyword and save the .ppn at data/wakewords/hey-mj.ppn
//   3. Set PORCUPINE_ACCESS_KEY in .env
//   4. npm i @picovoice/porcupine-node @picovoice/pvrecorder-node

import { EventEmitter } from "node:events";

class WakeWordDetector extends EventEmitter {
  constructor() {
    super();
    this.running = false;
  }

  async start() {
    if (this.running) return;
    if (!process.env.PORCUPINE_ACCESS_KEY) {
      console.log("[wakeword] disabled — using manual mic button. Set PORCUPINE_ACCESS_KEY to enable hands-free.");
      return;
    }

    try {
      const { Porcupine } = await import("@picovoice/porcupine-node");
      const { PvRecorder } = await import("@picovoice/pvrecorder-node");
      const fs = await import("node:fs");
      const path = await import("node:path");

      const keywordPath = path.join(process.cwd(), "data", "wakewords", "hey-mj.ppn");
      if (!fs.existsSync(keywordPath)) {
        console.log("[wakeword] keyword file missing at data/wakewords/hey-mj.ppn — wake word disabled");
        return;
      }

      this.porcupine = new Porcupine(
        process.env.PORCUPINE_ACCESS_KEY,
        [keywordPath],
        [0.5]
      );
      this.recorder = new PvRecorder(this.porcupine.frameLength, -1);
      this.recorder.start();
      this.running = true;

      this.loop();
      console.log("[wakeword] listening for 'Hey MJ'");
    } catch (err) {
      console.warn("[wakeword] failed to start:", err.message);
    }
  }

  async loop() {
    while (this.running) {
      try {
        const frame = await this.recorder.read();
        const idx = this.porcupine.process(frame);
        if (idx !== -1) {
          this.emit("wakeword");
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (err) {
        console.error("[wakeword] loop err:", err);
        break;
      }
    }
  }

  stop() {
    this.running = false;
    if (this.recorder) this.recorder.release();
    if (this.porcupine) this.porcupine.release();
  }
}

export const wakeWord = new WakeWordDetector();
