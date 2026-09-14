#!/usr/bin/env node
/**
 * Read the numbers a merchant actually sees, off the rendered screens.
 *
 * Built for A1 and A2, whose proofs are both "read the live page and write the
 * number down" — not "the test passes".
 *
 *   A1  the Products page must show and count NO archived products
 *   A2  Home and the SEO Audit must no longer disagree about the store's score,
 *       and any gap that remains must be explained by the population
 *
 * All three screens are read in ONE browser session, back to back, so the
 * numbers are comparable. A2's whole defect was two numbers read a minute apart
 * being 42 points different; reading them an hour apart would prove nothing.
 *
 * READ ONLY. It loads three pages and reads text. It clicks nothing, submits
 * nothing, and writes to no store.
 *
 * Usage: node tools/proof/screen-numbers.mjs [--store <handle>] [--json]
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

if (!existsSync(AUTH)) {
  console.error(`NO SESSION at ${AUTH}\nRun: node tools/proof/login-cdp.mjs  (a human types the credentials)`);
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 1600, height: 900 },
  // A real Chrome UA. Playwright's default says HeadlessChrome, Shopify's
  // library classifies that as a bot and answers 410 Gone, and the frame then
  // renders an error page that reads exactly like "the feature is missing".
  // That cost a real scare during P0.4.
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await context.newPage();

/** Load one app path and return the frame's rendered text plus form values. */
async function readScreen(path) {
  const url = `https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content${path}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  let frame = null;
  const deadline = Date.now() + 60_000;
  let painted = 0;
  while (Date.now() < deadline) {
    // Re-resolved every iteration: a cached frame reference goes stale across
    // navigations and reports "no frame" when the frame is right there.
    frame = page.frames().find((fr) => fr.url().includes("app.navaal.ai"));
    if (frame) {
      painted = await frame.evaluate(() => (document.body?.innerText || "").trim().length).catch(() => 0);
      if (painted > 120) break;
    }
    await page.waitForTimeout(700);
  }
  if (!frame) return { path, error: "no app frame attached — COULD NOT READ (this is not 'no change')" };

  // Give streamed content a moment; the audit streams the rest of the catalogue.
  await page.waitForTimeout(4000);

  return await frame.evaluate(() => {
    const text = (document.body.innerText || "").trim();
    const values = [...document.querySelectorAll("input, textarea, select")]
      .map((el) => el.value)
      .filter((v) => v && String(v).trim());
    return { text, values };
  }).then((r) => ({ path, ...r }));
}

const out = { readAt: new Date().toISOString(), store: STORE, screens: {} };

for (const path of ["/app", "/app/products", "/app/seo-audit"]) {
  out.screens[path] = await readScreen(path);
}

/** Pull the first match of each pattern, so a number is quoted not inferred. */
function find(text, re) {
  const m = String(text || "").match(re);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

const home = out.screens["/app"];
const products = out.screens["/app/products"];
const audit = out.screens["/app/seo-audit"];

out.readings = {
  homeScore: find(home?.text, /Store SEO score\s*\n?\s*\d+\s*\n?\s*\/\s*100[^\n]*/i),
  homeScoreNumber: (find(home?.text, /Store SEO score\s*\n?\s*(\d+)/i) || "").replace(/\D+/g, "") || null,
  productsHeadline: find(products?.text, /[\d,]+\s+products?[^\n]*/i),
  productsTabs: find(products?.text, /All\s*\(?\d*\)?[^\n]*/i),
  auditScore: find(audit?.text, /\d+\s*\/\s*100/),
  auditPopulation: find(audit?.text, /(Scored|analyzed|sampled|scanned)[^\n]*/i),
  residueInFormValues: [
    ...new Set(
      [products, home, audit]
        .flatMap((s) => s?.values ?? [])
        .filter((v) => /E2E Test Store|contentpilot-dev|navaal-ttv|myshopify\.com/i.test(v)),
    ),
  ],
};

if (AS_JSON) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`\nREAD ${out.readAt}  store=${STORE}\n`);
  for (const [path, s] of Object.entries(out.screens)) {
    console.log(`── ${path} ${s.error ? `ERROR: ${s.error}` : ""}`);
    if (s.text) console.log(s.text.split("\n").slice(0, 14).map((l) => `   ${l}`).join("\n"));
    console.log("");
  }
  console.log("READINGS:");
  for (const [k, v] of Object.entries(out.readings)) {
    console.log(`  ${k.padEnd(20)} ${Array.isArray(v) ? JSON.stringify(v) : (v ?? "(not found)")}`);
  }
}

await browser.close();
