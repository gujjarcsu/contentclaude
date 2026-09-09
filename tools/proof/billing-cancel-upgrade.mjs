// App Store 1.2.3 acceptance: "explicit cancel is the ONLY downgrade" + full
// Free -> Professional upgrade path (test 1). Flow:
//   Plans -> Cancel Subscription -> assert Free (limit 25)
//        -> Upgrade to Professional -> Approve -> assert Professional (limit 1000)
//        -> reload once -> assert still Professional (persistence)
// Records video + screenshots.
//
//   node scripts/billing-cancel-upgrade.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const PLANS_URL = `https://admin.shopify.com/store/${STORE}/apps/${APP}/app/plans`;
const OUT = "billing-cancel-upgrade";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/video`, { recursive: true });

const appFrame = (page) =>
  page.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[cancel-upgrade] ${new Date().toISOString()} ${m}`);
const readPlan = async (page) => {
  const body = await appFrame(page).locator("body").innerText().catch(() => "");
  const limit = body.match(/of\s+(1000|200|50|25)\b/);
  return limit ? limit[1] : null;
};
const gotoPlans = async (page) => {
  await page.goto(PLANS_URL, { waitUntil: "domcontentloaded" });
  await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);
};

const browser = await chromium.launch({
  headless: false, channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run"],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/shopify.json",
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } },
});
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();
const steps = {};
let result = "UNKNOWN";

try {
  log(`warming admin for ${STORE}…`);
  await page.goto(`https://admin.shopify.com/store/${STORE}/apps/${APP}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});

  // 1) Cancel (only if currently paid)
  await gotoPlans(page);
  let f = appFrame(page);
  const cancelBtn = f.getByRole("button", { name: /^cancel subscription$/i }).first();
  if (await cancelBtn.isVisible().catch(() => false)) {
    log("clicking Cancel Subscription…");
    await cancelBtn.click();
    await page.waitForTimeout(9000); // action + webhook + revalidate
    await gotoPlans(page);
    steps.afterCancel = await readPlan(page);
    log(`after cancel: limit=${steps.afterCancel} (expect 25=Free)`);
    await page.screenshot({ path: `${OUT}/1-after-cancel.png` }).catch(() => {});
  } else {
    log("no Cancel button (already Free) — skipping cancel step");
    steps.afterCancel = await readPlan(page);
  }

  // 2) Upgrade Free -> Professional
  f = appFrame(page);
  const upgrade = f.getByRole("button", { name: /upgrade to professional/i }).first();
  await upgrade.waitFor({ timeout: 30000 });
  log("clicking Upgrade to Professional…");
  await upgrade.click();
  await page.waitForURL(/\/charges\/.*confirm/i, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/2-confirm.png` }).catch(() => {});
  const approve = page.getByRole("button", { name: /^approve/i }).or(page.getByRole("link", { name: /^approve/i }));
  await approve.first().waitFor({ timeout: 30000 });
  log("approving…");
  await approve.first().click();
  await page.waitForURL(/apps\/.*\/app\/plans|\/app\/plans/i, { timeout: 90000 });
  await page.waitForTimeout(7000);
  steps.afterUpgrade = await readPlan(page);
  steps.landedUrl = page.url();
  log(`after upgrade: limit=${steps.afterUpgrade} (expect 1000=Pro) url=${steps.landedUrl}`);
  await page.screenshot({ path: `${OUT}/3-after-upgrade.png` }).catch(() => {});

  // 3) Reload -> still Professional
  await gotoPlans(page);
  steps.afterReload = await readPlan(page);
  log(`after reload: limit=${steps.afterReload} (expect 1000=Pro)`);
  await page.screenshot({ path: `${OUT}/4-after-reload.png` }).catch(() => {});

  const cancelOk = steps.afterCancel === "25";
  const upgradeOk = steps.afterUpgrade === "1000";
  const reloadOk = steps.afterReload === "1000";
  const inAdmin = /admin\.shopify\.com/.test(steps.landedUrl || "") && !/auth\/login/i.test(steps.landedUrl || "");
  result = cancelOk && upgradeOk && reloadOk && inAdmin ? "PASS" : "FAIL";
  log(`cancel->Free:${cancelOk} upgrade->Pro:${upgradeOk} reload-stays-Pro:${reloadOk} landed-in-admin:${inAdmin}`);
} catch (err) {
  result = "FAIL";
  log(`ERROR: ${err.message}`);
  await page.screenshot({ path: `${OUT}/99-error.png` }).catch(() => {});
} finally {
  await page.waitForTimeout(1000);
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(`${OUT}/video`).filter((v) => v.endsWith(".webm"));
  if (vids.length) fs.renameSync(`${OUT}/video/${vids[0]}`, `${OUT}/billing-cancel-upgrade.webm`);
  console.log("STEPS_JSON=" + JSON.stringify(steps));
  console.log(`FINAL_RESULT=${result}`);
  process.exit(result === "PASS" ? 0 : 1);
}
