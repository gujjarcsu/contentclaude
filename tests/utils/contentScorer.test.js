import { describe, it, expect } from "vitest";
import { scoreContent } from "../../app/utils/contentScorer.server.js";

describe("scoreContent", () => {
  it("returns score 0 and grade Poor for empty content", () => {
    const result = scoreContent({ description: "", metaTitle: "", metaDescription: "", faq: "" });
    expect(result.score).toBe(0);
    expect(result.grade).toBe("Poor");
  });

  it("awards length points based on word count thresholds", () => {
    // >=150 words → 20pts, >=80 → 12pts, >=40 → 6pts
    const short = `<p>${"word ".repeat(45)}</p>`;
    const medium = `<p>${"word ".repeat(90)}</p>`;
    const long = `<p>${"word ".repeat(160)}</p>`;

    const sShort = scoreContent({ description: short, metaTitle: "", metaDescription: "", faq: "" });
    const sMedium = scoreContent({ description: medium, metaTitle: "", metaDescription: "", faq: "" });
    const sLong = scoreContent({ description: long, metaTitle: "", metaDescription: "", faq: "" });

    expect(sShort.score).toBeLessThan(sMedium.score);
    expect(sMedium.score).toBeLessThan(sLong.score);
  });

  it("awards structure points for HTML lists and emphasis", () => {
    const plain = `<p>${"word ".repeat(50)}</p>`;
    const structured = `<p>${"word ".repeat(50)}</p><ul><li>feature</li></ul>`;

    const sPlain = scoreContent({ description: plain, metaTitle: "", metaDescription: "", faq: "" });
    const sStructured = scoreContent({ description: structured, metaTitle: "", metaDescription: "", faq: "" });
    expect(sStructured.score).toBeGreaterThan(sPlain.score);
  });

  it("penalises filler openers like 'Whether you are looking for'", () => {
    const withFiller = `<p>Whether you are looking for the best product, look no further. ${"word ".repeat(50)}</p><ul><li>x</li></ul>`;
    const withoutFiller = `<p>This product is built for performance. ${"word ".repeat(50)}</p><ul><li>x</li></ul>`;

    const sWithFiller = scoreContent({ description: withFiller, metaTitle: "", metaDescription: "", faq: "" });
    const sWithout = scoreContent({ description: withoutFiller, metaTitle: "", metaDescription: "", faq: "" });
    expect(sWithout.score).toBeGreaterThan(sWithFiller.score);
  });

  it("awards full meta title points for a title under 60 chars", () => {
    const result = scoreContent({ description: "", metaTitle: "Short Title Under Sixty Chars", metaDescription: "", faq: "" });
    expect(result.score).toBe(20);
  });

  it("penalises meta title over 60 chars", () => {
    const longTitle = "A".repeat(61);
    const short = scoreContent({ description: "", metaTitle: "Short title", metaDescription: "", faq: "" });
    const long = scoreContent({ description: "", metaTitle: longTitle, metaDescription: "", faq: "" });
    expect(short.score).toBeGreaterThan(long.score);
    expect(long.issues.some((i) => /meta title/i.test(i))).toBe(true);
  });

  it("awards full meta description points for description under 155 chars", () => {
    const result = scoreContent({ description: "", metaTitle: "", metaDescription: "Good meta desc.", faq: "" });
    expect(result.score).toBe(20);
  });

  it("penalises meta description over 155 chars", () => {
    const short = scoreContent({ description: "", metaTitle: "", metaDescription: "Good meta desc.", faq: "" });
    const long = scoreContent({ description: "", metaTitle: "", metaDescription: "A".repeat(156), faq: "" });
    expect(short.score).toBeGreaterThan(long.score);
  });

  it("awards FAQ points when FAQ content is substantial (>50 chars)", () => {
    const withFaq = scoreContent({ description: "", metaTitle: "", metaDescription: "", faq: "Q: What is it? A: It is a product that helps you achieve your goals every day." });
    const withoutFaq = scoreContent({ description: "", metaTitle: "", metaDescription: "", faq: "" });
    expect(withFaq.score).toBe(10);
    expect(withoutFaq.score).toBe(0);
  });

  it("grades Excellent when score >= 90", () => {
    // 150+ words (+20) + structure (+15) + no filler (+15) = 50
    // + metaTitle <= 60 (+20) + metaDescription <= 155 (+20) + FAQ (+10) = 100
    const description = `<p>${"word ".repeat(155)}</p><ul><li>feature one</li><li>feature two</li></ul>`;
    const result = scoreContent({
      description,
      metaTitle: "Perfect Product Title Here",
      metaDescription: "A clear and compelling meta description under 155 characters for maximum SEO impact.",
      faq: "Q: Does it work? A: Yes, absolutely, it is designed to deliver results for every user who tries it.",
    });
    expect(result.grade).toBe("Excellent");
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it("grades Good when score is 75-89", () => {
    const description = `<p>${"word ".repeat(90)}</p><ul><li>x</li></ul>`;
    // 12 (length) + 15 (structure) + 15 (no filler) = 42
    // + 20 (metaTitle) + 20 (metaDescription) = 82 → Good
    const result = scoreContent({
      description,
      metaTitle: "Good Title Here",
      metaDescription: "A good meta description under 155 chars.",
      faq: "",
    });
    expect(result.grade).toBe("Good");
  });

  it("returns issues array listing problems", () => {
    const result = scoreContent({ description: "", metaTitle: "", metaDescription: "", faq: "" });
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues).toContain("Missing product description");
    expect(result.issues).toContain("Missing meta title");
    expect(result.issues).toContain("Missing meta description");
  });
});
