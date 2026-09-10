/**
 * A1.2 — the drafts opt-in, and the half that was missing.
 *
 * `BrandVoice.includeDraftProducts` and `scopeForShop` shipped in 2d9c37d. The
 * SETTINGS CONTROL did not. So the column existed, the read path worked, every
 * test passed — and no merchant on earth could turn it on. The default was not
 * a default, it was a law.
 *
 * That is the defect this file exists to stop coming back, and it is why the
 * first block asserts REACHABILITY rather than persistence. A test that only
 * checked the action would have passed for the entire time the setting was
 * unreachable.
 *
 * ── What these print if the thing they watch is broken ────────────────────
 *
 * Delete the checkbox from Settings and "a merchant can actually reach it"
 * fails naming the control. Delete the hidden input and "it is submitted with
 * the form" fails — that one matters because a Polaris Checkbox is not a form
 * field: without the hidden input the control renders, toggles, looks saved,
 * and posts nothing. Verified by removing each.
 *
 * ── What this CANNOT prove ────────────────────────────────────────────────
 *
 * That the control is visible on a rendered page. These are source assertions,
 * not a browser. A control inside a collapsed section or behind a plan gate
 * would still pass. Only a screenshot proves the merchant can see it, and that
 * is recorded as not proved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const settings = strip(readFileSync("app/routes/app.settings.jsx", "utf8"));
const optimize = strip(readFileSync("app/routes/app.optimize.jsx", "utf8"));
const products = strip(readFileSync("app/routes/app.products.jsx", "utf8"));
const home = strip(readFileSync("app/routes/app._index.jsx", "utf8"));

describe("a merchant can actually reach the drafts opt-in", () => {
  it("the source really is the Settings route — a guard over nothing passes", () => {
    expect(settings.length).toBeGreaterThan(2000);
    expect(settings).toMatch(/actionType" value="saveBrandVoice"/);
  });

  it("renders a control for it", () => {
    // The whole defect: the column shipped without this.
    expect(settings).toMatch(/label="Include draft products"/);
    expect(settings).toMatch(/checked=\{includeDraftProducts\}/);
  });

  it("is submitted with the form", () => {
    // A Polaris Checkbox is NOT a form field. Without the hidden input the
    // control renders, toggles, looks saved and posts nothing — which is the
    // same end state as having no control at all, and much harder to notice.
    expect(settings).toMatch(/name="includeDraftProducts" value=\{includeDraftProducts\.toString\(\)\}/);
  });

  it("the action persists it as a real boolean", () => {
    expect(settings).toMatch(/includeDraftProducts: formData\.get\("includeDraftProducts"\) === "true"/);
  });

  it("defaults to OFF for a shop with no BrandVoice row", () => {
    // A draft has no public page, so including one by default would spend a
    // merchant's generation on a page nobody can reach.
    expect(settings).toMatch(/includeDraftProducts: false/);
    expect(settings).toMatch(/useState\(brandVoice\.includeDraftProducts \|\| false\)/);
  });

  it("does NOT offer to include archived products", () => {
    // Deliberate. An archived product is not for sale and has no storefront
    // page at any setting, so there is no honest reason to offer it.
    expect(settings).not.toMatch(/includeArchived/);
    expect(settings.toLowerCase()).not.toMatch(/include archived/);
  });

  it("turning it on is not treated as dangerous", () => {
    // `publishWithoutReview` asks for confirmation because it writes to a live
    // storefront. This one only widens a COUNT, so a confirm would be ceremony
    // that teaches merchants to click through dialogs.
    expect(settings).toMatch(/onChange=\{setIncludeDraftProducts\}/);
  });
});

describe("every surface states which set its numbers mean", () => {
  // A1.2's second half. A number whose population is unstated cannot be checked
  // by the merchant, which is the whole reason the original defect survived.
  it.each([
    ["Products", products],
    ["Home", home],
    ["Optimize", optimize],
  ])("%s renders the scope label rather than only receiving it", (_name, src) => {
    // Receiving `candidateLabel` in the loader payload is not the same as
    // showing it. Optimize sent it and never rendered it for one commit.
    const usesIt = /\{candidateLabel/.test(src) || /\$\{candidateLabel\}/.test(src);
    expect(usesIt).toBe(true);
  });

  it("Optimize no longer calls its number 'Needs Content'", () => {
    // Same false label as the Products card: it counts what WE have not written
    // for, not products with no content.
    expect(optimize).not.toMatch(/Needs Content/);
    expect(optimize).toMatch(/Not yet optimized/);
  });
});
