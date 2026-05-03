// electron/preload.cjs — contextBridge for renderer
// CJS for Electron preload compatibility.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mjBridge", {
  // state subscriptions
  onState: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("mj:state", handler);
    return () => ipcRenderer.removeListener("mj:state", handler);
  },
  onTranscript: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("mj:transcript", handler);
    return () => ipcRenderer.removeListener("mj:transcript", handler);
  },
  onAudioLevel: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("mj:audio-level", handler);
    return () => ipcRenderer.removeListener("mj:audio-level", handler);
  },
  onCodeOutput: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("mj:code-output", handler);
    return () => ipcRenderer.removeListener("mj:code-output", handler);
  },

  // outgoing
  triggerListen: () => ipcRenderer.send("mj:trigger", "listen"),
  getState: () => ipcRenderer.invoke("mj:get-state"),
});
