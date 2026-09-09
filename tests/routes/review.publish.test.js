/**
 * Phase 1 item 10 — publishing from `/app/review`, and what happens when
 * Shopify throttles.
 *
 * A merchant selects forty drafts and presses Publish. Shopify's Admin API is
 * rate-limited, and a bulk publish is exactly the shape of request that gets
 * throttled. The behaviour that matters is what happens to the ones that did
 * not go through:
 *
 *   - they must NOT be marked published, or the merchant is told their content
 *     is live on a storefront where it is not;
 *   - they must stay drafts, so the merchant can simply press Publish again;
 *   - they must be counted and named in the response, not silently dropped.
 *
 * `publishProductWithRetry` already retries a 429 and a GraphQL THROTTLED with
 * backoff (covered in tests/utils/adminGraphql.publish.test.js). What was not
 * covered is what this route does with the give-up result, and that is where a
 * merchant would be lied to.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  prisma,
  authenticate,
  publishProductWithRetry,
  ensureFaqMetafieldDefinition,
  readMutationResult,
  graphql,
} = vi.hoisted(() => ({
  prisma: {
    generatedContent: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 1 })) },
    growthState: { findUnique: vi.fn(async () => ({ embedConfirmedAt: new Date() })) },
    $transaction: vi.fn(async (fn) => (typeof fn === "function" ? fn(prisma) : Promise.all(fn))),
  },
  authenticate: { admin: vi.fn() },
  publishProductWithRetry: vi.fn(),
  ensureFaqMetafieldDefinition: vi.fn(async (shop, fn) => fn?.()),
  readMutationResult: vi.fn(async () => ({ ok: true })),
  graphql: vi.fn(async () => ({ json: async () => ({ data: {} }) })),
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate, apiVersion: "2026-04" }));
vi.mock("../../app/utils/adminGraphql.server.js", () => ({
  publishProductWithRetry,
  readMutationResult,
}));
vi.mock("../../app/utils/seo.server.js", () => ({
  ensureFaqMetafieldDefinition,
  buildFaqSchemaMetafield: vi.fn(() => ({ namespace: "contentclaude", key: "faq_schema", value: "{}" })),
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { action } = await import("../../app/routes/app.review.jsx");

const SHOP = "reviewing-store.myshopify.com";
const P = (n) => `gid://shopify/Product/${n}`;

/** A draft row as the loader would have produced it. */
const draft = (productId, contentType = "description", content = "text") => ({
  productId,
  productTitle: `Product ${productId.split("/").pop()}`,
  contentType,
  content,
  status: "draft",
});

const ok = (productId) => ({ productId, ok: true });
const throttled = (productId) => ({
  productId,
  ok: false,
  throttled: true,
  error: "Shopify throttled this update — it stays a draft and can be retried.",
});

const publish = (approved, edits = {}) =>
  action({
    request: new Request("https://app.test/app/review", {
      method: "POST",
      body: new URLSearchParams({
        actionType: "publish",
        approved: JSON.stringify(approved),
        edits: JSON.stringify(edits),
      }),
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP }, admin: { graphql } });
  prisma.generatedContent.findMany.mockResolvedValue([draft(P(1)), draft(P(2))]);
  prisma.generatedContent.updateMany.mockResolvedValue({ count: 1 });
  prisma.growthState.findUnique.mockResolvedValue({ embedConfirmedAt: new Date() });
  publishProductWithRetry.mockImplementation(async (_g, productId) => ok(productId));
  ensureFaqMetafieldDefinition.mockImplementation(async (shop, fn) => fn?.());
  readMutationResult.mockResolvedValue({ ok: true });
});

describe("a throttled product is never reported as published", () => {
  it("counts it as failed and names it in the response", async () => {
    prisma.generatedContent.findMany.mockResolvedValue([draft(P(1)), draft(P(2))]);
    publishProductWithRetry.mockImplementation(async (_g, productId) =>
      productId === P(2) ? throttled(productId) : ok(productId),
    );

    const body = await (await publish([P(1), P(2)])).json();

    expect(body.success).toBe(true);
    expect(body.published).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].productId).toBe(P(2));
    // The merchant is told which product, by name, not by GID alone.
    expect(body.errors[0].productTitle).toBe("Product 2");
    expect(body.errors[0].error).toMatch(/throttled/i);
    expect(body.message).toMatch(/1 failed/);
  });

  it("leaves the throttled product as a draft, so Publish can simply be pressed again", async () => {
    prisma.generatedContent.findMany.mockResolvedValue([draft(P(1)), draft(P(2))]);
    publishProductWithRetry.mockImplementation(async (_g, productId) =>
      productId === P(2) ? throttled(productId) : ok(productId),
    );

    await publish([P(1), P(2)]);

    // Every updateMany that flips draft -> published must exclude the throttled id.
    const promotions = prisma.generatedContent.updateMany.mock.calls
      .map(([args]) => args)
      .filter((a) => a?.data?.status === "published");

    expect(promotions.length).toBeGreaterThan(0);
    for (const a of promotions) {
      const ids = a.where?.productId?.in ?? [];
      expect(ids).not.toContain(P(2));
      expect(ids).toContain(P(1));
    }
  });

  it("when everything is throttled, nothing is published at all", async () => {
    publishProductWithRetry.mockImplementation(async (_g, productId) => throttled(productId));

    const body = await (await publish([P(1), P(2)])).json();

    expect(body.published).toBe(0);
    expect(body.failed).toBe(2);
    const promotions = prisma.generatedContent.updateMany.mock.calls
      .map(([a]) => a)
      .filter((a) => a?.data?.status === "published" && (a.where?.productId?.in ?? []).length > 0);
    expect(promotions).toEqual([]);
  });

  it("a throttle does not abort the products that came after it", async () => {
    // The publish runs three at a time; one give-up must not take the batch.
    publishProductWithRetry.mockImplementation(async (_g, productId) =>
      productId === P(1) ? throttled(productId) : ok(productId),
    );
    prisma.generatedContent.findMany.mockResolvedValue([draft(P(1)), draft(P(2)), draft(P(3))]);

    const body = await (await publish([P(1), P(2), P(3)])).json();

    expect(body.published).toBe(2);
    expect(body.failed).toBe(1);
  });
});

describe("what the route refuses before it calls Shopify", () => {
  it("an empty approval list", async () => {
    const res = await publish([]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no products approved/i);
    expect(publishProductWithRetry).not.toHaveBeenCalled();
  });

  it("a corrupt submission", async () => {
    const res = await action({
      request: new Request("https://app.test/app/review", {
        method: "POST",
        body: new URLSearchParams({ actionType: "publish", approved: "{oops", edits: "{}" }),
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid submission data/i);
  });

  it("ids that are not products — a Collection GID cannot be published as a product", async () => {
    const res = await publish(["gid://shopify/Collection/5", 42, null]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no publishable products/i);
    expect(publishProductWithRetry).not.toHaveBeenCalled();
  });

  it("an unknown actionType does nothing", async () => {
    const res = await action({
      request: new Request("https://app.test/app/review", {
        method: "POST",
        body: new URLSearchParams({ actionType: "delete-everything" }),
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown action/i);
    expect(prisma.generatedContent.updateMany).not.toHaveBeenCalled();
  });
});

describe("the merchant's inline edits win over the stored draft", () => {
  it("sends the edited text to Shopify, not the generated text", async () => {
    prisma.generatedContent.findMany.mockResolvedValue([draft(P(1), "description", "the AI wrote this")]);

    await publish([P(1)], { [P(1)]: { description: "the merchant wrote this" } });

    const [, , input] = publishProductWithRetry.mock.calls[0];
    expect(input.descriptionHtml).toBe("the merchant wrote this");
  });

  it("persists the edit so the merchant's wording is what is stored", async () => {
    prisma.generatedContent.findMany.mockResolvedValue([draft(P(1), "description", "generated")]);

    await publish([P(1)], { [P(1)]: { description: "edited" } });

    const wroteEdit = prisma.generatedContent.updateMany.mock.calls.some(
      ([a]) => a?.data?.generatedContent === "edited",
    );
    expect(wroteEdit).toBe(true);
  });

  it("only persists edits for products that actually published", async () => {
    // Storing an edit against a product whose publish was throttled would
    // record the merchant's wording as live when it is not.
    prisma.generatedContent.findMany.mockResolvedValue([draft(P(1)), draft(P(2))]);
    publishProductWithRetry.mockImplementation(async (_g, productId) =>
      productId === P(2) ? throttled(productId) : ok(productId),
    );

    await publish([P(1), P(2)], {
      [P(1)]: { description: "kept" },
      [P(2)]: { description: "should not be stored as live" },
    });

    const stored = prisma.generatedContent.updateMany.mock.calls
      .map(([a]) => a?.data?.generatedContent)
      .filter(Boolean);
    expect(stored).toContain("kept");
    expect(stored).not.toContain("should not be stored as live");
  });
});

describe("a product whose FAQ metafield failed does not claim FAQ is live", () => {
  it("downgrades just the FAQ row back to draft", async () => {
    // The product itself published, so it is not a failure — but the FAQ
    // schema never reached Shopify. Showing "FAQ done" would be a lie, and the
    // next publish must retry it.
    prisma.generatedContent.findMany.mockResolvedValue([draft(P(1), "faq", '{"faq":[]}')]);
    publishProductWithRetry.mockImplementation(async (_g, productId) => ok(productId));
    // The product published; the metafieldsSet came back with userErrors.
    readMutationResult.mockResolvedValue({ ok: false, errorMessages: ["nope"] });

    const body = await (await publish([P(1)])).json();

    const downgrade = prisma.generatedContent.updateMany.mock.calls.find(
      ([a]) => a?.where?.contentType === "faq" && a?.data?.status === "draft",
    );
    expect(downgrade).toBeTruthy();
    expect(body.message).toMatch(/FAQ schema failed/i);
    expect(body.message).toMatch(/stays in drafts/i);
  });
});

describe("rejecting drafts", () => {
  it("marks them rejected and publishes nothing", async () => {
    const res = await action({
      request: new Request("https://app.test/app/review", {
        method: "POST",
        body: new URLSearchParams({ actionType: "reject", rejected: JSON.stringify([P(1)]) }),
      }),
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(publishProductWithRetry).not.toHaveBeenCalled();
    const rejected = prisma.generatedContent.updateMany.mock.calls.find(
      ([a]) => a?.data?.status === "rejected",
    );
    expect(rejected).toBeTruthy();
    expect(rejected[0].where.status).toBe("draft");
  });
});
