/**
 * P38 — the four days from 2026-10-01 11:40Z.
 *
 * The Redis cache client died (a server-side close, no "error" event, so it was
 * never replaced). Every scheduled job's Redis claim threw, every job was
 * written "could not claim, running anyway", and the daily digest went to the
 * owner once a minute for its whole hour. The DOWN alert repeated hourly.
 *
 * These are the acceptance tests for the fix:
 *   1. an ended Redis client is replaced, not reused
 *   2. the claim is a Postgres insert; a marker that cannot be read means the
 *      job does NOT run, and the owner gets ONE email about it
 *   3. through a full simulated hour the digest sends exactly once
 *   4. DOWN: once on the break, once on recovery, one reminder a day
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const { emails, runs, dbState, clients } = vi.hoisted(() => ({
  emails: [],
  runs: new Set(),
  dbState: { broken: false },
  clients: [],
}));

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/notify.server.js", () => ({
  OPERATOR_EMAIL: "hello@navaal.ai",
  sendOperatorEmail: vi.fn(async (m) => {
    emails.push(m);
    return { sent: true };
  }),
  sendEmailTo: vi.fn(async () => ({ sent: true })),
}));
// ScheduledRun with real primary-key semantics.
vi.mock("../../app/db.server.js", () => ({
  default: {
    scheduledRun: {
      create: async ({ data }) => {
        if (dbState.broken) throw new Error("Can't reach database server");
        const k = `${data.job}|${data.period}`;
        if (runs.has(k)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        runs.add(k);
        return data;
      },
    },
  },
}));
// An ioredis stand-in that can be closed by "the server".
vi.mock("ioredis", () => ({
  default: class FakeRedis extends EventEmitter {
    constructor() {
      super();
      this.status = "wait";
      clients.push(this);
    }
    async connect() {
      this.status = "ready";
    }
    async ping() {
      if (this.status === "end") throw new Error("Connection is closed.");
      return "PONG";
    }
  },
}));

process.env.REDIS_URL = "redis://example:6379";
const { getRedis } = await import("../../app/utils/cache.server.js");
const { claimScheduledRun } = await import("../../app/utils/scheduledRun.server.js");
const { maybeSendDigest, checkHealthOnce, checkAppShellOnce, maybeSweepScheduledRuns } = await import("../../app/utils/scheduler.server.js");
const { sweepOldScheduledRuns } = await import("../../app/utils/scheduledRun.server.js");
const { buildDailyDigest } = await import("../../app/utils/digest.server.js");

const MIN = 60_000;
const HOUR = 60 * MIN;
const res = (status, body) => ({ status, text: async () => JSON.stringify(body) });
const build = async () => ({ subject: "Navaal daily — 0 installs", text: "body" });

beforeEach(() => {
  emails.length = 0;
  runs.clear();
  dbState.broken = false;
});

describe("1 — an ended Redis client is replaced", () => {
  it("a server-side close (status 'end', no 'error' event) gets a fresh client, not 'Connection is closed.'", async () => {
    const first = await getRedis();
    expect(await first.ping()).toBe("PONG");

    // Exactly what happened on 2026-10-01: the client ends without an error.
    first.status = "end";
    first.emit("end");

    const second = await getRedis();
    expect(second).not.toBe(first);
    expect(await second.ping()).toBe("PONG");
  });

  it("is replaced even if the 'end' event was missed", async () => {
    const c = await getRedis();
    c.status = "end";
    const next = await getRedis();
    expect(next).not.toBe(c);
  });
});

describe("2 — the claim lives in Postgres and fails closed", () => {
  it("first claim runs, the second does not", async () => {
    expect(await claimScheduledRun("dailyDigest", "2026-10-07")).toEqual({ run: true });
    expect(await claimScheduledRun("dailyDigest", "2026-10-07")).toEqual({ run: false, reason: "already ran" });
    expect(await claimScheduledRun("dailyDigest", "2026-10-08")).toEqual({ run: true });
  });

  it("an unreadable marker skips the job and raises exactly one alert, however many ticks and jobs", async () => {
    dbState.broken = true;
    for (let i = 0; i < 60; i++) {
      expect((await claimScheduledRun("dailyDigest", "2026-10-07")).run).toBe(false);
      expect((await claimScheduledRun("funnelDigest", "2026-10-05")).run).toBe(false);
    }
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toMatch(/SKIPPING/);

    // Recovers: the next good claim re-arms the alert for the next outage.
    dbState.broken = false;
    expect((await claimScheduledRun("dailyDigest", "2026-10-07")).run).toBe(true);
    dbState.broken = true;
    await claimScheduledRun("dailyDigest", "2026-10-08");
    expect(emails).toHaveLength(2);
  });
});

describe("3 — the digest sends exactly once through its whole hour", () => {
  // 07:00 Sydney on 7 Oct 2026 is 20:00Z on 6 Oct (AEDT, UTC+11, from 4 Oct).
  const start = Date.parse("2026-10-06T19:55:00Z");

  it("once, with a healthy marker — not 60 times", async () => {
    let sent = 0;
    for (let m = 0; m < 70; m++) {
      const r = await maybeSendDigest({ now: new Date(start + m * MIN), build });
      if (r.sent) sent++;
    }
    expect(sent).toBe(1);
    expect(emails.filter((e) => /Navaal daily/.test(e.subject))).toHaveLength(1);
  });

  it("zero digests and one alert when the marker cannot be read", async () => {
    dbState.broken = true;
    let sent = 0;
    for (let m = 0; m < 70; m++) {
      const r = await maybeSendDigest({ now: new Date(start + m * MIN), build });
      if (r.sent) sent++;
    }
    expect(sent).toBe(0);
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toMatch(/SKIPPING/);
  });
});

describe("4 — DOWN: once on the break, once on recovery, one reminder a day", () => {
  it("four days down sends 1 + 4 reminders + 1 recovery, not ~100", async () => {
    const bad = vi.fn(async () => res(503, { status: "error" }));
    const good = vi.fn(async () => res(200, { status: "ok" }));
    const t0 = 900_000_000_000;
    await checkHealthOnce({ fetchImpl: good, now: t0 - 5 * MIN });
    emails.length = 0;

    // 1 Oct 11:40Z to 5 Oct 23:50Z ≈ 108 hours of five-minute probes.
    const probes = (108 * HOUR) / (5 * MIN);
    for (let i = 0; i < probes; i++) await checkHealthOnce({ fetchImpl: bad, now: t0 + i * 5 * MIN });
    const down = emails.filter((e) => /DOWN/.test(e.subject));
    expect(down).toHaveLength(5); // the break, then at 24 h, 48 h, 72 h, 96 h

    await checkHealthOnce({ fetchImpl: good, now: t0 + 108 * HOUR });
    expect(emails.at(-1).subject).toMatch(/back/i);
    expect(emails).toHaveLength(6);
  });

  it("no reminder inside the first 24 hours", async () => {
    const bad = vi.fn(async () => res(503, { status: "error" }));
    const good = vi.fn(async () => res(200, { status: "ok" }));
    const t0 = 950_000_000_000;
    await checkHealthOnce({ fetchImpl: good, now: t0 - 5 * MIN });
    emails.length = 0;
    for (let i = 0; i < (23 * HOUR) / (5 * MIN); i++) await checkHealthOnce({ fetchImpl: bad, now: t0 + i * 5 * MIN });
    expect(emails).toHaveLength(1);
  });
});

/**
 * P38b — the other two alarms follow the same rule, the markers are swept,
 * and our own dev store is not a paying merchant.
 */
describe("P38b — admin-shell and degraded alarms: once, recovery, one reminder a day", () => {
  it("the admin shell: 1 on break, 1 per 24 h, 1 on recovery — over two days, not 48", async () => {
    const shell = (status) => vi.fn(async () => ({ status }));
    const t0 = 980_000_000_000;
    await checkAppShellOnce({ fetchImpl: shell(302), now: t0 - 5 * MIN });
    emails.length = 0;
    for (let i = 0; i < (48 * HOUR) / (5 * MIN); i++) await checkAppShellOnce({ fetchImpl: shell(500), now: t0 + i * 5 * MIN });
    expect(emails.filter((e) => /admin is broken/i.test(e.subject))).toHaveLength(2); // the break, then at 24 h
    await checkAppShellOnce({ fetchImpl: shell(302), now: t0 + 48 * HOUR });
    expect(emails.at(-1).subject).toMatch(/serving again/i);
    expect(emails).toHaveLength(3);
  });

  it("degraded: alerts at 15 minutes, reminds once a day, says so when it clears", async () => {
    const degraded = vi.fn(async () => res(200, { status: "degraded", checks: { redis: "degraded" } }));
    const ok = vi.fn(async () => res(200, { status: "ok" }));
    const t0 = 990_000_000_000;
    await checkHealthOnce({ fetchImpl: ok, now: t0 - 5 * MIN });
    emails.length = 0;
    for (let i = 0; i < (30 * HOUR) / (5 * MIN); i++) await checkHealthOnce({ fetchImpl: degraded, now: t0 + i * 5 * MIN });
    const alarms = emails.filter((e) => /DEGRADED/.test(e.subject));
    expect(alarms).toHaveLength(2);
    expect(alarms[0].subject).toMatch(/15 minutes/);
    // The reminder states how long it has really lasted, not "15 minutes" again.
    expect(alarms[1].subject).not.toMatch(/ 15 minutes/);
    await checkHealthOnce({ fetchImpl: ok, now: t0 + 30 * HOUR });
    expect(emails.at(-1).subject).toMatch(/back to normal/i);
  });
});

describe("P38b — ScheduledRun markers older than 30 days are swept, nightly", () => {
  it("deletes only what is past the cutoff", async () => {
    const deleteMany = vi.fn(async () => ({ count: 4 }));
    const now = new Date("2026-11-10T18:00:00Z");
    const out = await sweepOldScheduledRuns({ now, db: { scheduledRun: { deleteMany } } });
    expect(out.deleted).toBe(4);
    expect(deleteMany).toHaveBeenCalledWith({ where: { claimedAt: { lt: new Date("2026-10-11T18:00:00Z") } } });
  });

  it("runs once in its hour (05:00 Sydney), never at any other", async () => {
    const sweep = vi.fn(async () => ({ deleted: 0 }));
    // 05:00 Sydney on 8 Oct 2026 (AEDT) is 18:00Z on 7 Oct.
    const start = Date.parse("2026-10-07T17:00:00Z");
    let ran = 0;
    for (let m = 0; m < 180; m++) if ((await maybeSweepScheduledRuns({ now: new Date(start + m * MIN), sweep })).ran) ran++;
    expect(ran).toBe(1);
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});

describe("P38b — our own dev store is never a paid, live or ever shop in the digest", () => {
  const db = {
    shop: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => [
        { shop: "contentpilot-dev2.myshopify.com", kind: "unclassified", uninstalledAt: null }, // ours by OURS_PATTERN, whatever the row says
        { shop: "hark-fauy0olp.myshopify.com", kind: "unclassified", uninstalledAt: null },
        { shop: "mars-demo.myshopify.com", kind: "shopify", uninstalledAt: null },
      ]),
    },
    plan: { findMany: vi.fn(async () => [{ shop: "contentpilot-dev2.myshopify.com" }]) },
    generationJob: { count: vi.fn(async () => 0), aggregate: vi.fn(async () => ({ _sum: { quotaSkipped: 0 } })) },
    usageRecord: { count: vi.fn(async () => 0) },
  };

  it("'shops on a paid plan' reads 0 when the only paid plan is contentpilot-dev2", async () => {
    const { data, text } = await buildDailyDigest({ now: new Date("2026-10-06T20:00:00Z"), db });
    expect(data.paidShops).toBe(0);
    expect(text).toMatch(/\s0 {2}shops on a paid plan/);
    expect(data.liveShops).toBe(1); // hark only — not ours, not Shopify's
    expect(data.totalShops).toBe(1);
    expect(data.excludedShops).toBe(2);
  });
});
