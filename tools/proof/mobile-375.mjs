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
  isMobile: true,
  hasTouch: true,
});

const results = [];

for (const [name, path] of SCREENS) {
  const page = await context.newPage();
  try {
    await page.goto(`https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(3500);

    // The embedded app lives in an iframe; measure inside it, not the admin
    // chrome, or every screen would report the admin's own scroll width.
    const frame = page.frames().find((f) => f.url().includes("navaal.ai")) || page.mainFrame();

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
      throw new Error(`app did not render (${JSON.stringify(rendered.text)}) - saved session is probably expired; run: node tools/proof/login-cdp.mjs`);
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

    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
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

const bad = results.filter((r) => r.overflows);
console.log(`\n${results.length} screens, ${bad.length} overflowing at ${WIDTH}px`);
console.log(`Screenshots in ${OUT}/`);
process.exit(bad.length > 0 ? 1 : 0);
