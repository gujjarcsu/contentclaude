/**
 * Phase 12 Part E, A8 — money is exact: two simultaneous generations, one debit
 * each, and the cap never overshoots.
 *
 * The gate (tryConsumeGeneration) reads the month's spend and writes the
 * UsageRecord inside ONE Serializable transaction, and retries on P2034. That is
 * the whole guarantee: two generations racing on the same shop cannot both read
 * "24 left" and both commit "25 spent" — the second commit conflicts, retries,
 * re-reads "25 spent" and is refused.
 *
 * This file drives that with a fake database that behaves like PostgreSQL's
 * SERIALIZABLE: every transaction reads a snapshot taken when it started, and a
 * transaction that wrote is refused with P2034 at commit if anyone committed
 * after its snapshot. The fake only does that when the gate ASKS for
 * Serializable — delete the isolationLevel option in plans.server.js and both
 * tests below fail (the boundary one by an overshoot, the other by the assertion
 * on the option), which is what makes this a break-test and not a mirror.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const state = { records: [], commits: 0, plan: null, calls: [] };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function $transaction(fn, opts = {}) {
    state.calls.push(opts);
    const serializable = opts.isolationLevel === "Serializable";
    const snapshot = state.commits;
    const seen = state.records.slice(); // what this transaction can read
    const staged = [];
    const tx = {
      plan: { findUnique: async () => state.plan },
      shop: { findUnique: async () => null, update: async () => ({}) },
      usageRecord: {
        aggregate: async ({ where }) => {
          await tick(); // let the other transaction read the same snapshot
          const sum = seen.filter((r) => r.shop === where.shop && r.month === where.month).reduce((a, r) => a + r.credits, 0);
          return { _sum: { credits: sum } };
        },
        count: async () => 0,
        findMany: async () => [],
        findFirst: async () => null, // isProductCovered: this product is not yet covered
        groupBy: async () => [], // countCoveredProducts: nothing covered yet
        create: async ({ data }) => {
          const row = { id: `u${state.records.length + staged.length + 1}`, ...data };
          staged.push(row);
          return row;
        },
      },
      contentDraft: { count: async () => 0, findMany: async () => [] },
      generatedContent: { count: async () => 0, findMany: async () => [] },
    };
    const out = await fn(tx);
    if (staged.length) {
      if (serializable && state.commits !== snapshot) {
        throw Object.assign(new Error("Transaction failed due to a write conflict"), { code: "P2034" });
      }
      state.records.push(...staged);
      state.commits += 1;
    }
    return out;
  }
  return {
    state,
    prisma: {
      $transaction: vi.fn($transaction),
      plan: { findUnique: vi.fn(async () => state.plan) },
      usageRecord: { aggregate: vi.fn(async () => ({ _sum: { credits: 0 } })), count: vi.fn(async () => 0), delete: vi.fn(async () => ({})), findFirst: vi.fn(async () => null) },
      shop: { findUnique: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 1 })) },
    },
  };
});

vi.mock("../../app/db.server.js", () => ({ default: db.prisma }));
vi.mock("@prisma/client", () => ({ Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } } }));
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (k, supplier) => supplier()),
  invalidateCache: vi.fn(async () => {}),
  getRedis: async () => null,
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");

const SHOP = "race.myshopify.com";
const plan = (monthlyCredits) => ({ shop: SHOP, planName: "starter", status: "active", monthlyCredits, trialEndsAt: null });

beforeEach(() => {
  db.state.records.length = 0;
  db.state.commits = 0;
  db.state.calls.length = 0;
  db.prisma.$transaction.mockClear();
});

describe("A8 — two simultaneous generations are debited exactly once each", () => {
  it("both land, one credit each, and the loser of the race re-read before it wrote", async () => {
    db.state.plan = plan(25);
    const [a, b] = await Promise.all([
      tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/1"),
      tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/2"),
    ]);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    // exactly two records, one credit each — never three, never a double debit
    expect(db.state.records.map((r) => r.credits)).toEqual([1, 1]);
    expect(db.state.records.map((r) => r.productId).sort()).toEqual(["gid://shopify/Product/1", "gid://shopify/Product/2"]);
    // the two "remaining" numbers are consecutive: the second generation saw the first
    expect([a.remaining, b.remaining].sort((x, y) => y - x)).toEqual([24, 23]);
    // the race cost exactly one conflict and one retry
    expect(db.prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("the cap never overshoots: with ONE credit left, one wins and the other is refused with credit_limit", async () => {
    db.state.plan = plan(1);
    const results = await Promise.all([
      tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/1"),
      tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/2"),
    ]);
    const allowed = results.filter((r) => r.allowed);
    const refused = results.filter((r) => !r.allowed);
    expect(allowed).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].reason).toBe("credit_limit");
    expect(refused[0].remaining).toBe(0);
    expect(db.state.records).toHaveLength(1); // the month holds 1 credit spent, not 2
  });

  it("the gate asks for Serializable — the option the whole guarantee rests on", async () => {
    db.state.plan = plan(25);
    await tryConsumeGeneration(SHOP, "description", "gid://shopify/Product/1");
    expect(db.state.calls[0]).toMatchObject({ isolationLevel: "Serializable" });
  });

  it("a blog post debits 3 in one record, and two of them at 5 left leave exactly 2 — no partial second debit", async () => {
    db.state.plan = plan(5);
    const results = await Promise.all([
      tryConsumeGeneration(SHOP, "blog", "gid://shopify/Product/1"),
      tryConsumeGeneration(SHOP, "blog", "gid://shopify/Product/2"),
    ]);
    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    expect(results.find((r) => !r.allowed)).toMatchObject({ reason: "credit_limit", remaining: 2, required: 3 });
    expect(db.state.records.map((r) => r.credits)).toEqual([3]);
  });
});
