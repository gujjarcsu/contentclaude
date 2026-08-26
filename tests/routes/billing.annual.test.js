/**
 * Billing regression tests — a live subscription (annual OR a dev-store
 * test:true charge) must never be downgraded to Free, and cancel must never
 * claim success without actually cancelling.
 *
 * History:
 *  - P0-3 (annual): billing.check({ plans }) matched on EXACT subscription name
 *    and both sites passed only the 3 monthly keys, so annual subs weren't found
 *    -> plan dropped to free while the merchant was billed.
 *  - 1.2.3 (App Store): billing.check({ isTest }) FILTERS by the sub's test flag.
 *    A dev/review store's sub is test:true, so billing.check({ isTest:false })
 *    returned empty and the reconcile downgraded to Free on reload.
 *
 * The fix for both: the check/downgrade paths no longer use billing.check at
 * all. They query currentAppInstallation.activeSubscriptions directly
 * (getActiveSubscriptions), which returns EVERY active subscription regardless
 * of name or test flag — annual and test subs alike — and downgrade only on an
 * authoritative response showing zero active subs.
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

// Build an admin.graphql mock that answers the activeSubscriptions query with
// the given subscription list (and answers any other query — e.g. the
// partnerDevelopment lookup — with an empty-but-valid shape).
const adminWithSubs = (subs) => ({
  graphql: vi.fn(async (query) => ({
    json: async () =>
      /activeSubscriptions/.test(query)
        ? { data: { currentAppInstallation: { activeSubscriptions: subs } } }
        : { data: { shop: { plan: { partnerDevelopment: true } } } },
  })),
});

describe("billing downgrade safety (annual + 1.2.3 test-flag)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reconcile promotes an ACTIVE annual subscription (found regardless of key)", async () => {
    const { authenticate } = await import("../../app/shopify.server");
    authenticate.admin.mockResolvedValue({
      session: { shop: "test.myshopify.com" },
      admin: adminWithSubs([
        { id: "gid://shopify/AppSubscription/1", name: "Growth Annual", status: "ACTIVE", test: false, currentPeriodEnd: "2027-01-01T00:00:00Z" },
      ]),
    });
    const { loader } = await import("../../app/routes/app.plans-reconcile.jsx");
    await loader({ request: new Request("https://app.test/app/plans-reconcile") });

    // Synced with the annual sub present — never an empty list (which would downgrade).
    expect(syncBillingToPlan).toHaveBeenCalledTimes(1);
    const [, subsArg] = syncBillingToPlan.mock.calls[0];
    expect(subsArg).toHaveLength(1);
    expect(subsArg[0].name).toBe("Growth Annual");
  });

  it("reconcile does NOT hide a dev-store test:true subscription (1.2.3 root cause)", async () => {
    const { authenticate } = await import("../../app/shopify.server");
    authenticate.admin.mockResolvedValue({
      session: { shop: "test.myshopify.com" },
      admin: adminWithSubs([
        { id: "gid://shopify/AppSubscription/9", name: "Professional Plan", status: "ACTIVE", test: true, currentPeriodEnd: "2027-01-01T00:00:00Z" },
      ]),
    });
    const { loader } = await import("../../app/routes/app.plans-reconcile.jsx");
    await loader({ request: new Request("https://app.test/app/plans-reconcile") });

    // The test:true sub is passed through — NOT dropped to [] (which reverted to Free).
    expect(syncBillingToPlan).toHaveBeenCalledTimes(1);
    const [, subsArg] = syncBillingToPlan.mock.calls[0];
    expect(subsArg.find((s) => s.status === "ACTIVE")?.test).toBe(true);
  });

  it("reconcile does NOT downgrade when the lookup is not authoritative (GraphQL errors)", async () => {
    const { authenticate } = await import("../../app/shopify.server");
    authenticate.admin.mockResolvedValue({
      session: { shop: "test.myshopify.com" },
      admin: {
        graphql: vi.fn(async () => ({ json: async () => ({ errors: [{ message: "Throttled" }] }) })),
      },
    });
    const { loader } = await import("../../app/routes/app.plans-reconcile.jsx");
    const res = await loader({ request: new Request("https://app.test/app/plans-reconcile") });

    // Keep state — syncBillingToPlan must NOT be called on an ambiguous answer.
    expect(syncBillingToPlan).not.toHaveBeenCalled();
    expect((await res.json()).changed).toBe(false);
  });

  it("cancel finds an annual subscription (test-agnostic) and genuinely cancels it", async () => {
    const { authenticate } = await import("../../app/shopify.server");
    const cancel = vi.fn(async () => ({}));
    authenticate.admin.mockResolvedValue({
      billing: { cancel },
      session: { shop: "test.myshopify.com" },
      admin: adminWithSubs([
        { id: "gid://shopify/AppSubscription/1", name: "Growth Annual", status: "ACTIVE", test: false },
      ]),
    });

    const fd = new FormData();
    fd.append("actionType", "cancel");
    const { action } = await import("../../app/routes/app.plans.jsx");
    await action({ request: new Request("https://app.test/app/plans", { method: "POST", body: fd }) });

    // Cancelled by id, using the sub's own test flag (not a re-resolved isTest).
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "gid://shopify/AppSubscription/1", isTest: false })
    );
  });

  it("cancel with NO active subscription fails loudly and does NOT downgrade the plan", async () => {
    const { authenticate } = await import("../../app/shopify.server");
    const cancel = vi.fn(async () => ({}));
    authenticate.admin.mockResolvedValue({
      billing: { cancel },
      session: { shop: "test.myshopify.com" },
      admin: adminWithSubs([]),
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

  // Source guard: the check/downgrade sites must stay test-agnostic. The 1.2.3
  // bug shipped because they used billing.check({ isTest }); lock that out.
  it("source guard: reconcile and cancel use getActiveSubscriptions, never billing.check", () => {
    const reconcileSrc = readFileSync(join(repoRoot, "app/routes/app.plans-reconcile.jsx"), "utf8");
    const plansSrc = readFileSync(join(repoRoot, "app/routes/app.plans.jsx"), "utf8");
    // Both check/downgrade sites go through the shared test-agnostic helper.
    expect(reconcileSrc).toContain("getActiveSubscriptions");
    expect(plansSrc).toContain("getActiveSubscriptions");
    // The reconcile must never CALL billing.check again (that reintroduces
    // 1.2.3). Match actual invocations (`await billing.check(`), not the
    // explanatory comments that mention the old API by name.
    expect(/await\s+billing\.check\s*\(/.test(reconcileSrc)).toBe(false);
    // The cancel path must not gate on billing.check either.
    expect(/await\s+billing\.check\s*\(/.test(plansSrc)).toBe(false);
  });

  it("ALL_BILLING_PLAN_KEYS exports exactly the 6 real subscription names", async () => {
    const mod = await import("../../app/utils/billing-plans.js");
    expect(mod.ALL_BILLING_PLAN_KEYS).toBeDefined();
    expect([...mod.ALL_BILLING_PLAN_KEYS].sort()).toEqual([...ALL_SIX_KEYS].sort());
  });
});
