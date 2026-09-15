/**
 * Webhook response time, and the safety net that makes it safe.
 *
 * Shopify measured app/uninstalled at 1,039 ms and shop/redact at 816 ms. The
 * cost is round trips, not rows: chunkDelete walks 13 models issuing a findMany
 * and a deleteMany each, so a shop with NO data still spends ~26 sequential
 * queries before the 200 goes out. A webhook that spends a second in the
 * database fails the moment the database is slow — which is exactly how a
 * delivery earns the first failure that the old 24 h window then made permanent.
 *
 * So the handlers now answer first and delete afterwards. That trade is only
 * honest if a process killed mid-deletion loses nothing, which is what these
 * tests are about: the synchronous half always leaves a durable marker, and the
 * sweep finds it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { db } = vi.hoisted(() => ({
  db: {
    gDPRRequest: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    shop: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    session: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []), deleteMany: vi.fn() },
    generationJob: { updateMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (fn) => fn(txClient())),
  },
}));

/** A transaction client whose every model answers "no rows left". */
function txClient() {
  const model = { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 0 })) };
  return new Proxy(
    { shop: { updateMany: vi.fn(async () => ({ count: 1 })) } },
    { get: (t, k) => (k in t ? t[k] : model) },
  );
}

vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../app/utils/plans.server.js", () => ({ captureUsageCarryover: vi.fn(async () => {}) }));
const { probe, restore } = vi.hoisted(() => ({
  probe: vi.fn(async () => ({ installed: null, reason: "no_offline_session" })),
  restore: vi.fn(async () => 1),
}));
vi.mock("../../app/utils/installTracking.server.js", () => ({
  markShopUninstalled: vi.fn(async () => 1),
  redactShopRecord: vi.fn(async () => ({ count: 1 })),
  restoreInstalledState: restore,
}));
vi.mock("../../app/utils/installState.server.js", () => ({ probeInstalled: probe }));

const {
  finishAfterResponse,
  drainWebhookWork,
  inFlightWebhookWork,
  sweepUnfinishedWebhookWork,
  finishShopRedaction,
  SWEEP_GRACE_MS,
} = await import("../../app/utils/webhookWork.server.js");
const { redactShopRecord } = await import("../../app/utils/installTracking.server.js");

const SHOP = "a-store.myshopify.com";
const src = (f) => readFileSync(f, "utf8");

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn) => fn(txClient()));
  db.gDPRRequest.findMany.mockResolvedValue([]);
  db.shop.findMany.mockResolvedValue([]);
  db.session.count.mockResolvedValue(0);
  probe.mockResolvedValue({ installed: null, reason: "no_offline_session" });
});

describe("the handler answers before the work runs", () => {
  it("finishAfterResponse does not block the caller", async () => {
    let done = false;
    let release;
    const gate = new Promise((r) => (release = r));
    const p = finishAfterResponse("t", { shop: SHOP }, async () => {
      await gate;
      done = true;
    });
    // The handler would have returned its Response by now.
    expect(done).toBe(false);
    expect(inFlightWebhookWork()).toBe(1);
    release();
    await p;
    expect(done).toBe(true);
    expect(inFlightWebhookWork()).toBe(0);
  });

  it("a failure in the deferred half never reaches the caller", async () => {
    // The delivery is already acknowledged. Throwing here would be an
    // unhandled rejection, not a retry.
    const p = finishAfterResponse("t", { shop: SHOP }, async () => {
      throw new Error("database went away");
    });
    await expect(p).resolves.toBeUndefined();
    expect(inFlightWebhookWork()).toBe(0);
  });
});

describe("shutdown waits for work that is still running", () => {
  it("drains in-flight work before the process exits", async () => {
    let finished = false;
    finishAfterResponse("t", { shop: SHOP }, async () => {
      await new Promise((r) => setTimeout(r, 20));
      finished = true;
    });
    await drainWebhookWork(5000);
    expect(finished).toBe(true);
  });

  it("gives up rather than hanging shutdown forever", async () => {
    finishAfterResponse("t", { shop: SHOP }, () => new Promise(() => {}));
    const drained = await drainWebhookWork(30);
    expect(drained).toBe(0);
    expect(inFlightWebhookWork()).toBe(1);
  });

  it("returns immediately when there is nothing to wait for", async () => {
    // The in-flight task from the previous test is deliberately still hanging,
    // so assert on the empty case directly rather than on module state.
    expect(await drainWebhookWork(0)).toBe(0);
  });
});

describe("the sweep finishes work that was acknowledged but never completed", () => {
  const T_REQUEST = new Date("2026-09-12T04:25:04.000Z");

  it("finishes a redaction whose Shop row was never anonymised — and consumes the request", async () => {
    db.gDPRRequest.findMany.mockResolvedValue([{ shop: SHOP, processedAt: T_REQUEST }]);
    db.shop.findUnique.mockResolvedValue({ redactedAt: null, installedAt: new Date("2026-09-01T00:00:00Z"), reinstalledAt: null });

    const result = await sweepUnfinishedWebhookWork();

    expect(result.redactions).toBe(1);
    expect(redactShopRecord).toHaveBeenCalledWith(expect.anything(), SHOP);
    expect(db.gDPRRequest.updateMany).toHaveBeenCalledWith({ where: { shop: SHOP, requestType: "shop_redact", completedAt: null }, data: { completedAt: expect.any(Date) } });
    expect(db.gDPRRequest.findMany.mock.calls[0][0].where).toMatchObject({ requestType: "shop_redact", completedAt: null });
  });

  it("leaves a redaction that already completed alone, and consumes the request so it is never looked at again", async () => {
    db.gDPRRequest.findMany.mockResolvedValue([{ shop: SHOP, processedAt: T_REQUEST }]);
    db.shop.findUnique.mockResolvedValue({ redactedAt: new Date(), installedAt: new Date("2026-09-01T00:00:00Z") });

    expect((await sweepUnfinishedWebhookWork()).redactions).toBe(0);
    expect(redactShopRecord).not.toHaveBeenCalled();
    expect(db.gDPRRequest.updateMany).toHaveBeenCalledTimes(1);
  });

  it("Phase 11 Part A — a request OLDER than the current install is a different install of the same domain: not owed, consumed, logged, nothing deleted", async () => {
    // navaal-qa-fresh: redacted 12 Sep (correctly); reinstalled 14 Sep; the
    // sweep found the 12 Sep request, matched the new row by domain, and
    // anonymised it minutes after every install — five times on the 14th.
    db.gDPRRequest.findMany.mockResolvedValue([{ shop: SHOP, processedAt: T_REQUEST }]);
    db.shop.findUnique.mockResolvedValue({ redactedAt: null, installedAt: new Date("2026-09-14T07:39:26.000Z"), reinstalledAt: null });

    const result = await sweepUnfinishedWebhookWork();

    expect(result.redactions).toBe(0);
    expect(redactShopRecord).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.gDPRRequest.updateMany).toHaveBeenCalledWith({ where: { shop: SHOP, requestType: "shop_redact", completedAt: null }, data: { completedAt: expect.any(Date) } });
  });

  it("Phase 11 Part A — a reinstall after the request is judged on reinstalledAt, and one domain is judged once per sweep", async () => {
    db.gDPRRequest.findMany.mockResolvedValue([{ shop: SHOP, processedAt: T_REQUEST }, { shop: SHOP, processedAt: new Date("2026-09-13T00:00:00Z") }]);
    db.shop.findUnique.mockResolvedValue({ redactedAt: null, installedAt: new Date("2026-09-01T00:00:00Z"), reinstalledAt: new Date("2026-09-14T07:39:26.000Z") });

    expect((await sweepUnfinishedWebhookWork()).redactions).toBe(0);
    expect(db.shop.findUnique).toHaveBeenCalledTimes(1);
    expect(redactShopRecord).not.toHaveBeenCalled();
  });

  it("finishShopRedaction consumes the request after anonymising", async () => {
    await finishShopRedaction(SHOP);
    expect(db.gDPRRequest.updateMany).toHaveBeenCalledWith({ where: { shop: SHOP, requestType: "shop_redact", completedAt: null }, data: { completedAt: expect.any(Date) } });
  });

  it("treats a missing Shop row as already done, not as owed", async () => {
    // redactShopRecord rewrites the domain to redacted:<hash>, so the original
    // domain no longer resolves. That is success, not a gap.
    db.gDPRRequest.findMany.mockResolvedValue([{ shop: SHOP }]);
    db.shop.findUnique.mockResolvedValue(null);

    expect((await sweepUnfinishedWebhookWork()).redactions).toBe(0);
  });

  it("finishes an uninstall deletion that left rows behind", async () => {
    db.shop.findMany.mockResolvedValue([{ shop: SHOP }]);
    db.session.count.mockResolvedValue(3);

    expect((await sweepUnfinishedWebhookWork()).uninstalls).toBe(1);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("Phase 11 Part A — a flagged row whose token Shopify still honours is RESTORED, and nothing is deleted", async () => {
    db.shop.findMany.mockResolvedValue([{ shop: SHOP }]);
    db.session.count.mockResolvedValue(1); // the session an installed shop leaves on every visit
    probe.mockResolvedValue({ installed: true, status: 200 });
    const out = await sweepUnfinishedWebhookWork({ now: 1_700_000_000_000 });
    expect(out).toMatchObject({ uninstalls: 0, reconciled: 1 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledWith(SHOP, { source: "sweep_reconcile", now: new Date(1_700_000_000_000) });
  });

  it("Phase 11 Part A — a flagged row whose token is refused is finished as before; an undecided probe also finishes (the old behaviour)", async () => {
    db.shop.findMany.mockResolvedValue([{ shop: SHOP }]);
    db.session.count.mockResolvedValue(1);
    probe.mockResolvedValue({ installed: false, status: 401 });
    expect((await sweepUnfinishedWebhookWork()).uninstalls).toBe(1);
    expect(restore).not.toHaveBeenCalled();
    db.$transaction.mockClear();
    probe.mockResolvedValue({ installed: null });
    expect((await sweepUnfinishedWebhookWork()).uninstalls).toBe(1);
  });

  it("leaves an uninstall whose deletion completed alone", async () => {
    db.shop.findMany.mockResolvedValue([{ shop: SHOP }]);
    db.session.count.mockResolvedValue(0);

    expect((await sweepUnfinishedWebhookWork()).uninstalls).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("does not race work that started seconds ago", async () => {
    await sweepUnfinishedWebhookWork({ now: 1_000_000_000_000 });
    const { where } = db.gDPRRequest.findMany.mock.calls[0][0];
    expect(where.processedAt.lt.getTime()).toBe(1_000_000_000_000 - SWEEP_GRACE_MS);
  });

  it("one shop's failure does not stop the sweep finishing the others", async () => {
    db.gDPRRequest.findMany.mockRejectedValue(new Error("query failed"));
    db.shop.findMany.mockResolvedValue([{ shop: SHOP }]);
    db.session.count.mockResolvedValue(2);

    const result = await sweepUnfinishedWebhookWork();
    expect(result.redactions).toBe(0);
    expect(result.uninstalls).toBe(1);
  });

  it("anonymises the Shop row LAST, so an interrupted run is still detectable", async () => {
    const order = [];
    db.$transaction.mockImplementation(async (fn) => {
      const model = {
        findMany: vi.fn(async () => {
          order.push("delete");
          return [];
        }),
        deleteMany: vi.fn(),
      };
      return fn(new Proxy({}, { get: () => model }));
    });
    redactShopRecord.mockImplementation(async () => {
      order.push("redact");
      return { count: 1 };
    });

    await finishShopRedaction(SHOP);

    expect(order[order.length - 1]).toBe("redact");
    expect(order).toContain("delete");
  });
});

describe("source guard — the routes really do defer", () => {
  const routes = {
    "app/routes/webhooks.app.uninstalled.jsx": "app_uninstalled_deferred",
    "app/routes/webhooks.shop.redact.jsx": "shop_redact_deferred",
  };

  it.each(Object.entries(routes))("%s hands its work to finishAfterResponse", (file, event) => {
    const s = src(file);
    expect(s).toMatch(/finishAfterResponse\(/);
    expect(s).toContain(event);
  });

  it.each(Object.keys(routes))("%s no longer deletes before answering", (file) => {
    // chunkDelete inside the route body is what put ~26 queries in front of the
    // 200. It now lives behind finishUninstall / finishShopRedaction.
    expect(src(file)).not.toMatch(/chunkDelete/);
  });

  it("app/uninstalled stamps uninstalledAt BEFORE it defers", () => {
    const s = src("app/routes/webhooks.app.uninstalled.jsx");
    expect(s.indexOf("markShopUninstalled(shop")).toBeLessThan(s.indexOf("finishAfterResponse("));
  });

  it("shop/redact writes its audit row BEFORE it defers", () => {
    const s = src("app/routes/webhooks.shop.redact.jsx");
    expect(s.indexOf("gDPRRequest.create")).toBeLessThan(s.indexOf("finishAfterResponse("));
  });

  it("the worker actually runs the sweep", () => {
    expect(src("app/utils/scheduler.server.js")).toMatch(/sweepUnfinishedWebhookWork\(\)/);
  });

  it("shutdown actually drains", () => {
    expect(src("app/utils/startup.server.js")).toMatch(/drainWebhookWork\(\)/);
  });
});
