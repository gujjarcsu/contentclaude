/**
 * Phase 2 item 2.11 — Web Vitals from a US admin, p75 over 10 loads.
 *
 * Built for Shopify measures admin LCP, CLS and INP for real merchants, most of
 * whom are in the US or EU. The app is in Sydney. Measuring from Sydney would
 * flatter it by roughly the width of the Pacific, so this throttles the network
 * to a US-to-Sydney round trip rather than pretending the distance is not there.
 *
 * Targets (Built for Shopify): LCP <= 2.5s, CLS <= 0.1, INP <= 200ms.
 *
 *   node tools/proof/web-vitals.mjs --label before
 *   node tools/proof/web-vitals.mjs --label after
 *   node tools/proof/web-vitals.mjs --compare
 *
 * Results land in docs/history/web-vitals/<label>.json so a before and an after
 * can be diffed rather than remembered.
 *
 * This drives a REAL admin session (tests/e2e/.auth/shopify.json). It only
 * reads: it navigates and measures. Run `node tools/proof/login-cdp.mjs` first
 * if the session has expired.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STORE = process.env.SHOP_HANDLE || "navaal-qa-fresh";
const AUTH = "tests/e2e/.auth/shopify.json";
const OUT_DIR = "docs/history/web-vitals";
const RUNS = Number(process.env.VITALS_RUNS || 10);

/** A real Chrome UA. Without it the Shopify library answers 410 Gone. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * The screens Built for Shopify would be measured on, in the order a merchant
 * meets them. `/app/products/…` needs a real product id, so it is resolved at
 * run time from the Products page rather than hard-coded.
 */
const SCREENS = [
  { name: "Home", path: "/app" },
  { name: "Products", path: "/app/products" },
  { name: "Review", path: "/app/review" },
];

/**
 * A US-to-Sydney round trip. Not a guess at "slow 4G": the point is the
 * distance, which is the thing the Sydney-only topology cannot avoid.
 * ~200ms RTT is a typical US-east to ap-southeast-2 figure.
 */
const US_LATENCY_MS = 200;

/** web-vitals from a CDN, evaluated in the page. */
const VITALS_SRC = "https://unpkg.com/web-vitals@4/dist/web-vitals.iife.js";

/**
 * Say WHICH failure this is. The first version of this guard reported every
 * non-rendering page as "session expired", which sent the owner to re-run
 * login-cdp.mjs when the session was perfectly valid and the real cause was the
 * user-agent. A wrong diagnosis in an error message costs more time than no
 * message at all.
 */
function renderFailure(text) {
  const t = String(text || "");
  if (/410\s+Gone/i.test(t)) {
    return (
      "app returned 410 Gone - this browser was identified as a BOT, not a session problem. " +
      "Playwright reports HeadlessChrome and the Shopify library answers non-browser agents with 410. " +
      "The harness sets a real Chrome user-agent; if you see this, that override is not reaching the request."
    );
  }
  if (/40[13]\s+(Unauthorized|Forbidden)/i.test(t)) {
    return "app returned 401/403 - the saved session has expired; run: node tools/proof/login-cdp.mjs";
  }
  return `app did not render (${JSON.stringify(t.slice(0, 60))}); run: node tools/proof/login-cdp.mjs if the session is stale`;
}

function p75(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1);
  return Math.round(sorted[idx] * 100) / 100;
}

async function measureOnce(context, url) {
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  // Latency only. Bandwidth is not the constraint; the ocean is.
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: US_LATENCY_MS,
    downloadThroughput: (12 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8,
  });

  await page.addInitScript({ path: undefined, content: "window.__vitals = {};" });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // Wait for the app's own frame to exist before measuring anything. The admin
  // shell paints first and the embedded frame follows; without this the harness
  // measured whichever of the two happened to be there, and reported "no app
  // frame" whenever the iframe was a moment late.
  await page
    .waitForFunction(
      () => [...document.querySelectorAll("iframe")].some((f) => (f.src || "").includes("app.navaal.ai")),
      { timeout: 30_000 },
    )
    .catch(() => {});

  await page.addScriptTag({ url: VITALS_SRC }).catch(() => {});
  await page.evaluate(() => {
    if (!window.webVitals) return;
    window.__vitals = {};
    window.webVitals.onLCP((m) => (window.__vitals.LCP = m.value), { reportAllChanges: true });
    window.webVitals.onCLS((m) => (window.__vitals.CLS = m.value), { reportAllChanges: true });
    window.webVitals.onINP((m) => (window.__vitals.INP = m.value), { reportAllChanges: true });
  });

  // Give the page a chance to settle, then poke it so INP has an interaction to
  // measure. Without an interaction INP is simply absent, not zero.
  await page.waitForTimeout(4000);
  await page.mouse.move(200, 300);
  await page.keyboard.press("Tab").catch(() => {});
  await page.waitForTimeout(1500);

  // The app must have RENDERED. An embedded route that has not completed
  // Shopify token exchange answers 410 and stays there, and a 410 page has a
  // perfectly good LCP - so a stale saved session yields ten confident samples
  // measuring an error page. That happened on the first run of this harness.
  // Read through Playwright FRAME handles, not iframe.contentDocument. The app
  // is served from a different origin to the admin, so contentDocument is null
  // and the check would silently fall back to the ADMIN page text - which never
  // contains the app error, so it would pass on every broken run. That is the
  // same class of mistake this guard exists to catch.
  // Strictly the APP frame. The admin page URL also contains "navaal" (the app
  // handle is in the path), so a looser match silently measures the admin shell
  // - which is what the sibling harness did for nine of twelve screens while
  // reporting every one of them as passing.
  const appFrame = page.frames().find((f) => f.url().includes("app.navaal.ai"));
  const rendered = appFrame
    ? await appFrame
        .evaluate(() => {
          const t = (document.body.innerText || "").slice(0, 200);
          return { t, bad: /\d{3}\s+(Gone|Forbidden|Unauthorized)/i.test(t) || t.trim().length < 40 };
        })
        .catch(() => ({ t: "", bad: false }))
    : { t: "no app frame on the page", bad: true };

  const vitals = await page.evaluate(() => window.__vitals || {});
  await page.close();
  if (rendered.bad) {
    throw new Error(renderFailure(rendered.t));
  }
  return vitals;
}

async function run(label) {
  if (!existsSync(AUTH)) {
    console.error(`No saved session at ${AUTH}. Run: node tools/proof/login-cdp.mjs`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: AUTH,
    viewport: { width: 1600, height: 1000 },
    // Playwright reports HeadlessChrome, which the Shopify library treats as a
    // bot: it answers 410 Gone instead of the app. The first run of this
    // harness measured that error page across ten loads and reported a
    // confident LCP table. The session was fine; the user-agent was not.
    userAgent: BROWSER_UA,
  });
  const base = `https://admin.shopify.com/store/${STORE}`;
  const results = {};

  for (const screen of SCREENS) {
    const samples = { LCP: [], CLS: [], INP: [] };
    for (let i = 0; i < RUNS; i++) {
      try {
        const v = await measureOnce(context, `${base}/apps/navaal-seo-geo-content${screen.path}`);
        for (const k of Object.keys(samples)) {
          if (typeof v[k] === "number") samples[k].push(v[k]);
        }
        process.stdout.write(".");
      } catch (err) {
        process.stdout.write("x");
        // A single flaky load is fine and shows as a smaller n. A session that
        // is not rendering the app at all is not - every sample would be an
        // error page, so stop rather than publish a number that means nothing.
        if (String(err.message).includes("did not render")) {
          console.error(`\n${err.message}`);
          process.exit(1);
        }
      }
    }
    results[screen.name] = {
      n: samples.LCP.length,
      LCP_p75_ms: p75(samples.LCP),
      CLS_p75: p75(samples.CLS),
      INP_p75_ms: p75(samples.INP),
    };
    console.log(` ${screen.name}`, JSON.stringify(results[screen.name]));
  }

  await browser.close();

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    label,
    at: new Date().toISOString(),
    store: STORE,
    runs: RUNS,
    emulatedLatencyMs: US_LATENCY_MS,
    targets: { LCP_p75_ms: 2500, CLS_p75: 0.1, INP_p75_ms: 200 },
    results,
  };
  const out = join(OUT_DIR, `${label}.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${out}`);
}

function compare() {
  const before = join(OUT_DIR, "before.json");
  const after = join(OUT_DIR, "after.json");
  if (!existsSync(before) || !existsSync(after)) {
    console.error("Need both before.json and after.json in " + OUT_DIR);
    process.exit(1);
  }
  const b = JSON.parse(readFileSync(before, "utf8"));
  const a = JSON.parse(readFileSync(after, "utf8"));
  const rows = [];
  for (const screen of Object.keys(a.results)) {
    for (const metric of ["LCP_p75_ms", "CLS_p75", "INP_p75_ms"]) {
      rows.push({
        screen,
        metric,
        before: b.results[screen]?.[metric] ?? null,
        after: a.results[screen]?.[metric] ?? null,
        target: a.targets[metric],
      });
    }
  }
  console.table(rows);
}

const args = process.argv.slice(2);
if (args.includes("--compare")) compare();
else {
  const i = args.indexOf("--label");
  const label = i >= 0 ? args[i + 1] : "run";
  await run(label);
}
