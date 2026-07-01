import type { BrowserWindow } from "electron";

export {};

declare global {
  type GwenHealthStatus = "ok" | "warn" | "missing";

  type GwenHealthSnapshot = {
    generatedAt: string;
    overall: GwenHealthStatus;
    sections: Array<{
      id: string;
      title: string;
      checks: Array<{
        id: string;
        label: string;
        status: GwenHealthStatus;
        detail: string;
      }>;
    }>;
  };

  var mainWindow: BrowserWindow | null | undefined;
  var getGwenState: (() => string) | undefined;

  interface Window {
    gwenBridge?: {
      onState: (cb: (state: string) => void) => () => void;
      onTranscript: (cb: (entry: unknown) => void) => () => void;
      onConversation: (cb: (conversation: any) => void) => () => void;
      onAudioLevel: (cb: (level: number) => void) => () => void;
      onSelfFix: (cb: (state: { active: boolean; label: string }) => void) => () => void;
      onCodeOutput: (cb: (chunk: string) => void) => () => void;
      onCodeDiff: (cb: (diff: string) => void) => () => void;
      onDoc: (cb: (doc: { title: string; text: string; pages?: number }) => void) => () => void;
      onActivity: (cb: (e: { kind: string; tool?: string; summary: string; detail?: string; ts: number }) => void) => () => void;
      triggerListen: () => void;
      sendText: (text: string) => Promise<{ ok: boolean; error?: string }>;
      getState: () => Promise<string>;
      getHomeDashboard: () => Promise<any>;
      getTasks: () => Promise<any[]>;
      getFixes: () => Promise<any[]>;
      getSettings: () => Promise<any>;
      updateSettings: (patch: any) => Promise<any>;
      getHealthSnapshot: () => Promise<GwenHealthSnapshot>;
      getConversations: (query?: string) => Promise<any[]>;
      getCurrentConversation: () => Promise<any>;
      newConversation: (title?: string) => Promise<any>;
      switchConversation: (id: string) => Promise<any>;
      renameConversation: (id: string, title: string) => Promise<any>;
      pinConversation: (id: string, pinned: boolean) => Promise<any>;
      deleteConversation: (id: string) => Promise<any>;
      clearCurrentConversation: () => Promise<any>;
    };
  }
}
