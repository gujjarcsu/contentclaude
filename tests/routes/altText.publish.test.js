/**
 * P0-1 regression tests — image alt text must actually reach Shopify, and the
 * UI must never be told "success" when the mutation failed.
 *
 * The original bug: the action used `productImageUpdate` (removed from the
 * Admin API in 2024-10; the app pins 2026-04), so every call failed at the
 * TOP LEVEL of the GraphQL response. The code only read
 * `data.productImageUpdate.userErrors`, which is `[]` when data is null —
 * so a 100%-failed operation was recorded and displayed as a success.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
  BILLING_TEST: false,
  apiVersion: "2026-04",
}));

vi.mock("../../app/db.server", () => ({
  default: {
    generatedContent: {
      findMany: vi.fn(() => Promise.resolve([])),
      findUnique: vi.fn(() => Promise.resolve(null)),
      upsert: vi.fn(() => Promise.resolve({})),
      updateMany: vi.fn(() => Promise.resolve({})),
    },
    brandVoice: { findUnique: vi.fn(() => Promise.resolve(null)) },
    contentVersion: { findMany: vi.fn(() => Promise.resolve([])) },
    contentTemplate: { findMany: vi.fn(() => Promise.resolve([])), create: vi.fn() },
    growthState: { findUnique: vi.fn(() => Promise.resolve(null)) },
  },
}));

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
}));

vi.mock("../../app/utils/plans.server.js", () => ({
  getOrCreatePlan: vi.fn(() => Promise.resolve({ planName: "free", monthlyLimit: 25 })),
  tryConsumeGeneration: vi.fn(() => Promise.resolve({ allowed: true })),
  checkEntitlement: vi.fn(() => Promise.resolve({ allowed: true })),
  refundGeneration: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../app/utils/rateLimit.server.js", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true })),
}));

vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn((key, fn) => fn()),
}));

vi.mock("../../app/utils/contentVersion.server.js", () => ({
  snapshotAndPrune: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../app/utils/ai.server.js", () => ({
  generateProductContent: vi.fn(() => Promise.resolve({})),
  generateAltText: vi.fn(() => Promise.resolve("A clear product photo")),
  enhanceExistingContent: vi.fn(() => Promise.resolve({})),
  generateSocialContent: vi.fn(() => Promise.resolve({})),
}));

vi.mock("../../app/utils/contentScorer.server.js", () => ({
  scoreContent: vi.fn(() => ({ score: 80 })),
}));

function altTextRequest() {
  const fd = new FormData();
  fd.append("actionType", "generate");
  fd.append("gen_altText", "true");
  return new Request("https://app.test/app/products/123", { method: "POST", body: fd });
}

// Product with two media images, as the loader/action should now query them
const PRODUCT_WITH_MEDIA = {
  title: "Test Kettle",
  productType: "Kitchen",
  vendor: "Acme",
  description: "old",
  descriptionHtml: "<p>old</p>",
  seo: { title: "", description: "" },
  featuredImage: { url: "https://cdn.shopify.com/a.jpg" },
  images: { edges: [
    { node: { id: "gid://shopify/ProductImage/1", url: "https://cdn.shopify.com/a.jpg" } },
    { node: { id: "gid://shopify/ProductImage/2", url: "https://cdn.shopify.com/b.jpg" } },
  ] },
  media: { edges: [
    { node: { id: "gid://shopify/MediaImage/11", mediaContentType: "IMAGE", image: { url: "https://cdn.shopify.com/a.jpg", altText: "" } } },
    { node: { id: "gid://shopify/MediaImage/12", mediaContentType: "IMAGE", image: { url: "https://cdn.shopify.com/b.jpg", altText: "" } } },
  ] },
  variants: { edges: [{ node: { title: "Default Title", price: "10" } }] },
  tags: [],
};

async function runAltTextAction(graphqlImpl) {
  const { authenticate } = await import("../../app/shopify.server");
  const graphql = vi.fn(graphqlImpl);
  authenticate.admin.mockResolvedValue({
    admin: { graphql },
    session: { shop: "test.myshopify.com" },
  });
  const { action } = await import("../../app/routes/app.products_.$id.jsx");
  const result = await action({ request: altTextRequest(), params: { id: "123" } });
  return { result, graphql };
}

const jsonResponse = (body) => ({ json: async () => body, status: 200, headers: { get: () => null } });

describe("P0-1: alt text publish honesty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT report success when the alt-text mutation fails at the GraphQL top level", async () => {
    const { result } = await runAltTextAction(async (query) => {
      if (query.includes("query getProduct")) return jsonResponse({ data: { product: PRODUCT_WITH_MEDIA } });
      // Top-level error, data null — exactly what a removed mutation returns
      return jsonResponse({ data: null, errors: [{ message: "Field 'productImageUpdate' doesn't exist on type 'Mutation'" }] });
    });

    expect(result.altTextResults.length).toBeGreaterThan(0);
    // Every image failed — every result row must carry an error
    expect(result.altTextResults.every((r) => r.error)).toBe(true);
    // And the summary must not claim any image was applied
    expect(result.message).not.toMatch(/applied to [1-9]/i);
    expect(result.altTextApplied ?? 0).toBe(0);
  });

  it("uses a mutation that exists in Admin API 2026-04 (not productImageUpdate)", async () => {
    const { graphql } = await runAltTextAction(async (query) => {
      if (query.includes("query getProduct")) return jsonResponse({ data: { product: PRODUCT_WITH_MEDIA } });
      return jsonResponse({ data: { productUpdateMedia: { media: [{ id: "gid://shopify/MediaImage/11", alt: "x" }], mediaUserErrors: [] } } });
    });
    const mutationCalls = graphql.mock.calls.filter(([q]) => q.includes("mutation"));
    expect(mutationCalls.length).toBeGreaterThan(0);
    for (const [q] of mutationCalls) {
      expect(q).not.toContain("productImageUpdate");
    }
  });

  it("targets MediaImage IDs, not legacy ProductImage IDs", async () => {
    const { graphql } = await runAltTextAction(async (query) => {
      if (query.includes("query getProduct")) return jsonResponse({ data: { product: PRODUCT_WITH_MEDIA } });
      return jsonResponse({ data: { productUpdateMedia: { media: [{ id: "gid://shopify/MediaImage/11", alt: "x" }], mediaUserErrors: [] } } });
    });
    const mutationCalls = graphql.mock.calls.filter(([q]) => q.includes("mutation"));
    const sentIds = mutationCalls.flatMap(([, opts]) => JSON.stringify(opts?.variables ?? {}).match(/gid:\/\/shopify\/\w+Image\/\d+/g) ?? []);
    expect(sentIds.length).toBeGreaterThan(0);
    for (const id of sentIds) {
      expect(id).toContain("gid://shopify/MediaImage/");
    }
  });
});
