// electron/preload.cts — contextBridge for renderer
// CJS for Electron preload compatibility.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gwenBridge", {
  // state subscriptions
  onState: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:state", handler);
    return () => ipcRenderer.removeListener("gwen:state", handler);
  },
  onTranscript: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:transcript", handler);
    return () => ipcRenderer.removeListener("gwen:transcript", handler);
  },
  onAudioLevel: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:audio-level", handler);
    return () => ipcRenderer.removeListener("gwen:audio-level", handler);
  },
  onSelfFix: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:self-fix", handler);
    return () => ipcRenderer.removeListener("gwen:self-fix", handler);
  },
  onContextPanel: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:context-panel", handler);
    return () => ipcRenderer.removeListener("gwen:context-panel", handler);
  },
  onActivity: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:activity", handler);
    return () => ipcRenderer.removeListener("gwen:activity", handler);
  },
  onCodeOutput: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:code-output", handler);
    return () => ipcRenderer.removeListener("gwen:code-output", handler);
  },
  onCodeDiff: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:code-diff", handler);
    return () => ipcRenderer.removeListener("gwen:code-diff", handler);
  },
  onDoc: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:doc", handler);
    return () => ipcRenderer.removeListener("gwen:doc", handler);
  },

  // outgoing
  triggerListen: () => ipcRenderer.send("gwen:trigger", "listen"),
  getState: () => ipcRenderer.invoke("gwen:get-state"),
  getFixes: () => ipcRenderer.invoke("gwen:get-fixes"),
  getTasks: () => ipcRenderer.invoke("gwen:get-tasks"),
});
