/**
 * Phase 1 item 10 — `/app/optimize`, the action that decides how much work a
 * merchant is about to be charged for.
 *
 * The number this action picks IS the bill. Take one product too many and a
 * merchant on 25 generations a month is billed for 26; take too few and they
 * paid for capacity they never got. Everything below the entitlement gate is
 * arithmetic on somebody's money, and it was previously covered only by a test
 * that grepped the source for the string `sliceToQuota(`.
 *
 * Also asserted here: what happens when Shopify's product list comes back
 * broken halfway through. A merchant with 4,000 products who loses page 12
 * should get the 2,750 products that did arrive, not an error.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, authenticate, enqueue, checkEntitlement, remainingGenerations, graphql } = vi.hoisted(
  () => ({
    prisma: {
      $queryRaw: vi.fn(async () => []),
      generationJob: { create: vi.fn(async ({ data }) => ({ id: "job-1", ...data })) },
    },
    authenticate: { admin: vi.fn() },
    enqueue: vi.fn(async () => {}),
    checkEntitlement: vi.fn(async () => ({ allowed: true })),
    remainingGenerations: vi.fn(async () => 100),
    graphql: vi.fn(),
  }),
);

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate }));
vi.mock("../../app/queues/generationQueue.server.js", () => ({ enqueueGenerationJob: enqueue }));
vi.mock("../../app/utils/cache.server.js", () => ({ getCache: vi.fn(async (k, fn) => fn()) }));
vi.mock("../../app/utils/plans.server.js", async () => {
  // sliceToQuota is the real thing — it is the arithmetic under test.
  const actual = await vi.importActual("../../app/utils/plans.server.js");
  return { ...actual, checkEntitlement, remainingGenerations };
});

const { action } = await import("../../app/routes/app.optimize.jsx");

const SHOP = "optimising-store.myshopify.com";

/** A Shopify products page containing `n` products, none of which have content. */
const page = (ids, hasNextPage = false) => ({
  json: async () => ({
    data: {
      products: {
        edges: ids.map((id) => ({ node: { id, description: "an existing description" } })),
        pageInfo: { hasNextPage, endCursor: "cursor" },
      },
    },
  }),
});

const ids = (n, from = 1) =>
  Array.from({ length: n }, (_, i) => `gid://shopify/Product/${from + i}`);

const post = (fields = {}) =>
  action({
    request: new Request("https://app.test/app/optimize", {
      method: "POST",
      body: new URLSearchParams({ description: "true", ...fields }),
    }),
  });

const createdJob = () => prisma.generationJob.create.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP }, admin: { graphql } });
  checkEntitlement.mockResolvedValue({ allowed: true });
  remainingGenerations.mockResolvedValue(100);
  prisma.$queryRaw.mockResolvedValue([]);
  graphql.mockResolvedValue(page(ids(10)));
});

describe("the run is sliced to what the merchant has left", () => {
  it("takes exactly the remaining quota when there is more work than quota", async () => {
    graphql.mockResolvedValue(page(ids(50)));
    remainingGenerations.mockResolvedValue(7);

    const res = await post();

    // 302 to the jobs page — the run started.
    expect(res.status).toBe(302);
    const job = createdJob();
    expect(job.totalProducts).toBe(7);
    expect(JSON.parse(job.productIds)).toHaveLength(7);
    // And the 43 that did not fit are recorded, not forgotten.
    expect(job.quotaSkipped).toBe(43);
  });

  it("takes everything when quota is larger than the work", async () => {
    graphql.mockResolvedValue(page(ids(10)));
    remainingGenerations.mockResolvedValue(500);

    await post();

    const job = createdJob();
    expect(job.totalProducts).toBe(10);
    expect(job.quotaSkipped).toBe(0);
  });

  it("takes the first N, in order, rather than an arbitrary N", async () => {
    graphql.mockResolvedValue(page(ids(5)));
    remainingGenerations.mockResolvedValue(2);

    await post();

    expect(JSON.parse(createdJob().productIds)).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/2",
    ]);
  });

  it("starts nothing at all when the quota is spent, and says how many are waiting", async () => {
    graphql.mockResolvedValue(page(ids(12)));
    remainingGenerations.mockResolvedValue(0);

    const res = await post();
    const body = await res.json();

    expect(prisma.generationJob.create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(body.limitReached).toBe(true);
    expect(body.error).toMatch(/12 products are waiting/);
  });

  it("treats an unknown remaining count as zero, never as unlimited", async () => {
    // remainingGenerations returns 0 for an inactive plan, but a non-finite
    // value arriving here must not be read as "no limit" — that would run the
    // whole catalogue for free.
    graphql.mockResolvedValue(page(ids(30)));
    remainingGenerations.mockResolvedValue(undefined);

    await post();

    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });
});

describe("the entitlement gate comes first", () => {
  it("a plan without bulk jobs is told to upgrade, and no products are fetched", async () => {
    checkEntitlement.mockResolvedValue({ allowed: false, requiredPlan: "Growth" });

    const body = await (await post()).json();

    expect(body.limitReached).toBe(true);
    expect(body.error).toMatch(/requires the Growth plan/i);
    // Not one Shopify call, not one row.
    expect(graphql).not.toHaveBeenCalled();
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });

  it("refuses a submission with no content types selected", async () => {
    const res = await action({
      request: new Request("https://app.test/app/optimize", {
        method: "POST",
        body: new URLSearchParams({}),
      }),
    });
    expect((await res.json()).error).toMatch(/at least one content type/i);
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });
});

describe("when Shopify's product list is unavailable", () => {
  it("a failure on the FIRST page is an error, not an empty run", async () => {
    graphql.mockRejectedValue(new Error("502 from Shopify"));

    const res = await post();

    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/could not fetch your product list/i);
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });

  it("a failure PART WAY through runs what did arrive", async () => {
    // A merchant with thousands of products should not lose the whole run
    // because page nine timed out.
    graphql
      .mockResolvedValueOnce(page(ids(3), true))
      .mockRejectedValueOnce(new Error("timeout on page 2"));

    const res = await post();

    expect(res.status).toBe(302);
    expect(createdJob().totalProducts).toBe(3);
  });

  it("a malformed response with nothing collected is an error, not a silent no-op", async () => {
    graphql.mockResolvedValue({ json: async () => ({ data: null }) });

    const res = await post();

    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/unexpected response/i);
  });
});

describe("what the run is asked to do", () => {
  it("enhance mode never asks for FAQ content", async () => {
    // FAQ has no "existing text to improve", so it is dropped rather than
    // generated from nothing under a label that says enhance.
    await post({ mode: "enhance", faq: "true", description: "true" });

    expect(createdJob().contentTypes.split(",")).not.toContain("faq");
  });

  it("generate mode keeps FAQ", async () => {
    await post({ mode: "generate", faq: "true", description: "true" });
    expect(createdJob().contentTypes.split(",")).toContain("faq");
  });

  it("records the mode on the job so the worker does the right thing", async () => {
    await post({ mode: "enhance" });
    expect(createdJob().mode).toBe("enhance");
  });

  it("an unrecognised mode falls back to generate rather than to nothing", async () => {
    await post({ mode: "sideways" });
    expect(createdJob().mode).toBe("generate");
  });
});

describe("the concurrent-job cap", () => {
  it("passes the queue's own message through instead of a generic failure", async () => {
    const capMessage = "You already have jobs running — please wait for them to finish, then try again.";
    enqueue.mockRejectedValue(new Error(capMessage));

    const body = await (await post()).json();

    expect(body.error).toBe(capMessage);
  });

  it("hides an internal error behind something a merchant can act on", async () => {
    enqueue.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.4:6379"));
    const body = await (await post()).json();
    expect(body.error).not.toMatch(/ECONNREFUSED/);
    expect(body.error).toMatch(/please try again/i);
  });
});
