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
/**
 * A store still on its first run, so the Start state actually renders.
 *
 * `navaal-qa-fresh` was the default and the app is UNINSTALLED there, so frame
 * 04 failed with "the app frame never appeared" on every run — which reads like
 * a broken app rather than a missing install. `navaal-ttv-02` has the app and
 * renders a real first-run screen, and it is what the last successful capture
 * actually used via an env override nobody had written down.
 *
 * Still worth replacing: ttv-02 has content now, so it is drifting away from
 * being a first run. When it stops looking like one, point this at a new store
 * rather than loosening the `must` guard below.
 */
const FRESH_STORE = process.env.FRESH_STORE || "navaal-ttv-02";

/**
 * `must` is a string only this screen renders. It is the guard against a run
 * that captures five pictures of the same page and calls it a success.
 */
/**
 * Phase 14 item 5 — the pixel scale each frame is captured at.
 *
 * DESKTOP 1x: the App Store editor rejects anything else. Verbatim, from the
 * editor, on the owner's own upload 2026-09-15: "Desktop screenshots must be
 * 1600px by 900px". So a desktop frame IS 1600x900 pixels, not 1600x900 CSS
 * pixels at 2x.
 *
 * MOBILE 2x, UNVERIFIED: 750x1624 is what 375x812 at 2x produces, and nobody
 * has yet seen the editor's error for a mobile slot. That is exactly how
 * 3200x1800 survived — one unchecked number in a README, repeated until it
 * looked like a fact. It stays 2x because changing it would be a second guess;
 * the step that settles it is in listing-assets/README.md, and it costs one
 * upload attempt.
 */
export const DESKTOP_MIN_WIDTH = 500;
export const scaleOf = (f) => (f.width >= DESKTOP_MIN_WIDTH ? 1 : 2);

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
    // FIXED 2026-09-14: was \scores \d+\\/100/i, which never matched.
    // The screen renders the label "Store SEO score" and puts the number and
    // "/ 100" on their own lines, so innerText reads:
    //     Store SEO score
    //     34
    //     / 100
    // The old pattern wanted "scores 34/100" - wrong word, and no newlines
    // allowed - so it failed every run and 04 was never captured.
    //
    // This is STRICTER, not looser: it now requires the literal "Store SEO
    // score" label, which the old pattern never checked, so the empty state
    // this guard exists to reject still cannot pass.
    must: /Store SEO score\s*\d+\s*\/\s*100/i,
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
    must: /Monthly Usage|Products optimized|Review/i,
    label: "Home on a phone",
  },
  {
    file: "07-review-mobile.png",
    store: FULL_STORE,
    path: "/app/review",
    width: 375,
    height: 812,
    must: /Review|Approve|Current|Proposed/i,
    label: "Review on a phone",
  },
  {
    file: "08-products-mobile.png",
    store: FULL_STORE,
    path: "/app/products",
    width: 375,
    height: 812,
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
    // The frame element, not the page, is what gets captured (see below), and
    // the app's iframe is NARROWER than the viewport by the width of Shopify's
    // admin sidebar. Opening at exactly f.width therefore produced a 1360x787
    // CSS element - 2720x1574 at 2x - and every desktop frame shipped at
    // ratio 1.728 while this file's own README claimed 3200x1800 at 16:9.
    // Nothing checked it. So: open WIDER than the frame we want, then clip the
    // element's box to exactly f.width x f.height, and assert the PNG's real
    // pixels afterwards (hurdle 5).
    // Mobile has no sidebar but the admin's own top and bottom chrome still
    // eats 129px of height, so a 375x812 viewport yielded a 375x683 frame and
    // the three mobile images shipped at 750x1366 instead of 750x1624. Both
    // shapes needed room, not just the desktop one.
    viewport: f.width >= 500
      ? { width: f.width + 320, height: f.height + 200 }
      : { width: f.width, height: f.height + 220 },
    // Phase 14 item 5 — THE SCALE IS PER FRAME, AND DESKTOP IS 1x.
    //
    // This was a flat `2`, so a 1600x900 desktop frame produced a 3200x1800
    // PNG, and listing-assets/README.md said that was "what Shopify wants".
    // The editor's own words, when the owner uploaded by hand on 2026-09-15:
    // "Desktop screenshots must be 1600px by 900px". It rejects 3200x1800.
    // CW's shape fix at 81fa07a was a correct fix to a wrong spec, and this
    // is the spec corrected — read off the editor rather than off the README.
    //
    // Mobile keeps 2x, and is labelled UNVERIFIED wherever it is written down:
    // 750x1624 has never been checked against the editor's error the way the
    // desktop size now has, and guessing twice is how 3200x1800 survived for
    // months. See listing-assets/README.md.
    deviceScaleFactor: scaleOf(f),
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

    // 1. the app's own frame must exist AND HAVE PAINTED. No mainFrame()
    //    fallback, ever.
    //
    // Polled from Playwright's frame list, NOT page.waitForFunction: that polls
    // with requestAnimationFrame inside the page, and the Shopify admin can
    // starve it long enough to time out while the frame is plainly there.
    //
    // WAITING FOR EXISTENCE ALONE WAS NOT ENOUGH, and it cost half a run. This
    // loop used to `break` the moment a frame object appeared and then evaluate
    // against it immediately. On the 375-wide MOBILE captures that reliably
    // produced two different failures:
    //
    //   06  "frame is effectively blank (0 chars)"  — the frame existed and had
    //       not painted yet
    //   07  "Cannot read properties of null (reading 'innerText')" — document
    //       .body was null because the frame detached and re-attached during
    //       hydration, and the cached `frame` reference was pointing at the old
    //       one
    //
    // Both read like the app being broken on a phone. It is not: a probe at the
    // same viewport rendered 1,761 characters on /app and 1,481 on
    // /app/products. The harness was the thing that was wrong, and a harness
    // that reports the app as broken is as bad as one that reports it as fine.
    //
    // So: re-resolve the frame EVERY iteration (a reference does not survive a
    // navigation) and wait for painted text rather than for an object.
    const deadline = Date.now() + 90_000;
    let frame = null;
    let painted = 0;
    while (Date.now() < deadline) {
      frame = page.frames().find((fr) => fr.url().includes("app.navaal.ai"));
      if (frame) {
        painted = await frame
          .evaluate(() => (document.body?.innerText || "").trim().length)
          .catch(() => 0);
        if (painted > 120) break;
      }
      await page.waitForTimeout(700);
    }
    if (!frame) throw new Error("the app frame never appeared");
    if (painted <= 120) {
      throw new Error(`the app frame never painted (${painted} chars after 90s) — COULD NOT READ`);
    }

    // 2. + 3. it rendered, and it rendered THIS screen.
    // A3 — innerText DOES NOT INCLUDE FORM VALUES, and that is a whole class of
    // bug, not one instance.
    //
    // CW found "E2E Test Store" sitting in an <input value=...> on the Settings
    // frame. Every text-based check this project has ever run reads innerText,
    // so none of them could see it: the `must` guard below passed, the residue
    // sweeps passed, and the string went into a listing image anyway. A control
    // holding dev-store residue is invisible to exactly the checks written to
    // catch dev-store residue.
    //
    // So what a merchant can READ is innerText PLUS the current value of every
    // input, textarea and select, plus placeholders, because a placeholder is
    // rendered text a reviewer can see too.
    // Re-resolved once more: everything above can be true and the frame can
    // still have been replaced in the millisecond since. `document.body?.` for
    // the same reason — a null body must become a retryable zero, never a
    // TypeError that reads like a broken app.
    frame = page.frames().find((fr) => fr.url().includes("app.navaal.ai")) ?? frame;
    const { seen, values } = await frame.evaluate(() => {
      const text = (document.body?.innerText || "").trim();
      const fields = [...document.querySelectorAll("input, textarea, select")]
        .map((el) => [el.value, el.getAttribute("placeholder")].filter(Boolean).join(" "))
        .filter((v) => v && v.trim());
      return { seen: text, values: fields };
    });

    // Residue that must never reach a listing image. The capture stores ARE dev
    // stores — that is fine and deliberate, they are stocked to look like real
    // shops — so this lists the strings that give that away, not the fact of it.
    const RESIDUE = [/E2E Test Store/i, /\btest store\b/i, /contentpilot-dev\d/i, /navaal-ttv-\d+/i, /myshopify\.com/i];
    const haystack = [seen, ...values].join("\n");
    const residue = RESIDUE.filter((re) => re.test(haystack)).map(String);
    if (residue.length) {
      throw new Error(
        `dev-store residue on this frame: ${residue.join(", ")} — it is in the page text or a form value, ` +
          `and a listing image must not show it`,
      );
    }
    if (/^\s*\d{3}\s+(Gone|Forbidden|Unauthorized|Not Found)/i.test(seen)) {
      throw new Error(`app returned an error page: ${seen.slice(0, 60)}`);
    }
    if (seen.length < 60) throw new Error(`frame is effectively blank (${seen.length} chars)`);
    if (!f.must.test(seen)) {
      throw new Error(`this is not the ${f.label} screen — no match for ${f.must} in: ${seen.slice(0, 120)}`);
    }

    // ALWAYS the app frame, never the whole page.
    //
    // This was `f.frameOnly ? frameElement : page`, and frameOnly was set on
    // the three MOBILE frames only. So every DESKTOP listing image captured
    // the entire Shopify admin around our app - the left nav, the top bar,
    // and the Sidekick icon and "Agentic" entry that sit in them. Shopify
    // names Sidekick-icon and Shopify-purple AI branding as a Built for
    // Shopify rejection reason, and it applies hardest to an app called
    // "AI SEO". We were shipping it in the listing images themselves.
    //
    // A flag was the wrong shape: it made the safe behaviour opt-in, and
    // five of eight frames did not opt in. No listing image should ever show
    // Shopify's chrome instead of our app, so the choice is gone.
    const target = await frame.frameElement();
    if (!target) throw new Error("could not resolve the frame element to screenshot");
    const box = await target.boundingBox();
    if (!box) throw new Error("the app frame has no bounding box - it is not laid out");
    if (box.width < f.width || box.height < f.height) {
      throw new Error(
        `the app frame is ${Math.round(box.width)}x${Math.round(box.height)} CSS px, ` +
        `smaller than the ${f.width}x${f.height} frame we owe the listing - widen the viewport`
      );
    }
    // Clip to exactly the frame we promised, from the app iframe's own origin,
    // so no admin chrome can enter and the aspect ratio is not a coincidence.
    await page.screenshot({
      path: `${OUT}/${f.file}`,
      clip: { x: box.x, y: box.y, width: f.width, height: f.height },
    });

    // 4. the file is real, and is not a duplicate of another frame this run.
    const bytes = readFileSync(`${OUT}/${f.file}`);
    const size = statSync(`${OUT}/${f.file}`).size;

    // 5. the PNG's REAL pixels are what the listing was promised. A frame that
    // is the wrong shape is not a near miss: Shopify letterboxes or crops it,
    // and the merchant sees a picture with grey bars or a cut edge. This ran
    // for months at 2720x1574 while the README said 3200x1800, because no
    // hurdle ever opened the file and looked.
    const pw = bytes.readUInt32BE(16);
    const ph = bytes.readUInt32BE(20);
    const scale = scaleOf(f);
    if (pw !== f.width * scale || ph !== f.height * scale) {
      throw new Error(
        `PNG is ${pw}x${ph}; the listing was promised ${f.width * scale}x${f.height * scale} ` +
        `(${f.width}x${f.height} at ${scale}x)`
      );
    }
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
