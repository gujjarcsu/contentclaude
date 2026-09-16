/**
 * Phase 15 — A BLOG POST COSTS EXACTLY 3 CREDITS, PROVED THROUGH THE REAL GATE.
 *
 * The brief's words: "if it is metered at 3 credits, prove the debit with a
 * test, because A8 says money is exact and this is the one place a merchant
 * would notice." So this does not read the weight table and call it proof — it
 * runs the whole serializable transaction body in `tryConsumeGeneration` and
 * reads the row that comes out. Only Prisma is a double.
 *
 * This lives apart from `tests/routes/planIntegrity.test.js` because that file
 * replaces `plans.server.js` wholesale in order to drive the route actions, and
 * a gate you have mocked proves nothing about a debit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, created } = vi.hoisted(() => {
  const created = [];
  const tx = {
    plan: { findUnique: vi.fn() },
    usageRecord: {
      aggregate: vi.fn(async () => ({ _sum: { credits: 0 } })),
      create: vi.fn(async (args) => {
        created.push(args.data);
        return { id: `u${created.length}` };
      }),
    },
    shop: { findUnique: vi.fn(async () => null), update: vi.fn(async () => ({})) },
    generatedContent: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null) },
  };
  return {
    created,
    prisma: {
      _tx: tx,
      // the real body runs; the isolation option is ignored by the double
      $transaction: vi.fn(async (fn) => fn(tx)),
      usageRecord: { findFirst: vi.fn(async () => ({ id: "u1" })), delete: vi.fn(async () => ({})), aggregate: vi.fn(async () => ({ _sum: { credits: 0 } })) },
      plan: { findUnique: vi.fn() },
      shop: { findUnique: vi.fn(async () => null) },
    },
  };
});

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (k, supplier) => supplier()),
  invalidateCache: vi.fn(async () => {}),
  getRedis: async () => null,
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");
const { CREDIT_WEIGHTS } = await import("../../app/utils/credits.js");

const SHOP = "s.myshopify.com";
const GROWTH = { status: "active", planName: "growth", monthlyCredits: 1500, trialEndsAt: null };

beforeEach(() => {
  created.length = 0;
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn) => fn(prisma._tx));
  prisma._tx.plan.findUnique.mockResolvedValue(GROWTH);
  prisma._tx.usageRecord.aggregate.mockResolvedValue({ _sum: { credits: 0 } });
  prisma._tx.shop.findUnique.mockResolvedValue(null);
});

describe("the debit a blog post takes", () => {
  it("writes a UsageRecord of exactly 3 credits", async () => {
    const out = await tryConsumeGeneration(SHOP, "blog", null);
    expect(out.allowed).toBe(true);
    expect(out.credits).toBe(CREDIT_WEIGHTS.blog);
    expect(out.credits).toBe(3);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ shop: SHOP, contentType: "blog", credits: 3, productId: null });
  });

  it("and the balance it reports back is 3 lower, not 1", async () => {
    const out = await tryConsumeGeneration(SHOP, "blog", null);
    expect(out.remaining).toBe(GROWTH.monthlyCredits - 3);
  });

  it("a product description beside it is 1 — the weighting is real, not decorative", async () => {
    const blog = await tryConsumeGeneration(SHOP, "blog", null);
    const desc = await tryConsumeGeneration(SHOP, "description", null);
    expect([blog.credits, desc.credits]).toEqual([3, 1]);
    expect(created.map((r) => r.credits)).toEqual([3, 1]);
  });

  it("alt text stays unmetered, and is still recorded", async () => {
    const out = await tryConsumeGeneration(SHOP, "altText", null);
    expect(out.credits).toBe(0);
    expect(created[0]).toMatchObject({ contentType: "altText", credits: 0 });
  });

  it("the refusal at the boundary says what the post WOULD have cost", async () => {
    // 2 credits left, a post needs 3: the caller has to be able to say
    // "a blog post needs 3 credits and you have 2".
    prisma._tx.usageRecord.aggregate.mockResolvedValue({ _sum: { credits: GROWTH.monthlyCredits - 2 } });
    const out = await tryConsumeGeneration(SHOP, "blog", null);
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe("credit_limit");
    expect(out.required).toBe(3);
    expect(out.remaining).toBe(2);
    expect(created).toHaveLength(0);
  });

  it("exactly 3 left is enough, and 3 is spent", async () => {
    prisma._tx.usageRecord.aggregate.mockResolvedValue({ _sum: { credits: GROWTH.monthlyCredits - 3 } });
    const out = await tryConsumeGeneration(SHOP, "blog", null);
    expect(out.allowed).toBe(true);
    expect(created[0].credits).toBe(3);
    expect(out.remaining).toBe(0);
  });

  it("a trial spends the trial bucket at 3 a post, not 1", async () => {
    prisma._tx.plan.findUnique.mockResolvedValue({ ...GROWTH, trialEndsAt: new Date(Date.now() + 86_400_000) });
    prisma._tx.shop.findUnique.mockResolvedValue({ trialCreditsUsed: 0, annualBoostMonth: null });
    const out = await tryConsumeGeneration(SHOP, "blog", null);
    expect(out.allowed).toBe(true);
    expect(out.inTrial).toBe(true);
    expect(prisma._tx.shop.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { trialCreditsUsed: { increment: 3 } } }),
    );
  });
});
