/**
 * Group 1 — the candidate primitive, server side.
 *
 * ── What these would print if the thing they watch were broken ────────────
 *
 * Drop the `query:` argument from COUNTS_QUERY and "asks Shopify for the scoped
 * count" fails naming the variable that went missing. Return the failure from
 * inside the cache supplier instead of throwing and "a throttle is never
 * cached" fails, because the second call would be served from cache and issue
 * no second request. Change the failure path to `?? 0` and the "null, never
 * zero" cases fail.
 *
 * What these CANNOT prove: that Shopify's search syntax means what the docs say.
 * `status:active AND published_status:published` was verified against the Admin
 * GraphQL documentation, and `productsCount(query:)` and `Count.precision` were
 * verified against the live schema — but every call here is mocked, so this file
 * proves we SEND the right query, not that Shopify answers it the way we expect.
 * Only a call against a real store proves that, and it is recorded as untested.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, shopifyQuery } = vi.hoisted(() => ({
  prisma: { brandVoice: { findUnique: vi.fn() } },
  shopifyQuery: vi.fn(),
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/shopifyQuery.server.js", () => ({ shopifyQuery }));
// Pass-through cache: the real one needs Redis. Each test that cares about
// caching asserts on the number of shopifyQuery calls instead.
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (_k, supplier) => supplier()),
  invalidateCache: vi.fn(async () => {}),
}));
vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { getCandidateCounts, getCollectionCandidateCounts, classifyProducts, scopeForShop, CONTENT_ACTION } =
  await import("../../app/utils/candidates.server.js");

const SHOP = "shape-test.myshopify.com";
const admin = { graphql: vi.fn() };

const ok = (totalN, candN, { totalPrec = "EXACT", candPrec = "EXACT" } = {}) => ({
  ok: true,
  data: {
    total: { count: totalN, precision: totalPrec },
    candidates: { count: candN, precision: candPrec },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.brandVoice.findUnique.mockResolvedValue({ includeDraftProducts: false });
});

describe("asking Shopify the scoped question", () => {
  it("sends the candidate query, not an unfiltered count", async () => {
    shopifyQuery.mockResolvedValue(ok(3148, 1350));
    await getCandidateCounts(admin, SHOP);

    const [, query, variables] = shopifyQuery.mock.calls[0];
    expect(variables.scoped).toBe("status:active AND published_status:published");
    // Both halves in ONE document: the true catalogue total AND the candidates.
    expect(query).toMatch(/total:\s*productsCount\s*\{/);
    expect(query).toMatch(/candidates:\s*productsCount\(query:\s*\$scoped\)/);
    // Group 2: precision is read, not just count.
    expect(query).toMatch(/precision/);
  });

  it("reports the real catalogue total AND the candidates, both labelled", async () => {
    // Group 1.5 — "3,148 products in your catalog" is TRUE and keeps its
    // meaning. Replacing it with 1,350 would break a true sentence.
    shopifyQuery.mockResolvedValue(ok(3148, 1350));
    const r = await getCandidateCounts(admin, SHOP);

    expect(r.total).toEqual({ count: 3148, exact: true });
    expect(r.candidates).toEqual({ count: 1350, exact: true });
    expect(r.excluded).toBe(1798);
    expect(r.label).toBe("active products published to your online store");
    expect(r.ok).toBe(true);
  });

  it("widens the query when the shop opted into drafts", async () => {
    prisma.brandVoice.findUnique.mockResolvedValue({ includeDraftProducts: true });
    shopifyQuery.mockResolvedValue(ok(3148, 1630));
    const r = await getCandidateCounts(admin, SHOP);

    expect(shopifyQuery.mock.calls[0][2].scoped).toBe(
      "(status:active OR status:draft) AND published_status:published",
    );
    expect(r.label).toContain("draft");
  });

  it("sends NULL, not an empty string, when the scope excludes nothing", async () => {
    // "" is a search term Shopify must parse; null is the absence of a filter.
    shopifyQuery.mockResolvedValue(ok(10, 10));
    await getCandidateCounts(admin, SHOP, {
      scope: { includeDrafts: true, includeArchived: true, requireOnlineStore: false },
    });
    expect(shopifyQuery.mock.calls[0][2].scoped).toBeNull();
  });
});

describe("the 500,000-product store", () => {
  it("does not present a capped count as an exact total", async () => {
    // Shopify returns AT_LEAST when "a limit was imposed and reached".
    shopifyQuery.mockResolvedValue(ok(10000, 10000, { totalPrec: "AT_LEAST", candPrec: "AT_LEAST" }));
    const r = await getCandidateCounts(admin, SHOP);

    expect(r.total.exact).toBe(false);
    expect(r.candidates.exact).toBe(false);
  });

  it("refuses to subtract one floor from another", async () => {
    // 10,000+ minus 10,000+ is not 0 excluded; it is unknown. Publishing 0 there
    // would tell a 500k merchant that nothing is excluded, which is a guess
    // wearing a number.
    shopifyQuery.mockResolvedValue(ok(10000, 10000, { totalPrec: "AT_LEAST", candPrec: "AT_LEAST" }));
    expect((await getCandidateCounts(admin, SHOP)).excluded).toBeNull();
  });

  it("still computes `excluded` when both counts are exact", async () => {
    shopifyQuery.mockResolvedValue(ok(250, 200));
    expect((await getCandidateCounts(admin, SHOP)).excluded).toBe(50);
  });
});

describe("when Shopify will not answer", () => {
  it("returns null counts, NEVER zero", async () => {
    // Zero is the claim "you have no products". "We could not read it" is a
    // different claim, and 0 is the most damaging possible default on a screen
    // whose whole job is telling a merchant how much work there is.
    shopifyQuery.mockResolvedValue({ ok: false, throttled: false, error: "boom" });
    const r = await getCandidateCounts(admin, SHOP);

    expect(r.total).toBeNull();
    expect(r.candidates).toBeNull();
    expect(r.excluded).toBeNull();
    expect(r.ok).toBe(false);
  });

  it("a THROTTLE is never cached — the second call really asks again", async () => {
    // Caching a transient rate limit for five minutes converts it into five
    // minutes of a screen that cannot count. The supplier throws so the cache
    // stores nothing.
    shopifyQuery.mockResolvedValue({ ok: false, throttled: true, error: "THROTTLED" });

    const first = await getCandidateCounts(admin, SHOP);
    expect(first.throttled).toBe(true);
    expect(shopifyQuery).toHaveBeenCalledTimes(1);

    shopifyQuery.mockResolvedValue(ok(100, 90));
    const second = await getCandidateCounts(admin, SHOP);
    expect(shopifyQuery).toHaveBeenCalledTimes(2);
    expect(second.candidates.count).toBe(90);
  });

  it("survives a settings read that throws, using the safe default", async () => {
    prisma.brandVoice.findUnique.mockRejectedValue(new Error("db down"));
    expect(await scopeForShop(SHOP)).toEqual({
      includeDrafts: false,
      includeArchived: false,
      requireOnlineStore: true,
    });
  });

  it("a shop with no BrandVoice row gets the safe default", async () => {
    prisma.brandVoice.findUnique.mockResolvedValue(null);
    expect((await scopeForShop(SHOP)).includeDrafts).toBe(false);
  });
});

describe("collections", () => {
  it("filters on publication only, because collections have no status", async () => {
    shopifyQuery.mockResolvedValue({
      ok: true,
      data: { total: { count: 395, precision: "EXACT" }, candidates: { count: 380, precision: "EXACT" } },
    });
    const r = await getCollectionCandidateCounts(admin, SHOP);
    expect(shopifyQuery.mock.calls[0][2].scoped).toBe("published_status:published");
    expect(r.total.count).toBe(395);
    expect(r.candidates.count).toBe(380);
  });
});

describe("classifying a page of products", () => {
  it("splits the merchant's own copy from ours, and from nothing", async () => {
    const products = [
      { id: "a", description: "The merchant wrote this themselves." },
      { id: "b", description: "" },
      { id: "c", description: "Also theirs." },
    ];
    const ours = new Set(["c"]);
    const { actions, tally } = classifyProducts(products, ours);

    expect(actions.get("a")).toBe(CONTENT_ACTION.ENHANCE);
    expect(actions.get("b")).toBe(CONTENT_ACTION.GENERATE);
    expect(actions.get("c")).toBe(CONTENT_ACTION.OPTIMIZED);
    expect(tally).toEqual({ enhance: 1, generate: 1, optimized: 1 });
  });

  it("prefers descriptionHtml when both are present", async () => {
    const { actions } = classifyProducts([{ id: "a", descriptionHtml: "<p>Words</p>", description: "" }], new Set());
    expect(actions.get("a")).toBe(CONTENT_ACTION.ENHANCE);
  });

  it("handles an empty page and a missing content map", async () => {
    expect(classifyProducts([], new Set()).tally).toEqual({ enhance: 0, generate: 0, optimized: 0 });
    expect(classifyProducts(null, null).tally).toEqual({ enhance: 0, generate: 0, optimized: 0 });
  });
});
