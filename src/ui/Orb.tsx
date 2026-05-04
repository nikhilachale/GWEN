// src/ui/Orb.tsx — Miles Morales web orb. Spider sits at center surrounded
// by a radial spider web. Web color tracks the conversation state (red /
// venom purple palette); the spider glows red with electric purple halo.
import React from "react";
import { useOrb } from "./skills/useOrb.js";

// Locked Miles palette
const RED = "#ED1C24";
const RED_DEEP = "#8B0000";
const CYAN = "#00B4D8";
const MAGENTA = "#E91E63";
// Aliases used by spider glow keyframes below
const SPIDEY_RED = RED;
const SPIDEY_RED_DEEP = RED_DEEP;

const RING_COUNT = 5;
const SPOKE_COUNT = 8;

// Build one concentric web ring. Real webs aren't perfect circles — each
// vertex jitters slightly so the whole thing looks hand-spun.
function webRingPath(radius: number, sides: number, jitterSeed: number) {
  const cx = 100;
  const cy = 100;
  let d = "";
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const jitter = 1 + Math.sin(i * 1.7 + jitterSeed) * 0.04;
    const r = radius * jitter;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return d + "Z";
}

// One radial spoke from the spider out to the rim.
function spokePath(angleDeg: number, innerR: number, outerR: number) {
  const cx = 100;
  const cy = 100;
  const a = (angleDeg * Math.PI) / 180 - Math.PI / 2;
  const x1 = cx + Math.cos(a) * innerR;
  const y1 = cy + Math.sin(a) * innerR;
  const x2 = cx + Math.cos(a) * outerR;
  const y2 = cy + Math.sin(a) * outerR;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)}`;
}

export default function Orb() {
  const { state, audioLevel, color: stateColor } = useOrb();

  // Speed/intensity per state. The web breathes faster when listening or
  // speaking, slower at idle.
  const speed =
    state === "thinking" ? 1.6 :
    state === "speaking" ? 1.1 :
    state === "listening" ? 0.9 :
    2.6;
  const reactiveScale = 1 + audioLevel * 0.14;

  const ringRadii = [22, 38, 54, 70, 86].slice(0, RING_COUNT);

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes gwen-web-breathe {
          0%, 100% { transform: translate(-50%, -50%) scale(0.985); opacity: 0.85; }
          50%      { transform: translate(-50%, -50%) scale(1.015); opacity: 1; }
        }
        @keyframes gwen-pulse-glow {
          0%, 100% { stroke-opacity: 0.45; }
          50%      { stroke-opacity: 0.95; }
        }
        @keyframes gwen-pulse-out {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0; stroke-opacity: 0; }
          15%  { opacity: 1; stroke-opacity: 0.9; }
          100% { transform: translate(-50%, -50%) scale(1.25); opacity: 0; stroke-opacity: 0; }
        }
        @keyframes gwen-spider-pulse {
          0%, 100% { filter: drop-shadow(0 0 4px ${RED}) drop-shadow(0 0 10px ${RED_DEEP}); }
          50%      { filter: drop-shadow(-1.5px 0 0 ${MAGENTA}) drop-shadow(1.5px 0 0 ${CYAN}) drop-shadow(0 0 12px ${RED}); }
        }
        @keyframes gwen-spider-rotate {
          from { transform: translate(-50%, -50%) scale(var(--reactive-scale)) rotate(0deg); }
          to   { transform: translate(-50%, -50%) scale(var(--reactive-scale)) rotate(360deg); }
        }
        @keyframes gwen-listen-ripple {
          0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0.9; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
        @keyframes gwen-listen-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.6; }
          40%           { transform: translateY(-10px); opacity: 1; }
        }
      `}</style>

      {/* Static spider web — concentric rings + radial spokes */}
      <svg viewBox="0 0 200 200" style={styles.web}>
        <defs>
          <radialGradient id="web-fade" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={stateColor} stopOpacity="1" />
            <stop offset="60%" stopColor={stateColor} stopOpacity="0.7" />
            <stop offset="100%" stopColor={stateColor} stopOpacity="0.15" />
          </radialGradient>
        </defs>

        {/* Spokes — drawn first so rings sit on top */}
        <g
          stroke="url(#web-fade)"
          strokeWidth="1.1"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${stateColor})` }}
        >
          {Array.from({ length: SPOKE_COUNT }).map((_, i) => {
            const angle = (i / SPOKE_COUNT) * 360;
            return <path key={`spoke-${i}`} d={spokePath(angle, 8, 90)} />;
          })}
        </g>

        {/* Concentric web rings */}
        <g
          fill="none"
          stroke="url(#web-fade)"
          strokeLinejoin="miter"
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 4px ${stateColor})`,
            animation: `gwen-pulse-glow ${speed}s ease-in-out infinite`,
          }}
        >
          {ringRadii.map((r, i) => (
            <path
              key={`ring-${i}`}
              d={webRingPath(r, SPOKE_COUNT, i * 1.3)}
              strokeWidth={1.2 + (RING_COUNT - i) * 0.15}
              strokeOpacity={0.4 + (RING_COUNT - i) * 0.1}
            />
          ))}
        </g>
      </svg>

      {/* Two pulse rings traveling outward — energy in the web threads */}
      {state !== "listening" && [0, 1].map((i) => (
        <svg
          key={`pulse-${i}`}
          viewBox="0 0 200 200"
          style={{
            ...styles.pulse,
            animation: `gwen-pulse-out ${speed}s ease-out ${(i * speed) / 2}s infinite`,
          }}
        >
          <path
            d={webRingPath(78, SPOKE_COUNT, 0)}
            fill="none"
            stroke={stateColor}
            strokeWidth="1.4"
            strokeLinejoin="miter"
            style={{ filter: `drop-shadow(0 0 8px ${stateColor})` }}
          />
        </svg>
      ))}

      {/* Listening: outward ripple rings + 3 bouncing dots */}
      {state === "listening" && (
        <>
          {[0, 1, 2].map((i) => (
            <div
              key={`ripple-${i}`}
              style={{
                ...styles.ripple,
                borderColor: stateColor,
                boxShadow: `0 0 12px ${stateColor}`,
                animation: `gwen-listen-ripple 1.6s ease-out ${i * 0.5}s infinite`,
              }}
            />
          ))}
          <div style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <span
                key={`dot-${i}`}
                style={{
                  ...styles.dot,
                  background: stateColor,
                  boxShadow: `0 0 8px ${stateColor}`,
                  animation: `gwen-listen-bounce 1s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Soft core glow behind the spider — blends state color with red */}
      <div style={{ ...styles.coreGlow, background: `radial-gradient(circle, ${stateColor}55 0%, ${SPIDEY_RED}33 40%, transparent 70%)` }} />

      {/* Spider symbol — kept upright; reacts to audio */}
      <img
        src="/bg.png"
        alt=""
        draggable={false}
        style={{
          ...styles.spider,
          ["--reactive-scale" as any]: reactiveScale,
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    height: "100%",
    position: "relative",
    overflow: "visible",
    background: "transparent",
  },
  web: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "100%",
    height: "100%",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    overflow: "visible",
    animation: "gwen-web-breathe 4s ease-in-out infinite",
  },
  pulse: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    overflow: "visible",
  },
  coreGlow: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "40%",
    height: "40%",
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    filter: "blur(14px)",
    pointerEvents: "none",
  },
  ripple: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "55%",
    height: "55%",
    borderRadius: "50%",
    border: "2px solid",
    pointerEvents: "none",
  },
  dots: {
    position: "absolute",
    top: "calc(50% + 80px)",
    left: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    gap: "10px",
    pointerEvents: "none",
    zIndex: 2,
  },
  dot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    display: "inline-block",
  },
  spider: {
    position: "absolute",
    top: "50%",
    left: "50%",
    // Logo is a vertical rectangle (~taller than wide); keep height as the
    // anchor so legs don't get clipped, and let width auto-scale.
    height: "60%",
    width: "auto",
    pointerEvents: "none",
    transformOrigin: "center",
    transform: "translate(-50%, -50%) scale(var(--reactive-scale, 1))",
    animation: "gwen-spider-pulse 2.4s ease-in-out infinite",
    // Drop the white background of the PNG so it sits cleanly on dark UI.
    // mix-blend-mode lighten + screen would also work; this assumes the
    // PNG has transparent or near-white background — if you see a white
    // square around it, swap the next two lines back to mixBlendMode.
    objectFit: "contain",
  },
};
