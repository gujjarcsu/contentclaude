// Live proof for brief items 3–5 on a DEV store, through the real admin with
// the saved partner session. Two modes:
//
//   PROOF_MODE=first  (default)  quick start → drafts → review → publish → review ask
//   PROOF_MODE=quota             quota-exhausted prompts on /app, /app/products,
//                                a product page, /app/optimize, /app/seo-audit
//
//   PROBE_STORE=navaal-qa-fresh node scripts/proof-items345.mjs
//
// Every shopify.reviews.request() call made by the app is counted from the top
// page (a binding installed in every frame wraps the App Bridge method and
// reports the result), so "never on open" and "exactly one call" are measured,
// not assumed. Screenshots at 1440×900 and 390×844 land in proof-items345/.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE = process.env.PROBE_STORE || "navaal-qa-fresh";
const APP_HANDLE = "navaal-seo-geo-content";
const MODE = process.env.PROOF_MODE || "first";
const APP_ROOT = `https://admin.shopify.com/store/${STORE}/apps/${APP_HANDLE}`;
const OUT = process.env.OUT_DIR || "proof-items345";
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[proof-345] ${new Date().toISOString()} ${m}`);
const results = { store: STORE, mode: MODE, reviewCalls: [], steps: [] };

const browser = await chromium.launch({
  headless: false, channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled", "--no-default-browser-check", "--no-first-run"],
});
const context = await browser.newContext({ storageState: "tests/e2e/.auth/shopify.json", viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
const page = await context.newPage();

// Count every App Bridge review request from every frame.
await page.exposeFunction("__navaalReviewCall", (json) => {
  results.reviewCalls.push({ t: new Date().toISOString(), result: JSON.parse(json) });
  log(`reviews.request() → ${json}`);
});
await context.addInitScript(() => {
  const iv = setInterval(() => {
    const b = window.shopify && window.shopify.reviews;
    if (b && typeof b.request === "function" && !b.__navaalWrapped) {
      const orig = b.request.bind(b);
      b.request = async function () {
        let r;
        try { r = await orig(); } catch (e) { r = { error: String(e) }; }
        try { await window.__navaalReviewCall(JSON.stringify(r ?? null)); } catch { /* top page gone */ }
        return r;
      };
      b.__navaalWrapped = true;
      clearInterval(iv);
    }
  }, 150);
});

const appFrame = () => page.frameLocator('iframe[name^="app-iframe"], iframe[src*="app.navaal.ai"]').first();
const frameText = async () => (await appFrame().locator("body").innerText({ timeout: 5000 }).catch(() => "")) || "";
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}-1440.png` }).catch(() => {});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-390.png` }).catch(() => {});
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
};
const step = (name, data) => { results.steps.push({ name, at: new Date().toISOString(), ...data }); log(`${name}: ${JSON.stringify(data)}`); };
const gotoApp = async (path = "/app") => {
  await page.goto(`${APP_ROOT}${path}`, { waitUntil: "domcontentloaded" });
  await appFrame().locator("body").waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    const t = await frameText();
    if (t.length > 200) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2500);
};
const waitFor = async (re, ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const t = await frameText();
    if (re.test(t)) return t;
    await page.waitForTimeout(1000);
  }
  return null;
};

try {
  await page.goto("https://app.navaal.ai/api/build-info", { waitUntil: "domcontentloaded" });
  results.buildInfo = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  await page.screenshot({ path: `${OUT}/00-build-info.png` });
  step("build-info", { buildInfo: results.buildInfo });

  if (MODE === "first") {
    // 2. Dashboard on a new shop: the primary action.
    await gotoApp("/app");
    const heroText = await frameText();
    const m = heroText.match(/(Write \d descriptions? now[^\n]*|Improve \d descriptions? now[^\n]*|Choose a product →|Add a product in Shopify)/);
    step("dashboard-offer", { primaryAction: m ? m[1] : null, reviewCallsSoFar: results.reviewCalls.length });
    await shot("dashboard-offer");
    if (!m || !/^(Write|Improve)/.test(m[1])) throw new Error("no quick-start action on the dashboard: " + (m ? m[1] : "none"));

    // 3. One click → drafts.
    const btn = appFrame().getByRole("button", { name: /^(Write|Improve) \d descriptions? now/ }).first();
    await btn.waitFor({ state: "visible", timeout: 20000 });
    const t0 = Date.now();
    await btn.click();
    step("quick-start-click", {});
    await page.waitForTimeout(4000);
    await shot("dashboard-writing");
    const wanted = Number((m[1].match(/\d/) || ["3"])[0]);
    let firstDraftAt = null;
    for (let i = 0; i < 150; i++) {
      const t = await frameText();
      const ready = (t.match(/Content quality \d+/g) || []).length;
      if (ready >= 1 && !firstDraftAt) { firstDraftAt = Date.now(); step("first-draft", { seconds: (firstDraftAt - t0) / 1000 }); }
      if (ready >= wanted) { step("all-drafts", { seconds: (Date.now() - t0) / 1000, ready }); break; }
      if (/no generation was used|took too long|Our AI is busy/.test(t) && i > 90) { step("draft-failure-visible", {}); break; }
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1500);
    await shot("dashboard-drafts");
    results.drafts = { clickToFirstDraftSec: firstDraftAt ? (firstDraftAt - t0) / 1000 : null, clickToAllSec: results.steps.find((s) => s.name === "all-drafts")?.seconds ?? null };

    // 5. Review & publish.
    const reviewBtn = appFrame().getByRole("button", { name: /Review & publish \d drafts?/ }).first();
    if (await reviewBtn.count()) { await reviewBtn.click(); } else { await gotoApp("/app/review"); }
    await waitFor(/approved and ready to publish|Nothing to review/, 30000);
    await page.waitForTimeout(2000);
    step("review-preapproved", { text: (await frameText()).match(/\d+ of \d+ approved[^\n]*/)?.[0] ?? null, reviewCallsSoFar: results.reviewCalls.length });
    await shot("review-preapproved");

    // 6. Publish → the one review ask.
    const callsBefore = results.reviewCalls.length;
    const publishBtn = appFrame().getByRole("button", { name: /^Publish \d+ approved/ }).first();
    await publishBtn.waitFor({ state: "visible", timeout: 20000 });
    const tPub = Date.now();
    await publishBtn.click();
    const published = await waitFor(/Published content for \d+ product/, 60000);
    step("published", { seconds: (Date.now() - tPub) / 1000, toast: published?.match(/Published content for[^\n]*/)?.[0] ?? null });
    // The Shopify review modal renders in the TOP window.
    let modal = false;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1000);
      if (results.reviewCalls.length > callsBefore) modal = true;
      const dlg = page.getByRole("dialog");
      if ((await dlg.count()) > 0 && (await dlg.first().isVisible().catch(() => false))) { modal = true; break; }
    }
    await shot("review-published-modal");
    step("review-ask", { callsDuringPublish: results.reviewCalls.length - callsBefore, lastResult: results.reviewCalls.at(-1)?.result ?? null, modalVisible: modal });
    await page.keyboard.press("Escape").catch(() => {});

    // 7. Never again on open: reload review, open jobs, open dashboard.
    const callsAfter = results.reviewCalls.length;
    await gotoApp("/app/review");
    await gotoApp("/app/jobs");
    await gotoApp("/app");
    step("no-ask-on-open", { extraCalls: results.reviewCalls.length - callsAfter });
  }

  if (MODE === "quota") {
    for (const [name, path] of [["dashboard-quota-prompt", "/app"], ["products-quota-prompt", "/app/products"], ["optimize-quota-prompt", "/app/optimize"], ["seo-audit-prompt", "/app/seo-audit"]]) {
      await gotoApp(path);
      const t = await frameText();
      const title = t.match(/(At least )?\d+ products? still needs? content · [A-Za-z]+ covers \d+\/month/)?.[0] ?? null;
      const reset = t.match(/reset on \d+ [A-Za-z]+/)?.[0] ?? null;
      step(name, { title, reset, critical: /tone="critical"/.test(t) });
      await shot(name);
    }
    // a product page: first product link from the products page
    await gotoApp("/app/products");
    const link = appFrame().locator('a[href*="/app/products/"]').first();
    if (await link.count()) {
      await link.click();
      await page.waitForTimeout(5000);
      const t = await frameText();
      step("product-quota-prompt", { title: t.match(/(At least )?\d+ products? still needs? content[^\n]*/)?.[0] ?? null });
      await shot("product-quota-prompt");
    }
  }
  results.ok = true;
} catch (e) {
  results.ok = false;
  results.error = e.message.split("\n")[0];
  log("ERROR " + results.error);
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
} finally {
  fs.writeFileSync(`${OUT}/results-${MODE}.json`, JSON.stringify(results, null, 2));
  await context.close();
  await browser.close();
  console.log(JSON.stringify({ ok: results.ok, error: results.error, reviewCalls: results.reviewCalls.length, drafts: results.drafts, steps: results.steps.map((s) => s.name) }, null, 2));
  process.exit(results.ok ? 0 : 1);
}
