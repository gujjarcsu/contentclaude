import { describe, it, expect } from "vitest";
import { faqToJsonLd, calculateSeoScore, getProductTypeInstructions } from "../../app/utils/seo.server.js";

describe("faqToJsonLd", () => {
  it("returns a valid FAQPage schema for well-formed Q&A pairs", () => {
    const faqText = `Q: What is this product?
A: It is a high-quality supplement for daily use.

Q: How do I take it?
A: Take one capsule per day with water.`;

    const result = faqToJsonLd(faqText);
    expect(result).not.toBeNull();
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("FAQPage");
    expect(Array.isArray(result.mainEntity)).toBe(true);
    expect(result.mainEntity).toHaveLength(2);
    expect(result.mainEntity[0]["@type"]).toBe("Question");
    expect(result.mainEntity[0].name).toBe("What is this product?");
    expect(result.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
    expect(result.mainEntity[0].acceptedAnswer.text).toBe("It is a high-quality supplement for daily use.");
  });

  it("returns null for an empty string", () => {
    expect(faqToJsonLd("")).toBeNull();
  });

  it("returns null when no valid Q&A pairs are found", () => {
    expect(faqToJsonLd("Some random text with no Q&A structure")).toBeNull();
  });

  it("handles multiple Q&A pairs correctly", () => {
    const faqText = `Q: First question?
A: First answer.

Q: Second question?
A: Second answer.

Q: Third question?
A: Third answer.`;

    const result = faqToJsonLd(faqText);
    expect(result.mainEntity).toHaveLength(3);
  });
});

describe("calculateSeoScore", () => {
  it("returns score 100 and all checks true for a fully optimised product", () => {
    const product = {
      description: "A".repeat(100),
      seoTitle: "Perfect SEO Title",
      seoDescription: "Perfect meta description for SEO",
      images: [{ altText: "product image alt text" }],
    };
    const { score, checks } = calculateSeoScore(product);
    expect(score).toBe(100);
    expect(checks.hasDescription).toBe(true);
    expect(checks.hasMetaTitle).toBe(true);
    expect(checks.hasMetaDesc).toBe(true);
    expect(checks.hasImages).toBe(true);
    expect(checks.hasAltText).toBe(true);
  });

  it("returns score 0 and all checks false for an empty product", () => {
    const product = {
      description: "",
      seoTitle: "",
      seoDescription: "",
      images: [],
    };
    const { score, checks } = calculateSeoScore(product);
    expect(score).toBe(0);
    expect(checks.hasDescription).toBe(false);
    expect(checks.hasMetaTitle).toBe(false);
    expect(checks.hasMetaDesc).toBe(false);
    expect(checks.hasImages).toBe(false);
    expect(checks.hasAltText).toBe(false);
  });

  it("awards description points only when description is >= 50 chars", () => {
    const shortProduct = { description: "Short", seoTitle: "", seoDescription: "", images: [] };
    const longProduct = { description: "A".repeat(50), seoTitle: "", seoDescription: "", images: [] };
    const { score: shortScore } = calculateSeoScore(shortProduct);
    const { score: longScore } = calculateSeoScore(longProduct);
    expect(shortScore).toBe(0);
    expect(longScore).toBe(30);
  });

  it("awards image alt text points only when at least one image has alt text", () => {
    const withAlt = { description: "", seoTitle: "", seoDescription: "", images: [{ altText: "alt" }] };
    const withoutAlt = { description: "", seoTitle: "", seoDescription: "", images: [{ altText: "" }] };
    const { score: withAltScore } = calculateSeoScore(withAlt);
    const { score: withoutAltScore } = calculateSeoScore(withoutAlt);
    expect(withAltScore).toBe(20);
    expect(withoutAltScore).toBe(10);
  });
});

describe("getProductTypeInstructions", () => {
  it("detects gift card and returns short description instruction", () => {
    const result = getProductTypeInstructions("Gift Cards", "Store Gift Card $50");
    expect(result).toBeTruthy();
    expect(result.toLowerCase()).toContain("gift card");
    expect(result.toLowerCase()).toContain("short");
  });

  it("detects gift card from title alone", () => {
    const result = getProductTypeInstructions("", "Gift Card $100");
    expect(result).toBeTruthy();
  });

  it("detects subscription products", () => {
    const result = getProductTypeInstructions("Subscription", "Monthly Membership Box");
    expect(result).toBeTruthy();
    expect(result.toLowerCase()).toContain("subscription");
  });

  it("detects bundle/set products", () => {
    const result = getProductTypeInstructions("Bundle", "Starter Kit for Beginners");
    expect(result).toBeTruthy();
    expect(result.toLowerCase()).toContain("bundle");
  });

  it("returns empty string for a plain product type like 'Tap'", () => {
    const result = getProductTypeInstructions("Tap", "Chrome Bathroom Tap");
    expect(result).toBe("");
  });

  it("returns empty string for a generic product", () => {
    const result = getProductTypeInstructions("Clothing", "Blue Cotton T-Shirt");
    expect(result).toBe("");
  });
});
