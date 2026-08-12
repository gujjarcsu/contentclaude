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

const STORE = process.env.SHOP_HANDLE || "contentpilot-dev2";

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
      testIgnore: /auth\.setup\.js/,
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
      dependencies: ["setup"],
      testMatch: /responsive\.spec\.js/,
    },
  ],
});
