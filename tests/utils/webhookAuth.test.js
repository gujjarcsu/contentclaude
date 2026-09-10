/**
 * Token-free webhook verification — used by EVERY webhook route.
 *
 * Locks the four things the verifier is responsible for:
 *   1. Authenticity: a genuine Shopify delivery (correct HMAC over the raw
 *      body) is accepted; a forged or tampered body is 401; non-POST is 405;
 *      a bad shop header is 400.
 *   2. Phase 0 item 2 — the HMAC covers the BODY ONLY. When the signed payload
 *      names a shop it must equal the unsigned x-shopify-shop-domain header,
 *      or an attacker could replay a genuine body of ours under another
 *      merchant's domain and app/uninstalled would delete THAT merchant.
 *   3. Phase 0 item 2 — a captured delivery must not be replayable a day later.
 *   4. Phase 0 item 2 — a redelivery carrying an already-seen webhook id is
 *      reported as a duplicate so handlers can short-circuit.
 *
 * Plus the source guard: all seven webhook routes use this verifier and none
 * uses authenticate.webhook (which refreshes the offline token first and throws
 * a bare 500 for any shop whose token has expired).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { redis, redisRef } = vi.hoisted(() => {
  const redis = { set: vi.fn(async () => "OK"), del: vi.fn(async () => 1) };
  return { redis, redisRef: { current: null } };
});
vi.mock("../../app/utils/cache.server.js", () => ({ getRedis: async () => redisRef.current }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  verifyShopifyWebhook,
  computeWebhookHmac,
  payloadShopDomain,
  isDeliveryFresh,
  scopesFromPayload,
  claimWebhookDelivery,
  releaseWebhookDelivery,
  MAX_WEBHOOK_AGE_MS,
} = await import("../../app/utils/webhookAuth.server.js");

const SECRET = "shpss_test_secret";
const SHOP = "fresh-store.myshopify.com";

function delivery(body, { hmac, headers = {}, method = "POST" } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://app.navaal.ai/webhooks/app/uninstalled", {
    method,
    body: method === "POST" ? raw : undefined,
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": hmac ?? computeWebhookHmac(raw, SECRET),
      "x-shopify-shop-domain": SHOP,
      "x-shopify-topic": "app/uninstalled",
      "x-shopify-webhook-id": "wh_1",
      // Relative, so the fixture never rots against the freshness window.
      "x-shopify-triggered-at": new Date(Date.now() - 60_000).toISOString(),
      "x-shopify-api-version": "2026-04",
      ...headers,
    },
  });
}

async function run(req, opts) {
  try {
    return await verifyShopifyWebhook(req, { secret: SECRET, ...opts });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  redisRef.current = null; // no Redis by default → dedup is a no-op
  redis.set.mockResolvedValue("OK");
  redis.del.mockResolvedValue(1);
});

describe("verifyShopifyWebhook — authenticity", () => {
  it("accepts a genuine delivery and returns the context without touching any session", async () => {
    const ctx = await run(delivery({ shop_domain: SHOP, shop_id: 1 }));
    expect(ctx).toMatchObject({
      shop: SHOP,
      topic: "APP_UNINSTALLED",
      rawTopic: "app/uninstalled",
      webhookId: "wh_1",
      apiVersion: "2026-04",
      payload: { shop_domain: SHOP, shop_id: 1 },
      duplicate: false,
    });
  });

  it("rejects a forged HMAC and a tampered body with 401", async () => {
    expect((await run(delivery({ a: 1 }, { hmac: "nope" }))).status).toBe(401);
    const good = computeWebhookHmac(JSON.stringify({ a: 1 }), SECRET);
    expect((await run(delivery({ a: 2 }, { hmac: good }))).status).toBe(401);
    expect((await run(delivery({ a: 1 }, { hmac: "" }))).status).toBe(401);
  });

  it("rejects when no secret is configured (never open by default)", async () => {
    let res;
    try {
      res = await verifyShopifyWebhook(delivery({ a: 1 }), { secret: "" });
    } catch (e) {
      res = e;
    }
    expect(res.status).toBe(401);
  });

  it("rejects non-POST with 405 and a bad shop header with 400", async () => {
    expect((await run(delivery("", { method: "GET" }))).status).toBe(405);
    expect(
      (await run(delivery({ a: 1 }, { headers: { "x-shopify-shop-domain": "evil.example.com" } }))).status,
    ).toBe(400);
  });

  it("rejects a non-JSON body with 400 and tolerates an empty body", async () => {
    expect((await run(delivery("not json"))).status).toBe(400);
    expect((await run(delivery(""))).payload).toEqual({});
  });

  it("normalises the topic header to the library shape", async () => {
    const ctx = await run(delivery({}, { headers: { "x-shopify-topic": "customers/data_request" } }));
    expect(ctx.topic).toBe("CUSTOMERS_DATA_REQUEST");
  });
});

describe("item 2 — the unsigned shop header cannot contradict the signed body", () => {
  it("rejects a genuine body replayed under another merchant's shop header", async () => {
    // The body is correctly signed; only the (unsigned) header was swapped.
    const raw = JSON.stringify({ myshopify_domain: "victim.myshopify.com", id: 7 });
    const req = new Request("https://app.navaal.ai/webhooks/app/uninstalled", {
      method: "POST",
      body: raw,
      headers: {
        "x-shopify-hmac-sha256": computeWebhookHmac(raw, SECRET),
        "x-shopify-shop-domain": SHOP,
        "x-shopify-topic": "app/uninstalled",
        "x-shopify-triggered-at": new Date().toISOString(),
      },
    });
    expect((await run(req)).status).toBe(401);
  });

  it("accepts when the payload agrees, case-insensitively", async () => {
    const ctx = await run(delivery({ myshopify_domain: SHOP.toUpperCase() }));
    expect(ctx.shop).toBe(SHOP);
  });

  it("accepts topics whose payload names no shop (products/create, scopes, subscriptions)", async () => {
    const ctx = await run(delivery({ current: ["write_products"] }));
    expect(ctx.shop).toBe(SHOP);
  });

  it("payloadShopDomain reads either field and ignores anything else", () => {
    expect(payloadShopDomain({ myshopify_domain: "A.myshopify.com" })).toBe("a.myshopify.com");
    expect(payloadShopDomain({ shop_domain: " b.myshopify.com " })).toBe("b.myshopify.com");
    expect(payloadShopDomain({ shop_id: 1 })).toBeNull();
    expect(payloadShopDomain({ shop_domain: "" })).toBeNull();
    expect(payloadShopDomain({ shop_domain: 12 })).toBeNull();
    expect(payloadShopDomain(null)).toBeNull();
  });
});

describe("item 2 — replay window", () => {
  it("rejects a delivery older than the window", async () => {
    const old = new Date(Date.now() - MAX_WEBHOOK_AGE_MS - 60_000).toISOString();
    expect((await run(delivery({ a: 1 }, { headers: { "x-shopify-triggered-at": old } }))).status).toBe(401);
  });

  it("rejects a delivery implausibly far in the future", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect((await run(delivery({ a: 1 }, { headers: { "x-shopify-triggered-at": future } }))).status).toBe(
      401,
    );
  });

  it("accepts a delivery just inside the window, and small clock skew", async () => {
    const justInside = new Date(Date.now() - MAX_WEBHOOK_AGE_MS + 60_000).toISOString();
    expect((await run(delivery({ a: 1 }, { headers: { "x-shopify-triggered-at": justInside } }))).shop).toBe(
      SHOP,
    );
    const slightlyAhead = new Date(Date.now() + 60_000).toISOString();
    expect(
      (await run(delivery({ a: 1 }, { headers: { "x-shopify-triggered-at": slightlyAhead } }))).shop,
    ).toBe(SHOP);
  });

  it("never rejects a genuine delivery for a missing or unparseable timestamp", () => {
    expect(isDeliveryFresh(null)).toBe(true);
    expect(isDeliveryFresh("")).toBe(true);
    expect(isDeliveryFresh("not a date")).toBe(true);
  });
});

describe("item 2 — delivery-id dedup", () => {
  it("reports the first delivery as new and a redelivery as duplicate", async () => {
    redisRef.current = redis;
    redis.set.mockResolvedValueOnce("OK"); // claimed
    expect((await run(delivery({ a: 1 }))).duplicate).toBe(false);
    redis.set.mockResolvedValueOnce(null); // already claimed
    expect((await run(delivery({ a: 1 }))).duplicate).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(`whdedup:${SHOP}:wh_1`, "1", "EX", expect.any(Number), "NX");
  });

  it("claims only after the request is proven authentic", async () => {
    redisRef.current = redis;
    await run(delivery({ a: 1 }, { hmac: "forged" }));
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("processes rather than drops work when Redis is unavailable or erroring", async () => {
    redisRef.current = null;
    expect(await claimWebhookDelivery(SHOP, "wh_9")).toBe(true);
    redisRef.current = redis;
    redis.set.mockRejectedValueOnce(new Error("down"));
    expect(await claimWebhookDelivery(SHOP, "wh_9")).toBe(true);
  });

  it("releases a claim so a failed handler's retry can run, and never throws", async () => {
    redisRef.current = redis;
    await releaseWebhookDelivery(SHOP, "wh_1");
    expect(redis.del).toHaveBeenCalledWith(`whdedup:${SHOP}:wh_1`);
    redis.del.mockRejectedValueOnce(new Error("down"));
    await expect(releaseWebhookDelivery(SHOP, "wh_1")).resolves.toBeUndefined();
    await expect(releaseWebhookDelivery(SHOP, null)).resolves.toBeUndefined();
  });
});

describe("item 3 — app/scopes_update payload shapes", () => {
  it("joins an array, trims a string, and returns null when there is nothing to write", () => {
    expect(scopesFromPayload({ current: ["write_products", "write_content"] })).toBe(
      "write_products,write_content",
    );
    expect(scopesFromPayload({ current: " write_products " })).toBe("write_products");
    expect(scopesFromPayload({ current: [] })).toBeNull();
    expect(scopesFromPayload({ current: null })).toBeNull();
    expect(scopesFromPayload({})).toBeNull();
    expect(scopesFromPayload(null)).toBeNull();
    // The exact shape that used to throw: .toString() on a missing field.
    expect(() => scopesFromPayload({ previous: ["read_products"] })).not.toThrow();
  });
});

/** Source with comments removed — these routes explain in prose why they do
 *  NOT use authenticate.webhook, and that prose must not trip the guard. */
const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe("every webhook route uses the token-free verifier (source guard)", () => {
  for (const f of [
    "app/routes/webhooks.app.uninstalled.jsx",
    "app/routes/webhooks.shop.redact.jsx",
    "app/routes/webhooks.customers.data_request.jsx",
    "app/routes/webhooks.customers.redact.jsx",
    "app/routes/webhooks.app.scopes_update.jsx",
    "app/routes/webhooks.app.subscriptions_update.jsx",
    "app/routes/webhooks.products.create.jsx",
  ]) {
    it(`${f} verifies via HMAC, not authenticate.webhook`, () => {
      const src = code(f);
      expect(src).toContain("verifyShopifyWebhook(request)");
      expect(src).not.toMatch(/authenticate\.webhook\(/);
      // Nor may it even import the library authenticator.
      expect(src).not.toMatch(/import\s*\{[^}]*\bauthenticate\b[^}]*\}\s*from\s*["'][^"']*shopify\.server/);
    });
    it(`${f} short-circuits a duplicate delivery`, () => {
      expect(code(f)).toMatch(/if \(duplicate\)/);
    });
  }
});
