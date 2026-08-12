/**
 * Regression: the Redis cache round-trips values through JSON, so on a cache
 * HIT getOrCreatePlan received Prisma DateTime fields as ISO strings — and the
 * Plans loader then crashed on plan.currentPeriodEnd.toISOString() with a 500
 * on every warm load. Only shops with a paid subscription (non-null
 * currentPeriodEnd) were affected, which is why it first surfaced during the
 * live annual-billing verification and never in dev.
 *
 * getOrCreatePlan must return real Date objects (or null) for date fields
 * regardless of whether the cache hit (JSON strings) or missed (Prisma Dates).
 */
import { describe, it, expect, vi } from "vitest";

const PERIOD_END = "2027-08-12T06:00:00.000Z";

// Simulate a WARM Redis cache: whatever the supplier returns is JSON
// round-tripped, exactly like redis.get -> JSON.parse of a stored value.
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: async (_key, supplier) => JSON.parse(JSON.stringify(await supplier())),
  setCache: async () => {},
  invalidateCache: async () => {},
}));

vi.mock("../../app/db.server.js", () => ({
  default: {
    plan: {
      findUnique: vi.fn(async () => ({
        shop: "warm-cache.myshopify.com",
        planName: "growth",
        status: "active",
        monthlyLimit: 200,
        shopifyChargeId: "gid://shopify/AppSubscription/1",
        currentPeriodEnd: new Date(PERIOD_END),
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-12T05:00:00.000Z"),
      })),
      create: vi.fn(),
    },
  },
}));

const { getOrCreatePlan } = await import("../../app/utils/plans.server.js");

describe("getOrCreatePlan date rehydration (Redis JSON round-trip)", () => {
  it("returns a real Date for currentPeriodEnd on a cache hit", async () => {
    const plan = await getOrCreatePlan("warm-cache.myshopify.com");
    expect(plan.currentPeriodEnd).toBeInstanceOf(Date);
    // The exact loader expression that produced the 500:
    expect(plan.currentPeriodEnd?.toISOString() ?? null).toBe(PERIOD_END);
  });

  it("rehydrates createdAt/updatedAt too", async () => {
    const plan = await getOrCreatePlan("warm-cache.myshopify.com");
    expect(plan.createdAt).toBeInstanceOf(Date);
    expect(plan.updatedAt).toBeInstanceOf(Date);
  });

  it("leaves a null currentPeriodEnd null (free plan)", async () => {
    const db = (await import("../../app/db.server.js")).default;
    db.plan.findUnique.mockResolvedValueOnce({
      shop: "free.myshopify.com",
      planName: "free",
      status: "active",
      monthlyLimit: 25,
      shopifyChargeId: null,
      currentPeriodEnd: null,
    });
    const plan = await getOrCreatePlan("free.myshopify.com");
    expect(plan.currentPeriodEnd).toBeNull();
    expect(plan.currentPeriodEnd?.toISOString() ?? null).toBeNull();
  });
});
