/**
 * Phase 9 Part B — the grading debt. A wrong BLOCKING is worse than no grade.
 *
 *   F3  GTIN was read on the first variant only; barcodes on variant 2+ were
 *       graded "no barcode". The walk now reads every variant it can for a
 *       multi-variant product whose first is blank, and the grader takes what
 *       was actually looked at.
 *   F5  featuredImage → featuredMedia in the watch query; readers take both.
 *   F6  the nightly indexability sample is the plan's, attention first, and
 *       the screen says what coverage actually is.
 *   F4  the cross-shop script honours each shop's first-walk grace.
 *   +   the content badge carries the product's own status on every screen
 *       that shows it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { gradeProduct, VARIANT_BARCODE_SAMPLE, snapshotFromNode } from "../../app/utils/catalogueWatch.js";
import { needsBarcodeLook } from "../../app/utils/catalogueWatch.server.js";
import { pageSampleFor, PAGE_SAMPLE_BY_PLAN, PAGE_SAMPLE } from "../../app/utils/indexability.js";

const complete = (over = {}) => ({
  id: "gid://shopify/Product/1",
  title: "Enamel Camp Mug",
  description: "A 350 ml enamel mug with a rolled steel rim, kiln-fired in two coats so it takes knocks without chipping. Dishwasher safe. Made in Portugal.",
  vendor: "Fernwick",
  status: "ACTIVE",
  onlineStoreUrl: "https://fernwick.example/products/enamel-camp-mug",
  productType: "Mugs",
  hasOnlyDefaultVariant: false,
  featuredMedia: { preview: { image: { url: "https://cdn.example/mug.jpg", altText: "White enamel mug" } } },
  options: [{ name: "Size" }],
  variants: { nodes: [{ barcode: "" }] },
  ...over,
});
const gtin = (g) => g.findings.filter((f) => f.field === "gtin");

describe("F3 — barcodes on variant 2+ are not 'no barcode'", () => {
  it("THE FIXTURE: first variant blank, second variant has a GTIN → no finding (this failed before the second look)", () => {
    const g = gradeProduct(complete(), { variantBarcodes: ["", "5012345678900"] });
    expect(gtin(g)).toEqual([]);
    expect(g.degrading).toBe(0);
  });

  it("all read variants blank → one finding that says how many were read", () => {
    const g = gradeProduct(complete(), { variantBarcodes: ["", "", ""] });
    expect(gtin(g)).toHaveLength(1);
    expect(gtin(g)[0].note).toMatch(/^No barcode on any of the 3 variants we read/);
  });

  it("no second look (null) → graded on the first variant, as before, and the note says so", () => {
    const g = gradeProduct(complete(), { variantBarcodes: null });
    expect(gtin(g)[0].note).toMatch(/^No barcode on the first variant/);
    expect(gtin(gradeProduct(complete({ variants: { nodes: [{ barcode: "5012345678900" }] } })))).toEqual([]);
  });

  it("the exemption still wins", () => {
    expect(gtin(gradeProduct(complete(), { variantBarcodes: ["", ""], gtinExempt: true }))).toEqual([]);
  });

  it("needsBarcodeLook: only multi-variant, first blank, not draft, not exempt", () => {
    const node = complete();
    expect(needsBarcodeLook(node, null)).toBe(true);
    expect(needsBarcodeLook(complete({ hasOnlyDefaultVariant: true }), null)).toBe(false);
    expect(needsBarcodeLook(complete({ variants: { nodes: [{ barcode: "5012345678900" }] } }), null)).toBe(false);
    expect(needsBarcodeLook(complete({ status: "DRAFT" }), null)).toBe(false);
    expect(needsBarcodeLook(node, { gtinExempt: true })).toBe(false);
  });

  it("the second query reads up to VARIANT_BARCODE_SAMPLE variants, ten products a call, under the 1,000-point cap", () => {
    const srv = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));
    expect(VARIANT_BARCODE_SAMPLE).toBe(50);
    expect(srv).toMatch(/nodes\(ids: \$ids\) \{ \.\.\. on Product \{ id variants\(first: \$\{VARIANT_BARCODE_SAMPLE\}\)/);
    expect(srv).toMatch(/const VARIANTS_CHUNK = 10;/);
    expect(10 * (1 + 2 + VARIANT_BARCODE_SAMPLE)).toBeLessThan(1000);
    expect(srv).toMatch(/variantBarcodes: variantBarcodes\.get\(node\.id\) \?\? null/);
    expect(srv).toMatch(/needsBarcodeLook\(n, prevById\.get\(n\.id\) \?\? null\)/);
  });
});

describe("F5 — featuredMedia, not the deprecated featuredImage", () => {
  it("the watch query asks for featuredMedia and never featuredImage", () => {
    const srv = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));
    expect(srv).toMatch(/featuredMedia \{ preview \{ image \{ url altText \} \} \}/);
    expect(srv).not.toMatch(/featuredImage/);
  });

  it("the readers take both shapes, so an old node still grades and snapshots", () => {
    const viaMedia = gradeProduct(complete({ featuredMedia: { preview: { image: { url: "https://cdn.example/a.jpg", altText: "" } } } }), { variantBarcodes: ["x"] });
    const viaImage = gradeProduct(complete({ featuredMedia: null, featuredImage: { url: "https://cdn.example/a.jpg", altText: "" } }), { variantBarcodes: ["x"] });
    expect(viaMedia.findings.map((f) => f.field)).toEqual(["image alt"]);
    expect(viaImage.findings.map((f) => f.field)).toEqual(["image alt"]);
    expect(snapshotFromNode({ featuredMedia: { preview: { image: { altText: "a" } } } }).hasAlt).toBe(true);
    expect(snapshotFromNode({ featuredImage: { altText: "a" } }).hasAlt).toBe(true);
    expect(snapshotFromNode({}).hasAlt).toBe(false);
  });
});

describe("F6 — the nightly sample is the plan's, attention first, said on the screen", () => {
  it("per plan", () => {
    expect(PAGE_SAMPLE_BY_PLAN).toEqual({ free: 20, starter: 50, growth: 100, pro: 200 });
    expect(pageSampleFor("pro")).toBe(200);
    expect(pageSampleFor("PRO")).toBe(200);
    expect(pageSampleFor(undefined)).toBe(PAGE_SAMPLE);
  });

  it("the walk passes the plan's sample and the page check takes attention first", () => {
    const watch = code(readFileSync("app/utils/catalogueWatch.server.js", "utf8"));
    expect(watch).toMatch(/sample: pageSampleFor\(plan\?\.planName\)/);
    expect(watch).toMatch(/nightly: pageSampleFor\(planRow\?\.planName\)/);
    const idx = code(readFileSync("app/utils/indexability.server.js", "utf8"));
    expect(idx).toMatch(/NOT: \[\{ statusShop: "DRAFT" \}, \{ attention: "\{\}" \}\]/);
    expect(idx).toMatch(/take: sample - first\.length/);
  });

  it("the attention page says the nightly number and the order", () => {
    const page = code(readFileSync("app/routes/app.attention.jsx", "utf8"));
    // D1: one key, the number a placeholder — code() unwraps the key, so the vars are read from the raw source
    expect(page).toMatch(/\(\{nightly\} more each night on your plan, products needing attention first\)/);
    expect(readFileSync("app/routes/app.attention.jsx", "utf8")).toMatch(/nightly: idx\.nightly \?\? PAGE_SAMPLE/);
  });
});

describe("F4 — the cross-shop number honours each shop's first walk", () => {
  it("the script summarises per shop with firstWalkAt and sums", () => {
    const s = code(readFileSync("scripts/catalogue-watch--writes-snapshots.mjs", "utf8"));
    expect(s).toMatch(/groupBy\(\{ by: \["shop"\], _min: \{ firstSeenAt: true \} \}\)/);
    expect(s).toMatch(/summarise\(shopRows, new Date\(\), \{ firstWalkAt: firstWalkAt\.get\(shopKey\) \?\? null \}\)/);
    expect(s).not.toMatch(/out\.acrossShops = summarise\(rows\)/);
  });
});

describe("the content badge carries the product's own status on every screen that shows it", () => {
  it("Products and the product page both say when a published product is a Shopify draft", () => {
    const products = code(readFileSync("app/routes/app.products.jsx", "utf8"));
    const page = code(readFileSync("app/routes/app.products_.$id.jsx", "utf8"));
    expect(products).toMatch(/not on your storefront/);
    expect(page).toMatch(/not on your storefront/);
    expect(page).toMatch(/String\(product\.status \?\? "ACTIVE"\)\.toUpperCase\(\) === "ACTIVE" \? "Published"/);
  });
});
