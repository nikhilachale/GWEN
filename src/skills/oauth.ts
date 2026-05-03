// src/skills/oauth.js — Google OAuth2 with auto-refresh
import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve relative TOKEN_PATH against the project root (two levels up from this
// file), not process.cwd() — protects against scripts run from a subdirectory.
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW_TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || "./data/google-token.json";
const TOKEN_PATH = path.isAbsolute(RAW_TOKEN_PATH)
  ? RAW_TOKEN_PATH
  : path.resolve(PROJECT_ROOT, RAW_TOKEN_PATH);

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

let cachedClient = null;

/** Strip whitespace and optional surrounding quotes from .env values (avoids Google 400 / malformed). */
function normalizeEnv(value) {
  if (value == null || value === "") return value;
  let s = String(value).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

const DEFAULT_REDIRECT = "http://localhost:3000/oauth2callback";

function buildClient() {
  const clientId = normalizeEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = normalizeEnv(process.env.GOOGLE_CLIENT_SECRET);
  const redirectUri =
    normalizeEnv(process.env.GOOGLE_REDIRECT_URI) || DEFAULT_REDIRECT;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Get a configured OAuth2Client. Throws if no token has been saved yet.
 */
export async function getAuthClient() {
  if (cachedClient) return cachedClient;

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      "Google token not found. Run `npm run setup-oauth` first."
    );
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  const client = buildClient();
  client.setCredentials(tokens);

  // Persist refreshed tokens
  client.on("tokens", (newTokens) => {
    const merged = { ...tokens };
    if (newTokens.refresh_token) merged.refresh_token = newTokens.refresh_token;
    if (newTokens.access_token)  merged.access_token = newTokens.access_token;
    if (newTokens.expiry_date)   merged.expiry_date = newTokens.expiry_date;
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
  });

  cachedClient = client;
  return client;
}

export function isTokenValid() {
  try {
    if (!fs.existsSync(TOKEN_PATH)) {
      if (process.env.MJ_DEBUG_OAUTH) console.warn(`[oauth] no token at ${TOKEN_PATH}`);
      return false;
    }
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    const ok = !!(tokens && (tokens.refresh_token || tokens.access_token));
    if (!ok && process.env.MJ_DEBUG_OAUTH) {
      console.warn(`[oauth] token at ${TOKEN_PATH} missing required fields`);
    }
    return ok;
  } catch (err) {
    if (process.env.MJ_DEBUG_OAUTH) console.warn(`[oauth] token read failed:`, err.message);
    return false;
  }
}

export function getTokenPath() {
  return TOKEN_PATH;
}

export function getAuthUrl() {
  const client = buildClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    include_granted_scopes: true,
  });
}

/** For setup script: exact redirect URI after normalizing .env (must match Google Cloud). */
export function getConfiguredRedirectUri() {
  return normalizeEnv(process.env.GOOGLE_REDIRECT_URI) || DEFAULT_REDIRECT;
}

export async function exchangeCodeForToken(code) {
  const client = buildClient();
  const { tokens } = await client.getToken(code);
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return tokens;
}

export { SCOPES };
