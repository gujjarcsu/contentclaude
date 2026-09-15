/**
 * Phase 11 Part C — three small ones from CW's read, plus the GID trap.
 *
 *   C1  /app/attention's Method paragraph said "first-variant barcode"; the
 *       walk reads up to fifty. One constant now feeds the query and the text.
 *   C2  /terms said "do not roll over", the plans FAQ said "don't". One
 *       sentence, one constant, both surfaces.
 *   C3  F3 could not be built on a dev store (no Barcode input in Shopify's
 *       variant editor). Asserted directly: a barcode on variant 2 clears the
 *       GTIN finding; a no-barcode control keeps it. The two results are
 *       printed into the assertion messages so the queue post can quote them.
 *   C4  /app/review?product=gid://… silently rendered every card. The GID
 *       form is refused with a message and no drafts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { code } from "../helpers/code.js";
import { VARIANT_BARCODE_SAMPLE, gradeProduct } from "../../app/utils/catalogueWatch.js";
import { CREDIT_ROLLOVER_SENTENCE, CREDIT_RESET_SENTENCE } from "../../app/utils/credits.js";

const src = (p) => code(readFileSync(p, "utf8"));
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
};

describe("C1 — the Method paragraph describes the method the code runs", () => {
  it("one constant feeds the query and the text; 'first-variant barcode' is gone", () => {
    expect(VARIANT_BARCODE_SAMPLE).toBe(50);
    expect(src("app/utils/catalogueWatch.server.js")).toMatch(/variants\(first: \$\{VARIANT_BARCODE_SAMPLE\}\)/);
    const page = src("app/routes/app.attention.jsx");
    expect(page).toMatch(/import \{[^}]*VARIANT_BARCODE_SAMPLE[^}]*\} from "\.\.\/utils\/catalogueWatch\.js"/);
    expect(page).toMatch(/the barcodes of up to \{VARIANT_BARCODE_SAMPLE\}/);
    expect(page).not.toMatch(/first-variant barcode/);
  });
});

describe("C2 — one sentence about unused credits", () => {
  it("both surfaces render the same constant, and no file spells its own version", () => {
    expect(CREDIT_ROLLOVER_SENTENCE).toBe("Unused credits do not roll over.");
    expect(src("app/routes/app.plans.jsx")).toMatch(/\$\{CREDIT_RESET_SENTENCE\} \$\{CREDIT_ROLLOVER_SENTENCE\}/);
    expect(src("app/utils/legal.js")).toMatch(/\$\{CREDIT_RESET_SENTENCE\} \$\{CREDIT_ROLLOVER_SENTENCE\}/);
    const offenders = walk("app").filter((p) => !/credits\.js$/.test(p) && /roll over|roll-over/i.test(src(p))); // the identifier CREDIT_ROLLOVER_SENTENCE is not a spelling
    expect(offenders).toEqual([]);
    expect(CREDIT_RESET_SENTENCE).not.toMatch(/roll/);
  });
});

describe("C3 — F3, asserted directly since no dev store could carry it", () => {
  const node = {
    id: "gid://shopify/Product/1",
    title: "Trade Work Boot",
    description: "A".repeat(140),
    vendor: "Acme",
    status: "ACTIVE",
    onlineStoreUrl: "https://x.myshopify.com/products/boot",
    productType: "Footwear",
    hasOnlyDefaultVariant: false,
    options: [{ name: "Size" }],
    featuredMedia: { preview: { image: { url: "https://cdn/x.jpg", altText: "Boot" } } },
    variants: { nodes: [{ barcode: "" }] },
  };
  const gtin = (g) => g.findings.find((f) => f.field === "gtin") ?? null;

  it("barcode on variant 2 → no GTIN finding; no barcode on either → the finding names the two variants read", () => {
    const fixed = gradeProduct(node, { variantBarcodes: ["", "9312345678907"] });
    const control = gradeProduct(node, { variantBarcodes: ["", ""] });
    expect(gtin(fixed), `F3 fixed: findings ${JSON.stringify(fixed.findings.map((f) => f.field))}`).toBe(null);
    expect(gtin(control)?.note, "F3 control").toMatch(/^No barcode on any of the 2 variants we read\./);
    expect(fixed.degrading).toBe(control.degrading - 1);
    // the pre-Phase-9 reading, first variant only, for the record
    expect(gtin(gradeProduct(node))?.note).toMatch(/^No barcode on the first variant\./);
  });
});

describe("C4 — the GID form of ?product= is refused, not silently ignored", () => {
  it("the loader scopes to nothing and says so; the numeric form still scopes", () => {
    const r = src("app/routes/app.review.jsx");
    expect(r).toMatch(/const scopeRefused = productParam !== "" && scopedTo === null;/);
    expect(r).toMatch(/productId: "__refused__"/);
    expect(r).toMatch(/scopeRefused,/); // returned by the loader
    expect(r).toMatch(/title="That product reference isn't valid"/);
    expect(r).toMatch(/not a GID or a handle/);
    expect(r).toMatch(/scopedTo = \/\^\\d\+\$\/\.test\(productParam\)/);
  });
});
