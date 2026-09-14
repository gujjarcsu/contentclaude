/**
 * Tests for the GEO/AEO engine (app/utils/geo.server.js):
 * GEO Readiness scorer, JSON-LD schema builder (validity + no fabrication),
 * and the llms.txt generator.
 */
import { describe, it, expect } from "vitest";
import {
  calculateGeoScore,
  aggregateGeoScore,
  GEO_RUBRIC,
  ATTRIBUTE_GRADES,
  buildProductJsonLd,
  schemaTypes,
  jsonLdScriptTag,
  generateLlmsTxt,
} from "../../app/utils/geo.server.js";

const RICH_FAQ = `Q: What material is it made from?
A: Full-grain Italian leather, vegetable tanned.

Q: What are the dimensions?
A: 30cm x 20cm x 10cm, fits a 14-inch laptop.

Q: Who is it for?
A: Professionals who commute and want a durable everyday bag.`;

const RICH_PRODUCT = {
  title: "Heritage Leather Satchel",
  description:
    "<p>The Heritage Leather Satchel is a full-grain leather work bag built for daily commuting. " +
    "It carries a 14-inch laptop, documents, and everyday essentials with room to spare. " +
    "Hand-finished and designed to age beautifully over years of use.</p>",
  seoTitle: "Heritage Leather Satchel | Full-Grain Work Bag",
  seoDescription: "A full-grain leather satchel for commuters — fits a 14-inch laptop and ages beautifully.",
  productType: "Bags",
  vendor: "Atelier Co",
  tags: ["leather", "laptop bag", "commuter"],
  variants: [{ price: "189.00" }, { price: "209.00" }],
  images: [{ url: "https://cdn.example/sat.jpg", altText: "Brown leather satchel, front view" }],
  faq: RICH_FAQ,
};

/**
 * A description with real, checkable facts in it. The point of the rebuilt
 * rubric: this is what "evidence density" means, and RICH_PRODUCT above is
 * deliberately NOT this — it is good prose with one measurement in it.
 */
const EVIDENCE_DENSE_PRODUCT = {
  ...RICH_PRODUCT,
  description:
    "<p>A 26cm cast iron skillet weighing 3.2kg, pre-seasoned with flaxseed oil and oven safe to 260°C. " +
    "The handle measures 12cm and stays cool on induction hobs up to 2000w. Sand-cast in Yorkshire from " +
    "98% recycled iron, ground smooth, and finished by hand. The cooking surface is 24cm across and the " +
    "walls are 4mm thick, so heat holds steady for 20 minutes after the hob is off.</p>",
  updatedAt: new Date().toISOString(),
};

describe("calculateGeoScore — rebuilt on W1, 2026-09-14", () => {
  it("scores an evidence-dense, complete product very highly", () => {
    const { score } = calculateGeoScore(EVIDENCE_DENSE_PRODUCT);
    expect(score).toBeGreaterThanOrEqual(95);
  });

  it("scores good prose with thin evidence LOWER, on purpose", () => {
    // RICH_PRODUCT reads well and has every attribute, but its description is
    // ~240 characters containing one measurement. Under the old rubric it
    // scored highly, because 25 of 100 points were awarded for structured data
    // that Shopify REQUIRES every Theme Store theme to emit — a quarter of the
    // score for something the merchant did not do and cannot act on.
    //
    // W1 measured the market's real problem as content: 43.9% of stores have
    // descriptions under 120 characters. So density is now the largest
    // dimension and this fixture lands mid-80s rather than mid-90s. That gap is
    // the rubric doing its job, not a regression.
    const rich = calculateGeoScore(RICH_PRODUCT).score;
    const dense = calculateGeoScore(EVIDENCE_DENSE_PRODUCT).score;
    expect(rich).toBeGreaterThanOrEqual(75);
    expect(rich).toBeLessThan(dense);
  });

  it("counts hyphenated units as evidence", () => {
    // "14-inch laptop" is how product copy is actually written. The first
    // version of the pattern required whitespace before the unit and scored all
    // of these as zero evidence.
    const hyphen = calculateGeoScore({ description: "A 14-inch laptop bag, 3-metre strap, 500-gram shell. ".repeat(4) });
    const none = calculateGeoScore({ description: "A laptop bag with a long strap and a light shell. ".repeat(4) });
    expect(hyphen.checks.contentDensity.evidence).toBeGreaterThan(0);
    expect(hyphen.score).toBeGreaterThan(none.score);
  });

  it("scores an empty product near zero", () => {
    expect(calculateGeoScore({ title: "X" }).score).toBeLessThanOrEqual(20);
  });

  it("never exceeds 100 or drops below 0", () => {
    expect(calculateGeoScore(EVIDENCE_DENSE_PRODUCT).score).toBeLessThanOrEqual(100);
    expect(calculateGeoScore({}).score).toBeGreaterThanOrEqual(0);
  });

  it("rewards adding questions and answers", () => {
    const without = calculateGeoScore({ ...RICH_PRODUCT, faq: "" }).score;
    const withFaq = calculateGeoScore(RICH_PRODUCT).score;
    expect(withFaq).toBeGreaterThan(without);
  });

  it("NO LONGER scores structured-data presence", () => {
    // 09-DOCTRINE.md §3: a score is "indefensible if it scores schema presence".
    expect(GEO_RUBRIC.map((d) => d.key)).not.toContain("schema");
    const keys = calculateGeoScore(RICH_PRODUCT).breakdown.map((b) => b.key);
    expect(keys).not.toContain("schema");
  });

  it("grades attributes instead of counting them, and productType is COSMETIC", () => {
    // W1 is explicit: product_type is Shopify's own taxonomy field and is NOT on
    // OpenAI's required list, so grading it blocking "would repeat the GTIN
    // overclaim §1 already had to walk back".
    const productType = ATTRIBUTE_GRADES.find((a) => a.key === "productType");
    expect(productType.grade).toBe("cosmetic");
    const price = ATTRIBUTE_GRADES.find((a) => a.key === "price");
    expect(price.grade).toBe("blocking");
    // A missing cosmetic attribute must cost less than a missing blocking one.
    expect(productType.weight).toBeLessThan(price.weight);
  });

  it("separates a missing blocking attribute from a missing cosmetic one", () => {
    const noPrice = calculateGeoScore({ ...RICH_PRODUCT, variants: [], price: undefined });
    expect(noPrice.checks.attributes.missingBlocking).toContain("price");
    expect(noPrice.checks.attributes.pass).toBe(false);

    const noType = calculateGeoScore({ ...RICH_PRODUCT, productType: "" });
    expect(noType.checks.attributes.missingCosmetic).toContain("productType");
    // Cosmetic gaps never fail the dimension — that is the whole point.
    expect(noType.checks.attributes.pass).toBe(true);
  });

  it("does not penalise an attribute it was never given — 'not supplied' is not 'missing'", () => {
    // barcode is Admin-API-only (W1: it is NOT in /products.json), so a caller
    // that cannot see it must not be marked down for it.
    const notSupplied = calculateGeoScore(RICH_PRODUCT);
    const suppliedEmpty = calculateGeoScore({ ...RICH_PRODUCT, barcode: "" });
    const attrOf = (r) => r.breakdown.find((b) => b.key === "attributes").points;
    expect(attrOf(notSupplied)).toBeGreaterThan(attrOf(suppliedEmpty));
  });

  it("skips freshness when the date is unknown and renormalises the rest", () => {
    const unknown = calculateGeoScore(RICH_PRODUCT);
    expect(unknown.notMeasured).toContain("freshness");
    expect(unknown.breakdown.map((b) => b.key)).not.toContain("freshness");

    const known = calculateGeoScore({ ...RICH_PRODUCT, updatedAt: new Date().toISOString() });
    expect(known.notMeasured).not.toContain("freshness");
    expect(known.breakdown.map((b) => b.key)).toContain("freshness");
  });

  it("a stale product scores below an identical fresh one", () => {
    const old = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
    const stale = calculateGeoScore({ ...EVIDENCE_DENSE_PRODUCT, updatedAt: old });
    const fresh = calculateGeoScore(EVIDENCE_DENSE_PRODUCT);
    expect(stale.score).toBeLessThan(fresh.score);
  });

  it("the score is the earned points over the MEASURABLE maximum", () => {
    // Not a raw sum any more: a dimension that could not be measured is excluded
    // from both sides rather than counted as zero.
    const r = calculateGeoScore(RICH_PRODUCT);
    const earned = r.breakdown.reduce((s, b) => s + b.points, 0);
    const available = r.breakdown.reduce((s, b) => s + b.max, 0);
    expect(r.score).toBe(Math.round((earned / available) * 100));
    for (const b of r.breakdown) expect(b.points).toBeLessThanOrEqual(b.max);
  });

  it("every rubric row carries an explanation a merchant can read", () => {
    // The published rubric is generated from this table, so a row with no `why`
    // would render as a blank cell on the page.
    for (const d of GEO_RUBRIC) {
      expect(d.label.length, `${d.key} has no label`).toBeGreaterThan(0);
      expect(d.why.length, `${d.key} has no explanation`).toBeGreaterThan(30);
      expect(d.max).toBeGreaterThan(0);
    }
  });

  it("the rubric totals 100 when everything is measurable", () => {
    expect(GEO_RUBRIC.reduce((s, d) => s + d.max, 0)).toBe(100);
  });
});

describe("aggregateGeoScore", () => {
  it("averages and rounds product scores", () => {
    expect(aggregateGeoScore([90, 80, 85])).toBe(85);
  });
  it("returns 0 for an empty store", () => {
    expect(aggregateGeoScore([])).toBe(0);
  });
});

describe("buildProductJsonLd", () => {
  it("emits a valid Product + Offer + FAQPage @graph", () => {
    const schema = buildProductJsonLd(RICH_PRODUCT);
    expect(schema["@context"]).toBe("https://schema.org");
    const types = schemaTypes(schema);
    expect(types).toContain("Product");
    expect(types).toContain("Offer");
    expect(types).toContain("FAQPage");
    // multi-variant → AggregateOffer with low/high price
    const product = schema["@graph"].find((n) => n["@type"] === "Product");
    expect(product.offers["@type"]).toBe("AggregateOffer");
    expect(product.offers.lowPrice).toBe("189.00");
    expect(product.offers.highPrice).toBe("209.00");
    expect(product.brand.name).toBe("Atelier Co");
  });

  it("NEVER fabricates AggregateRating when no rating data exists", () => {
    const product = buildProductJsonLd(RICH_PRODUCT)["@graph"].find((n) => n["@type"] === "Product");
    expect(product.aggregateRating).toBeUndefined();
  });

  it("emits AggregateRating ONLY with a real rating + count", () => {
    const schema = buildProductJsonLd({ ...RICH_PRODUCT, rating: { value: 4.6, count: 23 } });
    const product = schema["@graph"].find((n) => n["@type"] === "Product");
    expect(product.aggregateRating.ratingValue).toBe(4.6);
    expect(product.aggregateRating.reviewCount).toBe(23);
  });

  it("rejects an out-of-range rating (no malformed schema)", () => {
    const schema = buildProductJsonLd({ ...RICH_PRODUCT, rating: { value: 9, count: 0 } });
    const product = schema["@graph"].find((n) => n["@type"] === "Product");
    expect(product.aggregateRating).toBeUndefined();
  });

  it("returns null when there is no name and no FAQ", () => {
    expect(buildProductJsonLd({ description: "no title" })).toBeNull();
  });

  it("produces a single-price Offer for a single variant", () => {
    const schema = buildProductJsonLd({ title: "T", variants: [{ price: "12.50" }] });
    const product = schema["@graph"][0];
    expect(product.offers["@type"]).toBe("Offer");
    expect(product.offers.price).toBe("12.50");
  });
});

describe("jsonLdScriptTag", () => {
  it("wraps schema in a script tag and escapes closing tags", () => {
    const tag = jsonLdScriptTag({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Product", name: "</script>x" }],
    });
    expect(tag.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(tag).not.toContain("</script>x"); // the injected closer is escaped
    expect(tag).toContain("<\\/script>x");
  });
  it("returns empty string for null schema", () => {
    expect(jsonLdScriptTag(null)).toBe("");
  });
});

describe("generateLlmsTxt", () => {
  const store = { name: "Atelier Co", description: "Leather goods for commuters." };
  const items = [
    {
      type: "product",
      title: "Heritage Satchel",
      url: "https://x/products/sat",
      summary: "Full-grain leather work bag.",
    },
    { type: "product", title: "Card Wallet", url: "https://x/products/wal", summary: "Slim card holder." },
  ];

  it("produces a valid llms.txt with H1, blockquote, and product links", () => {
    const out = generateLlmsTxt(store, items);
    expect(out).toMatch(/^# Atelier Co/);
    expect(out).toContain("> Leather goods for commuters.");
    expect(out).toContain("## Products");
    expect(out).toContain("[Heritage Satchel](https://x/products/sat): Full-grain leather work bag.");
  });

  it("full mode includes attributes when provided", () => {
    const out = generateLlmsTxt(
      store,
      [
        {
          type: "product",
          title: "Satchel",
          url: "https://x/s",
          summary: "Bag",
          attributes: { Material: "Leather", Price: "$189" },
        },
      ],
      { full: true },
    );
    expect(out).toContain("Material: Leather");
    expect(out).toContain("Price: $189");
  });

  it("renders a Collections section when collections are supplied", () => {
    const out = generateLlmsTxt(store, items, {
      collections: [{ title: "Bags", url: "https://x/c/bags", summary: "All bags" }],
    });
    expect(out).toContain("## Collections");
    expect(out).toContain("[Bags](https://x/c/bags): All bags");
  });
});
