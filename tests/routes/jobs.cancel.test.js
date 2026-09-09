/**
 * Phase 1 item 10 — cancelling a job, and the tenancy check that guards it.
 *
 * `/app/jobs` takes a job id straight from a form post. The id is a cuid, which
 * is unguessable but not a secret — it appears in the merchant's own DOM, and it
 * is the only thing the request carries. Everything downstream therefore depends
 * on one comparison: `job.shop !== shop`. If that check is ever softened, one
 * merchant can cancel, resume or retry another merchant's run.
 *
 * That check is worth a test of its own precisely because it looks trivial.
 * Resume is covered by tests/routes/jobs.resume.test.js (Phase 0 item 7); this
 * covers cancel, the state machine around it, and the ownership boundary that
 * all three actions share.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, enqueue, authenticate } = vi.hoisted(() => ({
  prisma: {
    generationJob: {
      findUnique: vi.fn(),
      create: vi.fn(async ({ data }) => ({ id: "new-job", ...data })),
      update: vi.fn(async () => ({})),
    },
    generatedContent: { findMany: vi.fn(async () => []) },
  },
  enqueue: vi.fn(async () => {}),
  authenticate: { admin: vi.fn() },
}));

vi.mock("../../app/db.server", () => ({ default: prisma }));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/queues/generationQueue.server", () => ({ enqueueGenerationJob: enqueue }));
vi.mock("../../app/queues/generationQueue.server.js", () => ({ enqueueGenerationJob: enqueue }));
vi.mock("../../app/shopify.server", () => ({ authenticate, apiVersion: "2026-04" }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate, apiVersion: "2026-04" }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { action } = await import("../../app/routes/app.jobs.jsx");

const SHOP = "mine.myshopify.com";
const OTHER = "someone-else.myshopify.com";

const post = (fields) => {
  const body = new URLSearchParams(fields);
  return action({
    request: new Request("https://app.test/app/jobs", { method: "POST", body }),
  });
};

const jobRow = (over = {}) => ({
  id: "job-1",
  shop: SHOP,
  status: "processing",
  productIds: JSON.stringify(["p1", "p2", "p3"]),
  errorLog: null,
  completedProducts: 1,
  startedAt: new Date("2026-09-09T00:00:00Z"),
  createdAt: new Date("2026-09-09T00:00:00Z"),
  contentTypes: ["seo"],
  autoPublish: false,
  mode: "bulk",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP } });
  prisma.generationJob.findUnique.mockResolvedValue(jobRow());
  prisma.generatedContent.findMany.mockResolvedValue([]);
});

describe("cancelling a running job", () => {
  it("stops the job and records that the merchant stopped it", async () => {
    const res = await post({ jobId: "job-1", actionType: "cancel" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    const [{ where, data }] = prisma.generationJob.update.mock.calls[0];
    expect(where).toEqual({ id: "job-1" });
    expect(data.status).toBe("failed");
    expect(data.completedAt).toBeInstanceOf(Date);
    // The reason has to survive into the record: a merchant looking at this row
    // next week should see that they stopped it, not an unexplained failure.
    expect(JSON.parse(data.errorLog)[0].error).toMatch(/cancelled by merchant/i);
  });

  it("cancels a job that has not started yet", async () => {
    prisma.generationJob.findUnique.mockResolvedValue(jobRow({ status: "queued" }));
    const res = await post({ jobId: "job-1", actionType: "cancel" });
    expect(res.status).toBe(200);
    expect(prisma.generationJob.update).toHaveBeenCalled();
  });

  it("never enqueues anything on a cancel", async () => {
    await post({ jobId: "job-1", actionType: "cancel" });
    expect(enqueue).not.toHaveBeenCalled();
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });
});

describe("a job that is already over cannot be cancelled", () => {
  for (const status of ["completed", "failed"]) {
    it(`refuses to cancel a ${status} job, and does not touch it`, async () => {
      prisma.generationJob.findUnique.mockResolvedValue(jobRow({ status }));

      const res = await post({ jobId: "job-1", actionType: "cancel" });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/queued or processing/i);
      // Rewriting a completed job to "failed" would destroy the record of a run
      // that actually succeeded.
      expect(prisma.generationJob.update).not.toHaveBeenCalled();
    });
  }
});

describe("one merchant cannot reach another merchant's job", () => {
  // The only thing standing between two tenants here is `job.shop !== shop`.
  const attacks = [
    ["cancel", (u, c) => u.length === 0 && c.length === 0],
    ["resume", (u, c) => u.length === 0 && c.length === 0],
    ["retryFailed", (u, c) => u.length === 0 && c.length === 0],
  ];

  for (const [actionType, untouched] of attacks) {
    it(`${actionType}: a job owned by another shop is 404, and nothing is written`, async () => {
      prisma.generationJob.findUnique.mockResolvedValue(jobRow({ shop: OTHER, status: "processing" }));

      const res = await post({ jobId: "job-1", actionType });

      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/not found/i);
      expect(
        untouched(prisma.generationJob.update.mock.calls, prisma.generationJob.create.mock.calls),
      ).toBe(true);
      expect(enqueue).not.toHaveBeenCalled();
    });
  }

  it("answers 404 rather than 403 — an id that exists is not confirmed to a stranger", async () => {
    prisma.generationJob.findUnique.mockResolvedValue(jobRow({ shop: OTHER }));
    expect((await post({ jobId: "job-1", actionType: "cancel" })).status).toBe(404);
  });

  it("a job id that does not exist is the same 404", async () => {
    prisma.generationJob.findUnique.mockResolvedValue(null);
    const res = await post({ jobId: "nope", actionType: "cancel" });
    expect(res.status).toBe(404);
    expect(prisma.generationJob.update).not.toHaveBeenCalled();
  });
});

describe("the default action", () => {
  it("a post with no actionType resumes rather than doing something destructive", async () => {
    // The form omits actionType on the resume button. If the default were
    // "cancel", a resume click would end the job.
    prisma.generatedContent.findMany.mockResolvedValue([{ productId: "p1" }]);

    await post({ jobId: "job-1" });

    expect(prisma.generationJob.create).toHaveBeenCalled();
    const created = prisma.generationJob.create.mock.calls[0][0].data;
    expect(JSON.parse(created.productIds)).toEqual(["p2", "p3"]);
    expect(enqueue).toHaveBeenCalled();
  });
});
