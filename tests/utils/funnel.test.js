/**
 * Phase 10 Part B — the funnel, held here:
 *
 *   - the arithmetic: counts per stage, medians between stages, test shops
 *     out by the reset workflow's name pattern and by the two named dev stores
 *   - the digest: counts and medians only — no shop domain, no name, no
 *     content — and nothing at all when there is no non-test shop
 *   - the stamps: first screen, first approve, returned on a LATER day
 *     (never the install day), first-writer-wins, never throw
 *   - the wiring: Home stamps first screen + returned, Review stamps first
 *     approve after the approved filter, the scheduler ticks the digest
 *   - the Monday: sydneyParts now says which weekday it is. It did not
 *     before, and the P3.6 weekly report's Monday check was reading
 *     `undefined !== 1` — it could never have fired. A known Monday is held.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { computeFunnel, composeFunnelDigest, median, STAGES, FUNNEL_SELECT } from "../../app/utils/funnel.js";
import { kindOf } from "../../app/utils/shopKind.js";

const src = (p) => code(readFileSync(p, "utf8"));

const { db, log, redis, redisRef, emails } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: { shop: { updateMany: fn(), findUnique: fn(), findMany: fn() } },
    log: { info: fn(), warn: fn(), error: fn(), debug: fn() },
    redis: { set: fn(), get: fn() },
    redisRef: { current: null },
    emails: [],
  };
});
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: log }));
vi.mock("../../app/utils/cache.server.js", () => ({ getRedis: async () => redisRef.current, getCache: vi.fn(), setCache: vi.fn(), invalidateCache: vi.fn() }));
vi.mock("../../app/utils/notify.server.js", () => ({
  OPERATOR_EMAIL: "hello@navaal.ai",
  sendOperatorEmail: vi.fn(async (m) => {
    emails.push(m);
    return { sent: true };
  }),
}));

const fv = await import("../../app/utils/firstValue.server.js");
const { sydneyParts } = await import("../../app/utils/scheduler.server.js");
const funnelServer = await import("../../app/utils/funnel.server.js");
const notify = await import("../../app/utils/notify.server.js");

const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 1, 0, 0, 0); // 2026-09-01T00:00Z
const at = (h) => new Date(T0 + h * H);
// Phase 11 Part B — a row is REAL only by classification; a test row says so.
const row = (shop, o = {}) => ({ shop, kind: "real", installedAt: at(0), reinstalledAt: null, uninstalledAt: null, firstScreenAt: null, firstDraftSeenAt: null, firstApproveAt: null, firstPublishAt: null, returnedAt: null, ...o });

beforeEach(() => {
  for (const f of Object.values(db.shop)) f.mockReset();
  for (const f of Object.values(log)) f.mockReset();
  redis.set.mockReset();
  redis.get.mockReset();
  redisRef.current = null;
  emails.length = 0;
  notify.sendOperatorEmail.mockClear();
});

describe("the arithmetic", () => {
  it("median", () => {
    expect(median([])).toBe(null);
    expect(median([5])).toBe(5);
    expect(median([1, 9, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([2, NaN, 1])).toBe(1.5);
  });

  it("who counts is a classification: ours and Shopify's are out, unclassified is out AND counted, and only a stored 'real' is real", () => {
    for (const s of ["navaal-ttv-02.myshopify.com", "navaal-qa-fresh.myshopify.com", "navaal-shape-b2b.myshopify.com", "contentpilot-dev2.myshopify.com", "contentpilot-test.myshopify.com", " NAVAAL-TTV-9.myshopify.com "]) {
      expect(kindOf({ shop: s, kind: "real" }), s).toBe("ours"); // our own handle can never be real
    }
    expect(kindOf({ shop: "a-real-store.myshopify.com", kind: "unclassified" })).toBe("unclassified");
    expect(kindOf({ shop: "a-real-store.myshopify.com" })).toBe("unclassified");
    expect(kindOf({ shop: "a-real-store.myshopify.com", kind: "real" })).toBe("real");
    expect(kindOf({ shop: "app-review-1.myshopify.com", kind: "shopify" })).toBe("shopify");
    const f = computeFunnel([row("m.myshopify.com"), row("navaal-ttv-02.myshopify.com", { kind: "real" }), row("rev.myshopify.com", { kind: "shopify" }), row("new.myshopify.com", { kind: "unclassified" }), row("old.myshopify.com", { kind: undefined })]);
    expect(f.shops).toBe(1);
    expect(f.kinds).toEqual({ ours: 1, shopify: 1, real: 1, unclassified: 2 });
    expect(f.unclassified).toBe(2);
    expect(f.excludedTestShops).toBe(2);
  });

  it("counts each stage over non-test shops; medians over the shops with both ends of a pair", () => {
    const rows = [
      row("a.myshopify.com", { firstScreenAt: at(0.1), firstDraftSeenAt: at(1), firstApproveAt: at(2), firstPublishAt: at(3), returnedAt: at(30) }),
      row("b.myshopify.com", { firstScreenAt: at(0.5), firstDraftSeenAt: at(3), uninstalledAt: at(10) }),
      row("c.myshopify.com", { firstDraftSeenAt: at(5), firstPublishAt: at(7) }), // installed before the first-screen stamp existed
      row("navaal-ttv-03.myshopify.com", { firstScreenAt: at(0.1), firstDraftSeenAt: at(0.2), firstApproveAt: at(0.3), firstPublishAt: at(0.4), returnedAt: at(24) }),
      row("contentpilot-dev2.myshopify.com", { firstPublishAt: at(1) }),
    ];
    const f = computeFunnel(rows);
    expect(f.shops).toBe(3);
    expect(f.excludedTestShops).toBe(2);
    expect(f.unclassified).toBe(0);
    expect(f.counts).toEqual({ installed: 3, firstScreen: 2, firstDraft: 3, firstApprove: 1, firstPublish: 2, returned: 1 });
    expect(f.uninstalled).toBe(1);
    expect(f.medianHours["installed→firstScreen"]).toBeCloseTo(0.3, 5); // median of 0.1 and 0.5
    expect(f.pairN["installed→firstScreen"]).toBe(2);
    expect(f.medianHours["firstScreen→firstDraft"]).toBeCloseTo(1.7, 5); // (0.9 + 2.5) / 2
    expect(f.medianHours["firstDraft→firstApprove"]).toBeCloseTo(1, 5);
    expect(f.medianHours["firstApprove→firstPublish"]).toBeCloseTo(1, 5);
    expect(f.pairN["firstApprove→firstPublish"]).toBe(1); // c has no approve stamp → not in this pair
    expect(f.medianHours["firstPublish→returned"]).toBeCloseTo(27, 5);
  });

  it("a reinstall moves the install moment; an empty list is zero everywhere", () => {
    const f = computeFunnel([row("a.myshopify.com", { installedAt: at(-100), reinstalledAt: at(0), firstScreenAt: at(2) })]);
    expect(f.medianHours["installed→firstScreen"]).toBeCloseTo(2, 5);
    const z = computeFunnel([]);
    expect(z.shops).toBe(0);
    expect(Object.values(z.counts).every((n) => n === 0)).toBe(true);
    expect(Object.values(z.medianHours).every((m) => m === null)).toBe(true);
  });

  it("reads only the funnel columns — no name, no email, no content", () => {
    expect(Object.keys(FUNNEL_SELECT).sort()).toEqual(["firstApproveAt", "firstDraftSeenAt", "firstPublishAt", "firstScreenAt", "installedAt", "kind", "reinstalledAt", "returnedAt", "shop", "uninstalledAt"]);
    expect(STAGES.map((s) => s.key)).toEqual(["installed", "firstScreen", "firstDraft", "firstApprove", "firstPublish", "returned"]);
  });
});

describe("the digest", () => {
  it("is null when there is no real shop and nothing unclassified; an unclassified shop alone still produces the ask", () => {
    expect(composeFunnelDigest(computeFunnel([]))).toBe(null);
    expect(composeFunnelDigest(computeFunnel([row("navaal-ttv-02.myshopify.com", { firstPublishAt: at(1) })]))).toBe(null);
    expect(composeFunnelDigest(computeFunnel([row("rev.myshopify.com", { kind: "shopify" })]))).toBe(null);
    const d = composeFunnelDigest(computeFunnel([row("new.myshopify.com", { kind: "unclassified" })]));
    expect(d.subject).toBe("Funnel: 0 real installed · 0 published · 0 returned · 1 unclassified");
    expect(d.text).toMatch(/0 real shop\(s\) counted; 0 of ours and 0 of Shopify's excluded\. 1 unclassified — not counted, waiting for you or CW/);
    expect(d.text).not.toMatch(/myshopify/);
  });

  it("is counts and medians only: no shop domain, no name, every stage on its own line", () => {
    const rows = [row("secret-merchant.myshopify.com", { firstScreenAt: at(0.25), firstDraftSeenAt: at(1), firstPublishAt: at(50), returnedAt: at(100) }), row("another-real.myshopify.com", { firstScreenAt: at(0.5) })];
    const d = composeFunnelDigest(computeFunnel(rows), { now: at(200) });
    expect(d.subject).toBe("Funnel: 2 real installed · 1 published · 1 returned");
    expect(d.text).not.toMatch(/myshopify\.com|secret-merchant|another-real/);
    expect(d.text).toMatch(/2 real shop\(s\) counted; 0 of ours and 0 of Shopify's excluded\./);
    expect(d.text).not.toMatch(/unclassified/);
    for (const st of STAGES) expect(d.text).toMatch(new RegExp(`^${st.label}\\s+\\d+\\s+\\(\\d+%\\)`, "m"));
    expect(d.text).toMatch(/Installed\s+2\s+\(100%\)/);
    expect(d.text).toMatch(/First screen rendered\s+2\s+\(100%\)\s+median from installed: 23 min \(n=2\)/);
    expect(d.text).toMatch(/First publish\s+1\s+\(50%\)\s+median from first approve: — \(n=0\)/);
    expect(d.text).toMatch(/Returned on a later day\s+1\s+\(50%\)\s+median from first publish: 2\.1 d \(n=1\)/);
    expect(d.text).toMatch(/Uninstalled\s+0/);
    expect(d.text).toMatch(/stamped from 15 Sep 2026/);
  });
});

describe("the send", () => {
  it("sends through the operator mailer when there is at least one non-test shop, and logs numbers only", async () => {
    db.shop.findMany.mockResolvedValue([row("real.myshopify.com", { firstScreenAt: at(1) }), row("navaal-ttv-02.myshopify.com", { firstPublishAt: at(1) })]);
    const r = await funnelServer.sendFunnelDigest({ now: at(48) });
    expect(r.sent).toBe(true);
    expect(db.shop.findMany).toHaveBeenCalledWith({ where: { redactedAt: null }, select: FUNNEL_SELECT }); // an anonymised row is a ghost, never a shop
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe("Funnel: 1 real installed · 0 published · 0 returned");
    expect(emails[0].text).not.toMatch(/myshopify/);
    const logged = log.info.mock.calls.find((c) => c[0]?.event === "funnel_digest");
    expect(logged[0]).toEqual({ event: "funnel_digest", sent: true, shops: 1, unclassified: 0, installed: 1, published: 0, returned: 0 });
    expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/myshopify/);
  });

  it("sends nothing when every shop is a test shop; a dry run sends nothing either", async () => {
    db.shop.findMany.mockResolvedValue([row("navaal-ttv-02.myshopify.com", { firstPublishAt: at(1) }), row("contentpilot-dev2.myshopify.com")]);
    const r = await funnelServer.sendFunnelDigest({ now: at(48) });
    expect(r).toMatchObject({ sent: false, reason: "no real shop" });
    expect(notify.sendOperatorEmail).not.toHaveBeenCalled();
    db.shop.findMany.mockResolvedValue([row("real.myshopify.com")]);
    const dry = await funnelServer.sendFunnelDigest({ now: at(48), dryRun: true });
    expect(dry).toMatchObject({ sent: false, reason: "dry run" });
    expect(dry.digest.subject).toMatch(/^Funnel: 1 real installed/);
    expect(notify.sendOperatorEmail).not.toHaveBeenCalled();
  });
});

describe("the Monday", () => {
  // 2026-09-20T22:30Z is Monday 2026-09-21 08:30 in Sydney (AEST, UTC+10).
  const MONDAY_0830 = new Date("2026-09-20T22:30:00Z");

  it("sydneyParts says the weekday and the minute — the P3.6 Monday check needs it", () => {
    expect(sydneyParts(MONDAY_0830)).toEqual({ day: "2026-09-21", hour: 8, minute: 30, weekday: 1 });
    expect(sydneyParts(new Date("2026-09-08T21:00:00Z"))).toMatchObject({ day: "2026-09-09", hour: 7, minute: 0, weekday: 3 });
    expect(sydneyParts(new Date("2026-09-19T14:05:00Z")).weekday).toBe(0); // Sunday 00:05 Sydney
    // Sydney flips to AEDT (UTC+11) on 2026-10-04: Monday 08:30 is then 21:30Z the day before.
    expect(sydneyParts(new Date("2026-10-11T21:30:00Z"))).toEqual({ day: "2026-10-12", hour: 8, minute: 30, weekday: 1 });
  });

  it("the weekly report reads the weekday from sydneyParts, so its Monday can now come", () => {
    const w = src("app/utils/weeklyReport.server.js");
    expect(w).toMatch(/const \{ day, hour, weekday \} = sydneyParts\(now\)/);
    expect(w).toMatch(/weekday !== REPORT_DAY_SYDNEY/);
    expect(src("app/utils/scheduler.server.js")).toMatch(/minute: Number\(parts\.minute\), weekday \};/);
  });

  it("the digest runs Monday 08:30 Sydney, once per week under Redis, and not at another hour", async () => {
    const run = vi.fn(async () => ({ sent: true }));
    expect(await funnelServer.maybeSendFunnelDigest({ now: new Date("2026-09-20T22:10:00Z"), run })).toEqual({ ran: false, reason: "not the hour" }); // 08:10
    expect(await funnelServer.maybeSendFunnelDigest({ now: new Date("2026-09-21T22:30:00Z"), run })).toEqual({ ran: false, reason: "not the hour" }); // Tuesday
    expect(run).not.toHaveBeenCalled();
    redisRef.current = redis;
    redis.set.mockResolvedValueOnce("OK");
    const first = await funnelServer.maybeSendFunnelDigest({ now: MONDAY_0830, run });
    expect(first).toMatchObject({ ran: true, day: "2026-09-21", sent: true });
    expect(redis.set).toHaveBeenCalledWith("cc:funnel-digest:week", "2026-09-21", "EX", 8 * 24 * 3600, "NX");
    redis.set.mockResolvedValueOnce(null);
    redis.get.mockResolvedValueOnce("2026-09-21");
    expect(await funnelServer.maybeSendFunnelDigest({ now: new Date("2026-09-20T22:45:00Z"), run })).toEqual({ ran: false, reason: "already ran this week" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("the scheduler ticks it, after the weekly report, by dynamic import like the others", () => {
    const s = src("app/utils/scheduler.server.js");
    expect(s).toMatch(/import\("\.\/funnel\.server\.js"\)\s*\.then\(\(m\) => m\.maybeSendFunnelDigest\(\)\)/);
    expect(s.indexOf("maybeSendWeeklyReports")).toBeLessThan(s.indexOf("maybeSendFunnelDigest"));
  });
});

describe("the stamps", () => {
  const SHOP = "real.myshopify.com";

  it("first screen and first approve are first-writer-wins on their own column", async () => {
    db.shop.updateMany.mockResolvedValue({ count: 1 });
    db.shop.findUnique.mockResolvedValue({ shop: SHOP, installedAt: at(0) });
    expect(await fv.markFirstScreen(SHOP)).toBe(true);
    expect(db.shop.updateMany.mock.calls[0][0].where).toEqual({ shop: SHOP, firstScreenAt: null });
    expect(db.shop.updateMany.mock.calls[0][0].data.firstScreenAt).toBeInstanceOf(Date);
    expect(await fv.markFirstApprove(SHOP, "review_page")).toBe(true);
    expect(db.shop.updateMany.mock.calls[1][0].where).toEqual({ shop: SHOP, firstApproveAt: null });
    expect(Object.keys(db.shop.updateMany.mock.calls[1][0].data)).toEqual(["firstApproveAt"]);
    expect(log.info.mock.calls.map((c) => c[0].event)).toEqual(["funnel_first_screen", "funnel_first_approve:review_page"]);
    db.shop.updateMany.mockResolvedValue({ count: 0 });
    expect(await fv.markFirstScreen(SHOP)).toBe(false);
  });

  it("returned means a LATER calendar day than the install: the install day never counts, a reinstall resets the day", async () => {
    const install = new Date("2026-09-15T01:00:00Z");
    db.shop.findUnique.mockResolvedValue({ installedAt: install, reinstalledAt: null, returnedAt: null });
    db.shop.updateMany.mockResolvedValue({ count: 1 });
    expect(await fv.markReturned(SHOP, new Date("2026-09-15T23:59:00Z"))).toBe(false);
    expect(db.shop.updateMany).not.toHaveBeenCalled();
    expect(await fv.markReturned(SHOP, new Date("2026-09-16T00:01:00Z"))).toBe(true);
    expect(db.shop.updateMany.mock.calls[0][0]).toMatchObject({ where: { shop: SHOP, returnedAt: null }, data: { returnedAt: new Date("2026-09-16T00:01:00Z") } });
    db.shop.updateMany.mockClear();
    db.shop.findUnique.mockResolvedValue({ installedAt: install, reinstalledAt: new Date("2026-09-20T00:00:00Z"), returnedAt: null });
    expect(await fv.markReturned(SHOP, new Date("2026-09-20T12:00:00Z"))).toBe(false);
    expect(await fv.markReturned(SHOP, new Date("2026-09-21T12:00:00Z"))).toBe(true);
  });

  it("returned is idempotent and never throws", async () => {
    db.shop.findUnique.mockResolvedValue({ installedAt: at(0), returnedAt: at(30) });
    expect(await fv.markReturned(SHOP, at(60))).toBe(false);
    expect(db.shop.updateMany).not.toHaveBeenCalled();
    db.shop.findUnique.mockResolvedValue(null);
    expect(await fv.markReturned(SHOP, at(60))).toBe(false);
    db.shop.findUnique.mockRejectedValue(new Error("db down"));
    expect(await fv.markReturned(SHOP, at(60))).toBe(false);
    expect(log.warn).toHaveBeenCalled();
    expect(await fv.markReturned("", at(60))).toBe(false);
  });
});

describe("the wiring", () => {
  it("Home stamps first screen and returned on every authenticated render, fire-and-forget", () => {
    const h = src("app/routes/app._index.jsx");
    expect(h).toMatch(/import \{[^}]*markFirstScreen, markReturned[^}]*\} from "\.\.\/utils\/firstValue\.server\.js"/);
    expect(h).toMatch(/void markFirstScreen\(shop\);\s*void markReturned\(shop\);/);
  });

  it("Review stamps first approve once the approved list is known to be non-empty, before Shopify is asked", () => {
    const r = src("app/routes/app.review.jsx");
    expect(r).toMatch(/import \{ markFirstApprove \} from "\.\.\/utils\/firstValue\.server\.js"/);
    const stamp = r.indexOf('void markFirstApprove(shop, "review_page")');
    const guard = r.indexOf("No publishable products in the selection.");
    expect(stamp).toBeGreaterThan(guard);
    expect(stamp).toBeLessThan(r.indexOf("prisma.generatedContent.findMany", guard)); // the action's own read, not the loader's
  });

  it("the three columns are in the schema, and the migration is additive and nullable", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    for (const c of ["firstScreenAt", "firstApproveAt", "returnedAt"]) expect(schema).toMatch(new RegExp(`^\\s*${c}\\s+DateTime\\?`, "m"));
    const sql = readFileSync("prisma/migrations/20260915090000_funnel/migration.sql", "utf8");
    expect(sql.match(/ALTER TABLE "Shop" ADD COLUMN/g)).toHaveLength(3);
    expect(sql).not.toMatch(/NOT NULL|DROP|UPDATE|DEFAULT/i);
  });

  it("the privacy inventory names the milestones as timestamps only", () => {
    expect(src("app/utils/legal.js")).toMatch(/first opened the app, first approved and published content, and first came back on a later day — timestamps only/);
  });

  it("no merchant-facing screen reads a funnel column", () => {
    const routes = ["app/routes/app._index.jsx", "app/routes/app.review.jsx", "app/routes/app.products.jsx", "app/routes/app.proof.jsx", "app/routes/app.plans.jsx", "app/components/StartState.jsx"];
    for (const p of routes) expect(src(p), p).not.toMatch(/firstScreenAt|firstApproveAt|returnedAt|computeFunnel|composeFunnelDigest/);
  });
});
