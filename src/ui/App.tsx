import React, { useEffect, useState } from "react";
import Orb from "./Orb";
import Transcript from "./Transcript";
import SelfFixOverlay from "./SelfFixOverlay";
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

  const handleToggleFullscreen = () => {
    if (window.gwenBridge) window.gwenBridge.toggleFullscreen();
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
      {/* Overlays — always on top, ignore the grid */}
      <SelfFixOverlay />
      <HUD />

      <button
        type="button"
        onClick={handleToggleFullscreen}
        style={styles.fullscreenBtn}
        aria-label="Toggle fullscreen"
        title="Toggle fullscreen"
      >
        ⛶
      </button>

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
  fullscreenBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    background: "rgba(0,0,0,0.4)",
    border: "1px solid #00B4D8",
    color: "#00B4D8",
    fontSize: 16,
    lineHeight: "1",
    cursor: "pointer",
    zIndex: 10,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
