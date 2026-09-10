/**
 * Phase 3 items 3.1 / 3.2 — where a brand-new shop lands, and where a returning
 * one does.
 *
 * This is the first screen a merchant ever sees, and it used to be a routing
 * decision made from four independent inputs: whether any content existed,
 * whether a brand voice existed, a feature flag, and a one-shot `welcomeSeenAt`
 * stamp. A brand-new shop was redirected to `/app/welcome` (magic moment) or
 * `/app/setup` (a five-step form), depending on an environment variable that
 * was never set in production — so in practice every new merchant got the form.
 *
 * All of that is gone. Home renders the Start state itself. The tests that
 * matter now are about what did NOT survive:
 *
 *  - **No redirect.** `/app` is the whole embedded chain. Four App Store
 *    rejections were about redirects out of that chain, and the safest version
 *    of this screen is the one that has none.
 *  - **One input, not four.** `Shop.firstDraftSeenAt` — the same first-value
 *    milestone `ttvReport.server.js` measures. Not "has no content" (a merchant
 *    who deleted every draft is not new) and not a `GrowthState` flag (those did
 *    not survive uninstall/reinstall).
 *  - **A shop with no `Shop` row is NOT a first run.** That is a shop installed
 *    before tracking shipped and not seen since. Restarting onboarding for an
 *    established merchant is the expensive direction of this mistake.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  prisma,
  authenticate,
  getContentMetrics,
  getOrCreatePlan,
  getMonthlyUsageCount,
  graphql,
  scanStoreForStart,
  stampProductCountAtFirstLoad,
} = vi.hoisted(() => ({
  prisma: {
    brandVoice: { findUnique: vi.fn(async () => null) },
    generationJob: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null) },
    generatedContent: { groupBy: vi.fn(async () => []) },
    growthState: { findUnique: vi.fn(async () => null) },
    blogPost: { groupBy: vi.fn(async () => []) },
    shop: { findUnique: vi.fn(async () => ({ firstDraftSeenAt: null })) },
  },
  authenticate: { admin: vi.fn() },
  getContentMetrics: vi.fn(async () => ({ publishedProducts: 0, draftProducts: 0 })),
  getOrCreatePlan: vi.fn(async () => ({ planName: "free", monthlyLimit: 25 })),
  getMonthlyUsageCount: vi.fn(async () => 0),
  graphql: vi.fn(),
  scanStoreForStart: vi.fn(async () => ({ empty: false, storeScore: 41, targets: [] })),
  stampProductCountAtFirstLoad: vi.fn(async () => true),
}));

// Phase 4 item 6 — the catalogue reads back off on THROTTLED, which means real
// 1s/2s/4s sleeps. This file tests the loader, not the backoff, so the shared
// helper keeps its real logic with retries disabled. The backoff has its own
// fake-timer tests in tests/utils/shopifyQuery.test.js.
vi.mock("../../app/utils/shopifyQuery.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/shopifyQuery.server.js");
  return {
    ...actual,
    shopifyQuery: (graphql, query, variables, opts = {}) =>
      actual.shopifyQuery(graphql, query, variables, { ...opts, maxRetries: 0 }),
  };
});

vi.mock("../../app/db.server.js", () => ({ default: prisma }));
vi.mock("../../app/shopify.server.js", () => ({ authenticate, apiVersion: "2026-04" }));
vi.mock("../../app/utils/metrics.server.js", async () => {
  // needsContentFrom is the real arithmetic — mocking it would let the loader
  // pass with a wrong needs-content count. Only the query is faked.
  const actual = await vi.importActual("../../app/utils/metrics.server.js");
  return { ...actual, getContentMetrics };
});
vi.mock("../../app/utils/plans.server.js", () => ({ getOrCreatePlan, getMonthlyUsageCount }));
vi.mock("../../app/utils/cache.server.js", () => ({ getCache: vi.fn(async (k, fn) => fn()) }));
vi.mock("../../app/utils/startState.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/startState.server.js");
  return { ...actual, scanStoreForStart };
});
vi.mock("../../app/utils/firstValue.server.js", () => ({ stampProductCountAtFirstLoad }));

const { loader } = await import("../../app/routes/app._index.jsx");

const SHOP = "brand-new.myshopify.com";
const HOST = Buffer.from("brand-new.myshopify.com/admin").toString("base64url");

/** Run the loader; a thrown redirect becomes something inspectable. */
async function land(query = `?host=${HOST}&id_token=tok&embedded=1&shop=${SHOP}`) {
  try {
    const res = await loader({ request: new Request(`https://app.test/app${query}`) });
    if (res instanceof Response && res.status >= 300 && res.status < 400) {
      return { redirected: true, to: res.headers.get("location") };
    }
    // The loader returns a plain object, not a Response: a Response body cannot
    // carry the promises that stream the scan and the below-the-fold data.
    return { redirected: false, data: res instanceof Response ? await res.json() : res };
  } catch (e) {
    if (e instanceof Response) return { redirected: true, to: e.headers.get("location") };
    throw e;
  }
}

const withContent = () => getContentMetrics.mockResolvedValue({ publishedProducts: 4, draftProducts: 2 });
const hasSeenADraft = () => prisma.shop.findUnique.mockResolvedValue({ firstDraftSeenAt: new Date() });

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP }, admin: { graphql } });
  graphql.mockResolvedValue({ json: async () => ({ data: { total: { count: 12, precision: "EXACT" }, candidates: { count: 12, precision: "EXACT" }, productsCount: { count: 12 } } }) });
  getContentMetrics.mockResolvedValue({ publishedProducts: 0, draftProducts: 0 });
  getOrCreatePlan.mockResolvedValue({ planName: "free", monthlyLimit: 25 });
  getMonthlyUsageCount.mockResolvedValue(0);
  prisma.brandVoice.findUnique.mockResolvedValue(null);
  prisma.growthState.findUnique.mockResolvedValue(null);
  prisma.generatedContent.groupBy.mockResolvedValue([]);
  prisma.generationJob.findFirst.mockResolvedValue(null);
  prisma.generationJob.count.mockResolvedValue(0);
  prisma.blogPost.groupBy.mockResolvedValue([]);
  prisma.shop.findUnique.mockResolvedValue({ firstDraftSeenAt: null });
  scanStoreForStart.mockResolvedValue({ empty: false, storeScore: 41, targets: [] });
});

describe("the first run never leaves /app", () => {
  it("a brand-new shop is not redirected anywhere", async () => {
    const r = await land();
    expect(r.redirected).toBe(false);
  });

  it("renders the Start state instead", async () => {
    const r = await land();
    expect(r.data.start).toBeTruthy();
    expect(r.data.start.scan).toBeInstanceOf(Promise);
  });

  it("does not redirect even with no brand voice and no content at all", async () => {
    // The two conditions that used to send a merchant to /app/setup.
    prisma.brandVoice.findUnique.mockResolvedValue(null);
    getContentMetrics.mockResolvedValue({ publishedProducts: 0, draftProducts: 0 });
    const r = await land();
    expect(r.redirected).toBe(false);
    expect(r.data.hasBrandVoice).toBe(false);
  });

  it("the loader source contains no redirect to the retired routes", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/routes/app._index.jsx", "utf8").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/redirect\(`\/app\/welcome/);
    expect(src).not.toMatch(/redirect\(`\/app\/setup/);
  });
});

describe("what decides a first run", () => {
  it("is firstDraftSeenAt being null, not the absence of content", async () => {
    // A merchant who HAS been stamped is never shown Start again, even with
    // content counts that the old rule would have called brand new.
    hasSeenADraft();
    withContent();
    const r = await land();
    expect(r.data.start).toBeNull();
  });

  it("a shop that has seen a draft but deleted all its content is not new", async () => {
    // The old rule ("no published and no drafts") would have restarted
    // onboarding for this merchant.
    hasSeenADraft();
    getContentMetrics.mockResolvedValue({ publishedProducts: 0, draftProducts: 0 });
    const r = await land();
    expect(r.data.start).toBeNull();
    // Still "new" for the hero copy — a different question, deliberately.
    expect(r.data.isNewShop).toBe(true);
  });

  it("a shop with NO Shop row is not treated as a first run", async () => {
    // Installed before tracking shipped and not seen since. Absent evidence,
    // the safe default is the dashboard, not restarting onboarding.
    prisma.shop.findUnique.mockResolvedValue(null);
    const r = await land();
    expect(r.data.start).toBeNull();
  });

  it("a failed Shop lookup degrades to the dashboard, not to Start", async () => {
    prisma.shop.findUnique.mockRejectedValue(new Error("connection lost"));
    const r = await land();
    expect(r.redirected).toBe(false);
    expect(r.data.start).toBeNull();
  });
});

describe("the Start state is honest about what it will spend", () => {
  it("reports what is left of the free quota", async () => {
    getOrCreatePlan.mockResolvedValue({ planName: "free", monthlyLimit: 25 });
    getMonthlyUsageCount.mockResolvedValue(22);
    const r = await land();
    expect(r.data.start.remaining).toBe(3);
    expect(r.data.start.monthlyLimit).toBe(25);
  });

  it("never reports a negative balance", async () => {
    getMonthlyUsageCount.mockResolvedValue(40);
    const r = await land();
    expect(r.data.start.remaining).toBe(0);
  });

  it("offers at most three products — that is the credit ceiling", async () => {
    const r = await land();
    expect(r.data.start.targetCount).toBe(3);
  });
});

describe("first-value instrumentation", () => {
  it("records the catalogue size on a first run, for the TTV report", async () => {
    graphql.mockResolvedValue({ json: async () => ({ data: { total: { count: 87, precision: "EXACT" }, candidates: { count: 87, precision: "EXACT" }, productsCount: { count: 87 } } }) });
    await land();
    expect(stampProductCountAtFirstLoad).toHaveBeenCalledWith(SHOP, 87);
  });

  it("does not re-record it for a shop that is past its first run", async () => {
    hasSeenADraft();
    await land();
    expect(stampProductCountAtFirstLoad).not.toHaveBeenCalled();
  });
});

describe("what the dashboard is given to render", () => {
  beforeEach(() => {
    withContent();
    hasSeenADraft();
  });

  it("reports the shop's own name, not a placeholder", async () => {
    prisma.brandVoice.findUnique.mockResolvedValue({
      storeName: "A shop",
      targetAudience: "",
      sampleContent: "",
    });
    const r = await land();
    expect(r.data.storeName).toBe("A shop");
    expect(r.data.hasBrandVoice).toBe(true);
  });

  it("falls back to the shop handle when no name was ever set", async () => {
    const r = await land();
    expect(r.data.storeName).toBe("brand-new");
  });

  it("a brand voice of empty strings is not reported as configured", async () => {
    prisma.brandVoice.findUnique.mockResolvedValue({
      storeName: "   ",
      targetAudience: "",
      sampleContent: null,
    });
    const r = await land();
    expect(r.data.hasBrandVoice).toBe(false);
  });

  it("reports the plan and what is left of it", async () => {
    getOrCreatePlan.mockResolvedValue({ planName: "growth", monthlyLimit: 500 });
    getMonthlyUsageCount.mockResolvedValue(120);

    const r = await land();

    expect(r.data.plan).toEqual({ planName: "growth", monthlyLimit: 500 });
    expect(r.data.usageCount).toBe(120);
  });

  it("does not invent a product count when Shopify will not answer", async () => {
    // The guarantee is unchanged and is the one that matters: rendering
    // "0 products" to a merchant with four thousand would be a made-up number
    // on the first screen they see.
    //
    // What CHANGED in Group 1 is the failure mode. This used to let the loader
    // throw, so the whole dashboard became an error boundary. The count now
    // comes back as `null` and Home renders "—" with a line saying we could not
    // read it — so the drafts, the store score and the next action still work
    // while Shopify is unavailable. A stated unknown beats both a fabricated
    // zero and a blank screen.
    graphql.mockRejectedValue(new Error("Shopify 503"));
    const r = await land();
    expect(r.data.totalProducts).toBeNull();
    expect(r.data.candidateProducts).toBeNull();
    expect(r.data.countsOk).toBe(false);
    // The thing this test exists to forbid.
    expect(r.data.totalProducts).not.toBe(0);
  });

  it("reports the real product count when Shopify does answer", async () => {
    graphql.mockResolvedValue({ json: async () => ({ data: { total: { count: 4212, precision: "EXACT" }, candidates: { count: 4212, precision: "EXACT" }, productsCount: { count: 4212 } } }) });
    const r = await land();
    expect(r.data.totalProducts).toBe(4212);
  });
});
