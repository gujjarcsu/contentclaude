/**
 * The Optimize run processes, and charges, exactly what the button counts.
 *
 * Found on the dev store (Nov 2026): the button said "Optimize store (6)" and
 * "uses up to 6 credits"; the job wrote 8 and spent 8. Two definitions:
 *   - the count: the shop's candidate scope (active on the Online Store) minus
 *     products we hold ANY content for
 *   - the run: every non-archived product minus products with a DESCRIPTION row
 * so a draft-status product and a product with only SEO text were run and
 * charged without being counted.
 *
 * This drives the real action against a fake catalogue in which the two
 * definitions disagree, and checks the job against the count's own arithmetic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/utils/shopifyQuery.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/shopifyQuery.server.js");
  return {
    ...actual,
    shopifyQuery: (graphql, query, variables, opts = {}) => actual.shopifyQuery(graphql, query, variables, { ...opts, maxRetries: 0 }),
  };
});

const { prisma, authenticate, enqueue, graphql } = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    brandVoice: { findUnique: vi.fn(async () => null) },
    generationJob: { create: vi.fn(async ({ data }) => ({ id: "job-1", ...data })) },
  },
  authenticate: { admin: vi.fn() },
  enqueue: vi.fn(async () => {}),
  graphql: vi.fn(),
}));

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate }));
vi.mock("../../app/queues/generationQueue.server.js", () => ({ enqueueGenerationJob: enqueue }));
vi.mock("../../app/utils/cache.server.js", () => ({ getCache: vi.fn(async (k, fn) => fn()), invalidateCache: vi.fn(async () => {}) }));
vi.mock("../../app/utils/plans.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/plans.server.js");
  return { ...actual, checkEntitlement: vi.fn(async () => ({ allowed: true })), remainingGenerations: vi.fn(async () => 100) };
});

const { action } = await import("../../app/routes/app.optimize.jsx");
const { intersectContent } = await import("../../app/utils/catalogueContent.js");
const { notOptimizedFrom, scopeQueryFor, normaliseScope } = await import("../../app/utils/candidates.js");

const SHOP = "count-store.myshopify.com";
const gid = (n) => `gid://shopify/Product/${n}`;

// The catalogue. 1–4 are active on the Online Store. 5 is a draft-status
// product, 6 is active but not on the Online Store: neither is a candidate.
const ON_STORE = [1, 2, 3, 4].map(gid);
const NOT_CANDIDATES = [5, 6].map(gid);
// What we hold: 3 has only SEO text (a meta row, no description row); 4 has a
// description draft. So the button counts 1 and 2 → 2 products.
const STATE_ROWS = [
  { productId: gid(3), state: "draft" },
  { productId: gid(4), state: "draft" },
];
const DESCRIPTION_ROWS = [{ productId: gid(4) }];

const page = (ids) => ({
  json: async () => ({
    data: { products: { edges: ids.map((id) => ({ node: { id, description: "" } })), pageInfo: { hasNextPage: false, endCursor: null } } },
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP }, admin: { graphql } });
  // Shopify honours the search query: the candidate scope returns only 1–4.
  graphql.mockImplementation(async (_q, { variables }) => {
    const q = String(variables?.q ?? "");
    return page(q.includes("published_status:published") ? ON_STORE : [...ON_STORE, ...NOT_CANDIDATES]);
  });
  // productStateRows groups every content row; the old run asked for
  // description rows only. Answer each query the way the database would.
  prisma.$queryRaw.mockImplementation(async (strings) => {
    const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
    return /"contentType" = 'description'/.test(sql) ? DESCRIPTION_ROWS : STATE_ROWS;
  });
});

const post = () =>
  action({
    request: new Request("https://app.test/app/optimize", {
      method: "POST",
      body: new URLSearchParams({ description: "true", metaTitle: "true", metaDescription: "true" }),
    }),
  });

describe("Optimize: the run is the count", () => {
  it("runs exactly the products the button counts, and no others", async () => {
    // The button's own arithmetic, from the same helpers the loader uses.
    const inScope = new Set(ON_STORE);
    const counted = notOptimizedFrom(inScope.size, intersectContent(STATE_ROWS, inScope).withContent);
    expect(counted).toBe(2);

    const res = await post();
    expect(res.status).toBe(302);
    const job = prisma.generationJob.create.mock.calls[0][0].data;
    expect(JSON.parse(job.productIds).sort()).toEqual([gid(1), gid(2)]);
    // Charged per product run: the bill equals the count on the button.
    expect(job.totalProducts).toBe(counted);
  });

  it("walks the candidate scope, never the whole non-archived catalogue", async () => {
    await post();
    const qs = graphql.mock.calls.map(([, opts]) => opts?.variables?.q);
    expect(qs).toEqual([scopeQueryFor(normaliseScope(undefined))]);
  });

  it("follows the merchant's 'include draft products' setting, like the count does", async () => {
    prisma.brandVoice.findUnique.mockResolvedValue({ includeDraftProducts: true });
    await post();
    const q = graphql.mock.calls[0][1].variables.q;
    expect(q).toBe(scopeQueryFor({ includeDrafts: true }));
    expect(q).toMatch(/status:draft/);
  });
});
