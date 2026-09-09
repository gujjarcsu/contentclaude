// Refresh the saved admin session WITHOUT typing credentials: when Shopify
// shows "Choose an account" (the accounts.shopify.com session is still alive
// but the admin session lapsed), clicking the listed account is enough. If a
// password / 2FA prompt appears instead, this exits 2 — run
// scripts/login-cdp.mjs and log in yourself.
//
//   node scripts/refresh-session.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const AUTH_FILE = "tests/e2e/.auth/shopify.json";
const OUT = "proof-items12";
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[session] ${new Date().toISOString()} ${m}`);

const browser = await chromium.launch({
  headless: false, channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run"],
});
const context = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();
let code = 1;
try {
  await page.goto(`https://admin.shopify.com/store/${STORE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  log("landed: " + page.url());
  if (/accounts\.shopify\.com/.test(page.url())) {
    const account = page.getByRole("button", { name: /Waqas Ahmad|gujjarcsu@gmail\.com/i }).first()
      .or(page.locator("a, button, [role=button]").filter({ hasText: /gujjarcsu@gmail\.com/i }).first());
    await account.waitFor({ state: "visible", timeout: 15000 });
    await account.click();
    log("clicked the listed account");
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1000);
      if (/admin\.shopify\.com\/store\//.test(page.url())) break;
    }
    log("after click: " + page.url());
  }
  await page.screenshot({ path: `${OUT}/session-refresh.png` }).catch(() => {});
  if (/admin\.shopify\.com\/store\//.test(page.url())) {
    await context.storageState({ path: AUTH_FILE });
    log("admin reached — storage state refreshed");
    code = 0;
  } else {
    const t = await page.locator("body").innerText().catch(() => "");
    log("not in admin. page says: " + t.replace(/\s+/g, " ").slice(0, 300));
    code = /password|verification|code|passkey/i.test(t) ? 2 : 1;
  }
} catch (e) {
  log("ERROR " + e.message);
} finally {
  await context.close(); await browser.close();
  process.exit(code);
}
