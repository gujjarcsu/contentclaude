import { expect } from "@playwright/test";

export const STORE = process.env.SHOP_HANDLE || "contentpilot-dev2";
export const APP_HANDLE = "navaal-seo-geo-content";
export const ADMIN = `https://admin.shopify.com/store/${STORE}`;
export const APP = `${ADMIN}/apps/${APP_HANDLE}/app`;

/**
 * THE most important helper in this suite.
 *
 * The app renders inside a cross-origin iframe in the Shopify admin. Selecting
 * elements on `page` directly silently matches nothing, or matches admin chrome
 * instead of the app. Every app interaction must go through this frame locator.
 *
 * This is exactly what made manual browser automation unreliable.
 */
export function appFrame(page) {
  return page.frameLocator('iframe[name^="app-iframe"], iframe[src*="navaal"], iframe[src*="app.navaal.ai"]').first();
}

/** Navigate to an app route and wait for the embedded frame to actually render. */
export async function gotoApp(page, route = "") {
  await page.goto(`${APP}${route}`, { waitUntil: "domcontentloaded" });
  const frame = appFrame(page);
  // Wait for real content, not a skeleton.
  await expect(frame.locator("body")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500); // let the loader settle
  return frame;
}

/** Full visible text of the embedded app — handy for coarse assertions. */
export async function appText(page) {
  return (await appFrame(page).locator("body").innerText()) || "";
}

/**
 * GROUND TRUTH: the alt text Shopify actually holds for a product's media.
 *
 * The Shopify admin product page does not render reliably under headless
 * automation (it hydrates to a near-empty shell), so scraping it is not a
 * dependable oracle. Instead we read the app's "Currently on Shopify" panel,
 * which the product loader populates by querying the product's media
 * `altText` LIVE from the Shopify Admin API on every page load. That value is
 * Shopify's own data re-fetched fresh — not a stored success claim — so it
 * still fails loudly if the write never reached Shopify.
 */
export async function getShopifyImageAltText(page, productId) {
  const frame = await gotoApp(page, `/products/${productId}`);
  await frame.getByRole("tab", { name: /alt text/i }).click().catch(() => {});
  await page.waitForTimeout(1500);

  const text = await frame.locator("body").innerText().catch(() => "");
  const idx = text.indexOf("Currently on Shopify");
  if (idx === -1) return "";
  // The live Shopify alt values render as lines directly under the heading —
  // return the first substantive one.
  const after = text.slice(idx + "Currently on Shopify".length);
  const line = after.split("\n").map((l) => l.trim()).find((l) => l.length > 10);
  return (line || "").trim();
}

/** GROUND TRUTH: read the SEO title/description Shopify actually holds. */
export async function getShopifySeo(page, productId) {
  await page.goto(`${ADMIN}/products/${productId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  // The Shopify admin renders two <main> elements (app frame + page); scope to
  // the page's own scrollable main to avoid a strict-mode violation.
  const main = page.locator("#AppFrameMain");
  const body = await main.innerText();
  const idx = body.indexOf("Search engine listing");
  return idx === -1 ? "" : body.slice(idx, idx + 700);
}

/**
 * Scan the app frame for anything a merchant should never see.
 * Every string here was observed in production at some point.
 */
export const FORBIDDEN_UI_STRINGS = [
  "productImageUpdate",
  "doesn't exist on type",
  "gid://shopify/",
  "&amp;",
  "&lt;",
  "&gt;",
  "&quot;",
  "undefined",
  "[object Object]",
  "NaN",
  "Internal Server Error",
  "Unexpected token",
  "Cannot read properties",
  "TypeError",
];

export async function assertNoRawErrors(page, context = "") {
  const text = await appText(page);
  const hits = FORBIDDEN_UI_STRINGS.filter((s) => text.includes(s));
  expect(hits, `Raw error/technical strings visible to merchant${context ? ` on ${context}` : ""}: ${hits.join(", ")}`).toEqual([]);
}

/** Every app route, for sweep tests. */
export const ROUTES = [
  ["Dashboard", ""],
  ["Products", "/products"],
  ["Optimise Store", "/optimize"],
  ["Review & Publish", "/review"],
  ["SEO Audit", "/seo-audit"],
  ["Blog Generator", "/blog"],
  ["Blog Posts", "/blog/posts"],
  ["Collections", "/collections"],
  ["Results", "/results"],
  ["Analytics", "/analytics"],
  ["Jobs", "/jobs"],
  ["Settings", "/settings"],
  ["Plans & Billing", "/plans"],
];
