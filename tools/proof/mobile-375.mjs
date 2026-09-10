/**
 * Phase 2 item 2.12 — every screen at 375px, screenshotted.
 *
 * 375 CSS pixels is an iPhone SE and the narrowest width Shopify's admin is
 * expected to work at. The self-audit found four things that broke there: the
 * job ticker's fixed 260px progress track, the Home hero's `InlineStack`, the
 * Optimize four-checkbox row, and the Plans grid. Three of the four are gone
 * with the components that carried them; this is how the fourth, and anything
 * new, gets caught.
 *
 *   node tools/proof/mobile-375.mjs
 *
 * Writes docs/history/mobile-375/<screen>.png and a results.json recording, per
 * screen, whether the page scrolls horizontally — which is the objective test.
 * A screenshot proves what it looked like; `scrollWidth > clientWidth` proves
 * something overflowed.
 *
 * Reads only. Needs the saved admin session; run login-cdp.mjs if it expired.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STORE = process.env.SHOP_HANDLE || "navaal-qa-fresh";
const AUTH = "tests/e2e/.auth/shopify.json";
const OUT = "docs/history/mobile-375";
const WIDTH = 375;

/** A real Chrome UA, on a phone. Without it the Shopify library answers 410. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SCREENS = [
  ["home", "/app"],
  ["products", "/app/products"],
  ["review", "/app/review"],
  ["blog", "/app/blog"],
  ["settings", "/app/settings"],
  ["plans", "/app/plans"],
  ["optimize", "/app/optimize"],
  ["seo-audit", "/app/seo-audit"],
  ["jobs", "/app/jobs"],
  ["collections", "/app/collections"],
  ["results", "/app/results"],
  ["analytics", "/app/analytics"],
];

if (!existsSync(AUTH)) {
  console.error(`No saved session at ${AUTH}. Run: node tools/proof/login-cdp.mjs`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: AUTH,
  viewport: { width: WIDTH, height: 812 },
  deviceScaleFactor: 2,
  // NOT isMobile. At a phone viewport WITH a phone user-agent,
  // admin.shopify.com covers itself with a full-screen "Download the Shopify
  // app" promo, and every screenshot is that promo rather than this app.
  //
  // What item 2.12 is actually about is the app's CSS at 375 CSS pixels, and
  // media queries key off viewport width, not the user-agent. A desktop agent
  // at a 375px viewport exercises exactly the breakpoints in question and lets
  // the admin render the embedded app.
  hasTouch: true,
  // Playwright reports HeadlessChrome, which the Shopify library treats as a
  // bot and answers with 410 Gone. The first run of this harness screenshotted
  // that error page twelve times and reported "0 overflowing". The session was
  // fine; the user-agent was not.
  userAgent: BROWSER_UA,
});

const results = [];

for (const [name, path] of SCREENS) {
  const page = await context.newPage();
  try {
    await page.goto(`https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    // Wait for the app's own frame to exist. The admin shell paints first and
    // the embedded frame follows, so anything measured before this is the
    // admin, not the app.
    await page.waitForFunction(
      () => [...document.querySelectorAll("iframe")].some((f) => (f.src || "").includes("app.navaal.ai")),
      { timeout: 45_000 },
    );
    await page.waitForTimeout(4000);

    // The embedded app lives in an iframe; measure inside it, not the admin
    // chrome, or every screen reports the admin's own scroll width.
    //
    // NO `|| page.mainFrame()` fallback. That fallback is why nine screens were
    // silently measured against the admin shell and reported as passing: when
    // the app frame was late, the harness quietly measured something else and
    // said "ok". If the app frame is not here, that is the finding.
    const frame = page.frames().find((f) => f.url().includes("app.navaal.ai"));
    if (!frame) throw new Error("the app frame never appeared on this page");

    // The app must actually have RENDERED. Without this the harness measures
    // the width of an error page and reports every screen as fine — which is
    // exactly what happened on the first run: twelve screens, zero overflow,
    // and every screenshot was the same "410 Gone".
    //
    // An embedded route that has not completed Shopify token exchange answers
    // 410 and stays there, so a stale saved session produces a full set of
    // confident, meaningless results.
    const rendered = await frame.evaluate(() => {
      const t = document.body.innerText || "";
      return {
        ok: !/^\s*\d{3}\s+(Gone|Forbidden|Unauthorized)/i.test(t) && t.trim().length > 40,
        text: t.slice(0, 80),
      };
    });
    if (!rendered.ok) {
      const why = /410\s+Gone/i.test(rendered.text)
        ? "identified as a BOT (410 Gone), not a session problem - the real Chrome user-agent is not reaching the request"
        : `did not render (${JSON.stringify(rendered.text)}) - run: node tools/proof/login-cdp.mjs if the session is stale`;
      throw new Error(`app ${why}`);
    }
    const overflow = await frame.evaluate(() => {
      const d = document.documentElement;
      const widest = [...document.querySelectorAll("body *")]
        .map((el) => ({ w: el.getBoundingClientRect().right, tag: el.tagName, cls: el.className }))
        .filter((x) => x.w > window.innerWidth + 1)
        .sort((a, b) => b.w - a.w)[0];
      return {
        scrollWidth: d.scrollWidth,
        clientWidth: d.clientWidth,
        overflows: d.scrollWidth > d.clientWidth + 1,
        widest: widest ? `${widest.tag}.${String(widest.cls).slice(0, 60)} @${Math.round(widest.w)}px` : null,
      };
    });

    // Screenshot the APP FRAME, not the page.
    //
    // At a phone viewport admin.shopify.com covers itself with a full-screen
    // "Download the Shopify app" interstitial. A page-level screenshot captures
    // that promo, identically, on every screen - twelve byte-identical files
    // that look like a successful run and show none of this app. The embedded
    // frame renders correctly behind it, which is why the render guard passed.
    //
    // frameElement() gives the iframe's own box, so what is captured is the app
    // at 375px and nothing else.
    const el = await frame.frameElement().catch(() => null);
    if (!el) throw new Error("could not resolve the app frame element to screenshot");
    await el.screenshot({ path: join(OUT, `${name}.png`) });
    // A missing measurement is a FAILURE, not a pass.
    //
    // The first version of this line pushed whatever came back and then printed
    // "ok" unless  was explicitly true. When the evaluate returned
    // nothing,  was undefined, so nine screens that were never
    // measured were reported as fine. That is the third time in this harness
    // that an absent signal has been read as a good one.
    if (typeof overflow?.scrollWidth !== "number") {
      throw new Error(
        `no measurement returned (frame: ${frame.url().slice(0, 80)}) - the app frame was not the one evaluated`,
      );
    }
    results.push({ screen: name, path, ...overflow });
    console.log(`${overflow.overflows ? "OVERFLOW" : "ok      "} ${name}  ${overflow.widest ?? ""}`);
  } catch (err) {
    results.push({ screen: name, path, error: err.message });
    console.log(`error    ${name}  ${err.message.slice(0, 80)}`);
  } finally {
    await page.close();
  }
}

await browser.close();

writeFileSync(
  join(OUT, "results.json"),
  JSON.stringify({ at: new Date().toISOString(), width: WIDTH, store: STORE, results }, null, 2),
);

// Anything that is not an explicit, measured pass.
const bad = results.filter((r) => r.error || r.overflows || typeof r.scrollWidth !== "number");
console.log(`\n${results.length} screens, ${bad.length} overflowing at ${WIDTH}px`);
console.log(`Screenshots in ${OUT}/`);
process.exit(bad.length > 0 ? 1 : 0);
