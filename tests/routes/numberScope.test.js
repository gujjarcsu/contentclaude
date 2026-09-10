/**
 * Group 6.2 / 6.7 — if two screens can disagree about the same fact, they will.
 *
 * This is the THIRD occurrence of the same defect (after aae8786 and 0740f67).
 * The Products screen showed a header reading "2 ready to review", a stat card
 * reading "Drafts to Review 2", and directly beneath them a tab reading
 * "Draft (0)".
 *
 * Every one of those numbers was CORRECT. The header and the cards are
 * store-wide; the tabs count only the fifty products on the visible page. What
 * was missing was not a shared rule — that was fixed in Phase 2 and the rule is
 * genuinely shared now — it was the SCOPE. Nothing on the screen said which
 * population each number came from, so the merchant read a contradiction.
 *
 * The existing guard (tests/utils/productState.test.js) compares the RULE and
 * therefore could not catch this: both sides used the same rule over different
 * populations and it passed. This one checks the labels instead.
 *
 * ── What it prints if the thing it watches is broken ──────────────────────
 *
 * Drop "on this page" from any page-scoped tab and the first case fails naming
 * the label. Verified by doing it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const products = strip(readFileSync("app/routes/app.products.jsx", "utf8"));

describe("page-scoped numbers say they are page-scoped", () => {
  /** Every tab label on the Products screen, as written. */
  const tabLabels = [...products.matchAll(/\{\s*id:\s*"(\w+)",\s*content:\s*`([^`]+)`/g)].map((m) => ({
    id: m[1],
    label: m[2],
  }));

  it("found the tabs at all — a guard that scans nothing passes", () => {
    expect(tabLabels.length).toBeGreaterThanOrEqual(4);
    expect(tabLabels.map((t) => t.id)).toEqual(
      expect.arrayContaining(["all", "needsContent", "draft", "published"]),
    );
  });

  it.each(["all", "needsContent", "draft", "published"])(
    "the %s tab names its population",
    (id) => {
      const tab = tabLabels.find((t) => t.id === id);
      expect(tab, `no tab with id ${id}`).toBeTruthy();
      // "on page" or "on this page" — either phrasing, as long as it is there.
      expect(tab.label, `"${tab.label}" does not say which products it counts`).toMatch(/on (this )?page/i);
    },
  );

  it("the store-wide header does NOT claim to be page-scoped", () => {
    // The inverse mistake: labelling a store-wide number "on this page" would
    // be just as wrong and much harder to notice.
    expect(products).toMatch(/subtitle=\{subtitleText\}/);
    expect(products).not.toMatch(/subtitleText[\s\S]{0,400}on this page/);
  });

  it("the subtitle names the population its numbers come from", () => {
    // Group 2.1 — a number whose population is unstated cannot be checked.
    expect(products).toMatch(/products in your catalog/);
    expect(products).toMatch(/candidateLabel/);
  });
});

describe("the stat cards and the header agree by construction", () => {
  it("both read the same loader fields rather than recomputing", () => {
    // The mechanical cause of all three occurrences: a component that cannot
    // reach the shared rule writes its own. These names must come from the
    // loader payload, not from arithmetic in the component.
    expect(products).toMatch(/notOptimized,/);
    expect(products).toMatch(/publishedProducts,/);
    expect(products).toMatch(/draftProducts,/);

    // The LOADER computes it once, through the shared function; the COMPONENT
    // must only read it. Splitting on the component boundary matters: checking
    // the whole file would flag the loader's own legitimate call, which is the
    // first thing this test did.
    const componentOnly = products.slice(products.indexOf("export default function ProductsPage"));
    expect(componentOnly.length).toBeGreaterThan(500);
    expect(componentOnly, "the component recomputes notOptimized").not.toMatch(/const\s+notOptimized\s*=/);
    expect(componentOnly, "the component recomputes the published count").not.toMatch(
      /const\s+publishedProducts\s*=/,
    );
  });
});
