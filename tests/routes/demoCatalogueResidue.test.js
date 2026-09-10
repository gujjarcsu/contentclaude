/**
 * Group 7.6 — no example in the UI may come from a store we do not serve.
 *
 * The Blog page told a plumbing merchant that "How to wax a snowboard for
 * beginners" beats "snowboards". That example came from Shopify's demo
 * catalogue, and to every real merchant it reads as advice written for somebody
 * else's shop — on the screen where we are asking them to trust our judgement
 * about their words.
 *
 * ── What this prints if the thing it watches is broken ────────────────────
 *
 * Put "snowboard" back into any user-facing string and the matching case fails
 * naming the file, the line and the term. Verified by doing it.
 *
 * ── Why it checks JSX text and not the whole file ─────────────────────────
 *
 * Prompt engineering legitimately names product categories — `seo.server.js`
 * tells the model how to write for an actual GIFT CARD product, which is a real
 * Shopify product type and not demo residue. So this scans what a merchant can
 * READ: route files, with comments stripped.
 *
 * The sweep asserts it inspected a real corpus, because a residue check that
 * scans nothing passes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const ROUTES = readdirSync("app/routes")
  .filter((f) => /\.(jsx|js)$/.test(f))
  .map((f) => `app/routes/${f}`);

const COMPONENTS = readdirSync("app/components")
  .filter((f) => /\.(jsx|js)$/.test(f))
  .map((f) => `app/components/${f}`);

const FILES = [...ROUTES, ...COMPONENTS];

/** Comments stripped: an explanatory note ABOUT the residue is not residue. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const source = new Map(FILES.map((f) => [f, strip(readFileSync(f, "utf8"))]));

/**
 * Terms drawn from Shopify's demo catalogue. Every one of these appeared in a
 * dev store's fixtures, and none of them belongs in copy shipped to a merchant
 * who sells something else.
 */
const DEMO_TERMS = ["snowboard", "ski wax", "snowboards", "the 3p fulfilled", "the archived", "selling plans"];

describe("the residue sweep can fail", () => {
  it("inspected a real corpus", () => {
    expect(FILES.length).toBeGreaterThan(15);
    expect(FILES).toContain("app/routes/app.blog.jsx");
    expect(FILES).toContain("app/routes/app.products.jsx");
  });

  it("the term list actually matches the string that was there", () => {
    // Without this the list could be quietly emptied and every case below would
    // still pass — the false-green shape this project has hit five times.
    const theResidue = '"How to wax a snowboard for beginners" beats "snowboards".';
    expect(DEMO_TERMS.some((t) => theResidue.toLowerCase().includes(t))).toBe(true);
  });
});

describe("no demo-catalogue example reaches a merchant", () => {
  it.each(DEMO_TERMS)("no route or component says %s", (term) => {
    const offenders = [];
    for (const [file, src] of source) {
      const lower = src.toLowerCase();
      if (lower.includes(term)) {
        const line = src.split("\n").findIndex((l) => l.toLowerCase().includes(term)) + 1;
        offenders.push(`${file}:${line}`);
      }
    }
    expect(offenders, `"${term}" appears in shipped copy at ${offenders.join(", ")}`).toEqual([]);
  });
});
