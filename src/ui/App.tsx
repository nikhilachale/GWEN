import React, { useEffect, useState } from "react";
import Orb from "./Orb";
import Transcript from "./Transcript";
import Stage from "./Stage";
import HUD from "./HUD";
import SpectrumRing from "./SpectrumRing";
import LeftPanel from "./LeftPanel";
import ActivityFeed from "./ActivityFeed";

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
      {/* Center focus stage — takes over when Gwen is doing something
          (code edits, reading a PDF, running a tool); idle = renders
          nothing so the normal Orb + Transcript show. */}
      <Stage />
      <HUD />

      {/* Grid layout: 1fr | 3fr | 1fr */}
      <aside style={styles.leftCol}>
        <LeftPanel />
      </aside>

      <main style={styles.centerCol}>
        <div style={styles.stage}>
          <SpectrumRing />
          <div style={styles.orbWrap} onClick={handleTrigger}>
            <Orb />
          </div>
        </div>

        <Transcript />

        <div style={styles.footer}>
          <span style={styles.label}>Gwen — tap orb to speak</span>
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
    justifyContent: "center",
  },
  rightCol: {
    minWidth: 0,
    height: "100%",
    overflow: "hidden",
    zIndex: 4,
  },
  stage: {
    position: "relative",
    width: "min(600px, 90%)",
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
