export type MemorySensitivity = "normal" | "sensitive" | "secret";

export type SensitiveMemorySignal =
  | "credential"
  | "financial"
  | "health"
  | "identity_document"
  | "location"
  | "personal_contact"
  | "relationship"
  | "work_confidential";

export type SensitiveMemoryClassification = {
  sensitivity: MemorySensitivity;
  signals: SensitiveMemorySignal[];
  shouldStore: boolean;
};

const SECRET_PATTERNS: Array<{ signal: SensitiveMemorySignal; re: RegExp }> = [
  { signal: "credential", re: /\b(password|passcode|api[_ -]?key|secret|token|otp|2fa|private[_ -]?key)\b/i },
];

const SENSITIVE_PATTERNS: Array<{ signal: SensitiveMemorySignal; re: RegExp }> = [
  { signal: "financial", re: /\b(bank|salary|income|credit card|debit card|ssn|tax|pan card|account number)\b/i },
  { signal: "health", re: /\b(diagnosis|medical|medication|therapy|doctor|hospital|allergy|mental health)\b/i },
  { signal: "identity_document", re: /\b(passport|driver'?s license|aadhaar|national id|visa)\b/i },
  { signal: "location", re: /\b(home address|lives at|apartment|flat number|street address)\b/i },
  { signal: "personal_contact", re: /\b(phone number|email address|personal email|contact number)\b/i },
  { signal: "relationship", re: /\b(spouse|partner|child|parent|sibling|family)\b/i },
  { signal: "work_confidential", re: /\b(confidential|nda|layoff|performance review|compensation|customer data)\b/i },
];

export function classifyMemorySensitivity(text: string): SensitiveMemoryClassification {
  const value = text || "";
  const secretSignals = SECRET_PATTERNS.filter((p) => p.re.test(value)).map((p) => p.signal);
  if (secretSignals.length) {
    return {
      sensitivity: "secret",
      signals: [...new Set(secretSignals)],
      shouldStore: false,
    };
  }

  const sensitiveSignals = SENSITIVE_PATTERNS.filter((p) => p.re.test(value)).map((p) => p.signal);
  if (sensitiveSignals.length) {
    return {
      sensitivity: "sensitive",
      signals: [...new Set(sensitiveSignals)],
      shouldStore: true,
    };
  }

  return {
    sensitivity: "normal",
    signals: [],
    shouldStore: true,
  };
}

export function isSensitiveMemory(text: string): boolean {
  return classifyMemorySensitivity(text).sensitivity !== "normal";
}

export function shouldStoreMemoryText(text: string): boolean {
  return classifyMemorySensitivity(text).shouldStore;
}

export function redactSensitiveMemoryValue(
  value: string,
  sensitivity: MemorySensitivity = classifyMemorySensitivity(value).sensitivity
): string {
  if (sensitivity === "normal") return value;
  if (sensitivity === "secret") return "[redacted secret]";
  return "[sensitive memory]";
}
