// App Store 1.2.3 proof: the plan must STAY Professional across page reloads.
// Flow: (optionally cancel to Free), upgrade to Professional, then reload the
// Plans page 3x over 2+ minutes — each reload fires the post-paint reconcile —
// and assert the plan is still Professional every time. Records a video (the
// "money shot" reload) and a screenshot per reload.
//
//   node scripts/billing-persist.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const PLANS_URL = `https://admin.shopify.com/store/${STORE}/apps/${APP}/app/plans`;
const RELOADS = Number(process.env.PERSIST_RELOADS || 3);
const GAP_MS = Number(process.env.PERSIST_GAP_MS || 45000); // 3×45s ≈ 2+ min
const OUT = "billing-persist";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/video`, { recursive: true });

const appFrame = (page) =>
  page.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[persist] ${new Date().toISOString()} ${m}`);

// Source of truth on the page: the "Monthly Usage <X> Plan" badge in the usage
// card. Falls back to the "955 remaining of 1000" (Pro) vs "of 25" (Free) limit.
const readCurrentPlan = async (page) => {
  const body = await appFrame(page).locator("body").innerText().catch(() => "");
  const badge = body.match(/Monthly Usage\s+([A-Za-z]+)\s+Plan/i);
  const limit = body.match(/of\s+(1000|200|50|25)\b/);
  return { badge: badge ? badge[1] : null, limit: limit ? limit[1] : null };
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
let result = "UNKNOWN";
const results = [];

try {
  log(`warming admin for ${STORE}…`);
  await page.goto(`https://admin.shopify.com/store/${STORE}/apps/${APP}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  if (/verify you are human|needs to be verified/i.test(await page.content().catch(() => ""))) throw new Error("CLOUDFLARE_CHALLENGE");
  await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});

  // Upgrade to Professional (idempotent: if already Professional the button is
  // absent and we skip straight to the reload proof).
  log("opening Plans…");
  await page.goto(PLANS_URL, { waitUntil: "domcontentloaded" });
  await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(4000);
  const f = appFrame(page);
  const upgradeBtn = f.getByRole("button", { name: /upgrade to professional/i }).first();
  if (await upgradeBtn.isVisible().catch(() => false)) {
    log("clicking Upgrade to Professional…");
    await upgradeBtn.click();
    await page.waitForURL(/\/charges\/.*confirm/i, { timeout: 60000 });
    await page.waitForTimeout(2500);
    const approve = page.getByRole("button", { name: /^approve/i }).or(page.getByRole("link", { name: /^approve/i }));
    await approve.first().waitFor({ timeout: 30000 });
    log("approving test charge…");
    await approve.first().click();
    await page.waitForURL(/apps\/.*\/app\/plans|\/app\/plans/i, { timeout: 90000 });
    await page.waitForTimeout(6000);
  } else {
    log("already Professional (no upgrade button) — proceeding to reload proof");
  }

  // THE MONEY SHOT: reload N times over 2+ minutes, assert Professional each time.
  let allPro = true;
  for (let i = 1; i <= RELOADS; i++) {
    log(`--- reload ${i}/${RELOADS} ---`);
    await page.goto(PLANS_URL, { waitUntil: "domcontentloaded" });
    await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(9000); // let the post-paint reconcile fully run
    const st = await readCurrentPlan(page);
    const isPro = /professional/i.test(st.badge || "") || st.limit === "1000";
    allPro = allPro && isPro;
    results.push({ reload: i, ...st, isPro });
    log(`reload ${i}: badge=${st.badge} limit=${st.limit} => ${isPro ? "PROFESSIONAL" : "NOT PRO"}`);
    await page.screenshot({ path: `${OUT}/reload-${i}.png` }).catch(() => {});
    if (i < RELOADS) { log(`waiting ${GAP_MS}ms…`); await page.waitForTimeout(GAP_MS); }
  }
  result = allPro ? "PASS" : "FAIL";
  log(`RESULT: ${result}`);
} catch (err) {
  result = "FAIL";
  log(`ERROR: ${err.message}`);
  await page.screenshot({ path: `${OUT}/99-error.png` }).catch(() => {});
} finally {
  await page.waitForTimeout(1000);
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(`${OUT}/video`).filter((v) => v.endsWith(".webm"));
  if (vids.length) { fs.renameSync(`${OUT}/video/${vids[0]}`, `${OUT}/billing-persist.webm`); log(`video: ${OUT}/billing-persist.webm`); }
  console.log("RESULTS_JSON=" + JSON.stringify(results));
  console.log(`FINAL_RESULT=${result}`);
  process.exit(result === "PASS" ? 0 : 1);
}
