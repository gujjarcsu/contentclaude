/**
 * Install-source tracking — the route-level guarantees.
 *   - The app root must carry Shopify's surface_* install params through to /app
 *     (that redirect is the path a fresh App Store install takes).
 *   - /go?ref= (our attributed install link) sets the navaal_ref cookie and
 *     forwards to the App Store listing; junk refs set nothing.
 *   - app/uninstalled stamps uninstalledAt on the shop record (row kept),
 *     passing Shopify's triggered-at so a late duplicate cannot hit a live shop.
 *   - shop/redact anonymises the shop record inside the redaction transaction.
 *
 * NOTE ON ORDERING. Both webhook handlers now answer 200 and finish the
 * deletion afterwards — Shopify measured them at 1,039 ms and 816 ms because
 * ~26 sequential deletes ran before the response. So these tests call the
 * action, then `drainWebhookWork()` to wait for the deferred half, exactly as
 * the process does on shutdown. The part that must still happen BEFORE the
 * response is the durable marker (uninstalledAt / the GDPR audit row), and
 * that is asserted separately.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, tx, webhook } = vi.hoisted(() => {
  const model = () => ({
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async ({ data }) => data),
    updateMany: vi.fn(async () => ({ count: 1 })),
  });
  // A transaction client that mocks ANY model, rather than a hand-copied list
  // of the thirteen that existed when this was written.
  //
  // It used to restate every name. P6.2 added `productScore` and
  // `supportRequest` to `GDPR_SHOP_MODELS` — two shop-scoped tables that had
  // never been deleted on redaction — and this mock did not know them, so
  // `chunkDelete` threw on an undefined accessor and the anonymisation never
  // ran. The failure read "expected spy to be called 1 times, but got 0", which
  // points nowhere near the cause.
  //
  // Importing the real list here is not possible: this block is inside
  // `vi.hoisted`, which runs before imports are initialised. So the mock stops
  // having a list at all — a model is created on first access and memoised, and
  // assertions like `tx.shop.updateMany` work unchanged.
  //
  // Symbols and `then` return undefined deliberately: a Proxy that answers
  // `then` with an object makes anything that awaits `tx` behave strangely, and
  // that is a debugging afternoon nobody needs.
  const tx = new Proxy(
    {},
    {
      get(target, key) {
        if (typeof key === "symbol" || key === "then") return undefined;
        if (!target[key]) target[key] = model();
        return target[key];
      },
    },
  );
  const db = {
    $transaction: vi.fn(async (fn) => fn(tx)),
    shop: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn(async () => null) },
    generationJob: { updateMany: vi.fn(async () => ({ count: 0 })) },
    usageRecord: { count: vi.fn(async () => 0) },
    gDPRRequest: { create: vi.fn(async ({ data }) => data) },
  };
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
vi.mock("../../app/utils/webhookAuth.server.js", () => ({
  verifyShopifyWebhook: webhook,
  releaseWebhookDelivery: vi.fn(async () => {}),
}));
const { log } = vi.hoisted(() => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: log }));
// Phase 11 Part A — the webhook asks Shopify before it believes the delivery.
// Undecided by default, so every case above this line behaves as before.
const { probe } = vi.hoisted(() => ({ probe: vi.fn(async () => ({ installed: null, reason: "no_offline_session" })) }));
vi.mock("../../app/utils/installState.server.js", () => ({ probeInstalled: probe, UNINSTALL_RECHECK_DELAY_MS: 0 }));

const { drainWebhookWork } = await import("../../app/utils/webhookWork.server.js");

const SHOP = "fresh-store.myshopify.com";
const b64url = (s) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const HOST = b64url(`${SHOP}/admin`);

async function run(loader, url, headers) {
  try {
    return await loader({ request: new Request(url, headers ? { headers } : undefined) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

beforeEach(() => {
  db.shop.updateMany.mockClear();
  tx.shop.updateMany.mockClear();
  probe.mockReset();
  probe.mockResolvedValue({ installed: null, reason: "no_offline_session" });
  for (const f of Object.values(log)) f.mockClear();
});

describe("app root preserves App Store install attribution", () => {
  it("/?host&shop&surface_* → /app with every surface_* param intact", async () => {
    const { loader } = await import("../../app/routes/_index/route.jsx");
    const res = await run(
      loader,
      `https://app.navaal.ai/?shop=${SHOP}&host=${HOST}&embedded=1&surface_type=search&surface_detail=ai%20seo&surface_intra_position=2&surface_inter_position=1&ref=bilby`,
    );
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
    db.$transaction.mockClear();
    const res = await action({
      request: new Request("https://app.navaal.ai/webhooks/app/uninstalled", { method: "POST" }),
    });
    expect(res.status).toBe(200);
    // The 200 goes out before the deletion — that is the whole point.
    expect(db.$transaction).not.toHaveBeenCalled();
    await drainWebhookWork();
    expect(db.$transaction).toHaveBeenCalled();
    expect(tx.shop.deleteMany).not.toHaveBeenCalled();
    // captureUsageCarryover (Phase 0 item 10) also writes to the shop row, so
    // find the call that actually stamps the uninstall.
    const stamp = db.shop.updateMany.mock.calls.find(([a]) => a?.data?.uninstalledAt);
    expect(stamp).toBeTruthy();
    const { where, data } = stamp[0];
    expect(where).toMatchObject({ shop: SHOP, uninstalledAt: null });
    expect(where.OR[1].reinstalledAt.lt).toEqual(new Date(triggeredAt));
    expect(data.uninstalledAt).toEqual(new Date(triggeredAt));
  });
});

describe("app/uninstalled — stale delivery guard", () => {
  it("ignores a delivery triggered BEFORE the latest reinstall: nothing deleted, nothing stamped, still 200", async () => {
    webhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_UNINSTALLED",
      payload: {},
      triggeredAt: "2026-09-09T04:02:10.000Z",
    });
    db.shop.findUnique.mockResolvedValueOnce({ reinstalledAt: new Date("2026-09-09T04:18:23.000Z") });
    db.$transaction.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    const res = await action({
      request: new Request("https://app.navaal.ai/webhooks/app/uninstalled", { method: "POST" }),
    });
    expect(res.status).toBe(200);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.shop.updateMany).not.toHaveBeenCalled();
  });

  it("processes a delivery triggered AFTER the latest reinstall", async () => {
    webhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_UNINSTALLED",
      payload: {},
      triggeredAt: "2026-09-09T05:00:00.000Z",
    });
    db.shop.findUnique.mockResolvedValueOnce({ reinstalledAt: new Date("2026-09-09T04:18:23.000Z") });
    db.$transaction.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    await action({
      request: new Request("https://app.navaal.ai/webhooks/app/uninstalled", { method: "POST" }),
    });
    await drainWebhookWork();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    // The uninstall is stamped (alongside the usage-carryover write).
    expect(db.shop.updateMany.mock.calls.some(([a]) => a?.data?.uninstalledAt)).toBe(true);
  });

  // ── Phase 0 item 14 ──────────────────────────────────────────────────────
  it("cancels the shop's in-flight jobs, so the worker stops instead of grinding through 401s", async () => {
    webhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_UNINSTALLED",
      payload: {},
      triggeredAt: new Date().toISOString(),
    });
    db.shop.findUnique.mockResolvedValueOnce(null);
    db.generationJob.updateMany.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    await action({
      request: new Request("https://app.navaal.ai/webhooks/app/uninstalled", { method: "POST" }),
    });
    await drainWebhookWork();

    const call = db.generationJob.updateMany.mock.calls.find(([a]) => a?.data?.status === "failed");
    expect(call).toBeTruthy();
    expect(call[0].where).toMatchObject({ shop: SHOP, status: { in: ["queued", "processing"] } });
    expect(call[0].data.errorLog).toMatch(/uninstalled/i);
  });

  // ── Phase 0 item 10 ──────────────────────────────────────────────────────
  it("captures this month's usage onto the surviving shop row before the deletion", async () => {
    webhook.mockResolvedValue({
      shop: SHOP,
      topic: "APP_UNINSTALLED",
      payload: {},
      triggeredAt: new Date().toISOString(),
    });
    db.shop.findUnique.mockResolvedValueOnce(null);
    db.usageRecord.count.mockResolvedValueOnce(9);
    db.shop.updateMany.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    await action({
      request: new Request("https://app.navaal.ai/webhooks/app/uninstalled", { method: "POST" }),
    });
    await drainWebhookWork();

    const carry = db.shop.updateMany.mock.calls.find(([a]) => a?.data?.usageCarryover !== undefined);
    expect(carry).toBeTruthy();
    expect(carry[0].data.usageCarryover).toBe(9);
    expect(carry[0].data.usageMonth).toBe(new Date().toISOString().slice(0, 7));
  });
});

describe("app/uninstalled — the delivery that arrives AFTER the reinstall it never knew about (Phase 11 Part A)", () => {
  // navaal-qa-fresh: uninstalled 10 Sep, the webhook never arrived; reinstalled
  // 14 Sep, so the row had no reinstalledAt for the timestamp guard to use;
  // the late delivery then stamped an installed shop and the sweep deleted
  // its rows on every visit. The token is the fact: Shopify revokes it at
  // uninstall, so a token that answers means this delivery is history.
  const post = () => new Request("https://app.navaal.ai/webhooks/app/uninstalled", { method: "POST" });

  it("a delivery for a shop whose token still answers is acknowledged and NOT acted on — no stamp, no deletion, logged", async () => {
    webhook.mockResolvedValue({ shop: SHOP, topic: "APP_UNINSTALLED", payload: {}, triggeredAt: "2026-09-10T04:21:00.000Z" });
    db.shop.findUnique.mockResolvedValueOnce({ reinstalledAt: null }); // the reinstall was never recorded
    probe.mockResolvedValue({ installed: true, status: 200 });
    db.$transaction.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    const res = await action({ request: post() });
    expect(res.status).toBe(200);
    await drainWebhookWork();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.shop.updateMany.mock.calls.some(([a]) => a?.data?.uninstalledAt)).toBe(false);
    expect(log.warn.mock.calls.some((c) => c[0]?.event === "uninstall_delivery_contradicted")).toBe(true);
    expect(probe).toHaveBeenCalledTimes(2); // the second look, after the 200
    expect(log.info.mock.calls.some((c) => c[0]?.event === "uninstall_recheck_still_installed")).toBe(true);
  });

  it("a delivery with NO triggered-at header gets the same protection (the old guard could not help it)", async () => {
    webhook.mockResolvedValue({ shop: SHOP, topic: "APP_UNINSTALLED", payload: {}, triggeredAt: null });
    probe.mockResolvedValue({ installed: true, status: 200 });
    db.$transaction.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    expect((await action({ request: post() })).status).toBe(200);
    await drainWebhookWork();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.shop.updateMany.mock.calls.some(([a]) => a?.data?.uninstalledAt)).toBe(false);
  });

  it("when the second look finds the token refused, the uninstall proceeds — revocation was only slower than the webhook", async () => {
    webhook.mockResolvedValue({ shop: SHOP, topic: "APP_UNINSTALLED", payload: {}, triggeredAt: "2026-09-15T04:21:00.000Z" });
    db.shop.findUnique.mockResolvedValueOnce({ reinstalledAt: null });
    probe.mockResolvedValueOnce({ installed: true, status: 200 }).mockResolvedValueOnce({ installed: false, status: 401 });
    db.$transaction.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    expect((await action({ request: post() })).status).toBe(200);
    expect(db.shop.updateMany.mock.calls.some(([a]) => a?.data?.uninstalledAt)).toBe(false); // nothing before the 200
    await drainWebhookWork();
    expect(log.warn.mock.calls.some((c) => c[0]?.event === "uninstall_recheck_confirmed")).toBe(true);
    expect(db.shop.updateMany.mock.calls.some(([a]) => a?.data?.uninstalledAt)).toBe(true);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("a delivery for a shop whose token is refused is processed exactly as before", async () => {
    webhook.mockResolvedValue({ shop: SHOP, topic: "APP_UNINSTALLED", payload: {}, triggeredAt: "2026-09-15T04:21:00.000Z" });
    db.shop.findUnique.mockResolvedValueOnce({ reinstalledAt: null });
    probe.mockResolvedValue({ installed: false, status: 401 });
    db.$transaction.mockClear();
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    expect((await action({ request: post() })).status).toBe(200);
    expect(db.shop.updateMany.mock.calls.some(([a]) => a?.data?.uninstalledAt)).toBe(true); // stamped BEFORE the 200, as always
    await drainWebhookWork();
    expect(db.$transaction).toHaveBeenCalled();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("the stale-timestamp guard still runs first and needs no probe", async () => {
    webhook.mockResolvedValue({ shop: SHOP, topic: "APP_UNINSTALLED", payload: {}, triggeredAt: "2026-09-10T04:21:00.000Z" });
    db.shop.findUnique.mockResolvedValueOnce({ reinstalledAt: new Date("2026-09-14T04:00:00.000Z") });
    const { action } = await import("../../app/routes/webhooks.app.uninstalled.jsx");
    expect((await action({ request: post() })).status).toBe(200);
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("shop/redact — for a shop whose token Shopify still honours (Phase 11 Part A)", () => {
  it("is recorded, marked complete, and NOT executed — the app it serves keeps its rows", async () => {
    webhook.mockResolvedValue({ shop: SHOP, topic: "SHOP_REDACT", payload: { shop_id: 1, shop_domain: SHOP }, webhookId: "w1", triggeredAt: "2026-09-16T04:00:00.000Z" });
    probe.mockResolvedValue({ installed: true, status: 200 });
    db.gDPRRequest.updateMany = vi.fn(async () => ({ count: 1 }));
    db.$transaction.mockClear();
    const { action } = await import("../../app/routes/webhooks.shop.redact.jsx");
    expect((await action({ request: new Request("https://app.navaal.ai/webhooks/shop/redact", { method: "POST" }) })).status).toBe(200);
    expect(db.gDPRRequest.create).toHaveBeenCalled(); // the audit row is always written
    await drainWebhookWork();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.shop.updateMany).not.toHaveBeenCalled();
    expect(db.gDPRRequest.updateMany).toHaveBeenCalledWith({ where: { shop: SHOP, requestType: "shop_redact", completedAt: null }, data: { completedAt: expect.any(Date) } });
    expect(log.warn.mock.calls.some((c) => c[0]?.event === "shop_redact_contradicted")).toBe(true);
  });
});

describe("shop/redact", () => {
  it("anonymises the shop record inside the redaction transaction", async () => {
    webhook.mockResolvedValue({
      shop: SHOP,
      topic: "SHOP_REDACT",
      payload: { shop_id: 1, shop_domain: SHOP },
    });
    const { action } = await import("../../app/routes/webhooks.shop.redact.jsx");
    db.gDPRRequest.create.mockClear();
    const res = await action({
      request: new Request("https://app.navaal.ai/webhooks/shop/redact", { method: "POST" }),
    });
    expect(res.status).toBe(200);
    // The audit row is the durable marker and is written BEFORE the 200; the
    // deletion and the anonymisation run after it.
    expect(db.gDPRRequest.create).toHaveBeenCalledTimes(1);
    expect(tx.shop.updateMany).not.toHaveBeenCalled();
    await drainWebhookWork();
    expect(tx.shop.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = tx.shop.updateMany.mock.calls[0][0];
    expect(where).toEqual({ shop: SHOP });
    expect(data.shop).toMatch(/^redacted:/);
    expect(data.installReferer).toBeNull();
    expect(data.redactedAt).toBeInstanceOf(Date);
    expect(tx.shop.deleteMany).not.toHaveBeenCalled();
  });
});
