/**
 * Phase 1 item 10 — `/app/products`, Generate All and Generate Selected.
 *
 * Generate All is the button with the largest blast radius in the app: one
 * click, the entire catalogue, every one of them billed. It is also the button
 * a merchant presses on their first afternoon, before they have any sense of
 * what a generation costs them.
 *
 * So the questions worth pinning are the ones about restraint. How many does it
 * actually take when quota is short. What happens when Shopify hands back half
 * a catalogue. Whether a selection of nothing quietly becomes a selection of
 * everything.
 *
 * Note this action returns plain objects rather than `Response.json(...)`,
 * unlike `/app/optimize` — so the assertions read `res.error` directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  prisma,
  authenticate,
  enqueue,
  checkEntitlement,
  remainingGenerations,
  graphql,
  publishesWithoutReview,
} = vi.hoisted(() => ({
  prisma: { generationJob: { create: vi.fn(async ({ data }) => ({ id: "job-1", ...data })) } },
  authenticate: { admin: vi.fn() },
  enqueue: vi.fn(async () => {}),
  checkEntitlement: vi.fn(async () => ({ allowed: true })),
  remainingGenerations: vi.fn(async () => 1000),
  graphql: vi.fn(),
  publishesWithoutReview: vi.fn(async () => false),
}));

// Phase 4 item 6 — the catalogue reads now back off on THROTTLED, which means
// real 1s/2s/4s sleeps. These tests are about THIS module's behaviour, not the
// backoff, so the shared helper keeps its real logic with retries disabled. The
// backoff itself is tested with fake timers in tests/utils/shopifyQuery.test.js.
vi.mock("../../app/utils/shopifyQuery.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/shopifyQuery.server.js");
  return {
    ...actual,
    shopifyQuery: (graphql, query, variables, opts = {}) =>
      actual.shopifyQuery(graphql, query, variables, { ...opts, maxRetries: 0 }),
  };
});

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate }));
vi.mock("../../app/utils/publishSetting.server.js", () => ({ publishesWithoutReview }));
vi.mock("../../app/queues/generationQueue.server.js", () => ({ enqueueGenerationJob: enqueue }));
vi.mock("../../app/utils/metrics.server.js", () => ({ getContentMetrics: vi.fn(async () => ({})) }));
vi.mock("../../app/utils/plans.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/plans.server.js");
  return { ...actual, checkEntitlement, remainingGenerations };
});

const { action } = await import("../../app/routes/app.products.jsx");

const SHOP = "big-catalogue.myshopify.com";
const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `gid://shopify/Product/${from + i}`);

const page = (list, hasNextPage = false) => ({
  json: async () => ({
    data: {
      products: {
        edges: list.map((id) => ({ node: { id } })),
        pageInfo: { hasNextPage, endCursor: "c" },
      },
    },
  }),
});

const post = (fields) =>
  action({
    request: new Request("https://app.test/app/products", {
      method: "POST",
      body: new URLSearchParams({ bulk_description: "true", ...fields }),
    }),
  });

const generateAll = (fields = {}) => post({ actionType: "generateAll", ...fields });
const createdJob = () => prisma.generationJob.create.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP }, admin: { graphql } });
  checkEntitlement.mockResolvedValue({ allowed: true });
  remainingGenerations.mockResolvedValue(1000);
  publishesWithoutReview.mockResolvedValue(false);
  graphql.mockResolvedValue(page(ids(10)));
});

describe("Generate All is bounded by the quota, not by the catalogue", () => {
  it("takes only what the merchant has left, and records the rest as skipped", async () => {
    graphql.mockResolvedValue(page(ids(400)));
    remainingGenerations.mockResolvedValue(25);

    const res = await generateAll();

    expect(res.status).toBe(302); // off to /app/jobs
    const job = createdJob();
    expect(job.totalProducts).toBe(25);
    expect(JSON.parse(job.productIds)).toHaveLength(25);
    expect(job.quotaSkipped).toBe(375);
  });

  it("runs nothing and says so when the quota is gone", async () => {
    graphql.mockResolvedValue(page(ids(40)));
    remainingGenerations.mockResolvedValue(0);

    const res = await generateAll();

    expect(res.limitReached).toBe(true);
    expect(res.error).toMatch(/no generations left/i);
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("a store with no products is told so, not given an empty job", async () => {
    graphql.mockResolvedValue(page([]));
    const res = await generateAll();
    expect(res.error).toMatch(/no products found/i);
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });

  it("walks every page of the catalogue", async () => {
    graphql
      .mockResolvedValueOnce(page(ids(250), true))
      .mockResolvedValueOnce(page(ids(250, 251), true))
      .mockResolvedValueOnce(page(ids(30, 501), false));

    await generateAll();

    expect(createdJob().totalProducts).toBe(530);
    expect(graphql).toHaveBeenCalledTimes(3);
  });
});

describe("Generate Selected", () => {
  it("runs exactly the products the merchant ticked", async () => {
    const picked = ["gid://shopify/Product/7", "gid://shopify/Product/9"];

    const res = await post({ selectedIds: JSON.stringify(picked) });

    expect(res.status).toBe(302);
    expect(JSON.parse(createdJob().productIds)).toEqual(picked);
    // A selected run must never go and fetch the catalogue.
    expect(graphql).not.toHaveBeenCalled();
  });

  it("an empty selection runs nothing — it does not fall back to everything", async () => {
    // The failure this prevents: a merchant clicks Generate with nothing
    // ticked and their whole catalogue is billed.
    const res = await post({ selectedIds: "[]" });
    expect(res.error).toMatch(/no products selected/i);
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });

  it("a corrupt selection is rejected rather than guessed at", async () => {
    const res = await post({ selectedIds: "{not json" });
    expect(res.error).toMatch(/invalid selection data/i);
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });

  it("a selection that is not a list is treated as empty, not iterated", async () => {
    const res = await post({ selectedIds: JSON.stringify({ id: "x" }) });
    expect(res.error).toMatch(/no products selected/i);
  });

  it("is sliced to quota exactly as Generate All is", async () => {
    remainingGenerations.mockResolvedValue(2);

    await post({ selectedIds: JSON.stringify(ids(6)) });

    const job = createdJob();
    expect(job.totalProducts).toBe(2);
    expect(job.quotaSkipped).toBe(4);
  });
});

describe("the gates in front of both", () => {
  it("no content type selected stops before anything else happens", async () => {
    const res = await action({
      request: new Request("https://app.test/app/products", {
        method: "POST",
        body: new URLSearchParams({ actionType: "generateAll" }),
      }),
    });

    expect(res.error).toMatch(/at least one content type/i);
    expect(checkEntitlement).not.toHaveBeenCalled();
    expect(graphql).not.toHaveBeenCalled();
  });

  it("a plan without bulk jobs is told which plan it needs", async () => {
    checkEntitlement.mockResolvedValue({ allowed: false, requiredPlan: "Growth" });

    const res = await generateAll();

    expect(res.limitReached).toBe(true);
    expect(res.error).toMatch(/Growth plan/);
    expect(graphql).not.toHaveBeenCalled();
  });

  it("carries the merchant's SETTING onto the job, not a form field", async () => {
    // Phase 2 item 2.6 — auto-publish used to be a per-run checkbox here, and
    // this panel submitted with no confirmation at all. It is now one setting.
    publishesWithoutReview.mockResolvedValue(true);
    await generateAll();
    expect(createdJob().autoPublish).toBe(true);
  });

  it("ignores a submitted auto-publish field entirely", async () => {
    // The field is what the page last sent. If a stale form, a replayed
    // request or a crafted POST could still set it, the setting would not be
    // the source of truth and the listing's promise would not hold.
    publishesWithoutReview.mockResolvedValue(false);
    await generateAll({ bulk_autoPublish: "true", autoPublish: "true" });
    expect(createdJob().autoPublish).toBe(false);
  });

  it("defaults to off — publishing to a live store is opt-in", async () => {
    await generateAll();
    expect(createdJob().autoPublish).toBe(false);
  });
});

describe("when Shopify's catalogue call fails", () => {
  it("a first-page failure is an error, not an empty run", async () => {
    graphql.mockRejectedValue(new Error("503"));
    const res = await generateAll();
    expect(res.error).toMatch(/could not fetch your product list/i);
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });

  it("a mid-pagination failure runs what did arrive", async () => {
    graphql.mockResolvedValueOnce(page(ids(250), true)).mockRejectedValueOnce(new Error("timeout"));

    const res = await generateAll();

    expect(res.status).toBe(302);
    expect(createdJob().totalProducts).toBe(250);
  });

  it("a malformed first response is an error", async () => {
    graphql.mockResolvedValue({ json: async () => ({ data: {} }) });
    const res = await generateAll();
    expect(res.error).toMatch(/unexpected response/i);
  });
});

describe("the concurrent-job cap", () => {
  it("passes the queue's own explanation through", async () => {
    const msg = "You already have jobs running — please wait for them to finish, then try again.";
    enqueue.mockRejectedValue(new Error(msg));
    expect((await generateAll()).error).toBe(msg);
  });

  it("does not leak an infrastructure error to a merchant", async () => {
    enqueue.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.4:6379"));
    const res = await generateAll();
    expect(res.error).not.toMatch(/ECONNREFUSED/);
    expect(res.error).toMatch(/could not start the bulk job/i);
  });
});
