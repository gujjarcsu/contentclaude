/**
 * Tests for getContentMetrics and coveragePct.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/db.server.js", () => ({
  default: {
    $queryRaw: vi.fn(),
    generatedContent: { count: vi.fn() },
  },
}));

const prisma = (await import("../../app/db.server.js")).default;
const { getContentMetrics, coveragePct } = await import("../../app/utils/metrics.server.js");

describe("getContentMetrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Number not BigInt from COUNT DISTINCT", async () => {
    // PostgreSQL $queryRaw returns BigInt for COUNT
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: 5n }])  // published — BigInt
      .mockResolvedValueOnce([{ count: 3n }]); // draft — BigInt
    prisma.generatedContent.count
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(9);

    const result = await getContentMetrics("test.myshopify.com");

    expect(typeof result.publishedProducts).toBe("number");
    expect(typeof result.draftProducts).toBe("number");
    expect(result.publishedProducts).toBe(5);
    expect(result.draftProducts).toBe(3);
  });

  it("returns 0 for shop with no content", async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }]);
    prisma.generatedContent.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await getContentMetrics("empty.myshopify.com");

    expect(result.publishedProducts).toBe(0);
    expect(result.draftProducts).toBe(0);
    expect(result.publishedPieces).toBe(0);
    expect(result.draftPieces).toBe(0);
  });

  it("handles missing count in result gracefully", async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{}])  // no count property
      .mockResolvedValueOnce([{}]);
    prisma.generatedContent.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await getContentMetrics("test.myshopify.com");

    expect(result.publishedProducts).toBe(0);
    expect(result.draftProducts).toBe(0);
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
