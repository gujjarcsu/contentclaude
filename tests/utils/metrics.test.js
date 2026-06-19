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
    // One round-trip: grouped rows with distinct-product + raw-piece counts.
    // PostgreSQL $queryRaw returns BigInt for COUNT.
    prisma.$queryRaw.mockResolvedValueOnce([
      { status: "published", products: 5n, pieces: 15n },
      { status: "draft", products: 3n, pieces: 9n },
    ]);

    const result = await getContentMetrics("test.myshopify.com");

    // Exactly one DB round-trip (down from 4)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(typeof result.publishedProducts).toBe("number");
    expect(typeof result.draftProducts).toBe("number");
    expect(result.publishedProducts).toBe(5);
    expect(result.draftProducts).toBe(3);
    expect(result.publishedPieces).toBe(15);
    expect(result.draftPieces).toBe(9);
  });

  it("returns 0 for shop with no content (no rows)", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    const result = await getContentMetrics("empty.myshopify.com");

    expect(result.publishedProducts).toBe(0);
    expect(result.draftProducts).toBe(0);
    expect(result.publishedPieces).toBe(0);
    expect(result.draftPieces).toBe(0);
  });

  it("handles a status present with missing count fields gracefully", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { status: "published" }, // no products/pieces fields
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
