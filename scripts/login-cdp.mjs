// Open a GENUINELY normal Chrome (plain process, no Playwright automation
// signals) on a fresh profile dir with a remote-debugging port, let the user
// log in themselves (Shopify's bot detection passes because it's a real
// browser), then attach over CDP and export the session to storageState.
//
// This is the combination that works:
//   - plain chrome.exe (not Playwright-launched) => login submit not blocked
//   - fresh user-data-dir => remote-debugging port allowed (Chrome 136+)
//   - fresh dir => no app-bound-encryption copy problem
//
// No credentials are ever seen or typed here. You log in yourself.
//   node scripts/login-cdp.mjs
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STORE = process.env.SHOP_HANDLE || "contentpilot-dev2";
const AUTH_FILE = "tests/e2e/.auth/shopify.json";
const PORT = 9333;
const DIR = path.join(os.tmpdir(), "navaal-login-profile");

const chromePath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => fs.existsSync(p));
if (!chromePath) { console.error("chrome.exe not found"); process.exit(2); }

fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

console.log("Opening a normal Chrome window for you to log in…");
const child = spawn(chromePath, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${DIR}`,
  "--no-first-run", "--no-default-browser-check",
  `https://admin.shopify.com/store/${STORE}`,
], { detached: true, stdio: "ignore" });
child.unref();

async function waitForCDP(deadline) {
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch { /* wait */ }
    await new Promise((s) => setTimeout(s, 1000));
  }
  return false;
}
if (!(await waitForCDP(Date.now() + 40000))) { console.error("Debug endpoint never came up."); process.exit(3); }

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];

console.log("\n" + "=".repeat(64));
console.log("  LOG IN in the Chrome window that just opened.");
console.log("  It is a normal browser — email, password, 2FA will all work.");
console.log("  Wait until the store admin dashboard loads.");
console.log("  The session saves automatically. You have 10 minutes.");
console.log("=".repeat(64) + "\n");

const deadline = Date.now() + 10 * 60 * 1000;
let ok = false;
let stableCount = 0;
while (Date.now() < deadline) {
  // Any admin.shopify.com page that is NOT the login/account-chooser flow means
  // the user is authenticated. Require it to persist across 2 polls (~5s) so we
  // don't snapshot mid-redirect. This is far more lenient than matching a
  // specific nav element (which varies across admin surfaces).
  const page = context.pages().find(
    (p) => /admin\.shopify\.com\/store\//.test(p.url())
      && !/\/login|accounts\.shopify\.com|\/oauth\//.test(p.url())
  );
  if (page) {
    stableCount++;
    console.log(`  authenticated admin page detected (${stableCount}/2): ${page.url()}`);
    if (stableCount >= 2) { ok = true; break; }
  } else {
    stableCount = 0;
  }
  await new Promise((s) => setTimeout(s, 2500));
}

if (!ok) { console.error("TIMEOUT: admin never loaded. Nothing saved."); await browser.close().catch(() => {}); process.exit(1); }

await context.storageState({ path: AUTH_FILE });
console.log(`SESSION SAVED to ${AUTH_FILE}`);
await browser.close().catch(() => {});
try { process.kill(-child.pid); } catch { /* best effort */ }
process.exit(0);
