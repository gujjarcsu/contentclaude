/**
 * Phase 11 Part A — the app and Shopify disagreed about whether a shop was
 * installed, and the app's belief won. Held here:
 *
 *   - the probe: 200 with a shop name is installed; 401/403/404 is not;
 *     anything else, no session, or a timeout is "could not tell" — never a
 *     verdict invented from a failure
 *   - restore: clears the flag the way a reinstall would (every "first" is
 *     first again, the Phase 10 funnel stamps included), counts the install,
 *     names the source, and touches nothing when the row was not flagged
 *   - reconcile, both directions: a flagged row whose token answers is
 *     restored; an installed row whose token is refused is counted and
 *     logged, NEVER stamped; a row with no session is left alone; one shop's
 *     failure does not stop the others
 *   - the hot-path cache expires: a flag flipped on the other machine is
 *     re-read within SEEN_TTL_MS
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { db, log, session } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      shop: { findUnique: fn(), findMany: fn(), updateMany: fn(), createMany: fn() },
      session: { findFirst: fn() },
      plan: { findUnique: fn() },
      growthState: { findUnique: fn() },
      brandVoice: { findUnique: fn() },
    },
    log: { info: fn(), warn: fn(), error: fn(), debug: fn() },
    session: { current: null },
  };
});
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: log }));
vi.mock("../../app/utils/offlineToken.server.js", () => ({ getFreshOfflineSession: vi.fn(async () => session.current) }));

const state = await import("../../app/utils/installState.server.js");
const tracking = await import("../../app/utils/installTracking.server.js");
const { probeInstalled, reconcileInstallState } = state;
const { restoreInstalledState, REINSTALL_RESET, trackShopAuth, markShopUninstalled, SEEN_TTL_MS, _resetInstallTrackingForTests } = tracking;

const SHOP = "a-store.myshopify.com";
const res = (status, body) => ({ status, json: async () => body });
const fetchWith = (status, body) => vi.fn(async () => res(status, body));

beforeEach(() => {
  _resetInstallTrackingForTests();
  for (const model of Object.values(db)) for (const f of Object.values(model)) f.mockReset();
  for (const f of Object.values(log)) f.mockReset();
  session.current = { shop: SHOP, accessToken: "tok", isOnline: false };
  db.shop.updateMany.mockResolvedValue({ count: 1 });
  db.shop.findUnique.mockResolvedValue({ shop: SHOP, uninstalledAt: new Date("2026-09-14T04:00:00Z"), reinstalledAt: null, installCount: 1 });
  db.session.findFirst.mockResolvedValue({ id: `offline_${SHOP}` });
});
afterEach(() => vi.useRealTimers());

describe("probeInstalled — Shopify is the fact", () => {
  it("200 with a shop name means installed; the token is sent, never logged", async () => {
    const f = fetchWith(200, { data: { shop: { name: "A Store" } } });
    expect(await probeInstalled(SHOP, { fetchImpl: f })).toEqual({ installed: true, status: 200 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://${SHOP}/admin/api/${state.INSTALL_PROBE_API_VERSION}/graphql.json`);
    expect(init.headers["X-Shopify-Access-Token"]).toBe("tok");
    expect(JSON.parse(init.body).query).toBe("{ shop { name } }");
    expect(JSON.stringify(log.info.mock.calls) + JSON.stringify(log.warn.mock.calls)).not.toMatch(/tok/);
  });

  it("401, 403 and 404 mean the token is not honoured — not installed", async () => {
    for (const s of [401, 403, 404]) expect(await probeInstalled(SHOP, { fetchImpl: fetchWith(s, { errors: "x" }) })).toEqual({ installed: false, status: s, reason: "token_not_honoured" });
  });

  it("anything else is 'could not tell', never a verdict: 500, 402, an empty 200, a timeout, no session, a session that will not load", async () => {
    expect((await probeInstalled(SHOP, { fetchImpl: fetchWith(500, null) })).installed).toBe(null);
    expect((await probeInstalled(SHOP, { fetchImpl: fetchWith(402, null) })).installed).toBe(null);
    expect((await probeInstalled(SHOP, { fetchImpl: fetchWith(200, { data: { shop: null } }) })).installed).toBe(null);
    const timeout = vi.fn(async () => {
      const e = new Error("t");
      e.name = "TimeoutError";
      throw e;
    });
    expect(await probeInstalled(SHOP, { fetchImpl: timeout })).toMatchObject({ installed: null, reason: "timeout" });
    session.current = null;
    expect(await probeInstalled(SHOP, { fetchImpl: fetchWith(200, {}) })).toEqual({ installed: null, reason: "no_offline_session" });
    expect((await probeInstalled(SHOP, { fetchImpl: fetchWith(200, {}), loadSession: async () => { throw new Error("db"); } })).reason).toBe("session_load_failed");
    expect((await probeInstalled("", {})).installed).toBe(null);
  });
});

describe("restoreInstalledState — clears the flag the way a reinstall would", () => {
  it("only a flagged row changes; the install is counted, the source named, every first is first again", async () => {
    const now = new Date("2026-09-15T01:00:00Z");
    expect(await restoreInstalledState(SHOP, { source: "sweep_reconcile", now })).toBe(1);
    const { where, data } = db.shop.updateMany.mock.calls[0][0];
    expect(where).toEqual({ shop: SHOP, uninstalledAt: { not: null } });
    expect(data).toMatchObject({ uninstalledAt: null, reinstalledAt: now, installCount: { increment: 1 }, reinstallSource: "sweep_reconcile", ...REINSTALL_RESET });
    expect(REINSTALL_RESET).toMatchObject({ firstScreenAt: null, firstApproveAt: null, returnedAt: null, firstDraftSeenAt: null, firstPublishAt: null });
    const logged = log.warn.mock.calls.find((c) => c[0]?.event === "shop_install_reconciled");
    expect(logged[0]).toMatchObject({ shop: SHOP, source: "sweep_reconcile", installCount: 2 });
    expect(logged[0].hadUninstalledAt).toEqual(new Date("2026-09-14T04:00:00Z"));
  });

  it("returns 0 and logs nothing when the row was not flagged; never throws", async () => {
    db.shop.updateMany.mockResolvedValue({ count: 0 });
    expect(await restoreInstalledState(SHOP)).toBe(0);
    expect(log.warn).not.toHaveBeenCalled();
    db.shop.updateMany.mockRejectedValue(new Error("db down"));
    expect(await restoreInstalledState(SHOP)).toBe(0);
  });
});

describe("reconcileInstallState — both directions, nightly", () => {
  it("a flagged row whose token answers is restored; one whose token is refused is left flagged; no session, no probe", async () => {
    db.shop.findMany.mockResolvedValueOnce([{ shop: "back.myshopify.com" }, { shop: "gone.myshopify.com" }, { shop: "quiet.myshopify.com" }]).mockResolvedValueOnce([]);
    db.session.findFirst.mockImplementation(async ({ where }) => (where.shop === "quiet.myshopify.com" ? null : { id: "s" }));
    const probe = vi.fn(async (shop) => ({ installed: shop === "back.myshopify.com" }));
    const out = await reconcileInstallState({ probe, now: new Date("2026-09-15T00:00:00Z") });
    expect(out).toMatchObject({ flagged: 3, flaggedWithSession: 2, restored: 1, confirmedGone: 1, installed: 0, installedRefused: 0 });
    expect(probe).toHaveBeenCalledTimes(2);
    expect(db.shop.updateMany).toHaveBeenCalledTimes(1);
    expect(db.shop.updateMany.mock.calls[0][0].where.shop).toBe("back.myshopify.com");
  });

  it("an installed row whose token is refused is counted and logged, never stamped", async () => {
    db.shop.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ shop: "dead.myshopify.com" }, { shop: "live.myshopify.com" }]);
    const probe = vi.fn(async (shop) => ({ installed: shop === "live.myshopify.com", status: shop === "live.myshopify.com" ? 200 : 401 }));
    const out = await reconcileInstallState({ probe });
    expect(out).toMatchObject({ installed: 2, installedRefused: 1, restored: 0 });
    expect(db.shop.updateMany).not.toHaveBeenCalled();
    const logged = log.warn.mock.calls.find((c) => c[0]?.event === "install_state_contradicted_reverse");
    expect(logged[0]).toMatchObject({ shop: "dead.myshopify.com", status: 401 });
  });

  it("one shop's failure does not stop the others, and the whole thing never throws", async () => {
    db.shop.findMany.mockResolvedValueOnce([{ shop: "boom.myshopify.com" }, { shop: "back.myshopify.com" }]).mockResolvedValueOnce([]);
    const probe = vi.fn(async (shop) => {
      if (shop === "boom.myshopify.com") throw new Error("network");
      return { installed: true };
    });
    expect(await reconcileInstallState({ probe })).toMatchObject({ restored: 1 });
    db.shop.findMany.mockRejectedValue(new Error("db down"));
    expect(await reconcileInstallState({ probe })).toMatchObject({ flagged: 0, restored: 0 });
    expect(log.error).toHaveBeenCalled();
  });
});

describe("the hot-path cache expires, so a flag flipped on the other machine is seen", () => {
  const req = () => new Request(`https://app.navaal.ai/app?shop=${SHOP}&host=x&embedded=1`);
  it("within the TTL a known shop skips the DB; after it the row is read again and a false flag is cleared", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T00:00:00Z"));
    db.shop.findUnique.mockResolvedValue({ shop: SHOP, installedAt: new Date("2026-09-01T00:00:00Z"), uninstalledAt: null });
    await trackShopAuth(req(), SHOP);
    expect(db.shop.findUnique).toHaveBeenCalledTimes(1);
    await trackShopAuth(req(), SHOP);
    expect(db.shop.findUnique).toHaveBeenCalledTimes(1); // hot path
    // the other machine's webhook stamped the row in the meantime
    db.shop.findUnique.mockResolvedValue({ shop: SHOP, installedAt: new Date("2026-09-01T00:00:00Z"), uninstalledAt: new Date("2026-09-15T00:05:00Z"), firstDraftSeenAt: null });
    vi.setSystemTime(new Date("2026-09-15T00:00:00Z").getTime() + SEEN_TTL_MS + 1);
    await trackShopAuth(req(), SHOP);
    expect(db.shop.findUnique.mock.calls.length).toBeGreaterThanOrEqual(2);
    const reinstall = db.shop.updateMany.mock.calls.find(([a]) => a?.data?.uninstalledAt === null);
    expect(reinstall).toBeTruthy(); // an authenticated request is proof of installation
  });

  it("the uninstall stamp still clears this process's cache immediately", async () => {
    db.shop.findUnique.mockResolvedValue({ shop: SHOP, installedAt: new Date("2026-09-01T00:00:00Z"), uninstalledAt: null });
    await trackShopAuth(req(), SHOP);
    await markShopUninstalled(SHOP, "2026-09-15T00:01:00Z");
    db.shop.findUnique.mockResolvedValue({ shop: SHOP, installedAt: new Date("2026-09-01T00:00:00Z"), uninstalledAt: new Date("2026-09-15T00:01:00Z") });
    await trackShopAuth(req(), SHOP);
    expect(db.shop.findUnique.mock.calls.length).toBeGreaterThanOrEqual(2); // the row was re-read, not served from the cache
    expect(db.shop.updateMany.mock.calls.some(([a]) => a?.data?.uninstalledAt === null)).toBe(true); // and the reinstall path ran
  });
});

describe("the shop/redact request is consumed once (Phase 11 Part A)", () => {
  it("GDPRRequest.completedAt exists; the migration is additive and marks every request already on file complete", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/^\s*completedAt DateTime\?/m);
    const sql = readFileSync("prisma/migrations/20260915130000_gdpr_completed/migration.sql", "utf8");
    expect(sql).toMatch(/ADD COLUMN "completedAt" TIMESTAMP\(3\)/);
    expect(sql).toMatch(/UPDATE "GDPRRequest" SET "completedAt" = "processedAt" WHERE "requestType" = 'shop_redact' AND "completedAt" IS NULL/);
    expect(sql).not.toMatch(/DROP|DELETE/i);
  });
});
