/**
 * Tests for getContentMetrics and coveragePct.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/db.server.js", () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}));

const prisma = (await import("../../app/db.server.js")).default;
const { getContentMetrics, coveragePct } = await import("../../app/utils/metrics.server.js");

describe("getContentMetrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Number not BigInt from the single grouped query", async () => {
    // One round-trip. The query returns two kinds of row: one state per product,
    // and raw piece counts. PostgreSQL COUNT() comes back as BigInt through
    // $queryRaw, and BigInt does not survive JSON.stringify in a loader.
    prisma.$queryRaw.mockResolvedValueOnce([
      { kind: "state", key: "published", n: 5n },
      { kind: "state", key: "draft", n: 3n },
      { kind: "piece", key: "published", n: 15n },
      { kind: "piece", key: "draft", n: 9n },
    ]);

    const result = await getContentMetrics("test.myshopify.com", { totalProducts: 20 });

    // Exactly one DB round-trip (down from 4)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(typeof result.publishedProducts).toBe("number");
    expect(typeof result.draftProducts).toBe("number");
    expect(result.publishedProducts).toBe(5);
    expect(result.draftProducts).toBe(3);
    expect(result.publishedPieces).toBe(15);
    expect(result.draftPieces).toBe(9);
    // Products and pieces are different metrics and must not be conflated.
    expect(result.needsContentProducts).toBe(12);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("returns 0 for shop with no content (no rows)", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    const result = await getContentMetrics("empty.myshopify.com");

    expect(result.publishedProducts).toBe(0);
    expect(result.draftProducts).toBe(0);
    expect(result.publishedPieces).toBe(0);
    expect(result.draftPieces).toBe(0);
  });

  it("handles a row present with missing count fields gracefully", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { kind: "state", key: "published" }, // no n field
    ]);

    const result = await getContentMetrics("test.myshopify.com");

    expect(result.publishedProducts).toBe(0);
    expect(result.draftProducts).toBe(0);
    expect(result.publishedPieces).toBe(0);
  });
});

describe("coveragePct", () => {
  it("clamps at 100%", () => {
    expect(coveragePct(200, 100)).toBe(100);
  });

  it("returns 0 for zero total products", () => {
    expect(coveragePct(10, 0)).toBe(0);
  });

  it("calculates correctly", () => {
    expect(coveragePct(50, 200)).toBe(25);
  });

  it("handles undefined totalProducts", () => {
    expect(coveragePct(5, undefined)).toBe(0);
  });
});
