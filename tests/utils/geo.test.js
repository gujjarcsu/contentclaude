/**
 * Tests for the GEO/AEO engine (app/utils/geo.server.js):
 * GEO Readiness scorer, JSON-LD schema builder (validity + no fabrication),
 * and the llms.txt generator.
 */
import { describe, it, expect } from "vitest";
import {
  calculateGeoScore,
  aggregateGeoScore,
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

describe("calculateGeoScore", () => {
  it("scores a fully-optimized product highly (>= 85)", () => {
    const { score, breakdown } = calculateGeoScore(RICH_PRODUCT);
    expect(score).toBeGreaterThanOrEqual(85);
    // breakdown sums to the score and each item is within its max
    const sum = breakdown.reduce((s, b) => s + b.points, 0);
    expect(sum).toBe(score);
    for (const b of breakdown) expect(b.points).toBeLessThanOrEqual(b.max);
  });

  it("scores an empty/bare product near zero", () => {
    const { score } = calculateGeoScore({ title: "X" });
    expect(score).toBeLessThanOrEqual(20);
  });

  it("never exceeds 100 or drops below 0", () => {
    expect(calculateGeoScore(RICH_PRODUCT).score).toBeLessThanOrEqual(100);
    expect(calculateGeoScore({}).score).toBeGreaterThanOrEqual(0);
  });

  it("rewards adding an FAQ block (Q&A is GEO-critical)", () => {
    const without = calculateGeoScore({ ...RICH_PRODUCT, faq: "" }).score;
    const withFaq = calculateGeoScore(RICH_PRODUCT).score;
    expect(withFaq).toBeGreaterThan(without);
  });

  it("flags missing dimensions in checks for a thin product", () => {
    const { checks } = calculateGeoScore({ title: "Thing", description: "Short." });
    expect(checks.faqBlock.pass).toBe(false);
    expect(checks.schema.pass).toBe(true); // Product schema still builds from a title
    expect(checks.entities.pass).toBe(false);
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
    const tag = jsonLdScriptTag({ "@context": "https://schema.org", "@graph": [{ "@type": "Product", name: "</script>x" }] });
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
    { type: "product", title: "Heritage Satchel", url: "https://x/products/sat", summary: "Full-grain leather work bag." },
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
    const out = generateLlmsTxt(store, [
      { type: "product", title: "Satchel", url: "https://x/s", summary: "Bag", attributes: { Material: "Leather", Price: "$189" } },
    ], { full: true });
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
