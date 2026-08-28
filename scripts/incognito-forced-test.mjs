// Re-attach to the still-open genuine-incognito Chrome and test the WORST case:
// a forced bare /app document load (no host), which bypasses the sticky-params
// source fix. In real incognito the partitioned navaal_shop cookie IS sent, so
// the backstop should resolve the shop and recover to the app (no form, no 404).
import { chromium } from "@playwright/test";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const APP_ROOT = `https://admin.shopify.com/store/${STORE}/apps/${APP}`;

const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => /admin\.shopify\.com\/store\//.test(p.url())) || ctx.pages()[0] || (await ctx.newPage());

const frameOf = () => page.frames().find((f) => /navaal|app\.navaal\.ai/.test(f.url()));
const appFrame = () => page.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[forced] ${m}`);

// 1) Open the app so the authenticated load persists the navaal_shop cookie.
log("opening app to persist the shop cookie…");
await page.goto(`${APP_ROOT}/app`, { waitUntil: "domcontentloaded" }).catch(() => {});
await appFrame().locator("body").waitFor({ state: "visible", timeout: 45000 }).catch(() => {});
await page.waitForTimeout(5000);

// 2) Confirm the cookie is set (in the app-frame partition).
let cookieStr = "";
try { cookieStr = await frameOf().evaluate(() => document.cookie); } catch (e) { cookieStr = "(unreadable: " + e.message + ")"; }
log("app-frame document.cookie: " + cookieStr);
const hasCookie = /navaal_shop=/.test(cookieStr);
log("navaal_shop cookie present: " + hasCookie);

// 3) Force the worst-case bare /app load (no host/shop/id_token).
log("FORCING bare /app document load (no host) — the exact dead-end…");
try { await frameOf().evaluate(() => window.location.assign("/app")); } catch (e) { log("force err: " + e.message); }

// 4) Wait for the multi-hop recovery and read the result.
let frameText = "", frameUrl = "";
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  const fr = frameOf();
  if (fr) { frameUrl = fr.url(); }
  try { frameText = await appFrame().locator("body").innerText({ timeout: 2000 }); } catch { frameText = ""; }
  if (/Welcome back|Monthly Usage|Choose Your Plan|Brand voice|Shop domain|>Log in</i.test(frameText)) break;
}
const form = /Shop domain|name="shop"|>Log in<|heading="Log in"/i.test(frameText);
const recovered = /Welcome back|Monthly Usage|Choose Your Plan|Brand voice|Professional|Free/i.test(frameText) && !form;
log("final app-frame url: " + frameUrl);
log("final top url: " + page.url());
log("body sample: " + frameText.replace(/\s+/g, " ").slice(0, 100));
await page.screenshot({ path: "verify-incognito/forced-hostless-result.png" }).catch(() => {});
console.log(`\nRESULT: form=${form} recovered=${recovered} cookiePresent=${hasCookie}`);
console.log(form ? "❌ FORM SHOWN" : recovered ? "✅ RECOVERED to the app (no form)" : "⚠️ no form but did not clearly recover");
try { browser.close(); } catch { /* keep window */ }
process.exit(0);
