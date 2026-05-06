// src/ui/ContextPanel.tsx — right-side glass panel that shows structured
// tool output (tasks today, eventually calendar / email / notes too).
import React, { useEffect, useRef, useState } from "react";
import { RED, CHROMATIC_TEXT_SHADOW, MAGENTA } from "./theme.js";

type Task = {
  id?: number | string;
  text: string;
  due?: string | null;
  done?: boolean;
};

type ContextPayload =
  | { type: "tasks"; data: Task[] }
  | { type: null; data: null };

// How long the panel stays visible after the last update before auto-hiding.
const AUTO_HIDE_MS = 45_000;

function formatDue(due?: string | null) {
  if (!due) return null;
  try {
    const d = new Date(due);
    if (Number.isNaN(d.getTime())) return due;
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return `TODAY ${time}`;
    const day = d.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${day.toUpperCase()} ${time}`;
  } catch {
    return due;
  }
}

export default function ContextPanel() {
  const [payload, setPayload] = useState<ContextPayload>({ type: null, data: null });
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!window.gwenBridge?.onContextPanel) return;
    const unsub = window.gwenBridge.onContextPanel((p: ContextPayload) => {
      setPayload(p);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (p && p.type) {
        hideTimerRef.current = setTimeout(() => {
          setPayload({ type: null, data: null });
        }, AUTO_HIDE_MS);
      }
    });
    return () => {
      unsub && unsub();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const visible = payload.type === "tasks";
  const tasks = payload.type === "tasks" ? (payload.data || []) : [];

  return (
    <div
      style={{
        ...styles.wrap,
        transform: visible ? "translateX(0)" : "translateX(110%)",
        opacity: visible ? 1 : 0,
      }}
    >
      <div style={styles.header}>
        <span style={styles.headerLabel}>// TASKS</span>
        <span style={styles.headerCount}>{tasks.length.toString().padStart(2, "0")}</span>
      </div>

      <div style={styles.body}>
        {tasks.length === 0 ? (
          <div style={styles.empty}>No open tasks.</div>
        ) : (
          tasks.map((t, i) => {
            const dueLabel = formatDue(t.due);
            const overdue =
              !!t.due && !t.done && new Date(t.due).getTime() < Date.now();
            return (
              <div
                key={`${t.id ?? i}-${i}`}
                style={{
                  ...styles.row,
                  animationDelay: `${i * 40}ms`,
                  borderColor: overdue ? RED : "rgba(237, 28, 36, 0.3)",
                }}
              >
                <span style={styles.checkbox}>
                  <span style={{ ...styles.checkboxInner, opacity: t.done ? 1 : 0 }} />
                </span>
                <div style={styles.taskBody}>
                  <div style={styles.taskText}>{t.text}</div>
                  {dueLabel && (
                    <div
                      style={{
                        ...styles.taskDue,
                        color: overdue ? RED : MAGENTA,
                      }}
                    >
                      {overdue ? "OVERDUE · " : ""}
                      {dueLabel}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={styles.footer}>GWEN // CONTEXT</div>

      <style>{`
        @keyframes gwen-task-row-in {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    top: 80,
    right: 24,
    width: 320,
    maxHeight: "70vh",
    background: "rgba(17, 17, 17, 0.88)",
    border: `1px solid ${RED}`,
    boxShadow:
      "0 0 24px rgba(237, 28, 36, 0.35), inset 0 0 16px rgba(237, 28, 36, 0.06)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    clipPath:
      "polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)",
    transition: "transform 350ms ease-out, opacity 250ms ease-out",
    pointerEvents: "auto",
    zIndex: 6,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "12px 16px 10px",
    borderBottom: `1px solid rgba(237, 28, 36, 0.35)`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLabel: {
    fontSize: 11,
    letterSpacing: "0.35em",
    color: RED,
    textShadow: CHROMATIC_TEXT_SHADOW,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  headerCount: {
    fontSize: 18,
    color: "#ffffff",
    letterSpacing: "0.15em",
    textShadow: CHROMATIC_TEXT_SHADOW,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  body: {
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flex: 1,
  },
  empty: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
    padding: "16px 0",
    letterSpacing: "0.1em",
  },
  row: {
    display: "flex",
    gap: 10,
    padding: "8px 10px",
    background: "rgba(237, 28, 36, 0.06)",
    border: "1px solid rgba(237, 28, 36, 0.3)",
    animation: "gwen-task-row-in 320ms ease-out backwards",
  },
  checkbox: {
    width: 14,
    height: 14,
    border: `1.5px solid ${RED}`,
    flexShrink: 0,
    marginTop: 2,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxInner: {
    width: 8,
    height: 8,
    background: RED,
    boxShadow: `0 0 4px ${RED}`,
  },
  taskBody: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  taskText: {
    fontSize: 13,
    color: "#ffffff",
    lineHeight: 1.3,
    wordBreak: "break-word",
  },
  taskDue: {
    fontSize: 9,
    letterSpacing: "0.2em",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  footer: {
    padding: "8px 16px 10px",
    borderTop: `1px solid rgba(237, 28, 36, 0.3)`,
    fontSize: 9,
    letterSpacing: "0.35em",
    color: "rgba(237, 28, 36, 0.7)",
    textAlign: "right",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
};
