/**
 * Growth foundation for brief items 3–5 (aligned to the synthesized spec):
 *   firstValue      first-writer-wins stamps, true only when THIS call set the field, never throw
 *   catalogGaps     one "needs content" definition (50-char rule), ACTIVE-only, cached, truthful truncation
 *   reviewAsk       server-decided ask: holds per code, legacy hold, call cap, one claim per moment
 *   planFit         plan-fit matrix, reset date, exact title line
 *   upgradePrompts  condition rows, client-confirmed events, charge-id attribution that never invents
 *   ttvReport       medians over the last N measured installs, pre_tracking excluded, censored median
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, log, cache } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      shop: { updateMany: fn(), findUnique: fn(), findMany: fn() },
      growthState: { findUnique: fn() },
      reviewRequestAttempt: { create: fn(), findUnique: fn(), update: fn(), findMany: fn() },
      upgradePrompt: {
        upsert: fn(),
        findFirst: fn(),
        update: fn(),
        updateMany: fn(),
        count: fn(),
        findMany: fn(),
      },
      generatedContent: { findMany: fn() },
      $transaction: fn(),
    },
    log: { info: fn(), warn: fn(), error: fn(), debug: fn() },
    cache: { getCache: fn(), invalidateCache: fn() },
  };
});
vi.mock("../../app/db.server.js", () => ({ default: db }));
vi.mock("../../app/utils/logger.server.js", () => ({ default: log }));
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: cache.getCache,
  invalidateCache: cache.invalidateCache,
  setCache: vi.fn(),
}));
// Phase 3 item 3.3 — openReviewAsk now reads the shared published-products
// count to enforce the third-approve gate. Mocked so these tests exercise the
// claim logic; the gate itself is tested separately below.
const { getContentMetrics } = vi.hoisted(() => ({
  getContentMetrics: vi.fn(async () => ({ publishedProducts: 9 })),
}));
vi.mock("../../app/utils/metrics.server.js", () => ({ getContentMetrics }));

const fv = await import("../../app/utils/firstValue.server.js");
const gaps = await import("../../app/utils/catalogGaps.server.js");
const review = await import("../../app/utils/reviewAsk.server.js");
const planFit = await import("../../app/utils/planFit.js");
const prompts = await import("../../app/utils/upgradePrompts.server.js");
const ttv = await import("../../app/utils/ttvReport.server.js");

const SHOP = "fresh-store.myshopify.com";
// One clock for the whole file. These helpers were calling Date.now() afresh
// on every use, so `DAYS(1)` built as an input and `DAYS(1)` built as the
// expectation could differ by a millisecond and fail the run. It did, in CI.
// Every assertion here is about differences of hours or days, so a base
// pinned at import is both correct and deterministic.
const NOW = Date.now();
const HOURS = (n) => new Date(NOW - n * 3_600_000);
const DAYS = (n) => HOURS(n * 24);

beforeEach(() => {
  for (const model of Object.values(db)) {
    if (typeof model === "function") {
      model.mockReset();
      continue;
    }
    for (const f of Object.values(model)) f.mockReset();
  }
  for (const f of Object.values(log)) f.mockReset();
  cache.getCache.mockReset();
  cache.getCache.mockImplementation(async (_k, supplier) => supplier());
  cache.invalidateCache.mockReset();
  cache.invalidateCache.mockResolvedValue(undefined);
  db.shop.updateMany.mockResolvedValue({ count: 1 });
  db.shop.findUnique.mockResolvedValue({ shop: SHOP, installedAt: DAYS(3) });
  db.$transaction.mockImplementation(async (ops) => Promise.all(ops));
});

describe("firstValue", () => {
  it("stamps firstDraftSeenAt only where null and returns true only when THIS call set it", async () => {
    expect(await fv.markFirstDraftSeen(SHOP, "quick_start")).toBe(true);
    const { where, data } = db.shop.updateMany.mock.calls[0][0];
    expect(where).toEqual({ shop: SHOP, firstDraftSeenAt: null });
    expect(data.firstDraftSeenAt).toBeInstanceOf(Date);
    expect(data.firstDraftSource).toBe("quick_start");
    const logged = log.info.mock.calls.find((c) => c[0]?.event === "ttv_first_draft");
    expect(logged[0].secondsSinceInstall).toBeGreaterThan(3 * 86_000);
    db.shop.updateMany.mockResolvedValue({ count: 0 });
    log.info.mockClear();
    expect(await fv.markFirstPublish(SHOP, "review_page")).toBe(false);
    expect(log.info).not.toHaveBeenCalled();
  });

  it("other stamps + never throws + tolerates a missing model", async () => {
    expect(await fv.stampQuickStartStarted(SHOP)).toBe(true);
    expect(db.shop.updateMany.mock.calls[0][0].where).toEqual({ shop: SHOP, quickStartStartedAt: null });
    expect(await fv.stampProductCountAtFirstLoad(SHOP, 17)).toBe(true);
    expect(db.shop.updateMany.mock.calls[1][0].data).toEqual({ productCountAtFirstLoad: 17 });
    expect(await fv.stampProductCountAtFirstLoad(SHOP, NaN)).toBe(false);
    db.shop.updateMany.mockRejectedValue(new Error("db down"));
    expect(await fv.markFirstPublish(SHOP, "product_page")).toBe(false);
    expect(log.warn).toHaveBeenCalled();
    const saved = db.shop.updateMany;
    db.shop.updateMany = undefined;
    expect(await fv.markFirstDraftSeen(SHOP, "x")).toBe(false);
    db.shop.updateMany = saved;
  });

  it("installAtOf prefers the reinstall moment", () => {
    expect(fv.installAtOf({ installedAt: DAYS(30), reinstalledAt: DAYS(1) })).toEqual(DAYS(1));
    expect(fv.installAtOf(null)).toBeNull();
  });
});

describe("catalogGaps", () => {
  const node = (i, desc, extra = {}) => ({
    id: `gid://shopify/Product/${i}`,
    title: `P${i}`,
    description: desc,
    seo: { title: "t", description: "d" },
    featuredMedia: { preview: { image: { url: `u${i}` } } },
    ...extra,
  });
  const resp = (edges, hasNextPage, endCursor = "c") => ({
    json: async () => ({
      data: { products: { edges: edges.map((n) => ({ node: n })), pageInfo: { hasNextPage, endCursor } } },
    }),
  });

  it("classifyDescription uses the audit's 50-char rule", () => {
    expect(gaps.classifyDescription("")).toBe("missing");
    expect(gaps.classifyDescription("   ")).toBe("missing");
    expect(gaps.classifyDescription("x".repeat(49))).toBe("thin");
    expect(gaps.classifyDescription("x".repeat(50))).toBeNull();
    expect(gaps.THIN_DESCRIPTION_CHARS).toBe(50);
  });

  it("returns missing-then-thin candidates (image first), excludes products Navaal already touched, reports truncation", async () => {
    const admin = {
      graphql: vi.fn(async () =>
        resp(
          [
            node(1, "x".repeat(60)), // fine
            node(2, "", { featuredMedia: null }), // missing, no image
            node(3, "tiny"), // thin
            node(4, ""), // missing with image
            node(5, "x".repeat(60), { seo: { title: "", description: "d" } }), // enhance
            node(6, "", {}), // missing but already has a Navaal row
          ],
          true,
        ),
      ),
    };
    db.generatedContent.findMany.mockResolvedValue([{ productId: "gid://shopify/Product/6" }]);
    const r = await gaps.scanCatalogGaps(admin, SHOP, { skipCache: true });
    expect(r.candidates.map((c) => c.id.split("/").pop())).toEqual(["4", "2", "3"]);
    expect(r.candidates[0]).toMatchObject({
      numericId: "4",
      tier: 0,
      mode: "generate",
      imageUrl: "u4",
      descriptionLength: 0,
    });
    expect(r).toMatchObject({ scanned: 6, missingDesc: 2, thinDesc: 1, needsContent: 3, truncated: true });
    expect(r.enhanceCandidates.map((c) => c.numericId)).toEqual(["5"]);
    expect(admin.graphql.mock.calls[0][0]).toMatch(/first: 100/);
    expect(admin.graphql.mock.calls[0][0]).toMatch(/query: "status:active"/);
    expect(admin.graphql.mock.calls[0][0]).toMatch(/sortKey: UPDATED_AT, reverse: true/);
    expect(admin.graphql).toHaveBeenCalledTimes(1); // stopped: ≥ 3 candidates after page 1
  });

  it("pages up to maxPages until enough candidates, and an Admin error returns { error: true } — never throws, never a count", async () => {
    let call = 0;
    const admin = {
      graphql: vi.fn(async () => {
        call += 1;
        return call === 1
          ? resp([node(1, "x".repeat(60))], true, "c1")
          : resp([node(2, ""), node(3, "")], false);
      }),
    };
    db.generatedContent.findMany.mockResolvedValue([]);
    const r = await gaps.scanCatalogGaps(admin, SHOP, { skipCache: true });
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(r.needsContent).toBe(2);
    expect(r.truncated).toBe(false);
    const bad = {
      graphql: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const e = await gaps.scanCatalogGaps(bad, SHOP, { skipCache: true });
    expect(e.error).toBe(true);
    expect(e.needsContent).toBeUndefined();
  });

  it("is cached per shop for 600 s and invalidateCatalogGaps clears it", async () => {
    const admin = { graphql: vi.fn(async () => resp([node(1, "")], false)) };
    db.generatedContent.findMany.mockResolvedValue([]);
    await gaps.scanCatalogGaps(admin, SHOP);
    expect(cache.getCache.mock.calls[0][0]).toBe(`catalogGaps:${SHOP}`);
    expect(cache.getCache.mock.calls[0][2]).toBe(600);
    await gaps.invalidateCatalogGaps(SHOP);
    expect(cache.invalidateCache).toHaveBeenCalledWith(`catalogGaps:${SHOP}`);
  });
});

describe("reviewAsk — pure rules", () => {
  it("holdFor per Shopify code", () => {
    const now = new Date("2026-09-09T00:00:00Z");
    expect(review.holdFor("success", { now })).toEqual({ terminal: true, shown: true, nextEligibleAt: null });
    expect(review.holdFor("already-reviewed", { now })).toEqual({
      terminal: true,
      shown: false,
      nextEligibleAt: null,
    });
    expect(review.holdFor("merchant-ineligible", { now }).terminal).toBe(true);
    expect(review.holdFor("annual-limit-reached", { now }).nextEligibleAt.toISOString()).toBe(
      "2027-09-09T00:00:00.000Z",
    );
    expect(review.holdFor("cooldown-period", { now }).nextEligibleAt.toISOString()).toBe(
      "2026-11-08T00:00:00.000Z",
    );
    const ri = review.holdFor("recently-installed", { now, installAt: new Date("2026-09-08T20:00:00Z") });
    expect(ri.nextEligibleAt.toISOString()).toBe("2026-09-09T21:00:00.000Z"); // install + 25 h
    expect(review.holdFor("recently-installed", { now, installAt: null }).nextEligibleAt.toISOString()).toBe(
      "2026-09-09T01:00:00.000Z",
    ); // now + 1 h
    for (const c of ["mobile-app", "already-open", "open-in-progress", "cancelled", "skipped-hidden"]) {
      const h = review.holdFor(c, { now });
      expect(h.terminal).toBe(false);
      expect(h.nextEligibleAt.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    }
    expect(review.holdFor("unavailable", { now }).nextEligibleAt.toISOString()).toBe(
      "2026-09-16T00:00:00.000Z",
    );
    expect(review.holdFor("some-new-code", { now }).nextEligibleAt.toISOString()).toBe(
      "2026-11-08T00:00:00.000Z",
    );
  });

  it("decideReviewAsk ladder", () => {
    const base = { installedAt: DAYS(3), reviewAskCount: 0 };
    expect(review.decideReviewAsk(null).reason).toBe("no_shop_row");
    expect(review.decideReviewAsk({ ...base, reviewDoneAt: DAYS(1) }).reason).toBe("terminal");
    expect(review.decideReviewAsk({ ...base, reviewNextEligibleAt: DAYS(-10) }).reason).toBe("hold");
    expect(review.decideReviewAsk({ ...base, reviewNextEligibleAt: DAYS(1) }).eligible).toBe(true);
    expect(review.decideReviewAsk(base, { reviewRequestedAt: DAYS(10) }).reason).toBe("legacy_hold");
    expect(review.decideReviewAsk(base, { reviewRequestedAt: DAYS(70) }).eligible).toBe(true);
    expect(
      review.decideReviewAsk({ ...base, reviewLastAskedAt: DAYS(1) }, { reviewRequestedAt: DAYS(10) })
        .eligible,
    ).toBe(true); // legacy only when never asked under the new code
    expect(review.decideReviewAsk({ ...base, reviewAskCount: 5 }).reason).toBe("call_cap");
    expect(review.decideReviewAsk({ installedAt: HOURS(1), reviewAskCount: 0 }).eligible).toBe(true); // install age is Shopify's call
  });
});

describe("reviewAsk — openReviewAsk / recordReviewOutcome", () => {
  const ROW = {
    shop: SHOP,
    installedAt: DAYS(3),
    reviewAskCount: 0,
    reviewDoneAt: null,
    reviewNextEligibleAt: null,
    reviewLastAskedAt: null,
  };

  it("opens exactly one attempt per eligible moment via the optimistic claim, with a 60-day pending hold", async () => {
    db.shop.findUnique.mockResolvedValue(ROW);
    db.growthState.findUnique.mockResolvedValue(null);
    db.shop.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    db.reviewRequestAttempt.create.mockResolvedValue({ id: "att_1" });
    const [a, b] = await Promise.all([
      review.openReviewAsk({
        shop: SHOP,
        surface: "review_page",
        trigger: "first_publish",
        publishedCount: 3,
      }),
      review.openReviewAsk({
        shop: SHOP,
        surface: "review_page",
        trigger: "first_publish",
        publishedCount: 3,
      }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((a || b).attemptId).toBe("att_1");
    const claim = db.shop.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ shop: SHOP, reviewAskCount: 0, reviewDoneAt: null });
    expect(claim.data).toMatchObject({ reviewAskCount: { increment: 1 }, reviewLastCode: "pending" });
    expect(claim.data.reviewNextEligibleAt.getTime() - Date.now()).toBeGreaterThan(59 * 86_400_000);
    expect(db.reviewRequestAttempt.create).toHaveBeenCalledTimes(1);
    expect(db.reviewRequestAttempt.create.mock.calls[0][0].data).toMatchObject({
      shop: SHOP,
      surface: "review_page",
      trigger: "first_publish",
      publishedCount: 3,
      attemptNo: 1,
    });
    expect(db.reviewRequestAttempt.create.mock.calls[0][0].data.installAgeSeconds).toBeGreaterThan(
      3 * 86_000,
    );
  });

  it("does not ask before the merchant's THIRD approve", async () => {
    // Brief item 3.3. Asking after one publish asks somebody who has seen the
    // app work exactly once.
    db.shop.findUnique.mockResolvedValue(ROW);
    db.growthState.findUnique.mockResolvedValue(null);
    for (const n of [0, 1, 2]) {
      getContentMetrics.mockResolvedValue({ publishedProducts: n });
      expect(
        await review.openReviewAsk({
          shop: SHOP,
          surface: "review_page",
          trigger: "publish",
          publishedCount: 1,
        }),
        `approved=${n}`,
      ).toBeNull();
    }
    expect(db.shop.updateMany).not.toHaveBeenCalled();

    getContentMetrics.mockResolvedValue({ publishedProducts: review.APPROVES_BEFORE_ASK });
    db.shop.updateMany.mockResolvedValue({ count: 1 });
    db.reviewRequestAttempt.create.mockResolvedValue({ id: "att_3" });
    expect(
      await review.openReviewAsk({
        shop: SHOP,
        surface: "review_page",
        trigger: "publish",
        publishedCount: 1,
      }),
    ).toEqual({ attemptId: "att_3" });
  });

  it("an unrecognised trigger is COUNTED, not exempted — the gate fails safe", async () => {
    // A new trigger string must not be able to slip past the count by accident.
    // Only the explicit allow-list bypasses it.
    db.shop.findUnique.mockResolvedValue(ROW);
    getContentMetrics.mockResolvedValue({ publishedProducts: 0 });
    expect(
      await review.openReviewAsk({
        shop: SHOP,
        surface: "review_page",
        trigger: "something_new",
        publishedCount: 5,
      }),
    ).toBeNull();
    expect(review.COUNT_EXEMPT_TRIGGERS.has("something_new")).toBe(false);
  });

  it("a failed count does not ask — it fails closed", async () => {
    db.shop.findUnique.mockResolvedValue(ROW);
    getContentMetrics.mockRejectedValue(new Error("metrics down"));
    expect(
      await review.openReviewAsk({
        shop: SHOP,
        surface: "review_page",
        trigger: "publish",
        publishedCount: 1,
      }),
    ).toBeNull();
  });

  it("does not open for a non-ask surface, nothing published, terminal, or on hold; never throws", async () => {
    db.shop.findUnique.mockResolvedValue(ROW);
    expect(await review.openReviewAsk({ shop: SHOP, surface: "jobs_page", publishedCount: 3 })).toBeNull();
    expect(await review.openReviewAsk({ shop: SHOP, surface: "review_page", publishedCount: 0 })).toBeNull();
    db.shop.findUnique.mockResolvedValue({ ...ROW, reviewDoneAt: DAYS(1) });
    expect(await review.openReviewAsk({ shop: SHOP, surface: "review_page", publishedCount: 1 })).toBeNull();
    expect(db.shop.updateMany).not.toHaveBeenCalled();
    db.shop.findUnique.mockRejectedValue(new Error("down"));
    expect(await review.openReviewAsk({ shop: SHOP, surface: "review_page", publishedCount: 1 })).toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it("recordReviewOutcome writes the code once in a transaction and sets the real hold (success → done + shown)", async () => {
    db.reviewRequestAttempt.findUnique.mockResolvedValueOnce({
      id: "att_1",
      shop: SHOP,
      surface: "review_page",
      trigger: "first_publish",
      code: null,
    });
    db.reviewRequestAttempt.update.mockResolvedValue({});
    db.shop.findUnique.mockResolvedValue(ROW);
    const r = await review.recordReviewOutcome(SHOP, "att_1", {
      code: "success",
      success: true,
      message: "Review modal displayed",
    });
    expect(r).toMatchObject({ status: 200, terminal: true, shown: true });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.reviewRequestAttempt.update.mock.calls[0][0].data).toMatchObject({
      code: "success",
      success: true,
      message: "Review modal displayed",
      nextEligibleAt: null,
    });
    const { data } = db.shop.updateMany.mock.calls[0][0];
    expect(data).toMatchObject({ reviewLastCode: "success", reviewNextEligibleAt: null });
    expect(data.reviewDoneAt).toBeInstanceOf(Date);
    expect(data.reviewShownAt).toBeInstanceOf(Date);
    // duplicate report → 409; foreign shop → 404
    db.reviewRequestAttempt.findUnique.mockResolvedValueOnce({ id: "att_1", shop: SHOP, code: "success" });
    expect((await review.recordReviewOutcome(SHOP, "att_1", { code: "cooldown-period" })).status).toBe(409);
    db.reviewRequestAttempt.findUnique.mockResolvedValueOnce({ id: "att_1", shop: SHOP, code: null });
    expect(
      (await review.recordReviewOutcome("other.myshopify.com", "att_1", { code: "success" })).status,
    ).toBe(404);
  });

  it("recordReviewOutcome: cooldown-period → +60 d not terminal; cancelled → +24 h not terminal", async () => {
    for (const [code, minDays, maxDays] of [
      ["cooldown-period", 59, 61],
      ["cancelled", 0.9, 1.1],
    ]) {
      db.reviewRequestAttempt.findUnique.mockResolvedValueOnce({ id: "att_x", shop: SHOP, code: null });
      db.reviewRequestAttempt.update.mockResolvedValue({});
      db.shop.updateMany.mockClear();
      const r = await review.recordReviewOutcome(SHOP, "att_x", { code, success: false });
      expect(r.terminal).toBe(false);
      const { data } = db.shop.updateMany.mock.calls[0][0];
      const days = (data.reviewNextEligibleAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(minDays);
      expect(days).toBeLessThan(maxDays);
      expect("reviewDoneAt" in data).toBe(false);
      expect("reviewShownAt" in data).toBe(false);
    }
  });
});

describe("planFit", () => {
  it("fitPlanFor matrix", () => {
    expect(planFit.fitPlanFor({ n: 3, currentPlan: "free" })).toMatchObject({
      planName: "starter",
      covers: true,
      monthsToCover: 1,
      priceLabel: "$9.99/mo",
    });
    expect(planFit.fitPlanFor({ n: 50, currentPlan: "free" }).planName).toBe("starter");
    expect(planFit.fitPlanFor({ n: 51, currentPlan: "free" }).planName).toBe("growth");
    expect(planFit.fitPlanFor({ n: 200, currentPlan: "free" }).planName).toBe("growth");
    expect(planFit.fitPlanFor({ n: 201, currentPlan: "free" }).planName).toBe("pro");
    expect(planFit.fitPlanFor({ n: 1500, currentPlan: "free" })).toMatchObject({
      planName: "pro",
      covers: false,
      monthsToCover: 2,
    });
    expect(planFit.fitPlanFor({ n: 10, currentPlan: "starter" }).planName).toBe("growth");
    expect(planFit.fitPlanFor({ n: 10, currentPlan: "free", needsBulk: true }).planName).toBe("growth");
    expect(planFit.fitPlanFor({ n: 250, currentPlan: "growth" }).planName).toBe("pro");
    expect(planFit.fitPlanFor({ n: 5, currentPlan: "pro" })).toBeNull();
    expect(planFit.fitPlanFor({ n: 0, currentPlan: "free" })).toBeNull();
  });

  it("quotaResetDate crosses the year boundary in UTC; fmtDay/fmtMonth", () => {
    expect(planFit.quotaResetDate(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(planFit.fmtDay(planFit.quotaResetDate(new Date("2026-09-09T00:00:00Z")))).toBe("1 October");
    expect(planFit.fmtMonth(new Date("2026-09-09T00:00:00Z"))).toBe("September");
  });

  it("quotaGapTitle is the exact line from the brief", () => {
    const starter = planFit.fitPlanFor({ n: 12, currentPlan: "free" });
    expect(planFit.quotaGapTitle({ n: 12, fit: starter })).toBe(
      "12 products still need content · Starter covers 50/month",
    );
    expect(planFit.quotaGapTitle({ n: 1, fit: starter })).toBe(
      "1 product still needs content · Starter covers 50/month",
    );
    expect(
      planFit.quotaGapTitle({
        n: 300,
        truncated: true,
        fit: planFit.fitPlanFor({ n: 300, currentPlan: "free" }),
      }),
    ).toBe("At least 300 products still need content · Professional covers 1000/month");
  });
});

describe("upgradePrompts", () => {
  const PLAN = { planName: "free", monthlyLimit: 25, status: "active" };

  it("getUpsell: null while quota remains or plan not active; neutral when N = 0 or no fit; condition row upserted (not a show)", async () => {
    expect(
      await prompts.getUpsell({ shop: SHOP, plan: PLAN, usageCount: 10, surface: "dashboard", n: 5 }),
    ).toBeNull();
    expect(
      await prompts.getUpsell({
        shop: SHOP,
        plan: { ...PLAN, status: "frozen" },
        usageCount: 25,
        surface: "dashboard",
        n: 5,
      }),
    ).toBeNull();
    const neutral = await prompts.getUpsell({
      shop: SHOP,
      plan: PLAN,
      usageCount: 25,
      surface: "dashboard",
      n: 0,
    });
    expect(neutral).toMatchObject({
      neutral: true,
      fit: null,
      promptId: null,
      resetDate: expect.any(String),
      monthName: expect.any(String),
    });
    expect(db.upgradePrompt.upsert).not.toHaveBeenCalled();
    db.upgradePrompt.upsert.mockResolvedValue({ id: "up_1" });
    const u = await prompts.getUpsell({
      shop: SHOP,
      plan: PLAN,
      usageCount: 25,
      surface: "dashboard",
      n: 12,
      truncated: true,
      nDefinition: "catalog_gaps",
    });
    expect(u).toMatchObject({
      neutral: false,
      n: 12,
      truncated: true,
      promptId: "up_1",
      fit: { planName: "starter" },
    });
    const call = db.upgradePrompt.upsert.mock.calls[0][0];
    expect(call.where.shop_trigger_surface_month).toMatchObject({
      shop: SHOP,
      trigger: "quota_exhausted",
      surface: "dashboard",
    });
    expect(call.create).toMatchObject({
      n: 12,
      truncated: true,
      fitPlanName: "starter",
      currentPlan: "free",
      monthlyLimit: 25,
    });
    expect("shownCount" in call.update).toBe(false);
  });

  it("getUpsell scans the catalog when N is not given and stays silent on a scan error", async () => {
    cache.getCache.mockImplementation(async () => ({ error: true }));
    expect(
      await prompts.getUpsell({
        admin: { graphql: vi.fn() },
        shop: SHOP,
        plan: PLAN,
        usageCount: 25,
        surface: "products",
      }),
    ).toBeNull();
    cache.getCache.mockImplementation(async () => ({ needsContent: 7, truncated: false, scanned: 40 }));
    db.upgradePrompt.upsert.mockResolvedValue({ id: "up_2" });
    const u = await prompts.getUpsell({
      admin: { graphql: vi.fn() },
      shop: SHOP,
      plan: PLAN,
      usageCount: 25,
      surface: "products",
    });
    expect(u).toMatchObject({ n: 7, scanned: 40, fit: { planName: "starter" }, promptId: "up_2" });
  });

  it("markPromptEvent is shop-scoped, counts shows, sets firstShownAt once", async () => {
    db.upgradePrompt.updateMany.mockResolvedValue({ count: 1 });
    expect(await prompts.markPromptEvent(SHOP, "up_1", "shown")).toBe(1);
    expect(db.upgradePrompt.updateMany.mock.calls[0][0].where).toEqual({
      id: "up_1",
      shop: SHOP,
      firstShownAt: null,
    });
    expect(db.upgradePrompt.updateMany.mock.calls[1][0].data.shownCount).toEqual({ increment: 1 });
    expect(await prompts.markPromptEvent(SHOP, "up_1", "cta_clicked")).toBe(1);
    expect(db.upgradePrompt.updateMany.mock.calls[2][0].data.ctaClickedAt).toBeInstanceOf(Date);
    expect(await prompts.markPromptEvent(SHOP, "up_1", "bogus")).toBe(0);
    db.upgradePrompt.updateMany.mockResolvedValue({ count: 0 });
    expect(await prompts.markPromptEvent("other.myshopify.com", "up_1", "dismissed")).toBe(0);
  });

  it("markPromptArrived (first time only) and markSubscribeRequested", async () => {
    db.upgradePrompt.updateMany.mockResolvedValue({ count: 1 });
    await prompts.markPromptArrived(SHOP, "up_1");
    expect(db.upgradePrompt.updateMany.mock.calls[0][0].where).toEqual({
      id: "up_1",
      shop: SHOP,
      arrivedAtPlansAt: null,
    });
    await prompts.markSubscribeRequested(SHOP, "up_1", "Starter Plan");
    expect(db.upgradePrompt.updateMany.mock.calls[1][0].data).toMatchObject({
      planKeyRequested: "Starter Plan",
    });
  });

  it("attributePlanChoice: only on a NEW subscription id, once per charge, only to a row the merchant acted on", async () => {
    expect(
      await prompts.attributePlanChoice(SHOP, {
        planName: "starter",
        chargeId: "gid://c/1",
        prevChargeId: "gid://c/1",
      }),
    ).toBeNull();
    expect(db.upgradePrompt.count).not.toHaveBeenCalled();
    db.upgradePrompt.count.mockResolvedValue(1);
    expect(
      await prompts.attributePlanChoice(SHOP, {
        planName: "starter",
        chargeId: "gid://c/2",
        prevChargeId: null,
      }),
    ).toBeNull();
    db.upgradePrompt.count.mockResolvedValue(0);
    db.upgradePrompt.findFirst.mockResolvedValue(null);
    expect(
      await prompts.attributePlanChoice(SHOP, {
        planName: "starter",
        chargeId: "gid://c/2",
        prevChargeId: null,
      }),
    ).toBeNull();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "upgrade_organic" }),
      expect.any(String),
    );
    const where = db.upgradePrompt.findFirst.mock.calls[0][0].where;
    expect(where.planChosen).toBeNull();
    expect(where.OR).toHaveLength(3); // subscribe ≤ 24 h, cta ≤ 7 d, arrival ≤ 7 d — never a view-only row
    db.upgradePrompt.findFirst.mockResolvedValue({
      id: "up_9",
      trigger: "quota_exhausted",
      surface: "dashboard",
      fitPlanName: "starter",
    });
    db.upgradePrompt.update.mockResolvedValue({});
    expect(
      await prompts.attributePlanChoice(SHOP, {
        planName: "starter",
        chargeId: "gid://c/2",
        prevChargeId: null,
        prevPlanName: "free",
      }),
    ).toBe("up_9");
    expect(db.upgradePrompt.update.mock.calls[0][0].data).toMatchObject({
      planChosen: "starter",
      chargeId: "gid://c/2",
      planChosenFrom: "free",
    });
    db.upgradePrompt.count.mockRejectedValue(new Error("down"));
    expect(
      await prompts.attributePlanChoice(SHOP, { planName: "starter", chargeId: "gid://c/3" }),
    ).toBeNull();
  });

  it("markPromptDeclined stamps the newest recent unattributed subscribe request", async () => {
    db.upgradePrompt.findFirst.mockResolvedValue({ id: "up_5" });
    db.upgradePrompt.update.mockResolvedValue({});
    expect(await prompts.markPromptDeclined(SHOP)).toBe("up_5");
    expect(db.upgradePrompt.findFirst.mock.calls[0][0].where.planChosen).toBeNull();
    expect(db.upgradePrompt.update.mock.calls[0][0].data.declinedAt).toBeInstanceOf(Date);
  });
});

describe("ttvReport", () => {
  const rows = [
    {
      shop: "a",
      installSource: "unknown",
      installedAt: DAYS(1),
      firstDraftSeenAt: new Date(DAYS(1).getTime() + 90_000),
      firstDraftSource: "quick_start",
      firstPublishAt: new Date(DAYS(1).getTime() + 600_000),
      firstPublishSource: "review_page",
    },
    {
      shop: "b",
      installSource: "app_store:search",
      installedAt: DAYS(2),
      firstDraftSeenAt: new Date(DAYS(2).getTime() + 30_000),
      firstDraftSource: "quick_start",
    },
    {
      shop: "c",
      installSource: "unknown",
      installedAt: DAYS(3),
      uninstalledAt: DAYS(2.5),
      productCountAtFirstLoad: 0,
    },
    {
      shop: "e",
      installSource: "unknown",
      installedAt: DAYS(40),
      reinstalledAt: DAYS(4),
      firstDraftSeenAt: DAYS(39),
      redactedAt: DAYS(1),
    },
  ];

  it("summarizeGrowth: medians over reached installs, censored median, inconsistent flagged, redacted retained", () => {
    const r = ttv.summarizeGrowth({
      cohortRows: rows,
      attempts: [
        { shop: "a", code: "success" },
        { shop: "b", code: "recently-installed" },
        { shop: "b", code: null },
      ],
      prompts: [
        { trigger: "quota_exhausted", shownCount: 2, ctaClickedAt: new Date(), planChosen: "starter" },
        { trigger: "quota_exhausted", shownCount: 0 },
      ],
      excludedShops: ["x"],
      cohortRequested: 20,
    });
    expect(r.cohortSize).toBe(4);
    expect(r.smallSample).toBe(true);
    expect(r.draft).toMatchObject({
      n: 4,
      reached: 2,
      notReached: 2,
      uninstalledWithoutReaching: 1,
      zeroProducts: 1,
      medianSeconds: 60,
      under120s: 2,
      bySource: { quick_start: 2 },
      censoredMedian: "not reached",
    });
    expect(r.draft.inconsistent).toEqual([{ shop: "e", field: "firstDraftSeenAt" }]);
    expect(r.publish).toMatchObject({ reached: 1, medianSeconds: 600 });
    expect(r.reviewAsk).toEqual({
      attempts: 3,
      attemptsByCode: { success: 1, "recently-installed": 1, pending: 1 },
      shopsAsked: 2,
      shopsShown: 1,
    });
    expect(r.upgradePrompts.byTrigger.quota_exhausted).toMatchObject({
      rows: 2,
      shown: 1,
      ctaClicked: 1,
      planChosen: 1,
    });
    expect(r.rows.find((x) => x.redacted).shop).toMatch(/^redacted:/);
    expect(r.rows[0].ttvDraftSeconds).toBe(90);
    expect(r.excludedShops).toEqual(["x"]);
  });

  it("reached === 0 → null median with a note; censored median numeric when more than half reached", () => {
    const none = ttv.summarizeGrowth({
      cohortRows: [{ shop: "z", installSource: "unknown", installedAt: DAYS(1) }],
    });
    expect(none.draft.medianSeconds).toBeNull();
    expect(none.draft.note).toMatch(/no install/);
    const most = ttv.summarizeGrowth({ cohortRows: [rows[0], rows[1], rows[2]] });
    expect(most.draft.censoredMedian).toBe(90); // median of {30 s, 90 s, not reached}
  });

  it("computeTtvReport reads the cohort through an injected client, excludes pre_tracking + owner shops, orders by the reinstall moment", async () => {
    const client = {
      shop: { findMany: vi.fn(async () => rows), findUnique: vi.fn() },
      reviewRequestAttempt: { findMany: vi.fn(async () => []) },
      upgradePrompt: { findMany: vi.fn(async () => []) },
    };
    const r = await ttv.computeTtvReport(client, { cohortSize: 2 });
    const where = client.shop.findMany.mock.calls[0][0].where;
    expect(where.installSource).toEqual({ not: "pre_tracking" });
    expect(where.shop.notIn).toEqual(ttv.DEFAULT_EXCLUDE_SHOPS);
    expect(r.cohortSize).toBe(2);
    expect(r.measuredInstallsTotal).toBe(4);
    expect(r.rows.map((x) => x.shop)).toEqual(["a", "b"]); // newest install moments first
  });
});
