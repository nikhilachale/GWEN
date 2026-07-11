// src/core/brain.ts — Gwen orchestrator (refactored, now ~400 lines)
import Anthropic from "@anthropic-ai/sdk";
import * as memoryTool from "../tools/memory.js";
import { createToolHandlers, TOOLS } from "../tools/registry.js";
import { extractAndSaveFacts } from "../skills/passiveMemory.js";
import { getAmbientContext } from "../skills/ambientContext.js";
import { formatRelevantBlock } from "../skills/semanticMemory.js";
import { sendActivity, sendContextPanel } from "../skills/ipc.js";
import { chooseBrainRoute, logBrainRoute } from "../skills/modelRouter.js";
import { logAnthropicUsage, logOllamaUsage } from "../skills/modelUsage.js";
import { getPendingConfirmation } from "../skills/security.js";
import * as tasksTool from "../tools/tasks.js";

// Refactored modules
import * as ConversationManager from "./conversationManager.js";
import { buildSystemPrompt, buildOllamaSystemPrompt, normalizeOllamaText } from "./systemPrompt.js";
import {
  dispatchTool,
  dispatchToolNow,
  makeToolCircuit,
  tripCircuit,
  circuitReply,
  handlePendingConfirmation,
} from "./toolDispatcher.js";
import { tryLocalFastPath as tryLocalFastPathImpl } from "./localFastPath.js";

const MODEL = process.env.GWEN_BRAIN_MODEL || "claude-haiku-4-5-20251001";
const MAX_TOOL_TURNS = 8;
const MAX_MODEL_HISTORY_MESSAGES = 20;

// Push tasks to renderer when task tools fire
function broadcastTasks() {
  try {
    const open = tasksTool.getAll().filter((t) => !t.done);
    sendContextPanel("tasks", open);
  } catch (err) {
    console.debug("[brain] task broadcast failed:", err);
  }
}

const handlers = createToolHandlers({ onTasksChanged: broadcastTasks });

// Initialize conversation manager on load
await ConversationManager.initConversationManager();

async function safeRecall(key: string): Promise<string | null> {
  try {
    const r = await memoryTool.recall({ key });
    return typeof r === "string" ? r : (r?.value ?? null);
  } catch {
    return null;
  }
}

function splitSentences(buffer: string): { sentences: string[]; remainder: string } {
  const sentences = [];
  const regex = /([.!?])(\s+|$)/g;
  let lastEnd = 0;
  let match;
  while ((match = regex.exec(buffer)) !== null) {
    if (match.index + match[0].length === buffer.length && match[2] !== "") {
      break;
    }
    sentences.push(buffer.slice(lastEnd, match.index + 1));
    lastEnd = match.index + match[0].length;
  }
  return { sentences, remainder: buffer.slice(lastEnd) };
}

function usageMetadata(route: any, userInput: string, messages: any[], phase: string) {
  return {
    phase,
    tier: route?.tier,
    routeReason: route?.reason,
    toolsEnabled: !!route?.toolsEnabled,
    inputChars: String(userInput || "").length,
    messageCount: Array.isArray(messages) ? messages.length : 0,
  };
}

async function prepareBrainTurn(userInput: string, opts: Record<string, any>) {
  const userName = (await safeRecall("user_name")) || process.env.GWEN_USER_NAME || "Miles";
  const userNickname = await safeRecall("user_nickname");
  const ambient = opts.skipAmbient ? null : await getAmbientContext().catch(() => null);
  const relevantBlock = await formatRelevantBlock(userInput).catch(() => "");
  const messages: any[] = [
    ...ConversationManager.getHistoryForTurn(MAX_MODEL_HISTORY_MESSAGES),
    { role: "user", content: userInput },
  ];
  const route = chooseBrainRoute(userInput, {
    intentHint: opts.intentHint,
    hasAnthropic: !!process.env.ANTHROPIC_KEY,
    hasOllama: true,
    allowTools: !opts.noTools,
  });
  sendActivity({
    kind: "info",
    summary: `Model route: ${route.tier}`,
    detail: `${route.provider}/${route.model} — ${route.reason}${route.toolsEnabled ? " with tools" : ""}`,
  });
  logBrainRoute(route, userInput).catch(() => {});
  return {
    userName,
    userNickname,
    ambient,
    relevantBlock,
    messages,
    route,
    system: buildSystemPrompt({ userName, userNickname, intentHint: opts.intentHint, ambient, relevantBlock }),
    localSystem: buildOllamaSystemPrompt({ userName, userNickname, ambient, relevantBlock }),
    client: process.env.ANTHROPIC_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_KEY }) : null,
  };
}

async function recordReply(
  userInput: string,
  assistantText: string,
  opts: Record<string, any>,
  extractFacts = false
) {
  if (opts.skipHistory) return;
  await ConversationManager.recordExchange(userInput, assistantText);
  if (extractFacts) {
    extractAndSaveFacts({ userInput, assistantText }).catch(() => {});
  }
}

function emitSentences(text: string, onSentence: (sentence: string) => void) {
  for (const sentence of text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]) {
    const trimmed = sentence.trim();
    if (trimmed) onSentence(trimmed);
  }
}

async function runToolUses(toolUses: any[]) {
  return Promise.all(
    toolUses.map(async (tu) => {
      try {
        const result = await dispatchTool(tu.name, tu.input || {}, handlers);
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: result,
        };
      } catch (err: any) {
        console.error(`[brain] tool ${tu.name} failed:`, err);
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error running ${tu.name}: ${err.message}`,
          is_error: true,
        };
      }
    })
  );
}

async function runOllamaChat(opts: {
  system: string;
  messages: any[];
  route?: any;
  userInput?: string;
}): Promise<string> {
  const ollamaUrl = process.env.GWEN_OLLAMA_URL || "http://127.0.0.1:11434";
  const ollamaModel = process.env.GWEN_OLLAMA_MODEL || "qwen2.5:3b";
  const response = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      think: false,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
      ],
      options: {
        temperature: 0.3,
        num_predict: 512,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Ollama ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  logOllamaUsage({
    model: ollamaModel,
    response: data,
    metadata: usageMetadata(opts.route, opts.userInput, opts.messages, "chat"),
  }).catch(() => {});
  return normalizeOllamaText(data?.message?.content);
}

// ─── Main entry ──────────────────────────────────────────────────────
/**
 * Run a single turn through the brain.
 * @param {string} userInput
 * @param {{ intentHint?: object; skipHistory?: boolean; noTools?: boolean; skipAmbient?: boolean }} [opts]
 * @returns {Promise<string>} Final spoken text.
 */
export async function runBrain(userInput: string, opts: Record<string, any> = {}): Promise<string> {
  // Handle pending confirmation
  const pendingResult = await handlePendingConfirmation(userInput, handlers, opts);
  if (pendingResult.handled) {
    const reply = pendingResult.reply || "";
    await recordReply(userInput, reply, opts);
    return reply;
  }

  const { route, client, system, localSystem, messages } = await prepareBrainTurn(userInput, opts);

  if (route.provider === "ollama") {
    const finalText = await runOllamaChat({ system: localSystem, messages, route, userInput });
    await recordReply(userInput, finalText, opts);
    return finalText;
  }

  if (route.provider !== "anthropic" || !client) {
    return "I don't have a usable brain provider configured for that yet. Set ANTHROPIC_KEY for the smart brain, or enable an available local fallback.";
  }

  let response = await client.messages.create({
    model: route.model || MODEL,
    max_tokens: 1024,
    temperature: 0.2,
    system,
    ...(route.toolsEnabled ? { tools: TOOLS as any } : {}),
    messages,
  });
  logAnthropicUsage({
    model: route.model || MODEL,
    response,
    metadata: usageMetadata(route, userInput, messages, "initial"),
  }).catch(() => {});

  let turn = 0;
  const circuit = makeToolCircuit();
  while (route.toolsEnabled && response.stop_reason === "tool_use" && turn < MAX_TOOL_TURNS) {
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults = await runToolUses(toolUses);

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    const tripped = tripCircuit(circuit, toolUses, toolResults);
    if (tripped) {
      console.warn(`[brain] circuit breaker: ${tripped} after ${turn + 1} tool turn(s)`);
      const reply = circuitReply(toolResults, tripped);
      await recordReply(userInput, reply, opts);
      return reply;
    }

    response = await client.messages.create({
      model: route.model || MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      system,
      tools: TOOLS as any,
      messages,
    });
    logAnthropicUsage({
      model: route.model || MODEL,
      response,
      metadata: usageMetadata(route, userInput, messages, `tool_turn_${turn + 1}`),
    }).catch(() => {});

    turn++;
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const finalText = textBlock ? textBlock.text : "I'm not sure how to respond to that.";
  await recordReply(userInput, finalText, opts, true);
  return finalText;
}

/**
 * Streaming variant. Calls onSentence(text) for each complete sentence as it arrives.
 * Returns the full final reply text once done.
 * @param {string} userInput
 * @param {(sentence: string) => void} onSentence
 * @param {{ intentHint?: object; skipHistory?: boolean; noTools?: boolean; skipAmbient?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export async function runBrainStream(
  userInput: string,
  onSentence: (sentence: string) => void = () => {},
  opts: Record<string, any> = {}
): Promise<string> {
  // Handle pending confirmation
  const pendingResult = await handlePendingConfirmation(userInput, handlers, opts);
  if (pendingResult.handled) {
    const reply = pendingResult.reply || "";
    onSentence(reply);
    await recordReply(userInput, reply, opts);
    return reply;
  }

  const { route, client, system, localSystem, messages } = await prepareBrainTurn(userInput, opts);

  if (route.provider === "ollama") {
    const finalText = await runOllamaChat({ system: localSystem, messages, route, userInput });
    emitSentences(finalText, onSentence);
    await recordReply(userInput, finalText, opts);
    return finalText;
  }

  if (route.provider !== "anthropic" || !client) {
    const msg = "I don't have a usable brain provider configured for that yet. Set ANTHROPIC_KEY for the smart brain, or enable an available local fallback.";
    onSentence(msg);
    await recordReply(userInput, msg, opts);
    return msg;
  }

  let fullText = "";
  let turn = 0;
  const circuit = makeToolCircuit();

  while (turn < MAX_TOOL_TURNS) {
    const streamOpts: any = {
      model: route.model || MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      system,
      messages,
    };
    if (route.toolsEnabled) streamOpts.tools = TOOLS as any;
    const stream = client.messages.stream(streamOpts);

    let buffer = "";
    let turnText = "";

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta"
      ) {
        const chunk = event.delta.text || "";
        buffer += chunk;
        turnText += chunk;
        const { sentences, remainder } = splitSentences(buffer);
        for (const s of sentences) if (s.trim()) onSentence(s.trim());
        buffer = remainder;
      }
    }

    const finalMessage = await stream.finalMessage();
    logAnthropicUsage({
      model: route.model || MODEL,
      response: finalMessage,
      metadata: usageMetadata(route, userInput, messages, `stream_turn_${turn}`),
    }).catch(() => {});
    fullText += turnText;

    if (buffer.trim()) {
      onSentence(buffer.trim());
      buffer = "";
    }

    if (!route.toolsEnabled || finalMessage.stop_reason !== "tool_use") {
      await recordReply(userInput, fullText, opts, true);
      return fullText;
    }

    const toolUses = finalMessage.content.filter((b) => b.type === "tool_use");
    const toolResults = await runToolUses(toolUses);

    messages.push({ role: "assistant", content: finalMessage.content });
    messages.push({ role: "user", content: toolResults });

    const tripped = tripCircuit(circuit, toolUses, toolResults);
    if (tripped) {
      console.warn(`[brain] circuit breaker: ${tripped} after ${turn + 1} tool turn(s)`);
      const reply = circuitReply(toolResults, tripped);
      onSentence(reply);
      const out = fullText ? `${fullText} ${reply}` : reply;
      await recordReply(userInput, out, opts, true);
      return out;
    }
    turn++;
  }

  const safeText = fullText || "I'm not sure how to respond to that.";
  await recordReply(userInput, safeText, opts, true);
  return safeText;
}

/**
 * Handle clear, deterministic requests without calling Anthropic.
 * Returns null when the turn needs the full LLM.
 */
export async function tryLocalFastPath(userInput: string, opts: Record<string, any> = {}): Promise<string | null> {
  return tryLocalFastPathImpl(userInput, { handlers }, opts);
}

// Re-export conversation manager functions for backward compatibility
export const wasResumed = ConversationManager.wasResumed;
export const resetConversation = ConversationManager.resetConversation;
export const clearCurrentConversation = ConversationManager.clearCurrentConversation;
export const listConversations = ConversationManager.listConversations;
export const searchConversations = ConversationManager.searchConversations;
export const getCurrentConversation = ConversationManager.getCurrentConversation;
export const newConversation = ConversationManager.newConversation;
export const switchConversation = ConversationManager.switchConversation;
export const renameConversation = ConversationManager.renameConversation;
export const pinConversation = ConversationManager.pinConversation;
export const deleteConversation = ConversationManager.deleteConversation;
export const getPendingConfirmationState = () => {
  return getPendingConfirmation();
};
