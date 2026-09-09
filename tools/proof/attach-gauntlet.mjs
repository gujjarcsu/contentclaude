// Attach to the ALREADY-LOGGED-IN genuine incognito Chrome (port 9337) and run
// the reviewer's exact flow on a FRESH dev store. Genuine incognito = the
// reviewer's real condition. Screenshots each step; asserts the login form never
// appears. Server-side COOKIE_DIAG/REEMBED_DIAG logs are read separately.
//   PROBE_STORE=navaal-test-2 node scripts/attach-gauntlet.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "navaal-test-2";
const APP = "navaal-seo-geo-content";
const APP_ROOT = `https://admin.shopify.com/store/${STORE}/apps/${APP}`;
const OUT = "gauntlet-freshstore";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => /admin\.shopify\.com\/store/.test(p.url())) || ctx.pages()[0] || (await ctx.newPage());

const appFrame = () => page.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[fresh] ${new Date().toISOString()} ${m}`);
const results = [];
const check = async (label) => {
  let ft = "";
  for (let i = 0; i < 26; i++) {
    try { ft = await appFrame().locator("body").innerText({ timeout: 2500 }); } catch { ft = ""; }
    if (/Welcome back|Monthly Usage|Choose Your Plan|Brand voice|Get started|Shop domain|>Log in<|name="shop"/i.test(ft)) break;
    await page.waitForTimeout(1000);
  }
  const form = /Shop domain|name="shop"|>Log in<|heading="Log in"/i.test(ft);
  const ok = ft.trim().length > 60 && !form;
  results.push({ label, url: page.url(), form, ok, len: ft.trim().length });
  log(`${form ? "❌ FORM" : ok ? "✅ ok" : "· "} — ${label} | form=${form} len=${ft.trim().length} | ${page.url()}`);
  await page.screenshot({ path: `${OUT}/${String(results.length).padStart(2, "0")}-${label.replace(/[^a-z0-9]+/gi, "_").slice(0, 30)}.png` }).catch(() => {});
  return { form, ok };
};
const gotoTop = async (u) => { await page.goto(u, { waitUntil: "domcontentloaded" }).catch(() => {}); await appFrame().locator("body").waitFor({ state: "visible", timeout: 45000 }).catch(() => {}); await page.waitForTimeout(3500); };
const clickNav = async (name) => { const l = appFrame().getByRole("link", { name: new RegExp("^" + name + "$", "i") }).first().or(appFrame().locator(`s-link:has-text("${name}")`).first()); try { await l.click({ timeout: 6000 }); return true; } catch { return false; } };

let ok = true;
try {
  const bi = await page.evaluate(() => fetch("/api/build-info").then((r) => r.json()).catch(() => null)).catch(() => null);
  if (bi) log(`build-info SHA: ${bi.shortSha}`);

  await gotoTop(`${APP_ROOT}/app`); if ((await check("1-open-dashboard")).form) ok = false;
  if (!(await clickNav("Plans & Billing"))) await gotoTop(`${APP_ROOT}/app/plans`); if ((await check("2-plans")).form) ok = false;
  if (!(await clickNav("Dashboard"))) await gotoTop(`${APP_ROOT}/app`); if ((await check("3-dashboard-via-nav")).form) ok = false;
  log("reload /app (reviewer kill move)"); await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(3500); if ((await check("4-reload-app")).form) ok = false;
  if (!(await clickNav("Settings"))) await gotoTop(`${APP_ROOT}/app/settings`); if ((await check("5-settings")).form) ok = false;
  if (!(await clickNav("Dashboard"))) await gotoTop(`${APP_ROOT}/app`); if ((await check("6-back-to-dashboard")).form) ok = false;
  await gotoTop(`${APP_ROOT}/app/plans`); log("reload sub-page"); await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(3500); if ((await check("7-reload-plans")).form) ok = false;
  // app name / home (loads application_url "/")
  await gotoTop(`${APP_ROOT}`); if ((await check("8-app-name-home")).form) ok = false;
} catch (e) { log("ERROR: " + e.message); ok = false; }

const forms = results.filter((r) => r.form).length;
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n=== FRESH DEV STORE (${STORE}) — forms shown: ${forms} / ${results.length} ===`);
console.log(`RESULT: ${ok && forms === 0 ? "PASS ✅" : "FAIL ❌"}`);
try { browser.close(); } catch { /* keep window */ }
process.exit(ok && forms === 0 ? 0 : 1);
