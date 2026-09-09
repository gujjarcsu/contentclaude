// Rejection #4 REAL reproduction: the reviewer's incognito condition, in the
// real Shopify admin with App Bridge present. The prior gauntlet passed only
// because Playwright let the app keep its session cookie ("warm cookies"). Here
// we STRIP Set-Cookie from every app.navaal.ai response, so the app can never
// store a session cookie and MUST re-authenticate via token exchange — exactly
// what an incognito third-party-cookie block does to the reviewer.
//
// Flow mirrors the reviewer: open app -> Plans & Billing -> Settings ->
// click back to the app (left nav / app root) -> reload /app. At every step we
// assert the "Shop domain" / "Log in" form does NOT render inside the admin.
//
//   node scripts/repro-real-incognito.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const ADMIN = `https://admin.shopify.com/store/${STORE}`;
const APP_ROOT = `${ADMIN}/apps/${APP}`;
const OUT = "repro-incognito";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/video`, { recursive: true });

const appFrame = (p) => p.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[repro] ${new Date().toISOString()} ${m}`);
const results = [];

const browser = await chromium.launch({
  headless: false, channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: [
    "--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run",
    // Chrome's third-party-cookie phaseout — same policy incognito enforces.
    "--test-third-party-cookie-phaseout",
  ],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/shopify.json",
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } },
});
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));

// Strip Set-Cookie from the app's document + data responses → no session cookie
// is ever stored → token exchange is the ONLY way the app can authenticate.
let strippedCount = 0;
await context.route("https://app.navaal.ai/**", async (route) => {
  const type = route.request().resourceType();
  if (type === "document" || type === "xhr" || type === "fetch") {
    try {
      const resp = await route.fetch();
      const headers = { ...resp.headers() };
      if (headers["set-cookie"]) { delete headers["set-cookie"]; strippedCount++; }
      const body = await resp.body().catch(() => undefined);
      await route.fulfill({ response: resp, headers, body });
    } catch { await route.continue(); }
  } else {
    await route.continue();
  }
});

const page = await context.newPage();
const check = async (label) => {
  await page.waitForTimeout(3000);
  let frameText = "";
  for (let i = 0; i < 10; i++) {
    try { frameText = await appFrame(page).locator("body").innerText({ timeout: 2500 }); } catch { frameText = ""; }
    if (frameText.trim().length > 30 || /Shop domain|>Log in<|name="shop"/i.test(frameText)) break;
    await page.waitForTimeout(1000);
  }
  const top = await page.content().catch(() => "");
  const combined = top + "\n" + frameText;
  const form = /Shop domain|name="shop"|>Log in<|heading="Log in"/i.test(combined);
  const blank = frameText.trim().length < 15;
  const onLogin = /\/auth\/login/i.test(page.url());
  const rec = { label, url: page.url(), form, blank, onLogin, contentLen: frameText.trim().length };
  results.push(rec);
  log(`${form || onLogin ? "❌ DEAD-END" : blank ? "⚠️ BLANK" : "✅ ok"} — ${label} | form=${form} blank=${blank} onLogin=${onLogin} len=${rec.contentLen} | ${page.url()}`);
  await page.screenshot({ path: `${OUT}/${String(results.length).padStart(2,"0")}-${label.replace(/[^a-z0-9]+/gi,"_").slice(0,32)}.png` }).catch(() => {});
};
const gotoTop = async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {}); await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 45000 }).catch(() => {}); };
const clickNav = async (name) => {
  const f = appFrame(page);
  const l = f.getByRole("link", { name: new RegExp("^" + name + "$", "i") }).first().or(f.locator(`s-link:has-text("${name}")`).first());
  try { await l.click({ timeout: 6000 }); return true; } catch { return false; }
};

try {
  await context.clearCookies({ domain: "app.navaal.ai" }).catch(() => {});
  await context.clearCookies({ domain: ".navaal.ai" }).catch(() => {});

  log("STEP 1 — open app fresh (cookieless)");
  await gotoTop(APP_ROOT);
  await check("1-open-app");

  log("STEP 2 — Plans & Billing");
  if (!(await clickNav("Plans & Billing"))) await gotoTop(`${APP_ROOT}/app/plans`);
  await check("2-plans");

  log("STEP 3 — Settings");
  if (!(await clickNav("Settings"))) await gotoTop(`${APP_ROOT}/app/settings`);
  await check("3-settings");

  log("STEP 4 — back to Dashboard via nav (the reviewer's failing move)");
  if (!(await clickNav("Dashboard"))) await gotoTop(`${APP_ROOT}/app`);
  await check("4-back-to-dashboard");

  log("STEP 5 — click the app name / app root '/' (loads application_url)");
  await gotoTop(APP_ROOT);
  await check("5-app-name-root");

  log("STEP 6 — hard reload of /app (reviewer: reload goes blank -> form)");
  await gotoTop(`${APP_ROOT}/app`);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await check("6-reload-app");

  log("STEP 7 — hard reload of a sub-page (/app/plans)");
  await gotoTop(`${APP_ROOT}/app/plans`);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await check("7-reload-subpage");
} catch (err) {
  log(`ERROR: ${err.message}`);
} finally {
  await page.waitForTimeout(1200).catch(() => {});
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(`${OUT}/video`).filter((v) => v.endsWith(".webm"));
  if (vids.length) fs.renameSync(`${OUT}/video/${vids[0]}`, `${OUT}/repro-incognito.webm`);
  const deadEnds = results.filter((r) => r.form || r.onLogin);
  const blanks = results.filter((r) => r.blank && !r.form);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ strippedCookies: strippedCount, results }, null, 2));
  console.log(`\n=== set-cookie stripped ${strippedCount}× (cookieless confirmed if >0) ===`);
  console.log(`=== DEAD-ENDS (form/login): ${deadEnds.length} | BLANK: ${blanks.length} | total steps: ${results.length} ===`);
  for (const r of results) console.log(`  ${r.form||r.onLogin ? "DEAD-END" : r.blank ? "BLANK   " : "ok      "}  ${r.label}`);
  console.log(`REPRODUCED=${deadEnds.length > 0 || blanks.length > 0 ? "YES" : "NO"}`);
  process.exit(0);
}
