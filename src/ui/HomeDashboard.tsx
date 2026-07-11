import React, { useEffect, useMemo, useState } from "react";
import { CHROMATIC_TEXT_SHADOW, CYAN, MAGENTA, RED } from "./theme.js";

type Task = { id?: string | number; text: string; due?: string | null; done?: boolean };
type Conversation = { id: string; title: string; updatedAt: number; count: number; active?: boolean };
type DashboardData = {
  generatedAt: string;
  today: { label: string; date: string; partOfDay: string };
  tasks: { open: Task[]; dueToday: Task[]; overdue: Task[] };
  recentChats: Conversation[];
  model: {
    state: string;
    provider: string;
    model: string;
    discussionModel: string;
    smartModel: string;
    localModel: string;
    tools: string;
  };
  usage: {
    todayUsd: number;
    monthUsd: number;
    allTimeUsd: number;
    todayCalls: number;
    monthCalls: number;
    allTimeCalls: number;
    dailyBudgetUsd: number;
    monthlyBudgetUsd: number;
    dailyRemainingUsd: number | null;
    monthlyRemainingUsd: number | null;
    dailyPercentUsed: number | null;
    monthlyPercentUsed: number | null;
    providers: Array<{
      provider: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      estimatedUsd: number;
      lastUsedAt: string | null;
    }>;
  };
  health: Array<{ id: string; label: string; status: "ok" | "warn" | "placeholder"; detail: string }>;
};

const REFRESH_MS = 30_000;

function formatDue(due?: string | null) {
  if (!due) return "NO DUE";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return due.toUpperCase();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toUpperCase();
}

function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "NOW";
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase();
}

function statusColor(status: "ok" | "warn" | "placeholder") {
  if (status === "ok") return CYAN;
  if (status === "warn") return RED;
  return MAGENTA;
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "NOT SET";
  if (value === 0) return "$0.00";
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function compactNumber(value: number) {
  return Intl.NumberFormat([], { notation: "compact", maximumFractionDigits: 1 }).format(value || 0).toUpperCase();
}

function percentText(value: number | null) {
  return value === null ? "NO LIMIT" : `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export default function HomeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [state, setState] = useState("idle");
  const [bridgeMissing, setBridgeMissing] = useState(false);

  const refresh = () => {
    if (!window.gwenBridge?.getHomeDashboard) {
      setBridgeMissing(true);
      return;
    }
    window.gwenBridge.getHomeDashboard().then((next) => {
      if (next) setData(next);
    });
  };

  useEffect(() => {
    refresh();
    window.gwenBridge?.getState?.().then((next) => next && setState(next));
    const refreshId = setInterval(refresh, REFRESH_MS);
    const unState = window.gwenBridge?.onState?.((next) => {
      setState(next);
      refresh();
    });
    const unConversation = window.gwenBridge?.onConversation?.(() => refresh());
    const unContext = window.gwenBridge?.onContextPanel?.((payload: any) => {
      if (payload?.type === "tasks") refresh();
    });
    return () => {
      clearInterval(refreshId);
      unState && unState();
      unConversation && unConversation();
      unContext && unContext();
    };
  }, []);

  const topTasks = useMemo(() => {
    const today = data?.tasks.dueToday || [];
    const open = data?.tasks.open || [];
    const seen = new Set<string>();
    return [...today, ...open]
      .filter((task) => {
        const key = String(task.id ?? task.text);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  }, [data]);

  if (!data) {
    return (
      <section style={styles.wrap}>
        <div style={styles.loading}>
          {bridgeMissing ? "Open Gwen desktop for live dashboard." : "Loading dashboard..."}
        </div>
      </section>
    );
  }

  return (
    <section style={styles.wrap} aria-label="Home dashboard">
      <div style={styles.header}>
        <div>
          <div style={styles.kicker}>// HOME</div>
          <div style={styles.title}>{data.today.label}</div>
          <div style={styles.subTitle}>{data.today.date} · {data.today.partOfDay}</div>
        </div>
        <div style={styles.stateBadge}>
          <span style={styles.pulse} />
          {state.toUpperCase()}
        </div>
      </div>

      <div style={styles.metrics}>
        <Metric label="Today" value={data.tasks.dueToday.length} tone={CYAN} />
        <Metric label="Open" value={data.tasks.open.length} tone={RED} />
        <Metric label="Overdue" value={data.tasks.overdue.length} tone={data.tasks.overdue.length ? RED : MAGENTA} />
      </div>

      <div style={styles.grid}>
        <Panel title="// TODAY" meta={`${topTasks.length} TASKS`}>
          {topTasks.length === 0 ? (
            <div style={styles.empty}>No open tasks for now.</div>
          ) : (
            topTasks.map((task, index) => (
              <div key={`${task.id ?? task.text}-${index}`} style={styles.taskRow}>
                <span style={styles.taskIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span style={styles.taskText}>{task.text}</span>
                <span style={styles.taskDue}>{formatDue(task.due)}</span>
              </div>
            ))
          )}
        </Panel>

        <Panel title="// RECENT CHATS" meta={`${data.recentChats.length} LOGS`}>
          {data.recentChats.length === 0 ? (
            <div style={styles.empty}>No saved conversations yet.</div>
          ) : (
            data.recentChats.map((chat) => (
              <div key={chat.id} style={styles.chatRow}>
                <span style={styles.chatTitle}>{chat.title}</span>
                <span style={styles.chatMeta}>{timeAgo(chat.updatedAt)} · {chat.count} MSG</span>
              </div>
            ))
          )}
        </Panel>

        <Panel title="// MODEL" meta={data.model.tools.toUpperCase()}>
          <div style={styles.modelLine}>
            <span style={styles.modelLabel}>{data.model.provider}</span>
            <span style={styles.modelValue}>{data.model.model}</span>
          </div>
          <div style={styles.modelSmall}>SMART {data.model.smartModel}</div>
          <div style={styles.modelSmall}>LOCAL {data.model.localModel}</div>
        </Panel>

        <Panel title="// API CREDITS" meta={`${data.usage.monthCalls} CALLS`}>
          <div style={styles.usageGrid}>
            <UsageMetric label="Today used" value={money(data.usage.todayUsd)} detail={percentText(data.usage.dailyPercentUsed)} />
            <UsageMetric label="Today balance" value={money(data.usage.dailyRemainingUsd)} detail={money(data.usage.dailyBudgetUsd)} />
            <UsageMetric label="Month used" value={money(data.usage.monthUsd)} detail={percentText(data.usage.monthlyPercentUsed)} />
            <UsageMetric label="Month balance" value={money(data.usage.monthlyRemainingUsd)} detail={money(data.usage.monthlyBudgetUsd)} />
          </div>
          <div style={styles.providerList}>
            {data.usage.providers.length === 0 ? (
              <div style={styles.empty}>No API usage logged yet.</div>
            ) : (
              data.usage.providers.slice(0, 3).map((provider) => (
                <div key={provider.provider} style={styles.providerRow}>
                  <span style={styles.providerName}>{provider.provider}</span>
                  <span style={styles.providerMeta}>
                    {money(provider.estimatedUsd)} · {provider.calls} CALLS · {compactNumber(provider.inputTokens + provider.outputTokens)} TOK
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title="// HEALTH" meta="PLACEHOLDERS">
          {data.health.map((item) => (
            <div key={item.id} style={styles.healthRow}>
              <span style={{ ...styles.healthDot, background: statusColor(item.status), boxShadow: `0 0 8px ${statusColor(item.status)}` }} />
              <span style={styles.healthText}>{item.label}</span>
              <span style={styles.healthDetail}>{item.detail}</span>
            </div>
          ))}
        </Panel>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ ...styles.metric, borderColor: `${tone}80`, background: `${tone}12` }}>
      <span style={{ ...styles.metricValue, color: tone }}>{value.toString().padStart(2, "0")}</span>
      <span style={styles.metricLabel}>{label}</span>
    </div>
  );
}

function UsageMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={styles.usageMetric}>
      <span style={styles.usageLabel}>{label}</span>
      <span style={styles.usageValue}>{value}</span>
      <span style={styles.usageDetail}>{detail}</span>
    </div>
  );
}

function Panel({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelHead}>
        <span style={styles.panelTitle}>{title}</span>
        <span style={styles.panelMeta}>{meta}</span>
      </div>
      <div style={styles.panelBody}>{children}</div>
    </div>
  );
}

const mono = "'JetBrains Mono', ui-monospace, monospace";

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    width: "min(820px, calc(100% - 56px))",
    maxHeight: "min(560px, calc(100vh - 150px))",
    marginTop: -10,
    marginBottom: 0,
    padding: 13,
    border: "1px solid rgba(237, 28, 36, 0.45)",
    background: "rgba(7, 7, 10, 0.72)",
    boxShadow: "0 0 28px rgba(237, 28, 36, 0.15), inset 0 0 18px rgba(0, 180, 216, 0.05)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    pointerEvents: "auto",
    overflow: "auto",
    zIndex: 5,
  },
  loading: {
    color: "rgba(255,255,255,0.65)",
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: "0.18em",
    textAlign: "center",
    padding: 18,
    textTransform: "uppercase",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 10,
  },
  kicker: { color: RED, fontSize: 10, letterSpacing: "0.28em", fontFamily: mono, textShadow: CHROMATIC_TEXT_SHADOW },
  title: { color: "#fff", fontSize: 22, lineHeight: 1.05, fontWeight: 700, letterSpacing: 0, textShadow: CHROMATIC_TEXT_SHADOW },
  subTitle: { color: "rgba(255,255,255,0.62)", fontSize: 10, letterSpacing: "0.14em", fontFamily: mono, marginTop: 4, textTransform: "uppercase" },
  stateBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    height: 28,
    padding: "0 10px",
    border: "1px solid rgba(0, 180, 216, 0.55)",
    color: "#fff",
    fontSize: 10,
    letterSpacing: "0.14em",
    fontFamily: mono,
  },
  pulse: { width: 7, height: 7, borderRadius: "50%", background: CYAN, boxShadow: `0 0 8px ${CYAN}` },
  metrics: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 },
  metric: { border: "1px solid", padding: "7px 9px", display: "flex", justifyContent: "space-between", alignItems: "baseline", minWidth: 0 },
  metricValue: { fontFamily: mono, fontSize: 18, letterSpacing: "0.08em" },
  metricLabel: { color: "rgba(255,255,255,0.72)", fontSize: 9, letterSpacing: "0.18em", fontFamily: mono, textTransform: "uppercase" },
  grid: { display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 8, minHeight: 0 },
  panel: { minWidth: 0, border: "1px solid rgba(237, 28, 36, 0.25)", background: "rgba(255,255,255,0.035)" },
  panelHead: { display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 9px", borderBottom: "1px solid rgba(237, 28, 36, 0.22)" },
  panelTitle: { color: RED, fontSize: 9, letterSpacing: "0.2em", fontFamily: mono, textShadow: CHROMATIC_TEXT_SHADOW },
  panelMeta: { color: MAGENTA, fontSize: 8, letterSpacing: "0.14em", fontFamily: mono, whiteSpace: "nowrap" },
  panelBody: { padding: 9, display: "flex", flexDirection: "column", gap: 6, minHeight: 58, maxHeight: 132, overflow: "hidden" },
  empty: { color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: "0.08em", lineHeight: 1.4 },
  taskRow: { display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 7, alignItems: "center", minWidth: 0 },
  taskIndex: { color: RED, fontFamily: mono, fontSize: 9, letterSpacing: "0.08em" },
  taskText: { color: "#fff", fontSize: 12, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  taskDue: { color: CYAN, fontFamily: mono, fontSize: 8, letterSpacing: "0.1em", whiteSpace: "nowrap" },
  chatRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, minWidth: 0, alignItems: "center" },
  chatTitle: { color: "#fff", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  chatMeta: { color: MAGENTA, fontFamily: mono, fontSize: 8, letterSpacing: "0.1em", whiteSpace: "nowrap" },
  modelLine: { display: "flex", justifyContent: "space-between", gap: 10, minWidth: 0, alignItems: "baseline" },
  modelLabel: { color: CYAN, fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" },
  modelValue: { color: "#fff", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  modelSmall: { color: "rgba(255,255,255,0.55)", fontFamily: mono, fontSize: 8, letterSpacing: "0.08em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  usageGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  usageMetric: {
    minWidth: 0,
    padding: "6px 7px",
    border: "1px solid rgba(0, 180, 216, 0.22)",
    background: "rgba(0, 180, 216, 0.06)",
    display: "grid",
    gap: 2,
  },
  usageLabel: { color: "rgba(255,255,255,0.58)", fontFamily: mono, fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" },
  usageValue: { color: "#fff", fontFamily: mono, fontSize: 11, letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  usageDetail: { color: CYAN, fontFamily: mono, fontSize: 7, letterSpacing: "0.08em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  providerList: { display: "grid", gap: 5, marginTop: 2 },
  providerRow: { display: "grid", gridTemplateColumns: "70px 1fr", gap: 7, alignItems: "center", minWidth: 0 },
  providerName: { color: MAGENTA, fontFamily: mono, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  providerMeta: { color: "rgba(255,255,255,0.55)", fontFamily: mono, fontSize: 8, letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  healthRow: { display: "grid", gridTemplateColumns: "10px 84px 1fr", gap: 7, alignItems: "center", minWidth: 0 },
  healthDot: { width: 7, height: 7, borderRadius: "50%" },
  healthText: { color: "#fff", fontSize: 10, whiteSpace: "nowrap" },
  healthDetail: { color: "rgba(255,255,255,0.52)", fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
};
