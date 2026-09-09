/**
 * Phase 1 item 10 — `products/create` autopilot, and the bound on it.
 *
 * This is the only path in the app where a generation is spent without a
 * merchant clicking anything. A shop that imports its catalogue fires this
 * webhook once per product, thousands of times, in a burst. Every gate here
 * exists to bound that, and every one of them is a place where a mistake costs
 * the merchant money rather than showing them an error.
 *
 * The second property, which is not obvious: **every rejection is a 200.** A
 * non-2xx makes Shopify retry the delivery, and a retried autopilot webhook that
 * fails on quota would be retried again, and again. Answering "no" with a 500 is
 * how a single skipped product becomes a retry storm.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, verify, enqueue, canGenerate, invalidateLlmsTxt, entitlements } = vi.hoisted(() => ({
  prisma: {
    brandVoice: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    generationJob: { findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }) => ({ id: "job-1", ...data })) },
  },
  verify: vi.fn(),
  enqueue: vi.fn(async () => {}),
  canGenerate: vi.fn(async () => ({ allowed: true })),
  invalidateLlmsTxt: vi.fn(async () => {}),
  entitlements: vi.fn(() => ({ autopilot: true })),
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/webhookAuth.server.js", () => ({ verifyShopifyWebhook: verify }));
vi.mock("../../app/queues/generationQueue.server.js", () => ({ enqueueGenerationJob: enqueue }));
vi.mock("../../app/utils/billing-plans.js", () => ({ getEntitlements: entitlements }));
vi.mock("../../app/utils/plans.server.js", () => ({ canGenerate }));
vi.mock("../../app/utils/llms.server.js", () => ({ invalidateLlmsTxt }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { action } = await import("../../app/routes/webhooks.products.create.jsx");

const SHOP = "importing-store.myshopify.com";
const GID = "gid://shopify/Product/9001";

const deliver = () =>
  action({ request: new Request("https://app.test/webhooks/products/create", { method: "POST" }) });

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue({ shop: SHOP, payload: { admin_graphql_api_id: GID }, duplicate: false });
  prisma.brandVoice.findUnique.mockResolvedValue({
    autopilotEnabled: true,
    autopilotContentTypes: "description,metaTitle",
    autopilotAutoPublish: false,
  });
  prisma.plan.findUnique.mockResolvedValue({ planName: "growth" });
  prisma.generationJob.findFirst.mockResolvedValue(null);
  canGenerate.mockResolvedValue({ allowed: true });
  entitlements.mockReturnValue({ autopilot: true });
});

describe("the bound: one product, one job", () => {
  it("enqueues exactly one product for the product that was created", async () => {
    const res = await deliver();

    expect(res.status).toBe(200);
    const created = prisma.generationJob.create.mock.calls[0][0].data;
    expect(created.totalProducts).toBe(1);
    expect(JSON.parse(created.productIds)).toEqual([GID]);
    expect(created.shop).toBe(SHOP);
    expect(enqueue).toHaveBeenCalledWith("job-1");
  });

  it("carries the shop's own autopilot settings, not defaults", async () => {
    prisma.brandVoice.findUnique.mockResolvedValue({
      autopilotEnabled: true,
      autopilotContentTypes: "metaDescription",
      autopilotAutoPublish: true,
    });

    await deliver();

    const created = prisma.generationJob.create.mock.calls[0][0].data;
    expect(created.contentTypes).toBe("metaDescription");
    expect(created.autoPublish).toBe(true);
  });

  it("falls back to a named set of content types rather than generating everything", async () => {
    prisma.brandVoice.findUnique.mockResolvedValue({
      autopilotEnabled: true,
      autopilotContentTypes: null,
      autopilotAutoPublish: false,
    });

    await deliver();

    const types = prisma.generationJob.create.mock.calls[0][0].data.contentTypes.split(",");
    expect(types).toEqual(["description", "metaTitle", "metaDescription"]);
  });
});

describe("every reason to skip, and each one is a 200", () => {
  /** Run a scenario and assert nothing was enqueued and Shopify was told OK. */
  async function skips(setup) {
    setup();
    const res = await deliver();
    expect(res.status).toBe(200);
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    return res;
  }

  it("a redelivery of the same webhook does nothing", async () => {
    await skips(() =>
      verify.mockResolvedValue({ shop: SHOP, payload: { admin_graphql_api_id: GID }, duplicate: true }),
    );
    // And it stops before doing any other work at all.
    expect(invalidateLlmsTxt).not.toHaveBeenCalled();
  });

  it("autopilot switched off", async () => {
    await skips(() => prisma.brandVoice.findUnique.mockResolvedValue({ autopilotEnabled: false }));
  });

  it("a shop that has never opened the settings", async () => {
    await skips(() => prisma.brandVoice.findUnique.mockResolvedValue(null));
  });

  it("a payload with no product id", async () => {
    await skips(() => verify.mockResolvedValue({ shop: SHOP, payload: {}, duplicate: false }));
  });

  it("a plan without the autopilot entitlement", async () => {
    // Silently, deliberately: a Free shop that once turned autopilot on should
    // not be emailed by Shopify about a failing webhook.
    await skips(() => entitlements.mockReturnValue({ autopilot: false }));
  });

  it("a shop that has used its monthly quota", async () => {
    await skips(() => canGenerate.mockResolvedValue({ allowed: false, reason: "limit" }));
  });

  it("a job for this exact product is already queued", async () => {
    // Shopify redelivers on timeout. Without this the merchant is charged twice
    // for the same product.
    await skips(() => prisma.generationJob.findFirst.mockResolvedValue({ id: "already" }));
  });
});

describe("the catalogue index is dropped whether or not anything is generated", () => {
  it("invalidates llms.txt even when autopilot is off", async () => {
    prisma.brandVoice.findUnique.mockResolvedValue({ autopilotEnabled: false });
    await deliver();
    // The catalogue changed; the cached index is stale regardless of autopilot.
    expect(invalidateLlmsTxt).toHaveBeenCalledWith(SHOP);
  });

  it("invalidates llms.txt on a normal enqueue", async () => {
    await deliver();
    expect(invalidateLlmsTxt).toHaveBeenCalledWith(SHOP);
  });
});

describe("a failure to enqueue does not become a retry storm", () => {
  it("answers 200 when the concurrent-job cap rejects the enqueue", async () => {
    enqueue.mockRejectedValue(new Error("too many concurrent jobs for this shop"));

    const res = await deliver();

    // A non-2xx here makes Shopify retry, which enqueues again, which hits the
    // cap again. The job row exists and job recovery will pick it up.
    expect(res.status).toBe(200);
  });
});
