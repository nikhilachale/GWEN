import type { BrowserWindow } from "electron";

export {};

declare global {
  var mainWindow: BrowserWindow | null | undefined;
  var getGwenState: (() => string) | undefined;

  interface Window {
    gwenBridge?: {
      onState: (cb: (state: string) => void) => () => void;
      onTranscript: (cb: (entry: unknown) => void) => () => void;
      onAudioLevel: (cb: (level: number) => void) => () => void;
      onSelfFix: (cb: (state: { active: boolean; label: string }) => void) => () => void;
      onCodeOutput: (cb: (chunk: string) => void) => () => void;
      onCodeDiff: (cb: (diff: string) => void) => () => void;
      onDoc: (cb: (doc: { title: string; text: string; pages?: number }) => void) => () => void;
      onActivity: (cb: (e: { kind: string; tool?: string; summary: string; detail?: string; ts: number }) => void) => () => void;
      triggerListen: () => void;
      getState: () => Promise<string>;
    };
  }
}
