/**
 * FR13, proved by a CLICK (Phase 12 Part A, A1).
 *
 *   STORE=navaal-ttv-03 node tools/proof/fr13-click.mjs
 *
 * Twice the route /app/review?product=<numeric id> was proved to work, and
 * twice nobody clicked the button. This opens /app/products, finds the first
 * row whose badge reads "Ready to review", CLICKS its "Review" button, waits
 * for the app frame to navigate, and reads location.pathname + search from
 * inside the frame. It passes only when the location is
 * /app/review?product=<digits> AND an approve control is on the screen.
 *
 * Navigates only; approves nothing, publishes nothing. Refuses anything that
 * is not a dev store by name pattern.
 */
import { chromium } from "@playwright/test";

const STORE = process.env.STORE || "navaal-ttv-03";
if (!/^(navaal-ttv-\d+|navaal-qa-[a-z0-9-]+|navaal-shape-[a-z0-9-]+|contentpilot-dev\d*)$/.test(STORE)) {
  console.error("refusing: not a dev store by name pattern");
  process.exit(2);
}
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const b = await chromium.launch();
const c = await b.newContext({ storageState: "tests/e2e/.auth/shopify.json", viewport: { width: 1600, height: 1200 }, userAgent: UA });
const p = await c.newPage();
const frame = async () => {
  const dl = Date.now() + 60000;
  while (Date.now() < dl) {
    const f = p.frames().find((f) => f.url().includes("app.navaal.ai"));
    if (f) return f;
    await p.waitForTimeout(400);
  }
  throw new Error("no app frame");
};
const settled = async (fr, marker) => {
  const dl = Date.now() + 45000;
  while (Date.now() < dl) {
    const t = await fr.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (t.includes(marker)) return t;
    await p.waitForTimeout(500);
  }
  return fr.evaluate(() => document.body?.innerText || "").catch(() => "");
};

await p.goto(`https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content/app/products`, { waitUntil: "domcontentloaded", timeout: 90000 });
let fr = await frame();
await settled(fr, "products in your catalog");
const before = await fr.evaluate(() => location.pathname + location.search);
console.log(`before: ${before}`);

// The first row whose badge says "Ready to review", and its Review button.
const row = fr.locator("li", { has: fr.locator("span", { hasText: /^Ready to review$/ }) }).first();
const count = await row.count();
if (count === 0) {
  console.log("no row reads 'Ready to review' on this store — nothing to click");
  await b.close();
  process.exit(1);
}
const title = await row.locator("h3").first().innerText().catch(() => "?");
const button = row.locator("button", { hasText: /^Review$/ }).first();
console.log(`row: ${title} · Review buttons in row: ${await button.count()}`);
await button.click();

// Wait for the frame's location to leave /app/products.
const dl = Date.now() + 30000;
let after = before;
while (Date.now() < dl) {
  fr = await frame();
  after = await fr.evaluate(() => location.pathname + location.search).catch(() => before);
  if (after !== before) break;
  await p.waitForTimeout(300);
}
console.log(`after click: ${after}`);
const text = await settled(fr, "Review");
const approve = await fr.evaluate(() => document.querySelectorAll("input[type=checkbox][id^=approve-]").length);
const scoped = /Showing one product/.test(text);
const ok = /^\/app\/review\?product=\d+$/.test(after);
console.log(`location is /app/review?product=<numeric>: ${ok ? "yes" : "NO"}`);
console.log(`"Showing one product" banner: ${scoped ? "yes" : "NO"}`);
console.log(`approve controls on the landing screen: ${approve}`);
await b.close();
process.exit(ok && approve >= 1 ? 0 : 1);
