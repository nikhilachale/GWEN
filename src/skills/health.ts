// src/skills/health.ts — read-only local readiness snapshot.
import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PROJECT_ROOT } from "./projectRoot.js";
import { getPendingConfirmation } from "./security.js";
import { getSettings } from "./settings.js";

const execFileAsync = promisify(execFile);

export type HealthStatus = "ok" | "warn" | "missing";

export type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
};

export type HealthSection = {
  id: string;
  title: string;
  checks: HealthCheck[];
};

export type HealthSnapshot = {
  generatedAt: string;
  overall: HealthStatus;
  sections: HealthSection[];
};

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_KEY",
  "OPENAI_API_KEY",
  "OPENAI_KEY",
  "GROQ_KEY",
  "FISH_KEY",
  "FISH_VOICE_ID",
  "TAVILY_KEY",
];

const MIN_NODE_MAJOR = 22;
const SECURITY_AUDIT_PATH = path.join(PROJECT_ROOT, "data/security-audit.jsonl");

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const settings = await getSettings();
  const [node, npm, codex, claude, streamPlayer, artifacts, safety] = await Promise.all([
    commandCheck("node", ["--version"], "Node runtime"),
    commandCheck("npm", ["--version"], "npm"),
    commandCheck(process.env.CODEX_CLI_PATH || "codex", ["--version"], "Codex CLI"),
    commandCheck(process.env.CLAUDE_CLI_PATH || "claude", ["--version"], "Claude CLI"),
    firstAvailableCommand(["ffplay", "mpv", "play", "mpg123"], "Streaming audio player"),
    artifactChecks(),
    safetyChecks(settings),
  ]);

  const env = envChecks();
  const voice = voiceChecks({ settings, streamPlayer });
  const models = modelChecks(settings);
  const codeAgent = codeAgentChecks(settings, codex, claude);

  const sections: HealthSection[] = [
    { id: "readiness", title: "Readiness", checks: [nodeVersionCheck(), ...setupChecklist(settings)] },
    { id: "env", title: "Environment", checks: env },
    { id: "cli", title: "CLIs", checks: [node, npm, codex, claude] },
    { id: "safety", title: "Safety", checks: safety },
    { id: "artifacts", title: "Build Artifacts", checks: artifacts },
    { id: "voice", title: "Voice", checks: voice },
    { id: "models", title: "Models", checks: models },
    { id: "code-agent", title: "Code Agent", checks: codeAgent },
  ];

  return {
    generatedAt: new Date().toISOString(),
    overall: rollup(sections.flatMap((section) => section.checks)),
    sections,
  };
}

function nodeVersionCheck(): HealthCheck {
  const major = Number(process.versions.node.split(".")[0]);
  const ok = Number.isFinite(major) && major >= MIN_NODE_MAJOR;
  return {
    id: "node-version",
    label: "Node version",
    status: ok ? "ok" : "missing",
    detail: ok
      ? `${process.version} meets project requirement >= ${MIN_NODE_MAJOR}.12.0`
      : `${process.version} is too old. Use Node ${MIN_NODE_MAJOR}.12.0 or newer.`,
  };
}

function setupChecklist(settings: any): HealthCheck[] {
  const hasAnthropic = hasEnv("ANTHROPIC_API_KEY") || hasEnv("ANTHROPIC_KEY");
  const hasFish = hasEnv("FISH_KEY") || settings.ttsProvider === "macos";
  const hasCloudStt = hasEnv("GROQ_KEY") || hasEnv("OPENAI_API_KEY") || hasEnv("OPENAI_KEY");
  return [
    {
      id: "first-run-brain",
      label: "Brain setup",
      status: hasAnthropic || settings.brainProvider === "ollama" ? "ok" : "missing",
      detail: hasAnthropic ? "Anthropic key loaded" : settings.brainProvider === "ollama" ? "Local Ollama route selected" : "Set ANTHROPIC_KEY or select Ollama",
    },
    {
      id: "first-run-voice",
      label: "Voice setup",
      status: hasFish ? "ok" : "missing",
      detail: hasFish ? `TTS provider: ${settings.ttsProvider}` : "Set FISH_KEY or switch TTS provider to macos",
    },
    {
      id: "first-run-stt",
      label: "Speech input",
      status: hasCloudStt ? "ok" : "warn",
      detail: hasCloudStt ? "Cloud STT configured" : "Will use local Whisper fallback",
    },
  ];
}

async function safetyChecks(settings: any): Promise<HealthCheck[]> {
  const pending = getPendingConfirmation();
  const lastAudit = await readLastSecurityAudit();
  return [
    {
      id: "confirm-sensitive-actions",
      label: "Confirmations",
      status: settings.confirmSensitiveActions ? "ok" : "warn",
      detail: settings.confirmSensitiveActions ? "Sensitive and destructive actions require approval" : "Confirmations are disabled",
    },
    {
      id: "safe-demo-mode",
      label: "Safe demo mode",
      status: settings.safeMode ? "ok" : "warn",
      detail: settings.safeMode ? "Destructive tools are blocked" : "Destructive tools can run after confirmation",
    },
    {
      id: "pending-confirmation",
      label: "Pending action",
      status: pending ? "warn" : "ok",
      detail: pending ? `${pending.name}: ${pending.summary}. Required reply: ${pending.requiredText}` : "No action is waiting for approval",
    },
    {
      id: "last-security-audit",
      label: "Last audit event",
      status: lastAudit ? auditStatus(lastAudit.action) : "warn",
      detail: lastAudit
        ? `${lastAudit.action} ${lastAudit.tool} at ${lastAudit.ts}${lastAudit.summary ? ` - ${lastAudit.summary}` : ""}`
        : "No security audit events recorded yet",
    },
  ];
}

async function readLastSecurityAudit(): Promise<any | null> {
  try {
    const raw = await readFile(SECURITY_AUDIT_PATH, "utf8");
    const line = raw.trim().split("\n").filter(Boolean).pop();
    return line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
}

function auditStatus(action: string): HealthStatus {
  if (action === "failed" || action === "blocked") return "warn";
  return "ok";
}

function envChecks(): HealthCheck[] {
  const hasAnthropic = hasEnv("ANTHROPIC_API_KEY") || hasEnv("ANTHROPIC_KEY");
  const hasOpenAi = hasEnv("OPENAI_API_KEY") || hasEnv("OPENAI_KEY");
  const hasGroq = hasEnv("GROQ_KEY");
  const hasFish = hasEnv("FISH_KEY");

  return [
    {
      id: "env-file",
      label: ".env",
      status: hasAnyEnv() ? "ok" : "warn",
      detail: hasAnyEnv() ? `${presentEnvKeys().length} relevant keys loaded` : "No relevant runtime keys detected",
    },
    {
      id: "anthropic",
      label: "Anthropic",
      status: hasAnthropic ? "ok" : "missing",
      detail: hasAnthropic ? "Cloud brain key present" : "Set ANTHROPIC_API_KEY or ANTHROPIC_KEY",
    },
    {
      id: "cloud-stt",
      label: "Cloud STT",
      status: hasGroq || hasOpenAi ? "ok" : "warn",
      detail: hasGroq ? "Groq STT key present" : hasOpenAi ? "OpenAI STT key present" : "Will depend on local Whisper",
    },
    {
      id: "cloud-tts",
      label: "Fish TTS",
      status: hasFish ? "ok" : "missing",
      detail: hasFish ? "Fish key present" : "Set FISH_KEY for normal voice output",
    },
  ];
}

function voiceChecks({
  settings,
  streamPlayer,
}: {
  settings: any;
  streamPlayer: HealthCheck;
}): HealthCheck[] {
  const hasCloudStt = hasEnv("GROQ_KEY") || hasEnv("OPENAI_API_KEY") || hasEnv("OPENAI_KEY");
  const usesMacOsStt = (process.env.GWEN_STT_PROVIDER || "").toLowerCase() === "macos";
  const macOsSttAvailable = process.platform === "darwin";
  const hasFish = hasEnv("FISH_KEY");
  const usesMacOsTts = settings.ttsProvider === "macos";
  const macOsTtsAvailable = process.platform === "darwin";

  return [
    {
      id: "stt",
      label: "Speech to text",
      status: usesMacOsStt ? (macOsSttAvailable ? "warn" : "missing") : hasCloudStt ? "ok" : "warn",
      detail: usesMacOsStt
        ? macOsSttAvailable
          ? "Configured provider: macos local testing"
          : "macos provider only works on macOS"
        : hasCloudStt
          ? "Cloud transcription configured"
          : "Local Whisper fallback may download or require native audio tools",
    },
    {
      id: "tts-provider",
      label: "Text to speech",
      status: usesMacOsTts ? (macOsTtsAvailable ? "warn" : "missing") : hasFish ? "ok" : "missing",
      detail: usesMacOsTts
        ? macOsTtsAvailable
          ? "Configured provider: macos local testing"
          : "macos provider only works on macOS"
        : hasFish
          ? "Configured provider: fish"
          : "Set FISH_KEY or switch to macos for local testing",
    },
    streamPlayer,
  ];
}

function modelChecks(settings: any): HealthCheck[] {
  const hasAnthropic = hasEnv("ANTHROPIC_API_KEY") || hasEnv("ANTHROPIC_KEY");
  const usesAnthropic = [settings.brainProvider, settings.defaultProvider, settings.discussionProvider, settings.smartProvider].includes(
    "anthropic"
  );

  return [
    {
      id: "brain-route",
      label: "Brain route",
      status: usesAnthropic && !hasAnthropic ? "missing" : "ok",
      detail: `${settings.brainProvider} / default ${settings.defaultProvider}`,
    },
    {
      id: "brain-model",
      label: "Brain model",
      status: settings.brainModel ? "ok" : "missing",
      detail: settings.brainModel || "No brain model set",
    },
    {
      id: "ollama-model",
      label: "Ollama fallback",
      status: settings.ollamaModel ? "ok" : "warn",
      detail: settings.ollamaModel || "No local model set",
    },
  ];
}

function codeAgentChecks(settings: any, codex: HealthCheck, claude: HealthCheck): HealthCheck[] {
  const selected = settings.codeAgent === "claude" ? claude : codex;
  return [
    {
      id: "selected-code-agent",
      label: "Selected agent",
      status: selected.status,
      detail: `${settings.codeAgent}: ${selected.detail}`,
    },
    {
      id: "code-agent-path",
      label: "Agent path override",
      status: process.env.CODEX_CLI_PATH || process.env.CLAUDE_CLI_PATH ? "ok" : "warn",
      detail: process.env.CODEX_CLI_PATH || process.env.CLAUDE_CLI_PATH || "Using PATH lookup",
    },
  ];
}

async function artifactChecks(): Promise<HealthCheck[]> {
  const checks = await Promise.all([
    fileCheck("dist/index.html", "Renderer bundle"),
    fileCheck("dist-electron/electron/main.js", "Electron main bundle"),
    fileCheck("dist-electron/electron/preload.cjs", "Preload bundle"),
    fileCheck("node_modules", "Dependencies"),
  ]);
  return checks;
}

async function fileCheck(relativePath: string, label: string): Promise<HealthCheck> {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  try {
    const info = await stat(fullPath);
    const modified = new Date(info.mtimeMs).toLocaleString();
    return {
      id: relativePath,
      label,
      status: "ok",
      detail: `${relativePath} present, modified ${modified}`,
    };
  } catch {
    return {
      id: relativePath,
      label,
      status: "missing",
      detail: `${relativePath} not found`,
    };
  }
}

async function commandCheck(command: string, args: string[], label: string): Promise<HealthCheck> {
  const resolved = await resolveCommand(command);
  if (!resolved) {
    return { id: command, label, status: "missing", detail: "Not found on PATH" };
  }

  try {
    const { stdout, stderr } = await execFileAsync(resolved, args, { timeout: 2500 });
    const version = `${stdout || stderr}`.trim().split("\n")[0] || "available";
    return { id: command, label, status: "ok", detail: version };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { id: command, label, status: "missing", detail: "Not found on PATH" };
    return { id: command, label, status: "ok", detail: "Available" };
  }
}

async function firstAvailableCommand(commands: string[], label: string): Promise<HealthCheck> {
  for (const command of commands) {
    const check = await commandCheck(command, ["--version"], label);
    if (check.status === "ok") return { ...check, label, detail: `${command}: ${check.detail}` };
  }
  return {
    id: "stream-player",
    label,
    status: "warn",
    detail: `None found: ${commands.join(", ")}. Buffered playback can still work.`,
  };
}

function rollup(checks: HealthCheck[]): HealthStatus {
  if (checks.some((check) => check.status === "missing")) return "missing";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "ok";
}

function hasEnv(key: string) {
  return !!process.env[key]?.trim();
}

function presentEnvKeys() {
  return ENV_KEYS.filter(hasEnv);
}

function hasAnyEnv() {
  return presentEnvKeys().length > 0;
}

async function resolveCommand(command: string): Promise<string | null> {
  if (command.includes("/")) {
    try {
      await access(command);
      return command;
    } catch {
      return null;
    }
  }

  try {
    const { stdout } = await execFileAsync("/usr/bin/which", [command], { timeout: 1500 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
