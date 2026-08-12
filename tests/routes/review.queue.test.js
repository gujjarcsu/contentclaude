/**
 * P0-2 regression tests — the Review & Publish queue must only contain
 * PRODUCT drafts. Collection drafts share the GeneratedContent table; without
 * a GID filter they enter the queue, get sent to productUpdate (which rejects
 * a Collection GID with "Invalid id"), and are permanently stuck.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
  BILLING_TEST: false,
  apiVersion: "2026-04",
}));

const findMany = vi.fn(() => Promise.resolve([]));
const count = vi.fn(() => Promise.resolve(0));

vi.mock("../../app/db.server", () => ({
  default: {
    generatedContent: {
      findMany: (...a) => findMany(...a),
      count: (...a) => count(...a),
      updateMany: vi.fn(() => Promise.resolve({})),
      groupBy: vi.fn(() => Promise.resolve([])),
    },
    growthState: { findUnique: vi.fn(() => Promise.resolve(null)) },
    $transaction: vi.fn(async (fn) => fn({ generatedContent: { updateMany: vi.fn() } })),
  },
}));

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })) },
}));

const PRODUCT_GID_PREFIX = "gid://shopify/Product/";

describe("P0-2: review queue excludes non-product drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  async function runLoader() {
    const { authenticate } = await import("../../app/shopify.server");
    authenticate.admin.mockResolvedValue({
      admin: { graphql: vi.fn(async () => ({ json: async () => ({ data: { nodes: [] } }) })) },
      session: { shop: "test.myshopify.com" },
    });
    const { loader } = await import("../../app/routes/app.review.jsx");
    return loader({ request: new Request("https://app.test/app/review") });
  }

  it("loader filters draft rows to Product GIDs only", async () => {
    await runLoader();
    expect(findMany).toHaveBeenCalled();
    const where = findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(PRODUCT_GID_PREFIX);
  });

  it("loader count uses the same Product-only filter so pagination agrees", async () => {
    await runLoader();
    expect(count).toHaveBeenCalled();
    const where = count.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(PRODUCT_GID_PREFIX);
  });

  it("publish action refuses to send a Collection GID to productUpdate", async () => {
    const { authenticate } = await import("../../app/shopify.server");
    const graphql = vi.fn(async () => ({
      json: async () => ({ data: { productUpdate: { product: { id: "x" }, userErrors: [] } } }),
      status: 200,
      headers: { get: () => null },
    }));
    authenticate.admin.mockResolvedValue({ admin: { graphql }, session: { shop: "test.myshopify.com" } });

    findMany.mockResolvedValue([
      { productId: "gid://shopify/Collection/999", contentType: "description", generatedContent: "<p>col</p>" },
    ]);

    const fd = new FormData();
    fd.append("actionType", "publish");
    fd.append("approved", JSON.stringify(["gid://shopify/Collection/999"]));
    fd.append("edits", "{}");
    const { action } = await import("../../app/routes/app.review.jsx");
    await action({ request: new Request("https://app.test/app/review", { method: "POST", body: fd }) });

    const productUpdateCalls = graphql.mock.calls.filter(([q]) => q.includes("productUpdate"));
    const sentCollectionGids = productUpdateCalls.filter(([, opts]) =>
      JSON.stringify(opts?.variables ?? {}).includes("gid://shopify/Collection/")
    );
    expect(sentCollectionGids.length).toBe(0);
  });
});
