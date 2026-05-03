// src/ui/SelfFixOverlay.tsx — animated banner shown while Gwen modifies her
// own code (fix_self_code) or rebuilds herself (repair_self).
import React, { useEffect, useState } from "react";

export default function SelfFixOverlay() {
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!window.gwenBridge) return;
    const off = window.gwenBridge.onSelfFix(({ active, label }) => {
      setActive(active);
      if (label) setLabel(label);
    });
    return () => {
      off && off();
    };
  }, []);

  if (!active) return null;

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={styles.banner}>
        <div style={styles.scanline} />
        <div style={styles.row}>
          <span style={styles.dot} />
          <span style={styles.label}>{label || "rewriting myself"}</span>
          <span style={styles.dots}>
            <span style={{ ...styles.tick, animationDelay: "0s" }}>.</span>
            <span style={{ ...styles.tick, animationDelay: "0.2s" }}>.</span>
            <span style={{ ...styles.tick, animationDelay: "0.4s" }}>.</span>
          </span>
        </div>
        <div style={styles.borderTop} />
        <div style={styles.borderBottom} />
      </div>
    </>
  );
}

const KEYFRAMES = `
@keyframes gwen-pulse {
  0%, 100% { opacity: 0.9; box-shadow: 0 0 8px #ED1C24, 0 0 16px rgba(237, 28, 36, 0.4); }
  50%      { opacity: 0.4; box-shadow: 0 0 4px #ED1C24, 0 0 8px rgba(237, 28, 36, 0.2); }
}
@keyframes gwen-scan {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes gwen-tick {
  0%, 100% { opacity: 0.2; }
  50%      { opacity: 1; }
}
@keyframes gwen-border-flicker {
  0%, 100% { opacity: 1; }
  93%      { opacity: 0.4; }
  96%      { opacity: 1; }
}
`;

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    padding: "14px 28px",
    background:
      "linear-gradient(90deg, rgba(17,17,17,0.95) 0%, rgba(50,8,12,0.95) 50%, rgba(17,17,17,0.95) 100%)",
    border: "1px solid rgba(237, 28, 36, 0.5)",
    borderRadius: 4,
    color: "#ED1C24",
    fontFamily: "ui-monospace, 'SF Mono', monospace",
    fontSize: 12,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    overflow: "hidden",
    zIndex: 100,
    pointerEvents: "none",
    backdropFilter: "blur(6px)",
    animation: "gwen-border-flicker 3s ease-in-out infinite",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    position: "relative",
    zIndex: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ED1C24",
    animation: "gwen-pulse 1.2s ease-in-out infinite",
  },
  label: {
    color: "#ED1C24",
    // Chromatic-offset print look + red glow halo
    textShadow:
      "-1.5px 0 0 #E91E63, 1.5px 0 0 #00B4D8, 0 0 8px rgba(237, 28, 36, 0.7)",
  },
  dots: {
    display: "inline-flex",
    width: 18,
    fontSize: 14,
    letterSpacing: 1,
  },
  tick: {
    animation: "gwen-tick 1.2s ease-in-out infinite",
  },
  scanline: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "30%",
    background:
      "linear-gradient(90deg, transparent 0%, rgba(237, 28, 36, 0.25) 50%, transparent 100%)",
    animation: "gwen-scan 2.4s linear infinite",
    pointerEvents: "none",
    zIndex: 1,
  },
  borderTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background:
      "linear-gradient(90deg, transparent 0%, #ED1C24 50%, transparent 100%)",
    boxShadow: "0 0 8px #ED1C24",
  },
  borderBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    background:
      "linear-gradient(90deg, transparent 0%, #ED1C24 50%, transparent 100%)",
    boxShadow: "0 0 8px #ED1C24",
  },
};
