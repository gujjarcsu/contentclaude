// Reconcile probe for the 1.2.3 investigation. Does NOT upgrade — it only loads
// the Plans page repeatedly (the way the reviewer reloaded) so the post-paint
// reconcile fetcher (/app/plans-reconcile) fires each time, emitting the
// RECONCILE_DIAG / RESOLVE_BILLING_TEST_DIAG / SYNC_DIAG lines we tail from
// `fly logs`. Reports what the in-app Plans page shows on each reload.
//
//   node scripts/reconcile-probe.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const PLANS_URL = `https://admin.shopify.com/store/${STORE}/apps/${APP}/app/plans`;
const RELOADS = Number(process.env.PROBE_RELOADS || 4);
const GAP_MS = Number(process.env.PROBE_GAP_MS || 30000);
const OUT = "reconcile-probe";
fs.mkdirSync(OUT, { recursive: true });

const appFrame = (page) =>
  page.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[reconcile-probe] ${new Date().toISOString()} ${m}`);

const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run"],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/shopify.json",
  viewport: { width: 1440, height: 900 },
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});
const page = await context.newPage();

const readPlanText = async () => {
  const f = appFrame(page);
  const body = await f.locator("body").innerText().catch(() => "");
  const m = body.match(/You're on the (\w+) plan/i);
  const current = body.match(/(Starter|Growth|Professional|Free)[\s\S]{0,40}(Current Plan|Active Plan|Current plan)/i);
  return { banner: m ? m[1] : null, current: current ? current[1] : null };
};

try {
  log(`warming admin app root for ${STORE}…`);
  await page.goto(`https://admin.shopify.com/store/${STORE}/apps/${APP}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  if (/challenge|verify you are human|needs to be verified/i.test(await page.content().catch(() => ""))) {
    throw new Error("CLOUDFLARE_CHALLENGE");
  }
  await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});

  for (let i = 1; i <= RELOADS; i++) {
    log(`--- reload ${i}/${RELOADS}: opening Plans (fires reconcile) ---`);
    try { await page.goto(PLANS_URL, { waitUntil: "domcontentloaded" }); }
    catch { await page.waitForTimeout(3000); await page.goto(PLANS_URL, { waitUntil: "domcontentloaded" }); }
    await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    // Give the post-paint fetcher time to fire billing.check + reconcile.
    await page.waitForTimeout(8000);
    const state = await readPlanText();
    log(`reload ${i} in-app plan: banner=${state.banner} current=${state.current}`);
    await page.screenshot({ path: `${OUT}/reload-${i}.png` }).catch(() => {});
    if (i < RELOADS) { log(`waiting ${GAP_MS}ms before next reload…`); await page.waitForTimeout(GAP_MS); }
  }
  log("done — check fly logs for RECONCILE_DIAG / RESOLVE_BILLING_TEST_DIAG / SYNC_DIAG");
} catch (err) {
  log(`ERROR: ${err.message}`);
} finally {
  await context.close();
  await browser.close();
  process.exit(0);
}
