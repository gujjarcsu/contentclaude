/**
 * Phase 2 item 2.1 — one definition of product state, and the test the brief
 * asks for: one fixture, three screens, identical counts.
 *
 * The bug this replaces was not subtle. Home said 5 products optimised while
 * Products said 3, and Products said 12 need content where Optimise said 14 —
 * same store, same second. Four different definitions of "optimised" lived in
 * four files, and none of them agreed.
 *
 * The mechanical cause is worth stating because it is easy to reintroduce: the
 * old counts were not mutually exclusive. A product with a published
 * description and a draft meta title was counted in `publishedProducts` AND in
 * `draftProducts`, so `total - published - draft` — exactly how the Products
 * page derived "needs content" — was wrong by the number of half-finished
 * products. The states here are exclusive by construction, and the last test in
 * the first block is the one that keeps them that way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../../app/db.server.js", () => ({
  default: { $queryRaw: vi.fn(), generatedContent: { findMany: vi.fn() } },
}));

const prisma = (await import("../../app/db.server.js")).default;
const {
  PRODUCT_STATE,
  PRODUCT_STATE_LABEL,
  stateOf,
  stateOfContentMap,
  primaryRowOf,
  getContentMetrics,
  getProductStates,
  stateForProduct,
  coveragePct,
} = await import("../../app/utils/metrics.server.js");

const row = (contentType, status) => ({ contentType, status });

beforeEach(() => vi.clearAllMocks());

describe("one product is in exactly one state", () => {
  it("no rows at all means it needs content", () => {
    expect(stateOf([])).toBe(PRODUCT_STATE.NEEDS_CONTENT);
    expect(stateOf(null)).toBe(PRODUCT_STATE.NEEDS_CONTENT);
  });

  it("a draft row means the merchant still has to look at it", () => {
    expect(stateOf([row("description", "draft")])).toBe(PRODUCT_STATE.DRAFT);
  });

  it("all published means live", () => {
    expect(stateOf([row("description", "published"), row("metaTitle", "published")])).toBe(
      PRODUCT_STATE.PUBLISHED,
    );
  });

  it("published description plus draft meta is DRAFT, not published", () => {
    // The whole point. This product appears in the Review queue, because that
    // queue lists draft rows. Counting it as published is how the dashboard and
    // the review screen come to disagree — which is the bug 2.1 exists to kill.
    // The brief says "description row first"; taken literally it would call
    // this published. Deliberate departure, recorded in PROGRESS.md.
    expect(stateOf([row("description", "published"), row("metaTitle", "draft")])).toBe(PRODUCT_STATE.DRAFT);
  });

  it("rejected only counts when nothing is draft or live", () => {
    expect(stateOf([row("description", "rejected")])).toBe(PRODUCT_STATE.REJECTED);
    expect(stateOf([row("description", "rejected"), row("faq", "draft")])).toBe(PRODUCT_STATE.DRAFT);
    expect(stateOf([row("description", "rejected"), row("faq", "published")])).toBe(PRODUCT_STATE.PUBLISHED);
  });

  it("an unknown status does not silently become published", () => {
    expect(stateOf([row("description", "queued")])).toBe(PRODUCT_STATE.NEEDS_CONTENT);
  });
});

describe("description first, then meta — for the row that speaks for a product", () => {
  it("prefers the description row", () => {
    const rows = [row("metaTitle", "published"), row("description", "draft")];
    expect(primaryRowOf(rows).contentType).toBe("description");
  });

  it("falls back through the meta types in a fixed order", () => {
    expect(primaryRowOf([row("faq", "draft"), row("metaTitle", "draft")]).contentType).toBe("metaTitle");
    expect(primaryRowOf([row("altText", "draft"), row("metaDescription", "draft")]).contentType).toBe(
      "metaDescription",
    );
  });

  it("returns nothing for a product with nothing", () => {
    expect(primaryRowOf([])).toBeNull();
  });
});

/**
 * The test the brief asks for by name: "renders Home, Products and Optimise
 * from one fixture and asserts identical counts."
 *
 * These three screens each call getContentMetrics with the same shop and the
 * same store product total. Reading the numbers the way each screen reads them
 * must produce one answer.
 */
describe("one fixture, three screens, identical counts", () => {
  // A store of 20 products:
  //   4 live, 3 waiting for review, 1 rejected, 12 with nothing yet.
  // Piece counts are deliberately different from product counts — 11 published
  // rows across 4 products — because mixing the two is the other half of the bug.
  const TOTAL_PRODUCTS = 20;
  const FIXTURE = [
    { kind: "state", key: "published", n: 4 },
    { kind: "state", key: "draft", n: 3 },
    { kind: "state", key: "rejected", n: 1 },
    { kind: "piece", key: "published", n: 11 },
    { kind: "piece", key: "draft", n: 7 },
  ];

  const load = () => {
    prisma.$queryRaw.mockResolvedValue(FIXTURE);
    return getContentMetrics("fixture.myshopify.com", { totalProducts: TOTAL_PRODUCTS });
  };

  it("Home: live, waiting and needing content", async () => {
    const m = await load();
    expect(m.publishedProducts).toBe(4);
    expect(m.draftProducts).toBe(3);
    expect(m.needsContentProducts).toBe(12);
  });

  it("Products: the same three numbers, derived the way that page derives them", async () => {
    const m = await load();
    // The Products page used to compute this itself as total - published -
    // draft, which double-counted half-finished products. It now reads it.
    expect(m.needsContentProducts).toBe(TOTAL_PRODUCTS - m.withContent);
    expect(m.publishedProducts).toBe(4);
    expect(m.draftProducts).toBe(3);
  });

  it("Optimize: the number of products a run would target", async () => {
    const m = await load();
    // "Optimize store" means: every product in needs_content.
    expect(m.byState[PRODUCT_STATE.NEEDS_CONTENT]).toBe(12);
    expect(m.byState[PRODUCT_STATE.NEEDS_CONTENT]).toBe(m.needsContentProducts);
  });

  it("the four states sum to the store's product count, always", async () => {
    const m = await load();
    const sum = Object.values(m.byState).reduce((a, b) => a + b, 0);
    expect(sum).toBe(TOTAL_PRODUCTS);
  });

  it("product counts and piece counts stay separate", async () => {
    const m = await load();
    // 11 published rows across 4 published products. A screen that shows both
    // must label them differently; a screen that shows one must not use the
    // other's number.
    expect(m.publishedPieces).toBe(11);
    expect(m.publishedProducts).toBe(4);
    expect(m.publishedPieces).not.toBe(m.publishedProducts);
  });

  it("asks the database once", async () => {
    await load();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("without a product total, needs_content is null and not a guess", () => {
  it("reports null rather than zero", async () => {
    prisma.$queryRaw.mockResolvedValue([{ kind: "state", key: "published", n: 2 }]);
    const m = await getContentMetrics("s.myshopify.com");
    // Zero would read as "nothing left to do", which is the opposite of unknown.
    expect(m.needsContentProducts).toBeNull();
    expect(m.publishedProducts).toBe(2);
  });

  it("a store with no content at all is all needs_content", async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const m = await getContentMetrics("s.myshopify.com", { totalProducts: 40 });
    expect(m.needsContentProducts).toBe(40);
    expect(m.withContent).toBe(0);
  });

  it("a brand-new store with no products has nothing in any state", async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const m = await getContentMetrics("s.myshopify.com", { totalProducts: 0 });
    expect(m.needsContentProducts).toBe(0);
    expect(Object.values(m.byState).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("never reports a negative count when the totals disagree", async () => {
    // Products deleted in Shopify after content was generated for them.
    prisma.$queryRaw.mockResolvedValue([{ kind: "state", key: "published", n: 9 }]);
    const m = await getContentMetrics("s.myshopify.com", { totalProducts: 4 });
    expect(m.needsContentProducts).toBe(0);
  });

  it("returns numbers, not BigInt, so a loader can serialise them", async () => {
    prisma.$queryRaw.mockResolvedValue([{ kind: "state", key: "draft", n: 5n }]);
    const m = await getContentMetrics("s.myshopify.com", { totalProducts: 10 });
    expect(typeof m.draftProducts).toBe("number");
    expect(() => JSON.stringify(m)).not.toThrow();
  });
});

describe("per-product state for a page of products", () => {
  it("groups rows by product and reduces each to one state", async () => {
    prisma.generatedContent.findMany.mockResolvedValue([
      { productId: "p1", contentType: "description", status: "published" },
      { productId: "p1", contentType: "metaTitle", status: "draft" },
      { productId: "p2", contentType: "description", status: "published" },
    ]);

    const states = await getProductStates("s.myshopify.com", ["p1", "p2", "p3"]);

    expect(states.get("p1")).toBe(PRODUCT_STATE.DRAFT);
    expect(states.get("p2")).toBe(PRODUCT_STATE.PUBLISHED);
    expect(states.has("p3")).toBe(false);
  });

  it("a product with no rows reads as needs_content, not undefined", async () => {
    const states = await getProductStates("s.myshopify.com", []);
    expect(stateForProduct(states, "p9")).toBe(PRODUCT_STATE.NEEDS_CONTENT);
  });

  it("does not query for an empty page", async () => {
    await getProductStates("s.myshopify.com", []);
    expect(prisma.generatedContent.findMany).not.toHaveBeenCalled();
  });
});

describe("the labels a merchant reads", () => {
  it("every state has a plain-language label", () => {
    for (const state of Object.values(PRODUCT_STATE)) {
      expect(PRODUCT_STATE_LABEL[state], `no label for ${state}`).toBeTruthy();
    }
  });

  it("no label is a raw key or jargon", () => {
    for (const label of Object.values(PRODUCT_STATE_LABEL)) {
      expect(label).not.toMatch(/_/);
      expect(label).toMatch(/^[A-Z]/);
    }
  });
});

describe("coverage never reads over 100%", () => {
  it("clamps", () => {
    expect(coveragePct(9, 4)).toBe(100);
    expect(coveragePct(1, 4)).toBe(25);
    expect(coveragePct(0, 0)).toBe(0);
  });
});

/**
 * The Products screen contradicting itself — found by looking at a listing
 * screenshot on 2026-09-10, not by any test here.
 *
 * The stat cards read "13 live · 4 ready to review". Directly beneath them the
 * tabs read "Draft (3) · Published (14)". Same store, same screen, same second.
 *
 * The cards came from getContentMetrics (this rule). The tabs re-derived their
 * own from `contentMap[id]?.description?.status` — the description row alone —
 * so a product with a published description and a draft meta title was
 * "Published" to the tabs and "draft" to the cards.
 *
 * The mechanical cause is worth naming because it will recur: the shared rule
 * lived in metrics.server.js, which imports Prisma, so no component could
 * import it. Faced with a rule it could not reach, the component wrote its own.
 * A shared definition that half the app cannot import is not shared, and the
 * fix is that the pure part now lives in productState.js.
 */
describe("the tabs and the cards cannot disagree", () => {
  it("stateOfContentMap gives the same answer as stateOf for the same product", () => {
    const cases = [
      { description: { status: "published" }, metaTitle: { status: "draft" } },
      { description: { status: "draft" } },
      { description: { status: "published" } },
      { description: { status: "rejected" }, faq: { status: "rejected" } },
      { metaTitle: { status: "published" } },
      {},
    ];
    for (const byType of cases) {
      const rows = Object.entries(byType).map(([contentType, v]) => ({ contentType, status: v.status }));
      expect(stateOfContentMap(byType), JSON.stringify(byType)).toBe(stateOf(rows));
    }
  });

  it("a published description with a draft meta title is a DRAFT, not published", () => {
    // This is the exact product that made 13 read as 14. It is still in the
    // Review queue waiting for that meta title, so the merchant is not done.
    expect(stateOfContentMap({ description: { status: "published" }, metaTitle: { status: "draft" } })).toBe(
      PRODUCT_STATE.DRAFT,
    );
  });

  it("a product with no rows at all needs content", () => {
    expect(stateOfContentMap(undefined)).toBe(PRODUCT_STATE.NEEDS_CONTENT);
    expect(stateOfContentMap(null)).toBe(PRODUCT_STATE.NEEDS_CONTENT);
    expect(stateOfContentMap({})).toBe(PRODUCT_STATE.NEEDS_CONTENT);
  });

  it("ignores malformed rows rather than counting them as a state", () => {
    expect(stateOfContentMap({ description: null, metaTitle: { status: "draft" } })).toBe(
      PRODUCT_STATE.DRAFT,
    );
    expect(stateOfContentMap({ description: { status: 42 } })).toBe(PRODUCT_STATE.NEEDS_CONTENT);
  });

  it("the row badge, the tabs and the cards are all ONE classifier", () => {
    // There were THREE rules on this one screen: the stat cards (shared), the
    // tabs (description-only) and the row badge (description-only). The badge
    // said "Published" on a product the tabs had just put under "Draft".
    const src = readFileSync("app/routes/app.products.jsx", "utf8");
    const classifiers = (src.match(/stateOfContentMap\(/g) || []).length;
    expect(
      classifiers,
      "every classification on this screen goes through the shared rule",
    ).toBeGreaterThanOrEqual(3);
  });

  it("the row badge uses the shared vocabulary, not words of its own", () => {
    // "No AI Content" and "Unknown" were invented here; PRODUCT_STATE_LABEL is
    // what every other screen says.
    const src = readFileSync("app/routes/app.products.jsx", "utf8");
    expect(src).not.toMatch(/>No AI Content</);
    expect(src).not.toMatch(/>Unknown</);
    expect(src).toMatch(/PRODUCT_STATE_LABEL\[state\]/);
  });

  it("the Products screen no longer classifies on the description row alone", () => {
    // The source guard. Without it this reverts the moment somebody needs a
    // count and reaches for the nearest field.
    const src = readFileSync("app/routes/app.products.jsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(src).not.toMatch(/contentMap\[[^\]]+\]\?\.description\?\.status/);
    expect(src).toMatch(/stateOfContentMap\(/);
  });

  it("the pure rule is importable by a component — no server imports", () => {
    // The root cause. If productState.js ever imports the database again, the
    // components lose access to the shared rule and will re-invent it.
    const src = readFileSync("app/utils/productState.js", "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*db\.server/);
    expect(src).not.toMatch(/from\s+["'][^"']*\.server(\.js)?["']/);
  });
});
