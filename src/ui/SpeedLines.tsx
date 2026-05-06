// src/ui/SpeedLines.tsx — Spider-Verse comic speed lines.
// Radial bursts behind the orb that fire when Gwen is thinking or speaking.
import React, { useMemo } from "react";
import { useOrb } from "./skills/useOrb.js";
import { RED, CYAN } from "./theme.js";

const LINE_COUNT = 28;
const VIEW = 600;       // SVG viewBox is 600x600, centered on (300, 300)
const CENTER = VIEW / 2;
const INNER_R = 110;    // start outside the spider web (web outer ~86)
const OUTER_MIN = 180;  // shortest line tip
const OUTER_MAX = 280;  // longest line tip

type Line = { x1: number; y1: number; x2: number; y2: number; delay: number };

function buildLines(): Line[] {
  const out: Line[] = [];
  for (let i = 0; i < LINE_COUNT; i++) {
    const angle = (i / LINE_COUNT) * Math.PI * 2;
    // Vary length pseudo-randomly per index for that hand-drawn comic feel.
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    const t = seed - Math.floor(seed); // 0..1
    const outerR = OUTER_MIN + t * (OUTER_MAX - OUTER_MIN);
    out.push({
      x1: CENTER + Math.cos(angle) * INNER_R,
      y1: CENTER + Math.sin(angle) * INNER_R,
      x2: CENTER + Math.cos(angle) * outerR,
      y2: CENTER + Math.sin(angle) * outerR,
      delay: (i / LINE_COUNT) * 600, // staggered burst
    });
  }
  return out;
}

export default function SpeedLines() {
  const { state } = useOrb();
  const lines = useMemo(() => buildLines(), []);

  const active = state === "thinking" || state === "speaking";

  return (
    <div
      style={{
        ...styles.wrap,
        opacity: active ? 1 : 0,
        transition: "opacity 350ms ease-out",
      }}
    >
      <style>{`
        @keyframes gwen-speed-line {
          0%   { opacity: 0; stroke-dashoffset: 100; }
          30%  { opacity: 0.8; }
          100% { opacity: 0; stroke-dashoffset: 0; }
        }
      `}</style>
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width="100%"
        height="100%"
        style={{ display: "block" }}
      >
        {/* Cyan ghost layer — chromatic offset */}
        <g transform="translate(2, 0)" style={{ mixBlendMode: "screen" }}>
          {lines.map((l, i) => (
            <line
              key={`c-${i}`}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={CYAN}
              strokeWidth={1.2}
              strokeLinecap="round"
              opacity={0.5}
              style={{
                animation: active ? `gwen-speed-line 700ms ease-out ${l.delay}ms infinite` : "none",
              }}
            />
          ))}
        </g>

        {/* Red main layer */}
        <g transform="translate(-2, 0)">
          {lines.map((l, i) => (
            <line
              key={`r-${i}`}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={RED}
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.85}
              style={{
                animation: active ? `gwen-speed-line 700ms ease-out ${l.delay}ms infinite` : "none",
                filter: `drop-shadow(0 0 4px ${RED})`,
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 600,
    height: 600,
    pointerEvents: "none",
    zIndex: 1,
  },
};
