// src/skills/modelBudget.ts — model cost and budget settings shared by routing/logging.

export type ModelBudgetSettings = {
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  budgetWarningPercent: number;
  anthropicInputUsdPerMtok: number;
  anthropicOutputUsdPerMtok: number;
};

export const DEFAULT_MODEL_BUDGET: ModelBudgetSettings = {
  dailyBudgetUsd: 0,
  monthlyBudgetUsd: 0,
  budgetWarningPercent: 80,
  anthropicInputUsdPerMtok: 0.8,
  anthropicOutputUsdPerMtok: 4,
};

function finiteNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getModelBudgetSettings(env: NodeJS.ProcessEnv = process.env): ModelBudgetSettings {
  return {
    dailyBudgetUsd: finiteNumber(env.GWEN_DAILY_MODEL_BUDGET_USD, DEFAULT_MODEL_BUDGET.dailyBudgetUsd),
    monthlyBudgetUsd: finiteNumber(env.GWEN_MONTHLY_MODEL_BUDGET_USD, DEFAULT_MODEL_BUDGET.monthlyBudgetUsd),
    budgetWarningPercent: finiteNumber(env.GWEN_MODEL_BUDGET_WARNING_PERCENT, DEFAULT_MODEL_BUDGET.budgetWarningPercent),
    anthropicInputUsdPerMtok: finiteNumber(
      env.GWEN_ANTHROPIC_INPUT_USD_PER_MTOK ?? env.GWEN_INPUT_USD_PER_MTOK,
      DEFAULT_MODEL_BUDGET.anthropicInputUsdPerMtok
    ),
    anthropicOutputUsdPerMtok: finiteNumber(
      env.GWEN_ANTHROPIC_OUTPUT_USD_PER_MTOK,
      DEFAULT_MODEL_BUDGET.anthropicOutputUsdPerMtok
    ),
  };
}

export function estimateAnthropicUsd(usage: any, budget = getModelBudgetSettings()) {
  const inputTokens = Number(usage?.input_tokens || 0);
  const outputTokens = Number(usage?.output_tokens || 0);
  const cacheCreationInputTokens = Number(usage?.cache_creation_input_tokens || 0);
  const billableInputTokens = inputTokens + cacheCreationInputTokens;
  const inputUsd = (billableInputTokens / 1_000_000) * budget.anthropicInputUsdPerMtok;
  const outputUsd = (outputTokens / 1_000_000) * budget.anthropicOutputUsdPerMtok;
  return Number((inputUsd + outputUsd).toFixed(8));
}

export function applyModelBudgetToEnv(settings: Partial<ModelBudgetSettings>) {
  process.env.GWEN_DAILY_MODEL_BUDGET_USD = String(settings.dailyBudgetUsd ?? DEFAULT_MODEL_BUDGET.dailyBudgetUsd);
  process.env.GWEN_MONTHLY_MODEL_BUDGET_USD = String(settings.monthlyBudgetUsd ?? DEFAULT_MODEL_BUDGET.monthlyBudgetUsd);
  process.env.GWEN_MODEL_BUDGET_WARNING_PERCENT = String(
    settings.budgetWarningPercent ?? DEFAULT_MODEL_BUDGET.budgetWarningPercent
  );
  process.env.GWEN_ANTHROPIC_INPUT_USD_PER_MTOK = String(
    settings.anthropicInputUsdPerMtok ?? DEFAULT_MODEL_BUDGET.anthropicInputUsdPerMtok
  );
  process.env.GWEN_ANTHROPIC_OUTPUT_USD_PER_MTOK = String(
    settings.anthropicOutputUsdPerMtok ?? DEFAULT_MODEL_BUDGET.anthropicOutputUsdPerMtok
  );
}
