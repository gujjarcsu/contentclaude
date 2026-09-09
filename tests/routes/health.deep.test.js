/**
 * Phase 0 group 0.F — items 25 and 26.
 *
 * The owner was blind. `/api/health` answered "ok" while Redis was dead (the
 * cache silently falls back to memory), while the BullMQ worker was not running
 * at all, and while the AI circuit breaker was open — that is, while no merchant
 * could get a single generation. An uptime monitor pointed at it would have
 * reported 100% availability throughout. And Sentry was initialised lazily by a
 * `captureException` that existed in exactly two places in the whole app, so
 * almost nothing was ever reported.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { prisma, queueHealth, breaker } = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(async () => [{ "?column?": 1 }]),
    generationJob: { count: vi.fn(async () => 0) },
  },
  queueHealth: vi.fn(async () => ({ configured: true, workerRunning: true, counts: { wait: 0, active: 1, failed: 0 }, error: null })),
  breaker: vi.fn(() => ({ open: false, failures: 0, lastFailureAt: null })),
}));
vi.mock("../../app/db.server", () => ({ default: prisma }));
vi.mock("../../app/utils/cache.server", () => ({ getCache: vi.fn(async (k, supplier) => supplier()) }));
vi.mock("../../app/utils/logger.server", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/queues/generationQueue.server.js", () => ({ getQueueHealth: queueHealth }));
vi.mock("../../app/utils/ai.server.js", () => ({ getCircuitBreakerState: breaker }));

const { loader } = await import("../../app/routes/api.health.jsx");

const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const call = async (qs = "") => {
  const res = await loader({ request: new Request(`https://app.navaal.ai/api/health${qs}`) });
  return { res, body: await res.json() };
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = "production";
  process.env.REDIS_URL = "redis://localhost:6379";
  prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
  prisma.generationJob.count.mockResolvedValue(0);
  queueHealth.mockResolvedValue({ configured: true, workerRunning: true, counts: { wait: 0, active: 1, failed: 0 }, error: null });
  breaker.mockReturnValue({ open: false, failures: 0, lastFailureAt: null });
});

describe("item 26 — the shallow check stays cheap and quiet", () => {
  it("reports ok without leaking internals", async () => {
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toBeUndefined(); // production shallow response
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not probe the queue at all", async () => {
    await call();
    expect(queueHealth).not.toHaveBeenCalled();
  });

  it("503s when the database is unreachable, without echoing the error", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    const { res, body } = await call();
    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    expect(JSON.stringify(body)).not.toMatch(/10\.0\.0\.1|ECONNREFUSED/);
  });
});

describe("item 26 — the deep check sees what the shallow one cannot", () => {
  it("reports the queue, the worker, the jobs, the breaker and the build", async () => {
    const { res, body } = await call("?deep=1");
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.queue).toMatchObject({ configured: true, workerRunning: true });
    expect(body.checks.queue.counts).toMatchObject({ active: 1 });
    expect(body.checks.jobs).toMatchObject({ failedLast10Min: 0, stuckProcessing: 0 });
    expect(body.checks.aiCircuitBreaker).toMatchObject({ open: false });
    expect(body.checks).toHaveProperty("build");
  });

  it("503s when the worker is dead — the case the shallow check called ok", async () => {
    queueHealth.mockResolvedValue({ configured: true, workerRunning: false, counts: null, error: null });
    const { res, body } = await call("?deep=1");
    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.checks.queue.workerRunning).toBe(false);
  });

  it("503s when jobs have been stranded in processing", async () => {
    prisma.generationJob.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    const { res, body } = await call("?deep=1");
    expect(res.status).toBe(503);
    expect(body.checks.jobs.stuckProcessing).toBe(3);
  });

  it("is degraded, not down, when Redis is unreachable", async () => {
    const { getCache } = await import("../../app/utils/cache.server");
    getCache.mockRejectedValueOnce(new Error("redis down"));
    const { res, body } = await call("?deep=1");
    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.redis).toBe("degraded");
  });

  it("is degraded, not down, when the AI breaker is open (it closes itself)", async () => {
    breaker.mockReturnValue({ open: true, failures: 5, lastFailureAt: new Date().toISOString() });
    const { res, body } = await call("?deep=1");
    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.aiCircuitBreaker.open).toBe(true);
  });

  it("is degraded when jobs have failed recently but nothing is stranded", async () => {
    prisma.generationJob.count.mockResolvedValueOnce(4).mockResolvedValueOnce(0);
    const { res, body } = await call("?deep=1");
    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.jobs.failedLast10Min).toBe(4);
  });

  it("answers even when a probe hangs, rather than hanging itself", async () => {
    queueHealth.mockImplementation(() => new Promise(() => {}));
    // The queue probe has its own internal timeout; a probe that throws must not
    // take the endpoint down with it.
    queueHealth.mockRejectedValue(new Error("boom"));
    const { res, body } = await call("?deep=1");
    expect(res.status).toBe(200);
    expect(body.checks.queue).toMatchObject({ error: "unavailable" });
  });
});

describe("item 25 — errors actually reach Sentry now", () => {
  it("initialises eagerly at boot rather than on the first manual capture", () => {
    const src = code("app/utils/errorMonitoring.server.js");
    expect(src).toMatch(/export function initErrorMonitoring/);
    expect(code("app/utils/startup.server.js")).toMatch(/initErrorMonitoring\(\)/);
  });

  it("registers the global handlers that catch what nothing reports by hand", () => {
    const src = code("app/utils/errorMonitoring.server.js");
    expect(src).toMatch(/process\.on\("unhandledRejection"/);
    expect(src).toMatch(/process\.on\("uncaughtException"/);
    expect(code("app/utils/startup.server.js")).toMatch(/installProcessErrorHandlers\(\)/);
  });

  it("exports handleError, so every loader and action error is reported", () => {
    const src = code("app/entry.server.jsx");
    expect(src).toMatch(/export function handleError\(/);
    expect(src).toMatch(/captureException\(/);
    // A client that navigated away is not an error worth paging anyone about.
    expect(src).toMatch(/signal\?\.aborted/);
    // And the path is reported without the query string, which can carry a token.
    expect(src).toMatch(/u\.pathname/);
  });

  it("tags reports with the running build", () => {
    expect(code("app/utils/errorMonitoring.server.js")).toMatch(/release: process\.env\.GIT_SHA/);
  });
});
