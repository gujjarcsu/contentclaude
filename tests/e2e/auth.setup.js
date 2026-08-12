import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_FILE = "tests/e2e/.auth/shopify.json";
const STORE = process.env.SHOP_HANDLE || "contentpilot-dev2";

/**
 * One-time interactive login.
 *
 * Run this ONCE with a headed browser. You log in yourself — including any
 * 2FA — and the session is saved to disk. No password ever touches the test
 * code, the repo, or any agent.
 *
 *   npx playwright test auth.setup.js --project=setup --headed
 *
 * Re-run it whenever the session expires (Shopify sessions last weeks).
 * .auth/ must be gitignored.
 */
setup("authenticate", async ({ page }) => {
  const dir = path.dirname(AUTH_FILE);
  fs.mkdirSync(dir, { recursive: true });

  // Reuse a still-valid session rather than forcing a pointless re-login.
  if (fs.existsSync(AUTH_FILE)) {
    const ctx = await page.context();
    await ctx.addCookies(JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")).cookies || []);
    await page.goto(`https://admin.shopify.com/store/${STORE}`);
    if (!page.url().includes("accounts.shopify.com") && !page.url().includes("/login")) {
      console.log("✅ Existing session is still valid.");
      await page.context().storageState({ path: AUTH_FILE });
      return;
    }
    console.log("⚠️  Saved session expired — log in again.");
  }

  await page.goto(`https://admin.shopify.com/store/${STORE}`);

  console.log("\n" + "═".repeat(64));
  console.log("  LOG IN IN THE BROWSER WINDOW THAT JUST OPENED.");
  console.log("  Complete 2FA if prompted. Wait until the admin loads.");
  console.log("  The session saves automatically. You have 5 minutes.");
  console.log("═".repeat(64) + "\n");

  // Wait for the admin shell, not just a URL — Shopify redirects several times.
  await expect(page.locator('[data-portal-id], nav, #AppFrameNav').first())
    .toBeVisible({ timeout: 300_000 });
  await page.waitForTimeout(3000);

  await page.context().storageState({ path: AUTH_FILE });
  console.log(`✅ Session saved to ${AUTH_FILE}`);
});
