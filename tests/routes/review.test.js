/**
 * Regression test for E-06: scoreContent returns .score not .total
 */
import { describe, it, expect } from "vitest";
import { scoreContent } from "../../app/utils/contentScorer.server.js";

describe("review page quality score (E-06 regression)", () => {
  it("scoreContent returns .score (number)", () => {
    const result = scoreContent({
      description: "<p>A high-quality organic product with excellent results.</p>",
      metaTitle: "Organic Product - Best Quality",
      metaDescription: "Buy the best organic product with fast shipping and great reviews.",
      faq: "",
    });
    expect(result.score).toBeDefined();
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("scoreContent does NOT have a .total property — confirms field name is score not total", () => {
    const result = scoreContent({ description: "<p>Good</p>", metaTitle: "T", metaDescription: "D", faq: "" });
    expect(result.total).toBeUndefined();
  });

  it("scoreContent returns lower score for empty content", () => {
    const empty = scoreContent({ description: "", metaTitle: "", metaDescription: "", faq: "" });
    const full = scoreContent({ description: "<p>Detailed product.</p>", metaTitle: "Title", metaDescription: "Desc", faq: "" });
    expect(full.score).toBeGreaterThan(empty.score);
  });
});
