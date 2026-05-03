import type { BrowserWindow } from "electron";

export {};

declare global {
  var mainWindow: BrowserWindow | null | undefined;
  var getMjState: (() => string) | undefined;

  interface Window {
    mjBridge?: {
      onState: (cb: (state: string) => void) => () => void;
      onTranscript: (cb: (entry: unknown) => void) => () => void;
      onAudioLevel: (cb: (level: number) => void) => () => void;
      onCodeOutput: (cb: (output: unknown) => void) => () => void;
      triggerListen: () => void;
      getState: () => Promise<string>;
    };
  }
}
