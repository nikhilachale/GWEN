// scripts/setup-google-oauth.js — interactive Google OAuth setup
// Run: npm run setup-oauth
import "dotenv/config";
import http from "node:http";
import { URL } from "node:url";
import {
  getAuthUrl,
  exchangeCodeForToken,
  getConfiguredRedirectUri,
} from "../src/skills/oauth.js";

const PORT = 3000;

let openBrowser = async (url) => {
  console.log("Open this URL manually:", url);
};
try {
  const mod = await import("open");
  openBrowser = mod.default;
} catch {
  // fall back to manual
}

async function main() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error("✗ Missing GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET in .env");
    console.error("  Create OAuth credentials at https://console.cloud.google.com/apis/credentials");
    console.error("  Add http://localhost:3000/oauth2callback as an authorized redirect URI");
    process.exit(1);
  }

  const url = getAuthUrl();
  const fromQuery = new URL(url).searchParams.get("redirect_uri");
  const redirectForGoogle = fromQuery
    ? decodeURIComponent(fromQuery)
    : getConfiguredRedirectUri();

  console.log("\n── Google Cloud checklist ──");
  console.log(
    "1. Credentials → OAuth 2.0 Client IDs → use type \"Web application\" for this flow."
  );
  console.log(
    "2. Under Authorized redirect URIs, add this EXACT string (character-for-character):"
  );
  console.log("   " + redirectForGoogle);
  console.log(
    "3. OAuth consent screen: if the app is \"In production\", Google may block http://localhost. Set the app to Testing (or use a public HTTPS redirect) for local dev."
  );
  console.log("──────────────────────────\n");
  console.log("→ Opening your browser to authorize MJ...\n");

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
      if (reqUrl.pathname !== "/oauth2callback") {
        res.writeHead(404);
        return res.end();
      }
      const code = reqUrl.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        return res.end("Missing code parameter");
      }

      await exchangeCodeForToken(code);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html><body style="font-family: system-ui; padding: 40px; background: #000; color: #00d4ff;">
          <h1>✓ MJ is connected.</h1>
          <p>You can close this tab.</p>
        </body></html>
      `);
      console.log("✓ Token saved to data/google-token.json");
      setTimeout(() => server.close(() => process.exit(0)), 500);
    } catch (err) {
      console.error("✗ Token exchange failed:", err.message);
      res.writeHead(500);
      res.end("Error: " + err.message);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    openBrowser(url).catch(() => {
      console.log("Visit:", url);
    });
  });
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
