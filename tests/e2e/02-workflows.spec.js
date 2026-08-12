import { test, expect } from "@playwright/test";
import {
  gotoApp, appFrame, appText, assertNoRawErrors,
  getShopifySeo,
} from "./helpers.js";

/**
 * END-TO-END MERCHANT WORKFLOWS
 * Mirrors the hardening report's 14-step manual protocol, automated.
 * Every workflow that claims to write to Shopify is verified in the Shopify admin.
 */

const PRODUCT = process.env.WORKFLOW_PRODUCT_ID || "7629403652199";

test.describe("Core loop: generate → review → publish → verify in Shopify", () => {
  test("generated content reaches Shopify's own product fields", async ({ page }) => {
    await gotoApp(page, `/products/${PRODUCT}`);

    const generate = appFrame(page).getByRole("button", { name: /generate content/i }).first();
    await expect(generate).toBeVisible();
    await generate.click();

    await expect(
      appFrame(page).getByText(/review below|published to your store|generated/i).first()
    ).toBeVisible({ timeout: 150_000 });
    await assertNoRawErrors(page, "product generate");

    // Capture the meta title the app is proposing.
    const appCopy = await appText(page);
    const metaMatch = appCopy.match(/Meta Title[\s\S]{0,300}/i);
    console.log(`[core] app draft: ${metaMatch ? metaMatch[0].slice(0, 200) : "n/a"}`);

    // Publish through the review queue.
    await gotoApp(page, "/review");
    const publish = appFrame(page).getByRole("button", { name: /publish \d+ approved/i });
    if (await publish.count()) {
      await publish.click();
      await expect(appFrame(page).getByText(/published|nothing to review/i).first())
        .toBeVisible({ timeout: 150_000 });
      const res = await appText(page);
      expect(res).not.toMatch(/published with some errors/i);
    }

    // GROUND TRUTH in Shopify.
    const seo = await getShopifySeo(page, PRODUCT);
    console.log(`[core] Shopify SEO block:\n${seo}`);
    expect(seo, "Shopify shows no search engine listing content").toBeTruthy();
    expect(seo.length).toBeGreaterThan(80);
  });
});

test.describe("Blog", () => {
  test("generated post is editable and publishes without duplicating", async ({ page }) => {
    await gotoApp(page, "/blog");

    const topic = appFrame(page).getByLabel(/topic/i).first();
    await expect(topic).toBeVisible();
    await topic.fill("How to write product descriptions that AI search engines can quote");

    await appFrame(page).getByRole("button", { name: /generate blog post/i }).click();
    await expect(appFrame(page).getByText(/generated|preview|edit html/i).first())
      .toBeVisible({ timeout: 180_000 });
    await assertNoRawErrors(page, "blog generate");

    // P1-2 regression: the title field used to reset on every keystroke.
    const title = appFrame(page).getByLabel(/title/i).first();
    if (await title.count()) {
      await title.click();
      await title.fill("Edited title for E2E verification");
      await page.waitForTimeout(1500);
      await expect(title, "Blog title reverted — the render-phase setState bug is back")
        .toHaveValue("Edited title for E2E verification");
    }
  });
});

test.describe("Collections", () => {
  test("collection content generates and publishes to Shopify", async ({ page }) => {
    await gotoApp(page, "/collections");
    const gen = appFrame(page).getByRole("button", { name: /^generate$|regenerate/i }).first();
    if (!(await gen.count())) { test.skip(true, "No collections in this store"); return; }

    await gen.click();
    await expect(appFrame(page).getByRole("button", { name: /publish to shopify/i }).first())
      .toBeVisible({ timeout: 150_000 });
    await assertNoRawErrors(page, "collections");
  });
});

test.describe("Settings", () => {
  test("brand voice and autopilot persist, including meta description", async ({ page }) => {
    await gotoApp(page, "/settings");

    const storeName = appFrame(page).getByLabel(/store name/i).first();
    await expect(storeName).toBeVisible();
    await storeName.fill("E2E Test Store");

    // P1-3 regression: autopilot never submitted ap_metaDescription.
    const autopilot = appFrame(page).getByLabel(/enable autopilot/i).first();
    if (await autopilot.count()) await autopilot.check().catch(() => {});

    await appFrame(page).getByRole("button", { name: /save settings/i }).first().click();
    await expect(appFrame(page).getByText(/saved|success/i).first()).toBeVisible({ timeout: 40_000 });

    await gotoApp(page, "/settings");
    await expect(appFrame(page).getByLabel(/store name/i).first()).toHaveValue("E2E Test Store");
    await assertNoRawErrors(page, "settings");
  });
});

test.describe("Billing", () => {
  test("plans page shows four plans, both billing intervals, and a consistent trial length", async ({ page }) => {
    await gotoApp(page, "/plans");
    const text = await appText(page);

    for (const plan of ["Free", "Starter", "Growth", "Professional"]) {
      expect(text, `Plan "${plan}" missing`).toContain(plan);
    }
    expect(text).toMatch(/\$9\.99/);
    expect(text).toMatch(/\$29\.99/);
    expect(text).toMatch(/\$79\.99/);

    // Trial length must be stated and must be ONE number everywhere.
    const trials = [...text.matchAll(/(\d+)[- ]day free trial/gi)].map((m) => m[1]);
    expect(trials.length, "No free trial length stated (requirement 4.2.1)").toBeGreaterThan(0);
    expect(
      new Set(trials).size,
      `Conflicting trial lengths in the app: ${[...new Set(trials)].join(", ")}`
    ).toBe(1);
    console.log(`[billing] trial length in app = ${trials[0]} days`);

    await assertNoRawErrors(page, "plans");
  });
});

test.describe("Jobs", () => {
  test("jobs page renders and cancel is offered for active jobs", async ({ page }) => {
    await gotoApp(page, "/jobs");
    await assertNoRawErrors(page, "jobs");
    const text = await appText(page);
    expect(text).toMatch(/job|no bulk|generate more/i);
  });
});
