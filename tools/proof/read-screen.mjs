/**
 * Read what a screen actually SAYS to a merchant.
 *
 *   node tools/proof/read-screen.mjs <store-handle> <path> [--shot]
 *   node tools/proof/read-screen.mjs contentpilot-dev2 /app/review --shot
 *
 * Prints the text content of the app's own frame, and optionally saves a
 * screenshot. That is the whole tool.
 *
 * It exists because of what happened on 2026-09-10: 1,062 tests were passing,
 * every screen rendered, and three of them were saying things that were false
 * or contradicted the screen next to them — a paid plan described as "free
 * generations", stat cards disagreeing with the tabs directly beneath, and a
 * row badge disagreeing with both. None of those is a crash, a type error or a
 * failing assertion. They are only visible to somebody reading the words.
 *
 * So this is run after every increment, on a paid plan AND on Free, before an
 * item is called done. A test proves the code does what it was told to do; this
 * shows what a merchant is actually told.
 *
 * Reads only. Needs the saved admin session (tools/proof/login-cdp.mjs).
 */
import { chromium } from "@playwright/test";
import { mkdirSync, existsSync } from "node:fs";

const STORE = process.argv[2];
/**
 * The path, normalised.
 *
 * Git Bash (MSYS) rewrites a leading-slash argument into a Windows path, so
 * `/app/review` arrives as `C:/Program Files/Git/app/review` and the URL built
 * from it is nonsense. The harness then correctly reports "the app frame never
 * appeared" and the obvious-but-wrong conclusion is that production is broken.
 *
 * So: accept `app/review`, `/app/review`, or a mangled `...Git/app/review`, and
 * always end up with `/app/review`.
 */
const PATH = (() => {
  const raw = process.argv[3] || "/app";
  const m = raw.match(/(\/app(?:\/.*)?)$/);
  const cleaned = m ? m[1] : raw.startsWith("/") ? raw : `/${raw}`;
  return cleaned.replace(/\/+$/, "") || "/app";
})();
const SHOT = process.argv.includes("--shot");
const AUTH = "tests/e2e/.auth/shopify.json";
const OUT = "docs/history/screen-reads";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

if (!STORE) {
  console.error("usage: node tools/proof/read-screen.mjs <store-handle> <path> [--shot]");
  process.exit(2);
}
if (!existsSync(AUTH)) {
  console.error(
    `NO SESSION at ${AUTH} — run: node tools/proof/login-cdp.mjs (a human types the credentials)`,
  );
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 1600, height: 1200 },
  userAgent: BROWSER_UA,
});
const page = await context.newPage();
let code = 1;

try {
  const url = `https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content${PATH}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Wait on Playwright's OWN frame list rather than page.waitForFunction.
  // waitForFunction polls with requestAnimationFrame inside the page, and the
  // Shopify admin can leave that starved long enough to time out while the
  // frame is demonstrably present — which it did, on a page whose iframe a
  // plain evaluate() could see. Polling the frame list tests the thing we
  // actually care about and needs no in-page execution at all.
  const deadline = Date.now() + 60_000;
  let frame = null;
  while (Date.now() < deadline) {
    frame = page.frames().find((f) => f.url().includes("app.navaal.ai"));
    if (frame) break;
    await page.waitForTimeout(500);
  }
  if (!frame) {
    // Say what was actually there. A harness that reports "never appeared"
    // without showing what it saw sends somebody hunting the wrong thing —
    // the iframe ELEMENT can be present with its content never navigating,
    // which is a different failure from the app being down.
    const attached = page.frames().map((f) => f.url());
    const inDom = await page
      .evaluate(() => [...document.querySelectorAll("iframe")].map((i) => (i.src || "").slice(0, 120)))
      .catch(() => []);
    console.error("frames Playwright attached to:", JSON.stringify(attached, null, 1));
    console.error("iframe elements in the DOM:", JSON.stringify(inDom, null, 1));
    throw new Error("the app frame never appeared");
  }
  await page.waitForTimeout(7000); // streamed sections and skeletons

  const text = await frame.evaluate(() => (document.body.innerText || "").trim());
  if (/^\s*\d{3}\s+(Gone|Forbidden|Unauthorized|Not Found)/i.test(text)) {
    throw new Error(`the app returned an error page: ${text.slice(0, 80)}`);
  }
  if (text.length < 60) throw new Error(`the frame is effectively blank (${text.length} chars)`);

  console.log(`\n===== ${STORE} ${PATH} =====\n`);
  console.log(text);
  console.log(`\n===== ${text.length} characters =====`);

  if (SHOT) {
    mkdirSync(OUT, { recursive: true });
    const name = `${STORE}${PATH.replace(/\//g, "-")}.png`;
    const el = await frame.frameElement().catch(() => null);
    await (el ?? page).screenshot({ path: `${OUT}/${name}` });
    console.log(`screenshot: ${OUT}/${name}`);
  }
  code = 0;
} catch (err) {
  console.error(`FAILED: ${err.message}`);
} finally {
  await browser.close();
}
process.exit(code);
