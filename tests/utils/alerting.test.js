/**
 * Phase 1 items 5 and 7 — the owner is told, and the data is somewhere else.
 *
 * On 2026-09-09 a corrupted DATABASE_URL took production down for twenty
 * minutes and nothing said a word. `/api/health` returned 503 exactly as
 * designed; nothing was calling it. That incident is the acceptance test for
 * this code, so it is the first thing asserted here: an unreachable database
 * now produces an email.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { emails, redis, redisRef } = vi.hoisted(() => ({
  emails: [],
  redis: { set: vi.fn(async () => "OK"), get: vi.fn(async () => null), del: vi.fn(async () => 1) },
  redisRef: { current: null },
}));

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/cache.server.js", () => ({ getRedis: async () => redisRef.current }));
vi.mock("../../app/utils/notify.server.js", () => ({
  OPERATOR_EMAIL: "hello@navaal.ai",
  sendOperatorEmail: vi.fn(async (m) => {
    emails.push(m);
    return { sent: true };
  }),
}));

const { checkHealthOnce, maybeSendDigest, maybeRunBackup, sydneyParts } = await import(
  "../../app/utils/scheduler.server.js"
);
const { buildDailyDigest } = await import("../../app/utils/digest.server.js");
const { backupConfig, runNightlyBackup } = await import("../../app/utils/backup.server.js");

const res = (status, body) => ({ status, text: async () => JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  emails.length = 0;
  redisRef.current = null;
  redis.set.mockResolvedValue("OK");
  redis.get.mockResolvedValue(null);
});

describe("item 5 — the health watch emails when production is unhealthy", () => {
  it("emails on the exact shape of the 2026-09-09 incident: 503 with database error", async () => {
    const fetchImpl = vi.fn(async () =>
      res(503, { status: "error", checks: { database: "error", redis: "ok" } }),
    );
    const out = await checkHealthOnce({ fetchImpl, now: 1_000_000 });

    expect(out.ok).toBe(false);
    expect(out.alerted).toBe(true);
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toMatch(/DOWN/);
    expect(emails[0].subject).toMatch(/503/);
    // The email has to be actionable at 3am.
    expect(emails[0].text).toMatch(/RUNBOOK/);
    expect(emails[0].text).toMatch(/secret was just changed/i);
  });

  it("emails when production does not answer at all", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ETIMEDOUT");
    });
    const out = await checkHealthOnce({ fetchImpl, now: 20_000_000 });
    expect(out.ok).toBe(false);
    expect(emails[0].subject).toMatch(/no response/);
  });

  it("does not email again every five minutes while it stays broken", async () => {
    const fetchImpl = vi.fn(async () => res(503, { status: "error" }));
    const t = 40_000_000;
    await checkHealthOnce({ fetchImpl, now: t });
    const first = emails.length;
    await checkHealthOnce({ fetchImpl, now: t + 5 * 60_000 });
    await checkHealthOnce({ fetchImpl, now: t + 10 * 60_000 });
    expect(emails.length).toBe(first); // still just the one
  });

  it("says so when it recovers", async () => {
    const bad = vi.fn(async () => res(503, { status: "error" }));
    const good = vi.fn(async () => res(200, { status: "ok" }));
    const t = 80_000_000;
    await checkHealthOnce({ fetchImpl: bad, now: t });
    emails.length = 0;
    await checkHealthOnce({ fetchImpl: good, now: t + 60_000 });
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toMatch(/back/i);
  });

  it("treats degraded as fine — Redis and the breaker recover on their own", async () => {
    const fetchImpl = vi.fn(async () => res(200, { status: "degraded", checks: { redis: "degraded" } }));
    const out = await checkHealthOnce({ fetchImpl, now: 120_000_000 });
    expect(out.ok).toBe(true);
    expect(emails).toHaveLength(0);
  });
});

describe("item 5 — the daily digest goes at 07:00 Sydney, once", () => {
  const at = (iso) => new Date(iso);

  it("knows the hour in Sydney regardless of the machine clock", () => {
    // 21:00 UTC is 07:00 the next day in Sydney (AEST, UTC+10).
    expect(sydneyParts(at("2026-09-08T21:00:00Z")).hour).toBe(7);
    expect(sydneyParts(at("2026-09-08T21:00:00Z")).day).toBe("2026-09-09");
  });

  it("does nothing at any other hour", async () => {
    const out = await maybeSendDigest({ now: at("2026-09-08T10:00:00Z"), build: async () => ({ subject: "s", text: "t" }) });
    expect(out.sent).toBe(false);
    expect(emails).toHaveLength(0);
  });

  it("sends once at the hour", async () => {
    redisRef.current = redis;
    const out = await maybeSendDigest({
      now: at("2026-09-08T21:00:00Z"),
      build: async () => ({ subject: "Navaal daily", text: "body" }),
    });
    expect(out.sent).toBe(true);
    expect(emails).toHaveLength(1);
  });

  it("a worker restart inside the hour does not send a second copy", async () => {
    redisRef.current = redis;
    redis.set.mockResolvedValue(null); // the day is already claimed
    redis.get.mockResolvedValue("2026-09-09");
    const out = await maybeSendDigest({
      now: at("2026-09-08T21:30:00Z"),
      build: async () => ({ subject: "s", text: "t" }),
    });
    expect(out.sent).toBe(false);
    expect(emails).toHaveLength(0);
  });
});

describe("item 5 — the digest reports what we can actually count", () => {
  const db = {
    shop: { count: vi.fn(async () => 3) },
    generationJob: {
      count: vi.fn(async () => 2),
      aggregate: vi.fn(async () => ({ _sum: { quotaSkipped: 11 } })),
    },
    usageRecord: { count: vi.fn(async () => 42) },
    plan: { count: vi.fn(async () => 1) },
  };

  it("builds a subject and body from real counts", async () => {
    const { subject, text, data } = await buildDailyDigest({ now: new Date("2026-09-09T21:00:00Z"), db });
    expect(subject).toMatch(/Navaal daily/);
    expect(data.generations).toBe(42);
    expect(data.quotaSkipped).toBe(11);
    expect(text).toMatch(/INSTALLS/);
    expect(text).toMatch(/FIRST VALUE/);
    expect(text).toMatch(/REVIEWS/);
  });

  it("says plainly what it is NOT reporting, rather than guessing", async () => {
    const { text } = await buildDailyDigest({ now: new Date("2026-09-09T21:00:00Z"), db });
    expect(text).toMatch(/install SOURCE split/);
    expect(text).toMatch(/traffic and revenue/);
    expect(text).toMatch(/does not guess/);
  });

  it("survives a query that fails rather than sending nothing at all", async () => {
    const brokenDb = { ...db, shop: { count: vi.fn(async () => { throw new Error("db down"); }) } };
    const { data } = await buildDailyDigest({ now: new Date("2026-09-09T21:00:00Z"), db: brokenDb });
    expect(data.installs).toBe(0);
  });
});

describe("item 7 — the nightly backup", () => {
  it("refuses to run, loudly, when R2 is not configured", async () => {
    const out = await runNightlyBackup({ now: new Date("2026-09-09T17:00:00Z") });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/not configured/);
  });

  it("reports the exact missing pieces", () => {
    const cfg = backupConfig();
    expect(cfg.ready).toBe(false);
    expect(cfg.missing).toContain("accountId");
  });

  it("never stores an empty dump, and emails when it fails", async () => {
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "akid";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.DATABASE_URL = "postgresql://u:p@h/db";
    try {
      const out = await runNightlyBackup({
        now: new Date("2026-09-09T17:00:00Z"),
        dump: async () => Buffer.from("tiny"),
        put: async () => ({ ok: true, status: 200, key: "k" }),
      });
      expect(out.ok).toBe(false);
      expect(out.reason).toMatch(/refusing to store an empty backup/);
      expect(emails.at(-1).subject).toMatch(/backup FAILED/);
    } finally {
      for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) delete process.env[k];
    }
  });

  it("stores a real dump under a dated key", async () => {
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "akid";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.DATABASE_URL = "postgresql://u:p@h/db";
    try {
      const put = vi.fn(async ({ key }) => ({ ok: true, status: 200, key }));
      const out = await runNightlyBackup({
        now: new Date("2026-09-09T17:00:00Z"),
        dump: async () => Buffer.alloc(5000, 1),
        put,
      });
      expect(out.ok).toBe(true);
      expect(out.key).toMatch(/^neondb\/2026-09-09\/contentclaude-/);
      expect(out.key).toMatch(/\.dump$/);
    } finally {
      for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) delete process.env[k];
    }
  });

  it("runs at 03:00 Sydney and not at other hours", async () => {
    const notYet = await maybeRunBackup({ now: new Date("2026-09-08T10:00:00Z"), run: async () => ({ ok: true }) });
    expect(notYet.ran).toBe(false);
    // 17:00 UTC is 03:00 the next day in Sydney.
    const go = await maybeRunBackup({ now: new Date("2026-09-08T17:00:00Z"), run: async () => ({ ok: true }) });
    expect(go.ran).toBe(true);
  });
});
