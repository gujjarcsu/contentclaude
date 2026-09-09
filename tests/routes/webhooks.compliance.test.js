/**
 * Phase 0 group 0.A — the compliance webhooks, at the route level.
 *
 * These deliver a REAL, correctly-signed body through the real verifier and
 * only mock the database, because the bugs being locked out were both about
 * what the handler does after a genuine delivery arrives:
 *
 *  item 1  Both customer handlers pruned their audit trail with
 *          `deleteMany({ where: { createdAt: … } })`, but GDPRRequest has no
 *          `createdAt` column — only `processedAt`. Prisma threw AFTER the
 *          audit row was inserted, so every mandatory customers/redact and
 *          customers/data_request delivery returned 500, Shopify retried for
 *          hours, and each retry left another duplicate audit row. A store on
 *          a periodic compliance audit fails for exactly this.
 *
 *  item 3  app/scopes_update called `payload.current.toString()`; a delivery
 *          without that field threw a TypeError → 500 → retries.
 *
 * Both are asserted the way the brief specifies: a valid-HMAC payload gets a
 * 200 and exactly one audit row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "shpss_test_secret";
const SHOP = "fresh-store.myshopify.com";
process.env.SHOPIFY_API_SECRET = SECRET;

const { db, redisRef } = vi.hoisted(() => {
  const db = {
    gDPRRequest: {
      create: vi.fn(async ({ data }) => ({ id: "g1", ...data })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    session: { updateMany: vi.fn(async () => ({ count: 2 })) },
  };
  return { db, redisRef: { current: null } };
});
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/utils/cache.server.js", () => ({
  getRedis: async () => redisRef.current,
  invalidateCache: vi.fn(async () => {}),
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const hmac = (raw) => createHmac("sha256", SECRET).update(raw, "utf8").digest("base64");

function delivery(path, topic, body, headers = {}) {
  const raw = JSON.stringify(body);
  return new Request(`https://app.navaal.ai${path}`, {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": hmac(raw),
      "x-shopify-shop-domain": SHOP,
      "x-shopify-topic": topic,
      "x-shopify-webhook-id": "wh_compliance_1",
      "x-shopify-triggered-at": new Date(Date.now() - 30_000).toISOString(),
      "x-shopify-api-version": "2026-04",
      ...headers,
    },
  });
}

async function call(action, request) {
  try {
    return await action({ request });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  redisRef.current = null;
  db.gDPRRequest.create.mockImplementation(async ({ data }) => ({ id: "g1", ...data }));
  db.gDPRRequest.deleteMany.mockResolvedValue({ count: 0 });
  db.session.updateMany.mockResolvedValue({ count: 2 });
});

const CUSTOMER_ROUTES = [
  {
    name: "customers/data_request",
    path: "/webhooks/customers/data_request",
    topic: "customers/data_request",
    module: "../../app/routes/webhooks.customers.data_request.jsx",
    requestType: "customer_data_request",
    body: {
      shop_id: 900,
      shop_domain: SHOP,
      customer: { id: 191167, email: "jon@example.com", phone: "555" },
      orders_requested: [299938, 280263],
    },
  },
  {
    name: "customers/redact",
    path: "/webhooks/customers/redact",
    topic: "customers/redact",
    module: "../../app/routes/webhooks.customers.redact.jsx",
    requestType: "customer_redact",
    body: {
      shop_id: 900,
      shop_domain: SHOP,
      customer: { id: 191167, email: "jon@example.com", phone: "555" },
      orders_to_redact: [299938],
    },
  },
];

describe("item 1 — mandatory GDPR webhooks answer 200 with exactly one audit row", () => {
  for (const route of CUSTOMER_ROUTES) {
    it(`${route.name}: valid HMAC → 200, one audit row`, async () => {
      const { action } = await import(route.module);
      const res = await call(action, delivery(route.path, route.topic, route.body));

      expect(res.status).toBe(200);
      expect(db.gDPRRequest.create).toHaveBeenCalledTimes(1);
      expect(db.gDPRRequest.create.mock.calls[0][0].data).toMatchObject({
        shop: SHOP,
        requestType: route.requestType,
      });
    });

    it(`${route.name}: the audit row holds no customer PII`, async () => {
      const { action } = await import(route.module);
      await call(action, delivery(route.path, route.topic, route.body));
      const stored = db.gDPRRequest.create.mock.calls[0][0].data.payload;
      expect(stored).not.toContain("jon@example.com");
      expect(stored).not.toContain("555");
      expect(JSON.parse(stored)).toMatchObject({ shop_id: 900, customer_id: 191167 });
    });

    it(`${route.name}: retention prunes on processedAt — the column that exists`, async () => {
      const { action } = await import(route.module);
      await call(action, delivery(route.path, route.topic, route.body));

      expect(db.gDPRRequest.deleteMany).toHaveBeenCalledTimes(1);
      const where = db.gDPRRequest.deleteMany.mock.calls[0][0].where;
      expect(where).toHaveProperty("processedAt");
      expect(where).not.toHaveProperty("createdAt");
      expect(where.processedAt.lt).toBeInstanceOf(Date);
    });

    it(`${route.name}: a prune failure can never turn a recorded request into a 500`, async () => {
      // Exactly the old failure mode: the prune throws after the row is written.
      db.gDPRRequest.deleteMany.mockRejectedValueOnce(
        new Error("Unknown argument `createdAt`. Available options are marked with ?."),
      );
      const { action } = await import(route.module);
      const res = await call(action, delivery(route.path, route.topic, route.body));

      expect(res.status).toBe(200);
      expect(db.gDPRRequest.create).toHaveBeenCalledTimes(1);
    });

    it(`${route.name}: a forged HMAC is 401 and writes nothing`, async () => {
      const { action } = await import(route.module);
      const res = await call(
        action,
        delivery(route.path, route.topic, route.body, { "x-shopify-hmac-sha256": "forged" }),
      );
      expect(res.status).toBe(401);
      expect(db.gDPRRequest.create).not.toHaveBeenCalled();
    });

    it(`${route.name}: a redelivery is acknowledged without a second audit row`, async () => {
      redisRef.current = { set: vi.fn(async () => null), del: vi.fn(async () => 1) }; // already claimed
      const { action } = await import(route.module);
      const res = await call(action, delivery(route.path, route.topic, route.body));
      expect(res.status).toBe(200);
      expect(db.gDPRRequest.create).not.toHaveBeenCalled();
    });

    it(`${route.name}: a failed write hands the delivery id back so the retry can run`, async () => {
      const redis = { set: vi.fn(async () => "OK"), del: vi.fn(async () => 1) };
      redisRef.current = redis;
      db.gDPRRequest.create.mockRejectedValueOnce(new Error("db down"));
      const { action } = await import(route.module);
      await expect(call(action, delivery(route.path, route.topic, route.body))).rejects.toThrow("db down");
      expect(redis.del).toHaveBeenCalledWith(`whdedup:${SHOP}:wh_compliance_1`);
    });
  }
});

describe("item 3 — app/scopes_update never 500s on a payload shape", () => {
  const path = "/webhooks/app/scopes_update";
  const topic = "app/scopes_update";

  it("writes the joined scopes for every session of the shop", async () => {
    const { action } = await import("../../app/routes/webhooks.app.scopes_update.jsx");
    const res = await call(
      action,
      delivery(path, topic, { previous: ["write_products"], current: ["write_products", "write_content"] }),
    );
    expect(res.status).toBe(200);
    expect(db.session.updateMany).toHaveBeenCalledWith({
      where: { shop: SHOP },
      data: { scope: "write_products,write_content" },
    });
  });

  it("a delivery with no `current` field is a 200 that writes nothing (was a TypeError → 500)", async () => {
    const { action } = await import("../../app/routes/webhooks.app.scopes_update.jsx");
    const res = await call(action, delivery(path, topic, { previous: ["write_products"] }));
    expect(res.status).toBe(200);
    expect(db.session.updateMany).not.toHaveBeenCalled();
  });

  it("an empty scope list is a 200 that writes nothing", async () => {
    const { action } = await import("../../app/routes/webhooks.app.scopes_update.jsx");
    const res = await call(action, delivery(path, topic, { current: [] }));
    expect(res.status).toBe(200);
    expect(db.session.updateMany).not.toHaveBeenCalled();
  });
});
