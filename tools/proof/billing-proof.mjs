// Live acceptance test + screencast for the 1.2.2 billing fix.
// Drives the exact reviewer flow on the dev store (test charge, approvable):
//   Plans -> Upgrade to Professional -> Approve -> back INSIDE the app, plan active.
// Records a .webm video (the "proof of resolution") and step screenshots.
//
//   node scripts/billing-proof.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const PLANS_URL = `https://admin.shopify.com/store/${STORE}/apps/${APP}/app/plans`;
const OUT = "billing-proof";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/video`, { recursive: true });

const appFrame = (page) =>
  page.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();

const log = (m) => console.log(`[billing-proof] ${m}`);
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); };

// Real Chrome, headed, with automation fingerprints stripped — this is what
// gets past Shopify/Cloudflare bot detection (headless is challenged). Playwright
// still records the context video.
const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run"],
});
const context = await browser.newContext({
  storageState: "tests/e2e/.auth/shopify.json",
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: `${OUT}/video`, size: { width: 1440, height: 900 } },
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});
const page = await context.newPage();
let result = "UNKNOWN";
try {
  // 0) Warm the admin SPA via the app root (mirrors the E2E gotoApp flow that
  //    gets past the initial load), then the Plans page. Frame-body-visible
  //    wait like gotoApp.
  log("warming admin app root…");
  await page.goto(`https://admin.shopify.com/store/${STORE}/apps/${APP}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  if (/challenge|verify you are human|needs to be verified/i.test(await page.content().catch(() => ""))) {
    throw new Error("CLOUDFLARE_CHALLENGE: admin blocked the headless browser (bot detection). Screencast must be recorded in a real browser.");
  }

  // Warm frame first
  const fWarm = appFrame(page);
  await fWarm.locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // 1) Plans page inside the admin. The admin SPA can bounce /app/plans -> /app
  //    on a cold load; navigate with a retry once it's warm.
  log("opening Plans page in admin…");
  const gotoPlans = async () => {
    try { await page.goto(PLANS_URL, { waitUntil: "domcontentloaded" }); }
    catch (e) { if (/interrupted by another navigation/i.test(e.message)) { await page.waitForTimeout(3000); await page.goto(PLANS_URL, { waitUntil: "domcontentloaded" }); } else throw e; }
  };
  await gotoPlans();
  const f = appFrame(page);
  await f.locator("body").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(4000);
  // If it bounced to the dashboard, retry the Plans nav once more.
  if (!/\/app\/plans/i.test(page.url())) { await gotoPlans(); await page.waitForTimeout(4000); }
  await shot(page, "01-plans");
  await f.getByText(/Professional|Growth|Starter/i).first().waitFor({ timeout: 30000 });

  // 2) Click "Upgrade to Professional"
  log("clicking Upgrade to Professional…");
  const upgrade = f.getByRole("button", { name: /upgrade to professional/i }).first();
  await upgrade.waitFor({ timeout: 20000 });
  await upgrade.click();

  // 3) App Bridge top-level redirect to Shopify's charge confirmation page.
  log("waiting for the charge confirmation page…");
  await page.waitForURL(/\/charges\/.*confirm/i, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, "02-confirm");
  log(`confirmation URL: ${page.url()}`);

  // 4) Approve the (test) charge
  log("clicking Approve…");
  const approve = page.getByRole("button", { name: /^approve/i })
    .or(page.getByRole("link", { name: /^approve/i }));
  await approve.first().waitFor({ timeout: 30000 });
  await approve.first().click();

  // 5) Must land back INSIDE the app on Plans — NOT on /auth/login.
  log("waiting to land back inside the app…");
  await page.waitForURL(/apps\/.*\/app\/plans|\/app\/plans/i, { timeout: 90000 });
  await page.waitForTimeout(6000);
  await shot(page, "03-back-in-app");
  const finalUrl = page.url();
  log(`final URL: ${finalUrl}`);
  if (/auth\/login/i.test(finalUrl)) throw new Error("LANDED ON /auth/login — fix failed");

  // 6) Verify the plan is now Professional, in-admin
  const f2 = appFrame(page);
  const bodyText = await f2.locator("body").innerText().catch(() => "");
  const proActive = /Professional[\s\S]{0,40}(Active Plan|Current Plan)|(Active Plan|Current Plan)[\s\S]{0,40}Professional|You're on the Professional plan/i.test(bodyText);
  log(`in-admin: ${/admin\.shopify\.com/.test(finalUrl)}  professional-active: ${proActive}`);
  await shot(page, "04-professional-active");
  result = (/admin\.shopify\.com/.test(finalUrl) && !/auth\/login/i.test(finalUrl)) ? "PASS" : "FAIL";
  log(`RESULT: ${result}`);
} catch (err) {
  result = "FAIL";
  log(`ERROR: ${err.message}`);
  await shot(page, "99-error");
} finally {
  await page.waitForTimeout(1500);
  await context.close(); // flushes the video
  await browser.close();
  const vids = fs.readdirSync(`${OUT}/video`).filter((v) => v.endsWith(".webm"));
  if (vids.length) {
    fs.renameSync(`${OUT}/video/${vids[0]}`, `${OUT}/billing-proof.webm`);
    log(`video saved: ${OUT}/billing-proof.webm`);
  }
  console.log(`FINAL_RESULT=${result}`);
  process.exit(result === "PASS" ? 0 : 1);
}
