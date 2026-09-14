#!/usr/bin/env node
/**
 * P6.0 item 1 — prove that a MERCHANT CLICKING PUBLISH clears the store-score
 * cache, not merely that the function which clears it works.
 *
 * This is the gap I named at the end of P5.2 and did not close: the invalidator
 * was proved in production (cleared a live key in 2 ms) and every publish path
 * was asserted at the source and break-tested, but nothing joined the two ends.
 * "The function works" and "every call site has the call" together imply it, and
 * an implication is not a reading.
 *
 * It runs in STEPS, because the cache has to be read from inside the Fly
 * machine between browser actions and there is no Fly token on this laptop:
 *
 *   --step arm      turn auto-publish OFF, generate one draft, warm the cache
 *   (peek the cache externally, and write the reading down)
 *   --step publish  click Publish in Review, as a merchant does
 *   (peek again)
 *   --step restore  put the store's auto-publish setting back
 *
 * ⛔ It changes a setting and publishes content on the store it is pointed at.
 * Development stores only; it refuses anything that does not look like one.
 *
 * Usage: node tools/proof/review-click-clears-cache.mjs --step arm
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const AUTH = "tests/e2e/.auth/shopify.json";
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const STORE = argOf("--store", "contentpilot-dev2");
const STEP = argOf("--step", "arm");

if (!/dev|test|qa|ttv|staging/i.test(STORE)) {
  console.error(`REFUSING: "${STORE}" does not look like a development store, and this PUBLISHES content.`);
  process.exit(2);
}
if (!existsSync(AUTH)) {
  console.error(`NO SESSION at ${AUTH}`);
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 1600, height: 900 },
  // A real Chrome UA. The default says HeadlessChrome, Shopify's library
  // classifies that as a bot and answers 410 Gone, and the resulting error page
  // reads exactly like the feature being broken.
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await context.newPage();
const appUrl = (p) => `https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content${p}`;

/** Navigate and wait for the app frame to PAINT, not merely to exist. */
async function frameAt(path) {
  await page.goto(appUrl(path), { waitUntil: "domcontentloaded", timeout: 60_000 });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const fr = page.frames().find((f) => f.url().includes("app.navaal.ai"));
    if (fr) {
      const n = await fr.evaluate(() => (document.body?.innerText || "").trim().length).catch(() => 0);
      if (n > 120) {
        // Painted is not the same as SETTLED. The frame reports text as soon as
        // the page shell renders; the product rows and their per-row buttons
        // arrive after. Looking immediately found "no Generate button on
        // /app/products" on a page that plainly has one.
        await page.waitForTimeout(3000);
        return fr;
      }
    }
    await page.waitForTimeout(700);
  }
  return null;
}

const out = { step: STEP, at: new Date().toISOString(), store: STORE };

/** Set the "Publish without review" checkbox and save. */
async function setAutoPublish(want) {
  const fr = await frameAt("/app/settings");
  if (!fr) return { ok: false, note: "no app frame on /app/settings" };
  // Polaris renders checkboxes with a GENERATED id (":R2cq9jmr5:") and no name
  // attribute, so `input[name=...]` matches nothing. The label is the stable
  // handle, and it is also what a merchant actually reads.
  const box = fr.getByLabel("Publish without review").first();
  if ((await box.count()) === 0) return { ok: false, note: "'Publish without review' checkbox not found" };
  const before = await box.isChecked();
  if (before !== want) {
    await box.setChecked(want, { force: true }).catch(() => {});
    const save = fr.locator('button:has-text("Save")').first();
    if ((await save.count()) > 0) await save.click().catch(() => {});
    await page.waitForTimeout(6000);
  }
  const fr2 = await frameAt("/app/settings");
  const after = fr2
    ? await fr2.getByLabel("Publish without review").first().isChecked().catch(() => null)
    : null;
  return { ok: after === want, before, after };
}

if (STEP === "arm") {
  // 1. Auto-publish OFF, so generated content WAITS in Review instead of going
  //    straight live. Without this the Review screen is permanently empty on
  //    this store and there is no click to make.
  out.autoPublish = await setAutoPublish(false);

  // 2. Generate for one product, through the Products list, as a merchant does.
  const fr = await frameAt("/app/products");
  if (!fr) {
    out.error = "no app frame on /app/products";
  } else {
    const gen = fr.locator('button:has-text("Generate")').first();
    if ((await gen.count()) === 0) {
      out.error = "no Generate button on /app/products";
    } else {
      await gen.click().catch(() => {});
      let sawDraft = false;
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(5000);
        const t = await fr.evaluate(() => document.body?.innerText || "").catch(() => "");
        if (/[1-9]\d* ready to review|Draft on this page \([1-9]/i.test(t)) {
          sawDraft = true;
          break;
        }
      }
      out.generated = sawDraft;
    }
  }

  // 3. Warm the cache: loading Home is what writes cc:startscan:<shop>.
  const home = await frameAt("/app");
  out.homeLoaded = !!home;
  out.homeScore = home
    ? (await home.evaluate(() => document.body?.innerText || "")).match(/Store SEO score\s*\n?\s*(\d+)/i)?.[1] ?? null
    : null;
  out.next = "PEEK THE CACHE NOW, write the reading down, then run --step publish";
} else if (STEP === "publish") {
  const fr = await frameAt("/app/review");
  if (!fr) {
    out.error = "no app frame on /app/review";
  } else {
    const t = await fr.evaluate(() => document.body?.innerText || "");
    out.reviewSays = t.slice(0, 160).replace(/\s+/g, " ");
    const btn = fr.locator('button:has-text("Publish"), button:has-text("Approve")').first();
    if ((await btn.count()) === 0) {
      out.error = "nothing publishable on /app/review — run --step arm first";
    } else {
      out.buttonText = (await btn.innerText().catch(() => "")).trim();
      await btn.click();
      await page.waitForTimeout(15000);
      const after = await fr.evaluate(() => document.body?.innerText || "").catch(() => "");
      out.afterClick = after.slice(0, 200).replace(/\s+/g, " ");
      out.clicked = true;
    }
  }
  out.next = "PEEK THE CACHE AGAIN. Gone = the click reached the invalidator.";
} else if (STEP === "restore") {
  out.autoPublish = await setAutoPublish(true);
} else {
  out.error = `unknown --step ${STEP}`;
}

console.log(JSON.stringify(out, null, 2));
await browser.close();
