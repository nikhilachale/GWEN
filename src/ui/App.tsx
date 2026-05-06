import React, { useEffect, useState } from "react";
import Orb from "./Orb";
import Transcript from "./Transcript";
import SelfFixOverlay from "./SelfFixOverlay";
import HUD from "./HUD";
import SpeedLines from "./SpeedLines";
import SpectrumRing from "./SpectrumRing";
import ContextPanel from "./ContextPanel";

export default function App() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleTrigger = () => {
    if (window.gwenBridge) window.gwenBridge.triggerListen();
    else console.warn("gwenBridge not available — running outside Electron?");
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
      <SelfFixOverlay />
      <HUD />
      <ContextPanel />

      <div style={styles.stage}>
        <SpeedLines />
        <SpectrumRing />
        <div style={styles.orbWrap} onClick={handleTrigger}>
          <Orb />
        </div>
      </div>

      <Transcript />
      <div style={styles.footer}>
        <span style={styles.label}>Gwen — tap orb to speak</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  stage: {
    position: "relative",
    width: 600,
    height: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  },
  orbWrap: {
    position: "relative",
    width: 360,
    height: 360,
    cursor: "pointer",
    zIndex: 3,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    fontSize: 10,
    letterSpacing: "0.4em",
    color: "#ED1C24",
    textTransform: "uppercase",
    textShadow: "-1.5px 0 0 #E91E63, 1.5px 0 0 #00B4D8",
    zIndex: 5,
  },
  label: {},
};
