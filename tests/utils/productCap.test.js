/**
 * B2 — the second axis. A plan is a PAIR: a credit budget and a number of
 * products the app will act on.
 *
 * The product cap is what bounds the free tier. Alt text is unmetered — 0
 * credits on every plan — so the credit budget alone puts no ceiling on it at
 * all: without a product cap, unmetered alt text on a 10,000-image store is
 * unbounded. `14-PRICING.md` §4.4 prices the worst realistic free install at
 * ≈$1.51/month, and that number is only true because of the 100-product cap.
 *
 * And the refusal has to name WHICH limit was hit. "You've hit your limit" while
 * a merchant is holding 400 unspent credits is a support ticket we pay for.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    plan: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    usageRecord: {
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _sum: { credits: 0 } })),
      create: vi.fn(async () => ({ id: "ur_1" })),
      findFirst: vi.fn(async () => null),
      groupBy: vi.fn(async () => []),
    },
    shop: { findUnique: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 1 })) },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (k, s) => s()),
  invalidateCache: vi.fn(async () => {}),
  getRedis: async () => null,
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const SHOP = "s.myshopify.com";

/** Run the gate against a shop on `planName` that already covers `covered` products. */
async function gate({ planName, covered, alreadyCovered = false, spent = 0, productId = "gid://p/new" }) {
  const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");
  const { planLimitsFor } = await import("../../app/utils/billing-plans.js");
  const limits = planLimitsFor(planName);

  const tx = {
    plan: {
      findUnique: async () => ({
        shop: SHOP,
        planName,
        status: "active",
        monthlyCredits: limits.monthlyCredits,
      }),
    },
    usageRecord: {
      aggregate: async () => ({ _sum: { credits: spent } }),
      findFirst: async () => (alreadyCovered ? { id: "seen" } : null),
      groupBy: async () => Array.from({ length: covered }, (_, i) => ({ productId: `p${i}` })),
      create: async (a) => ({ id: "ur_new", ...a.data }),
    },
  };
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  return tryConsumeGeneration(SHOP, "description", productId);
}

describe("B2 — the product cap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a NEW product once the plan's products are covered", async () => {
    const r = await gate({ planName: "free", covered: 100 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("product_limit");
    expect(r.productLimit).toBe(100);
    expect(r.productsCovered).toBe(100);
  });

  it("allows a new product while there are slots left", async () => {
    const r = await gate({ planName: "free", covered: 99 });
    expect(r.allowed).toBe(true);
  });

  it("NEVER refuses a product it has already acted on, however many regenerations", async () => {
    // A merchant who covers 100 products and regenerates one of them is not
    // asking for a 101st. Charging them a slot would make the cap shrink every
    // time they improved something.
    const r = await gate({ planName: "free", covered: 100, alreadyCovered: true });
    expect(r.allowed).toBe(true);
  });

  it("Pro is unlimited on products", async () => {
    const r = await gate({ planName: "pro", covered: 50_000 });
    expect(r.allowed).toBe(true);
  });

  it("the refusal names WHICH limit — credits or products", async () => {
    // "You've hit your limit" while holding 400 unspent credits is a support
    // ticket we pay for.
    const byProducts = await gate({ planName: "free", covered: 100, spent: 0 });
    expect(byProducts.reason).toBe("product_limit");
    expect(byProducts.remaining).toBe(100); // credits are untouched, and it says so

    const byCredits = await gate({ planName: "free", covered: 1, spent: 100 });
    expect(byCredits.reason).toBe("credit_limit");
    expect(byCredits.remaining).toBe(0);
  });

  it("checks products BEFORE credits, so the message is the true reason", async () => {
    // Both exhausted: the merchant is out of products AND out of credits.
    // Products is the more actionable answer, because more credits will not help.
    const r = await gate({ planName: "free", covered: 100, spent: 100 });
    expect(r.reason).toBe("product_limit");
  });

  it("a generation with no product never consumes a product slot", async () => {
    // Blog posts and the synthetic `carryover` rows have a null productId.
    const r = await gate({ planName: "free", covered: 100, productId: null });
    expect(r.allowed).toBe(true);
  });
});

describe("B2 — unmetered content is still allowed at zero credits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("alt text generates with the credit allowance fully spent", async () => {
    // 14-PRICING.md §4: "Alt text — unmetered" on every plan. A gate that
    // refused it would make the plan card a lie.
    const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: { findUnique: async () => ({ shop: SHOP, planName: "free", status: "active", monthlyCredits: 100 }) },
        usageRecord: {
          aggregate: async () => ({ _sum: { credits: 100 } }), // fully spent
          findFirst: async () => ({ id: "seen" }), // product already covered
          groupBy: async () => [],
          create: async (a) => ({ id: "ur", ...a.data }),
        },
      }),
    );
    const r = await tryConsumeGeneration(SHOP, "altText", "gid://p/1");
    expect(r.allowed).toBe(true);
    expect(r.credits).toBe(0);
  });
});
