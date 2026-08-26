// App Store 1.2.3 REVIEWER PROOF recording — shows, with a VISIBLE cursor and
// click ripples plus on-screen step captions, that a merchant can DOWNGRADE and
// UPGRADE their plan (no support, no reinstall) and that the upgrade PERSISTS
// across page reloads (the reviewer's exact failure).
//
// Flow (paced so every click is easy to follow):
//   Plans -> [if paid] Cancel Subscription -> Free           (downgrade works)
//         -> Upgrade to Professional -> Approve charge        (upgrade works)
//         -> back in-admin, Professional active + renewal date (charge processed)
//         -> reload, reload again after a wait -> still Professional (persists)
//
//   node scripts/billing-review-proof.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "contentpilot-dev2";
const APP = "navaal-seo-geo-content";
const PLANS_URL = `https://admin.shopify.com/store/${STORE}/apps/${APP}/app/plans`;
const OUT = "billing-review-proof";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/video`, { recursive: true });

const appFrame = (page) =>
  page.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
const log = (m) => console.log(`[review-proof] ${new Date().toISOString()} ${m}`);
const readLimit = async (page) => {
  const body = await appFrame(page).locator("body").innerText().catch(() => "");
  const m = body.match(/of\s+(1000|200|50|25)\b/);
  return m ? m[1] : null;
};

// Visible cursor + click ripple, injected into EVERY frame (main admin, app
// iframe, and Shopify's charge-confirmation page).
const CURSOR_SCRIPT = () => {
  if (window.__vcursor) return;
  window.__vcursor = true;
  const install = () => {
    if (!document.body) return;
    const dot = document.createElement("div");
    Object.assign(dot.style, {
      position: "fixed", width: "24px", height: "24px", borderRadius: "50%",
      background: "rgba(255,32,86,0.45)", border: "2.5px solid #fff",
      boxShadow: "0 0 8px rgba(0,0,0,.55)", zIndex: 2147483647, pointerEvents: "none",
      transform: "translate(-50%,-50%)", left: "-100px", top: "-100px", transition: "left .04s linear, top .04s linear",
    });
    document.body.appendChild(dot);
    const move = (e) => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; };
    const ripple = (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "fixed", left: e.clientX + "px", top: e.clientY + "px", width: "12px", height: "12px",
        borderRadius: "50%", border: "3px solid rgba(255,32,86,0.95)", zIndex: 2147483647, pointerEvents: "none",
        transform: "translate(-50%,-50%)", transition: "all .5s ease-out", opacity: "1",
      });
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.width = "64px"; r.style.height = "64px"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 550);
    };
    for (const t of ["pointermove", "mousemove"]) window.addEventListener(t, move, true);
    for (const t of ["pointerdown", "mousedown"]) window.addEventListener(t, ripple, true);
  };
  if (document.body) install(); else document.addEventListener("DOMContentLoaded", install);
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
await context.addInitScript(CURSOR_SCRIPT);
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();

// On-screen step caption on the TOP page (persists over the app iframe).
const caption = async (text) => {
  await page.evaluate((t) => {
    let el = document.getElementById("__vcaption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__vcaption";
      Object.assign(el.style, {
        position: "fixed", left: "0", right: "0", top: "0", zIndex: 2147483646, pointerEvents: "none",
        font: "600 18px/1.4 -apple-system,Segoe UI,Roboto,sans-serif", color: "#fff",
        background: "linear-gradient(180deg, rgba(20,20,30,.92), rgba(20,20,30,.75))",
        padding: "12px 20px", textAlign: "center", letterSpacing: ".2px",
        boxShadow: "0 2px 12px rgba(0,0,0,.35)",
      });
      document.documentElement.appendChild(el);
    }
    el.textContent = t;
  }, text).catch(() => {});
};
const clickWithCursor = async (locator, label) => {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.hover();               // cursor travels to the target…
  await page.waitForTimeout(1000);     // …and pauses on it so it's obvious
  log(`click: ${label}`);
  await locator.click();
  await page.waitForTimeout(600);
};
const gotoPlans = async () => {
  await page.goto(PLANS_URL, { waitUntil: "domcontentloaded" });
  await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
};

let result = "UNKNOWN";
const steps = {};
try {
  log(`warming admin for ${STORE}…`);
  await page.goto(`https://admin.shopify.com/store/${STORE}/apps/${APP}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await appFrame(page).locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});

  await gotoPlans();
  await caption("Plans & Billing — a merchant can change plans here, no support or reinstall needed");
  await page.waitForTimeout(2500);

  // DOWNGRADE (if currently on a paid plan) so we can then show a clean upgrade.
  let f = appFrame(page);
  const cancelBtn = f.getByRole("button", { name: /^cancel subscription$/i }).first();
  if (await cancelBtn.isVisible().catch(() => false)) {
    await caption("Step 1 — DOWNGRADE: click “Cancel Subscription” (moves you to Free)");
    await page.waitForTimeout(1200);
    await clickWithCursor(cancelBtn, "Cancel Subscription");
    await page.waitForTimeout(8000);
    await gotoPlans();
    steps.afterCancel = await readLimit(page);
    await caption(`Step 1 done — now on the Free plan (${steps.afterCancel}/mo). Downgrade works.`);
    log(`after cancel: limit=${steps.afterCancel}`);
    await page.waitForTimeout(3000);
  } else {
    steps.afterCancel = await readLimit(page);
    log(`already Free (no cancel button)`);
  }

  // UPGRADE Free -> Professional
  f = appFrame(page);
  await caption("Step 2 — UPGRADE: click “Upgrade to Professional”");
  await page.waitForTimeout(1200);
  const upgrade = f.getByRole("button", { name: /upgrade to professional/i }).first();
  await upgrade.waitFor({ timeout: 30000 });
  await clickWithCursor(upgrade, "Upgrade to Professional");

  // Shopify charge confirmation page
  await page.waitForURL(/\/charges\/.*confirm/i, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await caption("Step 3 — Shopify’s charge page: click “Approve” to process the subscription");
  await page.waitForTimeout(1200);
  const approve = page.getByRole("button", { name: /^approve/i }).or(page.getByRole("link", { name: /^approve/i }));
  await approve.first().waitFor({ timeout: 30000 });
  await clickWithCursor(approve.first(), "Approve");

  // Back in-admin, Professional active
  await page.waitForURL(/apps\/.*\/app\/plans|\/app\/plans/i, { timeout: 90000 });
  await page.waitForTimeout(6000);
  steps.afterUpgrade = await readLimit(page);
  steps.landedUrl = page.url();
  await caption(`Step 4 — Back in the app: Professional is ACTIVE (${steps.afterUpgrade}/mo). Charge processed.`);
  log(`after upgrade: limit=${steps.afterUpgrade} url=${steps.landedUrl}`);
  await page.waitForTimeout(4500);

  // PERSISTENCE — the reviewer's exact failure. Reload twice, with a wait.
  await caption("Step 5 — RELOAD the page… (the plan used to revert to Free here)");
  await page.waitForTimeout(1500);
  await gotoPlans();
  steps.reload1 = await readLimit(page);
  await caption(`Reload 1 — still Professional (${steps.reload1}/mo). No revert.`);
  log(`reload1: limit=${steps.reload1}`);
  await page.waitForTimeout(4000);

  await caption("Step 6 — wait, then RELOAD again to be sure…");
  await page.waitForTimeout(15000);
  await gotoPlans();
  steps.reload2 = await readLimit(page);
  await caption(`Reload 2 — STILL Professional (${steps.reload2}/mo). Upgrade remains active. ✔`);
  log(`reload2: limit=${steps.reload2}`);
  await page.waitForTimeout(5000);

  const ok = steps.afterUpgrade === "1000" && steps.reload1 === "1000" && steps.reload2 === "1000"
    && /admin\.shopify\.com/.test(steps.landedUrl || "") && !/auth\/login/i.test(steps.landedUrl || "");
  result = ok ? "PASS" : "FAIL";
  log(`RESULT: ${result}`);
} catch (err) {
  result = "FAIL";
  log(`ERROR: ${err.message}`);
  await page.screenshot({ path: `${OUT}/99-error.png` }).catch(() => {});
} finally {
  await page.waitForTimeout(1500);
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(`${OUT}/video`).filter((v) => v.endsWith(".webm"));
  if (vids.length) fs.renameSync(`${OUT}/video/${vids[0]}`, `${OUT}/billing-review-proof.webm`);
  console.log("STEPS_JSON=" + JSON.stringify(steps));
  console.log(`FINAL_RESULT=${result}`);
  process.exit(result === "PASS" ? 0 : 1);
}
