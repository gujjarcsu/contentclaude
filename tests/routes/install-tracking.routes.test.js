/**
 * Install-source tracking — the route-level guarantees.
 *   - The app root must carry Shopify's surface_* install params through to /app
 *     (that redirect is the path a fresh App Store install takes).
 *   - /go?ref= (our attributed install link) sets the navaal_ref cookie and
 *     forwards to the App Store listing; junk refs set nothing.
 *   - app/uninstalled stamps uninstalledAt on the shop record (row kept),
 *     passing Shopify's triggered-at so a late duplicate cannot hit a live shop.
 *   - shop/redact anonymises the shop record inside the redaction transaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, tx, webhook } = vi.hoisted(() => {
  const model = () => ({
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async ({ data }) => data),
    updateMany: vi.fn(async () => ({ count: 1 })),
  });
  const tx = {};
  for (const m of ["generatedContent", "contentVersion", "contentTemplate", "collectionVoice", "brandVoice", "blogPost", "generationJob", "usageRecord", "plan", "growthState", "reviewRequestAttempt", "upgradePrompt", "session", "gDPRRequest", "shop"]) tx[m] = model();
  const db = { $transaction: vi.fn(async (fn) => fn(tx)), shop: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn(async () => null) } };
  const webhook = vi.fn();
  return { db, tx, webhook };
});
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
  addDocumentResponseHeaders: () => {},
  BILLING_TEST: false,
  apiVersion: "2026-04",
}));
// Lifecycle/GDPR routes verify the webhook HMAC directly (no token refresh).
vi.mock("../../app/utils/webhookAuth.server.js", () => ({ verifyShopifyWebhook: webhook, releaseWebhookDelivery: vi.fn(async () => {}) }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const SHOP = "fresh-store.myshopify.com";
const b64url = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const HOST = b64url(`${SHOP}/admin`);

async function run(loader, url, headers) {
  try { return await loader({ request: new Request(url, headers ? { headers } : undefined) }); } catch (e) { if (e instanceof Response) return e; throw e; }
}

beforeEach(() => {
  db.shop.updateMany.mockClear();
  tx.shop.updateMany.mockClear();
});

describe("app root preserves App Store install attribution", () => {
  it("/?host&shop&surface_* → /app with every surface_* param intact", async () => {
    const { loader } = await import("../../app/routes/_index/route.jsx");
    const res = await run(loader, `https://app.navaal.ai/?shop=${SHOP}&host=${HOST}&embedded=1&surface_type=search&surface_detail=ai%20seo&surface_intra_position=2&surface_inter_position=1&ref=bilby`);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location"), "https://app.navaal.ai");
    expect(loc.pathname).toBe("/app");
    expect(loc.searchParams.get("surface_type")).toBe("search");
    expect(loc.searchParams.get("surface_detail")).toBe("ai seo");
    expect(loc.searchParams.get("surface_intra_position")).toBe("2");
    expect(loc.searchParams.get("surface_inter_position")).toBe("1");
    expect(loc.searchParams.get("ref")).toBe("bilby");
  });
});

describe("/go — attributed install link", () => {
  it("sets the navaal_ref cookie and forwards to the App Store listing with ?ref=", async () => {
    const { loader, LISTING_URL } = await import("../../app/routes/go.jsx");
    const res = await run(loader, "https://app.navaal.ai/go?ref=bilby-search");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${LISTING_URL}?ref=bilby-search`);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/^navaal_ref=bilby-search;/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=None/);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("a junk or missing ref sets no cookie and still lands on the listing", async () => {
    const { loader, LISTING_URL } = await import("../../app/routes/go.jsx");
    for (const q of ["?ref=%3Cscript%3E", "?ref=" + "x".repeat(70), ""]) {
      const res = await run(loader, `https://app.navaal.ai/go${q}`);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(LISTING_URL);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});

describe("app/uninstalled", () => {
  it("deletes shop data but KEEPS the shop record, stamping uninstalledAt from Shopify's triggered-at", async () => {
    const triggeredAt = "2026-09-09T01:02:03.000Z";
    webhook.mockResolvedValue({ shop: SHOP, topic: "APP_UNINSTALLED", payload: {}, triggeredAt });
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    const res = await action({ request: new Request("https://app.navaal.ai/webhooks/app/uninstalled", { method: "POST" }) });
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalled();
    expect(tx.shop.deleteMany).not.toHaveBeenCalled();
    expect(db.shop.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = db.shop.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ shop: SHOP, uninstalledAt: null });
    expect(where.OR[1].reinstalledAt.lt).toEqual(new Date(triggeredAt));
    expect(data.uninstalledAt).toEqual(new Date(triggeredAt));
  });
});

describe("app/uninstalled — stale delivery guard", () => {
  it("ignores a delivery triggered BEFORE the latest reinstall: nothing deleted, nothing stamped, still 200", async () => {
    webhook.mockResolvedValue({ shop: SHOP, topic: "APP_UNINSTALLED", payload: {}, triggeredAt: "2026-09-09T04:02:10.000Z" });
    db.shop.findUnique.mockResolvedValueOnce({ reinstalledAt: new Date("2026-09-09T04:18:23.000Z") });
    db.$transaction.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    const res = await action({ request: new Request("https://app.navaal.ai/webhooks/app/uninstalled", { method: "POST" }) });
    expect(res.status).toBe(200);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.shop.updateMany).not.toHaveBeenCalled();
  });

  it("processes a delivery triggered AFTER the latest reinstall", async () => {
    webhook.mockResolvedValue({ shop: SHOP, topic: "APP_UNINSTALLED", payload: {}, triggeredAt: "2026-09-09T05:00:00.000Z" });
    db.shop.findUnique.mockResolvedValueOnce({ reinstalledAt: new Date("2026-09-09T04:18:23.000Z") });
    db.$transaction.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    await action({ request: new Request("https://app.navaal.ai/webhooks/app/uninstalled", { method: "POST" }) });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.shop.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("shop/redact", () => {
  it("anonymises the shop record inside the redaction transaction", async () => {
    webhook.mockResolvedValue({ shop: SHOP, topic: "SHOP_REDACT", payload: { shop_id: 1, shop_domain: SHOP } });
    const { action } = await import("../../app/routes/webhooks.shop.redact.jsx");
    const res = await action({ request: new Request("https://app.navaal.ai/webhooks/shop/redact", { method: "POST" }) });
    expect(res.status).toBe(200);
    expect(tx.shop.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = tx.shop.updateMany.mock.calls[0][0];
    expect(where).toEqual({ shop: SHOP });
    expect(data.shop).toMatch(/^redacted:/);
    expect(data.installReferer).toBeNull();
    expect(data.redactedAt).toBeInstanceOf(Date);
    expect(tx.shop.deleteMany).not.toHaveBeenCalled();
  });
});
