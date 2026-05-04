// src/ui/skills/useOrb.js — manages orb visual state from IPC
import { useEffect, useState, useRef } from "react";

// Locked Miles palette — print-plate logic:
//   idle  → muted red glow on black (subtle, 80% black rule)
//   listening → bright RED #ED1C24 (alert plate)
//   thinking  → MAGENTA #E91E63 (processing / offset plate)
//   speaking  → CYAN #00B4D8 (output / offset plate)
const STATE_CONFIG = {
  idle:      { color: "#8B0000", pulseHz: 0.3, particles: 3000 },
  listening: { color: "#2979FF", pulseHz: 1.5, particles: 4000 },
  thinking:  { color: "#E91E63", pulseHz: 0.8, particles: 3500 },
  speaking:  { color: "#00B4D8", pulseHz: 1.0, particles: 5000 },
};

export function useOrb() {
  const [state, setState] = useState("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const decayRef = useRef(null);

  useEffect(() => {
    if (!window.gwenBridge) return;
    const unsubState = window.gwenBridge.onState((s) => setState(s));
    const unsubLevel = window.gwenBridge.onAudioLevel((lvl) => {
      setAudioLevel(Math.max(0, Math.min(1, lvl)));
      // Auto-decay so the orb relaxes between chunks
      if (decayRef.current) clearTimeout(decayRef.current);
      decayRef.current = setTimeout(() => setAudioLevel(0), 120);
    });
    return () => {
      unsubState && unsubState();
      unsubLevel && unsubLevel();
    };
  }, []);

  const config = STATE_CONFIG[state] || STATE_CONFIG.idle;
  return {
    state,
    color: config.color,
    audioLevel,
    pulseSpeed: config.pulseHz,
    particleCount: config.particles,
    setState,
    setAudioLevel,
  };
}
