import { test, expect } from "@playwright/test";
import {
  gotoApp, appFrame, appText, assertNoRawErrors,
  getShopifyImageAltText, ROUTES,
} from "./helpers.js";

/**
 * P0 REGRESSION SUITE
 *
 * One test per defect that was found in production. If any of these fail,
 * the app is not submittable. Each asserts GROUND TRUTH in the Shopify admin
 * wherever the app makes a claim about having written something.
 *
 * Set ALT_TEXT_PRODUCT_ID to a product with >=1 image and no prior alt-text run.
 */

const ALT_PRODUCT = process.env.ALT_TEXT_PRODUCT_ID || "7629403488359"; // Selling Plans Ski Wax
const LEGACY_ALT_PRODUCT = process.env.LEGACY_ALT_PRODUCT_ID || "7629403652199"; // has a pre-fix failed row

test.describe("P0-1 — Image alt text actually writes to Shopify", () => {
  test("generating alt text writes real alt text to the product media", async ({ page }) => {
    await gotoApp(page, `/products/${ALT_PRODUCT}`);

    const before = await getShopifyImageAltText(page, ALT_PRODUCT);
    console.log(`[alt] before: ${JSON.stringify(before)}`);

    await gotoApp(page, `/products/${ALT_PRODUCT}`);
    await appFrame(page).getByRole("tab", { name: /alt text/i }).click();
    await page.waitForTimeout(1500);

    const genBtn = appFrame(page).getByRole("button", { name: /generate alt text/i });
    await expect(genBtn).toBeVisible();
    await genBtn.click();

    // Real AI call — wait for a terminal state, not a fixed sleep.
    await expect(
      appFrame(page).getByText(/applied|not applied|partially|failed|error/i).first()
    ).toBeVisible({ timeout: 150_000 });

    const uiText = await appText(page);
    console.log(`[alt] app reported: ${uiText.slice(0, 600)}`);

    // No raw GraphQL ever reaches the merchant.
    await assertNoRawErrors(page, "alt text tab");

    // GROUND TRUTH — this is the assertion that matters.
    const after = await getShopifyImageAltText(page, ALT_PRODUCT);
    console.log(`[alt] after: ${JSON.stringify(after)}`);

    expect(after, "Alt text was not written to the Shopify product media").toBeTruthy();
    expect(after.length, "Alt text is suspiciously short").toBeGreaterThan(10);
    expect(after).not.toEqual(before);
  });

  test("a product whose alt text failed does NOT show a success badge", async ({ page }) => {
    // Regression for the legacy-row bug: pre-fix rows stored status:"published"
    // with an error payload, and rendered a green "Applied to Shopify" badge.
    await gotoApp(page, `/products/${LEGACY_ALT_PRODUCT}`);
    await appFrame(page).getByRole("tab", { name: /alt text/i }).click();
    await page.waitForTimeout(2000);

    const text = await appText(page);
    const claimsSuccess = /applied to shopify/i.test(text);
    const showsFailure = /error|failed|not applied/i.test(text);

    expect(
      claimsSuccess && showsFailure,
      "UI shows a success badge and an error at the same time — the original defect"
    ).toBe(false);

    await assertNoRawErrors(page, "legacy alt text row");
  });
});

test.describe("P0-2 — Review & Publish queue integrity", () => {
  test("no collection GIDs appear in the product review queue", async ({ page }) => {
    await gotoApp(page, "/review");
    const text = await appText(page);
    expect(text).not.toContain("gid://shopify/Collection/");
    expect(text).not.toContain("gid://shopify/");
    await assertNoRawErrors(page, "review queue");
  });

  test("publishing the queue never reports partial failure", async ({ page }) => {
    await gotoApp(page, "/review");
    const publish = appFrame(page).getByRole("button", { name: /publish \d+ approved/i });

    if (!(await publish.count())) {
      test.skip(true, "Queue empty — generate drafts first to exercise this path");
      return;
    }

    await publish.click();
    await expect(
      appFrame(page).getByText(/published|nothing to review|error/i).first()
    ).toBeVisible({ timeout: 150_000 });

    const text = await appText(page);
    expect(text, "Publish reported partial failure").not.toMatch(/published with some errors/i);
    expect(text).not.toContain("Invalid id");
    await assertNoRawErrors(page, "review publish result");
  });
});

test.describe("Dashboard / queue consistency", () => {
  test("dashboard draft count matches what the review queue actually shows", async ({ page }) => {
    await gotoApp(page, "");
    const dash = await appText(page);
    const m = dash.match(/Drafts Pending Review\s*(\d+)/i) || dash.match(/(\d+)\s+drafts? awaiting review/i);
    const dashCount = m ? parseInt(m[1], 10) : 0;

    await gotoApp(page, "/review");
    const review = await appText(page);
    const empty = /nothing to review/i.test(review);
    const rm = review.match(/(\d+)\s+products? with draft content/i);
    const reviewCount = empty ? 0 : rm ? parseInt(rm[1], 10) : null;

    console.log(`[counts] dashboard=${dashCount} review=${reviewCount}`);
    expect(
      reviewCount,
      `Dashboard says ${dashCount} drafts pending but the review queue shows ${empty ? "nothing to review" : reviewCount}`
    ).toBe(dashCount);
  });
});

test.describe("P0-5 — Theme embed guidance", () => {
  test("dashboard surfaces the app-embed setup step with a theme editor deep link", async ({ page }) => {
    await gotoApp(page, "");
    const text = await appText(page);
    expect(text).toMatch(/app embed|theme editor|FAQ schema/i);

    const link = appFrame(page).getByRole("button", { name: /theme editor/i })
      .or(appFrame(page).getByRole("link", { name: /theme editor/i }));
    await expect(link.first()).toBeVisible();
  });
});

test.describe("P0-4 — Plan gates are never silent", () => {
  test("a gated bulk action shows a visible message rather than nothing", async ({ page }) => {
    await gotoApp(page, "/products");
    const before = await appText(page);

    const gated = appFrame(page).getByRole("button", { name: /generate all|quick generate/i }).first();
    if (!(await gated.count())) {
      test.skip(true, "No bulk control rendered on this plan");
      return;
    }
    await gated.click();
    await page.waitForTimeout(6000);

    const after = await appText(page);
    expect(
      after !== before || /plan|upgrade|growth|started|job/i.test(after),
      "Clicking a bulk action produced no visible response at all"
    ).toBeTruthy();
  });
});

test.describe("No raw errors anywhere", () => {
  for (const [name, route] of ROUTES) {
    test(`${name} renders without technical strings`, async ({ page }) => {
      await gotoApp(page, route);
      await assertNoRawErrors(page, name);
      const text = await appText(page);
      expect(text.trim().length, `${name} rendered an empty page`).toBeGreaterThan(40);
    });
  }
});

test.describe("Marketing claim accuracy", () => {
  test("in-app copy does not promise outcomes the app cannot control", async ({ page }) => {
    await gotoApp(page, "");
    const text = await appText(page);
    // Requirement 1.1.4 — factual information only. Describe mechanism, not result.
    const risky = [
      /get cited by chatgpt/i,
      /will rank/i,
      /guaranteed/i,
      /\d+x more/i,
      /increase (traffic|sales|revenue) by/i,
    ].filter((r) => r.test(text));
    expect(risky.map(String), "Outcome-promising copy found in the app UI").toEqual([]);
  });
});
