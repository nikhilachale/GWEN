import React, { useEffect, useState } from "react";
import { CHROMATIC_TEXT_SHADOW, CYAN, MAGENTA, RED } from "./theme.js";

type HealthStatus = "ok" | "warn" | "missing";

type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
};

type HealthSection = {
  id: string;
  title: string;
  checks: HealthCheck[];
};

type HealthSnapshot = {
  generatedAt: string;
  overall: HealthStatus;
  sections: HealthSection[];
};

export default function HealthPanel({ onClose }: { onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await window.gwenBridge?.getHealthSnapshot?.();
      if (next) setSnapshot(next);
      else setError("Health bridge unavailable");
    } catch (err: any) {
      setError(err?.message || "Health check failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <span style={styles.title}>// HEALTH</span>
          {snapshot && <span style={{ ...styles.overall, color: statusColor(snapshot.overall) }}>{snapshot.overall}</span>}
        </div>
        <div style={styles.actions}>
          <button style={styles.action} onClick={load} disabled={loading}>
            {loading ? "..." : "Refresh"}
          </button>
          <button style={styles.close} onClick={onClose}>
            X
          </button>
        </div>
      </div>

      <div style={styles.body}>
        {error && <div style={styles.error}>{error}</div>}
        {loading && !snapshot && <div style={styles.empty}>Collecting snapshot...</div>}
        {snapshot && (
          <>
            <div style={styles.timestamp}>Generated {new Date(snapshot.generatedAt).toLocaleString()}</div>
            {snapshot.sections.map((section) => (
              <section key={section.id} style={styles.section}>
                <div style={styles.sectionTitle}>{section.title}</div>
                <div style={styles.checks}>
                  {section.checks.map((check) => (
                    <div key={check.id} style={styles.check}>
                      <div style={{ ...styles.statusDot, background: statusColor(check.status) }} />
                      <div style={styles.checkText}>
                        <div style={styles.checkLabel}>{check.label}</div>
                        <div style={styles.detail}>{check.detail}</div>
                      </div>
                      <div style={{ ...styles.badge, color: statusColor(check.status), borderColor: statusColor(check.status) }}>
                        {check.status}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function statusColor(status: HealthStatus) {
  if (status === "ok") return "#37f2a4";
  if (status === "warn") return "#ffd166";
  return RED;
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    left: 24,
    top: 24,
    width: 430,
    maxHeight: "calc(100vh - 48px)",
    background: "rgba(7, 7, 10, 0.94)",
    border: "1px solid rgba(0, 180, 216, 0.5)",
    boxShadow: "0 0 24px rgba(0, 180, 216, 0.16)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    zIndex: 20,
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderBottom: "1px solid rgba(0, 180, 216, 0.32)",
  },
  title: {
    fontSize: 11,
    letterSpacing: "0.28em",
    color: CYAN,
    textShadow: CHROMATIC_TEXT_SHADOW,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  overall: {
    marginLeft: 10,
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  actions: {
    display: "flex",
    gap: 8,
  },
  action: {
    height: 24,
    border: "1px solid rgba(0, 180, 216, 0.45)",
    color: "#fff",
    background: "transparent",
    cursor: "pointer",
    fontSize: 10,
    letterSpacing: "0.12em",
  },
  close: {
    width: 26,
    height: 24,
    color: "#fff",
    background: "transparent",
    border: "1px solid rgba(237, 28, 36, 0.45)",
    cursor: "pointer",
  },
  body: {
    overflowY: "auto",
    padding: 14,
  },
  timestamp: {
    color: "rgba(255,255,255,0.56)",
    fontSize: 11,
    marginBottom: 14,
  },
  error: {
    color: RED,
    fontSize: 12,
    marginBottom: 12,
  },
  empty: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  section: {
    display: "grid",
    gap: 9,
    paddingBottom: 15,
    marginBottom: 14,
    borderBottom: "1px solid rgba(0, 180, 216, 0.22)",
  },
  sectionTitle: {
    color: MAGENTA,
    fontSize: 10,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  checks: {
    display: "grid",
    gap: 8,
  },
  check: {
    display: "grid",
    gridTemplateColumns: "10px 1fr auto",
    alignItems: "start",
    gap: 10,
    minWidth: 0,
    padding: "8px 0",
  },
  statusDot: {
    width: 8,
    height: 8,
    marginTop: 4,
    borderRadius: 999,
    boxShadow: "0 0 10px currentColor",
  },
  checkText: {
    minWidth: 0,
  },
  checkLabel: {
    color: "#fff",
    fontSize: 12,
    letterSpacing: "0.04em",
  },
  detail: {
    marginTop: 3,
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    lineHeight: 1.35,
    overflowWrap: "anywhere",
  },
  badge: {
    border: "1px solid",
    padding: "2px 6px",
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
};
