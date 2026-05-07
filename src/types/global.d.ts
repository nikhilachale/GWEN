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
      onCodeOutput: (cb: (output: unknown) => void) => () => void;
      onSelfFix: (cb: (state: { active: boolean; label: string }) => void) => () => void;
      onCodeDiff: (cb: (diff: string) => void) => () => void;
      triggerListen: () => void;
      toggleFullscreen: () => void;
      getState: () => Promise<string>;
    };
  }
}
