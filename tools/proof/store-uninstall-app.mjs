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
let step = 0;
const shot = async (name) => {
  step++;
  await page
    .screenshot({ path: `${OUT}/uninstall-${String(step).padStart(2, "0")}-${name}.png` })
    .catch(() => {});
};
const tryClick = async (locators, label, opts = {}) => {
  for (const l of locators) {
    try {
      await l.first().click({ timeout: 4000, ...opts });
      log(`clicked: ${label}`);
      return true;
    } catch {
      /* next */
    }
  }
  log(`could not click: ${label}`);
  return false;
};

let ok = false;
try {
  await page.goto(
    `https://admin.shopify.com/store/${STORE}/settings/apps/app_installations/app/${APP_HANDLE}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(5000);
  await shot("app-settings");
  log("url: " + page.url());

  const uninstallBtn = page.getByRole("button", { name: /^uninstall( app)?$/i }).first();
  await uninstallBtn.waitFor({ state: "visible", timeout: 30000 });
  await uninstallBtn.click();
  await page.waitForTimeout(2000);
  await shot("confirm-modal");

  // The confirm dialog needs a reason before "Uninstall" enables. The picker is
  // a Polaris popover activator: button[aria-label="Select all that apply"]
  // [aria-haspopup=listbox] that opens a listbox of options. (Probed with
  // scripts/_probe-uninstall-modal.mjs — the modal is .Polaris-Modal-Dialog.)
  const modal = page.locator(".Polaris-Modal-Dialog").first();
  const activator = page.locator('button[aria-label="Select all that apply"]').first();
  await activator.waitFor({ state: "visible", timeout: 15000 });
  await activator.click();
  await page.waitForTimeout(1200);
  await shot("reason-open");
  const picked = await tryClick(
    [
      page.locator("[role=listbox] [role=option]"),
      page.locator("[role=listbox] li"),
      page.getByRole("option"),
      page.getByRole("checkbox"),
    ],
    "first reason option",
  );
  await page.waitForTimeout(800);
  await shot("reason-picked");
  // Close the popover with an outside click INSIDE the modal (its title) —
  // Escape closes the whole modal, and the activator toggle re-opened it.
  if (picked) {
    await modal
      .locator(".Polaris-Modal-Header, h2")
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    await page.waitForTimeout(800);
  }

  const confirm = modal.getByRole("button", { name: /^uninstall$/i }).first();
  await confirm.waitFor({ state: "visible", timeout: 15000 });
  for (let i = 0; i < 10 && (await confirm.isDisabled().catch(() => true)); i++)
    await page.waitForTimeout(500);
  log("confirm enabled: " + !(await confirm.isDisabled().catch(() => true)));
  await shot("before-confirm");
  if (
    await page
      .locator("[role=listbox]")
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    log("popover still open — dispatching click directly to the confirm button");
    await confirm.dispatchEvent("click");
  } else {
    await confirm.click({ timeout: 10000 });
  }
  await page.waitForTimeout(6000);
  await shot("after-uninstall");
  log("url after: " + page.url());

  await page.goto(`https://admin.shopify.com/store/${STORE}/settings/apps`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(5000);
  await shot("apps-list");
  // The partner org is also called "Navaal AI" (sidebar), so match the APP
  // specifically: its settings link and its full name.
  const stillLinked = await page
    .locator(`a[href*="/apps/${APP_HANDLE}"], a[href*="app_installations/app/${APP_HANDLE}"]`)
    .count();
  const text = await page
    .locator("#AppFrameMain, main")
    .first()
    .innerText()
    .catch(() => "");
  ok = stillLinked === 0 && !/Navaal: AI SEO/i.test(text);
  log(ok ? "app no longer listed — uninstalled" : "app still listed?");
} catch (e) {
  log("ERROR " + e.message.split("\n")[0]);
  await shot("error");
} finally {
  await context.close();
  await browser.close();
  console.log(`UNINSTALL_RESULT=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}
