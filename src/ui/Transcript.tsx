// src/ui/Transcript.tsx — live conversation feed
import React, { useEffect, useState, useRef } from "react";

const MAX_LINES = 8;

export default function Transcript() {
  const [lines, setLines] = useState([]);
  const [codeOutput, setCodeOutput] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!window.mjBridge) return;
    const u1 = window.mjBridge.onTranscript(({ role, text }) => {
      setLines((prev) => {
        const next = [...prev, { role, text, ts: Date.now() }];
        return next.slice(-MAX_LINES);
      });
    });
    const u2 = window.mjBridge.onCodeOutput((chunk) => {
      setCodeOutput((prev) => (prev + chunk).slice(-2000));
    });
    return () => {
      u1 && u1();
      u2 && u2();
    };
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, codeOutput]);

  return (
    <div ref={containerRef} style={styles.wrap}>
      {lines.map((l, i) => {
        const age = lines.length - i;
        const opacity = Math.max(0.25, 1 - age * 0.1);
        return (
          <div
            key={`${l.ts}-${i}`}
            style={{
              ...styles.line,
              ...(l.role === "user" ? styles.user : styles.assistant),
              opacity,
            }}
          >
            <span style={styles.role}>{l.role === "user" ? "you" : "MJ"}</span>
            <span style={styles.text}>{l.text}</span>
          </div>
        );
      })}
      {codeOutput && (
        <pre style={styles.code}>{codeOutput}</pre>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    maxHeight: "30vh",
    overflowY: "auto",
    padding: "0 32px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    pointerEvents: "none",
  },
  line: {
    fontSize: 14,
    lineHeight: 1.5,
    transition: "opacity 0.4s ease",
  },
  user: {
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "right",
  },
  assistant: {
    color: "#00d4ff",
    textAlign: "left",
  },
  role: {
    fontSize: 10,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    opacity: 0.6,
    marginRight: 8,
  },
  text: {},
  code: {
    background: "rgba(0, 212, 255, 0.05)",
    border: "1px solid rgba(0, 212, 255, 0.2)",
    color: "#7fdbff",
    padding: 10,
    fontSize: 11,
    fontFamily: "ui-monospace, monospace",
    borderRadius: 4,
    maxHeight: 150,
    overflow: "auto",
    whiteSpace: "pre-wrap",
  },
};
