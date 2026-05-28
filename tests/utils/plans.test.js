/**
 * Unit tests for app/utils/plans.server.js
 *
 * Uses Vitest's vi.mock to stub Prisma and shopify.server so no database
 * or Shopify connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock("@prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

vi.mock("../../app/db.server.js", () => ({
  default: {
    plan: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    usageRecord: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../app/utils/billing-plans.js", () => ({
  BILLING_PLANS: {
    starter: { key: "Starter Plan", planName: "starter", amount: 9.99, monthlyLimit: 50 },
    growth:  { key: "Growth Plan",  planName: "growth",  amount: 29.99, monthlyLimit: 200 },
    pro:     { key: "Professional Plan", planName: "pro", amount: 79.99, monthlyLimit: 1000 },
  },
  FREE_PLAN: { key: null, planName: "free", amount: 0, monthlyLimit: 25 },
}));

vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn((_key, supplier) => supplier()),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

const prisma = (await import("../../app/db.server.js")).default;
const { canGenerate, tryConsumeGeneration, getPlanByKey, FREE_PLAN } = await import(
  "../../app/utils/plans.server.js"
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getPlanByKey", () => {
  it("returns the matching plan definition", () => {
    const plan = getPlanByKey("Starter Plan");
    expect(plan.planName).toBe("starter");
    expect(plan.monthlyLimit).toBe(50);
  });

  it("returns null for unknown keys", () => {
    expect(getPlanByKey("Unknown Plan")).toBeNull();
  });
});

describe("canGenerate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns allowed:true when under limit", async () => {
    // getOrCreatePlan now calls findUnique first; return existing plan so create is skipped
    prisma.plan.findUnique.mockResolvedValue({
      planName: "free",
      status: "active",
      monthlyLimit: 10,
    });
    prisma.usageRecord.count.mockResolvedValue(3);

    const result = await canGenerate("test.myshopify.com");

    expect(result.allowed).toBe(true);
    expect(result.usageCount).toBe(3);
    expect(result.remaining).toBe(7);
  });

  it("returns allowed:false when at limit", async () => {
    prisma.plan.findUnique.mockResolvedValue({
      planName: "free",
      status: "active",
      monthlyLimit: 10,
    });
    prisma.usageRecord.count.mockResolvedValue(10);

    const result = await canGenerate("test.myshopify.com");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns allowed:false when plan is frozen", async () => {
    prisma.plan.findUnique.mockResolvedValue({
      planName: "starter",
      status: "frozen",
      monthlyLimit: 50,
    });
    prisma.usageRecord.count.mockResolvedValue(0);

    const result = await canGenerate("test.myshopify.com");

    expect(result.allowed).toBe(false);
  });
});

describe("tryConsumeGeneration (atomic gate)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows generation and writes usage record when under limit", async () => {
    prisma.usageRecord.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: {
          findUnique: vi.fn().mockResolvedValue({
            planName: "starter",
            status: "active",
            monthlyLimit: 50,
          }),
        },
        usageRecord: {
          count: vi.fn().mockResolvedValue(10),
          create: vi.fn().mockResolvedValue({}),
        },
      })
    );

    const result = await tryConsumeGeneration("shop.myshopify.com", "description", "gid://shopify/Product/123");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(39);
  });

  it("blocks generation when at limit", async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: {
          findUnique: vi.fn().mockResolvedValue({
            planName: "free",
            status: "active",
            monthlyLimit: 10,
          }),
        },
        usageRecord: {
          count: vi.fn().mockResolvedValue(10),
          create: vi.fn(),
        },
      })
    );

    const result = await tryConsumeGeneration("shop.myshopify.com", "description");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("blocks generation when plan is missing", async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: { findUnique: vi.fn().mockResolvedValue(null) },
        usageRecord: { count: vi.fn(), create: vi.fn() },
      })
    );

    const result = await tryConsumeGeneration("shop.myshopify.com", "description");

    expect(result.allowed).toBe(false);
  });

  it("returns allowed:false on Prisma write conflict (P2034)", async () => {
    const err = new Error("Write conflict");
    err.code = "P2034";
    prisma.$transaction.mockRejectedValue(err);

    const result = await tryConsumeGeneration("shop.myshopify.com", "description");

    expect(result.allowed).toBe(false);
  });

  it("allows free re-generation when product was generated in the last 24h", async () => {
    // findFirst returns a recent record → bypass the transaction entirely
    prisma.usageRecord.findFirst.mockResolvedValue({ id: "existing", createdAt: new Date() });

    const result = await tryConsumeGeneration(
      "shop.myshopify.com",
      "description",
      "gid://shopify/Product/999"
    );

    expect(result.allowed).toBe(true);
    expect(result.isFreeRegeneration).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("FREE_PLAN constant", () => {
  it("has correct default values", () => {
    expect(FREE_PLAN.planName).toBe("free");
    expect(FREE_PLAN.monthlyLimit).toBe(25);
    expect(FREE_PLAN.amount).toBe(0);
    expect(FREE_PLAN.key).toBeNull();
  });
});
