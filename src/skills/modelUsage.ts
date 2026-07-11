// src/skills/modelUsage.ts — append/read provider usage events without affecting chat flow.
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getModelBudgetSettings, estimateAnthropicUsd } from "./modelBudget.js";
import { PROJECT_ROOT } from "./projectRoot.js";

const USAGE_LOG_PATH = path.join(PROJECT_ROOT, "data/model-usage.jsonl");

const AVG_CHARS_PER_TOKEN = 4;

type UsageMetadata = {
  phase?: string;
  tier?: string;
  routeReason?: string;
  toolsEnabled?: boolean;
  inputChars?: number;
  messageCount?: number;
};

export type ProviderUsageSummary = {
  provider: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  lastUsedAt: string | null;
};

export type ModelUsageSummary = {
  generatedAt: string;
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
  providers: ProviderUsageSummary[];
  logPath: string;
};

async function appendUsageEvent(event: Record<string, any>) {
  try {
    await mkdir(path.dirname(USAGE_LOG_PATH), { recursive: true });
    await appendFile(USAGE_LOG_PATH, JSON.stringify(event) + "\n");
  } catch (err: any) {
    console.warn("[model-usage] log failed:", err?.message || err);
  }
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function percentUsed(used: number, budget: number) {
  if (!budget) return null;
  return Number(Math.min(999, (used / budget) * 100).toFixed(1));
}

function remaining(used: number, budget: number) {
  if (!budget) return null;
  return Number(Math.max(0, budget - used).toFixed(6));
}

function roundUsd(value: number) {
  return Number(value.toFixed(6));
}

function compactBudgetSnapshot() {
  const budget = getModelBudgetSettings();
  return {
    dailyBudgetUsd: budget.dailyBudgetUsd,
    monthlyBudgetUsd: budget.monthlyBudgetUsd,
    budgetWarningPercent: budget.budgetWarningPercent,
  };
}

export async function logAnthropicUsage(params: {
  model: string;
  response: any;
  metadata?: UsageMetadata;
}) {
  const usage = params.response?.usage || {};
  await appendUsageEvent({
    ts: new Date().toISOString(),
    provider: "anthropic",
    model: params.model,
    phase: params.metadata?.phase,
    tier: params.metadata?.tier,
    routeReason: params.metadata?.routeReason,
    toolsEnabled: !!params.metadata?.toolsEnabled,
    stopReason: params.response?.stop_reason,
    usageSource: "provider",
    inputTokens: usage.input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? null,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? null,
    estimatedUsd: estimateAnthropicUsd(usage),
    inputChars: params.metadata?.inputChars ?? null,
    messageCount: params.metadata?.messageCount ?? null,
    budget: compactBudgetSnapshot(),
  });
}

export async function logOllamaUsage(params: {
  model: string;
  response: any;
  metadata?: UsageMetadata;
}) {
  const promptEvalCount = Number(params.response?.prompt_eval_count);
  const evalCount = Number(params.response?.eval_count);
  const hasProviderCounts = Number.isFinite(promptEvalCount) || Number.isFinite(evalCount);
  const inputChars = params.metadata?.inputChars ?? 0;

  await appendUsageEvent({
    ts: new Date().toISOString(),
    provider: "ollama",
    model: params.model,
    phase: params.metadata?.phase,
    tier: params.metadata?.tier,
    routeReason: params.metadata?.routeReason,
    toolsEnabled: !!params.metadata?.toolsEnabled,
    done: params.response?.done ?? null,
    doneReason: params.response?.done_reason ?? null,
    usageSource: hasProviderCounts ? "provider" : "estimate",
    inputTokens: Number.isFinite(promptEvalCount) ? promptEvalCount : Math.ceil(inputChars / AVG_CHARS_PER_TOKEN),
    outputTokens: Number.isFinite(evalCount) ? evalCount : null,
    promptEvalCount: Number.isFinite(promptEvalCount) ? promptEvalCount : null,
    evalCount: Number.isFinite(evalCount) ? evalCount : null,
    totalDurationNs: params.response?.total_duration ?? null,
    loadDurationNs: params.response?.load_duration ?? null,
    promptEvalDurationNs: params.response?.prompt_eval_duration ?? null,
    evalDurationNs: params.response?.eval_duration ?? null,
    estimatedUsd: 0,
    inputChars: params.metadata?.inputChars ?? null,
    messageCount: params.metadata?.messageCount ?? null,
    budget: compactBudgetSnapshot(),
  });
}

export async function getModelUsageSummary(now = new Date()): Promise<ModelUsageSummary> {
  const budget = getModelBudgetSettings();
  const todayStart = startOfToday(now);
  const monthStart = startOfMonth(now);
  const providers = new Map<string, ProviderUsageSummary>();
  let todayUsd = 0;
  let monthUsd = 0;
  let allTimeUsd = 0;
  let todayCalls = 0;
  let monthCalls = 0;
  let allTimeCalls = 0;

  try {
    const raw = await readFile(USAGE_LOG_PATH, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let event: any;
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const tsMs = Date.parse(event.ts);
      if (!Number.isFinite(tsMs)) continue;

      const provider = String(event.provider || "unknown");
      const usd = numberValue(event.estimatedUsd);
      const inputTokens = numberValue(event.inputTokens) + numberValue(event.cacheCreationInputTokens);
      const outputTokens = numberValue(event.outputTokens);
      const current = providers.get(provider) || {
        provider,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedUsd: 0,
        lastUsedAt: null,
      };

      current.calls += 1;
      current.inputTokens += inputTokens;
      current.outputTokens += outputTokens;
      current.estimatedUsd = roundUsd(current.estimatedUsd + usd);
      if (!current.lastUsedAt || tsMs > Date.parse(current.lastUsedAt)) {
        current.lastUsedAt = new Date(tsMs).toISOString();
      }
      providers.set(provider, current);

      allTimeCalls += 1;
      allTimeUsd += usd;
      if (tsMs >= monthStart) {
        monthCalls += 1;
        monthUsd += usd;
      }
      if (tsMs >= todayStart) {
        todayCalls += 1;
        todayUsd += usd;
      }
    }
  } catch (err: any) {
    if (err?.code !== "ENOENT") console.warn("[model-usage] summary read failed:", err?.message || err);
  }

  const roundedTodayUsd = roundUsd(todayUsd);
  const roundedMonthUsd = roundUsd(monthUsd);

  return {
    generatedAt: now.toISOString(),
    todayUsd: roundedTodayUsd,
    monthUsd: roundedMonthUsd,
    allTimeUsd: roundUsd(allTimeUsd),
    todayCalls,
    monthCalls,
    allTimeCalls,
    dailyBudgetUsd: budget.dailyBudgetUsd,
    monthlyBudgetUsd: budget.monthlyBudgetUsd,
    dailyRemainingUsd: remaining(roundedTodayUsd, budget.dailyBudgetUsd),
    monthlyRemainingUsd: remaining(roundedMonthUsd, budget.monthlyBudgetUsd),
    dailyPercentUsed: percentUsed(roundedTodayUsd, budget.dailyBudgetUsd),
    monthlyPercentUsed: percentUsed(roundedMonthUsd, budget.monthlyBudgetUsd),
    providers: [...providers.values()].sort((a, b) => b.estimatedUsd - a.estimatedUsd || b.calls - a.calls),
    logPath: USAGE_LOG_PATH,
  };
}
