#!/usr/bin/env node
/**
 * P5.2 — HOW LONG does a merchant wait for the store score to reflect what they
 * just published?
 *
 * `07-VERIFICATION.md` false green #9 requires this shape and not a test:
 * **read, change something that MUST move the number, read again, and state how
 * long the change took to appear.** A gap measured once is also what a warm
 * cache looks like, so a single reading proves nothing about staleness.
 *
 * The defect this measures: `startscan:<shop>` was cached for 600 seconds and
 * had NO invalidator — the only key in the app that was written and never
 * cleared. A merchant who published content and looked at Home saw the score
 * from before they published, for up to ten minutes, with nothing saying so.
 *
 * WHAT IT DOES TO THE STORE. It publishes ONE pending draft, through the app's
 * own Review screen, as a merchant would. That is a real write to a real
 * product. Point it only at a development store you own.
 *
 *   ⛔ NEVER point this at a live commercial catalogue.
 *
 * Usage: node tools/proof/score-cache-lag.mjs [--store <handle>] [--json]
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
const AS_JSON = argv.includes("--json");
/** How long to keep re-reading Home before calling it stale. 15 min > the 600 s TTL. */
const MAX_WAIT_MS = 15 * 60 * 1000;
const POLL_MS = 20_000;

// A development store, by construction. The guard is here rather than in a
// comment because "point it at the right store" is exactly the instruction that
// gets skipped at 2am.
if (!/dev|test|qa|ttv|staging/i.test(STORE)) {
  console.error(
    `REFUSING: "${STORE}" does not look like a development store, and this script PUBLISHES content.`,
  );
  process.exit(2);
}

if (!existsSync(AUTH)) {
  console.error(`NO SESSION at ${AUTH}\nRun: node tools/proof/login-cdp.mjs  (a human types the credentials)`);
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 1600, height: 900 },
  // A real Chrome UA. Playwright's default says HeadlessChrome, Shopify's
  // library classifies that as a bot and answers 410 Gone, and the resulting
  // error page reads exactly like the feature being broken.
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await context.newPage();

const appUrl = (path) => `https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content${path}`;

async function appFrame(path, { reload = false } = {}) {
  if (reload) {
    // A real reload, not a soft navigation: a client-side route change can
    // re-render from a cached loader payload and would make a stale number look
    // fresh, which is the exact illusion this script exists to rule out.
    await page.goto("about:blank");
  }
  await page.goto(appUrl(path), { waitUntil: "domcontentloaded", timeout: 60_000 });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((fr) => fr.url().includes("app.navaal.ai"));
    if (frame) {
      const painted = await frame
        .evaluate(() => (document.body?.innerText || "").trim().length)
        .catch(() => 0);
      if (painted > 120) return frame;
    }
    await page.waitForTimeout(700);
  }
  return null;
}

/** The store score as a merchant reads it, or null if the screen did not say. */
async function readHomeScore() {
  const frame = await appFrame("/app", { reload: true });
  if (!frame) return { score: null, error: "no app frame — COULD NOT READ (this is not 'unchanged')" };
  await page.waitForTimeout(3000);
  const text = await frame.evaluate(() => document.body.innerText || "");
  const m = text.match(/Store SEO score\s*\n?\s*(\d+)/i);
  return { score: m ? Number(m[1]) : null, line: m ? m[0].replace(/\s+/g, " ") : null };
}

const out = { startedAt: new Date().toISOString(), store: STORE, steps: [] };

// ── 1. READ ────────────────────────────────────────────────────────────────
const before = await readHomeScore();
out.steps.push({ step: "read", at: new Date().toISOString(), ...before });
if (before.score === null) {
  out.verdict = "COULD NOT READ the score before the change — nothing is proved either way.";
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

// ── 2. CHANGE ──────────────────────────────────────────────────────────────
// Publish one draft through the app's own Review screen, the way a merchant
// does it. Anything else would measure a path no merchant takes.
//
// A fully-optimised store has nothing pending, so one draft is generated first
// — also through the app, from the Products list. That spends one real credit
// on the development store, which is the price of measuring the real path.
let generated = false;
{
  const productsFrame = await appFrame("/app/products");
  if (productsFrame) {
    await page.waitForTimeout(3000);
    const gen = productsFrame.locator('button:has-text("Generate")').first();
    if ((await gen.count()) > 0) {
      await gen.click().catch(() => {});
      // The generation runs in the background; give the job time to land rather
      // than assuming a fixed duration is enough.
      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(5000);
        const txt = await productsFrame.evaluate(() => document.body.innerText || "").catch(() => "");
        if (/ready to review|Draft on this page \(([1-9]\d*)\)/i.test(txt)) break;
      }
      generated = true;
    }
  }
}
out.steps.push({ step: "generate", at: new Date().toISOString(), generated });

const reviewFrame = await appFrame("/app/review");
let published = false;
let changeNote = null;
if (!reviewFrame) {
  changeNote = "no app frame on /app/review";
} else {
  await page.waitForTimeout(3000);
  const btn = reviewFrame
    .locator('button:has-text("Publish"), button:has-text("Approve & Publish")')
    .first();
  if ((await btn.count()) === 0) {
    changeNote = generated
      ? "generated a draft but /app/review still shows nothing publishable"
      : "no publishable draft on /app/review and no Generate button on /app/products";
  } else {
    await btn.click();
    // Wait for the action to land rather than a fixed sleep.
    await reviewFrame
      .waitForSelector('text=/publish|Published|success/i', { timeout: 60_000 })
      .catch(() => {});
    await page.waitForTimeout(5000);
    published = true;
  }
}
const changedAt = Date.now();
out.steps.push({ step: "change", at: new Date().toISOString(), published, note: changeNote });

if (!published) {
  out.verdict = `NO CHANGE WAS MADE (${changeNote}). The lag is UNMEASURED, not zero.`;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

// ── 3. READ AGAIN, repeatedly, until it moves ──────────────────────────────
let lagMs = null;
while (Date.now() - changedAt < MAX_WAIT_MS) {
  const now = await readHomeScore();
  const elapsed = Math.round((Date.now() - changedAt) / 1000);
  out.steps.push({ step: "reread", afterSeconds: elapsed, ...now });
  if (now.score !== null && now.score !== before.score) {
    lagMs = Date.now() - changedAt;
    break;
  }
  await page.waitForTimeout(POLL_MS);
}

out.before = before.score;
out.after = out.steps.at(-1)?.score ?? null;
out.lagSeconds = lagMs === null ? null : Math.round(lagMs / 1000);
out.ttlSeconds = 600;
out.verdict =
  lagMs === null
    ? `STILL ${before.score} after ${Math.round(MAX_WAIT_MS / 1000)}s — the score did not move, which is either a cache that outlives its TTL or a publish that did not change the score.`
    : out.lagSeconds <= 60
      ? `MOVED in ${out.lagSeconds}s — well inside the 600s TTL, so the invalidation is doing the work rather than the TTL.`
      : `MOVED in ${out.lagSeconds}s — longer than a merchant should wait; the invalidation may not be firing on this path.`;

console.log(AS_JSON ? JSON.stringify(out, null, 2) : JSON.stringify(out, null, 2));
await browser.close();
