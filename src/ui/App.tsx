import React from "react";
import Orb from "./Orb";
import Transcript from "./Transcript";

export default function App() {
  const handleTrigger = () => {
    if (window.mjBridge) window.mjBridge.triggerListen();
    else console.warn("mjBridge not available — running outside Electron?");
  };

  return (
    <div style={styles.root}>
      <div style={styles.orbWrap} onClick={handleTrigger}>
        <Orb />
      </div>
      <Transcript />
      <div style={styles.footer}>
        <span style={styles.label}>MJ — tap orb to speak</span>
      </div>
    </div>
  );
}

const styles = {
  root: {
    width: "100vw",
    height: "100vh",
    background: "#000",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  orbWrap: {
    width: 360,
    height: 360,
    cursor: "pointer",
    flex: "0 0 auto",
  },
  footer: {
    position: "absolute",
    bottom: 16,
    fontSize: 11,
    letterSpacing: "0.2em",
    color: "rgba(0, 212, 255, 0.5)",
    textTransform: "uppercase",
  },
  label: {},
};
