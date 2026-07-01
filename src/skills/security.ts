// src/skills/security.ts — runtime guardrails for system-access tools.
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "./projectRoot.js";
import { getToolPolicy, validateToolPolicies } from "./toolPolicy.js";

const CONFIRM_TTL_MS = 2 * 60_000;
const AUDIT_PATH = path.join(PROJECT_ROOT, "data/security-audit.jsonl");

let pending: null | {
  id: string;
  name: string;
  input: any;
  summary: string;
  createdAt: number;
} = null;

function enabled() {
  return process.env.GWEN_CONFIRM_SENSITIVE_ACTIONS !== "0";
}

export function classifyTool(name: string) {
  return getToolPolicy(name).risk;
}

export function needsConfirmation(name: string) {
  return enabled() && getToolPolicy(name).confirmation === "required";
}

export function validateSecurityPolicies(toolNames: Iterable<string>) {
  validateToolPolicies(toolNames);
}

export function setPendingTool(name: string, input: any, summary: string) {
  pending = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    input,
    summary,
    createdAt: Date.now(),
  };
  return pending;
}

export function getPendingTool() {
  if (!pending) return null;
  if (Date.now() - pending.createdAt > CONFIRM_TTL_MS) {
    pending = null;
    return null;
  }
  return pending;
}

export function clearPendingTool() {
  pending = null;
}

export function isConfirmation(text: string) {
  return /^(yes|yep|yeah|confirm|confirmed|approve|approved|do it|go ahead|run it|send it|allow)$/i.test(String(text || "").trim());
}

export function isDenial(text: string) {
  return /^(no|nope|cancel|stop|don't|do not|deny)$/i.test(String(text || "").trim());
}

export function confirmationPrompt(name: string, input: any, summary: string) {
  const risk = classifyTool(name);
  const detail = summarizeInput(input);
  const prefix = risk === "destructive"
    ? "For security, I need explicit confirmation before I control your Mac or send anything."
    : "For security, I need confirmation before I access private local data.";
  return `${prefix} Confirm: ${summary}${detail ? ` (${detail})` : ""}.`;
}

export async function auditTool(event: {
  tool: string;
  risk?: string;
  action: "requested" | "awaiting_confirmation" | "confirmed" | "denied" | "blocked" | "executed" | "failed";
  summary?: string;
  detail?: string;
}) {
  try {
    await mkdir(path.dirname(AUDIT_PATH), { recursive: true });
    await appendFile(
      AUDIT_PATH,
      JSON.stringify({
        ts: new Date().toISOString(),
        tool: event.tool,
        risk: event.risk || classifyTool(event.tool),
        action: event.action,
        summary: event.summary || "",
        detail: event.detail || "",
      }) + "\n"
    );
  } catch (err: any) {
    console.warn("[security] audit failed:", err?.message || err);
  }
}

function summarizeInput(input: any) {
  if (!input || typeof input !== "object") return "";
  const parts = [];
  if (input.path) parts.push(`path: ${String(input.path).slice(0, 80)}`);
  if (input.contact) parts.push(`contact: ${String(input.contact).slice(0, 60)}`);
  if (input.to) parts.push(`to: ${String(input.to).slice(0, 60)}`);
  if (input.name) parts.push(`name: ${String(input.name).slice(0, 60)}`);
  if (input.query) parts.push(`query: ${String(input.query).slice(0, 60)}`);
  if (input.title) parts.push(`title: ${String(input.title).slice(0, 60)}`);
  return parts.join(", ");
}
