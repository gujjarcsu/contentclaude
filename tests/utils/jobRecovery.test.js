/**
 * Phase 0 group 0.C — jobs that never finish (items 12, 13, 15, 16).
 *
 * The failure this group removes: a merchant presses "Optimise store", a deploy
 * happens, and the job sits at "Processing…" forever — while still counting
 * against the per-shop in-flight cap, so the merchant cannot start another one
 * either, and the only escape was the next server restart.
 *
 * Four independent causes, one per item:
 *  12  the row was left "processing", BullMQ's stall retry no-opped on it,
 *      recovery ran only at boot, and it keyed on startedAt so a long healthy
 *      run looked identical to a dead one;
 *  13  a Redis outage made "Start job" hang instead of falling back inline;
 *  15  connection_limit=1 serialised the web process behind worker transactions;
 *  16  getOrCreatePlan raced itself on a fresh install, and the cache ran its
 *      supplier twice when Redis misbehaved.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    generationJob: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

process.env.NODE_ENV = process.env.NODE_ENV || "test";
const { recoverStuckJobs } = await import("../../app/utils/startup.server.js");

const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.generationJob.findMany.mockResolvedValue([]);
  prisma.generationJob.updateMany.mockResolvedValue({ count: 0 });
});

describe("item 12 — stuck-job recovery is driven by silence, not by age", () => {
  it("selects on updatedAt, so a long but healthy run is left alone", async () => {
    await recoverStuckJobs();
    const where = prisma.generationJob.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("processing");
    expect(where).toHaveProperty("updatedAt");
    expect(where).not.toHaveProperty("startedAt");
  });

  it("uses a threshold long enough to survive the worst single product", async () => {
    await recoverStuckJobs();
    const cutoff = prisma.generationJob.findMany.mock.calls[0][0].where.updatedAt.lt;
    const ageMs = Date.now() - cutoff.getTime();
    // A product can pause 65 s on an open circuit breaker plus retries.
    expect(ageMs).toBeGreaterThan(5 * 60 * 1000);
    expect(ageMs).toBeLessThanOrEqual(20 * 60 * 1000);
  });

  it("re-checks the condition in the write, so a job that woke up is not killed", async () => {
    prisma.generationJob.findMany.mockResolvedValue([
      { id: "j1", shop: "s.myshopify.com", startedAt: new Date(), updatedAt: new Date(0) },
    ]);
    prisma.generationJob.updateMany.mockResolvedValue({ count: 1 });
    await recoverStuckJobs();
    const where = prisma.generationJob.updateMany.mock.calls[0][0].where;
    expect(where.status).toBe("processing");
    expect(where.updatedAt.lt).toBeInstanceOf(Date);
    expect(where.id.in).toEqual(["j1"]);
  });

  it("tells the merchant what to do next, and that a resume will not re-charge", async () => {
    prisma.generationJob.findMany.mockResolvedValue([
      { id: "j1", shop: "s.myshopify.com", startedAt: new Date(), updatedAt: new Date(0) },
    ]);
    prisma.generationJob.updateMany.mockResolvedValue({ count: 1 });
    await recoverStuckJobs();
    const log = JSON.parse(prisma.generationJob.updateMany.mock.calls[0][0].data.errorLog);
    expect(log[0].error).toMatch(/resume/i);
    expect(log[0].error).toMatch(/not be charged again/i);
  });

  it("writes nothing when nothing is stuck", async () => {
    expect(await recoverStuckJobs()).toBe(0);
    expect(prisma.generationJob.updateMany).not.toHaveBeenCalled();
  });

  it("runs on an interval, not only at boot (source guard)", () => {
    const src = code("app/utils/startup.server.js");
    expect(src).toMatch(/setInterval\(/);
    expect(src).toMatch(/RECOVERY_INTERVAL_MS/);
    // and must not hold the process open during shutdown
    expect(src).toMatch(/unref/);
  });
});

describe("item 12 — the processor and the queue can actually recover a job", () => {
  it("the processor accepts a retry of a row that is already processing", () => {
    const src = code("app/utils/bulkProcessor.server.js");
    expect(src).toMatch(/attemptsMade/);
    expect(src).toMatch(/isRetry && job\.status === "processing"/);
    // and skips what the killed attempt already wrote
    expect(src).toMatch(/alreadyDone/);
  });

  it("the worker marks the DB row failed once BullMQ has exhausted its retries", () => {
    const src = code("app/queues/generationQueue.server.js");
    const failedHandler = src.slice(src.indexOf('_worker.on("failed"'));
    expect(failedHandler).toMatch(/generationJob\.updateMany/);
    expect(failedHandler).toMatch(/status: "failed"/);
    expect(failedHandler).toMatch(/attemptsMade/); // only when genuinely finished
  });

  it("the lock is short enough that a killed job is retried promptly", () => {
    const src = code("app/queues/generationQueue.server.js");
    expect(src).toMatch(/lockDuration:\s*5 \* 60 \* 1000/);
  });

  it("fly.toml gives the drain time to finish before SIGKILL", () => {
    expect(readFileSync("fly.toml", "utf8")).toMatch(/kill_timeout\s*=\s*"60s"/);
  });
});

describe("item 13 — a Redis outage fails fast instead of hanging Start job", () => {
  const src = code("app/queues/generationQueue.server.js");

  it("disables the ioredis offline queue and unlimited retries on the enqueue connection", () => {
    expect(src).toMatch(/enableOfflineQueue:\s*false/);
    expect(src).toMatch(/maxRetriesPerRequest:\s*1/);
  });

  it("bounds the enqueue itself, so the inline fallback is reachable", () => {
    expect(src).toMatch(/ENQUEUE_TIMEOUT_MS/);
    expect(src).toMatch(/Promise\.race\(/);
    // the fallback that this makes reachable
    expect(src).toMatch(/processing job inline/);
  });
});

describe("item 15 — the connection budget", () => {
  const src = code("app/utils/startup.server.js");

  it("no longer gates the check on the hostname containing neon.tech", () => {
    expect(src).not.toMatch(/neon\.tech/);
  });

  it("warns about a pool of one rather than recommending it", () => {
    expect(src).toMatch(/connection_limit=\$\{RECOMMENDED_CONNECTION_LIMIT\}/);
    expect(src).not.toMatch(/set connection_limit=1/);
  });

  it("recommends a workable number of connections", async () => {
    const { RECOMMENDED_CONNECTION_LIMIT } = await import("../../app/utils/startup.server.js");
    expect(RECOMMENDED_CONNECTION_LIMIT).toBeGreaterThanOrEqual(3);
  });
});

describe("item 16 — no self-race on first load, no double-run of a supplier", () => {
  it("getOrCreatePlan is a single upsert, not findUnique-then-create", () => {
    const src = code("app/utils/plans.server.js");
    const fn = src.slice(src.indexOf("export async function getOrCreatePlan"), src.indexOf("export async function getMonthlyUsageCount"));
    expect(fn).toMatch(/plan\.upsert\(/);
    expect(fn).not.toMatch(/plan\.create\(/);
  });

  it("the cache runs its supplier exactly once when Redis fails mid-way", () => {
    const src = code("app/utils/cache.server.js");
    const fn = src.slice(src.indexOf("export async function getCache"), src.indexOf("export async function setCache"));
    // The supplier must not sit inside a try whose catch falls through to a
    // second supplier call.
    const supplierCalls = fn.match(/await supplier\(\)/g) ?? [];
    expect(supplierCalls.length).toBe(2); // one Redis path, one in-process path
    expect(fn).toMatch(/readFailed/); // the two paths are mutually exclusive
    expect(fn).toMatch(/value still returned/); // a failed write does not re-run it
  });
});
