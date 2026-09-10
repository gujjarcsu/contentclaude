/**
 * Phase 2 item 2.9 — copy.
 *
 * Three separate problems, and only one of them is cosmetic.
 *
 * Spelling was genuinely split: 20 user-visible "Optimis-" against 9
 * "Optimiz-", with the SAME metric spelled both ways on adjacent screens —
 * Results said "Products optimized" while Analytics said "products optimised".
 * The route has always been `/app/optimize` while every label said "Optimise".
 *
 * Jargon was worse, because it is not a matter of taste. A merchant was shown
 * `(distinct products)` — database vocabulary, verbatim — and
 * `Requires the products/create webhook to be registered in your Shopify app`,
 * a raw Shopify topic string, as help text on a checkbox they were asked to
 * tick.
 *
 * And the quota copy applied pressure rather than stating a fact. The Home hero
 * turned into an upsell whenever quota ran low, and a red "Only 2 generations
 * left!" sat inside the generate panel, next to the button. Quota is a number.
 * It is stated once, in the usage card, in the same tone as any other number.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

const read = (f) => readFileSync(f, "utf8");
const code = (f) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

/** Phase 3 owns welcome and setup; the brief says leave them until then. */
const PHASE_3 = ["app.welcome.jsx", "app.setup.jsx"];

function uiFiles() {
  const out = [];
  for (const dir of ["app/routes", "app/components"]) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".jsx")) out.push(join(dir, f).split(sep).join("/"));
    }
  }
  return out.filter((f) => !PHASE_3.some((p) => f.endsWith(p)));
}

describe("one spelling, and it is US", () => {
  const BRITISH = [
    [/\boptimis[ae]/i, "optimise/optimisation"],
    [/\banalys[ae]d?\b/i, "analyse/analysed"],
    [/\bfavourite/i, "favourite"],
    [/\bcolour/i, "colour"],
    [/\bbehaviour/i, "behaviour"],
  ];

  for (const [pattern, name] of BRITISH) {
    it(`no screen uses "${name}"`, () => {
      const offenders = uiFiles().filter((f) => pattern.test(code(f)));
      expect(offenders).toEqual([]);
    });
  }

  it("the label and its own route agree", () => {
    // The route has always been /app/optimize while every label said
    // "Optimise". A merchant reading the URL bar was being told the app has two
    // names for one page.
    const optimize = code("app/routes/app.optimize.jsx");
    expect(optimize).toMatch(/Optimize store/);
    expect(code("app/routes/app.products.jsx")).toMatch(/Optimize store/);
  });
});

describe("no database or platform vocabulary reaches a merchant", () => {
  const JARGON = [
    ["(distinct products)", "a database term, rendered verbatim in a dashboard"],
    ["products/create webhook", "a raw Shopify topic string, as help text on a checkbox"],
    ["Product #", "a numeric id where a product name belongs"],
    ["JSON-LD", "a serialisation format"],
    ["FAQPage", "a schema.org type name"],
    ["A/B Variants", "an experiment term for a feature that shows two options"],
    ["Bulk Jobs", "internal vocabulary for a background run"],
  ];

  for (const [phrase, why] of JARGON) {
    it(`no screen says "${phrase}" — ${why}`, () => {
      const offenders = uiFiles().filter((f) => code(f).includes(phrase));
      expect(offenders).toEqual([]);
    });
  }

  it("llms.txt is never shown to a merchant, though the route may serve it", () => {
    // The proxy route implements it and logs about it; that is not merchant-
    // facing copy. What went is the marketing that named it at them.
    const facing = uiFiles().filter((f) => !f.includes("proxy."));
    const offenders = facing.filter((f) => code(f).includes("llms.txt"));
    expect(offenders).toEqual([]);
  });
});

describe("quota is stated once, as a fact", () => {
  it("the Home hero does not become an upsell when quota runs low", () => {
    const src = code("app/routes/app._index.jsx");
    expect(src).not.toMatch(/upgrade to keep momentum/i);
    expect(src).not.toMatch(/heroSubtitle = `Only \$\{remaining\}/);
  });

  it("there is no red countdown beside the generate button", () => {
    // "Only 2 generations left!" in critical tone, inches from the action, is
    // pressure. The usage card above already says the number.
    const src = code("app/routes/app.products.jsx");
    expect(src).not.toMatch(/Only \{usageRemaining\} generation/);
  });

  it("the usage card still states it plainly", () => {
    // Removing the pressure must not remove the information.
    const src = code("app/routes/app.products.jsx");
    expect(src).toMatch(/usageRemaining/);
    expect(src).toMatch(/usageCount/);
  });
});

describe("claims are gone but the facts remain", () => {
  it("the retired results page has no copy left to be wrong", () => {
    // /app/results is gone (the owner's five-item nav: Home, Products, Review,
    // Blog, Settings). It answers a same-origin 302 to /app rather than a 404,
    // because merchants and App Store reviewers follow old links — so the file
    // still exists and must contain nothing but the redirect.
    const src = code("app/routes/app.results.jsx");
    expect(src).toMatch(/retiredRouteLoader\("\/app"\)/);
    expect(src).not.toMatch(/difference between being/);
    expect(src).not.toMatch(/answer-first/);
    expect(src).not.toMatch(/faqSchemaProducts/);
  });
});
