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
 * GROUND TRUTH: read a product's media alt text from the Shopify admin itself.
 * Uses the product's own media-detail page (…/products/<id>/media/<mediaId>),
 * which has a single, reliably-labelled "Alt text" field — far more robust
 * than clicking a thumbnail and scraping the first img[alt] on the page (that
 * returned nav-icon alts like a 7-char string). Never trusts the app's claim.
 */
export async function getShopifyImageAltText(page, productId) {
  await page.goto(`${ADMIN}/products/${productId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  // Open the first product MEDIA item specifically (scoped to the Media card),
  // not any image on the page.
  const mediaImg = page
    .locator('[aria-label="Product media"] img, [aria-label="Media"] img, div:has(> [aria-label*="media" i]) img')
    .first();
  if (await mediaImg.count()) {
    await mediaImg.click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }

  // The media-detail view exposes a single labelled "Alt text" field.
  const altField = page.getByLabel(/alt text/i).first();
  if (await altField.count()) {
    const v = await altField.inputValue().catch(() => null);
    if (v !== null) return v.trim();
  }
  // Fallback: the media detail dialog's textbox.
  const textbox = page.getByRole("textbox", { name: /alt text/i }).first();
  if (await textbox.count()) {
    const v = await textbox.inputValue().catch(() => null);
    if (v !== null) return v.trim();
  }
  return "";
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
