// Cheap check (no generation): warm the admin SPA like the real test does,
// then confirm getShopifyImageAltText reads the already-present media alt.
import { chromium } from "@playwright/test";
import { getShopifyImageAltText, APP } from "../tests/e2e/helpers.js";

const PRODUCT = process.env.ALT_TEXT_PRODUCT_ID || "7629403488359";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: "tests/e2e/.auth/shopify.json", viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
// Warm the admin SPA shell first (the real suite does this via gotoApp).
await page.goto(APP, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

await page.goto(`https://admin.shopify.com/store/${process.env.SHOP_HANDLE || "contentpilot-dev2"}/products/${PRODUCT}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
await page.mouse.wheel(0, 1500).catch(() => {});
await page.waitForTimeout(3000);
const snap = await page.locator("body").ariaSnapshot().catch((e) => "ERR:" + e.message);
const imgLines = snap.split("\n").filter((l) => l.includes("img "));
console.log("aria img lines:", imgLines.length);
console.log(imgLines.slice(0, 12).join("\n"));
console.log("--- has ski wax alt in snapshot:", /ski wax bar on white/i.test(snap));
console.log("--- snapshot length:", snap.length);
await browser.close();
process.exit(0);
