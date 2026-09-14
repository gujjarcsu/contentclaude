/**
 * A1 — the Products page listed and counted ARCHIVED products.
 *
 * CW found 17 archived demo products still on the screen on `contentpilot-dev2`.
 * All three `products(...)` calls in the loader had NO `query:` argument at all,
 * and the post-fetch JS filter had cases for DRAFT / PUBLISHED / NEEDS_CONTENT
 * only, so archived products fell through `return true`.
 *
 * A post-fetch filter could never have fixed this on its own: it cannot correct
 * the page counts and it cannot correct the cursor. The scope has to be in the
 * query.
 *
 * THE FAILURE MODE THIS FILE EXISTS FOR. Shopify's search-syntax reference says:
 * "If you specify an invalid field, then the query is IGNORED and all results are
 * returned." A typo in the scope string does not error and does not warn — the
 * archived products simply come back and every count is silently wrong again.
 * So the emitted string is asserted, not the intent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LIST_SCOPE_QUERY, PRODUCT_STATUS } from "../../app/utils/candidates.js";

const { authenticate, graphql, prisma } = vi.hoisted(() => ({
  authenticate: { admin: vi.fn() },
  graphql: vi.fn(),
  prisma: {
    generatedContent: { findMany: vi.fn(async () => []) },
    shop: { findUnique: vi.fn(async () => null), updateMany: vi.fn(async () => ({})) },
    generationJob: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
  },
}));

vi.mock("../../app/shopify.server.js", () => ({ authenticate }));
vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/utils/plans.server.js", () => ({
  getOrCreatePlan: vi.fn(async () => ({ planName: "free", monthlyCredits: 25, status: "active" })),
  getMonthlyUsageCount: vi.fn(async () => 0),
  remainingGenerations: vi.fn(async () => 25),
  tryConsumeGeneration: vi.fn(),
  checkEntitlement: vi.fn(async () => ({ allowed: true })),
  refundGeneration: vi.fn(),
  withGenerationCredit: vi.fn(),
}));
vi.mock("../../app/utils/metrics.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/metrics.server.js");
  return { ...actual, getContentMetrics: vi.fn(async () => ({ draftProducts: 0, publishedProducts: 0, withContent: 0 })) };
});
vi.mock("../../app/utils/candidates.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/candidates.js");
  return {
    ...actual,
    getCandidateCounts: vi.fn(async () => ({
      total: { count: 3, precision: "EXACT" },
      candidates: { count: 3, precision: "EXACT" },
    })),
    scopeForShop: vi.fn(async () => ({})),
  };
});
vi.mock("../../app/utils/publishGate.server.js", () => ({ publishesWithoutReview: vi.fn(async () => false) }), { virtual: true });

/** The pages Shopify hands back. Includes an ARCHIVED product on purpose. */
function productEdges() {
  const node = (id, title, status) => ({
    node: {
      id: `gid://shopify/Product/${id}`,
      title,
      handle: title.toLowerCase().replace(/\s+/g, "-"),
      status,
      productType: "Thing",
      vendor: "V",
      description: "d",
      featuredImage: null,
      variants: { edges: [{ node: { price: "1.00" } }] },
      tags: [],
    },
  });
  return [
    node(1, "Active One", PRODUCT_STATUS.ACTIVE),
    node(2, "Draft One", PRODUCT_STATUS.DRAFT),
    node(3, "Archived One", PRODUCT_STATUS.ARCHIVED),
  ];
}

describe("LIST_SCOPE_QUERY — the constant every products read is scoped by", () => {
  it("is the documented NOT form, not a guess", () => {
    // Shopify: "- must precede the field, value, or subquery. For example,
    // -field:value". Lowercase because the reference documents the values as
    // `status:active,archived,draft,unlisted`.
    expect(LIST_SCOPE_QUERY).toBe("-status:archived");
  });

  it("excludes ONLY archived — drafts and unlisted are still the merchant's catalogue", () => {
    // A merchant drafting in bulk wants to see and optimise their drafts. This
    // is a browse list, not the generation-candidate scope.
    expect(LIST_SCOPE_QUERY).not.toMatch(/status:draft/i);
    expect(LIST_SCOPE_QUERY).not.toMatch(/published_status/i);
  });
});

describe("A1 — the Products loader scopes every read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphql.mockReset();
    authenticate.admin.mockResolvedValue({
      admin: { graphql },
      session: { shop: "s.myshopify.com" },
    });
    graphql.mockResolvedValue({
      json: async () => ({
        data: {
          products: {
            pageInfo: { hasPreviousPage: false, hasNextPage: false, startCursor: "a", endCursor: "b" },
            edges: productEdges(),
          },
        },
      }),
    });
  });

  it("the page query it EMITS carries the scope", async () => {
    const { loader } = await import("../../app/routes/app.products.jsx");
    await loader({ request: new Request("https://x/app/products") });

    expect(graphql).toHaveBeenCalled();
    const emitted = graphql.mock.calls.map((c) => String(c[0])).join("\n---\n");
    // The interpolated string, not the variable name — a template hole that
    // failed to interpolate would leave "${LIST_SCOPE_QUERY}" in the query and
    // Shopify would ignore the whole thing.
    expect(emitted).toContain(LIST_SCOPE_QUERY);
    expect(emitted).not.toContain("${LIST_SCOPE_QUERY}");
  });

  it("scopes the reverse (previous page) query too", async () => {
    const { loader } = await import("../../app/routes/app.products.jsx");
    await loader({ request: new Request("https://x/app/products?dir=prev&cursor=c1") });

    const emitted = graphql.mock.calls.map((c) => String(c[0])).join("\n");
    expect(emitted).toMatch(/products\(last:/);
    expect(emitted).toContain(LIST_SCOPE_QUERY);
  });

  it("every products( read in the route file is scoped — none left behind", async () => {
    // There were THREE unscoped calls and fixing two of them would have left the
    // counts wrong while the list looked right, which is worse than both being
    // wrong: the screen would contradict itself and look deliberate.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("app/routes/app.products.jsx", "utf8"),
    );
    const calls = [...src.matchAll(/products\((?:first|last):[^)]*\)/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) {
      expect(call, `unscoped products( read: ${call}`).toContain("query:");
    }
  });
});

describe("A1 — an ARCHIVED product is absent from the list, whatever the tab", () => {
  // The brief's second required test. The fixture DELIBERATELY contains an
  // archived product even though the scoped query should never return one:
  // this is the documented Shopify failure mode — an invalid field makes the
  // query be ignored and all results returned — so it asks whether the screen
  // still holds when the query silently stops working.
  const archived = { id: "gid://shopify/Product/3", status: PRODUCT_STATUS.ARCHIVED };
  const active = { id: "gid://shopify/Product/1", status: PRODUCT_STATUS.ACTIVE };
  const draft = { id: "gid://shopify/Product/2", status: PRODUCT_STATUS.DRAFT };

  it.each(["all", "draft", "published", "needsContent"])(
    "drops it on the %s tab",
    async (tab) => {
      const { matchesListFilter } = await import("../../app/utils/productState.js");
      expect(matchesListFilter(archived, undefined, tab)).toBe(false);
    },
  );

  it("still shows ACTIVE and DRAFT products — it excludes archived only", async () => {
    const { matchesListFilter } = await import("../../app/utils/productState.js");
    // A merchant drafting in bulk must still see and be able to optimise drafts.
    expect(matchesListFilter(active, undefined, "all")).toBe(true);
    expect(matchesListFilter(draft, undefined, "all")).toBe(true);
  });

  it("keeps the CONTENT tabs working — they are a different axis from Shopify status", async () => {
    const { matchesListFilter } = await import("../../app/utils/productState.js");
    const withDraftCopy = { description: { status: "draft" } };
    const withLiveCopy = { description: { status: "published" } };
    // "draft" the tab means OUR copy awaits review, not that Shopify's product
    // is a draft. A Shopify-DRAFT product with published copy belongs under
    // "published", and mapping the tab onto `status:draft` would have broken it.
    expect(matchesListFilter(draft, withLiveCopy, "published")).toBe(true);
    expect(matchesListFilter(draft, withLiveCopy, "draft")).toBe(false);
    expect(matchesListFilter(active, withDraftCopy, "draft")).toBe(true);
  });

  it("the counts enumeration is scoped by the same constant as the list", async () => {
    // Absent from the LIST but present in the COUNTS would be worse than both
    // being wrong: the screen would contradict itself and look deliberate.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("app/routes/app.products.jsx", "utf8"),
    );
    const enumeration = src.slice(src.indexOf("products(first: 250"));
    expect(enumeration.slice(0, 200)).toContain("query:");
    expect(enumeration.slice(0, 200)).toContain("LIST_SCOPE_QUERY");
  });
});
