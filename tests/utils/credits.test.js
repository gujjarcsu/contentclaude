/**
 * Phase 0 items 4, 5 and 10 — the merchant is charged for what they got, and
 * uninstalling is not a way to reset the meter.
 *
 *  item 4  A bulk job may only contain work the quota can pay for.
 *  item 5  A credit taken for a generation that fails or comes back empty is
 *          given back. Before this, a 45 s timeout, a 5xx or an open circuit
 *          breaker silently ate one of the 25 free generations.
 *  item 10 The 7-day trial is once per shop for the life of the shop, and the
 *          monthly usage count survives uninstall — Plan and UsageRecord are
 *          both deleted on uninstall, so reinstalling minted a fresh allowance
 *          and a fresh trial on demand.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    plan: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    usageRecord: {
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({})),
      createMany: vi.fn(async () => ({ count: 0 })),
      findFirst: vi.fn(async () => ({ id: "u1" })),
      delete: vi.fn(async () => ({})),
    },
    shop: { findUnique: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 1 })) },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (k, supplier) => supplier()),
  invalidateCache: vi.fn(async () => {}),
  getRedis: async () => null,
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  sliceToQuota,
  remainingGenerations,
  withGenerationCredit,
  refundGeneration,
  hasUsedTrial,
  markTrialUsed,
  captureUsageCarryover,
  restoreUsageCarryover,
} = await import("../../app/utils/plans.server.js");

const SHOP = "s.myshopify.com";
const ids = (n) => Array.from({ length: n }, (_, i) => `gid://shopify/Product/${i + 1}`);

beforeEach(() => {
  vi.clearAllMocks();
  prisma.usageRecord.count.mockResolvedValue(0);
  prisma.usageRecord.findFirst.mockResolvedValue({ id: "u1" });
  prisma.shop.findUnique.mockResolvedValue(null);
  prisma.plan.findUnique.mockResolvedValue({ status: "active", monthlyLimit: 25 });
});

describe("item 4 — a bulk job is sliced to the quota at creation", () => {
  it("keeps only what the quota covers and records the rest as skipped", () => {
    expect(sliceToQuota(ids(5000), 200)).toEqual({
      targetIds: ids(5000).slice(0, 200),
      quotaSkipped: 4800,
    });
  });

  it("passes everything through when the quota is larger than the catalogue", () => {
    const out = sliceToQuota(ids(3), 25);
    expect(out.targetIds).toHaveLength(3);
    expect(out.quotaSkipped).toBe(0);
  });

  it("produces an empty job rather than a negative slice when nothing is left", () => {
    expect(sliceToQuota(ids(4), 0)).toEqual({ targetIds: [], quotaSkipped: 4 });
    expect(sliceToQuota(ids(4), -7)).toEqual({ targetIds: [], quotaSkipped: 4 });
    expect(sliceToQuota(ids(4), undefined)).toEqual({ targetIds: [], quotaSkipped: 4 });
  });

  it("remainingGenerations is uncached and reflects credits just spent", async () => {
    prisma.usageRecord.count.mockResolvedValueOnce(20);
    expect(await remainingGenerations(SHOP)).toBe(5);
    prisma.usageRecord.count.mockResolvedValueOnce(25);
    expect(await remainingGenerations(SHOP)).toBe(0);
    prisma.usageRecord.count.mockResolvedValueOnce(40); // over limit (plan downgraded)
    expect(await remainingGenerations(SHOP)).toBe(0);
  });

  it("remainingGenerations is 0 for a missing or inactive plan", async () => {
    prisma.plan.findUnique.mockResolvedValueOnce(null);
    expect(await remainingGenerations(SHOP)).toBe(0);
    prisma.plan.findUnique.mockResolvedValueOnce({ status: "frozen", monthlyLimit: 200 });
    expect(await remainingGenerations(SHOP)).toBe(0);
  });
});

describe("item 4 — every bulk entry point slices before it enqueues (source guard)", () => {
  const code = (f) =>
    readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  for (const f of [
    "app/routes/app.optimize.jsx",
    "app/routes/app.products.jsx",
    "app/routes/app.welcome.jsx",
  ]) {
    it(`${f} asks how many credits are left and slices to them`, () => {
      const src = code(f);
      expect(src).toMatch(/remainingGenerations\(/);
      expect(src).toMatch(/sliceToQuota\(/);
      // and records what it left out
      expect(src).toMatch(/quotaSkipped/);
    });
  }

  it("the bulk processor checks the remaining count before calling the model", () => {
    const src = code("app/utils/bulkProcessor.server.js");
    const check = src.indexOf("remainingGenerations(");
    const generate = src.indexOf("await generateProductContent(");
    expect(check).toBeGreaterThan(-1);
    expect(generate).toBeGreaterThan(-1);
    expect(check).toBeLessThan(generate);
  });
});

describe("item 5 — a failed or empty generation is never charged", () => {
  const allow = () => prisma.$transaction.mockResolvedValue({ allowed: true, planName: "free", monthlyLimit: 25, remaining: 24 });
  const deny = () => prisma.$transaction.mockResolvedValue({ allowed: false, planName: "free", monthlyLimit: 25, remaining: 0 });

  it("keeps the credit when the work succeeds", async () => {
    allow();
    const out = await withGenerationCredit(SHOP, { contentType: "description", productId: "p1" }, async () => ({
      description: "real copy",
    }));
    expect(out).toMatchObject({ allowed: true, refunded: false });
    expect(prisma.usageRecord.delete).not.toHaveBeenCalled();
  });

  it("refunds and rethrows when the model call throws (timeout, 5xx, breaker open)", async () => {
    allow();
    await expect(
      withGenerationCredit(SHOP, { contentType: "description", productId: "p1" }, async () => {
        throw new Error("Request timed out");
      }),
    ).rejects.toThrow("Request timed out");
    expect(prisma.usageRecord.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("refunds when the model returns nothing usable", async () => {
    allow();
    const out = await withGenerationCredit(SHOP, { contentType: "description", productId: "p1" }, async () => ({
      description: "   ",
      metaTitle: "",
    }));
    expect(out.refunded).toBe(true);
    expect(prisma.usageRecord.delete).toHaveBeenCalled();
  });

  it("refunds on null, empty string and empty object results", async () => {
    for (const value of [null, undefined, "", "   ", {}]) {
      vi.clearAllMocks();
      prisma.usageRecord.findFirst.mockResolvedValue({ id: "u1" });
      allow();
      const out = await withGenerationCredit(SHOP, { contentType: "description" }, async () => value);
      expect(out.refunded, JSON.stringify(value)).toBe(true);
    }
  });

  it("honours a caller-supplied emptiness rule", async () => {
    allow();
    const out = await withGenerationCredit(
      SHOP,
      { contentType: "blog" },
      async () => ({ title: "Title only", content: "" }),
      { isEmpty: (r) => !r?.content?.trim() },
    );
    expect(out.refunded).toBe(true);
  });

  it("never runs the work, and never charges, when the quota is exhausted", async () => {
    deny();
    const work = vi.fn();
    const out = await withGenerationCredit(SHOP, { contentType: "description" }, work);
    expect(out.allowed).toBe(false);
    expect(work).not.toHaveBeenCalled();
    expect(prisma.usageRecord.delete).not.toHaveBeenCalled();
  });

  it("a refund with no matching usage row is a no-op, not a crash", async () => {
    prisma.usageRecord.findFirst.mockResolvedValueOnce(null);
    expect(await refundGeneration(SHOP, { contentType: "description" })).toBe(false);
  });
});

describe("item 10 — one trial per shop, for the life of the shop", () => {
  it("reports the trial as unused for a shop that has never subscribed", async () => {
    prisma.shop.findUnique.mockResolvedValueOnce({ trialUsedAt: null });
    expect(await hasUsedTrial(SHOP)).toBe(false);
  });

  it("reports the trial as used once a paid subscription has been held", async () => {
    prisma.shop.findUnique.mockResolvedValueOnce({ trialUsedAt: new Date() });
    expect(await hasUsedTrial(SHOP)).toBe(true);
  });

  it("assumes the trial is used when the lookup fails, rather than granting a second one", async () => {
    prisma.shop.findUnique.mockRejectedValueOnce(new Error("db down"));
    expect(await hasUsedTrial(SHOP)).toBe(true);
  });

  it("stamps the flag first-writer-wins on the Shop row, which survives uninstall", async () => {
    await markTrialUsed(SHOP);
    expect(prisma.shop.updateMany).toHaveBeenCalledWith({
      where: { shop: SHOP, trialUsedAt: null },
      data: { trialUsedAt: expect.any(Date) },
    });
  });

  it("never throws when the stamp fails", async () => {
    prisma.shop.updateMany.mockRejectedValueOnce(new Error("db down"));
    await expect(markTrialUsed(SHOP)).resolves.toBeUndefined();
  });
});

describe("item 10 — monthly usage survives uninstall and reinstall", () => {
  const month = new Date().toISOString().slice(0, 7);

  it("captures this month's count onto the Shop row before the data is deleted", async () => {
    prisma.usageRecord.count.mockResolvedValueOnce(17);
    expect(await captureUsageCarryover(SHOP)).toBe(17);
    expect(prisma.shop.updateMany).toHaveBeenCalledWith({
      where: { shop: SHOP },
      data: { usageMonth: month, usageCarryover: 17 },
    });
  });

  it("restores the missing rows on reinstall, so the free allowance is not reset", async () => {
    prisma.shop.findUnique.mockResolvedValueOnce({ usageMonth: month, usageCarryover: 17 });
    prisma.usageRecord.count.mockResolvedValueOnce(0); // uninstall deleted them all
    expect(await restoreUsageCarryover(SHOP)).toBe(17);
    expect(prisma.usageRecord.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.usageRecord.createMany.mock.calls[0][0].data).toHaveLength(17);
  });

  it("is idempotent — a second reinstall in the same month adds nothing", async () => {
    prisma.shop.findUnique.mockResolvedValueOnce({ usageMonth: month, usageCarryover: 17 });
    prisma.usageRecord.count.mockResolvedValueOnce(17);
    expect(await restoreUsageCarryover(SHOP)).toBe(0);
    expect(prisma.usageRecord.createMany).not.toHaveBeenCalled();
  });

  it("does not carry usage into a NEW month — that allowance is genuinely fresh", async () => {
    prisma.shop.findUnique.mockResolvedValueOnce({ usageMonth: "2020-01", usageCarryover: 25 });
    expect(await restoreUsageCarryover(SHOP)).toBe(0);
    expect(prisma.usageRecord.createMany).not.toHaveBeenCalled();
  });

  it("never throws, on either side", async () => {
    prisma.usageRecord.count.mockRejectedValueOnce(new Error("db down"));
    expect(await captureUsageCarryover(SHOP)).toBe(0);
    prisma.shop.findUnique.mockRejectedValueOnce(new Error("db down"));
    expect(await restoreUsageCarryover(SHOP)).toBe(0);
  });
});
