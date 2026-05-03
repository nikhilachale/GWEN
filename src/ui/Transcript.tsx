// src/ui/Transcript.tsx — live conversation feed
import React, { useEffect, useState, useRef } from "react";

const MAX_LINES = 8;

export default function Transcript() {
  const [lines, setLines] = useState([]);
  const [codeOutput, setCodeOutput] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!window.gwenBridge) return;
    const u1 = window.gwenBridge.onTranscript(({ role, text }) => {
      setLines((prev) => {
        const next = [...prev, { role, text, ts: Date.now() }];
        return next.slice(-MAX_LINES);
      });
    });
    const u2 = window.gwenBridge.onCodeOutput((chunk) => {
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
            <span style={styles.role}>{l.role === "user" ? "you" : "Gwen"}</span>
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
    padding: "0 48px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    pointerEvents: "none",
  },
  // Miles palette: 80% black, red bubbles for user, magenta-tinted for
  // Gwen, cyan tint for code panel. Role labels get the chromatic offset.
  line: {
    fontSize: 13,
    lineHeight: 1.5,
    padding: "8px 14px",
    maxWidth: "70%",
    background: "rgba(17, 17, 17, 0.85)",
    border: "1px solid rgba(237, 28, 36, 0.4)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow: "0 0 14px rgba(237, 28, 36, 0.18), inset 0 0 10px rgba(237, 28, 36, 0.04)",
    clipPath:
      "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)",
    transition: "opacity 0.4s ease",
  },
  user: {
    color: "#ffffff",
    alignSelf: "flex-end",
    background: "rgba(237, 28, 36, 0.14)",
    borderColor: "rgba(237, 28, 36, 0.6)",
    textShadow: "0 0 6px rgba(237, 28, 36, 0.45)",
  },
  assistant: {
    color: "#ffffff",
    alignSelf: "flex-start",
    background: "rgba(233, 30, 99, 0.1)",
    borderColor: "rgba(233, 30, 99, 0.5)",
    textShadow: "0 0 6px rgba(233, 30, 99, 0.5)",
  },
  role: {
    fontSize: 9,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    opacity: 0.85,
    marginRight: 10,
    color: "#ED1C24",
    // Print-misalignment chromatic offset on the labels — most visible
    // place to land the Spider-Verse signature without crowding the text.
    textShadow: "-1px 0 0 #E91E63, 1px 0 0 #00B4D8",
  },
  text: {},
  code: {
    background: "rgba(17, 17, 17, 0.85)",
    border: "1px solid rgba(0, 180, 216, 0.45)",
    color: "#e6f7fb",
    padding: 12,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    borderRadius: 2,
    maxHeight: 150,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    boxShadow: "0 0 16px rgba(0, 180, 216, 0.3), inset 0 0 12px rgba(0, 180, 216, 0.06)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    textShadow: "0 0 4px rgba(0, 180, 216, 0.45)",
  },
};
