/**
 * Phase 2 item 2.10 — what a store with nothing in it is told.
 *
 * This was the worst thing the self-audit found, and it was not on the brief's
 * list. A merchant who had just installed, with zero products, was told on
 * THREE screens that they were finished:
 *
 *   Home      "All caught up!"
 *   Products  "Your store is all set!"
 *   Optimize  a GREEN SUCCESS BANNER: "Your store is fully optimized!"
 *             above the literal sentence "All 0 products have AI-generated
 *             content."
 *
 * and on the fourth, SEO Audit, that they were failing: a large red 0, four
 * red zeros under "Issues Found", and a primary button pointing back at
 * Optimize — the screen that had just congratulated them.
 *
 * One root cause. `needsContent` was `total - published - draft` with a
 * `Math.max(0, …)` floor, so an empty store computed 0 and was arithmetically
 * indistinguishable from a finished one. No route had a `totalProducts === 0`
 * branch.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const SCREENS = {
  home: "app/routes/app._index.jsx",
  products: "app/routes/app.products.jsx",
  optimize: "app/routes/app.optimize.jsx",
  audit: "app/routes/app.seo-audit.jsx",
};

describe("no screen congratulates a merchant who has done nothing", () => {
  const CONGRATULATIONS = [
    "Your store is fully optimized!",
    "Your store is fully optimised!",
    "Your store is all set!",
    "All caught up!",
    "All {totalProducts} products have AI-generated content.",
  ];

  for (const phrase of CONGRATULATIONS) {
    it(`nothing says "${phrase}"`, () => {
      for (const f of Object.values(SCREENS)) {
        expect(code(f), `${f} still says it`).not.toContain(phrase);
      }
    });
  }
});

describe("each screen has a branch for a store with no products", () => {
  it("Optimize shows an empty state, not a success banner", () => {
    const src = code(SCREENS.optimize);
    expect(src).toMatch(/totalProducts === 0 \?/);
    expect(src).toMatch(/heading="No products yet"/);
    // And the success branch is now second, so it can only be reached by a
    // store that actually has products.
    expect(src.indexOf("totalProducts === 0")).toBeLessThan(src.indexOf("needsContent === 0"));
  });

  it("Products distinguishes an empty catalogue from an empty filter", () => {
    const src = code(SCREENS.products);
    expect(src).toMatch(/totalStoreProducts === 0/);
    expect(src).toMatch(/"No products yet"/);
    expect(src).toMatch(/"No products match this filter"/);
  });

  it("SEO Audit does not score an empty catalogue at zero out of a hundred", () => {
    const src = code(SCREENS.audit);
    expect(src).toMatch(/products\.length === 0 \?/);
    expect(src).toMatch(/heading="Nothing to audit yet"/);
  });

  it("Home does not report an empty store as caught up", () => {
    const src = code(SCREENS.home);
    expect(src).toMatch(/totalProducts === 0/);
    expect(src).toMatch(/"No products yet"/);
  });
});

describe("the empty states point somewhere", () => {
  it("they tell the merchant what to do, in the same words", () => {
    // The one action available to a store with no products is to add some, and
    // that happens in Shopify, not here. Saying it identically on every screen
    // means a merchant who reads it twice is not learning two different things.
    const sentence = "Add products to your store, and this is where you generate content for them.";
    const saying = Object.values(SCREENS).filter((f) => code(f).includes(sentence));
    expect(saying.length).toBeGreaterThanOrEqual(2);
  });

  it("Optimize is no longer a dead end for an empty store", () => {
    // It previously rendered a success banner and nothing else: no primary, no
    // link, nothing but the back arrow.
    const src = code(SCREENS.optimize);
    expect(src).toMatch(/EmptyState/);
  });
});

describe("status is never carried by colour or a glyph alone", () => {
  it("the audit table's pass and fail badges carry words", () => {
    const src = code(SCREENS.audit);
    expect(src).toMatch(/label\}: yes/);
    expect(src).toMatch(/label\}: no/);
    // The bare glyphs are gone. Roughly 400 of them rendered on a 100-product
    // store, with nothing for a screen reader to announce.
    expect(src).not.toMatch(/<Badge tone="success">✓<\/Badge>/);
    expect(src).not.toMatch(/<Badge tone="critical">✗<\/Badge>/);
  });

  it("every badge is given a label by its caller", () => {
    const src = code(SCREENS.audit);
    const uses = src.match(/<CheckIcon[^/]*\/>/g) || [];
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      expect(u, `a CheckIcon has no label: ${u}`).toMatch(/label="/);
    }
  });
});
