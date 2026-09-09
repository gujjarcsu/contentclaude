// Attach to the ALREADY-OPEN login Chrome (remote-debugging-port 9333) and export
// its storageState — recovers a manual login when the launcher process exited
// before saving. No fresh profile, no re-login.
import { chromium } from "@playwright/test";
const PORT = 9333;
const AUTH_FILE = "tests/e2e/.auth/shopify.json";
try {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const context = browser.contexts()[0];
  const pages = context.pages();
  console.log("open pages:");
  for (const p of pages) console.log("  " + p.url());
  const authed = pages.find(
    (p) => /admin\.shopify\.com\/store\//.test(p.url())
      && !/\/login|accounts\.shopify\.com|\/oauth\//.test(p.url())
  );
  if (!authed) {
    console.log("NO_AUTHED_PAGE — no logged-in admin tab found. Log in first, then rerun.");
    await browser.close().catch(() => {});
    process.exit(2);
  }
  await context.storageState({ path: AUTH_FILE });
  console.log(`SESSION SAVED to ${AUTH_FILE} from ${authed.url()}`);
  await browser.close().catch(() => {});
  process.exit(0);
} catch (e) {
  console.log("ATTACH_FAILED: " + e.message);
  process.exit(1);
}
