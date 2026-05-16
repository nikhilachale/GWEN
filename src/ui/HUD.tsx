// src/ui/HUD.tsx — JARVIS-style corner brackets with live status
import React, { useEffect, useState } from "react";
import { useOrb } from "./skills/useOrb.js";
import { RED, CHROMATIC_TEXT_SHADOW } from "./theme.js";

const BRACKET = 28; // bracket leg length in px
const INSET = 24;   // distance from screen edge

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(d: Date) {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default function HUD() {
  const { state, audioLevel } = useOrb();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={styles.root}>
      {/* Top-left */}
      <Corner pos="tl">
        <div style={styles.label}>GWEN // ONLINE</div>
        <div style={styles.value}>{formatTime(now)}</div>
      </Corner>

      {/* Top-right */}
      <Corner pos="tr">
        <div style={{ ...styles.label, textAlign: "right" }}>STATE</div>
        <div style={{ ...styles.value, textAlign: "right" }}>
          {state.toUpperCase()}
        </div>
        <div style={styles.meterWrap}>
          <div
            style={{
              ...styles.meterFill,
              width: `${Math.round(audioLevel * 100)}%`,
            }}
          />
        </div>
      </Corner>

      {/* Bottom-left */}
      <Corner pos="bl">
        <div style={styles.value}>{formatDate(now)}</div>
        <div style={styles.label}>{DOW[now.getDay()]}</div>
      </Corner>

      {/* Bottom-right */}
      <Corner pos="br">
        <div style={{ ...styles.value, textAlign: "right" }}>HAIKU 4.5</div>
        <div style={{ ...styles.label, textAlign: "right" }}>v1.0 // GWEN</div>
      </Corner>
    </div>
  );
}

function Corner({ pos, children }: { pos: "tl" | "tr" | "bl" | "br"; children: React.ReactNode }) {
  const isTop = pos === "tl" || pos === "tr";
  const isLeft = pos === "tl" || pos === "bl";

  const borderStyle = `1.5px solid ${RED}`;
  const cornerStyle: React.CSSProperties = {
    position: "absolute",
    [isTop ? "top" : "bottom"]: INSET,
    [isLeft ? "left" : "right"]: INSET,
    padding: isLeft ? "8px 0 0 10px" : "8px 10px 0 0",
    width: BRACKET * 5,
    borderTop: isTop ? borderStyle : "none",
    borderBottom: !isTop ? borderStyle : "none",
    borderLeft: isLeft ? borderStyle : "none",
    borderRight: !isLeft ? borderStyle : "none",
  };

  return <div style={cornerStyle}>{children}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 5,
  },
  label: {
    fontSize: 9,
    letterSpacing: "0.35em",
    textTransform: "uppercase",
    color: RED,
    opacity: 0.85,
    textShadow: CHROMATIC_TEXT_SHADOW,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  value: {
    fontSize: 14,
    letterSpacing: "0.18em",
    color: "#ffffff",
    textShadow: CHROMATIC_TEXT_SHADOW,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    marginTop: 4,
  },
  meterWrap: {
    marginTop: 6,
    height: 3,
    width: "100%",
    background: "rgba(237, 28, 36, 0.18)",
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    background: RED,
    boxShadow: `0 0 6px ${RED}`,
    transition: "width 80ms linear",
  },
};
