/**
 * Phase 12 Part D proof — the app in a language, on production, through the
 * one path a merchant has that does not depend on their admin language:
 * Settings → App language. Sets it on OUR test store, reads Home, the
 * attention page and Plans in that language, then puts the setting back.
 *
 *   node tools/proof/locale-switch.mjs <locale> [store-handle]     e.g. fr navaal-ttv-03
 *
 * WRITES: Shop.uiLocale on the named store (ours), set to <locale> and
 * restored to "" (follow the admin language) before exit. Nothing else. Needs
 * the saved admin session (tools/proof/login-cdp.mjs). Never a real merchant's
 * store.
 */
import { chromium } from "@playwright/test";
const LOCALE = process.argv[2];
const STORE = process.argv[3] || "navaal-ttv-03";
// --shots: save a full-page PNG of each screen to tools/proof/out/locale-<loc>-<screen>.png (the D6 layout check)
const SHOTS = process.argv.includes("--shots");
if (!LOCALE) {
  console.error("usage: node tools/proof/locale-switch.mjs <locale> [store-handle]");
  process.exit(2);
}
const AUTH = "tests/e2e/.auth/shopify.json";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const base = `https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content`;

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: AUTH, viewport: { width: 1600, height: 1200 }, userAgent: UA });
const page = await context.newPage();
const chunkRequests = [];
page.on("request", (r) => {
  const m = r.url().match(/\/assets\/((?:de|fr|es|it|pt-BR|ja)-[A-Za-z0-9_-]+\.js)$/);
  if (m) chunkRequests.push(m[1]);
});

async function appFrame() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const f = page.frames().find((x) => x.url().includes("app.navaal.ai"));
    if (f) return f;
    await page.waitForTimeout(500);
  }
  throw new Error("the app frame never appeared");
}
async function open(path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const frame = await appFrame();
  await page.waitForTimeout(7000);
  return frame;
}
async function readFrame(frame, label, chars = 1800) {
  if (SHOTS) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync("tools/proof/out", { recursive: true });
    const file = `tools/proof/out/locale-${LOCALE}-${label.split(" ")[0].toLowerCase()}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`screenshot: ${file}`);
  }
  const info = await frame.evaluate(() => ({
    lang: document.documentElement.getAttribute("lang"),
    url: location.pathname + location.search.replace(/(id_token|session|hmac)=[^&]*/g, "$1=…"),
    text: (document.body.innerText || "").trim(),
  }));
  console.log(`\n===== ${label} · <html lang="${info.lang}"> · ${info.url} =====\n`);
  console.log(info.text.slice(0, chars));
  return info;
}
async function setLanguage(value) {
  const frame = await open("/app/settings");
  const select = frame.locator('select[name="uiLocale"]');
  await select.waitFor({ timeout: 30_000 });
  const before = await select.inputValue();
  await select.selectOption(value);
  // the settings form's own submit, whatever its label reads in the current language
  const button = frame.locator('form:has(select[name="uiLocale"]) button[type="submit"]').first();
  await button.click();
  await page.waitForTimeout(6000);
  const after = await frame.locator('select[name="uiLocale"]').inputValue().catch(() => "?");
  console.log(`\nApp language: "${before}" → "${after}" (asked for "${value}")`);
  return after;
}

let code = 1;
try {
  const set = await setLanguage(LOCALE);
  if (set !== LOCALE) throw new Error(`App language did not stick: ${set}`);
  const home = await open("/app");
  const h = await readFrame(home, `Home in ${LOCALE}`, 2200);
  if (h.lang !== LOCALE) throw new Error(`Home lang is ${h.lang}`);
  const att = await open("/app/attention");
  const a = await readFrame(att, `Attention in ${LOCALE}`, 1200);
  const plans = await open("/app/plans");
  const p = await readFrame(plans, `Plans in ${LOCALE}`, 1000);
  console.log(`\nlocale chunks requested: ${JSON.stringify([...new Set(chunkRequests)])}`);
  const english = /\b(Review drafts|Needs attention|Total Products|Optimize store|Settings saved|products have no description|Write the rest in bulk|credits \/ month)\b/;
  const leftovers = [h, a, p].map((x) => x.text.match(english)?.[0]).filter(Boolean);
  console.log(`English leftovers on the three screens: ${leftovers.length ? "YES — " + leftovers.join(" | ") : "none of the sampled phrases"}`);
  code = a.lang === LOCALE && p.lang === LOCALE ? 0 : 1;
} catch (err) {
  console.error(`FAILED: ${err.message}`);
} finally {
  try {
    const restored = await setLanguage("");
    console.log(`restored: App language is now "${restored}" (empty = follow the admin language)`);
  } catch (err) {
    console.error(`RESTORE FAILED — set App language back by hand in Settings on ${STORE}: ${err.message}`);
    code = 2;
  }
  await browser.close();
}
process.exit(code);
