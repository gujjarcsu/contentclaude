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
    gDPRRequest: { findMany: vi.fn(), create: vi.fn() },
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
vi.mock("../../app/utils/installTracking.server.js", () => ({
  markShopUninstalled: vi.fn(async () => 1),
  redactShopRecord: vi.fn(async () => ({ count: 1 })),
}));

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
  it("finishes a redaction whose Shop row was never anonymised", async () => {
    db.gDPRRequest.findMany.mockResolvedValue([{ shop: SHOP }]);
    db.shop.findUnique.mockResolvedValue({ redactedAt: null });

    const result = await sweepUnfinishedWebhookWork();

    expect(result.redactions).toBe(1);
    expect(redactShopRecord).toHaveBeenCalledWith(expect.anything(), SHOP);
  });

  it("leaves a redaction that already completed alone", async () => {
    db.gDPRRequest.findMany.mockResolvedValue([{ shop: SHOP }]);
    db.shop.findUnique.mockResolvedValue({ redactedAt: new Date() });

    expect((await sweepUnfinishedWebhookWork()).redactions).toBe(0);
    expect(redactShopRecord).not.toHaveBeenCalled();
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
