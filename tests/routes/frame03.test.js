/**
 * Phase 15 — FRAME 03 WAS HELD ON A COUNT, AND THIS IS THE ROW.
 *
 * On `contentpilot-dev2` one view of the Products screen showed:
 *
 *   header  8 with content published
 *   tile    8 AI Content Published
 *   tab     Published on this page (9)
 *
 * and the denominators disagreed too: the tabs' 0 + 6 + 9 = 15 rows against the
 * header's 8 + 6 = 14. Every number was individually right.
 *
 * CC found the row, read-only, on 2026-09-16:
 *
 *   gid://shopify/Product/7800250007655 — our state `published`,
 *   Shopify status DRAFT, publishedAt null, no online-store URL.
 *
 * The cause is two populations on one screen, the defect `catalogueContent.js`
 * exists to remove:
 *
 *   the LIST   `-status:archived`                        15 products
 *   the HEADER the candidate scope, which for this shop is
 *              `(status:active OR status:draft) AND published_status:published`
 *                                                        14 products
 *
 * "on this page" was the only qualifier the tabs carried, and it explains
 * PAGINATION. This store's 15 products fit on one page, so it explained
 * nothing. The screen now names the difference and the row carries a badge.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { offStorefrontRows } from "../../app/utils/catalogueContent.js";

const read = (f) => readFileSync(f, "utf8");
const strip = (s) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

describe("the fact the screen was missing", () => {
  it("the list query asks Shopify whether the product is on the Online Store", () => {
    const src = read("app/routes/app.products.jsx");
    // both directions of the cursor, or the previous page loses the fact
    const asks = src.match(/id title handle status productType vendor description publishedAt/g) ?? [];
    expect(asks).toHaveLength(2);
  });

  it("the row carries it, as a boolean and not as a date", () => {
    const src = strip(read("app/routes/app.products.jsx"));
    expect(src).toMatch(/onStorefront: !!node\.publishedAt/);
  });

  it("offStorefrontRows counts only the rows Shopify says are not published", () => {
    expect(offStorefrontRows([{ onStorefront: true }, { onStorefront: false }])).toBe(1);
    expect(offStorefrontRows([{ onStorefront: false }, { onStorefront: false }])).toBe(2);
    expect(offStorefrontRows([{ onStorefront: true }])).toBe(0);
  });

  it("'we did not ask' is never counted as 'no'", () => {
    // A row built before the field was queried has `undefined`, which is the
    // absence of an answer. Counting it as "not on the storefront" would put a
    // sentence on the screen about products that are fine.
    expect(offStorefrontRows([{}, { onStorefront: undefined }, null])).toBe(0);
    expect(offStorefrontRows(undefined)).toBe(0);
    expect(offStorefrontRows("nonsense")).toBe(0);
  });
});

describe("the two populations now reconcile on screen", () => {
  it("THE DEFECT, with the real numbers: the tabs and the header differ by the off-storefront rows", () => {
    // contentpilot-dev2, 2026-09-16, read from production.
    const tabs = { none: 0, draft: 6, published: 9 };
    const header = { published: 8, drafts: 6 };
    const offStorefront = offStorefrontRows([
      ...Array.from({ length: 14 }, () => ({ onStorefront: true })),
      { onStorefront: false }, // gid://…/7800250007655, a Shopify DRAFT
    ]);
    const listed = tabs.none + tabs.draft + tabs.published;
    expect(listed).toBe(15);
    expect(header.published + header.drafts).toBe(14);
    // the gap is exactly the rows the header's population excludes
    expect(listed - offStorefront).toBe(header.published + header.drafts);
  });

  it("the tab counts carry an off-storefront count beside them", () => {
    const src = strip(read("app/routes/app.products.jsx"));
    expect(src).toMatch(/offStorefront: offStorefrontRows\(products\)/);
  });

  it("the sentence appears only when the page actually holds such a row", () => {
    const src = strip(read("app/routes/app.products.jsx"));
    expect(src).toMatch(/pageCounts\.offStorefront > 0 &&/);
    expect(src).toMatch(/not on your Online Store/);
    // it explains the SCOPE, never pagination — "on this page" was the false
    // explanation that let this sit unreconciled.
    const line = src.match(/\{t\("\{n, plural[^"]*not on your Online Store[^"]*"/);
    expect(line, "the reconciliation sentence").toBeTruthy();
    expect(line[0]).not.toMatch(/on this page/);
  });
});

describe("the row itself can be found", () => {
  it("the badge and the count key on the SAME fact", () => {
    const src = strip(read("app/routes/app.products.jsx"));
    // an ACTIVE product unpublished from the Online Store channel is out of the
    // header's population too, and the old badge only looked at `status`
    expect(src).toMatch(/onStorefrontById\[productId\] === false/);
    expect(src).toMatch(/not on your Online Store, so it has no public page/);
  });

  it("the Shopify draft / archived badge is still there — it is the other half", () => {
    const src = strip(read("app/routes/app.products.jsx"));
    expect(src).toMatch(/shopifyStatus !== "ACTIVE"/);
    expect(src).toMatch(/product is a Shopify \{v\}, not on your storefront/);
  });

  it("a badge is never claimed for a product we hold nothing for", () => {
    // NEEDS_CONTENT rows fall through to the action badge; the storefront
    // marker belongs to rows whose content we say is published.
    const src = strip(read("app/routes/app.products.jsx"));
    const guard = src.match(/const live = state === PRODUCT_STATE\.PUBLISHED \|\| state === PRODUCT_STATE\.UNVERIFIED;/);
    expect(guard).toBeTruthy();
    expect(src).toMatch(/if \(live && onStorefrontById\[productId\] === false\)/);
  });
});
