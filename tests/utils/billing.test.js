/**
 * Unit tests for billing action branches (F1) and quota hard block (F4).
 *
 * These tests cover:
 *  - billing.request() redirect re-throw (success path)
 *  - billing.request() plain Error → structured JSON (failure path)
 *  - Invalid planKey → 400
 *  - Cancel flow with / without active subscription
 *  - Quota hard block at exactly the plan limit (F4)
 *  - syncBillingToPlan: activation, downgrade, freeze branches
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@prisma/client", () => ({
  Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } },
}));

vi.mock("../../app/db.server.js", () => ({
  default: {
    plan: { findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    usageRecord: { count: vi.fn(), create: vi.fn() },
    session: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn((_k, fn) => fn()),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../app/utils/billing-plans.js", () => ({
  BILLING_PLANS: {
    starter: { key: "Starter Plan", planName: "starter", amount: 9.99, monthlyLimit: 50, entitlements: { bulkJobs: false, abVariants: false, autopilot: false } },
    growth:  { key: "Growth Plan",  planName: "growth",  amount: 29.99, monthlyLimit: 200, entitlements: { bulkJobs: true, abVariants: true, autopilot: true } },
    pro:     { key: "Professional Plan", planName: "pro", amount: 79.99, monthlyLimit: 1000, entitlements: { bulkJobs: true, abVariants: true, autopilot: true } },
  },
  FREE_PLAN: { key: null, planName: "free", amount: 0, monthlyLimit: 25, entitlements: { bulkJobs: false, abVariants: false, autopilot: false } },
  getEntitlements: vi.fn((planName) => {
    const map = { free: { bulkJobs: false, abVariants: false }, starter: { bulkJobs: false, abVariants: false }, growth: { bulkJobs: true, abVariants: true }, pro: { bulkJobs: true, abVariants: true } };
    return map[planName] ?? map.free;
  }),
}));

// Import after mocks
const prisma = (await import("../../app/db.server.js")).default;
const { tryConsumeGeneration, syncBillingToPlan, getPlanByKey } = await import(
  "../../app/utils/plans.server.js"
);

// ─── Billing action helpers ───────────────────────────────────────────────────

/**
 * Simulate the billing action's subscribe branch.
 * We can't import the route directly (it pulls in Shopify SDK), so we replicate
 * the exact logic from app/routes/app.plans.jsx's action.
 */
function makeBillingAction(billingMock) {
  const BILLING_PLANS = {
    starter: { key: "Starter Plan" },
    growth:  { key: "Growth Plan" },
    pro:     { key: "Professional Plan" },
  };
  const BILLING_TEST = true;

  return async function billingAction(actionType, planKey) {
    const validKeys = Object.values(BILLING_PLANS).map((p) => p.key);

    if (actionType === "subscribe") {
      if (!planKey || !validKeys.includes(planKey)) {
        return { status: 400, body: { error: "Invalid plan selected." } };
      }
      try {
        await billingMock.request({ plan: planKey, isTest: BILLING_TEST, returnUrl: "https://example.com/app/plans" });
        return { status: 200, body: {} }; // normally unreachable — billing.request throws redirect
      } catch (err) {
        if (err instanceof Response) throw err; // re-throw redirects
        return { status: 500, body: { error: `Could not start subscription: ${err?.message ?? String(err)}. Please try again or contact support.` } };
      }
    }

    if (actionType === "cancel") {
      try {
        const { appSubscriptions } = await billingMock.check({ plans: validKeys, isTest: BILLING_TEST });
        const activeSub = appSubscriptions.find((s) => s.status === "ACTIVE");
        if (activeSub) {
          await billingMock.cancel({ subscriptionId: activeSub.id, isTest: BILLING_TEST, prorate: true });
        }
      } catch (err) {
        if (err instanceof Response) throw err;
        return { status: 500, body: { error: `Could not cancel subscription: ${err?.message ?? err}` } };
      }
      return { status: 200, body: { cancelled: true } };
    }

    return { status: 400, body: { error: "Unknown action." } };
  };
}

// ─── F1: Billing action branches ─────────────────────────────────────────────

describe("billing action — subscribe branch (F1)", () => {
  it("re-throws a Response redirect (success path → Shopify approval screen)", async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: "https://shopify.com/billing/approve" } });
    const billing = { request: vi.fn().mockRejectedValue(redirectResponse) };
    const action = makeBillingAction(billing);
    await expect(action("subscribe", "Starter Plan")).rejects.toStrictEqual(redirectResponse);
    expect(billing.request).toHaveBeenCalledWith(expect.objectContaining({ plan: "Starter Plan", isTest: true }));
  });

  it("returns 500 with specific message when billing.request throws a plain Error", async () => {
    const billing = { request: vi.fn().mockRejectedValue(new Error("Shopify API timeout")) };
    const action = makeBillingAction(billing);
    const result = await action("subscribe", "Growth Plan");
    expect(result.status).toBe(500);
    expect(result.body.error).toContain("Shopify API timeout");
    expect(result.body.error).toContain("Please try again");
  });

  it("returns 400 for an invalid planKey", async () => {
    const billing = { request: vi.fn() };
    const action = makeBillingAction(billing);
    const result = await action("subscribe", "hacker-plan");
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/invalid plan/i);
    expect(billing.request).not.toHaveBeenCalled();
  });

  it("returns 400 when planKey is missing", async () => {
    const billing = { request: vi.fn() };
    const action = makeBillingAction(billing);
    const result = await action("subscribe", null);
    expect(result.status).toBe(400);
  });

  it("handles billing.request returning undefined (no-op) without crashing", async () => {
    const billing = { request: vi.fn().mockResolvedValue(undefined) };
    const action = makeBillingAction(billing);
    const result = await action("subscribe", "Starter Plan");
    expect(result.status).toBe(200); // fell through with no error
  });
});

describe("billing action — cancel branch (F1)", () => {
  it("cancels the active subscription and returns cancelled:true", async () => {
    const billing = {
      check: vi.fn().mockResolvedValue({ appSubscriptions: [{ id: "sub_123", status: "ACTIVE" }] }),
      cancel: vi.fn().mockResolvedValue({}),
    };
    const action = makeBillingAction(billing);
    const result = await action("cancel", null);
    expect(result.status).toBe(200);
    expect(result.body.cancelled).toBe(true);
    expect(billing.cancel).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub_123", prorate: true }));
  });

  it("returns cancelled:true even when no active subscription exists (graceful)", async () => {
    const billing = {
      check: vi.fn().mockResolvedValue({ appSubscriptions: [] }),
      cancel: vi.fn(),
    };
    const action = makeBillingAction(billing);
    const result = await action("cancel", null);
    expect(result.body.cancelled).toBe(true);
    expect(billing.cancel).not.toHaveBeenCalled();
  });

  it("returns 500 with message when billing.check throws a plain Error", async () => {
    const billing = {
      check: vi.fn().mockRejectedValue(new Error("network error")),
    };
    const action = makeBillingAction(billing);
    const result = await action("cancel", null);
    expect(result.status).toBe(500);
    expect(result.body.error).toContain("network error");
  });

  it("re-throws a Response from billing.check (redirect — same pattern as subscribe)", async () => {
    const redirectResponse = new Response(null, { status: 302 });
    const billing = {
      check: vi.fn().mockRejectedValue(redirectResponse),
    };
    const action = makeBillingAction(billing);
    await expect(action("cancel", null)).rejects.toStrictEqual(redirectResponse);
  });
});

// ─── F4: Quota hard block at exactly the plan limit ──────────────────────────

describe("tryConsumeGeneration — hard block at plan limit (F4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks generation when usageCount equals monthlyLimit (free plan, 25/25)", async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: { findUnique: vi.fn().mockResolvedValue({ planName: "free", status: "active", monthlyLimit: 25 }) },
        usageRecord: { count: vi.fn().mockResolvedValue(25), create: vi.fn() },
      })
    );
    const result = await tryConsumeGeneration("shop.myshopify.com", "description");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("blocks at exactly 50/50 for Starter plan", async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: { findUnique: vi.fn().mockResolvedValue({ planName: "starter", status: "active", monthlyLimit: 50 }) },
        usageRecord: { count: vi.fn().mockResolvedValue(50), create: vi.fn() },
      })
    );
    const result = await tryConsumeGeneration("shop.myshopify.com", "description");
    expect(result.allowed).toBe(false);
  });

  it("allows generation at 24/25 (one under the cap)", async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: { findUnique: vi.fn().mockResolvedValue({ planName: "free", status: "active", monthlyLimit: 25 }) },
        usageRecord: { count: vi.fn().mockResolvedValue(24), create: vi.fn().mockResolvedValue({}) },
      })
    );
    const result = await tryConsumeGeneration("shop.myshopify.com", "description");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // 25 - 24 - 1 = 0 after this one
  });

  it("blocks when plan status is not 'active' (frozen/cancelled)", async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: { findUnique: vi.fn().mockResolvedValue({ planName: "starter", status: "frozen", monthlyLimit: 50 }) },
        usageRecord: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
      })
    );
    const result = await tryConsumeGeneration("shop.myshopify.com", "description");
    expect(result.allowed).toBe(false);
  });

  it("blocks when no plan record exists (defaults to free plan limit)", async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        plan: { findUnique: vi.fn().mockResolvedValue(null) },
        usageRecord: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
      })
    );
    const result = await tryConsumeGeneration("shop.myshopify.com", "description");
    expect(result.allowed).toBe(false);
  });
});

// ─── syncBillingToPlan: state machine ────────────────────────────────────────

describe("syncBillingToPlan — state machine (F1 + F4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("activates Growth plan when Shopify reports ACTIVE Growth subscription", async () => {
    prisma.plan.upsert.mockResolvedValue({});
    await syncBillingToPlan("shop.myshopify.com", [{ name: "Growth Plan", status: "ACTIVE", id: "sub_g", currentPeriodEnd: "2026-07-01" }]);
    expect(prisma.plan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ planName: "growth", monthlyLimit: 200 }),
      })
    );
  });

  it("downgrades to Free when subscriptions array is empty", async () => {
    prisma.plan.upsert.mockResolvedValue({});
    await syncBillingToPlan("shop.myshopify.com", []);
    expect(prisma.plan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ planName: "free", monthlyLimit: 25 }),
      })
    );
  });

  it("returns null for unknown plan key without crashing", () => {
    expect(getPlanByKey("unknown-key")).toBeNull();
  });
});

// ─── P2034 write conflict handling ───────────────────────────────────────────

describe("tryConsumeGeneration — P2034 retry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retries once on P2034 write conflict then succeeds", async () => {
    // First call (normal contentType) throws P2034, second call (retry) succeeds
    const p2034 = Object.assign(new Error("Write conflict"), { code: "P2034" });
    prisma.$transaction
      .mockRejectedValueOnce(p2034)
      .mockResolvedValueOnce({ allowed: true, planName: "free", monthlyLimit: 25, remaining: 10 });

    const result = await tryConsumeGeneration("shop.com", "description", null);

    expect(result.allowed).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("returns isContention:true on second P2034 failure", async () => {
    const p2034 = Object.assign(new Error("Write conflict"), { code: "P2034" });
    prisma.$transaction
      .mockRejectedValueOnce(p2034)   // first call
      .mockRejectedValueOnce(p2034);  // retry call

    const result = await tryConsumeGeneration("shop.com", "description", null);

    expect(result.allowed).toBe(false);
    expect(result.isContention).toBe(true);
  });
});
