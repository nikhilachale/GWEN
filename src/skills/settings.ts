// src/skills/settings.ts — local user-editable Gwen settings.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { applyModelBudgetToEnv, DEFAULT_MODEL_BUDGET } from "./modelBudget.js";
import { PROJECT_ROOT } from "./projectRoot.js";

const SETTINGS_PATH = path.join(PROJECT_ROOT, "data/settings.json");

export type GwenSettings = {
  brainProvider: "auto" | "anthropic" | "ollama";
  defaultProvider: "anthropic" | "ollama";
  discussionProvider: "anthropic" | "ollama";
  smartProvider: "anthropic" | "ollama";
  brainModel: string;
  discussionModel: string;
  smartModel: string;
  ollamaModel: string;
  ollamaUrl: string;
  codeAgent: "codex" | "claude";
  userName: string;
  ttsProvider: "fish" | "macos";
  passiveMemory: boolean;
  screenVision: boolean;
  startupBriefing: boolean;
  confirmSensitiveActions: boolean;
  safeMode: boolean;
  dailyModelBudgetUsd: number;
  monthlyModelBudgetUsd: number;
  modelBudgetWarningPercent: number;
  anthropicInputUsdPerMtok: number;
  anthropicOutputUsdPerMtok: number;
};

const DEFAULTS: GwenSettings = {
  brainProvider: "auto",
  defaultProvider: "anthropic",
  discussionProvider: "anthropic",
  smartProvider: "anthropic",
  brainModel: "claude-haiku-4-5-20251001",
  discussionModel: "claude-haiku-4-5-20251001",
  smartModel: "claude-haiku-4-5-20251001",
  ollamaModel: "qwen2.5:3b",
  ollamaUrl: "http://127.0.0.1:11434",
  codeAgent: "codex",
  userName: "Miles",
  ttsProvider: "fish",
  passiveMemory: false,
  screenVision: false,
  startupBriefing: false,
  confirmSensitiveActions: true,
  safeMode: false,
  dailyModelBudgetUsd: DEFAULT_MODEL_BUDGET.dailyBudgetUsd,
  monthlyModelBudgetUsd: DEFAULT_MODEL_BUDGET.monthlyBudgetUsd,
  modelBudgetWarningPercent: DEFAULT_MODEL_BUDGET.budgetWarningPercent,
  anthropicInputUsdPerMtok: DEFAULT_MODEL_BUDGET.anthropicInputUsdPerMtok,
  anthropicOutputUsdPerMtok: DEFAULT_MODEL_BUDGET.anthropicOutputUsdPerMtok,
};

function withEnvDefaults(): GwenSettings {
  return {
    ...DEFAULTS,
    brainProvider: (process.env.GWEN_BRAIN_PROVIDER as GwenSettings["brainProvider"]) || DEFAULTS.brainProvider,
    defaultProvider: (process.env.GWEN_DEFAULT_PROVIDER as GwenSettings["defaultProvider"]) || DEFAULTS.defaultProvider,
    discussionProvider: (process.env.GWEN_DISCUSSION_PROVIDER as GwenSettings["discussionProvider"]) || DEFAULTS.discussionProvider,
    smartProvider: (process.env.GWEN_SMART_PROVIDER as GwenSettings["smartProvider"]) || DEFAULTS.smartProvider,
    brainModel: process.env.GWEN_BRAIN_MODEL || DEFAULTS.brainModel,
    discussionModel: process.env.GWEN_DISCUSSION_MODEL || process.env.GWEN_BRAIN_MODEL || DEFAULTS.discussionModel,
    smartModel: process.env.GWEN_SMART_MODEL || process.env.GWEN_BRAIN_MODEL || DEFAULTS.smartModel,
    ollamaModel: process.env.GWEN_OLLAMA_MODEL || DEFAULTS.ollamaModel,
    ollamaUrl: process.env.GWEN_OLLAMA_URL || DEFAULTS.ollamaUrl,
    codeAgent: (process.env.GWEN_CODE_AGENT as GwenSettings["codeAgent"]) || DEFAULTS.codeAgent,
    userName: process.env.GWEN_USER_NAME || DEFAULTS.userName,
    ttsProvider: (process.env.GWEN_TTS_PROVIDER as GwenSettings["ttsProvider"]) || DEFAULTS.ttsProvider,
    passiveMemory: process.env.GWEN_MEMORY_PROVIDER === "anthropic",
    screenVision: process.env.GWEN_VISION_PROVIDER === "anthropic",
    startupBriefing: process.env.GWEN_STARTUP_BRIEFING === "1",
    confirmSensitiveActions: process.env.GWEN_CONFIRM_SENSITIVE_ACTIONS !== "0",
    safeMode: process.env.GWEN_SAFE_MODE === "1",
    dailyModelBudgetUsd: Number(process.env.GWEN_DAILY_MODEL_BUDGET_USD ?? DEFAULTS.dailyModelBudgetUsd),
    monthlyModelBudgetUsd: Number(process.env.GWEN_MONTHLY_MODEL_BUDGET_USD ?? DEFAULTS.monthlyModelBudgetUsd),
    modelBudgetWarningPercent: Number(process.env.GWEN_MODEL_BUDGET_WARNING_PERCENT ?? DEFAULTS.modelBudgetWarningPercent),
    anthropicInputUsdPerMtok: Number(
      process.env.GWEN_ANTHROPIC_INPUT_USD_PER_MTOK ??
        process.env.GWEN_INPUT_USD_PER_MTOK ??
        DEFAULTS.anthropicInputUsdPerMtok
    ),
    anthropicOutputUsdPerMtok: Number(
      process.env.GWEN_ANTHROPIC_OUTPUT_USD_PER_MTOK ?? DEFAULTS.anthropicOutputUsdPerMtok
    ),
  };
}

function nonNegativeNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeTtsProvider(value: unknown): GwenSettings["ttsProvider"] {
  return value === "macos" || value === "fish" ? value : DEFAULTS.ttsProvider;
}

function normalize(raw: Partial<GwenSettings>): GwenSettings {
  const next = { ...withEnvDefaults(), ...raw };
  return {
    ...next,
    ttsProvider: normalizeTtsProvider(next.ttsProvider),
    dailyModelBudgetUsd: nonNegativeNumber(next.dailyModelBudgetUsd, DEFAULTS.dailyModelBudgetUsd),
    monthlyModelBudgetUsd: nonNegativeNumber(next.monthlyModelBudgetUsd, DEFAULTS.monthlyModelBudgetUsd),
    modelBudgetWarningPercent: nonNegativeNumber(next.modelBudgetWarningPercent, DEFAULTS.modelBudgetWarningPercent),
    anthropicInputUsdPerMtok: nonNegativeNumber(next.anthropicInputUsdPerMtok, DEFAULTS.anthropicInputUsdPerMtok),
    anthropicOutputUsdPerMtok: nonNegativeNumber(next.anthropicOutputUsdPerMtok, DEFAULTS.anthropicOutputUsdPerMtok),
  };
}

export function applySettingsToEnv(settings: GwenSettings) {
  process.env.GWEN_BRAIN_PROVIDER = settings.brainProvider;
  process.env.GWEN_DEFAULT_PROVIDER = settings.defaultProvider;
  process.env.GWEN_DISCUSSION_PROVIDER = settings.discussionProvider;
  process.env.GWEN_SMART_PROVIDER = settings.smartProvider;
  process.env.GWEN_BRAIN_MODEL = settings.brainModel;
  process.env.GWEN_DISCUSSION_MODEL = settings.discussionModel;
  process.env.GWEN_SMART_MODEL = settings.smartModel;
  process.env.GWEN_OLLAMA_MODEL = settings.ollamaModel;
  process.env.GWEN_OLLAMA_URL = settings.ollamaUrl;
  process.env.GWEN_CODE_AGENT = settings.codeAgent;
  process.env.GWEN_USER_NAME = settings.userName;
  process.env.GWEN_TTS_PROVIDER = settings.ttsProvider;
  process.env.GWEN_MEMORY_PROVIDER = settings.passiveMemory ? "anthropic" : "disabled";
  process.env.GWEN_VISION_PROVIDER = settings.screenVision ? "anthropic" : "disabled";
  process.env.GWEN_STARTUP_BRIEFING = settings.startupBriefing ? "1" : "0";
  process.env.GWEN_CONFIRM_SENSITIVE_ACTIONS = settings.confirmSensitiveActions ? "1" : "0";
  process.env.GWEN_SAFE_MODE = settings.safeMode ? "1" : "0";
  applyModelBudgetToEnv({
    dailyBudgetUsd: settings.dailyModelBudgetUsd,
    monthlyBudgetUsd: settings.monthlyModelBudgetUsd,
    budgetWarningPercent: settings.modelBudgetWarningPercent,
    anthropicInputUsdPerMtok: settings.anthropicInputUsdPerMtok,
    anthropicOutputUsdPerMtok: settings.anthropicOutputUsdPerMtok,
  });
}

export async function getSettings(): Promise<GwenSettings> {
  try {
    const raw = JSON.parse(await readFile(SETTINGS_PATH, "utf8"));
    const settings = normalize(raw);
    applySettingsToEnv(settings);
    return settings;
  } catch {
    const settings = normalize({});
    applySettingsToEnv(settings);
    return settings;
  }
}

export async function updateSettings(patch: Partial<GwenSettings>): Promise<GwenSettings> {
  const current = await getSettings();
  const next = normalize({ ...current, ...patch });
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2));
  applySettingsToEnv(next);
  return next;
}
