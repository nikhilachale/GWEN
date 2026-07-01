// src/skills/redaction.ts - mask high-confidence secrets in returned file text.

export type RedactionResult = {
  text: string;
  redacted: boolean;
  count: number;
};

const RULES: Array<{ name: string; re: RegExp; replacement?: string | ((match: string, ...args: any[]) => string) }> = [
  {
    name: "pem_private_key",
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED PRIVATE KEY]",
  },
  {
    name: "bearer_token",
    re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g,
    replacement: "Bearer [REDACTED TOKEN]",
  },
  {
    name: "openai_like_key",
    re: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    replacement: "[REDACTED API KEY]",
  },
  {
    name: "github_token",
    re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED TOKEN]",
  },
  {
    name: "aws_access_key",
    re: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED AWS ACCESS KEY]",
  },
  {
    name: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: "[REDACTED JWT]",
  },
  {
    name: "sensitive_assignment",
    re: /(^|[\s,{])([A-Za-z0-9_.-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|secret|password|passwd|pwd)[A-Za-z0-9_.-]*\s*[:=]\s*)(["']?)([^\s"',}]{8,})(\3)/gim,
    replacement: (_match, prefix, key, quote, _value, closeQuote) => `${prefix}${key}${quote}[REDACTED]${closeQuote}`,
  },
];

export function redactSensitiveText(input: string): RedactionResult {
  let text = String(input ?? "");
  let count = 0;

  for (const rule of RULES) {
    text = text.replace(rule.re, (...args: any[]) => {
      count += 1;
      if (typeof rule.replacement === "function") return rule.replacement(...args);
      return rule.replacement || `[REDACTED ${rule.name.toUpperCase()}]`;
    });
  }

  return {
    text,
    redacted: count > 0,
    count,
  };
}
