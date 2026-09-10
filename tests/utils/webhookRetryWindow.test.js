/**
 * The 88.5% webhook failure rate, and why it was ours.
 *
 * Shopify's Dev Dashboard reported, over 7 days: app/uninstalled failing
 * 82.353% of 17 deliveries, shop/redact failing 100.0% of 9. shop/redact is a
 * mandatory GDPR topic, so that is a compliance failure, not a lost
 * notification.
 *
 * A signed probe against production isolated it. Every topic returned 200 for a
 * FRESH delivery. The same delivery aged 25 h returned 401, and aged 47 h
 * returned 401. Dedup was innocent (a redelivery answered 200 "Duplicate") and
 * the payload/header shop check was innocent (a matching payload answered 200).
 *
 * The cause was ours: MAX_WEBHOOK_AGE_MS was 24 h, while Shopify retries for
 * ~48 h and every retry carries the ORIGINAL x-shopify-triggered-at. So a
 * delivery that failed once for any transient reason aged out, and then every
 * remaining retry was refused by us, deliberately, forever.
 *
 * These tests lock the three properties the fix has to have:
 *   (a) a genuine Shopify retry is ALWAYS accepted inside its full retry window
 *   (b) mandatory compliance topics are never rejected on their timestamp
 *   (c) replay protection still holds — by webhook id, not by age
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { redisRef } = vi.hoisted(() => ({ redisRef: { current: null } }));
vi.mock("../../app/utils/cache.server.js", () => ({ getRedis: async () => redisRef.current }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  verifyShopifyWebhook,
  computeWebhookHmac,
  isMandatoryComplianceTopic,
  MANDATORY_COMPLIANCE_TOPICS,
  MAX_WEBHOOK_AGE_MS,
  SHOPIFY_RETRY_WINDOW_MS,
} = await import("../../app/utils/webhookAuth.server.js");

const SECRET = "shpss_test_secret";
const SHOP = "fresh-store.myshopify.com";
const HOUR = 60 * 60 * 1000;

function delivery({ topic = "app/uninstalled", ageMs = 60_000, webhookId = "wh_1", body = {} } = {}) {
  const raw = JSON.stringify(body);
  return new Request("https://app.navaal.ai/webhooks", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": computeWebhookHmac(raw, SECRET),
      "x-shopify-shop-domain": SHOP,
      "x-shopify-topic": topic,
      "x-shopify-webhook-id": webhookId,
      "x-shopify-triggered-at": new Date(Date.now() - ageMs).toISOString(),
    },
  });
}

const verify = (req, opts = {}) => verifyShopifyWebhook(req, { secret: SECRET, ...opts });
const statusOf = async (req, opts) => {
  try {
    await verify(req, opts);
    return 200;
  } catch (res) {
    return res.status;
  }
};

beforeEach(() => {
  redisRef.current = null;
});

describe("(a) a genuine Shopify retry is always accepted", () => {
  // These two ages are exactly what the production probe returned 401 for.
  it.each([
    ["25 h — one hour past the old window", 25 * HOUR],
    ["47 h — the last attempt Shopify makes", 47 * HOUR],
  ])("accepts app/uninstalled aged %s", async (_label, ageMs) => {
    expect(await statusOf(delivery({ ageMs }))).toBe(200);
  });

  it("the window comfortably exceeds Shopify's whole retry schedule", () => {
    // Not merely equal: a delivery triggered at the very start of the window and
    // retried at the very end of it must not land on the boundary.
    expect(MAX_WEBHOOK_AGE_MS).toBeGreaterThan(SHOPIFY_RETRY_WINDOW_MS);
    expect(SHOPIFY_RETRY_WINDOW_MS).toBe(48 * HOUR);
  });

  it("a delivery from the future is still refused — that is not a retry", async () => {
    const raw = "{}";
    const req = new Request("https://app.navaal.ai/webhooks", {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": computeWebhookHmac(raw, SECRET),
        "x-shopify-shop-domain": SHOP,
        "x-shopify-topic": "app/uninstalled",
        "x-shopify-triggered-at": new Date(Date.now() + 60 * HOUR).toISOString(),
      },
    });
    expect(await statusOf(req)).toBe(401);
  });
});

describe("(b) mandatory compliance topics are never rejected on age", () => {
  it.each(MANDATORY_COMPLIANCE_TOPICS)("accepts %s at ten days old", async (topic) => {
    expect(await statusOf(delivery({ topic, ageMs: 10 * 24 * HOUR }))).toBe(200);
  });

  it("accepts a compliance topic even with an implausible timestamp", async () => {
    // Performing a deletion we were not owed costs a merchant nothing.
    // Refusing one we were owed is the failure that matters.
    expect(await statusOf(delivery({ topic: "shop/redact", ageMs: -100 * HOUR }))).toBe(200);
  });

  it("shop/redact is covered, because it ARRIVES 48 h after the uninstall", async () => {
    // It was outside the old 24 h window before Shopify's first attempt.
    expect(await statusOf(delivery({ topic: "shop/redact", ageMs: 49 * HOUR }))).toBe(200);
    const ctx = await verify(delivery({ topic: "shop/redact", ageMs: 49 * HOUR }));
    expect(ctx.mandatory).toBe(true);
  });

  it("a non-compliance topic is NOT exempt — the backstop still exists", async () => {
    expect(await statusOf(delivery({ topic: "products/create", ageMs: 8 * 24 * HOUR }))).toBe(401);
    const ctx = await verify(delivery({ topic: "products/create" }));
    expect(ctx.mandatory).toBe(false);
  });

  it("recognises the topic regardless of case or padding", () => {
    expect(isMandatoryComplianceTopic("SHOP/REDACT")).toBe(true);
    expect(isMandatoryComplianceTopic("  customers/redact  ")).toBe(true);
    expect(isMandatoryComplianceTopic("customers/data_request")).toBe(true);
    expect(isMandatoryComplianceTopic("app/uninstalled")).toBe(false);
    expect(isMandatoryComplianceTopic(null)).toBe(false);
  });
});

describe("(c) replay protection still holds, by webhook id", () => {
  function fakeRedis() {
    const store = new Map();
    return {
      store,
      set: vi.fn(async (k, v, _ex, ttl, nx) => {
        if (nx === "NX" && store.has(k)) return null;
        store.set(k, { v, ttl });
        return "OK";
      }),
      del: vi.fn(async (k) => (store.delete(k) ? 1 : 0)),
    };
  }

  it("a captured delivery replayed is reported duplicate, at ANY age", async () => {
    redisRef.current = fakeRedis();
    const first = await verify(delivery({ webhookId: "wh_replay" }));
    expect(first.duplicate).toBe(false);
    // The attacker's replay is caught on the FIRST attempt, not after a day.
    const second = await verify(delivery({ webhookId: "wh_replay", ageMs: 47 * HOUR }));
    expect(second.duplicate).toBe(true);
  });

  it("a compliance topic is deduped too — the exemption is only about age", async () => {
    redisRef.current = fakeRedis();
    expect((await verify(delivery({ topic: "shop/redact", webhookId: "wh_g" }))).duplicate).toBe(false);
    expect((await verify(delivery({ topic: "shop/redact", webhookId: "wh_g" }))).duplicate).toBe(true);
  });

  it("the dedup TTL equals the age window, so there is no gap between them", async () => {
    // If the age window outlived the dedup memory there would be a period in
    // which a replay is both too young to reject and no longer remembered.
    const redis = fakeRedis();
    redisRef.current = redis;
    await verify(delivery({ webhookId: "wh_ttl" }));
    const ttlSeconds = redis.set.mock.calls[0][3];
    expect(ttlSeconds).toBe(MAX_WEBHOOK_AGE_MS / 1000);
  });

  it("different shops do not collide on the same delivery id", async () => {
    const redis = fakeRedis();
    redisRef.current = redis;
    await verify(delivery({ webhookId: "wh_x" }));
    expect(redis.set.mock.calls[0][0]).toContain(SHOP);
  });
});
