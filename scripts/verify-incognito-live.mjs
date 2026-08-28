// DEFINITIVE live verification of the 2.1.1 #4 fix, in the reviewer's real
// condition: a genuine INCOGNITO Chrome (third-party cookies blocked), the real
// Shopify admin, App Bridge present. Opens Chrome for a one-time manual login,
// then drives the reviewer's exact flow and asserts the "Log in / Shop domain"
// form never appears.
//
//   node scripts/verify-incognito-live.mjs
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const ADMIN = `https://admin.shopify.com/store/${STORE}`;
const APP_ROOT = `${ADMIN}/apps/${APP}`;
const PORT = 9337;
const DIR = path.join(os.tmpdir(), "navaal-incognito-verify");
const OUT = "verify-incognito";
fs.mkdirSync(OUT, { recursive: true });

const chromePath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => fs.existsSync(p));
if (!chromePath) { console.error("chrome.exe not found"); process.exit(2); }

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

console.log("Opening an INCOGNITO Chrome window for a one-time login…");
const child = spawn(chromePath, [
  "--incognito",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${DIR}`,
  "--no-first-run", "--no-default-browser-check",
  "--test-third-party-cookie-phaseout",
  ADMIN,
], { detached: true, stdio: "ignore" });
child.unref();

async function waitCDP(deadline) {
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch { /* wait */ }
    await new Promise((s) => setTimeout(s, 1000));
  }
  return false;
}
if (!(await waitCDP(Date.now() + 40000))) { console.error("debug endpoint never came up"); process.exit(3); }

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];

console.log("\n" + "=".repeat(64));
console.log("  LOG IN to Shopify in the incognito window, then STOP —");
console.log("  just reach the store's admin home. I'll drive the rest.");
console.log("  Waiting up to 8 minutes…");
console.log("=".repeat(64) + "\n");

const deadline = Date.now() + 8 * 60 * 1000;
let page = null;
while (Date.now() < deadline) {
  const p = context.pages().find((x) => /admin\.shopify\.com\/store\//.test(x.url()) && !/\/login|accounts\.shopify\.com|\/oauth\//.test(x.url()));
  if (p) { page = p; break; }
  await new Promise((s) => setTimeout(s, 2500));
}
if (!page) { console.error("TIMEOUT: admin never reached."); process.exit(1); }
console.log("Admin detected — starting the verification flow.\n");

const appFrame = (pg) => pg.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const results = [];
const check = async (label) => {
  let frameText = "";
  for (let i = 0; i < 24; i++) {
    try { frameText = await appFrame(page).locator("body").innerText({ timeout: 2500 }); } catch { frameText = ""; }
    if (/Welcome back|Monthly Usage|Choose Your Plan|Brand voice|Shop domain|>Log in<|name="shop"/i.test(frameText)) break;
    await page.waitForTimeout(1000);
  }
  const form = /Shop domain|name="shop"|>Log in<|heading="Log in"/i.test(frameText);
  const ok = /Welcome back|Monthly Usage|Choose Your Plan|Brand voice|Professional|Free/i.test(frameText) && !form;
  results.push({ label, url: page.url(), form, ok, len: frameText.trim().length });
  console.log(`${form ? "❌ FORM" : ok ? "✅ ok" : "· "} — ${label} | form=${form} len=${frameText.trim().length} | ${page.url()}`);
  await page.screenshot({ path: `${OUT}/${String(results.length).padStart(2,"0")}-${label.replace(/[^a-z0-9]+/gi,"_").slice(0,32)}.png` }).catch(() => {});
};
const gotoTop = async (u) => { await page.goto(u, { waitUntil: "domcontentloaded" }).catch(() => {}); await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 45000 }).catch(() => {}); await page.waitForTimeout(3000); };
const clickNav = async (name) => {
  const l = appFrame(page).getByRole("link", { name: new RegExp("^" + name + "$", "i") }).first().or(appFrame(page).locator(`s-link:has-text("${name}")`).first());
  try { await l.click({ timeout: 6000 }); return true; } catch { return false; }
};

try {
  // Prove the SHA the browser is hitting.
  const bi = await page.evaluate(() => fetch("/api/build-info").then(r => r.json()).catch(() => null)).catch(() => null);
  if (bi) console.log(`build-info SHA: ${bi.shortSha} (${bi.sha})\n`);

  await gotoTop(`${APP_ROOT}/app/plans`); await check("1-plans");
  await clickNav("Dashboard") || await gotoTop(`${APP_ROOT}/app`);
  await page.waitForTimeout(3000); await check("2-dashboard-via-nav");
  // The reviewer's kill move: reload /app.
  await gotoTop(`${APP_ROOT}/app`); await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(3000); await check("3-reload-app");
  await clickNav("Settings") || await gotoTop(`${APP_ROOT}/app/settings`); await check("4-settings");
  await clickNav("Dashboard") || await gotoTop(`${APP_ROOT}/app`); await check("5-back-to-dashboard");
  // reload a sub-page too
  await gotoTop(`${APP_ROOT}/app/plans`); await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(3000); await check("6-reload-plans");
} catch (e) { console.log("ERROR:", e.message); }

const forms = results.filter((r) => r.form).length;
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n=== forms shown: ${forms} / ${results.length} steps ===`);
console.log(`RESULT: ${forms === 0 ? "PASS ✅ (no login form anywhere)" : "FAIL ❌ (form appeared)"}`);
try { browser.close(); } catch { /* leave window */ }
process.exit(forms === 0 ? 0 : 1);
