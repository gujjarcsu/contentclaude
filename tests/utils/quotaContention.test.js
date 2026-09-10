/**
 * P1 — the quota gate's retry budget.
 *
 * On 2026-09-10 a store lost a generation to "Busy for a moment — no generation
 * was used." That message is a P2034 write conflict on the SERIALIZABLE quota
 * transaction, surfacing after the retry budget ran out.
 *
 * The budget was ONE retry, and one retry is not a budget — it is a coin flip.
 * The dashboard fires up to THREE quick-start requests in parallel for the same
 * shop, and each runs `count(where: {shop, month})` then `create()` inside a
 * SERIALIZABLE transaction. Concurrent transactions counting and inserting over
 * the same predicate is the textbook serialization anomaly: Postgres aborts all
 * but one with 40001. One wins, two retry, and the loser of THAT race had no
 * attempts left.
 *
 * ── What these tests would print if the budget were broken ────────────────
 *
 * Reverted to a single retry, "survives two conflicts" and "survives three"
 * both FAIL with `isContention: true`. That is the discriminator, and it is
 * why those two cases are written in terms of a conflict COUNT rather than
 * asserting on QUOTA_MAX_RETRIES — a test that reads the constant it is
 * checking passes at any value of it, including zero.
 *
 * ── What these tests CANNOT prove, stated rather than implied ─────────────
 *
 * That a retry never double-charges. In production the conflicting transaction
 * ABORTED, so its `usageRecord.create` was rolled back and only the winning
 * attempt persists a row. Here `$transaction` is a mock: the callback's writes
 * are not rolled back because there is nothing to roll back. Counting
 * `create` calls in this file would therefore be measuring the mock, not the
 * guarantee. The guarantee rests on Postgres aborting the transaction, which
 * only an integration test against a real database could exercise.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    plan: { findUnique: vi.fn() },
    usageRecord: { count: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@prisma/client", () => ({
  Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (_k, fn) => fn()),
  invalidateCache: vi.fn(async () => {}),
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { tryConsumeGeneration, quotaRetryDelayMs, QUOTA_MAX_RETRIES } = await import(
  "../../app/utils/plans.server.js"
);

const SHOP = "ebs-plumbing.myshopify.com";

/** A P2034 exactly as Prisma raises it for a serialization failure. */
function writeConflict() {
  const err = new Error("Transaction failed due to a write conflict or a deadlock");
  err.code = "P2034";
  return err;
}

/**
 * Make `$transaction` fail with P2034 the first `n` times it is called, then
 * behave like a healthy transaction.
 */
function failFirst(n) {
  let calls = 0;
  prisma.$transaction.mockImplementation(async (fn) => {
    calls += 1;
    if (calls <= n) throw writeConflict();
    return fn({
      plan: { findUnique: async () => ({ shop: SHOP, planName: "growth", monthlyLimit: 200, status: "active" }) },
      usageRecord: { count: async () => 7, create: async () => ({ id: "u1" }) },
    });
  });
  return () => calls;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the backoff itself", () => {
  it("grows, so three parallel requests stop landing on top of each other", () => {
    // The old delay was a flat 50–150 ms for the single retry it allowed, which
    // is inside the window the colliding requests are still in.
    const zeroJitter = () => 0;
    expect(quotaRetryDelayMs(0, zeroJitter)).toBe(50);
    expect(quotaRetryDelayMs(1, zeroJitter)).toBe(100);
    expect(quotaRetryDelayMs(2, zeroJitter)).toBe(200);
  });

  it("adds jitter, so retries do not re-collide in lockstep", () => {
    // Without jitter, N conflicting requests all wake at the same instant and
    // conflict again — a retry schedule that reproduces the collision.
    expect(quotaRetryDelayMs(0, () => 1)).toBe(150);
    expect(quotaRetryDelayMs(0, () => 0)).toBe(50);
  });

  it("stays well inside the transaction timeout even at the last attempt", () => {
    const worst = [0, 1, 2].reduce((sum, a) => sum + quotaRetryDelayMs(a, () => 1), 0);
    expect(worst).toBeLessThan(2000);
  });
});

describe("surviving a burst", () => {
  it("survives ONE conflict", async () => {
    const calls = failFirst(1);
    const r = await tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/1");
    expect(r.allowed).toBe(true);
    expect(calls()).toBe(2);
  });

  it("survives TWO conflicts — this is the case the old budget lost", async () => {
    // The old code allowed a single retry: two attempts total. The second
    // conflict exhausted it and the merchant saw "Busy for a moment".
    const calls = failFirst(2);
    const r = await tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/1");
    expect(r.allowed).toBe(true);
    expect(r.isContention).toBeUndefined();
    expect(calls()).toBe(3);
  });

  it("survives THREE conflicts — the dashboard fires three in parallel", async () => {
    const calls = failFirst(3);
    const r = await tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/1");
    expect(r.allowed).toBe(true);
    expect(calls()).toBe(4);
  });
});

describe("when the budget really is exhausted", () => {
  it("denies safely instead of throwing, and charges nothing", async () => {
    // A throw here would land the merchant on the ErrorBoundary mid-run. The
    // denial is what lets the caller say "no generation was used" truthfully.
    failFirst(99);
    const r = await tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/1");
    expect(r.allowed).toBe(false);
    expect(r.isContention).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it("makes exactly QUOTA_MAX_RETRIES + 1 attempts and then stops", async () => {
    // Bounded: a retry loop with no ceiling on a SERIALIZABLE transaction is a
    // way to keep a database busy while a merchant waits.
    const calls = failFirst(99);
    await tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/1");
    expect(calls()).toBe(QUOTA_MAX_RETRIES + 1);
  });

  it("does not retry an error that is not a write conflict", async () => {
    // Retrying an unknown failure three times triples the damage of whatever
    // it actually was.
    let calls = 0;
    prisma.$transaction.mockImplementation(async () => {
      calls += 1;
      const err = new Error("connection refused");
      err.code = "P1001";
      throw err;
    });
    await expect(tryConsumeGeneration(SHOP, "description", null)).rejects.toThrow(/connection refused/);
    expect(calls).toBe(1);
  });
});

describe("what a retry must not change", () => {
  it("persists the real contentType, not a retry marker", async () => {
    // An earlier version tracked the retry by overloading contentType, which
    // wrote the marker into UsageRecord and corrupted the usage breakdown.
    let seen = null;
    let calls = 0;
    prisma.$transaction.mockImplementation(async (fn) => {
      calls += 1;
      if (calls <= 2) throw writeConflict();
      return fn({
        plan: {
          findUnique: async () => ({ shop: SHOP, planName: "growth", monthlyLimit: 200, status: "active" }),
        },
        usageRecord: {
          count: async () => 0,
          create: async (arg) => {
            seen = arg.data;
            return { id: "u1" };
          },
        },
      });
    });

    await tryConsumeGeneration(SHOP, "metaTitle", "gid://shopify/Product/9");
    expect(seen.contentType).toBe("metaTitle");
    expect(seen.productId).toBe("gid://shopify/Product/9");
  });
});
