// src/skills/health.ts — read-only local readiness snapshot.
import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PROJECT_ROOT } from "./projectRoot.js";
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
  "ELEVEN_KEY",
  "ELEVEN_VOICE_ID",
  "TAVILY_KEY",
];

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const settings = await getSettings();
  const [node, npm, codex, claude, say, streamPlayer, artifacts] = await Promise.all([
    commandCheck("node", ["--version"], "Node runtime"),
    commandCheck("npm", ["--version"], "npm"),
    commandCheck(process.env.CODEX_CLI_PATH || "codex", ["--version"], "Codex CLI"),
    commandCheck(process.env.CLAUDE_CLI_PATH || "claude", ["--version"], "Claude CLI"),
    commandCheck("say", ["--version"], "macOS say"),
    firstAvailableCommand(["ffplay", "mpv", "play", "mpg123"], "Streaming audio player"),
    artifactChecks(),
  ]);

  const env = envChecks();
  const voice = voiceChecks({ settings, say, streamPlayer });
  const models = modelChecks(settings);
  const codeAgent = codeAgentChecks(settings, codex, claude);

  const sections: HealthSection[] = [
    { id: "env", title: "Environment", checks: env },
    { id: "cli", title: "CLIs", checks: [node, npm, codex, claude] },
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

function envChecks(): HealthCheck[] {
  const hasAnthropic = hasEnv("ANTHROPIC_API_KEY") || hasEnv("ANTHROPIC_KEY");
  const hasOpenAi = hasEnv("OPENAI_API_KEY") || hasEnv("OPENAI_KEY");
  const hasGroq = hasEnv("GROQ_KEY");
  const hasFish = hasEnv("FISH_KEY");
  const hasEleven = hasEnv("ELEVEN_KEY") && hasEnv("ELEVEN_VOICE_ID");

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
      label: "Cloud TTS",
      status: hasFish || hasEleven ? "ok" : "warn",
      detail: hasFish ? "Fish key present" : hasEleven ? "ElevenLabs key and voice present" : "Will fall back to macOS say",
    },
  ];
}

function voiceChecks({
  settings,
  say,
  streamPlayer,
}: {
  settings: any;
  say: HealthCheck;
  streamPlayer: HealthCheck;
}): HealthCheck[] {
  const hasCloudStt = hasEnv("GROQ_KEY") || hasEnv("OPENAI_API_KEY") || hasEnv("OPENAI_KEY");
  const hasCloudTts =
    (hasEnv("FISH_KEY") && settings.ttsProvider !== "eleven") ||
    (hasEnv("ELEVEN_KEY") && hasEnv("ELEVEN_VOICE_ID"));

  return [
    {
      id: "stt",
      label: "Speech to text",
      status: hasCloudStt ? "ok" : "warn",
      detail: hasCloudStt ? "Cloud transcription configured" : "Local Whisper fallback may download or require native audio tools",
    },
    {
      id: "tts-provider",
      label: "Text to speech",
      status: hasCloudTts || say.status === "ok" ? "ok" : "missing",
      detail: hasCloudTts ? `Configured provider: ${settings.ttsProvider}` : say.detail,
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
