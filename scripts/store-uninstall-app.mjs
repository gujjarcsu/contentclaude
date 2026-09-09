// Uninstall Navaal from a DEV store through the real admin UI (saved partner
// session), with a screenshot per step. Used to stage a fresh App Store
// install for the install-source-tracking proof (brief item 2).
//
//   PROBE_STORE=navaal-qa-fresh node scripts/store-uninstall-app.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "navaal-qa-fresh";
const APP_HANDLE = "navaal-seo-geo-content";
const OUT = process.env.OUT_DIR || "proof-items12";
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[uninstall] ${new Date().toISOString()} ${m}`);

const browser = await chromium.launch({
  headless: false, channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run"],
});
const context = await browser.newContext({ storageState: "tests/e2e/.auth/shopify.json", viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();
let step = 0;
const shot = async (name) => { step++; await page.screenshot({ path: `${OUT}/uninstall-${String(step).padStart(2, "0")}-${name}.png` }).catch(() => {}); };

let ok = false;
try {
  await page.goto(`https://admin.shopify.com/store/${STORE}/settings/apps/app_installations/app/${APP_HANDLE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await shot("app-settings");
  log("url: " + page.url());

  const uninstallBtn = page.getByRole("button", { name: /^uninstall( app)?$/i }).first();
  await uninstallBtn.waitFor({ state: "visible", timeout: 30000 });
  await uninstallBtn.click();
  await page.waitForTimeout(2000);
  await shot("confirm-modal");

  // Confirm dialog: a second "Uninstall" button (optionally with a reason select).
  const dialog = page.getByRole("dialog").first();
  const confirm = dialog.getByRole("button", { name: /^uninstall/i }).first();
  await confirm.waitFor({ state: "visible", timeout: 15000 });
  await confirm.click();
  await page.waitForTimeout(6000);
  await shot("after-uninstall");
  log("url after: " + page.url());

  // Verify: the app page should now 404 / show "not installed" or the apps list no longer has it.
  await page.goto(`https://admin.shopify.com/store/${STORE}/settings/apps`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await shot("apps-list");
  const text = await page.locator("body").innerText().catch(() => "");
  ok = !/Navaal/i.test(text);
  log(ok ? "app no longer listed — uninstalled" : "app still listed?");
} catch (e) {
  log("ERROR " + e.message);
  await shot("error");
} finally {
  await context.close(); await browser.close();
  console.log(`UNINSTALL_RESULT=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}
