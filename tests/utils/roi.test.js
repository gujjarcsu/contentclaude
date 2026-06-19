import { describe, it, expect } from "vitest";
import { computeRoiSummary, MINUTES_PER_PIECE_MANUAL } from "../../app/utils/roi.server.js";

describe("computeRoiSummary", () => {
  const base = {
    seoBefore: 40, seoAfter: 78,
    geoBefore: 22, geoAfter: 84,
    totalProducts: 50, optimizedProducts: 40,
    contentPieces: 120,
    schemaTypes: ["Product", "FAQPage", "Offer", "Product"],
  };

  it("computes measured deltas and coverage", () => {
    const r = computeRoiSummary(base);
    expect(r.seoScore.change).toBe(38);
    expect(r.geoScore.change).toBe(62);
    expect(r.coveragePct).toBe(80);
    expect(r.headline.improved).toBe(true);
  });

  it("dedupes schema types and flags AEO readiness", () => {
    const r = computeRoiSummary(base);
    expect(r.schemaTypesAdded.sort()).toEqual(["FAQPage", "Offer", "Product"]);
    expect(r.aeoReady).toBe(true);
  });

  it("time saved is a labelled ESTIMATE with a transparent basis", () => {
    const r = computeRoiSummary(base);
    expect(r.timeSaved.isEstimate).toBe(true);
    expect(r.timeSaved.minutes).toBe(120 * MINUTES_PER_PIECE_MANUAL);
    expect(r.timeSaved.basis).toContain(String(MINUTES_PER_PIECE_MANUAL));
    expect(typeof r.timeSaved.label).toBe("string");
  });

  it("never invents revenue or traffic fields", () => {
    const r = computeRoiSummary(base);
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toContain("revenue");
    expect(json).not.toContain("traffic");
    expect(json).not.toContain("sales");
  });

  it("clamps coverage and handles an empty store", () => {
    expect(computeRoiSummary({ totalProducts: 0 }).coveragePct).toBe(0);
    expect(computeRoiSummary({ totalProducts: 10, optimizedProducts: 999 }).coveragePct).toBe(100);
    const empty = computeRoiSummary({});
    expect(empty.contentPieces).toBe(0);
    expect(empty.timeSaved.minutes).toBe(0);
    expect(empty.aeoReady).toBe(false);
  });
});
