/**
 * Phase 1 item 10 — `/api/jobs-status`, the endpoint the admin polls.
 *
 * Two things about it are load-bearing and neither is obvious.
 *
 * The first is the swallowed auth failure. `authenticate.admin` THROWS A
 * REDIRECT to the login form on any transient auth miss. This endpoint is
 * fetched in the background by the layout's ticker, and React Router follows a
 * fetcher redirect — so one transient miss would yank the whole embedded app
 * out from under a merchant mid-sentence and show them a login form. It must
 * answer with an empty payload instead and let the next real navigation
 * re-authenticate.
 *
 * The second is the shape. The ticker reads `count` and `pct` directly, so a
 * missing field is a crash in the admin, and a divide-by-zero on an empty job
 * list is a NaN rendered to a merchant.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, authenticate } = vi.hoisted(() => ({
  prisma: { generationJob: { findMany: vi.fn(async () => []) } },
  authenticate: { admin: vi.fn(async () => ({ session: { shop: "s.myshopify.com" } })) },
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate }));

const { loader } = await import("../../app/routes/api.jobs-status.jsx");
const req = () => new Request("https://app.test/api/jobs-status");

const job = (over = {}) => ({
  id: "j1",
  status: "processing",
  totalProducts: 10,
  completedProducts: 4,
  contentTypes: ["seo"],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: "s.myshopify.com" } });
  prisma.generationJob.findMany.mockResolvedValue([]);
});

describe("a background poll never throws the merchant out of the app", () => {
  it("an auth redirect becomes an empty payload, not a redirect", async () => {
    // This is exactly what authenticate.admin does on a transient miss.
    authenticate.admin.mockRejectedValue(
      new Response(null, { status: 302, headers: { location: "/auth/login" } }),
    );

    const res = await loader({ request: req() });

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    await expect(res.json()).resolves.toEqual({
      count: 0,
      totalProducts: 0,
      completedProducts: 0,
      pct: 0,
      jobs: [],
    });
  });

  it("any auth error at all is swallowed, not just a redirect", async () => {
    authenticate.admin.mockRejectedValue(new Error("session store unreachable"));
    const res = await loader({ request: req() });
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(0);
  });

  it("does not query the database when authentication failed", async () => {
    authenticate.admin.mockRejectedValue(new Error("nope"));
    await loader({ request: req() });
    expect(prisma.generationJob.findMany).not.toHaveBeenCalled();
  });
});

describe("what it reports", () => {
  it("sums progress across every active job", async () => {
    prisma.generationJob.findMany.mockResolvedValue([
      job({ id: "a", totalProducts: 10, completedProducts: 4 }),
      job({ id: "b", totalProducts: 10, completedProducts: 1 }),
    ]);

    const body = await (await loader({ request: req() })).json();

    expect(body.count).toBe(2);
    expect(body.totalProducts).toBe(20);
    expect(body.completedProducts).toBe(5);
    expect(body.pct).toBe(25);
  });

  it("reports 0% rather than NaN when there is nothing to do", async () => {
    // totalProducts of zero is a real state — a job created for a filtered set
    // that matched nothing — and `completed / 0` renders to a merchant as NaN%.
    prisma.generationJob.findMany.mockResolvedValue([job({ totalProducts: 0, completedProducts: 0 })]);
    const body = await (await loader({ request: req() })).json();
    expect(body.pct).toBe(0);
    expect(Number.isNaN(body.pct)).toBe(false);
  });

  it("rounds to a whole percent", async () => {
    prisma.generationJob.findMany.mockResolvedValue([job({ totalProducts: 3, completedProducts: 1 })]);
    expect((await (await loader({ request: req() })).json()).pct).toBe(33);
  });

  it("asks only for this shop's queued and processing jobs", async () => {
    await loader({ request: req() });
    const args = prisma.generationJob.findMany.mock.calls[0][0];
    expect(args.where.shop).toBe("s.myshopify.com");
    expect(args.where.status.in.sort()).toEqual(["processing", "queued"]);
  });

  it("is bounded — a shop with a hundred jobs does not return a hundred", async () => {
    // The endpoint is polled; an unbounded query here is a slow endpoint that
    // gets slower the more a merchant uses the app.
    const args = (await loader({ request: req() }), prisma.generationJob.findMany.mock.calls[0][0]);
    expect(args.take).toBeLessThanOrEqual(5);
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("returns every field the ticker reads", async () => {
    prisma.generationJob.findMany.mockResolvedValue([job()]);
    const body = await (await loader({ request: req() })).json();
    for (const k of ["count", "totalProducts", "completedProducts", "pct", "jobs"]) {
      expect(body).toHaveProperty(k);
    }
    expect(body.jobs[0]).toHaveProperty("status");
  });
});
