/**
 * Group 1.6 — the sweep.
 *
 * One line produced five wrong numbers, and it took a real 3,148-product
 * catalogue to find it. The fix is only worth having if the sixth copy cannot
 * be added quietly, so this walks the source and fails when a screen counts
 * products or collections without going through the primitive.
 *
 * ── What it prints if the thing it watches is broken ──────────────────────
 *
 * Add `productsCount { count }` back to any route and "no screen counts
 * products without the candidate scope" fails naming the file and the line.
 *
 * ── The failure mode this guard is itself designed against ────────────────
 *
 * A sweep that finds no files passes. That is the shape that has already cost
 * this project four false greens, so the first test here asserts the sweep
 * actually inspected a plausible number of files and that its corpus contains
 * files it MUST contain. If the glob broke, the guard goes red rather than
 * green-because-empty.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every .js/.jsx under app/, which is all the code that could count. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

const FILES = walk("app");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const source = new Map(FILES.map((f) => [f, strip(readFileSync(f, "utf8"))]));

/** The primitive's own files are allowed to contain the raw query. */
const PRIMITIVE = new Set(["app/utils/candidates.js", "app/utils/candidates.server.js"]);

describe("the sweep can actually fail", () => {
  it("inspected a real corpus, not an empty one", () => {
    // A guard that passes by finding nothing is not a guard.
    expect(FILES.length).toBeGreaterThan(40);
    for (const must of [
      "app/routes/app.products.jsx",
      "app/routes/app._index.jsx",
      "app/routes/app.optimize.jsx",
      "app/utils/candidates.server.js",
    ]) {
      expect(FILES, `${must} missing from the sweep corpus`).toContain(must);
    }
  });

  it("the corpus is the stripped source, so a commented example cannot trip it", () => {
    expect(source.get("app/utils/candidates.server.js")).toContain("productsCount");
    expect(source.get("app/utils/candidates.server.js")).not.toContain("Group 1 — the candidate primitive");
  });
});

describe("no screen counts products without the candidate scope", () => {
  /**
   * The ROOT `productsCount` query — the one that counts the whole catalogue.
   *
   * Deliberately NOT a bare `\bproductsCount\b`: `Collection.productsCount` is a
   * DIFFERENT field that counts the products inside one collection, and
   * app.collections.jsx uses it correctly. The first version of this guard
   * flagged that line, which is how the distinction came to be written down.
   *
   * Limitation, stated rather than hidden: a root count reached some other way
   * — through a fragment, or a query assembled from string parts — would not
   * match. This catches the shape that actually caused the defect in three
   * routes, plus the filtered variant the primitive itself uses.
   */
  const ROOT_COUNT = [/query[^{]*\{\s*(?:\w+\s*:\s*)?productsCount\b/, /\bproductsCount\s*\(\s*query\s*:/];

  it("the root productsCount query appears only inside the primitive", () => {
    const offenders = [];
    for (const [file, src] of source) {
      if (PRIMITIVE.has(file)) continue;
      if (ROOT_COUNT.some((re) => re.test(src))) {
        const line = src.split("\n").findIndex((l) => ROOT_COUNT.some((re) => re.test(l))) + 1;
        offenders.push(`${file}:${line || "?"}`);
      }
    }
    expect(offenders, `these count the catalogue outside the primitive: ${offenders.join(", ")}`).toEqual([]);
  });

  it("that pattern really does match the shape that caused the defect", () => {
    // Without this, the guard above could be quietly narrowed until it matched
    // nothing and would still pass — the exact false-green shape this project
    // has hit five times. These two strings pin both directions.
    const theDefect = "const r = await admin.graphql(`query { productsCount { count } }`);";
    expect(ROOT_COUNT.some((re) => re.test(theDefect))).toBe(true);

    const legitimate = "collections(first: 250) { edges { node { productsCount { count } } } }";
    expect(ROOT_COUNT.some((re) => re.test(legitimate))).toBe(false);
  });

  it("collectionsCount appears only inside the primitive", () => {
    const offenders = [];
    for (const [file, src] of source) {
      if (PRIMITIVE.has(file)) continue;
      if (/\bcollectionsCount\s*[({]/.test(src)) offenders.push(file);
    }
    expect(offenders, `these count collections outside the primitive: ${offenders.join(", ")}`).toEqual([]);
  });

  it("no screen re-derives the not-optimized figure by hand", () => {
    // The arithmetic lives in `notOptimizedFrom`. Two subtractions are banned:
    // the original `total - published - draft`, and the new-shaped
    // `candidates - withContent`.
    for (const [file, src] of source) {
      if (PRIMITIVE.has(file)) continue;
      expect(src, `${file} re-derives it as total - published - draft`).not.toMatch(
        /total\w*\s*-\s*\w*[Pp]ublished\w*\s*-\s*\w*[Dd]raft/,
      );
      expect(src, `${file} subtracts withContent from a candidate count inline`).not.toMatch(
        /candidate\w*\s*-\s*\(?\s*\w*\.?withContent/i,
      );
    }
  });
});

describe("the three screens that produced the five wrong numbers", () => {
  const SCREENS = ["app/routes/app.products.jsx", "app/routes/app._index.jsx", "app/routes/app.optimize.jsx"];

  it.each(SCREENS)("%s asks the primitive for its counts", (file) => {
    expect(source.get(file)).toMatch(/getCandidateCounts\(/);
  });

  it.each(SCREENS)("%s no longer calls anything 'need content'", (file) => {
    // Group 4.1 — the label was false on any store that had written anything.
    expect(source.get(file)).not.toMatch(/needsContentFrom/);
    expect(source.get(file)).not.toMatch(/Need Content/);
  });
});
