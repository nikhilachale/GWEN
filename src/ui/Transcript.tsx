// src/ui/Transcript.tsx — live conversation feed
import React, { useEffect, useState, useRef } from "react";

const MAX_LINES = 50;
// If the user scrolls up by more than this many pixels from the bottom,
// stop auto-scrolling so they can read history without being yanked back.
const STICK_THRESHOLD = 40;

export default function Transcript() {
  const [lines, setLines] = useState([]);
  const [codeOutput, setCodeOutput] = useState("");
  const containerRef = useRef(null);
  const stickToBottomRef = useRef(true);

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

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < STICK_THRESHOLD;
  };

  useEffect(() => {
    if (!containerRef.current) return;
    if (stickToBottomRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, codeOutput]);

  return (
    <div ref={containerRef} onScroll={handleScroll} className="gwen-transcript" style={styles.wrap}>
      <style>{`
        @keyframes gwen-line-enter {
          from { transform: translateY(8px) scale(0.98); }
          to   { transform: translateY(0) scale(1); }
        }
        @keyframes gwen-code-enter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* Faint cyan scrollbar so it reads as part of the HUD */
        .gwen-transcript::-webkit-scrollbar { width: 6px; }
        .gwen-transcript::-webkit-scrollbar-track { background: rgba(237, 28, 36, 0.05); }
        .gwen-transcript::-webkit-scrollbar-thumb {
          background: rgba(237, 28, 36, 0.4);
          border-radius: 3px;
        }
        .gwen-transcript::-webkit-scrollbar-thumb:hover {
          background: rgba(237, 28, 36, 0.7);
        }
      `}</style>
      <div className="gwen-transcript-inner">
        {lines.map((l, i) => {
          // Newest 8 lines stay full opacity; older lines fade gently so the
          // scrollback reads as historical without becoming illegible.
          const ageFromTop = lines.length - i;
          const opacity = ageFromTop <= 8 ? 1 : Math.max(0.5, 1 - (ageFromTop - 8) * 0.04);
          return (
            <div
              key={`${l.ts}-${i}`}
              style={{
                ...styles.line,
                ...(l.role === "user" ? styles.user : styles.assistant),
                opacity,
                animation: "gwen-line-enter 400ms ease-out",
              }}
            >
              <span style={styles.role}>{l.role === "user" ? "you" : "Gwen"}</span>
              <span style={styles.text}>{l.text}</span>
            </div>
          );
        })}
        {codeOutput && (
          <pre style={{ ...styles.code, animation: "gwen-code-enter 450ms ease-out" }}>{codeOutput}</pre>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: "absolute",
    bottom: 80,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 720,
    maxHeight: "40vh",
    overflowY: "auto",
    padding: "0 24px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    // Pointer events ON so the user can scroll. Individual lines remain
    // non-interactive (just text), but the container needs to receive
    // wheel/touch events.
    pointerEvents: "auto",
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
