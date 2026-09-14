/**
 * P2.6 proof — press ONE bulk-fix button on a DEV store and read what changed.
 *
 *   STORE=navaal-ttv-03 FIX="No barcode by design" node tools/proof/fix-proof.mjs
 *
 * Opens /app/fix inside the embedded admin, finds the section button whose
 * label starts with FIX, presses it, reads the result banner, then reloads
 * /app/attention and counts how many "gtin" findings remain. The default FIX
 * writes ONLY to our own database (gtinExempt) — nothing in Shopify — which is
 * exactly why it is the one pressed here.
 *
 * Writes to the dev store named in STORE only. Never a commercial catalogue.
 * Needs the saved admin session (tools/proof/login-cdp.mjs).
 */
import { chromium } from "@playwright/test";

const STORE = process.env.STORE || "navaal-ttv-03";
const FIX = process.env.FIX || "No barcode by design";
if (!/^(navaal-ttv-\d+|navaal-qa-[a-z0-9-]+|contentpilot-dev\d*)$/.test(STORE)) {
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
const settled = async (fr) => {
  const dl = Date.now() + 45000;
  while (Date.now() < dl) {
    const t = await fr.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (t.includes("Method:")) return t;
    await p.waitForTimeout(500);
  }
  return fr.evaluate(() => document.body?.innerText || "").catch(() => "");
};
const gtinCount = (t) => (t.match(/OpenAI product feed · gtin/g) || []).length;

await p.goto(`https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content/app/attention`, { waitUntil: "domcontentloaded", timeout: 90000 });
let fr = await frame();
const before = await settled(fr);
console.log(`BEFORE attention: ${gtinCount(before)} gtin findings listed; header: ${before.split("\n").find((l) => /cannot be listed/.test(l)) ?? "-"}`);

await p.goto(`https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content/app/fix`, { waitUntil: "domcontentloaded", timeout: 90000 });
fr = await frame();
const fixText = await settled(fr);
const line = fixText.split("\n").find((l) => l.startsWith(FIX));
console.log(`FIX page section: ${line ?? "(section not present)"}`);
const btn = fr.getByRole("button", { name: new RegExp(`^${FIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} for \\d+`) });
const n = await btn.count();
if (!n) {
  console.log("NO BUTTON for", FIX);
  await b.close();
  process.exit(1);
}
const label = (await btn.first().innerText()).trim();
console.log(`pressing: "${label}" at ${new Date().toISOString()}`);
await btn.first().click({ timeout: 15000 });
let banner = "";
for (let i = 0; i < 60 && !banner; i++) {
  await p.waitForTimeout(500);
  const t = await fr.evaluate(() => document.body?.innerText || "").catch(() => "");
  const m = t.split("\n").find((l) => /^\d+ applied|^\d+ queued|Could not|monitored only/.test(l.trim()));
  if (m) banner = m.trim();
}
console.log(`RESULT banner: ${banner || "(none within 30 s)"}`);

await p.goto(`https://admin.shopify.com/store/${STORE}/apps/navaal-seo-geo-content/app/attention`, { waitUntil: "domcontentloaded", timeout: 90000 });
fr = await frame();
const after = await settled(fr);
console.log(`AFTER attention: ${gtinCount(after)} gtin findings listed; header: ${after.split("\n").find((l) => /cannot be listed/.test(l)) ?? "-"}`);
await b.close();
