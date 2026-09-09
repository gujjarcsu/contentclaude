/**
 * Token-free webhook verification for lifecycle + GDPR webhooks.
 *
 * Locks: a genuine Shopify delivery (correct HMAC over the raw body) is
 * accepted and yields shop/topic/triggeredAt/payload; a forged or tampered
 * body is rejected 401; non-POST is 405; a bad shop header is 400. And the
 * four token-free routes actually use it (source guard) — the library
 * authenticator refreshes the offline token first and throws a bare 500 for a
 * store that has just been uninstalled.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { verifyShopifyWebhook, computeWebhookHmac } from "../../app/utils/webhookAuth.server.js";

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
      "x-shopify-triggered-at": "2026-09-09T04:02:10.000Z",
      "x-shopify-api-version": "2026-04",
      ...headers,
    },
  });
}

async function run(req) {
  try { return await verifyShopifyWebhook(req, { secret: SECRET }); } catch (e) { if (e instanceof Response) return e; throw e; }
}

describe("verifyShopifyWebhook", () => {
  it("accepts a genuine delivery and returns the context without touching any session", async () => {
    const ctx = await run(delivery({ shop_domain: SHOP, shop_id: 1 }));
    expect(ctx).toMatchObject({
      shop: SHOP,
      topic: "APP_UNINSTALLED",
      rawTopic: "app/uninstalled",
      webhookId: "wh_1",
      triggeredAt: "2026-09-09T04:02:10.000Z",
      apiVersion: "2026-04",
      payload: { shop_domain: SHOP, shop_id: 1 },
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
    try { res = await verifyShopifyWebhook(delivery({ a: 1 }), { secret: "" }); } catch (e) { res = e; }
    expect(res.status).toBe(401);
  });

  it("rejects non-POST with 405 and a bad shop header with 400", async () => {
    expect((await run(delivery("", { method: "GET" }))).status).toBe(405);
    expect((await run(delivery({ a: 1 }, { headers: { "x-shopify-shop-domain": "evil.example.com" } }))).status).toBe(400);
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

describe("token-free routes use the verifier (source guard)", () => {
  for (const f of [
    "app/routes/webhooks.app.uninstalled.jsx",
    "app/routes/webhooks.shop.redact.jsx",
    "app/routes/webhooks.customers.data_request.jsx",
    "app/routes/webhooks.customers.redact.jsx",
  ]) {
    it(`${f} verifies via HMAC, not authenticate.webhook`, () => {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("verifyShopifyWebhook(request)");
      expect(src).not.toMatch(/authenticate\.webhook\(/);
    });
  }
});
