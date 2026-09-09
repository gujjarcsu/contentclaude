import { defineConfig, devices } from "@playwright/test";

/**
 * Navaal — Shopify App Store review E2E suite.
 *
 * Tests the DEPLOYED app inside the real Shopify admin, through the embedded
 * iframe, and asserts ground truth in the Shopify admin itself — not just what
 * the app's own UI claims. That distinction is the entire point: the worst bug
 * in this app's history was a UI that reported success while writing nothing.
 *
 * Auth: one manual login, persisted to storageState. No credentials in code.
 */

// Phase 1 item 10 — this suite drives a REAL Shopify admin with a real saved
// session, and it writes: it generates content, publishes it to a storefront and
// changes plans. Pointed at a merchant's store it would edit that merchant's
// products. So the target is an allow-list of stores we own, and the default is
// the dedicated QA store rather than whichever handle happened to be in the file.
//
// To run against something else, name it AND say so:
//   SHOP_HANDLE=some-store E2E_ALLOW_UNLISTED_STORE=1 npx playwright test
const TEST_STORES = ["navaal-qa-fresh", "contentpilot-dev2"];
const STORE = process.env.SHOP_HANDLE || "navaal-qa-fresh";

if (!TEST_STORES.includes(STORE) && process.env.E2E_ALLOW_UNLISTED_STORE !== "1") {
  throw new Error(
    `Refusing to run the e2e suite against "${STORE}". It is not one of the known test stores ` +
      `(${TEST_STORES.join(", ")}), and this suite writes to whatever store it is pointed at. ` +
      `If you really mean it, set E2E_ALLOW_UNLISTED_STORE=1.`,
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Sequential. These tests mutate a real store; parallelism causes false failures.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0, // A retry that passes hides a flake. We want to see flakes.
  timeout: 180_000, // AI generation legitimately takes 20-40s
  expect: { timeout: 30_000 },

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],

  use: {
    baseURL: `https://admin.shopify.com/store/${STORE}`,
    storageState: "tests/e2e/.auth/shopify.json",
    viewport: { width: 1600, height: 1000 },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    // Evidence for every failure — this is what you review, and what feeds
    // the screencast shot list.
    screenshot: "on",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.js/,
      // The setup project CREATES the storage state — it must not try to load
      // it (chicken-and-egg ENOENT on first run). Start from an empty state.
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.js/, /responsive\.spec\.js/],
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
      dependencies: ["setup"],
      testMatch: /responsive\.spec\.js/,
    },
  ],
});
