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
    generationJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    session: { findFirst: vi.fn() },
    brandVoice: { findUnique: vi.fn() },
    generatedContent: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      update: vi.fn(() => Promise.resolve({})),
    },
    collectionVoice: { findMany: vi.fn() },
  },
}));

vi.mock("../../app/utils/ai.server.js", () => ({
  generateProductContent: vi.fn(),
  enhanceExistingContent: vi.fn(),
}));

vi.mock("../../app/utils/plans.server.js", () => ({
  tryConsumeGeneration: vi.fn(() => Promise.resolve({ allowed: true })),
  remainingGenerations: vi.fn(() => Promise.resolve(999)),
  sliceToQuota: (ids, remaining) => ({
    targetIds: ids.slice(0, Math.max(0, remaining)),
    quotaSkipped: Math.max(0, ids.length - Math.max(0, remaining)),
  }),
  withGenerationCredit: vi.fn(async (shop, key, work, opts) => {
    const gate = { allowed: true, remaining: 10 };
    const result = await work(gate);
    const isEmpty = opts?.isEmpty ?? ((r) => !r);
    return { allowed: true, gate, result, refunded: !!isEmpty(result) };
  }),
}));

// The offline session/token layer is mocked so a test can decide what happens
// when Shopify rejects the token (Phase 0 item 14).
vi.mock("../../app/utils/offlineToken.server.js", () => ({
  getFreshOfflineSession: vi.fn(async (shop) => ({
    shop,
    accessToken: "tok",
    expires: null,
    refreshToken: null,
  })),
  refreshOfflineToken: vi.fn(async () => ({ accessToken: "tok2", expires: null })),
}));

// Phase 4 item 4.1 — the quality gate runs before anything is saved, and it
// correctly REFUSES the one-line fixtures these tests use ("<p>new</p>" is not
// publishable content). These tests are about the publish path, so the gate is
// mocked to pass here and is exercised directly in its own describe block below
// and exhaustively in tests/utils/contentQuality.test.js.
const { gateContent } = vi.hoisted(() => ({
  gateContent: vi.fn(async ({ generated }) => ({
    content: generated,
    assessment: { pass: true, reasons: [] },
    regenerated: false,
    note: null,
  })),
}));
vi.mock("../../app/utils/qualityGate.server.js", () => ({
  gateContent,
  fingerprintFor: () => "0123456789abcdef",
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

// The FAQ metafield definition check (auto-publish jobs only) goes through
// getCache, whose real implementation reaches for Redis — under fake timers that
// connection attempt never settles and the whole run hangs.
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (k, supplier) => supplier()),
  setCache: vi.fn(async () => {}),
  invalidateCache: vi.fn(async () => {}),
  invalidateCachePattern: vi.fn(async () => {}),
  getRedis: async () => null,
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
    const productData = {
      id: "gid://shopify/Product/1",
      title: "Test",
      productType: "",
      vendor: "",
      description: "",
      descriptionHtml: "",
      seo: {},
      featuredImage: null,
      images: { edges: [] },
      variants: { edges: [] },
      tags: [],
      collections: { edges: [] },
    };

    mockFetch
      .mockResolvedValueOnce(make429Response("1"))
      .mockResolvedValueOnce(makeJsonResponse({ data: { product: productData } }));

    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");

    prisma.generationJob.findUnique.mockResolvedValueOnce({
      id: "job1",
      shop: "test.myshopify.com",
      status: "queued",
      productIds: JSON.stringify(["gid://shopify/Product/1"]),
      contentTypes: "description",
      autoPublish: false,
      totalProducts: 1,
    });
    // Per-iteration cancellation checks read status — report still-processing
    prisma.generationJob.findUnique.mockResolvedValue({ status: "processing" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: "test.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({
      shop: "test.myshopify.com",
      storeName: "Test",
      brandTone: "professional",
      targetAudience: "",
      keyDifferentiators: "",
      avoidPhrases: "",
      additionalNotes: "",
      targetKeywords: "",
      sampleContent: "",
      autopilotEnabled: false,
    });
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

    prisma.generationJob.findUnique.mockResolvedValueOnce({
      id: "job2",
      shop: "test.myshopify.com",
      status: "queued",
      productIds: JSON.stringify(["gid://shopify/Product/2"]),
      contentTypes: "description",
      autoPublish: false,
      totalProducts: 1,
    });
    // Per-iteration cancellation checks read status — report still-processing
    prisma.generationJob.findUnique.mockResolvedValue({ status: "processing" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: "test.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({
      shop: "test.myshopify.com",
      storeName: "Test",
      brandTone: "professional",
      targetAudience: "",
      keyDifferentiators: "",
      avoidPhrases: "",
      additionalNotes: "",
      targetKeywords: "",
      sampleContent: "",
      autopilotEnabled: false,
    });
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
      ([args]) => args.data?.failedProducts || args.data?.status === "complete",
    );
    expect(failUpdate).toBeTruthy();
  });

  it("documents that credit is NOT consumed when Shopify fetch fails (FIX 2 credit protection)", async () => {
    // New behavior after FIX 2: credit is consumed AFTER successful generation.
    // If Shopify fetch fails (429 exhausted), credit is NOT consumed — no charge to merchant.
    const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");
    const prisma = (await import("../../app/db.server.js")).default;

    mockFetch.mockResolvedValue(make429Response("1"));

    prisma.generationJob.findUnique.mockResolvedValueOnce({
      id: "job3",
      shop: "test3.myshopify.com",
      status: "queued",
      productIds: JSON.stringify(["gid://shopify/Product/3"]),
      contentTypes: "description",
      autoPublish: false,
      totalProducts: 1,
    });
    // Per-iteration cancellation checks read status — report still-processing
    prisma.generationJob.findUnique.mockResolvedValue({ status: "processing" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: "test3.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({
      shop: "test3.myshopify.com",
      storeName: "Test",
      brandTone: "professional",
      targetAudience: "",
      keyDifferentiators: "",
      avoidPhrases: "",
      additionalNotes: "",
      targetKeywords: "",
      sampleContent: "",
      autopilotEnabled: false,
    });
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

describe("P1-1: job cancellation is honoured mid-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("aborts the loop, generates nothing, and never overwrites the cancelled status", async () => {
    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");

    // Initial read: a queued 3-product job. Every subsequent status check:
    // the merchant has cancelled (status "failed").
    prisma.generationJob.findUnique
      .mockResolvedValueOnce({
        id: "jobC1",
        shop: "test.myshopify.com",
        status: "queued",
        productIds: JSON.stringify([
          "gid://shopify/Product/1",
          "gid://shopify/Product/2",
          "gid://shopify/Product/3",
        ]),
        contentTypes: "description",
        autoPublish: false,
        totalProducts: 3,
      })
      .mockResolvedValue({ status: "failed" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.generationJob.updateMany.mockResolvedValue({ count: 0 });
    prisma.session.findFirst.mockResolvedValue({ shop: "test.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({
      shop: "test.myshopify.com",
      storeName: "Test",
      brandTone: "professional",
      targetAudience: "",
      keyDifferentiators: "",
      avoidPhrases: "",
      additionalNotes: "",
      targetKeywords: "",
      sampleContent: "",
      autopilotEnabled: false,
    });
    prisma.generatedContent.findMany.mockResolvedValue([]);
    prisma.collectionVoice.findMany.mockResolvedValue([]);

    const processPromise = processBulkJob("jobC1");
    await vi.runAllTimersAsync();
    await processPromise;

    // No product was fetched or generated after cancellation
    expect(mockFetch).not.toHaveBeenCalled();
    expect(generateProductContent).not.toHaveBeenCalled();
    // The cancelled status was never overwritten to "complete" via update()
    const completeOverwrite = prisma.generationJob.update.mock.calls.find(
      ([args]) => args.data?.status === "complete",
    );
    expect(completeOverwrite).toBeUndefined();
    // And the guarded updateMany only targets still-processing rows
    const guardedCalls = prisma.generationJob.updateMany.mock.calls.filter(
      ([args]) => args.data?.status === "complete",
    );
    for (const [args] of guardedCalls) {
      expect(args.where.status).toBe("processing");
    }
  });
});

describe("enhance mode (mode: 'enhance')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  function mockCommonPrisma(prisma, job) {
    // First read returns the job; per-iteration cancellation checks then see
    // a still-processing status.
    prisma.generationJob.findUnique.mockResolvedValueOnce(job).mockResolvedValue({ status: "processing" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: job.shop, accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({
      shop: job.shop,
      storeName: "Test",
      brandTone: "professional",
      targetAudience: "",
      keyDifferentiators: "",
      avoidPhrases: "",
      additionalNotes: "",
      targetKeywords: "",
      sampleContent: "",
      autopilotEnabled: false,
    });
    prisma.generatedContent.findMany.mockResolvedValue([]);
    prisma.collectionVoice.findMany.mockResolvedValue([]);
    prisma.generatedContent.upsert.mockResolvedValue({});
  }

  it("uses enhanceExistingContent (not generateProductContent) and saves drafts", async () => {
    const productData = {
      id: "gid://shopify/Product/10",
      title: "Kettle",
      productType: "Kitchen",
      vendor: "Acme",
      description: "Old text",
      descriptionHtml: "<p>Old text</p>",
      seo: { title: "Old SEO", description: "Old meta" },
      featuredImage: null,
      images: { edges: [] },
      variants: { edges: [] },
      tags: [],
      collections: { edges: [] },
    };
    mockFetch.mockResolvedValue(makeJsonResponse({ data: { product: productData } }));

    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent, enhanceExistingContent } = await import("../../app/utils/ai.server.js");

    mockCommonPrisma(prisma, {
      id: "jobE1",
      shop: "test.myshopify.com",
      status: "queued",
      productIds: JSON.stringify(["gid://shopify/Product/10"]),
      contentTypes: "description,metaTitle,metaDescription",
      mode: "enhance",
      autoPublish: false,
      totalProducts: 1,
    });
    enhanceExistingContent.mockResolvedValue({
      description: "<p>Better text</p>",
      metaTitle: "Better",
      metaDescription: "Better meta",
    });

    const processPromise = processBulkJob("jobE1");
    await vi.runAllTimersAsync();
    await processPromise;

    expect(enhanceExistingContent).toHaveBeenCalledTimes(1);
    expect(generateProductContent).not.toHaveBeenCalled();
    // The existing description/SEO fields flow into the enhance call
    const [productArg, , typesArg] = enhanceExistingContent.mock.calls[0];
    expect(productArg.descriptionHtml).toBe("<p>Old text</p>");
    expect(productArg.seoTitle).toBe("Old SEO");
    expect(typesArg).toEqual(["description", "metaTitle", "metaDescription"]);
    // All three enhanced types saved as drafts
    expect(prisma.generatedContent.upsert).toHaveBeenCalledTimes(3);
    const statuses = prisma.generatedContent.upsert.mock.calls.map(([args]) => args.create.status);
    expect(statuses.every((s) => s === "draft")).toBe(true);
  });

  it("skips a product with no existing description WITHOUT consuming a credit", async () => {
    const productData = {
      id: "gid://shopify/Product/11",
      title: "Blank",
      productType: "",
      vendor: "",
      description: "",
      descriptionHtml: "",
      seo: {},
      featuredImage: null,
      images: { edges: [] },
      variants: { edges: [] },
      tags: [],
      collections: { edges: [] },
    };
    mockFetch.mockResolvedValue(makeJsonResponse({ data: { product: productData } }));

    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { enhanceExistingContent } = await import("../../app/utils/ai.server.js");
    const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");

    mockCommonPrisma(prisma, {
      id: "jobE2",
      shop: "test.myshopify.com",
      status: "queued",
      productIds: JSON.stringify(["gid://shopify/Product/11"]),
      contentTypes: "description",
      mode: "enhance",
      autoPublish: false,
      totalProducts: 1,
    });

    const processPromise = processBulkJob("jobE2");
    await vi.runAllTimersAsync();
    await processPromise;

    // No AI call, no credit consumed, product recorded as failed with a no-charge note
    expect(enhanceExistingContent).not.toHaveBeenCalled();
    expect(tryConsumeGeneration).not.toHaveBeenCalled();
    expect(prisma.generatedContent.upsert).not.toHaveBeenCalled();
    const updateCalls = prisma.generationJob.update.mock.calls;
    const failUpdate = updateCalls.find(([args]) => args.data?.failedProducts);
    expect(failUpdate).toBeTruthy();
    const errorLogUpdate = updateCalls.find(([args]) => typeof args.data?.errorLog === "string");
    expect(errorLogUpdate[0].data.errorLog).toContain("[NO CHARGE] No existing description to enhance");
  });

  it("still enhances meta when description is missing but meta types are selected", async () => {
    const productData = {
      id: "gid://shopify/Product/12",
      title: "NoDesc",
      productType: "",
      vendor: "",
      description: "",
      descriptionHtml: "",
      seo: { title: "T", description: "D" },
      featuredImage: null,
      images: { edges: [] },
      variants: { edges: [] },
      tags: [],
      collections: { edges: [] },
    };
    mockFetch.mockResolvedValue(makeJsonResponse({ data: { product: productData } }));

    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { enhanceExistingContent } = await import("../../app/utils/ai.server.js");

    mockCommonPrisma(prisma, {
      id: "jobE3",
      shop: "test.myshopify.com",
      status: "queued",
      productIds: JSON.stringify(["gid://shopify/Product/12"]),
      contentTypes: "description,metaTitle,metaDescription",
      mode: "enhance",
      autoPublish: false,
      totalProducts: 1,
    });
    enhanceExistingContent.mockResolvedValue({ metaTitle: "Better T", metaDescription: "Better D" });

    const processPromise = processBulkJob("jobE3");
    await vi.runAllTimersAsync();
    await processPromise;

    // description dropped from the type list; meta types still enhanced
    const [, , typesArg] = enhanceExistingContent.mock.calls[0];
    expect(typesArg).toEqual(["metaTitle", "metaDescription"]);
    expect(prisma.generatedContent.upsert).toHaveBeenCalledTimes(2);
  });
});

// ─── Phase 0 group 0.B — the bulk run costs the merchant only what it delivers ─

describe("item 4 — the model is never called without a credit to pay for it", () => {
  function baseJob(overrides = {}) {
    return {
      id: "jobQ",
      shop: "test.myshopify.com",
      status: "queued",
      productIds: JSON.stringify([
        "gid://shopify/Product/1",
        "gid://shopify/Product/2",
        "gid://shopify/Product/3",
      ]),
      contentTypes: "description",
      mode: "generate",
      autoPublish: false,
      totalProducts: 3,
      ...overrides,
    };
  }
  function primeJob(prisma, job) {
    prisma.generationJob.findUnique.mockResolvedValueOnce(job).mockResolvedValue({ status: "processing" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: job.shop, accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({
      shop: job.shop,
      storeName: "Test",
      brandTone: "professional",
    });
    prisma.generatedContent.findMany.mockResolvedValue([]);
    prisma.collectionVoice.findMany.mockResolvedValue([]);
    prisma.generatedContent.upsert.mockResolvedValue({});
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("stops before the first model call when the month is already spent, and records the skip", async () => {
    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");
    const { remainingGenerations, tryConsumeGeneration } = await import("../../app/utils/plans.server.js");

    primeJob(prisma, baseJob());
    remainingGenerations.mockResolvedValue(0);

    const p = processBulkJob("jobQ");
    await vi.runAllTimersAsync();
    await p;

    // The expensive call never happened, and no credit was taken.
    expect(generateProductContent).not.toHaveBeenCalled();
    expect(tryConsumeGeneration).not.toHaveBeenCalled();
    // All three products are recorded as skipped, in ONE write.
    const skipWrites = prisma.generationJob.update.mock.calls.filter(
      ([arg]) => arg?.data?.quotaSkipped?.increment !== undefined,
    );
    expect(skipWrites).toHaveLength(1);
    expect(skipWrites[0][0].data.quotaSkipped.increment).toBe(3);
  });

  it("runs what the quota covers, then stops and records only the remainder", async () => {
    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");
    const { remainingGenerations } = await import("../../app/utils/plans.server.js");

    primeJob(prisma, baseJob());
    mockFetch.mockResolvedValue(
      makeJsonResponse({
        data: {
          product: {
            id: "gid://shopify/Product/1",
            title: "T",
            productType: "",
            vendor: "",
            description: "d",
            descriptionHtml: "<p>d</p>",
            seo: {},
            featuredMedia: null,
            media: { edges: [] },
            variants: { edges: [] },
            tags: [],
            collections: { edges: [] },
          },
        },
      }),
    );
    generateProductContent.mockResolvedValue({ description: "<p>new</p>" });
    // One credit for the first product, none after it is spent.
    remainingGenerations.mockResolvedValueOnce(1).mockResolvedValue(0);

    const p = processBulkJob("jobQ");
    await vi.runAllTimersAsync();
    await p;

    expect(generateProductContent).toHaveBeenCalledTimes(1);
    const skipWrites = prisma.generationJob.update.mock.calls.filter(
      ([arg]) => arg?.data?.quotaSkipped?.increment !== undefined,
    );
    expect(skipWrites).toHaveLength(1);
    expect(skipWrites[0][0].data.quotaSkipped.increment).toBe(2);
  });
});

describe("item 6 — an empty completion is not charged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("does not consume a credit, and does not count the product as completed", async () => {
    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");
    const { tryConsumeGeneration, remainingGenerations } = await import("../../app/utils/plans.server.js");

    prisma.generationJob.findUnique
      .mockResolvedValueOnce({
        id: "jobEmpty",
        shop: "test.myshopify.com",
        status: "queued",
        productIds: JSON.stringify(["gid://shopify/Product/1"]),
        contentTypes: "description",
        mode: "generate",
        autoPublish: false,
        totalProducts: 1,
      })
      .mockResolvedValue({ status: "processing" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: "test.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({ shop: "test.myshopify.com", storeName: "T" });
    prisma.generatedContent.findMany.mockResolvedValue([]);
    prisma.collectionVoice.findMany.mockResolvedValue([]);
    remainingGenerations.mockResolvedValue(999);
    mockFetch.mockResolvedValue(
      makeJsonResponse({
        data: {
          product: {
            id: "gid://shopify/Product/1",
            title: "T",
            productType: "",
            vendor: "",
            description: "d",
            descriptionHtml: "<p>d</p>",
            seo: {},
            featuredMedia: null,
            media: { edges: [] },
            variants: { edges: [] },
            tags: [],
            collections: { edges: [] },
          },
        },
      }),
    );
    // The exact failure: the model answers, but nothing usable is extracted.
    generateProductContent.mockResolvedValue({});

    const p = processBulkJob("jobEmpty");
    await vi.runAllTimersAsync();
    await p;

    expect(tryConsumeGeneration).not.toHaveBeenCalled();
    expect(prisma.generatedContent.upsert).not.toHaveBeenCalled();
    // Counted as failed with a reason that says plainly it was not charged.
    const withErrorLog = prisma.generationJob.update.mock.calls
      .map(([arg]) => arg?.data?.errorLog)
      .filter(Boolean);
    expect(withErrorLog.join(" ")).toMatch(/\[NO CHARGE\]/);
    const failedWrites = prisma.generationJob.update.mock.calls.filter(
      ([arg]) => arg?.data?.failedProducts?.increment,
    );
    expect(failedWrites.length).toBeGreaterThan(0);
  });
});

describe("item 9 — auto-publish claims published only when Shopify accepted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  async function runAutoPublish(publishResponses) {
    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");
    const { remainingGenerations } = await import("../../app/utils/plans.server.js");

    prisma.generationJob.findUnique
      .mockResolvedValueOnce({
        id: "jobPub",
        shop: "test.myshopify.com",
        status: "queued",
        productIds: JSON.stringify(["gid://shopify/Product/1"]),
        contentTypes: "description",
        mode: "generate",
        autoPublish: true,
        totalProducts: 1,
      })
      .mockResolvedValue({ status: "processing" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: "test.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({ shop: "test.myshopify.com", storeName: "T" });
    prisma.generatedContent.findMany.mockResolvedValue([]);
    prisma.collectionVoice.findMany.mockResolvedValue([]);
    prisma.generatedContent.upsert.mockResolvedValue({});
    remainingGenerations.mockResolvedValue(999);
    generateProductContent.mockResolvedValue({ description: "<p>new</p>" });

    const product = {
      id: "gid://shopify/Product/1",
      title: "T",
      productType: "",
      vendor: "",
      description: "d",
      descriptionHtml: "<p>d</p>",
      seo: {},
      featuredMedia: null,
      media: { edges: [] },
      variants: { edges: [] },
      tags: [],
      collections: { edges: [] },
    };
    let publishCall = 0;
    mockFetch.mockImplementation(async (_url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.query.includes("query getProduct")) return makeJsonResponse({ data: { product } });
      if (body.query.includes("productUpdate")) {
        const r = publishResponses[Math.min(publishCall, publishResponses.length - 1)];
        publishCall++;
        return makeJsonResponse(r);
      }
      return makeJsonResponse({ data: {} });
    });

    // publishProductWithRetry schedules its backoff sleeps only as earlier
    // promises resolve, so one drain is not enough for the retrying paths.
    // publishProductWithRetry schedules its backoff sleeps only as earlier
    // fetch promises resolve, so draining "all timers" once (or in a tight
    // loop) returns while the chain is still between ticks. Advancing virtual
    // time in steps yields to the microtask queue between each step.
    const p = processBulkJob("jobPub");
    let settled = false;
    p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    for (let i = 0; i < 500 && !settled; i++) await vi.advanceTimersByTimeAsync(1000);
    await p;
    return prisma;
  }

  it("leaves the rows as drafts when Shopify throttles the update", async () => {
    const prisma = await runAutoPublish([
      { data: null, errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] },
    ]);
    // Saved as a draft…
    const savedStatuses = prisma.generatedContent.upsert.mock.calls.map(([a]) => a.update.status);
    expect(savedStatuses.every((s) => s === "draft")).toBe(true);
    // …and NEVER promoted, because Shopify never accepted the write.
    const promotions = prisma.generatedContent.updateMany.mock.calls.filter(
      ([a]) => a?.data?.status === "published",
    );
    expect(promotions).toHaveLength(0);
  }, 30000);

  it("leaves the rows as drafts on a top-level GraphQL error with data null", async () => {
    const prisma = await runAutoPublish([
      { data: null, errors: [{ message: "Field 'productUpdate' doesn't exist on type 'Mutation'" }] },
    ]);
    const promotions = prisma.generatedContent.updateMany.mock.calls.filter(
      ([a]) => a?.data?.status === "published",
    );
    expect(promotions).toHaveLength(0);
  }, 30000);

  it("promotes the rows to published when Shopify accepts AND echoes the content back", async () => {
    // Phase 4 item 4.2 — the mutation now returns the fields it wrote and the
    // helper compares them. `generateProductContent` is mocked to "<p>new</p>",
    // so an echo of the same value is a VERIFIED publish.
    const prisma = await runAutoPublish([
      {
        data: {
          productUpdate: {
            product: { id: "gid://shopify/Product/1", descriptionHtml: "<p>new</p>" },
            userErrors: [],
          },
        },
      },
    ]);
    const promotions = prisma.generatedContent.updateMany.mock.calls.filter(
      ([a]) => a?.data?.status === "published",
    );
    expect(promotions).toHaveLength(1);
    expect(promotions[0][0].data.verifiedAt).toBeInstanceOf(Date);
    expect(promotions[0][0].data.verifyNote).toBeNull();
  }, 30000);

  it("marks the rows published_unverified when Shopify stores something different", async () => {
    // Live, but not the content the merchant approved. The row must NOT read
    // as a clean publish, and it must NOT go back to draft either — going back
    // to draft would have the merchant republish content already on their
    // storefront.
    const prisma = await runAutoPublish([
      {
        data: {
          productUpdate: {
            product: { id: "gid://shopify/Product/1", descriptionHtml: "<p>something else entirely</p>" },
            userErrors: [],
          },
        },
      },
    ]);
    const clean = prisma.generatedContent.updateMany.mock.calls.filter(
      ([a]) => a?.data?.status === "published",
    );
    const unverified = prisma.generatedContent.updateMany.mock.calls.filter(
      ([a]) => a?.data?.status === "published_unverified",
    );
    expect(clean).toHaveLength(0);
    expect(unverified).toHaveLength(1);
    expect(unverified[0][0].data.verifyNote).toBeTruthy();
    expect(unverified[0][0].data.verifiedAt).toBeNull();
  }, 30000);

  it("AUTOPILOT NEVER PUBLISHES a draft the quality gate flagged", async () => {
    // The whole point of item 4.1. Pushing content the gate rejected onto a
    // live storefront without anybody reading it is the worst thing this app
    // could do, and it is the failure a merchant would leave a one-star review
    // about.
    gateContent.mockResolvedValueOnce({
      content: { description: "<p>new</p>" },
      assessment: { pass: false, reasons: ["dup"] },
      regenerated: true,
      note: "It is almost the same as a description already written for another product.",
    });
    const prisma = await runAutoPublish([
      { data: { productUpdate: { product: { id: "gid://shopify/Product/1" }, userErrors: [] } } },
    ]);

    // Nothing was published, in any status.
    const promoted = prisma.generatedContent.updateMany.mock.calls.filter(([a]) =>
      String(a?.data?.status || "").startsWith("published"),
    );
    expect(promoted).toHaveLength(0);
  }, 30000);

  it("still SAVES the flagged draft, with the reason — the merchant paid for it", async () => {
    gateContent.mockResolvedValueOnce({
      content: { description: "<p>new</p>" },
      assessment: { pass: false, reasons: ["dup"] },
      regenerated: true,
      note: "It is almost the same as a description already written for another product.",
    });
    const prisma = await runAutoPublish([
      { data: { productUpdate: { product: { id: "gid://shopify/Product/1" }, userErrors: [] } } },
    ]);
    const saved = prisma.generatedContent.upsert.mock.calls.find(
      ([a]) => a?.create?.contentType === "description",
    );
    expect(saved).toBeTruthy();
    expect(saved[0].create.qualityNote).toMatch(/almost the same/);
    expect(saved[0].create.status).toBe("draft");
  }, 30000);

  it("marks them unverified when Shopify echoes back nothing to compare", async () => {
    const prisma = await runAutoPublish([
      { data: { productUpdate: { product: { id: "gid://shopify/Product/1" }, userErrors: [] } } },
    ]);
    const unverified = prisma.generatedContent.updateMany.mock.calls.filter(
      ([a]) => a?.data?.status === "published_unverified",
    );
    expect(unverified).toHaveLength(1);
  }, 30000);
});

// ─── Phase 0 group 0.C — a job that was killed can finish, and one whose shop
// ─── has gone stops immediately.

describe("item 12 — a killed job resumes without redoing paid work", () => {
  const IDS = ["gid://shopify/Product/1", "gid://shopify/Product/2", "gid://shopify/Product/3"];
  const STARTED = new Date("2026-09-09T10:00:00Z");

  function primeInterrupted(prisma, { status, alreadyWritten }) {
    prisma.generationJob.findUnique
      .mockResolvedValueOnce({
        id: "jobR",
        shop: "test.myshopify.com",
        status,
        productIds: JSON.stringify(IDS),
        contentTypes: "description",
        mode: "generate",
        autoPublish: false,
        totalProducts: 3,
        startedAt: STARTED,
        createdAt: STARTED,
      })
      .mockResolvedValue({ status: "processing" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.session.findFirst.mockResolvedValue({ shop: "test.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({ shop: "test.myshopify.com", storeName: "T" });
    prisma.collectionVoice.findMany.mockResolvedValue([]);
    prisma.generatedContent.upsert.mockResolvedValue({});
    // First call is the bulk processor's "recent titles" read; the resume then
    // asks which products already have content.
    prisma.generatedContent.findMany
      .mockResolvedValueOnce(alreadyWritten.map((productId) => ({ productId })))
      .mockResolvedValue([]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(
      makeJsonResponse({
        data: {
          product: {
            id: "gid://shopify/Product/1",
            title: "T",
            productType: "",
            vendor: "",
            description: "d",
            descriptionHtml: "<p>d</p>",
            seo: {},
            featuredMedia: null,
            media: { edges: [] },
            variants: { edges: [] },
            tags: [],
            collections: { edges: [] },
          },
        },
      }),
    );
  });

  it("a BullMQ RETRY picks up a row still marked processing, and skips what was already written", async () => {
    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");
    generateProductContent.mockResolvedValue({ description: "<p>new</p>" });

    primeInterrupted(prisma, { status: "processing", alreadyWritten: [IDS[0]] });

    const p = processBulkJob("jobR", { attemptsMade: 1, extendLock: vi.fn() }, "token");
    let settled = false;
    p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    for (let i = 0; i < 200 && !settled; i++) await vi.advanceTimersByTimeAsync(1000);
    await p;

    // Product 1 was already paid for; only 2 and 3 are generated again.
    expect(generateProductContent).toHaveBeenCalledTimes(2);
    // The original start time is preserved — it is the resume boundary.
    const statusWrite = prisma.generationJob.update.mock.calls[0][0].data;
    expect(statusWrite.status).toBe("processing");
    expect(statusWrite.startedAt).toBeUndefined();
  }, 30000);

  it("a FIRST attempt still refuses a row that is already processing", async () => {
    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");

    primeInterrupted(prisma, { status: "processing", alreadyWritten: [] });

    await processBulkJob("jobR", { attemptsMade: 0 }, "token");
    expect(generateProductContent).not.toHaveBeenCalled();
    expect(prisma.generationJob.update).not.toHaveBeenCalled();
  });

  it("a normal queued job still stamps a fresh start time", async () => {
    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { generateProductContent } = await import("../../app/utils/ai.server.js");
    generateProductContent.mockResolvedValue({ description: "<p>new</p>" });

    primeInterrupted(prisma, { status: "queued", alreadyWritten: [] });

    const p = processBulkJob("jobR");
    let settled = false;
    p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    for (let i = 0; i < 200 && !settled; i++) await vi.advanceTimersByTimeAsync(1000);
    await p;

    expect(prisma.generationJob.update.mock.calls[0][0].data.startedAt).toBeInstanceOf(Date);
  }, 30000);
});

describe("item 14 — a run whose shop is gone stops instead of grinding through 401s", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("ends the job on the first unrefreshable 401, without touching later products", async () => {
    const { processBulkJob } = await import("../../app/utils/bulkProcessor.server.js");
    const prisma = (await import("../../app/db.server.js")).default;
    const { refreshOfflineToken } = await import("../../app/utils/offlineToken.server.js");
    const { generateProductContent } = await import("../../app/utils/ai.server.js");

    prisma.generationJob.findUnique
      .mockResolvedValueOnce({
        id: "jobGone",
        shop: "test.myshopify.com",
        status: "queued",
        productIds: JSON.stringify([
          "gid://shopify/Product/1",
          "gid://shopify/Product/2",
          "gid://shopify/Product/3",
        ]),
        contentTypes: "description",
        mode: "generate",
        autoPublish: false,
        totalProducts: 3,
      })
      .mockResolvedValue({ status: "processing" });
    prisma.generationJob.update.mockResolvedValue({});
    prisma.generationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.session.findFirst.mockResolvedValue({ shop: "test.myshopify.com", accessToken: "tok" });
    prisma.brandVoice.findUnique.mockResolvedValue({ shop: "test.myshopify.com", storeName: "T" });
    prisma.generatedContent.findMany.mockResolvedValue([]);
    prisma.collectionVoice.findMany.mockResolvedValue([]);

    // Shopify rejects the token and the refresh cannot recover it — the app is gone.
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({}),
    });
    refreshOfflineToken.mockResolvedValue(null);

    const p = processBulkJob("jobGone");
    let settled = false;
    p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    for (let i = 0; i < 200 && !settled; i++) await vi.advanceTimersByTimeAsync(1000);
    await p;

    // One refresh attempt, not four per product across three products.
    expect(refreshOfflineToken).toHaveBeenCalledTimes(1);
    expect(generateProductContent).not.toHaveBeenCalled();
    const failWrite = prisma.generationJob.updateMany.mock.calls.find(([a]) => a?.data?.status === "failed");
    expect(failWrite).toBeTruthy();
    expect(failWrite[0].where).toMatchObject({ id: "jobGone", status: "processing" });
    expect(failWrite[0].data.errorLog).toMatch(/uninstalled/i);
  }, 30000);
});
