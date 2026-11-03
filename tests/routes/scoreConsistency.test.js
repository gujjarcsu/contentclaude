/**
 * A2 — Home said 48/100 and the SEO Audit said 90/100. Same store, same minute.
 *
 * 42 points apart, on the first screen a merchant sees and the first frame of
 * the listing. Two numbers that far apart, both labelled as the store's score,
 * tell a merchant the app cannot count.
 *
 * IT WAS NEVER SAMPLING. The gap was arithmetic, and there were THREE separate
 * divergences stacked on top of each other:
 *
 *   1. RUBRIC.     Home averaged two rubrics — (seo + geo) / 2 — while the audit
 *                  reported calculateSeoScore alone. The gap is exactly
 *                  (seo - geo) / 2.
 *   2. FIELDS.     The audit fetched description, seo and images only. The
 *                  graded-attributes dimension is 20 of 100 and reads
 *                  productType, vendor, tags and variants.price. Fixing the
 *                  rubric alone would have left them ~20 points apart.
 *   3. POPULATION. The scan queried "status:active"; the audit used
 *                  scopeQueryFor(), which also requires published_status:
 *                  published. A POS-only product counted on one screen only.
 *
 * A FALSE GREEN THIS FILE HAS TO AVOID. 07-VERIFICATION.md lists, among the
 * seven, "a consistency guard that compared the same RULE on two different
 * populations and so could never fail". Asserting
 * `calculateGeoScore(x) === calculateGeoScore(x)` would pass for ever and prove
 * nothing. So this asserts the thing that actually changed — that Home's
 * headline IS the reviewed rubric and not an average — and pins both code paths
 * to the shared field selection and the shared mapper by reading them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { calculateGeoScore } from "../../app/utils/geo.server.js";
import { calculateSeoScore } from "../../app/utils/seo.server.js";
import {
  toScorable,
  scoreProduct,
  START_SCAN_QUERY,
  SCORED_PRODUCT_FIELDS,
} from "../../app/utils/startState.server.js";

/** A GraphQL node in the shape both queries now select. */
const NODE = {
  id: "gid://shopify/Product/1",
  title: "The Minimal Snowboard",
  description: "A snowboard for all-mountain riding.",
  productType: "Snowboards",
  vendor: "Snowdevil",
  tags: ["winter"],
  seo: { title: "The Minimal Snowboard", description: "A snowboard for all-mountain riding." },
  featuredMedia: { preview: { image: { url: "https://x/i.png" } } },
  media: { edges: [{ node: { mediaContentType: "IMAGE", image: { altText: "a snowboard" } } }] },
  variants: { edges: [{ node: { price: "699.95" } }] },
};

const AUDIT_SRC = readFileSync("app/routes/app.seo-audit.jsx", "utf8");

describe("A2 — one rubric behind the store score", () => {
  it("Home's headline IS the reviewed rubric, not an average of two", () => {
    // This is the assertion that would have caught the bug. Before A2,
    // `combined` was Math.round((seo + geo) / 2).
    const scorable = toScorable(NODE);
    const { combined, geo, seo } = scoreProduct(scorable);

    expect(combined).toBe(calculateGeoScore(scorable).score);
    expect(combined).toBe(geo);

    // And it must NOT be the old average. Guard against a silent revert.
    const oldAverage = Math.round((seo + geo) / 2);
    // The fixture is chosen so the two rubrics genuinely disagree — otherwise
    // this assertion could never fail and would be false green #3.
    expect(seo).not.toBe(geo);
    expect(combined).not.toBe(oldAverage);
  });

  it("the two rubrics really do disagree on this fixture, so the test can fail", () => {
    const scorable = toScorable(NODE);
    const seo = calculateSeoScore(scorable).score;
    const geo = calculateGeoScore(scorable).score;
    // If these were ever equal, every assertion above would pass vacuously.
    expect(Math.abs(seo - geo)).toBeGreaterThan(10);
  });
});

describe("A2 — the audit reads the same rubric, fields and mapper as Home", () => {
  it("the audit scores with calculateGeoScore, not calculateSeoScore", () => {
    expect(AUDIT_SRC).toMatch(/const score = calculateGeoScore\(scorable\)\.score/);
    // calculateSeoScore may still be called, but only for its CHECKS.
    expect(AUDIT_SRC).not.toMatch(/const \{ score, checks \} = calculateSeoScore/);
  });

  it("the audit maps nodes with the shared toScorable, not a hand-built object", () => {
    expect(AUDIT_SRC).toMatch(/toScorable\(node\)/);
  });

  it("both queries select the SHARED field list", () => {
    expect(START_SCAN_QUERY).toContain(SCORED_PRODUCT_FIELDS);
    expect(AUDIT_SRC).toContain("${SCORED_PRODUCT_FIELDS}");
  });

  it("the shared field list carries every input the graded-attributes dimension needs", () => {
    // 20 of 100 points. Losing any one of these silently drops the audit's
    // score below Home's and re-opens the gap.
    for (const field of ["productType", "vendor", "tags", "variants", "seo", "media"]) {
      expect(SCORED_PRODUCT_FIELDS, `missing ${field}`).toContain(field);
    }
  });

  it("both read the same POPULATION scope", () => {
    // The scan hardcoded "status:active" while the audit used scopeQueryFor().
    expect(START_SCAN_QUERY).toContain("$scoped");
    expect(START_SCAN_QUERY).not.toContain('query: "status:active"');
    expect(AUDIT_SRC).toMatch(/scopeQueryFor\(/);
  });
});
