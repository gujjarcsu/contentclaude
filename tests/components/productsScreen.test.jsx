/**
 * Redesign (Nov 2026) — THE PRODUCTS LIST, RENDERED.
 *
 * The page is rendered through Polaris inside a memory router whose loader
 * returns the real payload shape, so what the merchant reads is what is
 * asserted: the strip's four numbers with their scope, the page-scoped tabs,
 * a row's state badge and what we hold for it, the one action per row by
 * state, the Frame 03 sentence, and the quota readout the bar is named by.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AppProvider } from "@shopify/polaris";

vi.mock("../../app/db.server.js", () => ({ default: {} }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate: { admin: vi.fn() }, apiVersion: "2026-04" }));
vi.mock("../../app/utils/publishSetting.server.js", () => ({ publishesWithoutReview: vi.fn() }));
vi.mock("../../app/utils/plans.server.js", () => ({ getOrCreatePlan: vi.fn(), getMonthlyUsageCount: vi.fn(), checkEntitlement: vi.fn(), remainingGenerations: vi.fn(), sliceToQuota: vi.fn() }));
vi.mock("../../app/utils/quickStart.server.js", () => ({ runQuickStartOne: vi.fn(), PRODUCT_GID_RE: /^gid:\/\/shopify\/Product\/\d+$/ }));
vi.mock("../../app/utils/metrics.server.js", () => ({ getContentMetrics: vi.fn() }));
vi.mock("../../app/utils/candidates.server.js", () => ({ getCandidateCounts: vi.fn(), notOptimizedFrom: vi.fn(), splitByQuota: vi.fn() }));
vi.mock("../../app/utils/catalogueContent.server.js", () => ({ contentInCatalogue: vi.fn() }));
vi.mock("../../app/queues/generationQueue.server.js", () => ({ enqueueGenerationJob: vi.fn() }));
vi.mock("../../app/utils/quotaSurfaces.server.js", () => ({ getQuotaWarning: vi.fn() }));
vi.mock("../../app/utils/storeScore.server.js", () => ({ productScoresFor: vi.fn() }));
vi.mock("../../app/utils/shopifyQuery.server.js", () => ({ shopifyQuery: vi.fn(), productsPage: vi.fn() }));
vi.mock("../../app/utils/adminGraphql.server.js", () => ({ publishProductWithRetry: vi.fn() }));
vi.mock("../../app/utils/upgradePrompts.server.js", () => ({ getUpsell: vi.fn() }));

const { default: ProductsPage } = await import("../../app/routes/app.products.jsx");

const product = (i, over = {}) => ({
  id: `gid://shopify/Product/${i}`,
  numericId: String(i),
  title: `Product ${i}`,
  handle: `p-${i}`,
  status: "ACTIVE",
  onStorefront: true,
  productType: "Tapware",
  vendor: "Caroma",
  description: "A real description the merchant wrote.",
  imageUrl: "",
  imageAlt: "",
  price: "49.00",
  tags: [],
  ...over,
});

const payload = (over = {}) => ({
  products: [
    product(1, { description: "" }),
    product(2),
    product(3, { onStorefront: false }),
  ],
  contentMap: {
    "gid://shopify/Product/2": { description: { status: "published", updatedAt: "2026-10-13T00:00:00Z", hasOriginal: true }, metaTitle: { status: "draft", updatedAt: "2026-10-31T00:00:00Z", hasOriginal: false } },
  },
  pageInfo: { hasPreviousPage: false, hasNextPage: true, startCursor: "a", endCursor: "b" },
  statusFilter: "all",
  totalStoreProducts: 10000,
  publishedProducts: 312,
  draftProducts: 2,
  draftsOutsideScope: 0,
  candidateProducts: 10000,
  candidateLabel: "active products on your Online Store",
  candidateExact: true,
  totalExact: true,
  countsOk: true,
  notOptimized: 9686,
  archivedProducts: 2514,
  recordPublished: 312,
  catalogueOk: true,
  willProcessNow: 100,
  waitingForQuota: 9586,
  remaining: 100,
  usageCount: 86,
  usageRemaining: 1414,
  quotaWarning: null,
  upsell: null,
  productScores: { "gid://shopify/Product/2": { before: 41, after: 78, delta: 37 } },
  catalogError: null,
  monthlyCredits: 1500,
  planName: "growth",
  entitlements: { bulkJobs: true },
  publishWithoutReview: false,
  ...over,
});

const render = (data) =>
  renderToStaticMarkup(
    <AppProvider i18n={{}}>
      <RouterProvider
        router={createMemoryRouter(
          [{ path: "/app/products", Component: ProductsPage, loader: () => data, hydrateFallbackElement: null }],
          { initialEntries: ["/app/products"], hydrationData: { loaderData: { "0": data } } },
        )}
      />
    </AppProvider>,
  );

describe("the Products list", () => {
  it("the title row names the catalogue and its scope; the strip carries the counts, grouped, each with its scope", () => {
    const html = render(payload());
    expect(html).toContain("10,000 products in your catalog · 2,514 archived not shown");
    expect(html).toContain("AI Content Published");
    expect(html).toContain(">312<");
    expect(html).toContain("of your 10,000 active products on your Online Store");
    expect(html).toContain("Not yet optimized");
    expect(html).toContain(">9,686<");
    expect(html).toContain('id="products-credit-usage"');
    expect(html).toContain("86 / 1,500 used");
    expect(html).toContain('aria-labelledby="products-credit-usage"');
    expect(html).not.toMatch(/\blive\b/);
  });

  it("the tabs filter without counting; the pager says how many rows this page holds; the row the totals exclude is marked on itself", () => {
    const html = render(payload());
    // plain filters, no number on any tab
    for (const tab of ["All", "Not optimized", "Draft", "Published"]) expect(html).toContain(`>${tab}<`);
    expect(html).not.toMatch(/on this page \(\d+\)|\(\d+ on page\)/);
    // the one page-scoped number names its scope
    expect(html).toContain("3 products on this page");
    // Frame 03: product 3 is off the Online Store and holds nothing of ours —
    // it carries the marker, once; the on-storefront rows do not
    expect(html.match(/Not on your Online Store</g) ?? []).toHaveLength(1);
    expect(html).not.toContain("so it is listed but not counted in the totals above");
  });

  it("a row says its state, what we hold for it, its score and gain, and offers the one action its state calls for", () => {
    const html = render(payload());
    // the merchant's own description is not "missing": Enhance, never Generate
    expect(html).toContain("Enhance");
    // no description of their own: Generate
    expect(html).toContain("Generate");
    // published + a draft meta title → the shared state rule says draft is the state
    expect(html).toContain("Ready to review");
    expect(html).toContain("Meta · draft");
    expect(html).toContain('aria-label="Score: 78 out of 100"');
    expect(html).toContain("+37");
    expect(html).toContain("Restore original");
    expect(html).toContain("Caroma · Tapware");
  });

  it("the page primary is the one bulk action, counted and grouped, and the plan-gated version names its plan", () => {
    expect(render(payload())).toContain("Optimize store (9,686)");
    const free = render(payload({ planName: "free", entitlements: { bulkJobs: false }, monthlyCredits: 100, usageCount: 0, usageRemaining: 100 }));
    expect(free).toContain("Optimize all 9,686 at once · needs Starter");
    expect(free).toMatch(/Write the next \d draft|Review your drafts/);
  });

  it("an empty catalogue gets the shared empty state and a way home", () => {
    const html = render(payload({ products: [], contentMap: {}, totalStoreProducts: 0, candidateProducts: 0, notOptimized: 0, draftProducts: 0, archivedProducts: 0, pageInfo: { hasPreviousPage: false, hasNextPage: false } }));
    expect(html).toContain("No products yet");
    expect(html).toContain("Add products to your store, and this is where you generate content for them.");
    expect(html).toContain("Go to Home");
  });
});
