// src/ui/LeftPanel.tsx — left column (1/5 of screen).
// Top half: open tasks. Bottom half: pending fixes Miles asked Gwen to remember
// (feature_request + fixes categories from SQLite memory).
import React, { useEffect, useState } from "react";
import { RED, CHROMATIC_TEXT_SHADOW, MAGENTA } from "./theme.js";

type Task = { id?: number | string; text: string; due?: string | null; done?: boolean };
type Fix = { id: string; text: string; source: string };

const REFRESH_MS = 30_000;

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
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase()} ${time}`;
  } catch {
    return due;
  }
}

export default function LeftPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fixes, setFixes] = useState<Fix[]>([]);

  useEffect(() => {
    const bridge = (window as any).gwenBridge;
    if (!bridge) return;

    // Initial load
    bridge.getTasks?.().then((t: Task[]) => setTasks(t || []));
    bridge.getFixes?.().then((f: Fix[]) => setFixes(f || []));

    // Subscribe to live task updates (broadcast from brain after task edits)
    const unsub = bridge.onContextPanel?.((p: any) => {
      if (p?.type === "tasks" && Array.isArray(p.data)) setTasks(p.data);
    });

    // Refresh fixes periodically — they only change when memory writes happen,
    // and we don't have a dedicated broadcast for that. Cheap query.
    const id = setInterval(() => {
      bridge.getFixes?.().then((f: Fix[]) => setFixes(f || []));
    }, REFRESH_MS);

    return () => {
      unsub && unsub();
      clearInterval(id);
    };
  }, []);

  return (
    <div style={styles.wrap}>
      <Section
        label="// TASKS"
        count={tasks.length}
        emptyText="No open tasks."
      >
        {tasks.map((t, i) => {
          const dueLabel = formatDue(t.due);
          const overdue = !!t.due && !t.done && new Date(t.due).getTime() < Date.now();
          return (
            <div
              key={`${t.id ?? i}-${i}`}
              style={{
                ...styles.row,
                borderColor: overdue ? RED : "rgba(237, 28, 36, 0.3)",
              }}
            >
              <span style={styles.bullet}>
                <span style={{ ...styles.bulletInner, opacity: t.done ? 1 : 0 }} />
              </span>
              <div style={styles.rowBody}>
                <div style={styles.rowText}>{t.text}</div>
                {dueLabel && (
                  <div
                    style={{
                      ...styles.rowMeta,
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
        })}
      </Section>

      <div style={styles.divider} />

      <Section
        label="// FIXES"
        count={fixes.length}
        emptyText="Nothing pending."
      >
        {fixes.map((f, i) => (
          <div key={f.id} style={styles.row}>
            <span style={styles.indexNum}>{String(i + 1).padStart(2, "0")}</span>
            <div style={styles.rowBody}>
              <div style={styles.rowText}>{f.text}</div>
              <div style={{ ...styles.rowMeta, color: MAGENTA }}>
                {f.source.replace("_", " ").toUpperCase()}
              </div>
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({
  label,
  count,
  emptyText,
  children,
}: {
  label: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  const empty = count === 0;
  return (
    <div style={styles.section}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>{label}</span>
        <span style={styles.headerCount}>{count.toString().padStart(2, "0")}</span>
      </div>
      <div style={styles.body}>
        {empty ? <div style={styles.empty}>{emptyText}</div> : children}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    height: "100%",
    width: "100%",
    background: "rgba(17, 17, 17, 0.78)",
    borderRight: `1px solid rgba(237, 28, 36, 0.4)`,
    boxShadow: "inset -10px 0 24px rgba(237, 28, 36, 0.06)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    pointerEvents: "auto",
  },
  section: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "14px 16px 10px",
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
    fontSize: 16,
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
    color: "rgba(255, 255, 255, 0.55)",
    textAlign: "center",
    padding: "16px 0",
    letterSpacing: "0.1em",
  },
  divider: {
    height: 1,
    background: "rgba(237, 28, 36, 0.4)",
    margin: "0 12px",
    boxShadow: "0 0 6px rgba(237, 28, 36, 0.3)",
  },
  row: {
    display: "flex",
    gap: 10,
    padding: "8px 10px",
    background: "rgba(237, 28, 36, 0.06)",
    border: "1px solid rgba(237, 28, 36, 0.3)",
  },
  bullet: {
    width: 12,
    height: 12,
    border: `1.5px solid ${RED}`,
    flexShrink: 0,
    marginTop: 3,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  bulletInner: {
    width: 6,
    height: 6,
    background: RED,
    boxShadow: `0 0 4px ${RED}`,
  },
  indexNum: {
    fontSize: 10,
    color: RED,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    letterSpacing: "0.1em",
    flexShrink: 0,
    width: 18,
    marginTop: 2,
  },
  rowBody: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 },
  rowText: { fontSize: 12, color: "#ffffff", lineHeight: 1.35, wordBreak: "break-word" },
  rowMeta: {
    fontSize: 9,
    letterSpacing: "0.2em",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
};
