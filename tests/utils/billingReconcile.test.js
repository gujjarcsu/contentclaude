/**
 * P27 item 2 — the plan table is a claim, Shopify is the authority.
 *
 * The first version of this check read Session.accessToken straight from the
 * database and called the Admin API with it. All seventeen shops answered
 * "Invalid API key or access token", which reads like a catastrophe and was a
 * broken instrument: this app sets `expiringOfflineAccessTokens: true`, so the
 * stored token is short-lived and is exchanged on use. A check that returns the
 * same answer for every input is not measuring anything.
 *
 * So the first two tests here are the ones that matter: the comparison must be
 * able to say "agree" AND "disagree" on inputs that differ only in the fact
 * being measured. Everything else is detail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, sent } = vi.hoisted(() => ({ db: { sessions: [], plans: [] }, sent: [] }));

vi.mock("../../app/db.server.js", () => ({
  default: {
    session: { findMany: vi.fn(async () => db.sessions) },
    plan: { findMany: vi.fn(async () => db.plans) },
  },
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/notify.server.js", () => ({
  sendOperatorEmail: vi.fn(async (o) => {
    sent.push(o);
    return { sent: true };
  }),
  OPERATOR_EMAIL: "ops@example.test",
}));

const { reconcileBilling, compareShop, shopHandle } = await import("../../app/utils/billingReconcile.server.js");

const SHOP = "a-store.myshopify.com";
const plan = (o = {}) => ({
  shop: SHOP,
  planName: "pro",
  status: "active",
  shopifyChargeId: "gid://shopify/AppSubscription/123",
  currentPeriodEnd: new Date("2026-10-03T00:00:00Z"),
  ...o,
});
const sub = (o = {}) => ({
  id: "gid://shopify/AppSubscription/123",
  name: "Professional Plan",
  status: "ACTIVE",
  test: false,
  currentPeriodEnd: "2026-10-03T07:19:42Z",
  ...o,
});

const adminReturning = (byShop) => async (shop) => {
  const answer = byShop[shop];
  if (answer instanceof Error) throw answer;
  return { admin: { graphql: async () => ({ json: async () => answer }) } };
};
const ok = (subs) => ({ data: { currentAppInstallation: { activeSubscriptions: subs } } });

beforeEach(() => {
  db.sessions = [{ shop: SHOP }];
  db.plans = [plan()];
  sent.length = 0;
});

describe("the instrument can tell agreement from disagreement", () => {
  it("agrees when both sides say the same paid subscription", () => {
    const r = compareShop(SHOP, plan(), [sub()], null);
    expect(r.problems).toEqual([]);
    expect(r.unreachable).toBe(false);
  });

  it("THE CONTROL — the same fixture with Shopify's side removed does disagree", () => {
    const r = compareShop(SHOP, plan(), [], null);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/paid plan for nothing/);
  });
});

describe("each kind of disagreement, and what it says", () => {
  it("we bill, Shopify does not", () => {
    const r = compareShop(SHOP, plan(), [], null);
    expect(r.problems[0]).toMatch(/we have them on a paid plan and Shopify has no active subscription/);
  });

  it("Shopify bills, we do not — the expensive direction", () => {
    const r = compareShop(SHOP, plan({ planName: "free", shopifyChargeId: null, currentPeriodEnd: null }), [sub()], null);
    expect(r.problems.join(" ")).toMatch(/Shopify is billing them and we have them on free/);
  });

  it("both agree there is a subscription but disagree which one", () => {
    const r = compareShop(SHOP, plan(), [sub({ id: "gid://shopify/AppSubscription/999" })], null);
    expect(r.problems.join(" ")).toMatch(/charge id differs/);
    expect(r.problems.join(" ")).toContain("999");
  });

  it("both agree on the subscription but disagree on when it renews", () => {
    const r = compareShop(SHOP, plan(), [sub({ currentPeriodEnd: "2026-11-03T07:19:42Z" })], null);
    expect(r.problems.join(" ")).toMatch(/period end differs/);
  });

  it("a shop with no plan row at all, paying Shopify", () => {
    const r = compareShop(SHOP, null, [sub()], null);
    expect(r.ours).toBe("no plan row");
    expect(r.problems.join(" ")).toMatch(/Shopify is billing them/);
  });

  it("free on both sides is not a disagreement", () => {
    const r = compareShop(SHOP, plan({ planName: "free", shopifyChargeId: null, currentPeriodEnd: null }), [], null);
    expect(r.problems).toEqual([]);
  });

  it("a test charge is reported as a test charge, not hidden", () => {
    const r = compareShop(SHOP, plan(), [sub({ test: true })], null);
    expect(r.theirs).toMatch(/TEST/);
    expect(r.problems).toEqual([]);
  });
});

describe("unreachable is not disagreement", () => {
  it("a shop we cannot reach is counted apart and raises nothing on its own", async () => {
    const summary = await reconcileBilling({ adminFor: adminReturning({ [SHOP]: new Error("token exchange failed") }) });
    expect(summary.unreachable).toBe(1);
    expect(summary.disagreements).toBe(0);
    expect(sent).toEqual([]);
  });

  it("an unreachable shop is NEVER read as “Shopify says no subscription”", () => {
    const r = compareShop(SHOP, plan(), null, "HTTP 500");
    expect(r.unreachable).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.theirs).toMatch(/unreachable/);
  });
});

describe("what it does with what it finds", () => {
  it("says nothing when every shop agrees", async () => {
    const summary = await reconcileBilling({ adminFor: adminReturning({ [SHOP]: ok([sub()]) }) });
    expect(summary).toMatchObject({ checked: 1, agreed: 1, disagreements: 0, unreachable: 0 });
    expect(sent).toEqual([]);
  });

  it("raises itself on a disagreement, printing both sides", async () => {
    const summary = await reconcileBilling({ adminFor: adminReturning({ [SHOP]: ok([]) }) });
    expect(summary.disagreements).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/1 shop/);
    expect(sent[0].text).toMatch(/ours {3}: pro\/active/);
    expect(sent[0].text).toMatch(/shopify: no active subscription/);
  });

  it("names shops by a stable handle, never by domain", async () => {
    await reconcileBilling({ adminFor: adminReturning({ [SHOP]: ok([]) }) });
    expect(sent[0].text).not.toContain(SHOP);
    expect(sent[0].text).not.toContain("myshopify");
    expect(sent[0].text).toContain(shopHandle(SHOP));
    /* and the handle actually distinguishes shops, which the first attempt's mask did not */
    expect(shopHandle("a-store.myshopify.com")).not.toBe(shopHandle("b-store.myshopify.com"));
  });

  it("writes nothing — the mocked prisma client exposes no write method at all", async () => {
    const prisma = (await import("../../app/db.server.js")).default;
    expect(prisma.plan.update).toBeUndefined();
    expect(prisma.plan.upsert).toBeUndefined();
    await reconcileBilling({ adminFor: adminReturning({ [SHOP]: ok([]) }) });
    expect(Object.keys(prisma.plan)).toEqual(["findMany"]);
  });

  it("checks every installed shop, not just the paying ones", async () => {
    db.sessions = [{ shop: "a.myshopify.com" }, { shop: "b.myshopify.com" }, { shop: "c.myshopify.com" }];
    db.plans = [plan({ shop: "a.myshopify.com" })];
    const summary = await reconcileBilling({
      adminFor: adminReturning({
        "a.myshopify.com": ok([sub()]),
        "b.myshopify.com": ok([]),
        "c.myshopify.com": ok([sub({ id: "gid://shopify/AppSubscription/777" })]),
      }),
    });
    expect(summary.checked).toBe(3);
    /* c pays Shopify and has no plan row here — the direction that costs a merchant money */
    expect(summary.disagreements).toBe(1);
    expect(sent[0].text).toMatch(/Shopify is billing them/);
  });
});
