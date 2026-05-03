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
  onCodeOutput: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:code-output", handler);
    return () => ipcRenderer.removeListener("gwen:code-output", handler);
  },

  // outgoing
  triggerListen: () => ipcRenderer.send("gwen:trigger", "listen"),
  getState: () => ipcRenderer.invoke("gwen:get-state"),
});
