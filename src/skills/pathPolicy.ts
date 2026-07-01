// src/skills/pathPolicy.ts - conservative local path safety checks for file tools.
import os from "node:os";
import path from "node:path";

const SHORTCUTS: Record<string, string> = {
  desktop: "~/Desktop",
  downloads: "~/Downloads",
  documents: "~/Documents",
  pictures: "~/Pictures",
  movies: "~/Movies",
  music: "~/Music",
  home: "~",
  "~": "~",
};

const SECRET_BASENAME_RE = /^(?:\.?env(?:\..*)?|\.netrc|\.npmrc|\.pypirc|\.pgpass|\.git-credentials|credentials(?:\..*)?|token(?:s)?(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*(?:private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|oauth|client[_-]?secret|service[_-]?account).*)$/i;
const PRIVATE_DIR_RE = /^(?:\.ssh|\.gnupg|\.aws|\.azure|\.config\/gh|\.docker|\.kube|keychains?|mail|messages|cookies|login data|local state)$/i;

const SYSTEM_PREFIXES = [
  "/bin",
  "/cores",
  "/dev",
  "/etc",
  "/private/etc",
  "/private/var/db",
  "/private/var/root",
  "/sbin",
  "/System",
  "/usr/bin",
  "/usr/sbin",
  "/var/db",
  "/var/root",
];

const HOME_PRIVATE_SEGMENTS = [
  "Library/Keychains",
  "Library/Mail",
  "Library/Messages",
  "Library/Cookies",
  "Library/Group Containers",
  "Library/Containers/com.apple.mail",
  "Library/Application Support/AddressBook",
  "Library/Application Support/Google/Chrome",
  "Library/Application Support/Firefox",
  "Library/Application Support/Slack",
  ".config/gh",
  ".config/gcloud",
];

export type PathClassification = {
  path: string;
  allowed: boolean;
  kind: "normal" | "secret" | "private" | "system";
  reason?: string;
};

export function resolveUserPath(input?: string, fallback = path.join(os.homedir(), "Desktop")) {
  if (!input) return fallback;
  const trimmed = String(input).trim();
  const expanded = SHORTCUTS[trimmed.toLowerCase()] || trimmed;
  if (expanded.startsWith("~")) {
    return path.resolve(os.homedir(), expanded.slice(1).replace(/^\/+/, ""));
  }
  return path.resolve(expanded);
}

export function classifyPath(target: string): PathClassification {
  const resolved = path.resolve(target);
  const normalized = normalizeForPolicy(resolved);
  const homeRelative = relativeToHome(normalized);
  const basename = path.basename(normalized);
  const segments = normalized.split(path.sep).filter(Boolean);

  if (isUnderAny(normalized, SYSTEM_PREFIXES)) {
    return deny(resolved, "system", "system path");
  }

  if (homeRelative && HOME_PRIVATE_SEGMENTS.some((p) => isSameOrInsideRelative(homeRelative, p))) {
    return deny(resolved, "private", "private application data");
  }

  if (segments.some((segment) => PRIVATE_DIR_RE.test(segment))) {
    return deny(resolved, "private", "private credential or application directory");
  }

  if (SECRET_BASENAME_RE.test(basename)) {
    return deny(resolved, "secret", "secret or credential filename");
  }

  return { path: resolved, allowed: true, kind: "normal" };
}

export function pathDeniedMessage(policy: PathClassification, action = "access") {
  return `Blocked ${action} to ${policy.path}: ${policy.reason || "sensitive path"}.`;
}

function deny(pathValue: string, kind: PathClassification["kind"], reason: string): PathClassification {
  return { path: pathValue, allowed: false, kind, reason };
}

function normalizeForPolicy(value: string) {
  return path.resolve(value).replace(/\/+$/, "") || path.parse(value).root;
}

function relativeToHome(value: string) {
  const home = normalizeForPolicy(os.homedir());
  const rel = path.relative(home, value);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return "";
  return rel;
}

function isUnderAny(value: string, prefixes: string[]) {
  return prefixes.some((prefix) => isSameOrInside(value, prefix));
}

function isSameOrInside(value: string, parent: string) {
  const normalizedValue = normalizeForPolicy(value);
  const normalizedParent = normalizeForPolicy(parent);
  return normalizedValue === normalizedParent || normalizedValue.startsWith(`${normalizedParent}${path.sep}`);
}

function isSameOrInsideRelative(value: string, parent: string) {
  const normalizedValue = path.normalize(value);
  const normalizedParent = path.normalize(parent);
  return normalizedValue === normalizedParent || normalizedValue.startsWith(`${normalizedParent}${path.sep}`);
}
