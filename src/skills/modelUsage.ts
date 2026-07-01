// src/skills/modelUsage.ts — append provider usage events without affecting chat flow.
import { appendFile, mkdir } from "node:fs/promises";
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

async function appendUsageEvent(event: Record<string, any>) {
  try {
    await mkdir(path.dirname(USAGE_LOG_PATH), { recursive: true });
    await appendFile(USAGE_LOG_PATH, JSON.stringify(event) + "\n");
  } catch (err: any) {
    console.warn("[model-usage] log failed:", err?.message || err);
  }
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
