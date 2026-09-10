/**
 * Install-source tracking — the shop record.
 *
 * Locks the truth rules: a fresh install is attributed from the request it
 * arrives on (App Store surface_* params, our ?ref=, referer) and never
 * re-attributed later; a shop that predates tracking is recorded as
 * "pre_tracking" (never as a fresh install); reinstalls are counted exactly
 * once even under the two parallel document loaders and keep the first-install
 * attribution intact; duplicate uninstall webhooks cannot mark a live shop as
 * gone; the hot path never touches the DB; tracking can never throw into
 * authentication.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { db, log } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      shop: { findUnique: fn(), createMany: fn(), update: fn(), updateMany: fn() },
      plan: { findUnique: fn() },
      growthState: { findUnique: fn() },
      brandVoice: { findUnique: fn() },
    },
    log: { info: fn(), warn: fn(), error: fn(), debug: fn() },
  };
});
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: log }));

const mod = await import("../../app/utils/installTracking.server.js");
const {
  extractInstallSignals,
  classifyInstallSource,
  trackShopAuth,
  noteAfterAuth,
  markShopUninstalled,
  redactShopRecord,
  sanitizeRef,
  _resetInstallTrackingForTests,
} = mod;

const SHOP = "fresh-store.myshopify.com";
const DAYS = (n) => new Date(Date.now() - n * 86_400_000);
const MIN = (n) => new Date(Date.now() - n * 60_000);

const BARE_URL = `https://app.navaal.ai/app?shop=${SHOP}&host=abc&embedded=1&hmac=x&timestamp=1&id_token=t`;
const INSTALL_URL = `${BARE_URL}&surface_type=search&surface_detail=seo%20ai&surface_intra_position=3&surface_inter_position=1`;

function req(url, headers) {
  return new Request(url, headers ? { headers } : undefined);
}

beforeEach(() => {
  _resetInstallTrackingForTests();
  for (const model of Object.values(db)) for (const f of Object.values(model)) f.mockReset();
  for (const f of Object.values(log)) f.mockReset();
  db.plan.findUnique.mockResolvedValue(null);
  db.growthState.findUnique.mockResolvedValue(null);
  db.brandVoice.findUnique.mockResolvedValue(null);
  db.shop.findUnique.mockResolvedValue(null);
  // createMany returns {count}; the row is then read back — emulate both.
  db.shop.createMany.mockImplementation(async ({ data }) => {
    db.shop.findUnique.mockResolvedValue({ id: "s1", installCount: 1, ...data[0] });
    return { count: 1 };
  });
  db.shop.updateMany.mockResolvedValue({ count: 1 });
});

describe("extractInstallSignals", () => {
  it("reads all four App Store surface params + landing path", () => {
    const s = extractInstallSignals(req(INSTALL_URL));
    expect(s).toMatchObject({
      surfaceType: "search",
      surfaceDetail: "seo ai",
      surfaceIntraPosition: "3",
      surfaceInterPosition: "1",
      landingPath: "/app",
      hasAttribution: true,
    });
  });

  it("stores the referer as origin+path only — never a query string (could carry id_token)", () => {
    const s = extractInstallSignals(
      req(INSTALL_URL, { referer: "https://admin.shopify.com/store/x/apps/navaal?id_token=SECRET#f" }),
    );
    expect(s.referer).toBe("https://admin.shopify.com/store/x/apps/navaal");
    expect(s.referer).not.toContain("SECRET");
  });

  it("reads our own ?ref= from the query, else from the navaal_ref cookie", () => {
    expect(extractInstallSignals(req(`${BARE_URL}&ref=bilby-search`)).ref).toBe("bilby-search");
    expect(extractInstallSignals(req(BARE_URL, { cookie: "a=1; navaal_ref=site-apps-page; b=2" })).ref).toBe(
      "site-apps-page",
    );
  });

  it("rejects junk refs and reports no attribution on a plain request", () => {
    expect(sanitizeRef("<script>")).toBeNull();
    expect(sanitizeRef("x".repeat(65))).toBeNull();
    const s = extractInstallSignals(req(`${BARE_URL}&ref=%3Cscript%3E`));
    expect(s.ref).toBeNull();
    expect(s.hasAttribution).toBe(false);
  });

  it("never throws on an unparsable request", () => {
    expect(extractInstallSignals({ url: "not a url", headers: new Headers() }).hasAttribution).toBe(false);
  });
});

describe("classifyInstallSource", () => {
  it("prefers our own ref, then the App Store surface, then utm, else unknown", () => {
    expect(classifyInstallSource({ ref: "bilby", surfaceType: "search" })).toBe("ref:bilby");
    expect(classifyInstallSource({ surfaceType: "category" })).toBe("app_store:category");
    expect(classifyInstallSource({ surfaceDetail: "seo" })).toBe("app_store:unknown_surface");
    expect(classifyInstallSource({ utmSource: "newsletter" })).toBe("utm:newsletter");
    expect(classifyInstallSource({})).toBe("unknown");
  });
});

describe("trackShopAuth — fresh install", () => {
  it("creates the shop record with App Store attribution + referer on the first authenticated request", async () => {
    const row = await trackShopAuth(req(INSTALL_URL, { referer: "https://admin.shopify.com/" }), SHOP);
    expect(db.shop.createMany).toHaveBeenCalledTimes(1);
    const data = db.shop.createMany.mock.calls[0][0].data[0];
    expect(data).toMatchObject({
      shop: SHOP,
      installSource: "app_store:search",
      surfaceType: "search",
      surfaceDetail: "seo ai",
      surfaceIntraPosition: "3",
      surfaceInterPosition: "1",
      installReferer: "https://admin.shopify.com/",
      installLandingPath: "/app",
    });
    expect(Date.now() - data.installedAt.getTime()).toBeLessThan(5_000);
    expect(row.installSource).toBe("app_store:search");
  });

  it("attributes an install to our own link when the navaal_ref cookie reaches the install request", async () => {
    await trackShopAuth(req(BARE_URL, { cookie: "navaal_ref=bilby-search" }), SHOP);
    expect(db.shop.createMany.mock.calls[0][0].data[0]).toMatchObject({
      installSource: "ref:bilby-search",
      installRef: "bilby-search",
    });
  });

  it("records unknown (not a guess) when the install request carries no attribution", async () => {
    await trackShopAuth(req(BARE_URL), SHOP);
    expect(db.shop.createMany.mock.calls[0][0].data[0]).toMatchObject({
      installSource: "unknown",
      surfaceType: null,
      installRef: null,
    });
  });

  it("a shop installed BEFORE tracking is backfilled as pre_tracking with installedAt = earliest activity, ignoring request params", async () => {
    db.plan.findUnique.mockResolvedValue({ createdAt: DAYS(3) });
    db.brandVoice.findUnique.mockResolvedValue({ createdAt: DAYS(10) });
    await trackShopAuth(req(INSTALL_URL), SHOP);
    const data = db.shop.createMany.mock.calls[0][0].data[0];
    expect(data.installSource).toBe("pre_tracking");
    expect(Math.abs(data.installedAt.getTime() - DAYS(10).getTime())).toBeLessThan(2_000);
    expect(data.surfaceType).toBeUndefined();
    expect(data.installReferer).toBeUndefined();
  });

  it("a Plan created seconds ago by a parallel loader does NOT make a new install look pre-tracking", async () => {
    db.plan.findUnique.mockResolvedValue({ createdAt: MIN(1) });
    await trackShopAuth(req(INSTALL_URL), SHOP);
    expect(db.shop.createMany.mock.calls[0][0].data[0].installSource).toBe("app_store:search");
  });

  it("logs the install event exactly once when the two parallel loaders both create (createMany skipDuplicates)", async () => {
    db.shop.createMany
      .mockImplementationOnce(async ({ data }) => {
        db.shop.findUnique.mockResolvedValue({ id: "s1", installCount: 1, ...data[0] });
        return { count: 1 };
      })
      .mockImplementationOnce(async () => ({ count: 0 }));
    const [a, b] = await Promise.all([
      trackShopAuth(req(INSTALL_URL), SHOP),
      trackShopAuth(req(INSTALL_URL), SHOP),
    ]);
    expect(a.installSource).toBe("app_store:search");
    expect(b.installSource).toBe("app_store:search");
    expect(log.info.mock.calls.filter((c) => c[0]?.event === "shop_installed")).toHaveLength(1);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("trackShopAuth — hot path, afterAuth guard, immutability", () => {
  it("skips the DB entirely on later requests for a known shop", async () => {
    await trackShopAuth(req(INSTALL_URL), SHOP);
    db.shop.findUnique.mockClear();
    expect(
      await trackShopAuth(req("https://app.navaal.ai/api/jobs-status", { authorization: "Bearer x" }), SHOP),
    ).toBeNull();
    // Even a later document request that happens to carry App Store params —
    // first-install attribution is immutable, so there is nothing to learn.
    expect(await trackShopAuth(req(INSTALL_URL), SHOP)).toBeNull();
    expect(db.shop.findUnique).not.toHaveBeenCalled();
    expect(db.shop.update).not.toHaveBeenCalled();
    expect(db.shop.updateMany).not.toHaveBeenCalled();
  });

  it("afterAuth (new session) forces the DB path on a BARE request for a known shop", async () => {
    await trackShopAuth(req(INSTALL_URL), SHOP);
    db.shop.findUnique.mockClear();
    db.shop.findUnique.mockResolvedValue({
      shop: SHOP,
      installSource: "app_store:search",
      surfaceType: "search",
      installedAt: DAYS(30),
      uninstalledAt: null,
    });
    noteAfterAuth(SHOP);
    const row = await trackShopAuth(req(BARE_URL), SHOP);
    expect(db.shop.findUnique).toHaveBeenCalledTimes(1);
    expect(row.installSource).toBe("app_store:search");
    // Live shop, nothing changed → no write.
    expect(db.shop.updateMany).not.toHaveBeenCalled();
    // The flag is consumed: the next bare request is back on the hot path.
    db.shop.findUnique.mockClear();
    expect(await trackShopAuth(req(BARE_URL), SHOP)).toBeNull();
    expect(db.shop.findUnique).not.toHaveBeenCalled();
  });

  it("never re-attributes an install from a later request (no back-fill window at all)", async () => {
    db.shop.findUnique.mockResolvedValue({
      shop: SHOP,
      installSource: "unknown",
      installedAt: MIN(2),
      uninstalledAt: null,
    });
    noteAfterAuth(SHOP);
    await trackShopAuth(req(INSTALL_URL), SHOP);
    expect(db.shop.update).not.toHaveBeenCalled();
    expect(db.shop.updateMany).not.toHaveBeenCalled();
  });

  it("never throws — a DB failure is logged and swallowed", async () => {
    db.shop.findUnique.mockRejectedValue(new Error("db down"));
    await expect(trackShopAuth(req(INSTALL_URL), SHOP)).resolves.toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it("is a no-op without a shop", async () => {
    await expect(trackShopAuth(req(INSTALL_URL), null)).resolves.toBeNull();
    expect(db.shop.findUnique).not.toHaveBeenCalled();
  });
});

describe("trackShopAuth — reinstall", () => {
  const UNINSTALLED_ROW = {
    shop: SHOP,
    installSource: "app_store:search",
    surfaceType: "search",
    surfaceDetail: "seo ai",
    installReferer: "https://admin.shopify.com/",
    installedAt: DAYS(30),
    uninstalledAt: DAYS(2),
    installCount: 1,
  };

  it("counts the reinstall with ITS OWN source and leaves the first-install attribution untouched", async () => {
    db.shop.findUnique
      .mockResolvedValueOnce(UNINSTALLED_ROW)
      .mockResolvedValueOnce({
        ...UNINSTALLED_ROW,
        uninstalledAt: null,
        installCount: 2,
        reinstallSource: "ref:outreach-sep",
      });
    noteAfterAuth(SHOP);
    const row = await trackShopAuth(
      req(`${BARE_URL}&ref=outreach-sep`, { referer: "https://admin.shopify.com/" }),
      SHOP,
    );
    expect(db.shop.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = db.shop.updateMany.mock.calls[0][0];
    expect(where).toEqual({ shop: SHOP, uninstalledAt: { not: null } });
    expect(data).toMatchObject({
      uninstalledAt: null,
      installCount: { increment: 1 },
      reinstallSource: "ref:outreach-sep",
      reinstallReferer: "https://admin.shopify.com/",
    });
    // activation milestones restart with the reinstall
    expect(data).toMatchObject({
      firstDraftSeenAt: null,
      firstDraftSource: null,
      firstPublishAt: null,
      firstPublishSource: null,
      productCountAtFirstLoad: null,
      quickStartStartedAt: null,
      quickStartDraftCount: 0,
    });
    for (const k of ["reviewAskCount", "reviewDoneAt", "reviewNextEligibleAt", "reviewShownAt"])
      expect(k in data).toBe(false);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ttv_reset_on_reinstall" }),
      expect.any(String),
    );
    expect(data.reinstalledAt).toBeInstanceOf(Date);
    for (const k of [
      "installSource",
      "surfaceType",
      "surfaceDetail",
      "installRef",
      "installReferer",
      "installLandingPath",
    ]) {
      expect(k in data).toBe(false);
    }
    expect(row.installCount).toBe(2);
    expect(row.installSource).toBe("app_store:search");
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "shop_reinstalled" }),
      expect.any(String),
    );
  });

  it("an unattributed reinstall records reinstallSource unknown — the first-install source is not wiped", async () => {
    db.shop.findUnique.mockResolvedValue(UNINSTALLED_ROW);
    noteAfterAuth(SHOP);
    await trackShopAuth(req(BARE_URL), SHOP);
    const { data } = db.shop.updateMany.mock.calls[0][0];
    expect(data.reinstallSource).toBe("unknown");
    expect("installSource" in data).toBe(false);
    expect("surfaceType" in data).toBe(false);
  });

  it("is counted exactly once when the two parallel document loaders both see the uninstalled row", async () => {
    // Both loaders read before either write commits; only the first conditional
    // update matches (count 1), the second matches nothing (count 0).
    db.shop.findUnique.mockResolvedValue(UNINSTALLED_ROW);
    db.shop.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    noteAfterAuth(SHOP); // afterAuth is deduped by the library: fires once per session token
    await Promise.all([trackShopAuth(req(INSTALL_URL), SHOP), trackShopAuth(req(INSTALL_URL), SHOP)]);
    expect(db.shop.updateMany).toHaveBeenCalledTimes(2);
    for (const call of db.shop.updateMany.mock.calls)
      expect(call[0].where).toEqual({ shop: SHOP, uninstalledAt: { not: null } });
    const reinstallEvents = log.info.mock.calls.filter((c) => c[0]?.event === "shop_reinstalled");
    expect(reinstallEvents).toHaveLength(1);
  });

  it("the second loader still takes the DB path when the uninstall webhook cleared the process cache", async () => {
    await trackShopAuth(req(INSTALL_URL), SHOP); // shop now in `seen`
    await markShopUninstalled(SHOP); // clears it
    db.shop.findUnique.mockResolvedValue(UNINSTALLED_ROW);
    db.shop.updateMany.mockReset();
    db.shop.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    noteAfterAuth(SHOP);
    await Promise.all([trackShopAuth(req(BARE_URL), SHOP), trackShopAuth(req(BARE_URL), SHOP)]);
    expect(db.shop.updateMany).toHaveBeenCalledTimes(2);
    expect(log.info.mock.calls.filter((c) => c[0]?.event === "shop_reinstalled")).toHaveLength(1);
  });
});

describe("uninstall / redact", () => {
  it("markShopUninstalled stamps only a LIVE row (idempotent under duplicate delivery) and never throws", async () => {
    const t = new Date("2026-09-09T01:00:00Z");
    expect(await markShopUninstalled(SHOP, t.toISOString())).toBe(1);
    const { where, data } = db.shop.updateMany.mock.calls[0][0];
    expect(where).toEqual({
      shop: SHOP,
      uninstalledAt: null,
      OR: [{ reinstalledAt: null }, { reinstalledAt: { lt: t } }],
    });
    expect(data.uninstalledAt).toEqual(t);
    db.shop.updateMany.mockRejectedValueOnce(new Error("x"));
    expect(await markShopUninstalled(SHOP)).toBe(0);
  });

  it("markShopUninstalled without a usable triggeredAt still guards on uninstalledAt: null", async () => {
    await markShopUninstalled(SHOP, "not-a-date");
    const { where, data } = db.shop.updateMany.mock.calls[0][0];
    expect(where).toEqual({ shop: SHOP, uninstalledAt: null });
    expect(data.uninstalledAt).toBeInstanceOf(Date);
  });

  it("redactShopRecord anonymises the domain and clears identifying fields but keeps the source channel", async () => {
    const tx = { shop: { updateMany: vi.fn(async () => ({ count: 1 })) } };
    await redactShopRecord(tx, SHOP);
    const { where, data } = tx.shop.updateMany.mock.calls[0][0];
    expect(where).toEqual({ shop: SHOP });
    expect(data.shop).toMatch(/^redacted:[0-9a-f]{24}:/);
    expect(data).toMatchObject({
      surfaceDetail: null,
      installReferer: null,
      installLandingPath: null,
      reinstallReferer: null,
      utmMedium: null,
      utmCampaign: null,
    });
    expect(data.redactedAt).toBeInstanceOf(Date);
    for (const kept of [
      "installSource",
      "surfaceType",
      "installRef",
      "utmSource",
      "installCount",
      "installedAt",
    ]) {
      expect(kept in data).toBe(false);
    }
  });
});

describe("wiring (source guard)", () => {
  it("shopify.server.js runs the tracker inside authenticate.admin and flags new sessions via afterAuth", () => {
    const src = readFileSync("app/shopify.server.js", "utf8");
    expect(src).toMatch(/afterAuth:\s*async/);
    expect(src).toContain("noteAfterAuth(session?.shop)");
    expect(src).toContain("await trackShopAuth(request, ctx?.session?.shop)");
  });

  it("the Shop model is NOT in GDPR_SHOP_MODELS (it must survive uninstall with uninstalledAt set)", async () => {
    const { GDPR_SHOP_MODELS } = await import("../../app/utils/gdpr.server.js");
    expect(GDPR_SHOP_MODELS).not.toContain("shop");
  });
});
