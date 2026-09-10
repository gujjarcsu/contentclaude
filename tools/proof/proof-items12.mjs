// Proof harness for brief items 1 (app name) + 2 (install-source tracking).
// Drives the REAL deployed app inside the Shopify admin with the saved partner
// session (tests/e2e/.auth/shopify.json — created by scripts/login-cdp.mjs).
//
//   node scripts/proof-items12.mjs            (PROBE_STORE defaults to contentpilot-dev2)
//
// Produces proof-items12/:
//   00-build-info.png            — /api/build-info (the SHA production serves)
//   dashboard-1440.png           — dashboard at 1440×900 (nav brand shows the new name line)
//   dashboard-390.png            — dashboard at 390×844
//   results.json                 — SHA, in-app <title>, brand text, admin sidebar app label
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const APP_ROOT = `https://admin.shopify.com/store/${STORE}/apps/${APP}`;
const OUT = "proof-items12";
fs.mkdirSync(OUT, { recursive: true });

const log = (m) => console.log(`[proof-12] ${new Date().toISOString()} ${m}`);
const frameOf = (page) => page.frames().find((f) => /app\.navaal\.ai/.test(f.url()));
const appFrame = (p) => p.frameLocator('iframe[name^="app-iframe"], iframe[src*="app.navaal.ai"]').first();

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
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();
const results = { store: STORE };

async function waitForApp() {
  await appFrame(page)
    .locator("body")
    .waitFor({ state: "visible", timeout: 60000 })
    .catch(() => {});
  for (let i = 0; i < 30; i++) {
    const t = await appFrame(page)
      .locator("body")
      .innerText({ timeout: 2000 })
      .catch(() => "");
    if (/Welcome back|Monthly Usage|Get started|Welcome to Navaal/i.test(t)) return t;
    await page.waitForTimeout(1000);
  }
  return await appFrame(page)
    .locator("body")
    .innerText()
    .catch(() => "");
}

try {
  await page.goto("https://app.navaal.ai/api/build-info", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  results.buildInfo = (
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  )
    .replace(/\s+/g, " ")
    .slice(0, 200);
  await page.screenshot({ path: `${OUT}/00-build-info.png` });
  log("build-info: " + results.buildInfo);

  await page.goto(`${APP_ROOT}/app`, { waitUntil: "domcontentloaded" });
  const text = await waitForApp();
  await page.waitForTimeout(2500);
  results.dashboardUrl = page.url();
  results.dashboardHasContent = /Welcome back|Monthly Usage|Get started/i.test(text);
  const fr = frameOf(page);
  results.inAppTitle = fr ? await fr.title().catch(() => null) : null;
  results.brandText = fr
    ? await fr
        .evaluate(() => {
          const logo = document.querySelector('s-app-nav [slot="logo"]');
          return logo ? logo.innerText.replace(/\s+/g, " ").trim() : null;
        })
        .catch(() => null)
    : null;
  // The admin's own sidebar label for the app (changes only after `shopify app deploy`).
  results.adminSidebarAppLabel = await page
    .evaluate((handle) => {
      const a = [...document.querySelectorAll("a[href*='/apps/" + handle + "']")].find((el) =>
        el.innerText.trim(),
      );
      return a ? a.innerText.replace(/\s+/g, " ").trim() : null;
    }, APP)
    .catch(() => null);
  await page.screenshot({ path: `${OUT}/dashboard-1440.png` });
  log(
    `1440 captured — title="${results.inAppTitle}" brand="${results.brandText}" sidebar="${results.adminSidebarAppLabel}"`,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/dashboard-390.png` });
  log("390 captured");
  results.ok = true;
} catch (e) {
  results.ok = false;
  results.error = e.message;
  log("ERROR " + e.message);
} finally {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await context.close();
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.ok ? 0 : 1);
}
