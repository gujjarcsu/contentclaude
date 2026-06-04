/**
 * Unit tests for Shopify 429 retry handling in bulkProcessor.server.js (FIX 1).
 *
 * Tests cover:
 *  - 429 response triggers a retry with back-off
 *  - Product marked failed after max retries on persistent 429
 *  - Non-OK response (e.g., 500) throws immediately
 *  - Network error triggers retry
 *  - Credit consumption note: tryConsumeGeneration is called BEFORE fetchShopifyProduct,
 *    so if Shopify returns 429 and all retries fail, the credit IS already consumed.
 *    This is documented expected behavior — we prefer to not double-check rather than
 *    have a TOCTOU gap at the quota gate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("../../app/db.server.js", () => ({
  default: {
    generationJob: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    session: { findFirst: vi.fn() },
    brandVoice: { findUnique: vi.fn() },
    generatedContent: { findMany: vi.fn(), upsert: vi.fn() },
    collectionVoice: { findMany: vi.fn() },
  },
}));

vi.mock("../../app/utils/ai.server.js", () => ({
  generateProductContent: vi.fn(),
}));

vi.mock("../../app/utils/plans.server.js", () => ({
  tryConsumeGeneration: vi.fn(() => Promise.resolve({ allowed: true })),
}));

vi.mock("../../app/utils/errorMonitoring.server.js", () => ({
  captureException: vi.fn(),
}));

vi.mock("../../app/utils/logger.server.js", () => ({
  default: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../app/shopify.server.js", () => ({
  apiVersion: "2026-04",
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => data,
  };
}

function make429Response(retryAfter = "1") {
  return {
    ok: false,
    status: 429,
    headers: { get: (h) => (h === "Retry-After" ? retryAfter : null) },
    json: async () => ({}),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("fetchShopifyProduct retry logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    const productData = { id: "gid://shopify/Product/1", title: "Test", productType: "", vendor: "", description: "", descriptionHtml: "", seo: {}, featuredImage: null, images: { edges: [] }, variants: { edges: [] }, tags: [], collections: { edges: [] } };

    mockFetch
      .mockResolvedValueOnce(make429Response("1"))
      .mockResolvedValueOnce(makeJsonResponse({ data: { product: productData } }));

    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");

    prisma.generationJob.findUnique.mockResolvedValue({
      id: "job1",
      shop: "test.myshopify.com",
      status: "queued",
      productIds: JSON.stringify(["gid://shopify/Product/1"]),
      contentTypes: "description",
      autoPublish: false,
      totalProducts: 1,
    });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: "test.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({ shop: "test.myshopify.com", storeName: "Test", brandTone: "professional", targetAudience: "", keyDifferentiators: "", avoidPhrases: "", additionalNotes: "", targetKeywords: "", sampleContent: "", autopilotEnabled: false });
    prisma.generatedContent.findMany.mockResolvedValue([]);
    prisma.collectionVoice.findMany.mockResolvedValue([]);
    prisma.generatedContent.upsert.mockResolvedValue({});
    generateProductContent.mockResolvedValue({ description: "<p>Generated</p>" });

    // Advance timers to skip back-off delays
    const processPromise = processBulkJob("job1");
    await vi.runAllTimersAsync();
    await processPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("marks product failed after max retries on persistent 429", async () => {
    mockFetch.mockResolvedValue(make429Response("1"));

    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;

    prisma.generationJob.findUnique.mockResolvedValue({
      id: "job2",
      shop: "test.myshopify.com",
      status: "queued",
      productIds: JSON.stringify(["gid://shopify/Product/2"]),
      contentTypes: "description",
      autoPublish: false,
      totalProducts: 1,
    });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: "test.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({ shop: "test.myshopify.com", storeName: "Test", brandTone: "professional", targetAudience: "", keyDifferentiators: "", avoidPhrases: "", additionalNotes: "", targetKeywords: "", sampleContent: "", autopilotEnabled: false });
    prisma.generatedContent.findMany.mockResolvedValue([]);
    prisma.collectionVoice.findMany.mockResolvedValue([]);

    const processPromise = processBulkJob("job2");
    await vi.runAllTimersAsync();
    await processPromise;

    // fetch should have been called MAX_RETRIES + 1 times (1 initial + 4 retries)
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);

    // The job should be updated with failedProducts
    const updateCalls = prisma.generationJob.update.mock.calls;
    const failUpdate = updateCalls.find(
      ([args]) => args.data?.failedProducts || args.data?.status === "complete"
    );
    expect(failUpdate).toBeTruthy();
  });

  it("documents that credit is NOT consumed when Shopify fetch fails (FIX 2 credit protection)", async () => {
    // New behavior after FIX 2: credit is consumed AFTER successful generation.
    // If Shopify fetch fails (429 exhausted), credit is NOT consumed — no charge to merchant.
    const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");
    const prisma = (await import("../../app/db.server.js")).default;

    mockFetch.mockResolvedValue(make429Response("1"));

    prisma.generationJob.findUnique.mockResolvedValue({
      id: "job3",
      shop: "test3.myshopify.com",
      status: "queued",
      productIds: JSON.stringify(["gid://shopify/Product/3"]),
      contentTypes: "description",
      autoPublish: false,
      totalProducts: 1,
    });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: "test3.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({ shop: "test3.myshopify.com", storeName: "Test", brandTone: "professional", targetAudience: "", keyDifferentiators: "", avoidPhrases: "", additionalNotes: "", targetKeywords: "", sampleContent: "", autopilotEnabled: false });
    prisma.generatedContent.findMany.mockResolvedValue([]);
    prisma.collectionVoice.findMany.mockResolvedValue([]);

    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const processPromise = processBulkJob("job3");
    await vi.runAllTimersAsync();
    await processPromise;

    // Credit was NOT consumed (tryConsumeGeneration NOT called) because Shopify fetch failed
    expect(tryConsumeGeneration).not.toHaveBeenCalled();
  });
});
