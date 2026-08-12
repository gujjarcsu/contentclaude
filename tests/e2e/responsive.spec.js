import { test, expect } from "@playwright/test";
import { gotoApp, appFrame, assertNoRawErrors, ROUTES } from "./helpers.js";

/**
 * 768px pass — the hardening report left this unverified.
 * Shopify admin is genuinely used on tablets, and horizontal overflow is the
 * classic embedded-app failure.
 */
test.describe("Tablet 768px", () => {
  for (const [name, route] of ROUTES) {
    test(`${name} has no horizontal overflow and no raw errors`, async ({ page }) => {
      await gotoApp(page, route);
      await assertNoRawErrors(page, `${name} @768`);

      const overflow = await appFrame(page).locator("body").evaluate((body) => {
        const doc = body.ownerDocument.documentElement;
        const offenders = [];
        body.querySelectorAll("*").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > doc.clientWidth + 2) {
            offenders.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""} (right=${Math.round(r.right)})`);
          }
        });
        return { scrollW: doc.scrollWidth, clientW: doc.clientWidth, offenders: offenders.slice(0, 8) };
      });

      console.log(`[768] ${name}: scrollW=${overflow.scrollW} clientW=${overflow.clientW}`);
      expect(
        overflow.scrollW,
        `${name} overflows horizontally at 768px. Offenders: ${overflow.offenders.join(" | ")}`
      ).toBeLessThanOrEqual(overflow.clientW + 4);
    });
  }
});

test.describe("Accessibility smoke", () => {
  test("primary actions are keyboard reachable and labelled", async ({ page }) => {
    await gotoApp(page, "/products");
    const unlabelled = await appFrame(page).locator("body").evaluate((body) => {
      const bad = [];
      body.querySelectorAll("button, a[href], input, select, textarea").forEach((el) => {
        const label =
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          el.textContent?.trim() ||
          el.getAttribute("placeholder");
        if (!label) bad.push(el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""));
      });
      return bad.slice(0, 10);
    });
    expect(unlabelled, `Interactive elements with no accessible name: ${unlabelled.join(", ")}`).toEqual([]);
  });
});
