/**
 * FR13 (Phase 10) — read-only proof that Review opens scoped to one product,
 * with approve and publish on it.
 *
 *   STORE=navaal-ttv-03 node tools/proof/review-scoped-proof.mjs
 *
 * Opens /app/review, takes the first drafted product's id from its approve
 * checkbox (approve-gid-shopify-Product-<id>), then loads
 * /app/review?product=<id> and reports: the "Showing one product" banner,
 * the number of product cards on the page (expect 1), whether an Approve
 * control and a Publish button are present, and the way back to all drafts.
 * Navigates only; clicks nothing. Refuses anything that is not a dev store
 * by name pattern. The Products row's navigation to this URL is held by
 * tests/routes/firstRunPartA10.test.js.
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
const subtitleOf = (t) => t.split("\n").find((l) => /with draft content ready to review/.test(l)) ?? "-";

await p.goto(`https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content/app/review`, { waitUntil: "domcontentloaded", timeout: 90000 });
let fr = await frame();
const all = await settled(fr, "Review & Publish");
const id = await fr.evaluate(() => {
  const box = document.querySelector("input[type=checkbox][id^=approve-]");
  const m = box?.id?.match(/(\d+)$/);
  return m ? m[1] : null;
});
const allCards = await fr.evaluate(() => [...document.querySelectorAll("input[type=checkbox][id^=approve-]")].length);
console.log(`unscoped Review: ${allCards} product card(s); first drafted product ${id ?? "(none)"}; subtitle: ${subtitleOf(all)}`);
if (!id) {
  await b.close();
  process.exit(1);
}

await p.goto(`https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content/app/review?product=${id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
fr = await frame();
const text = await settled(fr, "Review & Publish");
const cards = await fr.evaluate(() => [...document.querySelectorAll("input[type=checkbox][id^=approve-]")].length);
const hasPublish = /Publish \d+ approved|Publish approved|Approve all on this page/.test(text);
const scoped = /Showing one product/.test(text);
console.log(`scoped banner: ${scoped ? "yes" : "NO"}`);
console.log(`subtitle: ${subtitleOf(text)}`);
console.log(`approve checkboxes on page: ${cards}`);
console.log(`publish control present: ${hasPublish ? "yes" : "NO"}`);
console.log(`"Show all drafts" way back: ${/Show all drafts/.test(text) ? "yes" : "NO"}`);
await b.close();
process.exit(scoped && cards === 1 && hasPublish ? 0 : 1);
