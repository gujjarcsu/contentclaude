/**
 * P0-3 regression tests — annual subscribers must never be downgraded to Free,
 * and cancel must never claim success without actually cancelling.
 *
 * Root cause: billing.check({ plans }) matches on EXACT subscription name.
 * Both call sites passed only the 3 monthly keys, so "Starter Annual" /
 * "Growth Annual" / "Professional Annual" never matched -> appSubscriptions
 * [] -> syncBillingToPlan(shop, []) -> plan dropped to free while the
 * merchant is billed up to $799.90/year.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, "..", "..");

vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
  BILLING_TEST: false,
  apiVersion: "2026-04",
}));

const syncBillingToPlan = vi.fn(() => Promise.resolve());
vi.mock("../../app/utils/plans.server", () => ({
  getOrCreatePlan: vi.fn(() => Promise.resolve({ planName: "starter", monthlyLimit: 50 })),
  getMonthlyUsageCount: vi.fn(() => Promise.resolve(0)),
  syncBillingToPlan: (...a) => syncBillingToPlan(...a),
}));

const ALL_SIX_KEYS = [
  "Starter Plan", "Growth Plan", "Professional Plan",
  "Starter Annual", "Growth Annual", "Professional Annual",
];

describe("P0-3: annual billing keys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("plans-reconcile checks ALL six plan keys (monthly + annual)", async () => {
    const { authenticate } = await import("../../app/shopify.server");
    const check = vi.fn(async () => ({ appSubscriptions: [] }));
    authenticate.admin.mockResolvedValue({
      billing: { check },
      session: { shop: "test.myshopify.com" },
    });
    const { loader } = await import("../../app/routes/app.plans-reconcile.jsx");
    await loader({ request: new Request("https://app.test/app/plans-reconcile") });

    expect(check).toHaveBeenCalled();
    const plansArg = check.mock.calls[0][0].plans;
    for (const key of ALL_SIX_KEYS) {
      expect(plansArg).toContain(key);
    }
  });

  it("cancel checks ALL six plan keys so an annual subscription can be found", async () => {
    const { authenticate } = await import("../../app/shopify.server");
    const check = vi.fn(async () => ({
      appSubscriptions: [{ id: "gid://shopify/AppSubscription/1", name: "Growth Annual", status: "ACTIVE" }],
    }));
    const cancel = vi.fn(async () => ({}));
    authenticate.admin.mockResolvedValue({
      billing: { check, cancel },
      session: { shop: "test.myshopify.com" },
    });

    const fd = new FormData();
    fd.append("actionType", "cancel");
    const { action } = await import("../../app/routes/app.plans.jsx");
    await action({ request: new Request("https://app.test/app/plans", { method: "POST", body: fd }) });

    const plansArg = check.mock.calls[0][0].plans;
    for (const key of ALL_SIX_KEYS) {
      expect(plansArg).toContain(key);
    }
    // The annual subscription was found and genuinely cancelled
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "gid://shopify/AppSubscription/1" }));
  });

  it("cancel with NO matching subscription fails loudly and does NOT downgrade the plan", async () => {
    const { authenticate } = await import("../../app/shopify.server");
    const check = vi.fn(async () => ({ appSubscriptions: [] }));
    const cancel = vi.fn(async () => ({}));
    authenticate.admin.mockResolvedValue({
      billing: { check, cancel },
      session: { shop: "test.myshopify.com" },
    });

    const fd = new FormData();
    fd.append("actionType", "cancel");
    const { action } = await import("../../app/routes/app.plans.jsx");
    const res = await action({ request: new Request("https://app.test/app/plans", { method: "POST", body: fd }) });
    const body = await res.json();

    // Must be an error, not a fake "cancelled: true"
    expect(body.cancelled).not.toBe(true);
    expect(body.error).toBeTruthy();
    // And the local plan must NOT be wiped to free
    expect(syncBillingToPlan).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  // Source guard: neither billing call site may ever revert to the
  // monthly-only expression. This is intentionally a source-level test — the
  // bug shipped because the two sites drifted from the one correct expression.
  it("source guard: both billing.check sites use the shared ALL_BILLING_PLAN_KEYS constant", () => {
    const reconcileSrc = readFileSync(join(repoRoot, "app/routes/app.plans-reconcile.jsx"), "utf8");
    const plansSrc = readFileSync(join(repoRoot, "app/routes/app.plans.jsx"), "utf8");
    expect(reconcileSrc).toContain("ALL_BILLING_PLAN_KEYS");
    expect(plansSrc).toContain("ALL_BILLING_PLAN_KEYS");
    const monthlyOnly = /billing\.check\(\{\s*\n?\s*plans:\s*Object\.values\(BILLING_PLANS\)\.map\(\(?p\)?\s*=>\s*p\.key\)/;
    expect(monthlyOnly.test(reconcileSrc)).toBe(false);
    expect(monthlyOnly.test(plansSrc)).toBe(false);
  });

  it("ALL_BILLING_PLAN_KEYS exports exactly the 6 real subscription names", async () => {
    const mod = await import("../../app/utils/billing-plans.js");
    expect(mod.ALL_BILLING_PLAN_KEYS).toBeDefined();
    expect([...mod.ALL_BILLING_PLAN_KEYS].sort()).toEqual([...ALL_SIX_KEYS].sort());
  });
});
