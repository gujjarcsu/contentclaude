/**
 * B4 — trial credits, in their own bucket.
 *
 * 14 days, 250 credits, held separately from the plan's monthly allowance.
 *
 * The arithmetic that decides it (`14-PRICING.md` §5): a trial carrying the full
 * Growth allowance exposes **$17.25 per abusive trial — $1,725 across a hundred
 * of them**. 250 credits caps that at **$2.88**, is still 2.5× the free tier,
 * and is enough to prove the product on a real slice of a real catalogue.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRIAL_CREDITS, TRIAL_DAYS } from "../../app/utils/billing-plans.js";
import { buildBillingConfig } from "../../app/utils/billing-config.js";

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
const future = () => new Date(Date.now() + 7 * 864e5);
const past = () => new Date(Date.now() - 1 * 864e5);

let shopUpdate;

/** Drive the gate for a shop, optionally mid-trial. */
async function gate({ trialEndsAt = null, trialCreditsUsed = 0, monthlySpent = 0, contentType = "description" }) {
  const { tryConsumeGeneration } = await import("../../app/utils/plans.server.js");
  shopUpdate = vi.fn(async () => ({}));
  prisma.$transaction.mockImplementation(async (fn) =>
    fn({
      plan: {
        findUnique: async () => ({
          shop: SHOP,
          planName: "growth",
          status: "active",
          monthlyCredits: 1500,
          trialEndsAt,
        }),
      },
      usageRecord: {
        aggregate: async () => ({ _sum: { credits: monthlySpent } }),
        findFirst: async () => ({ id: "covered" }),
        groupBy: async () => [],
        create: async (a) => ({ id: "ur", ...a.data }),
      },
      shop: { findUnique: async () => ({ trialCreditsUsed }), update: shopUpdate },
    }),
  );
  return tryConsumeGeneration(SHOP, contentType, "gid://p/1");
}

describe("B4 — the trial allowance is 250, not the plan's", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is 250 credits over 14 days — each measured where it is USED", () => {
    // P5.0 — `expect(TRIAL_DAYS).toBe(14)` used to stand here alone, and it was
    // the most expensive green in the project: TRIAL_DAYS was imported by
    // nothing, the value that reached Shopify was a literal `trialDays: 7`, and
    // this assertion was true for the entire time production granted 7-day
    // trials.
    //
    // Each constant is now asserted through a CONSUMER. TRIAL_CREDITS is read
    // by the quota gate, which every other test in this file exercises.
    // TRIAL_DAYS is read by the billing config — the object handed to Shopify —
    // so that is what is checked here.
    expect(TRIAL_CREDITS).toBe(250);
    const config = buildBillingConfig({ every30Days: "EVERY_30_DAYS", annual: "ANNUAL" });
    const lengths = [...new Set(Object.values(config).map((e) => e.trialDays))];
    expect(lengths, "plans do not all offer the same trial").toEqual([14]);
    expect(lengths[0]).toBe(TRIAL_DAYS);
  });

  it("a trialling merchant is bounded by 250, NOT by the plan's 1,500", async () => {
    // This is the whole point. Growth's monthly allowance is 1,500 credits; a
    // trial that handed those out would cost $17.25 per abusive trial.
    const r = await gate({ trialEndsAt: future(), trialCreditsUsed: 250, monthlySpent: 0 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("trial_limit");
    expect(r.trialCredits).toBe(250);
    expect(r.remaining).toBe(0);
  });

  it("allows generation while trial credits remain", async () => {
    const r = await gate({ trialEndsAt: future(), trialCreditsUsed: 249 });
    expect(r.allowed).toBe(true);
    expect(r.inTrial).toBe(true);
    expect(r.remaining).toBe(0); // 250 - 249 - 1
  });

  it("charges the trial bucket, not the monthly one", async () => {
    await gate({ trialEndsAt: future(), trialCreditsUsed: 10 });
    expect(shopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { trialCreditsUsed: { increment: 1 } } }),
    );
  });

  it("a blog post costs the trial bucket 3, like anywhere else", async () => {
    await gate({ trialEndsAt: future(), trialCreditsUsed: 0, contentType: "blog" });
    expect(shopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { trialCreditsUsed: { increment: 3 } } }),
    );
  });

  it("alt text stays unmetered during a trial and touches neither bucket", async () => {
    const r = await gate({ trialEndsAt: future(), trialCreditsUsed: 250, contentType: "altText" });
    expect(r.allowed).toBe(true);
    expect(shopUpdate).not.toHaveBeenCalled();
  });
});

describe("B4 — the two buckets do not leak into each other", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an EXPIRED trial falls back to the monthly allowance", async () => {
    // 1,499 of 1,500 spent, trial over: one more is allowed on the plan.
    const r = await gate({ trialEndsAt: past(), trialCreditsUsed: 250, monthlySpent: 1499 });
    expect(r.allowed).toBe(true);
    expect(r.inTrial).toBe(false);
    // and it charges the monthly bucket, not the trial one
    expect(shopUpdate).not.toHaveBeenCalled();
  });

  it("a shop with NO trial is bounded by the monthly allowance only", async () => {
    const r = await gate({ trialEndsAt: null, trialCreditsUsed: 0, monthlySpent: 1500 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("credit_limit");
  });

  it("a trialling merchant is NOT blocked by a spent monthly allowance", async () => {
    // The merchant has not paid for the monthly allowance yet, so it is not the
    // number that binds them. Blocking here would end a trial early and look
    // like the product does not work.
    const r = await gate({ trialEndsAt: future(), trialCreditsUsed: 0, monthlySpent: 1500 });
    expect(r.allowed).toBe(true);
    expect(r.inTrial).toBe(true);
  });

  it("the refusal names the TRIAL limit, not the plan limit", async () => {
    const r = await gate({ trialEndsAt: future(), trialCreditsUsed: 250 });
    expect(r.reason).toBe("trial_limit");
    expect(r.reason).not.toBe("credit_limit");
    // and it reports the trial numbers so the UI can say which one was hit
    expect(r.trialCreditsUsed).toBe(250);
  });
});

describe("B4 — one trial per shop, ever", () => {
  it("the counter lives on Shop, which survives uninstall", async () => {
    // Plan and UsageRecord are DELETED on uninstall (Phase 0 item 10); Shop is
    // not. If the trial counter lived on Plan, uninstalling and reinstalling
    // would mint a fresh 250 credits every time.
    const { readFileSync } = await import("node:fs");
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const shopModel = schema.slice(schema.indexOf("model Shop {"), schema.indexOf("model ProductScore"));
    expect(shopModel).toContain("trialCreditsUsed");
    // and trialUsedAt, the existing "has this shop ever trialled" marker
    expect(shopModel).toContain("trialUsedAt");

    const planModel = schema.slice(schema.indexOf("model Plan {"), schema.indexOf("model UsageRecord"));
    expect(planModel, "the trial counter must NOT live on Plan").not.toContain("trialCreditsUsed");
  });
});
