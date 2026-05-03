// src/ui/skills/useOrb.js — manages orb visual state from IPC
import { useEffect, useState, useRef } from "react";

const STATE_CONFIG = {
  idle:      { color: "#00d4ff", pulseHz: 0.3, particles: 3000 },
  listening: { color: "#ffffff", pulseHz: 1.5, particles: 4000 },
  thinking:  { color: "#ff9500", pulseHz: 0.8, particles: 3500 },
  speaking:  { color: "#00ff88", pulseHz: 1.0, particles: 5000 },
};

export function useOrb() {
  const [state, setState] = useState("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const decayRef = useRef(null);

  useEffect(() => {
    if (!window.mjBridge) return;
    const unsubState = window.mjBridge.onState((s) => setState(s));
    const unsubLevel = window.mjBridge.onAudioLevel((lvl) => {
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
