/**
 * A3.2 — one behaviour for every "Optimize" entry point.
 *
 * Home's primary said "Optimize 3146 products" and navigated to `/app/optimize`.
 * Products' primary said "Optimize store (3146)" and opened a modal. A third
 * button on Home's "Optimize your store" card went to `/app/optimize` again.
 * Same label, same intent, two different next steps — and a merchant who used
 * both would not know which one was "the" optimize.
 *
 * They now all land on the same confirmation: the one that states what will
 * actually run against the quota (A3.3) and names the plan before the click
 * (A3.1). The Optimize SCREEN keeps its own distinct job, enhance mode.
 *
 * ── What these print if the thing they watch is broken ────────────────────
 *
 * Point either Home entry point back at `/app/optimize` and "every Optimize
 * entry point goes to the same place" fails, printing both destinations.
 * Remove the `?optimize=1` handling and "the deep link actually opens it"
 * fails. Verified by doing both.
 *
 * ── What this CANNOT prove ────────────────────────────────────────────────
 *
 * That the modal opens on a rendered page. This reads source. A `useState`
 * initialiser that never runs, or a modal rendered behind a condition that is
 * false, would pass. L15 says that needs a browser; queued for a human.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const home = strip(readFileSync("app/routes/app._index.jsx", "utf8"));
const products = strip(readFileSync("app/routes/app.products.jsx", "utf8"));

describe("every Optimize entry point goes to the same place", () => {
  it("found the sources — a guard over nothing passes", () => {
    expect(home.length).toBeGreaterThan(2000);
    expect(products.length).toBeGreaterThan(2000);
  });

  it("Home has no Optimize control that still points at /app/optimize", () => {
    // The Optimize SCREEN is still reachable — it owns enhance mode — but not
    // from a control labelled the same as the one on Products.
    const optimizeNavs = [...home.matchAll(/navigate\("\/app\/optimize"\)/g)];
    expect(
      optimizeNavs.length,
      `Home still sends ${optimizeNavs.length} Optimize control(s) to /app/optimize`,
    ).toBe(0);
  });

  it("both Home entry points use the shared deep link", () => {
    const deepLinks = [...home.matchAll(/navigate\("\/app\/products\?optimize=1"\)/g)];
    expect(deepLinks.length).toBe(2);
  });

  it("the deep link actually opens the confirmation", () => {
    // Without this the link is a navigation to a screen where nothing happens,
    // which is worse than the two behaviours it replaced.
    expect(products).toMatch(/useState\(searchParams\.get\("optimize"\) === "1"\)/);
  });

  it("searchParams is actually read, not discarded", () => {
    // `const [, setSearchParams] = useSearchParams()` throws away the value the
    // line above depends on. It did, and typecheck did not catch it.
    expect(products).toMatch(/const \[searchParams, setSearchParams\] = useSearchParams\(\)/);
  });
});

describe("the label still tells the truth before the click", () => {
  it("Products names the plan when the shop cannot run it", () => {
    // A3.1 — the entitlement is visible BEFORE the click, wherever the click
    // came from. Unifying the destination must not lose that.
    expect(products).toMatch(/Optimize store \(\$\{notOptimized\}\) · Starter/);
  });
});

describe("A4.2 / A4.3 — the row offers what the badge says", () => {
  it("routes the row action by content state instead of always saying Generate", () => {
    // The badge was split in Group 1; the ACTION was not, so the screen told a
    // merchant two different things about the same product — a red-free
    // "Not yet optimized" badge beside a button offering to "Generate" over
    // the paragraph they wrote themselves.
    expect(products).toMatch(/function rowActionLabel\(/);
    expect(products).toMatch(/\{rowActionLabel\(id, description\)\}/);
  });

  it("uses the SHARED classifier, not a fourth hand-rolled one", () => {
    // Three independent classifiers on this screen was the Phase 2 defect.
    const fn = products.slice(products.indexOf("function rowActionLabel("));
    const body = fn.slice(0, fn.indexOf("\n  }") + 4);
    expect(body).toMatch(/actionFor\(/);
    expect(body).toMatch(/hasRealContent\(/);
    expect(body).toMatch(/stateOfContentMap\(/);
    // and does not invent its own vocabulary
    expect(body).not.toMatch(/Needs content|No AI Content/);
  });

  it("offers three verbs, one per state", () => {
    const fn = products.slice(products.indexOf("function rowActionLabel("));
    const body = fn.slice(0, fn.indexOf("\n  }") + 4);
    expect(body).toMatch(/"Review"/);
    expect(body).toMatch(/"Enhance"/);
    expect(body).toMatch(/"Generate"/);
  });
});
