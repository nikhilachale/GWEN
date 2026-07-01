// src/ui/SelfFixOverlay.tsx — shown while Gwen modifies her own code
// (fix_self_code) or rebuilds herself (repair_self). Renders the live
// coding-agent stdout stream and, once the fix lands, the unified git diff
// so Miles can watch exactly what changed before the relaunch.
import React, { useEffect, useRef, useState } from "react";

export default function SelfFixOverlay() {
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState("");
  const [output, setOutput] = useState("");
  const [diff, setDiff] = useState("");
  const streamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bridge = window.gwenBridge;
    if (!bridge) return;

    const offFix = bridge.onSelfFix(({ active, label }) => {
      if (active) {
        // New run — clear the previous transcript/diff.
        setOutput("");
        setDiff("");
      }
      setActive(active);
      if (label) setLabel(label);
    });
    const offOut = bridge.onCodeOutput?.((chunk) => {
      setOutput((prev) => (prev + chunk).slice(-20000));
    });
    const offDiff = bridge.onCodeDiff?.((d) => setDiff(d));

    return () => {
      offFix && offFix();
      offOut && offOut();
      offDiff && offDiff();
    };
  }, []);

  // Auto-scroll the live stream to the newest output.
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);

  // selfFix.ts fires sendSelfFix(false) the instant the fix returns — ~8s
  // before the relaunch. Keep the panel up as long as there's a diff or
  // streamed output so Miles actually sees the change in that window.
  const visible = active || !!output || !!diff;
  if (!visible) return null;

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={styles.panel}>
        <div style={styles.scanline} />

        <div style={styles.row}>
          <span style={styles.dot} />
          <span style={styles.label}>{label || "rewriting myself"}</span>
          {active && (
            <span style={styles.dots}>
              <span style={{ ...styles.tick, animationDelay: "0s" }}>.</span>
              <span style={{ ...styles.tick, animationDelay: "0.2s" }}>.</span>
              <span style={{ ...styles.tick, animationDelay: "0.4s" }}>.</span>
            </span>
          )}
        </div>

        {diff ? (
          <DiffView diff={diff} />
        ) : output ? (
          <div ref={streamRef} className="gwen-fix-stream" style={styles.stream}>
            {output}
          </div>
        ) : null}

        <div style={styles.borderTop} />
        <div style={styles.borderBottom} />
      </div>
    </>
  );
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <div className="gwen-fix-stream" style={styles.diffBox}>
      {lines.map((line, i) => {
        let style: React.CSSProperties = styles.diffCtx;
        if (line.startsWith("+++") || line.startsWith("---")) style = styles.diffHdr;
        else if (line.startsWith("@@")) style = styles.diffHunk;
        else if (line.startsWith("diff ")) style = styles.diffHdr;
        else if (line.startsWith("+")) style = styles.diffAdd;
        else if (line.startsWith("-")) style = styles.diffDel;
        return (
          <div key={i} style={style}>
            {line || " "}
          </div>
        );
      })}
    </div>
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
.gwen-fix-stream::-webkit-scrollbar { width: 6px; }
.gwen-fix-stream::-webkit-scrollbar-track { background: rgba(237, 28, 36, 0.05); }
.gwen-fix-stream::-webkit-scrollbar-thumb { background: rgba(237, 28, 36, 0.4); border-radius: 3px; }
`;

const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', monospace";

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(900px, 72vw)",
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    padding: "14px 20px",
    background:
      "linear-gradient(180deg, rgba(17,17,17,0.96) 0%, rgba(38,8,10,0.96) 100%)",
    border: "1px solid rgba(237, 28, 36, 0.5)",
    borderRadius: 4,
    color: "#ED1C24",
    fontFamily: MONO,
    overflow: "hidden",
    zIndex: 100,
    pointerEvents: "auto",
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
    fontSize: 12,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    flex: "0 0 auto",
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
    textShadow:
      "-1.5px 0 0 #E91E63, 1.5px 0 0 #00B4D8, 0 0 8px rgba(237, 28, 36, 0.7)",
  },
  dots: { display: "inline-flex", width: 18, fontSize: 14, letterSpacing: 1 },
  tick: { animation: "gwen-tick 1.2s ease-in-out infinite" },
  stream: {
    marginTop: 12,
    overflowY: "auto",
    flex: "1 1 auto",
    fontSize: 11,
    lineHeight: 1.5,
    color: "rgba(255,255,255,0.8)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: MONO,
    textTransform: "none",
    letterSpacing: 0,
  },
  diffBox: {
    marginTop: 12,
    overflowY: "auto",
    flex: "1 1 auto",
    fontSize: 11,
    lineHeight: 1.45,
    fontFamily: MONO,
    textTransform: "none",
    letterSpacing: 0,
    whiteSpace: "pre",
  },
  diffHdr: { color: "rgba(255,255,255,0.55)" },
  diffHunk: { color: "#00B4D8" },
  diffAdd: { color: "#3ddc84", background: "rgba(61,220,132,0.08)" },
  diffDel: { color: "#ED1C24", background: "rgba(237,28,36,0.08)" },
  diffCtx: { color: "rgba(255,255,255,0.65)" },
  scanline: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "30%",
    background:
      "linear-gradient(90deg, transparent 0%, rgba(237, 28, 36, 0.18) 50%, transparent 100%)",
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
