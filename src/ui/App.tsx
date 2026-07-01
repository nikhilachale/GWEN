import React, { useEffect, useState } from "react";
import Orb from "./Orb";
import Transcript from "./Transcript";
import Stage from "./Stage";
import HUD from "./HUD";
import SpectrumRing from "./SpectrumRing";
import LeftPanel from "./LeftPanel";
import ActivityFeed from "./ActivityFeed";
import ConversationPanel from "./ConversationPanel";
import SettingsPanel from "./SettingsPanel";
import HealthPanel from "./HealthPanel";
import { Activity, MessageSquare, Settings } from "lucide-react";

export default function App() {
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [state, setState] = useState("idle");

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    window.gwenBridge?.getState?.().then((next) => next && setState(next));
    const unsubscribe = window.gwenBridge?.onState?.((next) => setState(next));
    return () => unsubscribe && unsubscribe();
  }, []);

  const handleTrigger = () => {
    if (window.gwenBridge) window.gwenBridge.triggerListen();
    else console.warn("gwenBridge not available — running outside Electron?");
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const result = await window.gwenBridge?.sendText?.(text);
      if (result?.ok !== false) setMessage("");
    } catch (err) {
      console.warn("typed message failed", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        ...styles.root,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "scale(1)" : "scale(0.98)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      }}
    >
      {/* Center focus stage — takes over when Gwen is doing something
          (code edits, reading a PDF, running a tool); idle = renders
          nothing so the normal Orb + Transcript show. */}
      <Stage />
      <HUD />
      <div style={styles.topControls}>
        <button
          style={{ ...styles.iconButton, ...(showConversations ? styles.iconButtonActive : null) }}
          title="Conversations"
          onClick={() => setShowConversations((v) => !v)}
        >
          <MessageSquare size={14} />
          <span>Chat</span>
        </button>
        <button
          style={{ ...styles.iconButton, ...(showSettings ? styles.iconButtonActive : null) }}
          title="Settings"
          onClick={() => setShowSettings((v) => !v)}
        >
          <Settings size={14} />
          <span>Settings</span>
        </button>
        <button
          style={{ ...styles.iconButton, ...(showHealth ? styles.iconButtonActive : null) }}
          title="Health"
          onClick={() => setShowHealth((v) => !v)}
        >
          <Activity size={14} />
          <span>Health</span>
        </button>
      </div>
      {showConversations && <ConversationPanel onClose={() => setShowConversations(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showHealth && <HealthPanel onClose={() => setShowHealth(false)} />}

      {/* Grid layout: 1fr | 3fr | 1fr */}
      <aside style={styles.leftCol}>
        <LeftPanel />
      </aside>

      <main style={styles.centerCol}>
        <div style={styles.statusRail}>
          <span style={styles.statusDot} />
          <span>{state.toUpperCase()}</span>
        </div>
        <div style={styles.stage}>
          <SpectrumRing />
          <div style={styles.orbWrap} onClick={handleTrigger}>
            <Orb />
          </div>
        </div>

        <Transcript />

        <form style={styles.inputBar} onSubmit={handleSubmit}>
          <input
            aria-label="Message Gwen"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) handleSubmit(event);
            }}
            placeholder="Type or paste context..."
            disabled={sending}
            style={styles.textInput}
          />
          <button
            type="submit"
            disabled={!message.trim() || sending}
            style={{
              ...styles.sendButton,
              ...(!message.trim() || sending ? styles.sendButtonDisabled : null),
            }}
          >
            Send
          </button>
        </form>

        <div style={styles.footer}>
          <span style={styles.label}>Tap orb to speak</span>
        </div>
      </main>

      <aside style={styles.rightCol}>
        <ActivityFeed />
      </aside>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: "100vw",
    height: "100vh",
    background: "transparent",
    display: "grid",
    gridTemplateColumns: "1fr 3fr 1fr",
    position: "relative",
    overflow: "hidden",
  },
  leftCol: {
    minWidth: 0,
    height: "100%",
    overflow: "hidden",
    zIndex: 4,
  },
  centerCol: {
    minWidth: 0,
    height: "100%",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 74,
    paddingBottom: 104,
    boxSizing: "border-box",
  },
  rightCol: {
    minWidth: 0,
    height: "100%",
    overflow: "hidden",
    zIndex: 4,
  },
  stage: {
    position: "relative",
    width: "min(360px, 52vh, 74%)",
    aspectRatio: "1 / 1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  },
  orbWrap: {
    position: "relative",
    width: "60%",
    aspectRatio: "1 / 1",
    cursor: "pointer",
    zIndex: 3,
  },
  footer: {
    position: "absolute",
    bottom: 9,
    fontSize: 10,
    letterSpacing: "0.26em",
    color: "#ED1C24",
    textTransform: "uppercase",
    textShadow: "-1.5px 0 0 #E91E63, 1.5px 0 0 #00B4D8",
    zIndex: 5,
  },
  label: {},
  topControls: {
    position: "absolute",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 8,
    zIndex: 21,
    pointerEvents: "auto",
  },
  iconButton: {
    height: 34,
    border: "1px solid rgba(237, 28, 36, 0.55)",
    background: "rgba(7, 7, 10, 0.76)",
    color: "#fff",
    padding: "0 11px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    cursor: "pointer",
    textShadow: "-1px 0 0 #E91E63, 1px 0 0 #00B4D8",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },
  iconButtonActive: {
    borderColor: "rgba(0, 180, 216, 0.7)",
    background: "rgba(0, 180, 216, 0.12)",
  },
  inputBar: {
    position: "absolute",
    bottom: 30,
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(760px, calc(100% - 56px))",
    minHeight: 46,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    background: "rgba(7, 7, 10, 0.82)",
    border: "1px solid rgba(237, 28, 36, 0.48)",
    boxShadow: "0 0 18px rgba(237, 28, 36, 0.18), inset 0 0 16px rgba(0, 180, 216, 0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    clipPath:
      "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)",
    zIndex: 14,
    pointerEvents: "auto",
  },
  textInput: {
    width: "100%",
    minWidth: 0,
    height: 34,
    border: "1px solid rgba(0, 180, 216, 0.25)",
    outline: "none",
    borderRadius: 0,
    padding: "0 12px",
    background: "rgba(255, 255, 255, 0.04)",
    color: "#ffffff",
    fontSize: 13,
    letterSpacing: 0,
    textShadow: "0 0 5px rgba(0, 180, 216, 0.24)",
  },
  sendButton: {
    height: 34,
    minWidth: 72,
    border: "1px solid rgba(237, 28, 36, 0.7)",
    borderRadius: 0,
    background: "rgba(237, 28, 36, 0.2)",
    color: "#ffffff",
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    cursor: "pointer",
    textShadow: "-1px 0 0 #E91E63, 1px 0 0 #00B4D8",
  },
  sendButtonDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  statusRail: {
    position: "absolute",
    top: 60,
    left: "50%",
    transform: "translateX(-50%)",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "rgba(255,255,255,0.68)",
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    zIndex: 6,
    pointerEvents: "none",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: "#00B4D8",
    boxShadow: "0 0 10px rgba(0, 180, 216, 0.8)",
  },
};
