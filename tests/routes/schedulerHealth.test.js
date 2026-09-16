/**
 * Phase 16, false green #33 — a scheduled job that throws on every tick must
 * stop the deep health check from saying the worker is fine.
 *
 * It did not, for weeks. `weekly report threw` sixty times an hour while
 * `/api/health?deep=1` reported `worker running` and `jobs.failedLast10Min: 0`.
 * Both numbers were correct and neither could ever have been anything else: the
 * queue probe asks BullMQ whether a worker is attached, the jobs probe counts
 * rows in `GenerationJob`, and a tick that dies during `import()` reaches
 * neither. The job was 100% dead and looked exactly like a job that was idle.
 *
 * These cases fail on the code as it stood, because nothing in it recorded a
 * scheduler tick at all.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, queueHealth, breaker, redis, store } = vi.hoisted(() => {
  const store = new Map();
  return {
    store,
    prisma: { $queryRaw: vi.fn(async () => [{ ok: 1 }]), generationJob: { count: vi.fn(async () => 0) } },
    queueHealth: vi.fn(async () => ({ configured: true, workerRunning: true, counts: { wait: 0, active: 1, failed: 0 }, error: null })),
    breaker: vi.fn(() => ({ open: false, failures: 0, lastFailureAt: null })),
    redis: {
      hget: vi.fn(async (_k, f) => store.get(f) ?? null),
      hset: vi.fn(async (_k, f, v) => void store.set(f, v)),
      hdel: vi.fn(async (_k, f) => void store.delete(f)),
      hgetall: vi.fn(async () => Object.fromEntries(store)),
      expire: vi.fn(async () => 1),
    },
  };
});

vi.mock("../../app/db.server", () => ({ default: prisma }));
vi.mock("../../app/utils/cache.server", () => ({
  getCache: vi.fn(async (k, supplier) => supplier()),
  getRedis: vi.fn(async () => redis),
}));
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (k, supplier) => supplier()),
  getRedis: vi.fn(async () => redis),
}));
vi.mock("../../app/utils/logger.server", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/schemaDrift.server.js", () => ({ checkSchemaDrift: vi.fn(async () => ({ ok: true, missing: [], checked: 210 })) }));
vi.mock("../../app/queues/generationQueue.server.js", () => ({ getQueueHealth: queueHealth }));
vi.mock("../../app/utils/ai.server.js", () => ({ getCircuitBreakerState: breaker }));

const { loader } = await import("../../app/routes/api.health.jsx");
const { recordJobFailure, readSchedulerHealth, runScheduled } = await import("../../app/utils/schedulerHealth.server.js");
const { schedulerVerdict, failureRecord, DEGRADED_AFTER_CONSECUTIVE, UNHEALTHY_AFTER_CONSECUTIVE } = await import("../../app/utils/schedulerHealth.js");

const deep = async () => {
  const res = await loader({ request: new Request("https://app.navaal.ai/api/health?deep=1") });
  return { res, body: await res.json() };
};

/** The real production error, by shape: a TypeError with a code and a path in its message. */
const importError = () =>
  Object.assign(new TypeError('Module "file:///app/app/i18n/locales/de.json" needs an import attribute of "type: json"'), {
    code: "ERR_IMPORT_ATTRIBUTE_MISSING",
  });

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  process.env.NODE_ENV = "production";
  process.env.REDIS_URL = "redis://localhost:6379";
  prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
  prisma.generationJob.count.mockResolvedValue(0);
  queueHealth.mockResolvedValue({ configured: true, workerRunning: true, counts: { wait: 0, active: 1, failed: 0 }, error: null });
  breaker.mockReturnValue({ open: false, failures: 0, lastFailureAt: null });
});

describe("the verdict, without any I/O", () => {
  it("one or two failures is not yet a verdict", () => {
    expect(schedulerVerdict({ weeklyReport: { consecutive: 1 } })).toMatchObject({ degraded: false, unhealthy: false });
    expect(schedulerVerdict({ weeklyReport: { consecutive: 2 } })).toMatchObject({ degraded: false, unhealthy: false });
  });

  it("three ticks in a row is past coincidence", () => {
    const v = schedulerVerdict({ weeklyReport: { consecutive: DEGRADED_AFTER_CONSECUTIVE } });
    expect(v).toMatchObject({ degraded: true, unhealthy: false, worst: "weeklyReport" });
    expect(v.failing).toEqual(["weeklyReport"]);
  });

  it("ten ticks in a row is not a wobble", () => {
    expect(schedulerVerdict({ weeklyReport: { consecutive: UNHEALTHY_AFTER_CONSECUTIVE } })).toMatchObject({ degraded: false, unhealthy: true });
  });

  it("the worst job is the one named, and the others are still listed", () => {
    const v = schedulerVerdict({ funnelDigest: { consecutive: 4 }, weeklyReport: { consecutive: 40 } });
    expect(v.worst).toBe("weeklyReport");
    expect(v.consecutive).toBe(40);
    expect(v.failing).toEqual(["funnelDigest", "weeklyReport"]);
  });

  it("no records is healthy, and so is an empty one", () => {
    expect(schedulerVerdict({})).toMatchObject({ degraded: false, unhealthy: false, worst: null });
    expect(schedulerVerdict(null)).toMatchObject({ degraded: false, unhealthy: false });
    expect(schedulerVerdict({ weeklyReport: { consecutive: 0 } })).toMatchObject({ degraded: false, unhealthy: false });
  });
});

describe("what a failure is allowed to record", () => {
  it("the code and the class, and the count climbs", () => {
    const first = failureRecord(importError(), null);
    expect(first).toMatchObject({ consecutive: 1, code: "ERR_IMPORT_ATTRIBUTE_MISSING", name: "TypeError" });
    expect(failureRecord(importError(), first).consecutive).toBe(2);
  });

  it("NEVER the message — this value is read back by a public endpoint", () => {
    // The real message carries a filesystem path; another job's might carry a
    // shop domain or a URL with a token in it.
    const rec = failureRecord(importError(), null);
    expect(JSON.stringify(rec)).not.toMatch(/locales|de\.json|file:\/\//);
    expect(rec).not.toHaveProperty("message");
    expect(rec).not.toHaveProperty("stack");
  });

  it("an error with no code still records something usable", () => {
    expect(failureRecord(new Error("boom"), null)).toMatchObject({ consecutive: 1, code: null, name: "Error" });
    expect(failureRecord(undefined, null)).toMatchObject({ consecutive: 1, name: "Error" });
  });
});

describe("runScheduled keeps the log line and adds the count", () => {
  it("a throwing job climbs, tick after tick", async () => {
    for (let i = 0; i < 3; i++) await runScheduled("weeklyReport", () => Promise.reject(importError()), "weekly report threw");
    const r = await readSchedulerHealth();
    expect(r.jobs.weeklyReport.consecutive).toBe(3);
    expect(r.degraded).toBe(true);
  });

  it("one success clears the streak — a job that works today is not broken", async () => {
    await recordJobFailure("weeklyReport", importError());
    await recordJobFailure("weeklyReport", importError());
    await runScheduled("weeklyReport", () => Promise.resolve("sent"), "weekly report threw");
    const r = await readSchedulerHealth();
    expect(r.jobs.weeklyReport).toMatchObject({ ok: true });
    expect(r.jobs.weeklyReport.consecutive).toBeUndefined();
    expect(r.degraded).toBe(false);
    expect(r.unhealthy).toBe(false);
  });

  it("a success is RECORDED, not merely an absence — these jobs are silent most of the time", async () => {
    // maybeSendWeeklyReports returns { ran: false, reason: "not the hour" } and
    // logs nothing for all but one minute a week. Without a moving timestamp,
    // "no error" cannot be told from "failing in a new and quiet way", which is
    // the ambiguity that let this run for weeks.
    await runScheduled("weeklyReport", () => Promise.resolve({ ran: false, reason: "not the hour" }), "weekly report threw");
    const r = await readSchedulerHealth();
    expect(r.jobs.weeklyReport.ok).toBe(true);
    expect(Date.parse(r.jobs.weeklyReport.at)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("the original log line is still written, unchanged", async () => {
    const logger = (await import("../../app/utils/logger.server.js")).default;
    await runScheduled("weeklyReport", () => Promise.reject(importError()), "weekly report threw");
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(TypeError) }), "weekly report threw");
  });

  it("a job never fails because its bookkeeping failed", async () => {
    // What matters is that neither ever REJECTS: a rejection here would be an
    // unhandled rejection inside the worker's timer, which is a worse version
    // of the defect this file exists to fix.
    redis.hset.mockRejectedValueOnce(new Error("redis gone"));
    let threw = null;
    await runScheduled("weeklyReport", () => Promise.reject(importError()), "weekly report threw").catch((e) => (threw = e));
    expect(threw).toBeNull();
    redis.hdel.mockRejectedValueOnce(new Error("redis gone"));
    await runScheduled("weeklyReport", () => Promise.resolve(1), "weekly report threw").catch((e) => (threw = e));
    expect(threw).toBeNull();
  });
});

describe("THE DEFECT: the deep check now sees it", () => {
  it("stays ok while nothing is failing", async () => {
    const { body } = await deep();
    expect(body.status).toBe("ok");
    expect(body.checks.scheduler.failing).toEqual([]);
  });

  it("degrades at three consecutive ticks, naming the job", async () => {
    for (let i = 0; i < DEGRADED_AFTER_CONSECUTIVE; i++) await recordJobFailure("weeklyReport", importError());
    const { body } = await deep();
    expect(body.status).toBe("degraded");
    expect(body.checks.scheduler.failing).toEqual(["weeklyReport"]);
    expect(body.checks.scheduler.worstConsecutiveTicks).toBe(3);
    expect(body.checks.scheduler.jobs.weeklyReport.code).toBe("ERR_IMPORT_ATTRIBUTE_MISSING");
  });

  it("stops saying the worker is fine at ten — this is the weeks-long case", async () => {
    for (let i = 0; i < UNHEALTHY_AFTER_CONSECUTIVE; i++) await recordJobFailure("weeklyReport", importError());
    const { res, body } = await deep();
    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    // and the two probes that used to answer alone are still saying yes,
    // which is exactly why this one had to exist
    expect(body.checks.queue.workerRunning).toBe(true);
    expect(body.checks.jobs.failedLast10Min).toBe(0);
  });

  it("the endpoint never leaks the error's message", async () => {
    for (let i = 0; i < UNHEALTHY_AFTER_CONSECUTIVE; i++) await recordJobFailure("weeklyReport", importError());
    const { body } = await deep();
    expect(JSON.stringify(body)).not.toMatch(/locales|de\.json|file:\/\//);
  });

  it("an unreadable counter is reported as unreadable, not as healthy", async () => {
    redis.hgetall.mockRejectedValueOnce(new Error("redis gone"));
    const { body } = await deep();
    expect(body.status).toBe("degraded");
    expect(body.checks.scheduler.error).toBe("read failed");
  });

  it("no Redis at all is not a second alert for the same fact", async () => {
    const cache = await import("../../app/utils/cache.server.js");
    cache.getRedis.mockResolvedValueOnce(null);
    const { body } = await deep();
    expect(body.checks.scheduler.error).toBe("no redis");
    expect(body.status).toBe("ok");
  });

  it("it costs one round trip on the hash, however many jobs there are", async () => {
    await recordJobFailure("weeklyReport", importError());
    await recordJobFailure("funnelDigest", importError());
    redis.hgetall.mockClear();
    await deep();
    expect(redis.hgetall).toHaveBeenCalledTimes(1);
  });
});

describe("the scheduler actually routes its jobs through it", () => {
  it("all four scheduled jobs are named and recorded", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/utils/scheduler.server.js", "utf8");
    for (const job of ["catalogueWatch", "crawlHoldout", "weeklyReport", "funnelDigest"]) {
      expect(src, `${job} must report its outcome`).toMatch(new RegExp(`runScheduled\\("${job}"`));
    }
    // the bare catch that swallowed them is gone
    expect(src).not.toMatch(/import\("\.\/weeklyReport\.server\.js"\)\s*\n\s*\.then/);
  });
});
