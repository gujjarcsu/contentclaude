/**
 * Phase 14 item 2 — the last three A1 defects, each with a test that goes red
 * on the behaviour it replaced.
 *
 * CW's count is four; the line needs ≤ 3. These three take it to one. CW counts
 * A1, not this file — what is proved here is that the defect is gone from the
 * code, which is the part a session can prove without a browser.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { unwrapT } from "../helpers/code.js";
import { PRODUCT_STATE, rowActionHref } from "../../app/utils/productState.js";
import { uniformScoreNote } from "../../app/utils/startCopy.js";

const read = (f) => readFileSync(f, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

describe("FR13 — the row button's destination is a property of the row, not of its label", () => {
  it("a product with content goes to Review, scoped to that product", () => {
    for (const state of [PRODUCT_STATE.DRAFT, PRODUCT_STATE.PUBLISHED, PRODUCT_STATE.UNVERIFIED, PRODUCT_STATE.REJECTED]) {
      expect(rowActionHref(state, "9854392271078"), state).toBe("/app/review?product=9854392271078");
    }
  });

  it("a product with nothing written goes to the generate page", () => {
    expect(rowActionHref(PRODUCT_STATE.NEEDS_CONTENT, "9854392271078")).toBe("/app/products/9854392271078");
  });

  it("the numeric id is carried as Shopify's numeric id, never a GID", () => {
    // The GID form of ?product= renders every card, which Phase 11 recorded as
    // a false all-clear. The row must never produce it.
    expect(rowActionHref(PRODUCT_STATE.DRAFT, 9854392271078)).toBe("/app/review?product=9854392271078");
    expect(rowActionHref(PRODUCT_STATE.DRAFT, null)).toBe("/app/review?product=");
  });

  it("THE DEFECT ITSELF: the route is no longer chosen by comparing a display label", () => {
    const src = strip(read("app/routes/app.products.jsx"));
    // The old expression, which broke the moment the label was translated.
    expect(src).not.toMatch(/rowActionLabel\([^)]*\)\s*===\s*["'`]Review["'`]/);
    expect(src).toMatch(/navigate\(rowActionHref\(stateOfContentMap\(contentMap\[id\]\), numericId\)\)/);
  });

  it("the button's label is translated, like every other string on the screen", () => {
    // It returned the raw English "Review" / "Enhance" / "Generate" on a UI that
    // ships in six languages — invisible to the extractor because the literal is
    // returned from a function rather than written in JSX.
    const src = strip(read("app/routes/app.products.jsx"));
    const fn = src.match(/function rowActionLabel\([\s\S]*?\n {2}\}/)[0];
    expect(fn).toMatch(/return t\("Review"\)/);
    expect(fn).toMatch(/t\("Enhance"\)/);
    expect(fn).toMatch(/t\("Generate"\)/);
    expect(fn).not.toMatch(/return "Review"/);
  });

  it("the click still stops bubbling into the ResourceItem, which navigated last", () => {
    // False green #16: the handler always ran and the row's own onClick then
    // navigated over the top of it. Proving this needs a click; the click lives
    // in tools/proof/fr13-click.mjs, which CW runs on Windows. This asserts the
    // two lines that make the click land where the pure function says.
    const src = strip(read("app/routes/app.products.jsx"));
    expect(src).toMatch(/e\?\.stopPropagation\?\.\(\);\s*\n\s*e\?\.preventDefault\?\.\(\);\s*\n\s*navigate\(rowActionHref/);
  });
});

describe("FR8 — a row must not assert a live per-product number that is the store's", () => {
  it('no screen says "This product: N/100" any more', () => {
    for (const f of ["app/components/FirstRunFindingsCard.jsx", "app/components/StartState.jsx"]) {
      expect(read(f), f).not.toMatch(/This product: \{scoreBefore\}/);
    }
  });

  it("the badge names the moment the number belongs to", () => {
    for (const f of ["app/components/FirstRunFindingsCard.jsx", "app/components/StartState.jsx"]) {
      expect(read(f), f).toMatch(/At first run: \{scoreBefore\}\/100/);
    }
  });

  it("…and that is the truth about the number: scoreBefore is frozen at row creation", () => {
    // storeScore.server.js keeps the before-fields OUT of the upsert's `update`,
    // so a product scored a hundred times keeps its first score. That is why
    // navaal-shape-fr showed three rows at 35 beside a store score of 39.
    const src = read("app/utils/storeScore.server.js");
    const upsert = src.match(/update: \{[\s\S]*?\},/)[0];
    expect(upsert).not.toMatch(/scoreBefore/);
    expect(upsert).toMatch(/scoreAfter/);
  });

  it("when every row scores the same, the card that shows them says why", () => {
    // The explanation existed since Phase 10 — on the write-time splash, which
    // has no route back. The owner met the three identical badges on Home.
    const card = read("app/components/FirstRunFindingsCard.jsx");
    expect(card).toMatch(/uniformScoreNote/);
    const note = uniformScoreNote([{ scoreBefore: 21 }, { scoreBefore: 21 }, { scoreBefore: 21 }], 12);
    expect(note).toMatch(/all score 21/);
    expect(note).toMatch(/the same as the store's/);
    // and it stays silent when the scores genuinely differ
    expect(uniformScoreNote([{ scoreBefore: 21 }, { scoreBefore: 34 }], 12)).toBeNull();
  });

  it("Home hands the card the sampled count the note needs", () => {
    expect(strip(read("app/routes/app._index.jsx"))).toMatch(/<FirstRunFindingsCard[^>]*scanned=\{storeScore\?\.scanned/);
  });
});

describe("FR14 — a rounded percent is never the only number", () => {
  const surfaces = [
    ["Home", "app/routes/app._index.jsx", "home-credit-usage"],
    ["Plans", "app/routes/app.plans.jsx", "plans-credit-usage"],
    ["Products", "app/routes/app.products.jsx", "products-credit-usage"],
    ["Blog", "app/routes/app.blog.jsx", "blog-credit-usage"],
  ];

  it.each(surfaces)("%s prints the fraction as its primary number", (_name, file) => {
    const src = unwrapT(read(file));
    expect(src).toMatch(/\{usageCount\} \/ \{monthlyCredits\} used|\{usageRemaining\} remaining of \{monthlyCredits\}|\{usageCount\}\/\{monthlyCredits\}/);
  });

  it.each(surfaces)("%s labels its quota bar with that fraction, so the percent never stands alone", (_name, file, id) => {
    const src = strip(read(file));
    expect(src, `${file} must give the readout an id`).toMatch(new RegExp(`id="${id}"`));
    expect(src, `${file} must point the bar at it`).toMatch(new RegExp(`ariaLabelledBy="${id}"`));
  });

  it.each(surfaces)("%s prints no bare usage percent anywhere", (_name, file) => {
    const src = strip(read(file));
    expect(src).not.toMatch(/\{usagePct\}%/);
    expect(src).not.toMatch(/usagePct\s*\+\s*["'`]%/);
  });

  it("quotaPct is documented as bar geometry, because its floor overstates at the bottom", async () => {
    const { quotaPct, QUOTA_PCT_IS_BAR_GEOMETRY_ONLY } = await import("../../app/utils/quota.js");
    expect(QUOTA_PCT_IS_BAR_GEOMETRY_ONLY).toBe(true);
    // 19 of 4,000 is 0.475%. The bar shows a sliver; the readout shows 19/4000.
    expect(quotaPct(19, 4000)).toBe(1);
    expect(quotaPct(0, 4000)).toBe(0);
    expect(quotaPct(3, 100)).toBe(3);
    expect(read("app/utils/quota.js")).toMatch(/never be the number a merchant reads/);
  });
});
