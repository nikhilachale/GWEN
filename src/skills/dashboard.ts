// src/skills/dashboard.ts — read-only aggregate for the center home dashboard.
import * as tasksTool from "../tools/tasks.js";
import { getSettings } from "./settings.js";

export type DashboardTask = {
  id?: string | number;
  text: string;
  due?: string | null;
  done?: boolean;
};

export type DashboardConversation = {
  id: string;
  title: string;
  updatedAt: number;
  count: number;
  active?: boolean;
};

export type HomeDashboardData = {
  generatedAt: string;
  today: {
    label: string;
    date: string;
    partOfDay: string;
  };
  tasks: {
    open: DashboardTask[];
    dueToday: DashboardTask[];
    overdue: DashboardTask[];
  };
  recentChats: DashboardConversation[];
  model: {
    state: string;
    provider: string;
    model: string;
    discussionModel: string;
    smartModel: string;
    localModel: string;
    tools: string;
  };
  health: Array<{
    id: string;
    label: string;
    status: "ok" | "warn" | "placeholder";
    detail: string;
  }>;
};

function partOfDayFor(hour: number) {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Night";
}

function readTasks() {
  try {
    const all = tasksTool.getAll() || [];
    const open = all.filter((t: DashboardTask) => !t.done);
    return {
      open,
      dueToday: tasksTool.getDueToday?.() || open.filter((t: DashboardTask) => !!t.due),
      overdue: tasksTool.getOverdue?.() || [],
    };
  } catch (err: any) {
    console.warn("[dashboard] task read failed:", err?.message || err);
    return { open: [], dueToday: [], overdue: [] };
  }
}

function modelNameForProvider(settings: Awaited<ReturnType<typeof getSettings>>) {
  if (settings.brainProvider === "ollama") return settings.ollamaModel;
  if (settings.brainProvider === "anthropic") return settings.brainModel;
  if (settings.defaultProvider === "ollama") return settings.ollamaModel;
  return settings.brainModel;
}

export async function getHomeDashboard(input: {
  state?: string;
  conversations?: DashboardConversation[];
} = {}): Promise<HomeDashboardData> {
  const now = new Date();
  const settings = await getSettings();
  const tasks = readTasks();
  const recentChats = (input.conversations || [])
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 5);

  return {
    generatedAt: now.toISOString(),
    today: {
      label: now.toLocaleDateString([], { weekday: "long" }),
      date: now.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
      partOfDay: partOfDayFor(now.getHours()),
    },
    tasks,
    recentChats,
    model: {
      state: input.state || "unknown",
      provider: settings.brainProvider === "auto" ? settings.defaultProvider : settings.brainProvider,
      model: modelNameForProvider(settings),
      discussionModel: settings.discussionModel,
      smartModel: settings.smartModel,
      localModel: settings.ollamaModel,
      tools: settings.safeMode ? "Safe mode" : "Available",
    },
    health: [
      {
        id: "voice",
        label: "Voice loop",
        status: "placeholder",
        detail: "Idle/listening health probe pending",
      },
      {
        id: "memory",
        label: "Memory",
        status: settings.passiveMemory ? "ok" : "placeholder",
        detail: settings.passiveMemory ? "Passive capture enabled" : "Passive capture off",
      },
      {
        id: "screen",
        label: "Screen vision",
        status: settings.screenVision ? "ok" : "placeholder",
        detail: settings.screenVision ? "Screen context enabled" : "Screen context off",
      },
      {
        id: "security",
        label: "Guardrails",
        status: settings.confirmSensitiveActions ? "ok" : "warn",
        detail: settings.confirmSensitiveActions ? "Sensitive actions require confirmation" : "Confirmations disabled",
      },
    ],
  };
}
