import { describe, it, expect } from "vitest";
import {
  bucketIndex,
  addToBuckets,
  sampleCount,
  percentileRank,
  medianScore,
  quartileLabel,
  normalizeCategory,
} from "../../app/utils/benchmark.server.js";

describe("benchmark histogram math (privacy-safe, no per-store data)", () => {
  it("maps scores to buckets and clamps", () => {
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(45)).toBe(4);
    expect(bucketIndex(100)).toBe(9);
    expect(bucketIndex(999)).toBe(9);
    expect(bucketIndex(-5)).toBe(0);
  });

  it("adds samples and tolerates malformed input", () => {
    let b = addToBuckets(null, 55);
    expect(sampleCount(b)).toBe(1);
    expect(b[5]).toBe(1);
    b = addToBuckets(b, 12);
    expect(sampleCount(b)).toBe(2);
    expect(b[1]).toBe(1);
  });

  it("percentileRank is 0 on an empty histogram", () => {
    expect(percentileRank([0,0,0,0,0,0,0,0,0,0], 80)).toBe(0);
  });

  it("percentileRank reflects standing in the distribution", () => {
    // 100 stores: 50 in bucket 4 (40-49), 50 in bucket 8 (80-89)
    const b = [0,0,0,0,50,0,0,0,50,0];
    // a score of 85 sits in bucket 8 → below it are 50, plus half of its bucket (25) = 75%
    expect(percentileRank(b, 85)).toBe(75);
    // a score of 45 (bucket 4) → below 0 + half of 50 = 25%
    expect(percentileRank(b, 45)).toBe(25);
  });

  it("medianScore returns the median bucket midpoint", () => {
    const b = [0,0,0,0,50,0,0,0,50,0];
    expect(medianScore(b)).toBe(45); // 4*10+5
  });

  it("quartileLabel buckets the percentile", () => {
    expect(quartileLabel(90)).toBe("top quartile");
    expect(quartileLabel(60)).toBe("upper-middle");
    expect(quartileLabel(30)).toBe("lower-middle");
    expect(quartileLabel(10)).toBe("bottom quartile");
  });

  it("normalizeCategory is stable and lowercased", () => {
    expect(normalizeCategory("  Bags ")).toBe("bags");
    expect(normalizeCategory("")).toBe("uncategorized");
    expect(normalizeCategory(null)).toBe("uncategorized");
  });
});
