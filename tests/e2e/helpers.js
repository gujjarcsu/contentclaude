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
 * GROUND TRUTH: read a product's image alt text from the Shopify admin itself.
 * Never trust the app's own success message for this.
 */
export async function getShopifyImageAltText(page, productId) {
  await page.goto(`${ADMIN}/products/${productId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const media = page.locator('[data-testid="media-thumbnail"], [aria-label*="media"] img, img[alt]').first();
  await media.click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // The alt-text editor exposes a labelled field; fall back to the img alt attr.
  const altField = page.getByLabel(/alt text/i).first();
  if (await altField.count()) {
    const v = await altField.inputValue().catch(() => null);
    if (v !== null) return v.trim();
  }
  const attr = await page.locator("img[alt]").first().getAttribute("alt").catch(() => null);
  return (attr || "").trim();
}

/** GROUND TRUTH: read the SEO title/description Shopify actually holds. */
export async function getShopifySeo(page, productId) {
  await page.goto(`${ADMIN}/products/${productId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const body = await page.locator("main").innerText();
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
