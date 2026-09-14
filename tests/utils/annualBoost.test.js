/**
 * B5 — the one-time 2× credit month on an annual subscription.
 *
 * `14-PRICING.md` §5 calls it the best-value line in the table: $17.25 on Growth
 * against $287.90 already collected, and it solves the merchant's real problem —
 * the initial catalogue burst — in exchange for the twelve-month commitment.
 *
 * The requirement that shapes the design: **"once, ever" must be STRUCTURALLY
 * true, not a flag someone can flip.**
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    plan: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    usageRecord: {
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _sum: { credits: 0 } })),
      create: vi.fn(async () => ({ id: "ur" })),
      findFirst: vi.fn(async () => null),
      groupBy: vi.fn(async () => []),
    },
    shop: { findUnique: vi.fn(async () => null), update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })) },
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
const MONTH = new Date().toISOString().slice(0, 7);

describe("B5 — granting the boost is once-ever by construction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps the month with a first-writer-wins update gated on null", async () => {
    const { grantAnnualBoost } = await import("../../app/utils/plans.server.js");
    prisma.shop.updateMany.mockResolvedValue({ count: 1 });

    await expect(grantAnnualBoost(SHOP, MONTH)).resolves.toBe(true);
    expect(prisma.shop.updateMany).toHaveBeenCalledWith({
      // The null in the WHERE is what makes "once, ever" structural rather than
      // a flag: a second call updates zero rows.
      where: { shop: SHOP, annualBoostMonth: null },
      data: { annualBoostMonth: MONTH },
    });
  });

  it("a SECOND grant changes nothing — redelivered webhooks are idempotent by construction", async () => {
    // Shopify redelivers webhooks. This is idempotent because of the WHERE
    // clause, not because anyone remembered to check first.
    const { grantAnnualBoost } = await import("../../app/utils/plans.server.js");
    prisma.shop.updateMany.mockResolvedValue({ count: 0 });
    await expect(grantAnnualBoost(SHOP, MONTH)).resolves.toBe(false);
  });

  it("never throws — a missed boost must not fail a subscription webhook", async () => {
    const { grantAnnualBoost } = await import("../../app/utils/plans.server.js");
    prisma.shop.updateMany.mockRejectedValue(new Error("db down"));
    await expect(grantAnnualBoost(SHOP, MONTH)).resolves.toBe(false);
  });

  it("the column lives on Shop, which survives uninstall", async () => {
    // Plan is DELETED on uninstall and Shop is not. On Plan, a merchant could
    // cancel, uninstall, reinstall and resubscribe for a second 2x month.
    const { readFileSync } = await import("node:fs");
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const shopModel = schema.slice(schema.indexOf("model Shop {"), schema.indexOf("model ProductScore"));
    expect(shopModel).toContain("annualBoostMonth");
    const planModel = schema.slice(schema.indexOf("model Plan {"), schema.indexOf("model UsageRecord"));
    expect(planModel).not.toContain("annualBoostMonth");
  });
});

describe("B5 — the gate honours the boost, for exactly one month", () => {
  beforeEach(() => vi.clearAllMocks());

  async function gate({ annualBoostMonth, spent }) {
    const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: {
          findUnique: async () => ({ shop: SHOP, planName: "growth", status: "active", monthlyCredits: 1500, trialEndsAt: null }),
        },
        usageRecord: {
          aggregate: async () => ({ _sum: { credits: spent } }),
          findFirst: async () => ({ id: "covered" }),
          groupBy: async () => [],
          create: async (a) => ({ id: "ur", ...a.data }),
        },
        shop: { findUnique: async () => ({ trialCreditsUsed: 0, annualBoostMonth }), update: vi.fn() },
      }),
    );
    return tryConsumeGeneration(SHOP, "description", "gid://p/1");
  }

  it("doubles the allowance in the stamped month", async () => {
    // 1,500 spent would normally be exhausted. Boosted, the ceiling is 3,000.
    const r = await gate({ annualBoostMonth: MONTH, spent: 1500 });
    expect(r.allowed).toBe(true);
    expect(r.boosted).toBe(true);
  });

  it("still ends at twice the allowance, not infinitely", async () => {
    const r = await gate({ annualBoostMonth: MONTH, spent: 3000 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("credit_limit");
  });

  it("does NOT apply in any other month — one boosted month, not two", async () => {
    // A merchant who subscribes on the 28th must not get the rest of that month
    // AND the whole of the next one.
    const r = await gate({ annualBoostMonth: "2020-01", spent: 1500 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("credit_limit");
  });

  it("a shop that never subscribed annually is unaffected", async () => {
    const r = await gate({ annualBoostMonth: null, spent: 1500 });
    expect(r.allowed).toBe(false);
    const ok = await gate({ annualBoostMonth: null, spent: 1499 });
    expect(ok.allowed).toBe(true);
    expect(ok.boosted).toBe(false);
  });
});

describe("B5 — only an ANNUAL subscription grants it", () => {
  it("the webhook checks the name it was sent, because getPlanByKey matches both", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/routes/webhooks.app.subscriptions_update.jsx", "utf8");
    // getPlanByKey resolves "Growth Plan" and "Growth Annual" to the SAME plan
    // definition, so the only way to tell which was bought is sub.name.
    expect(src).toMatch(/sub\.name === planDef\.annualKey/);
    expect(src).toMatch(/grantAnnualBoost\(shop\)/);
  });
});
