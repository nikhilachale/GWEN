import React from "react";
import Orb from "./Orb";
import Transcript from "./Transcript";
import SelfFixOverlay from "./SelfFixOverlay";

export default function App() {
  const handleTrigger = () => {
    if (window.gwenBridge) window.gwenBridge.triggerListen();
    else console.warn("gwenBridge not available — running outside Electron?");
  };

  return (
    <div style={styles.root}>
      <SelfFixOverlay />
      <div style={styles.orbWrap} onClick={handleTrigger}>
        <Orb />
      </div>
      <Transcript />
      <div style={styles.footer}>
        <span style={styles.label}>Gwen — tap orb to speak</span>
      </div>
    </div>
  );
}

const styles = {
  root: {
    width: "100vw",
    height: "100vh",
    background: "transparent",
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
    fontSize: 10,
    letterSpacing: "0.4em",
    color: "#ED1C24",
    textTransform: "uppercase",
    // Print-misalignment chromatic offset
    textShadow: "-1.5px 0 0 #E91E63, 1.5px 0 0 #00B4D8",
  },
  label: {},
};
