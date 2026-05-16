// src/ui/Stage.tsx — center "focus" overlay.
//
// Default (idle/conversing): renders nothing, so App's normal Orb + centered
// Transcript show through.
//
// When Gwen starts doing something with showable content — rewriting her own
// code, reading a PDF, or running any tool — that content takes over the
// CENTER of the screen and the live conversation shrinks into a compact panel
// in the LOWER-RIGHT corner. When the task is done (next time Miles speaks),
// it clears and the conversation returns to center.
import React, { useEffect, useRef, useState } from "react";

const RED = "#ED1C24";
const MAGENTA = "#E91E63";
const CYAN = "#00B4D8";
const GREEN = "#3ddc84";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', monospace";
const CHROMATIC = `-1.5px 0 0 ${MAGENTA}, 1.5px 0 0 ${CYAN}, 0 0 8px rgba(237,28,36,0.6)`;

type Line = { role: string; text: string; ts: number };

export default function Stage() {
  // --- focus inputs -------------------------------------------------------
  const [fixActive, setFixActive] = useState(false);
  const [fixLabel, setFixLabel] = useState("");
  const [codeOut, setCodeOut] = useState("");
  const [codeDiff, setCodeDiff] = useState("");
  const [doc, setDoc] = useState<{ title: string; text: string; pages?: number } | null>(null);
  const [working, setWorking] = useState<{ tool?: string; summary: string } | null>(null);

  // --- corner conversation ------------------------------------------------
  const [lines, setLines] = useState<Line[]>([]);

  const streamRef = useRef<HTMLDivElement | null>(null);
  const convRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const b: any = (window as any).gwenBridge;
    if (!b) return;
    const offs: Array<undefined | (() => void)> = [];

    offs.push(
      b.onSelfFix?.(({ active, label }: { active: boolean; label: string }) => {
        if (active) {
          setCodeOut("");
          setCodeDiff("");
        }
        setFixActive(active);
        if (label) setFixLabel(label);
      })
    );
    offs.push(b.onCodeOutput?.((c: string) => setCodeOut((p) => (p + c).slice(-20000))));
    offs.push(b.onCodeDiff?.((d: string) => setCodeDiff(d)));
    offs.push(
      b.onDoc?.((d: { title: string; text: string; pages?: number }) => setDoc(d))
    );
    offs.push(
      b.onActivity?.((e: { kind: string; tool?: string; summary: string }) => {
        if (e.kind === "tool_start") setWorking({ tool: e.tool, summary: e.summary });
        else if (e.kind === "tool_done" || e.kind === "tool_error") {
          setWorking((w) => (w && w.tool === e.tool ? null : w));
        }
      })
    );

    // A new user turn means the previous task is "done" — drop the doc /
    // working focus so the conversation returns to center. Code focus is
    // left alone (a self-fix relaunches the app on its own).
    const backToConversation = () => {
      setDoc(null);
      setWorking(null);
    };
    offs.push(
      b.onState?.((s: string) => {
        if (s === "listening") backToConversation();
      })
    );
    offs.push(
      b.onTranscript?.(({ role, text }: { role: string; text: string }) => {
        setLines((p) => [...p, { role, text, ts: Date.now() }].slice(-40));
        if (role === "user") backToConversation();
      })
    );

    return () => offs.forEach((o) => o && o());
  }, []);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [codeOut]);
  useEffect(() => {
    const el = convRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // --- pick focus (priority: code > doc > working > idle) -----------------
  const hasCode = fixActive || !!codeOut || !!codeDiff;
  const focus: "code" | "doc" | "working" | "idle" = hasCode
    ? "code"
    : doc
    ? "doc"
    : working
    ? "working"
    : "idle";

  if (focus === "idle") return null; // normal App layout (Orb + Transcript)

  return (
    <div style={styles.overlay}>
      <style>{KEYFRAMES}</style>

      {/* CENTER — whatever Gwen is doing right now */}
      <div style={styles.center}>
        <div style={styles.panel}>
          <div style={styles.scanline} />
          <div style={styles.titleRow}>
            <span style={styles.dot} />
            <span style={styles.title}>{titleFor(focus, { fixLabel, doc, working })}</span>
            {focus !== "doc" && (
              <span style={styles.ticks}>
                <span style={{ ...styles.tick, animationDelay: "0s" }}>.</span>
                <span style={{ ...styles.tick, animationDelay: "0.2s" }}>.</span>
                <span style={{ ...styles.tick, animationDelay: "0.4s" }}>.</span>
              </span>
            )}
          </div>

          {focus === "code" && codeDiff ? (
            <Diff diff={codeDiff} />
          ) : focus === "code" ? (
            <div ref={streamRef} className="gwen-scroll" style={styles.body}>
              {codeOut || "Working on it…"}
            </div>
          ) : focus === "doc" ? (
            <div className="gwen-scroll" style={styles.docBody}>
              {doc!.text}
            </div>
          ) : (
            <div style={styles.workingBody}>
              <div style={styles.spinner} />
              <div style={styles.workingText}>{working!.summary}</div>
            </div>
          )}

          <div style={styles.bTop} />
          <div style={styles.bBot} />
        </div>
      </div>

      {/* LOWER-RIGHT — the conversation, parked out of the way */}
      <div style={styles.corner}>
        <div style={styles.cornerHead}>// CONVERSATION</div>
        <div ref={convRef} className="gwen-scroll" style={styles.cornerBody}>
          {lines.length === 0 ? (
            <div style={styles.cornerEmpty}>…</div>
          ) : (
            lines.map((l, i) => (
              <div key={`${l.ts}-${i}`} style={styles.cLine}>
                <span
                  style={{
                    ...styles.cRole,
                    color: l.role === "user" ? RED : MAGENTA,
                  }}
                >
                  {l.role === "user" ? "you" : "Gwen"}
                </span>
                <span style={styles.cText}>{l.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function titleFor(
  focus: string,
  ctx: { fixLabel: string; doc: any; working: any }
): string {
  if (focus === "code") return (ctx.fixLabel || "rewriting myself").toUpperCase();
  if (focus === "doc")
    return `${ctx.doc.title}${ctx.doc.pages ? `  ·  ${ctx.doc.pages}p` : ""}`;
  return (ctx.working?.summary || "working").toUpperCase();
}

function Diff({ diff }: { diff: string }) {
  return (
    <div className="gwen-scroll" style={styles.diffBox}>
      {diff.split("\n").map((line, i) => {
        let s: React.CSSProperties = styles.dCtx;
        if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff "))
          s = styles.dHdr;
        else if (line.startsWith("@@")) s = styles.dHunk;
        else if (line.startsWith("+")) s = styles.dAdd;
        else if (line.startsWith("-")) s = styles.dDel;
        return (
          <div key={i} style={s}>
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}

const KEYFRAMES = `
@keyframes gwen-stage-in { from { opacity: 0; transform: scale(0.985); } to { opacity: 1; transform: scale(1); } }
@keyframes gwen-pulse { 0%,100% { opacity: 0.9; } 50% { opacity: 0.35; } }
@keyframes gwen-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
@keyframes gwen-tick { 0%,100% { opacity: 0.2; } 50% { opacity: 1; } }
@keyframes gwen-spin { to { transform: rotate(360deg); } }
.gwen-scroll::-webkit-scrollbar { width: 6px; }
.gwen-scroll::-webkit-scrollbar-track { background: rgba(237,28,36,0.05); }
.gwen-scroll::-webkit-scrollbar-thumb { background: rgba(237,28,36,0.4); border-radius: 3px; }
`;

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 90,
    background:
      "radial-gradient(ellipse at center, rgba(8,4,5,0.78) 0%, rgba(6,3,4,0.92) 100%)",
    backdropFilter: "blur(3px)",
    WebkitBackdropFilter: "blur(3px)",
    animation: "gwen-stage-in 260ms ease-out",
    pointerEvents: "auto",
  },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4vh 5vw",
  },
  panel: {
    position: "relative",
    width: "min(1000px, 78vw)",
    maxHeight: "82vh",
    display: "flex",
    flexDirection: "column",
    padding: "16px 22px",
    background:
      "linear-gradient(180deg, rgba(17,17,17,0.96) 0%, rgba(34,8,10,0.96) 100%)",
    border: `1px solid rgba(237,28,36,0.5)`,
    borderRadius: 4,
    overflow: "hidden",
    backdropFilter: "blur(6px)",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flex: "0 0 auto",
    fontSize: 12,
    letterSpacing: "0.28em",
    textTransform: "uppercase",
    fontFamily: MONO,
    color: RED,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: RED,
    boxShadow: `0 0 8px ${RED}`,
    animation: "gwen-pulse 1.2s ease-in-out infinite",
  },
  title: { color: RED, textShadow: CHROMATIC, maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ticks: { display: "inline-flex", width: 18, fontSize: 14 },
  tick: { animation: "gwen-tick 1.2s ease-in-out infinite" },
  body: {
    marginTop: 14,
    overflowY: "auto",
    flex: "1 1 auto",
    fontSize: 12,
    lineHeight: 1.55,
    color: "rgba(255,255,255,0.82)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: MONO,
  },
  docBody: {
    marginTop: 14,
    overflowY: "auto",
    flex: "1 1 auto",
    fontSize: 14,
    lineHeight: 1.7,
    color: "rgba(255,255,255,0.9)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "'Exo 2', 'Rajdhani', system-ui, sans-serif",
    padding: "0 6px",
  },
  workingBody: {
    marginTop: 22,
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  spinner: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: `2px solid rgba(237,28,36,0.25)`,
    borderTopColor: RED,
    animation: "gwen-spin 0.8s linear infinite",
  },
  workingText: {
    fontSize: 15,
    color: "#fff",
    fontFamily: MONO,
    letterSpacing: "0.04em",
  },
  diffBox: {
    marginTop: 14,
    overflow: "auto",
    flex: "1 1 auto",
    fontSize: 12,
    lineHeight: 1.45,
    fontFamily: MONO,
    whiteSpace: "pre",
  },
  dHdr: { color: "rgba(255,255,255,0.5)" },
  dHunk: { color: CYAN },
  dAdd: { color: GREEN, background: "rgba(61,220,132,0.08)" },
  dDel: { color: RED, background: "rgba(237,28,36,0.08)" },
  dCtx: { color: "rgba(255,255,255,0.62)" },
  scanline: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "30%",
    background:
      "linear-gradient(90deg, transparent 0%, rgba(237,28,36,0.16) 50%, transparent 100%)",
    animation: "gwen-scan 2.6s linear infinite",
    pointerEvents: "none",
  },
  bTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background: `linear-gradient(90deg, transparent, ${RED}, transparent)`,
    boxShadow: `0 0 8px ${RED}`,
  },
  bBot: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    background: `linear-gradient(90deg, transparent, ${RED}, transparent)`,
    boxShadow: `0 0 8px ${RED}`,
  },
  corner: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: "min(360px, 30vw)",
    maxHeight: "42vh",
    display: "flex",
    flexDirection: "column",
    background: "rgba(17,17,17,0.9)",
    border: `1px solid rgba(233,30,99,0.45)`,
    borderRadius: 4,
    boxShadow: "0 0 18px rgba(0,0,0,0.5)",
    overflow: "hidden",
  },
  cornerHead: {
    padding: "8px 12px",
    borderBottom: `1px solid rgba(233,30,99,0.35)`,
    fontSize: 9,
    letterSpacing: "0.32em",
    color: MAGENTA,
    fontFamily: MONO,
    textShadow: CHROMATIC,
  },
  cornerBody: {
    padding: "10px 12px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cornerEmpty: { color: "rgba(255,255,255,0.4)", fontSize: 11, textAlign: "center" },
  cLine: { fontSize: 11.5, lineHeight: 1.45, color: "#fff" },
  cRole: {
    fontSize: 8,
    letterSpacing: "0.25em",
    textTransform: "uppercase",
    marginRight: 8,
    fontFamily: MONO,
  },
  cText: {},
};
