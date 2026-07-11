// src/skills/modelRouter.ts — choose the cheapest capable brain for each turn.
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getModelBudgetSettings } from "./modelBudget.js";
import { PROJECT_ROOT } from "./projectRoot.js";

const ROUTE_LOG_PATH = path.join(PROJECT_ROOT, "data/model-router.jsonl");

const AVG_CHARS_PER_TOKEN = 4;
const FALLBACK_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

function routerConfig() {
  const anthropicModel = process.env.GWEN_BRAIN_MODEL || FALLBACK_ANTHROPIC_MODEL;
  const budget = getModelBudgetSettings();
  return {
    smartProvider: (process.env.GWEN_SMART_PROVIDER || "anthropic").toLowerCase(),
    discussionProvider: (process.env.GWEN_DISCUSSION_PROVIDER || "anthropic").toLowerCase(),
    defaultProvider: (process.env.GWEN_DEFAULT_PROVIDER || "anthropic").toLowerCase(),
    brainProvider: (process.env.GWEN_BRAIN_PROVIDER || "auto").toLowerCase(),
    anthropicModel,
    discussionModel: process.env.GWEN_DISCUSSION_MODEL || anthropicModel,
    smartModel: process.env.GWEN_SMART_MODEL || anthropicModel,
    ollamaModel: process.env.GWEN_OLLAMA_MODEL || "qwen2.5:3b",
    inputUsdPerMtok: budget.anthropicInputUsdPerMtok,
  };
}

const TOOL_INTENTS = new Set([
  "calendar",
  "email",
  "search",
  "task",
  "notes",
  "memory",
  "system",
  "music",
  "weather",
]);

function wantsGwenCodeWork(text: string) {
  return /\b(self[- ]?(fix|build|building|repair)|fix yourself|change (your|gwen)|add .* to gwen|add .* feature|build .* (into|for) (yourself|you|gwen)|implement .* (in|for) (yourself|you|gwen)|wire .* (into|up)|gwen.*(bug|broken|feature)|daily check-?in|task tracker|input bar|conversation window)\b/i.test(text);
}

function wantsExternalCodeWork(text: string) {
  return /\b(build|create|make|code|app|website|script|component|repo|project|debug|bug|typescript|javascript|react|electron)\b/i.test(text);
}

function wantsToolWork(text: string, intentHint: any) {
  if (intentHint?.type && TOOL_INTENTS.has(intentHint.type)) return true;
  return /\b(open|launch|search|email|calendar|schedule|remind|task|note|weather|screen|pdf|file|folder|volume|brightness|wifi|bluetooth|timer|alarm|call|facetime|whatsapp|imessage|restart|relaunch)\b/i.test(text);
}

function wantsDiscussion(text: string) {
  return /\b(brainstorm|discuss|think through|plan|strategy|idea|decide|compare|what should|how can|optimi[sz]e|architecture|approach|tradeoff)\b/i.test(text);
}

function providerAvailable(provider: string, available: { anthropic?: boolean; ollama?: boolean }) {
  if (provider === "anthropic") return !!available.anthropic;
  if (provider === "ollama") return !!available.ollama;
  return false;
}

function chooseProvider(preferred: string, fallback: string, available: { anthropic?: boolean; ollama?: boolean }) {
  if (providerAvailable(preferred, available)) return preferred;
  if (providerAvailable(fallback, available)) return fallback;
  if (available.anthropic) return "anthropic";
  if (available.ollama) return "ollama";
  return preferred;
}

function modelFor(provider: string, purpose: "discussion" | "smart" | "default", config: ReturnType<typeof routerConfig>) {
  if (provider === "ollama") return config.ollamaModel;
  if (purpose === "discussion") return config.discussionModel;
  if (purpose === "smart") return config.smartModel;
  return config.anthropicModel;
}

export function chooseBrainRoute(userInput: string, opts: {
  intentHint?: any;
  hasAnthropic?: boolean;
  hasOllama?: boolean;
  allowTools?: boolean;
} = {}) {
  const text = String(userInput || "");
  const config = routerConfig();
  const available = {
    anthropic: !!opts.hasAnthropic,
    ollama: opts.hasOllama !== false,
  };

  if (config.brainProvider === "anthropic" || config.brainProvider === "ollama") {
    const provider = chooseProvider(config.brainProvider, config.defaultProvider, available);
    return {
      tier: provider === "ollama" ? "local_llm" : "smart_cloud",
      provider,
      model: modelFor(provider, "default", config),
      toolsEnabled: provider === "anthropic" && opts.allowTools !== false,
      reason: `forced by GWEN_BRAIN_PROVIDER=${config.brainProvider}`,
    };
  }

  if (wantsGwenCodeWork(text)) {
    const provider = chooseProvider(config.smartProvider, config.defaultProvider, available);
    return {
      tier: "smart_cloud",
      provider,
      model: modelFor(provider, "smart", config),
      toolsEnabled: provider === "anthropic" && opts.allowTools !== false,
      reason: "Gwen code/self-fix request needs the tool-capable brain",
    };
  }

  if (wantsToolWork(text, opts.intentHint) || wantsExternalCodeWork(text)) {
    const provider = chooseProvider(config.smartProvider, config.defaultProvider, available);
    return {
      tier: "smart_cloud",
      provider,
      model: modelFor(provider, "smart", config),
      toolsEnabled: provider === "anthropic" && opts.allowTools !== false,
      reason: "action/tool/code request needs reliable routing",
    };
  }

  if (wantsDiscussion(text)) {
    const provider = chooseProvider(config.discussionProvider, config.defaultProvider, available);
    return {
      tier: provider === "ollama" ? "local_llm" : "discussion_cloud",
      provider,
      model: modelFor(provider, "discussion", config),
      toolsEnabled: false,
      reason: "brainstorming/discussion without tools",
    };
  }

  const provider = chooseProvider(config.defaultProvider, config.discussionProvider, available);
  return {
    tier: provider === "ollama" ? "local_llm" : "discussion_cloud",
    provider,
    model: modelFor(provider, "default", config),
    toolsEnabled: false,
    reason: "default conversational turn without tools",
  };
}

export async function logBrainRoute(route: any, input: string) {
  try {
    const inputChars = String(input || "").length;
    const estimatedInputTokens = Math.ceil(inputChars / AVG_CHARS_PER_TOKEN);
    const config = routerConfig();
    const estimatedInputUsd =
      route.provider === "anthropic"
        ? (estimatedInputTokens / 1_000_000) * config.inputUsdPerMtok
        : 0;
    await mkdir(path.dirname(ROUTE_LOG_PATH), { recursive: true });
    await appendFile(
      ROUTE_LOG_PATH,
      JSON.stringify({
        ts: new Date().toISOString(),
        tier: route.tier,
        provider: route.provider,
        model: route.model,
        toolsEnabled: !!route.toolsEnabled,
        reason: route.reason,
        inputChars,
        estimatedInputTokens,
        estimatedInputUsd: Number(estimatedInputUsd.toFixed(8)),
      }) + "\n"
    );
  } catch (err: any) {
    console.warn("[model-router] log failed:", err?.message || err);
  }
}
