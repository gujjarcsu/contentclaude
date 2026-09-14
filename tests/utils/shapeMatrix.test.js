/**
 * Phase 10 Part C (backlog F1) — the store-shape matrix, run.
 *
 * Every PASS cell in tests/fixtures/shapeMatrix.js is a function here that
 * drives the REAL code with the named shape: the candidate predicate, the
 * content classifier, the first-run scan (through shopifyQuery with retries
 * off), the catalogue walk's grader, the plan-fit arithmetic. The two
 * bookkeeping tests at the bottom refuse a PASS cell without a function and
 * a function without a PASS cell, so the doc's table can never say more than
 * this file runs.
 *
 * What the first run of this matrix found (2026-09-15):
 *   ALL_DRAFT / B2B_ONLY / ACTIVE_NOT_PUBLISHED scanned as EMPTY — the scan
 *   is scoped to Active products on the Online Store, correctly — and the
 *   empty screen then told a merchant with twenty products to "add a
 *   product". Fixed: Home passes the counts, the screen says the true thing.
 *   ONE_PRODUCT_100_VARIANTS with its only barcode on variant 60: the walk
 *   reads 50, says so in the finding, and the merchant can mark it exempt.
 *   A limitation stated, not a defect hidden.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "../helpers/code.js";
import { SHAPES, SIZES, COUNT_PAYLOADS, PLAN_CONTEXTS, catalogue, toScanNode, toWalkNode, variantBarcodesOf } from "../fixtures/storeShapes.js";
import { CELLS, PHASES, cellsWith } from "../fixtures/shapeMatrix.js";
import { isCandidate, hasRealContent, actionFor, readCount, formatCount, notOptimizedFrom, splitByQuota, CONTENT_ACTION } from "../../app/utils/candidates.js";
import { gradeProduct, GRADE } from "../../app/utils/catalogueWatch.js";
import { needsBarcodeLook } from "../../app/utils/catalogueWatch.server.js";
import { fitPlanFor } from "../../app/utils/planFit.js";
import { planLimitsFor, FREE_PLAN } from "../../app/utils/billing-plans.js";
import { uniformScoreNote } from "../../app/utils/startCopy.js";

vi.mock("../../app/utils/shopifyQuery.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/shopifyQuery.server.js");
  return { ...actual, shopifyQuery: (g, q, v, o = {}) => actual.shopifyQuery(g, q, v, { ...o, maxRetries: 0 }) };
});
vi.mock("../../app/utils/logger.server.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../app/utils/cache.server.js", () => ({ getCache: vi.fn(async (_k, fn) => fn()), setCache: vi.fn(), invalidateCache: vi.fn(), getRedis: async () => null }));
vi.mock("../../app/utils/candidates.server.js", () => ({ scopeForShop: async () => ({}) }));
vi.mock("../../app/db.server.js", () => ({ default: {} }));

const { scanStoreForStart, SCAN_LIMIT, START_TARGETS } = await import("../../app/utils/startState.server.js");

const SHOP = "navaal-shape-matrix.myshopify.com";
const src = (p) => code(readFileSync(p, "utf8"));

/** Shopify's answer to the scoped scan: the candidates, first `n` of them. */
const adminFor = (products) => ({
  graphql: vi.fn(async (_q, { variables }) => ({
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data: { shop: { name: "Shape" }, collections: { edges: [] }, pages: { edges: [] }, products: { edges: products.filter((p) => isCandidate(p)).slice(0, variables.n).map((p) => ({ node: toScanNode(p) })) } } }),
  })),
});
const scan = (products) => scanStoreForStart(adminFor(products), SHOP, { skipCache: true });
const expectScored = (r, n) => {
  expect(r.empty).toBe(false);
  expect(r.totalScanned).toBe(n);
  expect(r.storeScore).toBeGreaterThanOrEqual(0);
  expect(r.storeScore).toBeLessThanOrEqual(100);
  expect(r.targets).toHaveLength(Math.min(n, START_TARGETS));
  const before = r.targets.map((t) => t.scoreBefore);
  expect([...before].sort((a, b) => a - b)).toEqual(before);
  return r;
};
const grades = (products, ctx) => products.map((p) => gradeProduct(toWalkNode(p), ctx));
const fields = (g, grade) => g.findings.filter((f) => f.grade === grade).map((f) => f.field);

// ── the PASS cells, keyed row/phase ─────────────────────────────────────────
const RUN = {
  // catalogue size — Count
  "SIZE:EMPTY/count": () => expect(formatCount(readCount(COUNT_PAYLOADS.EMPTY))).toBe("0"),
  "SIZE:SINGLE/count": () => expect(readCount(COUNT_PAYLOADS.SINGLE)).toEqual({ count: 1, exact: true }),
  "SIZE:TINY/count": () => expect(readCount(COUNT_PAYLOADS.TINY)).toEqual({ count: 5, exact: true }),
  "SIZE:ONE_PAGE/count": () => expect(formatCount(readCount(COUNT_PAYLOADS.ONE_PAGE))).toBe("250"),
  "SIZE:MULTI_PAGE/count": () => expect(formatCount(readCount(COUNT_PAYLOADS.MULTI_PAGE))).toBe("3000"),
  "SIZE:LARGE/count": () => {
    expect(readCount(COUNT_PAYLOADS.LARGE)).toEqual({ count: 10_000, exact: false });
    expect(formatCount(readCount(COUNT_PAYLOADS.LARGE))).toBe("10000+");
  },
  "SIZE:HUGE/count": () => {
    expect(formatCount(readCount(COUNT_PAYLOADS.HUGE))).toBe("10000+");
    expect(readCount(null)).toBe(null); // "could not read" is not 0
    expect(notOptimizedFrom(null, 3)).toBe(null);
  },
  "SIZE:EMPTY/candidates": () => expect(SHAPES.EMPTY_STORE.filter((p) => isCandidate(p))).toHaveLength(0),
  "SIZE:SINGLE/candidates": () => expect(catalogue(SIZES.SINGLE).filter((p) => isCandidate(p))).toHaveLength(1),
  "SIZE:EMPTY/scan": async () => expect(await scan(SHAPES.EMPTY_STORE)).toMatchObject({ empty: true }),
  "SIZE:SINGLE/scan": async () => {
    const r = expectScored(await scan(catalogue(SIZES.SINGLE)), 1);
    expect(r.weakest.productId).toBe("gid://shopify/Product/1000");
  },
  "SIZE:TINY/scan": async () => expectScored(await scan(catalogue(SIZES.TINY)), 5),
  "SIZE:ONE_PAGE/scan": async () => {
    // the scan reads SCAN_LIMIT, never the page; the note says how many it scanned
    const r = expectScored(await scan(catalogue(SIZES.ONE_PAGE)), SCAN_LIMIT);
    expect(uniformScoreNote(r.targets, r.totalScanned)).toMatch(/We scanned 30 products to pick them/);
  },
  "SIZE:EMPTY/grade": () => expect(grades(SHAPES.EMPTY_STORE)).toEqual([]),

  // status mix
  "ALL_ACTIVE/candidates": () => expect(SHAPES.ALL_ACTIVE.filter((p) => isCandidate(p))).toHaveLength(20),
  "ALL_ACTIVE/content": () => expect(SHAPES.ALL_ACTIVE.every((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }) === CONTENT_ACTION.ENHANCE)).toBe(true),
  "ALL_ACTIVE/scan": async () => expectScored(await scan(SHAPES.ALL_ACTIVE), 20),
  "ALL_ACTIVE/grade": () => {
    for (const g of grades(SHAPES.ALL_ACTIVE)) {
      expect(g.skipped).toBeUndefined();
      expect(g.blocking).toBe(0);
      expect(fields(g, GRADE.DEGRADING)).toEqual(["description", "image alt", "gtin", "description"]); // feed: short copy, no alt, no barcode; Google: short copy. Listed, worse
    }
  },
  "ALL_DRAFT/candidates": () => {
    expect(SHAPES.ALL_DRAFT.filter((p) => isCandidate(p))).toHaveLength(0);
    expect(SHAPES.ALL_DRAFT.filter((p) => isCandidate(p, { includeDrafts: true, requireOnlineStore: false }))).toHaveLength(20); // opt-in scope
  },
  "ALL_DRAFT/content": () => expect(SHAPES.ALL_DRAFT.every((p) => hasRealContent(p.description))).toBe(true),
  "ALL_DRAFT/scan": async () => expect(await scan(SHAPES.ALL_DRAFT)).toMatchObject({ empty: true }), // Shopify's scoped answer: nothing
  "ALL_DRAFT/grade": () => {
    for (const g of grades(SHAPES.ALL_DRAFT)) expect(g).toMatchObject({ skipped: "draft", blocking: 0, degrading: 0, cosmetic: 0 });
  },
  "ALL_DRAFT/screens": () => {
    // the finding: an all-draft store scanned as EMPTY and was told to add a product
    const s = src("app/components/StartState.jsx");
    expect(s).toMatch(/scan\?\.empty && Number\(start\?\.totalProducts\) > 0/);
    expect(s).toMatch(/Your products aren't on your Online Store yet/);
    expect(s).toMatch(/they are drafts, archived, or sold through another channel only/);
    expect(s).toMatch(/url: "shopify:\/\/admin\/products",\s*target: "_blank"/);
    const h = src("app/routes/app._index.jsx");
    expect(h).toMatch(/totalProducts,\s*candidateProducts,\s*scan: scanStoreForStart\(admin, shop\)/);
  },
  "MAJORITY_ARCHIVED/candidates": () => expect(SHAPES.MAJORITY_ARCHIVED.filter((p) => isCandidate(p))).toHaveLength(14),
  "MAJORITY_ARCHIVED/content": () => expect(SHAPES.MAJORITY_ARCHIVED.filter((p) => p.status === "ARCHIVED").every((p) => hasRealContent(p.description))).toBe(true),
  "MAJORITY_ARCHIVED/scan": async () => expectScored(await scan(SHAPES.MAJORITY_ARCHIVED), 14),
  "MAJORITY_ARCHIVED/grade": () => {
    // the walk is scoped like the scan: archived products are never fetched, so never graded
    const walked = SHAPES.MAJORITY_ARCHIVED.filter((p) => isCandidate(p));
    expect(walked).toHaveLength(14);
    expect(grades(walked).every((g) => g.blocking === 0)).toBe(true);
    expect(src("app/utils/catalogueWatch.server.js")).toMatch(/const q = scopeQueryFor\(scope\) \|\| null/);
  },

  // channel
  "ACTIVE_NOT_PUBLISHED/candidates": () => expect(SHAPES.ACTIVE_NOT_PUBLISHED.filter((p) => isCandidate(p))).toHaveLength(0),
  "ACTIVE_NOT_PUBLISHED/content": () => expect(SHAPES.ACTIVE_NOT_PUBLISHED.every((p) => hasRealContent(p.description))).toBe(true),
  "ACTIVE_NOT_PUBLISHED/scan": async () => expect(await scan(SHAPES.ACTIVE_NOT_PUBLISHED)).toMatchObject({ empty: true }),
  "ACTIVE_NOT_PUBLISHED/grade": () => {
    // if a walk ever fetched one, the feed finding names the channel — and not when the storefront is locked
    for (const g of grades(SHAPES.ACTIVE_NOT_PUBLISHED, { storefrontPublic: true })) expect(fields(g, GRADE.BLOCKING)).toEqual(["link", "url"]); // the feed's link, Google's crawlable URL
    for (const g of grades(SHAPES.ACTIVE_NOT_PUBLISHED, { storefrontPublic: false })) expect(fields(g, GRADE.BLOCKING)).toEqual([]);
  },
  "ACTIVE_NOT_PUBLISHED/screens": () => RUN["ALL_DRAFT/screens"](),
  "B2B_ONLY/candidates": () => expect(SHAPES.B2B_ONLY.filter((p) => isCandidate(p))).toHaveLength(0),
  "B2B_ONLY/content": () => expect(SHAPES.B2B_ONLY.every((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }) === CONTENT_ACTION.ENHANCE)).toBe(true),
  "B2B_ONLY/scan": async () => expect(await scan(SHAPES.B2B_ONLY)).toMatchObject({ empty: true }),
  "B2B_ONLY/grade": () => {
    for (const g of grades(SHAPES.B2B_ONLY)) expect(g.findings.find((f) => f.field === "link")?.note).toMatch(/Not available on the Online Store channel/);
  },
  "B2B_ONLY/screens": () => RUN["ALL_DRAFT/screens"](),
  "MULTI_CHANNEL/candidates": () => expect(SHAPES.MULTI_CHANNEL.filter((p) => isCandidate(p))).toHaveLength(10),
  "MULTI_CHANNEL/content": () => expect(SHAPES.MULTI_CHANNEL.every((p) => hasRealContent(p.description))).toBe(true),
  "MULTI_CHANNEL/scan": async () => expectScored(await scan(SHAPES.MULTI_CHANNEL), 10),
  "MULTI_CHANNEL/grade": () => {
    const g = grades(SHAPES.MULTI_CHANNEL);
    expect(g.filter((x) => fields(x, GRADE.BLOCKING).includes("link"))).toHaveLength(10);
  },

  // existing content
  "NO_CONTENT/candidates": () => expect(SHAPES.NO_CONTENT.filter((p) => isCandidate(p))).toHaveLength(20),
  "NO_CONTENT/content": () => expect(SHAPES.NO_CONTENT.every((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }) === CONTENT_ACTION.GENERATE)).toBe(true),
  "NO_CONTENT/scan": async () => {
    // FR8's shape: every product missing the same things scores the same, and the note says so
    const r = expectScored(await scan(SHAPES.NO_CONTENT), 20);
    expect(new Set(r.scored.map((p) => p.scores.combined)).size).toBe(1);
    expect(uniformScoreNote(r.targets, r.totalScanned)).toMatch(/all score \d+: they are missing the same things/);
    expect(r.targets.every((t) => t.beforeSnippet === "")).toBe(true);
  },
  "NO_CONTENT/grade": () => {
    for (const g of grades(SHAPES.NO_CONTENT)) expect(fields(g, GRADE.BLOCKING)).toEqual(["description"]);
  },
  "BLANK_MARKUP_CONTENT/candidates": () => expect(SHAPES.BLANK_MARKUP_CONTENT.filter((p) => isCandidate(p))).toHaveLength(6),
  "BLANK_MARKUP_CONTENT/content": () => expect(SHAPES.BLANK_MARKUP_CONTENT.every((p) => !hasRealContent(p.description))).toBe(true),
  "BLANK_MARKUP_CONTENT/scan": async () => {
    const r = expectScored(await scan(SHAPES.BLANK_MARKUP_CONTENT), 6);
    expect(r.targets.every((t) => t.beforeSnippet === "&nbsp;" || t.beforeSnippet === "")).toBe(true);
  },
  "BLANK_MARKUP_CONTENT/grade": () => {
    // the grader sees markup as text: "<p>&nbsp;</p>" is 18 characters, so it is "short", not "empty"
    for (const g of grades(SHAPES.BLANK_MARKUP_CONTENT)) expect(fields(g, GRADE.DEGRADING)).toContain("description");
  },
  "THIN_TEMPLATED/candidates": () => expect(SHAPES.THIN_TEMPLATED.filter((p) => isCandidate(p))).toHaveLength(8),
  "THIN_TEMPLATED/content": () => expect(SHAPES.THIN_TEMPLATED.every((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }) === CONTENT_ACTION.ENHANCE)).toBe(true),
  "THIN_TEMPLATED/scan": async () => expectScored(await scan(SHAPES.THIN_TEMPLATED), 8),
  "THIN_TEMPLATED/grade": () => {
    for (const g of grades(SHAPES.THIN_TEMPLATED)) expect(fields(g, GRADE.DEGRADING)).not.toContain("description"); // over 120 chars: listed
  },
  "HAND_WRITTEN/candidates": () => expect(SHAPES.HAND_WRITTEN.filter((p) => isCandidate(p))).toHaveLength(10),
  "HAND_WRITTEN/content": () => expect(SHAPES.HAND_WRITTEN.every((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }) === CONTENT_ACTION.ENHANCE)).toBe(true),
  "HAND_WRITTEN/scan": async () => {
    const hand = expectScored(await scan(SHAPES.HAND_WRITTEN), 10);
    const none = expectScored(await scan(SHAPES.NO_CONTENT), 20);
    expect(hand.storeScore).toBeGreaterThan(none.storeScore); // the rubric rewards the merchant's own copy
  },
  "HAND_WRITTEN/grade": () => {
    for (const g of grades(SHAPES.HAND_WRITTEN)) expect(g.blocking).toBe(0);
  },
  "PARTIAL_BY_FIELD/candidates": () => expect(SHAPES.PARTIAL_BY_FIELD.filter((p) => isCandidate(p))).toHaveLength(9),
  "PARTIAL_BY_FIELD/content": () => {
    const actions = SHAPES.PARTIAL_BY_FIELD.map((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }));
    expect(actions.filter((a) => a === CONTENT_ACTION.GENERATE)).toHaveLength(3);
    expect(actions.filter((a) => a === CONTENT_ACTION.ENHANCE)).toHaveLength(6);
  },
  "PARTIAL_BY_FIELD/scan": async () => {
    const r = expectScored(await scan(SHAPES.PARTIAL_BY_FIELD), 9);
    // Observed, not assumed: with 25-character copy, a product missing its SEO
    // title or SEO description (27) scores BELOW one missing the description
    // itself (31) - the rubric treats thin copy as no copy and weighs the SEO
    // fields on top. The targets are the three lowest, and they all tie.
    const low = Math.min(...r.scored.map((p) => p.scores.combined));
    expect(r.targets.every((t) => t.scoreBefore === low)).toBe(true);
    expect(r.targets.every((t) => t.beforeSnippet !== "")).toBe(true);
    expect(r.scored.filter((p) => p.description === "").every((p) => p.scores.combined > low)).toBe(true);
  },
  "PARTIAL_BY_FIELD/grade": () => {
    const g = grades(SHAPES.PARTIAL_BY_FIELD);
    expect(g.filter((x) => fields(x, GRADE.BLOCKING).includes("description"))).toHaveLength(3);
  },
  "COMPLIANCE_CLAIMS/candidates": () => expect(SHAPES.COMPLIANCE_CLAIMS.filter((p) => isCandidate(p))).toHaveLength(6),
  "COMPLIANCE_CLAIMS/content": () => expect(SHAPES.COMPLIANCE_CLAIMS.every((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }) === CONTENT_ACTION.ENHANCE)).toBe(true),
  "COMPLIANCE_CLAIMS/scan": async () => {
    const r = expectScored(await scan(SHAPES.COMPLIANCE_CLAIMS), 6);
    expect(r.targets[0].beforeSnippet).toMatch(/WaterMark certified/); // the "before" keeps the claim in view
  },
  "COMPLIANCE_CLAIMS/grade": () => {
    for (const g of grades(SHAPES.COMPLIANCE_CLAIMS)) expect(g.blocking).toBe(0);
  },

  // structure
  "VARIANT_FAMILY/candidates": () => expect(SHAPES.VARIANT_FAMILY.filter((p) => isCandidate(p))).toHaveLength(7),
  "VARIANT_FAMILY/content": () => expect(SHAPES.VARIANT_FAMILY.every((p) => hasRealContent(p.description))).toBe(true),
  "VARIANT_FAMILY/scan": async () => {
    const r = expectScored(await scan(SHAPES.VARIANT_FAMILY), 7);
    expect(new Set(r.scored.map((p) => p.scores.combined)).size).toBeLessThanOrEqual(2); // byte-identical copy, near-identical scores
  },
  "VARIANT_FAMILY/grade": () => {
    for (const g of grades(SHAPES.VARIANT_FAMILY)) expect(g.blocking).toBe(0);
  },
  "FASTENER_SIZES/candidates": () => expect(SHAPES.FASTENER_SIZES.filter((p) => isCandidate(p))).toHaveLength(40),
  "FASTENER_SIZES/content": () => expect(SHAPES.FASTENER_SIZES.every((p) => hasRealContent(p.description))).toBe(true),
  "FASTENER_SIZES/scan": async () => expectScored(await scan(SHAPES.FASTENER_SIZES), SCAN_LIMIT), // 40 products, the scan reads 30
  "FASTENER_SIZES/grade": () => {
    for (const g of grades(SHAPES.FASTENER_SIZES)) expect(g.blocking).toBe(0);
  },
  "VARIANT_HEAVY_BARCODES/candidates": () => expect(SHAPES.VARIANT_HEAVY_BARCODES.filter((p) => isCandidate(p))).toHaveLength(6),
  "VARIANT_HEAVY_BARCODES/content": () => expect(SHAPES.VARIANT_HEAVY_BARCODES.every((p) => hasRealContent(p.description))).toBe(true),
  "VARIANT_HEAVY_BARCODES/scan": async () => expectScored(await scan(SHAPES.VARIANT_HEAVY_BARCODES), 6),
  "VARIANT_HEAVY_BARCODES/grade": () => {
    // F3's exact shape: the first variant has no barcode, a later one does
    for (const p of SHAPES.VARIANT_HEAVY_BARCODES) {
      const node = toWalkNode(p);
      expect(needsBarcodeLook(node, null)).toBe(true);
      expect(fields(gradeProduct(node), GRADE.DEGRADING)).toContain("gtin"); // the pre-Phase-9 verdict, first variant only
      expect(fields(gradeProduct(node, { variantBarcodes: variantBarcodesOf(p) }), GRADE.DEGRADING)).not.toContain("gtin"); // the second look
      expect(needsBarcodeLook(node, { gtinExempt: true })).toBe(false);
    }
  },
  "ONE_PRODUCT_100_VARIANTS/candidates": () => expect(SHAPES.ONE_PRODUCT_100_VARIANTS.filter((p) => isCandidate(p))).toHaveLength(1),
  "ONE_PRODUCT_100_VARIANTS/content": () => expect(hasRealContent(SHAPES.ONE_PRODUCT_100_VARIANTS[0].description)).toBe(true),
  "ONE_PRODUCT_100_VARIANTS/scan": async () => {
    const r = expectScored(await scan(SHAPES.ONE_PRODUCT_100_VARIANTS), 1);
    expect(r.targets).toHaveLength(1);
  },
  "ONE_PRODUCT_100_VARIANTS/grade": () => {
    // the only barcode is on variant 60; the walk reads 50 and SAYS it read 50 — a stated limit, not a hidden one
    const [p] = SHAPES.ONE_PRODUCT_100_VARIANTS;
    const node = toWalkNode(p);
    expect(needsBarcodeLook(node, null)).toBe(true);
    const looked = variantBarcodesOf(p, 50);
    expect(looked).toHaveLength(50);
    const g = gradeProduct(node, { variantBarcodes: looked });
    expect(g.findings.find((f) => f.field === "gtin")?.note).toMatch(/No barcode on any of the 50 variants we read/);
    expect(fields(gradeProduct(node, { variantBarcodes: looked, gtinExempt: true }), GRADE.DEGRADING)).not.toContain("gtin");
  },
  "MULTIPACKS/candidates": () => expect(SHAPES.MULTIPACKS.filter((p) => isCandidate(p))).toHaveLength(4),
  "MULTIPACKS/content": () => expect(SHAPES.MULTIPACKS.every((p) => hasRealContent(p.description))).toBe(true),
  "MULTIPACKS/scan": async () => expectScored(await scan(SHAPES.MULTIPACKS), 4),
  "MULTIPACKS/grade": () => {
    for (const g of grades(SHAPES.MULTIPACKS)) expect(g.blocking).toBe(0);
  },

  // locale
  "NON_ENGLISH/candidates": () => expect(SHAPES.NON_ENGLISH.filter((p) => isCandidate(p))).toHaveLength(8),
  "NON_ENGLISH/content": () => expect(SHAPES.NON_ENGLISH.every((p) => actionFor({ hasOwnContent: hasRealContent(p.description) }) === CONTENT_ACTION.ENHANCE)).toBe(true),
  "NON_ENGLISH/scan": async () => {
    const r = expectScored(await scan(SHAPES.NON_ENGLISH), 8);
    expect(r.targets[0].title).toMatch(/^Mitigeur de cuisine/); // scored as text, no language assumed
  },
  "NON_ENGLISH/grade": () => {
    for (const g of grades(SHAPES.NON_ENGLISH)) expect(fields(g, GRADE.BLOCKING)).not.toContain("description"); // length, not language
  },
  "MULTI_LOCALE/candidates": () => expect(SHAPES.MULTI_LOCALE.filter((p) => isCandidate(p))).toHaveLength(4),
  "MULTI_LOCALE/content": () => expect(SHAPES.MULTI_LOCALE.every((p) => hasRealContent(p.description))).toBe(true),
  "MULTI_LOCALE/scan": async () => {
    const r = expectScored(await scan(SHAPES.MULTI_LOCALE), 4);
    expect(r.targets.every((t) => /^Kitchen Mixer/.test(t.title))).toBe(true); // the primary locale, never a translation
  },
  "MULTI_LOCALE/grade": () => {
    for (const g of grades(SHAPES.MULTI_LOCALE)) expect(g.blocking).toBe(0);
  },

  // plan
  "PLAN:FREE_WITH_QUOTA/plan": () => {
    const c = PLAN_CONTEXTS.FREE_WITH_QUOTA;
    expect(splitByQuota(20, c.monthlyCredits - c.used)).toEqual({ now: 20, waiting: 0 });
    expect(planLimitsFor("free")).toMatchObject({ monthlyCredits: 100, productLimit: 100 });
  },
  "PLAN:FREE_EXHAUSTED/plan": () => {
    const c = PLAN_CONTEXTS.FREE_EXHAUSTED;
    expect(splitByQuota(20, c.monthlyCredits - c.used)).toEqual({ now: 0, waiting: 20 });
    expect(fitPlanFor({ n: 20, currentPlan: "free" })).toMatchObject({ planName: "starter", covers: true, monthsToCover: 1 });
  },
  "PLAN:MID_TIER/plan": () => {
    const c = PLAN_CONTEXTS.MID_TIER;
    expect(splitByQuota(600, c.monthlyCredits - c.used)).toEqual({ now: 380, waiting: 220 });
    expect(fitPlanFor({ n: 600, currentPlan: "starter" })).toMatchObject({ planName: "growth", covers: true });
  },
  "ABOVE_PLAN_CAP/candidates": () => expect(SHAPES.ABOVE_PLAN_CAP.filter((p) => isCandidate(p))).toHaveLength(150),
  "ABOVE_PLAN_CAP/content": () => expect(SHAPES.ABOVE_PLAN_CAP.every((p) => hasRealContent(p.description))).toBe(true),
  "ABOVE_PLAN_CAP/scan": async () => expectScored(await scan(SHAPES.ABOVE_PLAN_CAP), SCAN_LIMIT),
  "ABOVE_PLAN_CAP/grade": () => expect(grades(SHAPES.ABOVE_PLAN_CAP).every((g) => g.blocking === 0)).toBe(true),
  "ABOVE_PLAN_CAP/plan": () => {
    expect(SHAPES.ABOVE_PLAN_CAP.length).toBeGreaterThan(FREE_PLAN.productLimit);
    expect(splitByQuota(150, 100)).toEqual({ now: 100, waiting: 50 });
    expect(fitPlanFor({ n: 150, currentPlan: "free" })).toMatchObject({ planName: "starter", covers: true });
    expect(planLimitsFor("starter").productLimit).toBeGreaterThanOrEqual(150);
  },
  "PLAN:ABOVE_ANY_PLAN/plan": () => {
    const c = PLAN_CONTEXTS.ABOVE_ANY_PLAN;
    const fit = fitPlanFor({ n: c.catalogue, currentPlan: c.planName });
    expect(fit).toMatchObject({ planName: "pro", covers: false, monthsToCover: 5 }); // 20,000 / 4,000 — said, not hidden
    expect(planLimitsFor("pro").productLimit).toBe(null);
  },
  "PLAN:BYO_KEY/plan": () => {
    expect(planLimitsFor(PLAN_CONTEXTS.BYO_KEY.planName)).toMatchObject({ monthlyCredits: 4000, productLimit: null });
    expect(fitPlanFor({ n: 50, currentPlan: "pro" })).toBe(null); // already on the top plan
  },

  // API
  "API:HEALTHY/scan": async () => expectScored(await scan(SHAPES.ALL_ACTIVE), 20),
  "API:THROTTLED/scan": async () => {
    const admin = { graphql: vi.fn(async () => ({ status: 429, headers: { get: () => "2" }, json: async () => ({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }) })) };
    expect(await scanStoreForStart(admin, SHOP, { skipCache: true })).toEqual({ error: true }); // no number, a retry
  },
  "API:PARTIAL_FAILURE/scan": async () => {
    const admin = { graphql: vi.fn(async () => ({ status: 200, headers: { get: () => null }, json: async () => ({ data: { shop: { name: "Shape" }, products: null }, errors: [{ message: "Internal error", extensions: { code: "INTERNAL_SERVER_ERROR" } }] }) })) };
    expect(await scanStoreForStart(admin, SHOP, { skipCache: true })).toEqual({ error: true }); // partial data is not a score
  },
  "API:DEPLOY_MID_JOB/scan": async () => {
    const admin = { graphql: vi.fn(async () => { throw new Error("socket hang up"); }) };
    expect(await scanStoreForStart(admin, SHOP, { skipCache: true })).toEqual({ error: true });
  },
};

describe("the store-shape matrix — every PASS cell, run against the real code", () => {
  for (const c of cellsWith("PASS")) {
    const key = `${c.row}/${c.phase}`;
    it(key, async () => {
      expect(RUN[key], `PASS cell ${key} has no assertion`).toBeTypeOf("function");
      await RUN[key]();
    });
  }
});

describe("the matrix cannot claim more than this file runs", () => {
  it("every PASS cell has a function, and every function is a PASS cell", () => {
    const pass = new Set(cellsWith("PASS").map((c) => `${c.row}/${c.phase}`));
    const run = new Set(Object.keys(RUN));
    expect([...pass].filter((k) => !run.has(k))).toEqual([]);
    expect([...run].filter((k) => !pass.has(k))).toEqual([]);
  });

  it("every row names a phase for every column, with one of the four words", () => {
    for (const [row, phases] of Object.entries(CELLS)) {
      for (const p of PHASES) expect(["PASS", "HELD", "NOT RUN", "n/a"], `${row}/${p.key}`).toContain(phases[p.key]?.status);
    }
  });

  it("every HELD cell names a file that exists and mentions the thing", () => {
    for (const c of cellsWith("HELD")) {
      const file = c.where.split(/[ ,(]/)[0];
      if (!/^tests\//.test(file)) continue; // proofs on a dev store are named by store, not by file
      expect(() => readFileSync(file, "utf8"), `${c.row}/${c.phase} → ${file}`).not.toThrow();
    }
  });
});
