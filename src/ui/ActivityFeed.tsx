// src/ui/ActivityFeed.tsx — right column (1/5 of screen).
// Live append-only event stream so Miles can see exactly what Gwen is doing
// right now: tool calls, file reads, app launches.
// Newest at top, fades older entries.
import React, { useEffect, useRef, useState } from "react";
import { RED, CHROMATIC_TEXT_SHADOW, MAGENTA } from "./theme.js";

type ActivityEvent = {
  kind: "tool_start" | "tool_done" | "tool_error" | "info";
  tool?: string;
  summary: string;
  detail?: string;
  ts: number;
};

const MAX_EVENTS = 80;

function timeOf(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function colorFor(kind: ActivityEvent["kind"]) {
  if (kind === "tool_error") return RED;
  if (kind === "tool_start") return MAGENTA;
  return RED;
}

function badgeFor(kind: ActivityEvent["kind"]): string {
  if (kind === "tool_start") return "RUN";
  if (kind === "tool_done")  return "OK";
  if (kind === "tool_error") return "ERR";
  return "INFO";
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bridge = (window as any).gwenBridge;
    if (!bridge) return;

    const u1 = bridge.onActivity?.((e: ActivityEvent) => {
      setEvents((prev) => [e, ...prev].slice(0, MAX_EVENTS));
    });

    return () => {
      u1 && u1();
    };
  }, []);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>// LIVE ACTIVITY</span>
        <span style={styles.headerDot} />
      </div>

      <div ref={containerRef} className="gwen-activity-body" style={styles.body}>
        <style>{`
          @keyframes gwen-activity-in {
            from { opacity: 0; transform: translateX(8px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          .gwen-activity-body::-webkit-scrollbar { width: 6px; }
          .gwen-activity-body::-webkit-scrollbar-track { background: rgba(237, 28, 36, 0.05); }
          .gwen-activity-body::-webkit-scrollbar-thumb { background: rgba(237, 28, 36, 0.4); border-radius: 3px; }
        `}</style>

        {events.length === 0 ? (
          <div style={styles.empty}>Idle. Waiting for Gwen to do something.</div>
        ) : (
          events.map((e, i) => {
            // Newest 6 stay full opacity; older entries dim gracefully.
            const opacity = i < 6 ? 1 : Math.max(0.45, 1 - (i - 6) * 0.04);
            const c = colorFor(e.kind);
            return (
              <div
                key={`${e.ts}-${i}`}
                style={{
                  ...styles.event,
                  borderColor: `${c}70`,
                  background: `${c}10`,
                  opacity,
                  animation: i === 0 ? "gwen-activity-in 280ms ease-out" : undefined,
                }}
              >
                <div style={styles.eventHead}>
                  <span style={{ ...styles.badge, color: c, borderColor: c }}>
                    {badgeFor(e.kind)}
                  </span>
                  <span style={styles.eventTime}>{timeOf(e.ts)}</span>
                </div>
                <div style={styles.eventSummary}>{e.summary}</div>
                {e.detail && <div style={styles.eventDetail}>{e.detail}</div>}
              </div>
            );
          })
        )}
      </div>

      <div style={styles.footer}>GWEN // STREAM</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    height: "100%",
    width: "100%",
    background: "rgba(17, 17, 17, 0.78)",
    borderLeft: `1px solid rgba(237, 28, 36, 0.4)`,
    boxShadow: "inset 10px 0 24px rgba(237, 28, 36, 0.06)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    pointerEvents: "auto",
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
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: RED,
    boxShadow: `0 0 8px ${RED}`,
    animation: "gwen-pulse 1.6s ease-in-out infinite",
  },
  body: {
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flex: 1,
  },
  empty: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    padding: "16px 8px",
    letterSpacing: "0.1em",
    lineHeight: 1.5,
  },
  event: {
    padding: "6px 10px",
    border: "1px solid",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  eventHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  badge: {
    fontSize: 8,
    padding: "1px 5px",
    border: "1px solid",
    letterSpacing: "0.2em",
  },
  eventTime: {
    fontSize: 9,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: "0.1em",
  },
  eventSummary: {
    fontSize: 11,
    color: "#ffffff",
    lineHeight: 1.4,
    wordBreak: "break-word",
  },
  eventDetail: {
    fontSize: 10,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 1.35,
    marginTop: 3,
    wordBreak: "break-word",
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
