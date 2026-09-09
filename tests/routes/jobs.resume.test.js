/**
 * Phase 0 item 7 — "Resume job" must not re-run work that already succeeded.
 *
 * The old resume was `allIds.slice(job.completedProducts)`, which ignores
 * failedProducts entirely. In a run over 5 products where #2 and #4 failed,
 * completedProducts is 3, so the resume restarted at index 3 — regenerating #4
 * (correct) AND #5 (already done, and charged again). The bigger the failure
 * count, the more of the catalogue is re-billed.
 *
 * Every successful product leaves a GeneratedContent row touched after the run
 * started, so those rows — not a counter — are the record of what is done.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, enqueue } = vi.hoisted(() => ({
  prisma: {
    generationJob: { findUnique: vi.fn(), create: vi.fn(async ({ data }) => ({ id: "new-job", ...data })), update: vi.fn(async () => ({})) },
    generatedContent: { findMany: vi.fn(async () => []) },
  },
  enqueue: vi.fn(async () => {}),
}));
vi.mock("../../app/db.server", () => ({ default: prisma }));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/queues/generationQueue.server", () => ({ enqueueGenerationJob: enqueue }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const authenticate = { admin: vi.fn() };
vi.mock("../../app/shopify.server", () => ({ authenticate, apiVersion: "2026-04" }));

const SHOP = "s.myshopify.com";
const P = (n) => `gid://shopify/Product/${n}`;
const STARTED = new Date("2026-09-09T10:00:00Z");

function request(fields) {
  const body = new URLSearchParams(fields);
  return new Request("https://app.navaal.ai/app/jobs", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

async function resume(jobRow, doneProductIds) {
  prisma.generationJob.findUnique.mockResolvedValue(jobRow);
  prisma.generatedContent.findMany.mockResolvedValue(doneProductIds.map((productId) => ({ productId })));
  const { action } = await import("../../app/routes/app.jobs.jsx");
  const res = await action({ request: request({ jobId: jobRow.id, actionType: "resume" }) });
  return { res, created: prisma.generationJob.create.mock.calls[0]?.[0]?.data };
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP } });
});

const FIVE_PRODUCT_JOB = {
  id: "job1",
  shop: SHOP,
  status: "failed",
  productIds: JSON.stringify([P(1), P(2), P(3), P(4), P(5)]),
  contentTypes: "description",
  mode: "generate",
  autoPublish: false,
  completedProducts: 3,
  failedProducts: 2,
  startedAt: STARTED,
  createdAt: STARTED,
};

describe("item 7 — resume is driven by what was written, not by a counter", () => {
  it("re-runs exactly the products with no content, including ones the counter would have skipped", async () => {
    // #1, #3 and #5 succeeded; #2 and #4 failed. The counter (3) would have
    // resumed at index 3 → [#4, #5], re-billing #5.
    const { created } = await resume(FIVE_PRODUCT_JOB, [P(1), P(3), P(5)]);
    expect(JSON.parse(created.productIds)).toEqual([P(2), P(4)]);
    expect(created.totalProducts).toBe(2);
  });

  it("re-runs nothing when every product already has content", async () => {
    prisma.generationJob.findUnique.mockResolvedValue(FIVE_PRODUCT_JOB);
    prisma.generatedContent.findMany.mockResolvedValue([P(1), P(2), P(3), P(4), P(5)].map((productId) => ({ productId })));
    const { action } = await import("../../app/routes/app.jobs.jsx");
    const res = await action({ request: request({ jobId: "job1", actionType: "resume" }) });
    expect(res.status).toBe(400);
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });

  it("re-runs everything when the job died before writing anything", async () => {
    const { created } = await resume(FIVE_PRODUCT_JOB, []);
    expect(JSON.parse(created.productIds)).toHaveLength(5);
  });

  it("only counts content written since the run began", async () => {
    const { created } = await resume(FIVE_PRODUCT_JOB, [P(2)]);
    // The query must be bounded by the run's start, not the whole history.
    const where = prisma.generatedContent.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ shop: SHOP });
    expect(where.updatedAt.gte).toEqual(STARTED);
    expect(JSON.parse(created.productIds)).toEqual([P(1), P(3), P(4), P(5)]);
  });

  it("falls back to createdAt for a job that never recorded a start time", async () => {
    const created = new Date("2026-09-08T00:00:00Z");
    await resume({ ...FIVE_PRODUCT_JOB, startedAt: null, createdAt: created }, [P(1)]);
    expect(prisma.generatedContent.findMany.mock.calls[0][0].where.updatedAt.gte).toEqual(created);
  });

  it("carries the original job settings onto the resumed job", async () => {
    const { created } = await resume({ ...FIVE_PRODUCT_JOB, mode: "enhance", autoPublish: true }, [P(1)]);
    expect(created).toMatchObject({ shop: SHOP, contentTypes: "description", mode: "enhance", autoPublish: true, status: "queued" });
    expect(enqueue).toHaveBeenCalledWith("new-job");
  });

  it("retryFailed still replays exactly the logged failures", async () => {
    prisma.generationJob.findUnique.mockResolvedValue({
      ...FIVE_PRODUCT_JOB,
      errorLog: JSON.stringify([{ productId: P(2), error: "boom" }, { productId: "N/A", error: "x" }]),
    });
    const { action } = await import("../../app/routes/app.jobs.jsx");
    await action({ request: request({ jobId: "job1", actionType: "retryFailed" }) });
    expect(JSON.parse(prisma.generationJob.create.mock.calls[0][0].data.productIds)).toEqual([P(2)]);
  });
});
