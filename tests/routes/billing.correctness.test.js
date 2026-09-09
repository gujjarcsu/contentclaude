/**
 * Phase 0 item 8 — a paying merchant is never shown Free.
 *
 * Three separate defects, all of which end with a merchant who has just paid
 * being told they are on the free plan:
 *
 *  8a  A Starter → Growth upgrade emits CANCELLED (old subscription) and ACTIVE
 *      (new subscription) with no ordering guarantee. The handler downgraded on
 *      ANY cancellation, so whenever the CANCELLED landed second the merchant
 *      sat on Free while Shopify billed them for Growth.
 *  8b  The webhook payload carries the subscription id as `admin_graphql_api_id`,
 *      not `id`. Reading `sub.id` wrote null into shopifyChargeId on every
 *      ACTIVE — which is also what made 8a impossible to detect. The payload has
 *      no current_period_end at all, so `sub.current_period_end ? … : null`
 *      wiped a known-good renewal date on every ACTIVE delivery.
 *  8c  billing.callback treated a GraphQL error or a 401 as "no subscriptions"
 *      and synced to Free with a declined=1 banner — seconds after the merchant
 *      approved the charge.
 *
 * Plus: syncing a plan must bust the canGenerate cache, or the generation gate
 * keeps saying "limit reached" for up to 60 s after an upgrade.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "shpss_test_secret";
const SHOP = "paying-store.myshopify.com";
process.env.SHOPIFY_API_SECRET = SECRET;

const { prisma, activeSubs, invalidated } = vi.hoisted(() => ({
  prisma: {
    plan: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    shop: { findUnique: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 1 })) },
    usageRecord: { count: vi.fn(async () => 0), createMany: vi.fn(async () => ({ count: 0 })) },
  },
  activeSubs: vi.fn(),
  invalidated: [],
}));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/activeSubscriptions.server.js", () => ({
  getActiveSubscriptionsForShop: activeSubs,
  getActiveSubscriptions: activeSubs,
}));
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (k, supplier) => supplier()),
  invalidateCache: vi.fn(async (k) => { invalidated.push(k); }),
  getRedis: async () => null,
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const hmac = (raw) => createHmac("sha256", SECRET).update(raw, "utf8").digest("base64");

function subscriptionDelivery(appSubscription) {
  const raw = JSON.stringify({ app_subscription: appSubscription });
  return new Request("https://app.navaal.ai/webhooks/app/subscriptions_update", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": hmac(raw),
      "x-shopify-shop-domain": SHOP,
      "x-shopify-topic": "app_subscriptions/update",
      "x-shopify-webhook-id": `sub-${Math.random().toString(36).slice(2)}`,
      "x-shopify-triggered-at": new Date().toISOString(),
    },
  });
}

const GROWTH_GID = "gid://shopify/AppSubscription/222";
const STARTER_GID = "gid://shopify/AppSubscription/111";

async function deliver(appSubscription) {
  const { action } = await import("../../app/routes/webhooks.app.subscriptions_update.jsx");
  try {
    return await action({ request: subscriptionDelivery(appSubscription) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/** The plan write the handler made, or null when it made none. */
const planWrite = () => (prisma.plan.upsert.mock.calls.length ? prisma.plan.upsert.mock.calls.at(-1)[0].update : null);

beforeEach(() => {
  vi.clearAllMocks();
  invalidated.length = 0;
  prisma.plan.findUnique.mockResolvedValue(null);
  prisma.shop.findUnique.mockResolvedValue(null);
});

describe("item 8b — the webhook reads the fields the payload actually has", () => {
  it("stores the subscription id from admin_graphql_api_id", async () => {
    const res = await deliver({
      admin_graphql_api_id: GROWTH_GID,
      name: "Growth Plan",
      status: "ACTIVE",
    });
    expect(res.status).toBe(200);
    expect(planWrite()).toMatchObject({
      planName: "growth",
      monthlyLimit: 200,
      shopifyChargeId: GROWTH_GID,
    });
  });

  it("does NOT null a known renewal date just because the payload omits one", async () => {
    await deliver({ admin_graphql_api_id: GROWTH_GID, name: "Growth Plan", status: "ACTIVE" });
    expect(planWrite()).not.toHaveProperty("currentPeriodEnd");
  });

  it("writes the renewal date when the delivery does carry one", async () => {
    await deliver({
      admin_graphql_api_id: GROWTH_GID,
      name: "Growth Plan",
      status: "ACTIVE",
      current_period_end: "2026-10-09T00:00:00Z",
    });
    expect(planWrite().currentPeriodEnd).toBeInstanceOf(Date);
  });

  it("busts the quota cache as well as the plan cache, so the gate stops saying limit reached", async () => {
    await deliver({ admin_graphql_api_id: GROWTH_GID, name: "Growth Plan", status: "ACTIVE" });
    expect(invalidated.some((k) => k.startsWith("plan:"))).toBe(true);
    expect(invalidated.some((k) => k.startsWith("canGenerate:"))).toBe(true);
  });
});

describe("item 8a — a cancellation never downgrades a merchant who is still paying", () => {
  it("ignores the CANCELLED half of an upgrade (a different subscription id)", async () => {
    // We already recorded the NEW Growth subscription; the old Starter one is
    // now cancelled and arrives second.
    prisma.plan.findUnique.mockResolvedValue({ shopifyChargeId: GROWTH_GID });

    const res = await deliver({ admin_graphql_api_id: STARTER_GID, name: "Starter Plan", status: "CANCELLED" });

    expect(res.status).toBe(200);
    expect(prisma.plan.upsert).not.toHaveBeenCalled(); // the plan was not touched at all
    expect(activeSubs).not.toHaveBeenCalled(); // and it did not even need to ask
  });

  it("asks Shopify when the cancelled subscription IS the one we hold, and keeps the paid plan if another is live", async () => {
    prisma.plan.findUnique.mockResolvedValue({ shopifyChargeId: STARTER_GID });
    activeSubs.mockResolvedValue({
      ok: true,
      subs: [{ id: GROWTH_GID, name: "Growth Plan", status: "ACTIVE", test: false, currentPeriodEnd: "2026-10-09T00:00:00Z" }],
    });

    await deliver({ admin_graphql_api_id: STARTER_GID, name: "Starter Plan", status: "CANCELLED" });

    expect(planWrite()).toMatchObject({ planName: "growth", monthlyLimit: 200, shopifyChargeId: GROWTH_GID });
  });

  it("downgrades to Free only when Shopify authoritatively reports nothing active", async () => {
    prisma.plan.findUnique.mockResolvedValue({ shopifyChargeId: STARTER_GID });
    activeSubs.mockResolvedValue({ ok: true, subs: [] });

    await deliver({ admin_graphql_api_id: STARTER_GID, name: "Starter Plan", status: "CANCELLED" });

    expect(planWrite()).toMatchObject({ planName: "free", monthlyLimit: 25, shopifyChargeId: null });
  });

  it("holds the plan when Shopify cannot be reached — ambiguity never costs the merchant their plan", async () => {
    prisma.plan.findUnique.mockResolvedValue({ shopifyChargeId: STARTER_GID });
    activeSubs.mockResolvedValue({ ok: false, subs: [], reason: "graphql_errors" });

    const res = await deliver({ admin_graphql_api_id: STARTER_GID, name: "Starter Plan", status: "CANCELLED" });

    expect(res.status).toBe(200);
    expect(prisma.plan.upsert).not.toHaveBeenCalled();
  });

  it("applies the same verification to EXPIRED and DECLINED", async () => {
    for (const status of ["EXPIRED", "DECLINED"]) {
      vi.clearAllMocks();
      prisma.plan.findUnique.mockResolvedValue({ shopifyChargeId: STARTER_GID });
      activeSubs.mockResolvedValue({ ok: false, subs: [], reason: "missing_data" });
      await deliver({ admin_graphql_api_id: STARTER_GID, name: "Starter Plan", status });
      expect(prisma.plan.upsert, status).not.toHaveBeenCalled();
    }
  });

  it("still freezes on FROZEN", async () => {
    await deliver({ admin_graphql_api_id: GROWTH_GID, name: "Growth Plan", status: "FROZEN" });
    expect(prisma.plan.updateMany).toHaveBeenCalledWith({ where: { shop: SHOP }, data: { status: "frozen" } });
  });
});

describe("item 8c — the billing callback never writes Free on an unreadable answer", () => {
  const { syncBillingToPlan } = vi.hoisted(() => ({ syncBillingToPlan: vi.fn(async () => {}) }));
  vi.mock("../../app/utils/plans.server", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, syncBillingToPlan };
  });
  vi.mock("../../app/utils/offlineToken.server.js", () => ({
    getFreshOfflineSession: vi.fn(async () => ({ shop: SHOP, accessToken: "tok" })),
  }));
  vi.mock("../../app/shopify.server", () => ({ apiVersion: "2026-04" }));

  const run = async () => {
    const { loader } = await import("../../app/routes/billing.callback.jsx");
    return loader({
      request: new Request(`https://app.navaal.ai/billing/callback?shop=${SHOP}&charge_id=999`),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => ({ json: async () => ({}) }));
  });

  it("does not touch the plan when the subscription lookup is not authoritative", async () => {
    activeSubs.mockResolvedValue({ ok: false, subs: [], reason: "graphql_errors" });
    const res = await run();
    expect(syncBillingToPlan).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toMatch(/billing_error=1/);
    // Critically: it must NOT tell the merchant the charge was declined.
    expect(res.headers.get("location")).not.toMatch(/declined=1/);
  });

  it("records the upgrade when Shopify authoritatively reports an active subscription", async () => {
    activeSubs.mockResolvedValue({
      ok: true,
      subs: [{ id: GROWTH_GID, name: "Growth Plan", status: "ACTIVE", test: false, currentPeriodEnd: null }],
    });
    const res = await run();
    expect(syncBillingToPlan).toHaveBeenCalledWith(SHOP, expect.arrayContaining([expect.objectContaining({ status: "ACTIVE" })]));
    expect(res.headers.get("location")).toMatch(/upgraded=1/);
  });

  it("reports a genuine decline only when Shopify authoritatively reports none", async () => {
    activeSubs.mockResolvedValue({ ok: true, subs: [] });
    const res = await run();
    expect(syncBillingToPlan).toHaveBeenCalledWith(SHOP, []);
    expect(res.headers.get("location")).toMatch(/declined=1/);
  });
});
