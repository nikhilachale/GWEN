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
  onConversation: (cb) => {
    const handler = (_, v) => cb(v);
    ipcRenderer.on("gwen:conversation", handler);
    return () => ipcRenderer.removeListener("gwen:conversation", handler);
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
  sendText: (text) => ipcRenderer.invoke("gwen:send-text", text),
  getState: () => ipcRenderer.invoke("gwen:get-state"),
  getHomeDashboard: () => ipcRenderer.invoke("gwen:get-home-dashboard"),
  getFixes: () => ipcRenderer.invoke("gwen:get-fixes"),
  getTasks: () => ipcRenderer.invoke("gwen:get-tasks"),
  getSettings: () => ipcRenderer.invoke("gwen:get-settings"),
  updateSettings: (patch) => ipcRenderer.invoke("gwen:update-settings", patch),
  getHealthSnapshot: () => ipcRenderer.invoke("gwen:get-health-snapshot"),
  getConversations: (query) => ipcRenderer.invoke("gwen:get-conversations", query),
  getCurrentConversation: () => ipcRenderer.invoke("gwen:get-current-conversation"),
  newConversation: (title) => ipcRenderer.invoke("gwen:new-conversation", title),
  switchConversation: (id) => ipcRenderer.invoke("gwen:switch-conversation", id),
  renameConversation: (id, title) => ipcRenderer.invoke("gwen:rename-conversation", id, title),
  pinConversation: (id, pinned) => ipcRenderer.invoke("gwen:pin-conversation", id, pinned),
  deleteConversation: (id) => ipcRenderer.invoke("gwen:delete-conversation", id),
  clearCurrentConversation: () => ipcRenderer.invoke("gwen:clear-current-conversation"),
});
