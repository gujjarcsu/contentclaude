/**
 * Phase 5 item 7 — App Store listing screenshots, captured from the CURRENT build.
 *
 * The live listing still shows the pre-Phase-2 app: a dark gradient hero, a
 * thirteen-item sidebar, "Optimise Store". Every potential installer sees five
 * pictures of software that no longer exists and then installs something else.
 * That is a conversion leak on the one surface every install passes through.
 *
 *   node tools/proof/listing-assets.mjs
 *
 * Writes listing-assets/*.png plus a manifest.json recording, per frame, what
 * was actually on screen when it was taken.
 *
 * WHAT THIS HARNESS REFUSES TO DO
 *
 * Three times in this project a proof harness has printed a confident pass over
 * a broken capture: twelve byte-identical screenshots of a "410 Gone" page
 * reported as "0 overflowing"; a guard reading `iframe.contentDocument`, which
 * is null cross-origin, so it would have passed on every run; and nine screens
 * that returned no measurement at all while the harness printed "ok" because
 * the value was `undefined` rather than `false`.
 *
 * So every frame here has to clear four hurdles before it is written, and each
 * one FAILS THE RUN rather than warning:
 *
 *   1. the app's own iframe exists (no `|| page.mainFrame()` fallback — that
 *      fallback is what silently screenshotted the admin shell)
 *   2. the frame's text is not a 4xx page and is long enough to be a screen
 *   3. the frame contains a string that only THIS screen renders, so a run
 *      cannot quietly capture five copies of the same page
 *   4. the PNG on disk is a plausible size and not byte-identical to another
 *      frame in the same run
 *
 * Even with all four, the last step is a human looking at the images. A check
 * that would print the same thing if the app were completely broken is
 * decorative, and hurdle 4 is the only one here that could not, in principle,
 * be fooled by a well-formed error page.
 *
 * Reads only. Publishes nothing. Uploading is the owner's step — HUMAN-NEEDED.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const AUTH = "tests/e2e/.auth/shopify.json";
const OUT = "listing-assets";
const APP_PATH = "apps/navaal-seo-geo-content";

/** A real Chrome UA. Without it the Shopify library answers 410 Gone. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** The store with real products and published content — populated, not empty. */
const FULL_STORE = process.env.FULL_STORE || "contentpilot-dev2";
/** A store still on its first run, so the Start state actually renders. */
const FRESH_STORE = process.env.FRESH_STORE || "navaal-qa-fresh";

/**
 * `must` is a string only this screen renders. It is the guard against a run
 * that captures five pictures of the same page and calls it a success.
 */
const FRAMES = [
  {
    file: "01-home-desktop.png",
    store: FULL_STORE,
    path: "/app",
    width: 1600,
    height: 900,
    must: /Monthly Usage|Products optimized|Review/i,
    label: "Home — store score and the one next action",
  },
  {
    file: "02-review-desktop.png",
    store: FULL_STORE,
    path: "/app/review",
    width: 1600,
    height: 900,
    must: /Review|Approve|Current|Proposed/i,
    label: "Review — current copy beside the proposed copy",
  },
  {
    file: "03-products-desktop.png",
    store: FULL_STORE,
    path: "/app/products",
    width: 1600,
    height: 900,
    must: /Products|Published|Draft|Needs content/i,
    label: "Products — every product and where it stands",
  },
  {
    file: "04-start-desktop.png",
    store: FRESH_STORE,
    path: "/app",
    width: 1600,
    height: 900,
    // NOT `|Add a product`. The first run of this harness accepted the empty
    // state on a store with no products — a technically-correct capture that
    // is useless as a listing image, and the guard waved it through. A listing
    // frame of the first run has to show a real score on a real catalogue.
    must: /scores \d+\/100/i,
    label: "First run — the store is scored and three drafts are written",
  },
  {
    file: "05-settings-desktop.png",
    store: FULL_STORE,
    path: "/app/settings",
    width: 1600,
    height: 900,
    must: /Settings|Brand voice|Plan|Publish without review/i,
    label: "Settings — brand voice and the current plan",
  },
  {
    file: "06-home-mobile.png",
    store: FULL_STORE,
    path: "/app",
    width: 375,
    height: 812,
    frameOnly: true,
    must: /Monthly Usage|Products optimized|Review/i,
    label: "Home on a phone",
  },
  {
    file: "07-review-mobile.png",
    store: FULL_STORE,
    path: "/app/review",
    width: 375,
    height: 812,
    frameOnly: true,
    must: /Review|Approve|Current|Proposed/i,
    label: "Review on a phone",
  },
  {
    file: "08-products-mobile.png",
    store: FULL_STORE,
    path: "/app/products",
    width: 375,
    height: 812,
    frameOnly: true,
    must: /Products|Published|Draft|Needs content/i,
    label: "Products on a phone",
  },
];

if (!existsSync(AUTH)) {
  console.error(
    `NO SESSION at ${AUTH}\nRun: node tools/proof/login-cdp.mjs  (a human types the credentials)`,
  );
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// Optional filter: `node tools/proof/listing-assets.mjs 04` captures only the
// frames whose filename contains "04". Some frames need the store in a
// different state (the first run needs a shop that has not seen a draft), so
// they cannot all be taken in one pass.
const only = process.argv[2] || null;
const SELECTED = only ? FRAMES.filter((f) => f.file.includes(only)) : FRAMES;
if (SELECTED.length === 0) {
  console.error(`no frame matches "${only}"`);
  process.exit(2);
}

const browser = await chromium.launch();
const results = [];
const hashes = new Map();
let failed = 0;

for (const f of SELECTED) {
  const context = await browser.newContext({
    storageState: AUTH,
    viewport: { width: f.width, height: f.height },
    deviceScaleFactor: 2,
    userAgent: BROWSER_UA, // desktop UA even at 375px — a phone UA makes the
    hasTouch: f.width < 500, // admin cover itself with a "Download the app" promo
  });
  const page = await context.newPage();
  const row = { ...f, ok: false };

  try {
    await page.goto(
      `https://admin.shopify.com/store/${f.store}${f.path.replace("/app", `/${APP_PATH}/app`)}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      },
    );

    // 1. the app's own frame must exist. No mainFrame() fallback, ever.
    await page.waitForFunction(
      () => [...document.querySelectorAll("iframe")].some((i) => (i.src || "").includes("app.navaal.ai")),
      { timeout: 45_000 },
    );
    await page.waitForTimeout(6000); // let streamed sections and skeletons settle

    const frame = page.frames().find((fr) => fr.url().includes("app.navaal.ai"));
    if (!frame) throw new Error("the app frame never appeared");

    // 2. + 3. it rendered, and it rendered THIS screen.
    const seen = await frame.evaluate(() => (document.body.innerText || "").trim());
    if (/^\s*\d{3}\s+(Gone|Forbidden|Unauthorized|Not Found)/i.test(seen)) {
      throw new Error(`app returned an error page: ${seen.slice(0, 60)}`);
    }
    if (seen.length < 60) throw new Error(`frame is effectively blank (${seen.length} chars)`);
    if (!f.must.test(seen)) {
      throw new Error(`this is not the ${f.label} screen — no match for ${f.must} in: ${seen.slice(0, 120)}`);
    }

    const target = f.frameOnly ? await frame.frameElement() : page;
    if (!target) throw new Error("could not resolve the frame element to screenshot");
    await target.screenshot({ path: `${OUT}/${f.file}` });

    // 4. the file is real, and is not a duplicate of another frame this run.
    const bytes = readFileSync(`${OUT}/${f.file}`);
    const size = statSync(`${OUT}/${f.file}`).size;
    if (size < 20_000) throw new Error(`PNG is implausibly small (${size} bytes) — probably a blank page`);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    if (hashes.has(hash))
      throw new Error(`byte-identical to ${hashes.get(hash)} — the run captured one page twice`);
    hashes.set(hash, f.file);

    row.ok = true;
    row.bytes = size;
    row.hash = hash;
    row.excerpt = seen.slice(0, 140).replace(/\s+/g, " ");
    console.log(`  ok   ${f.file}  ${size} bytes  ${row.excerpt.slice(0, 70)}`);
  } catch (err) {
    failed += 1;
    row.error = err.message;
    console.log(`  FAIL ${f.file}  ${err.message}`);
  } finally {
    results.push(row);
    await context.close();
  }
}

await browser.close();
// Merge into any existing manifest — a subset run must not erase the record of
// frames captured in another pass.
let prior = [];
try {
  prior = JSON.parse(readFileSync(`${OUT}/manifest.json`, "utf8")).results ?? [];
} catch {
  prior = [];
}
const merged = [...prior.filter((p) => !results.some((r) => r.file === p.file)), ...results].sort((a, b) =>
  a.file.localeCompare(b.file),
);
writeFileSync(
  `${OUT}/manifest.json`,
  JSON.stringify({ at: new Date().toISOString(), results: merged }, null, 2),
);

console.log(`\n${results.filter((r) => r.ok).length}/${SELECTED.length} frames captured`);
console.log("NOW LOOK AT THEM. Every guard above can be satisfied by a page that is");
console.log("technically fine and visually wrong; only a human eye catches that.");
process.exit(failed > 0 ? 1 : 0);
