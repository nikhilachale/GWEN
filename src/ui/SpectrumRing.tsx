// src/ui/SpectrumRing.tsx — circular EQ bars around the orb.
// We only have a single audio level (not raw FFT), so each bar's height
// is `audioLevel` modulated by a per-bar phase that drifts over time —
// gives the dancing-equalizer look without needing real spectrum data.
import React, { useEffect, useRef, useState } from "react";
import { useOrb } from "./skills/useOrb.js";

const BAR_COUNT = 48;
const VIEW = 400;
const CENTER = VIEW / 2;
const RING_R = 150;       // bars sit at this radius (just outside web)
const BAR_W = 2.5;
const BAR_BASE = 6;       // min bar height
const BAR_SCALE = 28;     // max additional height when audio is loud

export default function SpectrumRing() {
  const { state, audioLevel, color } = useOrb();
  const [, force] = useState(0);
  const rafRef = useRef<number | null>(null);
  const tStartRef = useRef(performance.now());

  // Drive a render loop while active so per-bar phases update smoothly.
  useEffect(() => {
    const tick = () => {
      force((n) => (n + 1) % 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (state !== "listening") return null;

  const opacity = 0.9;

  const t = (performance.now() - tStartRef.current) / 200;

  return (
    <div style={styles.wrap}>
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width="100%"
        height="100%"
        style={{
          display: "block",
          opacity,
          transition: "opacity 300ms ease-out",
        }}
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => {
          const angleDeg = (i / BAR_COUNT) * 360;
          // Per-bar phase: each bar oscillates with an offset so adjacent
          // bars don't move in lockstep. Result reads as a wave traveling
          // around the ring even when audioLevel is constant.
          const phase = Math.sin(i * 0.55 + t) * 0.5 + 0.5; // 0..1
          // Always show some baseline movement; audio amplifies it.
          const ambient = 0.15 + phase * 0.25;
          const reactive = audioLevel * phase * 1.4;
          const intensity = Math.min(1, ambient + reactive);
          const h = BAR_BASE + intensity * BAR_SCALE;

          return (
            <rect
              key={i}
              x={CENTER - BAR_W / 2}
              y={CENTER - RING_R - h}
              width={BAR_W}
              height={h}
              fill={color}
              rx={1}
              transform={`rotate(${angleDeg} ${CENTER} ${CENTER})`}
              style={{
                filter: `drop-shadow(0 0 3px ${color})`,
              }}
            />
          );
        })}
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
    width: 400,
    height: 400,
    pointerEvents: "none",
    zIndex: 2,
  },
};
