#!/usr/bin/env node
/**
 * P0.4 — where App Bridge actually loads, read from the RENDERED DOCUMENT.
 *
 * Shopify's rule: `app-bridge.js` must be loaded before any other script, in the
 * `<head>` of every document. INP is only collected for apps using App Bridge,
 * and INP is a Built for Shopify gate.
 *
 * WHY THIS IS A BROWSER SCRIPT AND NOT A GREP. The source says
 * `<AppProvider embedded apiKey={apiKey}>`, and what that renders — and WHERE —
 * depends on the library version and on whether React hoists the tag. Reading
 * the source tells you what someone intended. Only the rendered document tells
 * you what a merchant's browser received, and P0.4's whole point is that the
 * proof is the document (L15).
 *
 * It reports, in document order: every script the page loaded, which parent it
 * sits in, where app-bridge.js falls in that order, and any console message
 * that looks like a duplicate-load warning — which is the specific risk of
 * adding the tag to the head while AppProvider still emits its own.
 *
 * READ ONLY. It loads one page and reads the DOM. It clicks nothing, submits
 * nothing and writes to no store.
 *
 * Usage:
 *   node tools/proof/appbridge-head.mjs [--store <handle>] [--path /app] [--json]
 *
 * Needs the saved session at tests/e2e/.auth/shopify.json
 * (created by tools/proof/login-cdp.mjs, where a human types the credentials).
 */
import { chromium } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";

const AUTH = "tests/e2e/.auth/shopify.json";
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const STORE = argOf("--store", "contentpilot-dev2");
const PATH = argOf("--path", "/app");
const AS_JSON = argv.includes("--json");
const OUT = argOf("--out", "");

if (!existsSync(AUTH)) {
  console.error(`NO SESSION at ${AUTH}\nRun: node tools/proof/login-cdp.mjs  (a human types the credentials)`);
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 1600, height: 900 },
  // A REAL Chrome user-agent, and this is not optional.
  //
  // Playwright's default contains "HeadlessChrome". The Shopify library treats a
  // non-browser agent as a bot and answers 410 Gone instead of serving the app,
  // so the frame loads a bot page, React fails to hydrate (#418 then #423), and
  // the document renders "Unhandled Thrown Response!" with no scripts in it.
  //
  // Read naively that looks exactly like "App Bridge is missing" — which is the
  // conclusion this script exists to reach or refute. It would have been a false
  // finding about the app's most critical path, from a page the app never
  // served. Same 410 trap ci.yml documents for curl.
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await context.newPage();

// Console messages are the only way a duplicate App Bridge announces itself.
const consoleMessages = [];
page.on("console", (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on("pageerror", (e) => consoleMessages.push({ type: "pageerror", text: String(e.message || e) }));

const url = `https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content${PATH}`;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

// The app renders in an iframe. Re-resolve each iteration: a cached frame
// reference goes stale across navigations and reports "no frame" when the frame
// is there — a mistake this repo has made before.
let frame = null;
const deadline = Date.now() + 45_000;
while (Date.now() < deadline) {
  frame = page.frames().find((fr) => fr.url().includes("app.navaal.ai"));
  if (frame) {
    const painted = await frame.evaluate(() => (document.body?.innerText || "").trim().length).catch(() => 0);
    if (painted > 60) break;
  }
  await page.waitForTimeout(500);
}
if (!frame) {
  console.error("no app frame attached — cannot read the document (this is NOT 'app bridge is missing')");
  await browser.close();
  process.exit(3);
}

const report = await frame.evaluate(() => {
  const scripts = [...document.querySelectorAll("script")].map((s, i) => ({
    order: i,
    parent: s.parentElement?.tagName?.toLowerCase() ?? "?",
    src: s.src || null,
    inline: !s.src,
    async: s.async,
    defer: s.defer,
    apiKeyAttr: s.getAttribute("data-api-key") ? "present" : null,
  }));

  const bridgeIndex = scripts.findIndex((s) => (s.src || "").includes("app-bridge.js"));
  const headScripts = scripts.filter((s) => s.parent === "head");

  return {
    url: location.href,
    title: document.title,
    totalScripts: scripts.length,
    scripts,
    appBridge:
      bridgeIndex === -1
        ? { present: false }
        : {
            present: true,
            order: bridgeIndex,
            parent: scripts[bridgeIndex].parent,
            inHead: scripts[bridgeIndex].parent === "head",
            isFirstScriptOverall: bridgeIndex === 0,
            isFirstInHead:
              scripts[bridgeIndex].parent === "head" && headScripts[0]?.order === bridgeIndex,
            copies: scripts.filter((s) => (s.src || "").includes("app-bridge.js")).length,
          },
    shopifyApiKeyMeta: !!document.querySelector('meta[name="shopify-api-key"]'),
    headOrder: [...document.head.children].map((el) =>
      el.tagName.toLowerCase() +
      (el.getAttribute("src") ? `[src=${el.getAttribute("src").split("/").pop()}]` : "") +
      (el.getAttribute("rel") ? `[rel=${el.getAttribute("rel")}]` : ""),
    ),
    shopifyGlobal: typeof window.shopify !== "undefined",
  };
});

const duplicateWarnings = consoleMessages.filter((m) =>
  /app.?bridge/i.test(m.text) && /(duplicate|already|twice|multiple|loaded more than)/i.test(m.text),
);

const out = { measuredAt: new Date().toISOString(), store: STORE, path: PATH, ...report, duplicateWarnings, consoleMessages };

if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 2));

if (AS_JSON) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`\nRENDERED DOCUMENT — ${out.url}`);
  console.log(`title: ${out.title}`);
  console.log(`\nhead children, in order:`);
  out.headOrder.forEach((h, i) => console.log(`  ${String(i).padStart(2)} ${h}`));
  console.log(`\nscripts, in document order:`);
  for (const s of out.scripts) {
    console.log(
      `  ${String(s.order).padStart(2)} [${s.parent}] ${s.src ? s.src.split("/").slice(-1)[0] : "(inline)"}` +
        `${s.apiKeyAttr ? " data-api-key" : ""}${s.async ? " async" : ""}${s.defer ? " defer" : ""}`,
    );
  }
  console.log(`\nAPP BRIDGE: ${JSON.stringify(out.appBridge)}`);
  console.log(`meta[name=shopify-api-key]: ${out.shopifyApiKeyMeta}`);
  console.log(`window.shopify present: ${out.shopifyGlobal}`);
  console.log(`duplicate-load warnings: ${duplicateWarnings.length}`);
  for (const w of duplicateWarnings) console.log(`  ! ${w.type}: ${w.text}`);
}

await browser.close();
