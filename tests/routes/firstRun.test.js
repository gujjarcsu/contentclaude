/**
 * Phase 1 item 10 — where a brand-new shop lands, and where a returning one does.
 *
 * This is the first screen a merchant ever sees, and getting it wrong is
 * expensive in both directions. Send a returning merchant back to a welcome
 * screen and the app looks broken. Send a brand-new merchant to a dashboard of
 * empty states and they leave without generating anything.
 *
 * It is also a routing decision made from four independent inputs — whether any
 * content exists, whether a brand voice exists, a feature flag, and a one-shot
 * `welcomeSeenAt` stamp — which is exactly the shape of logic that quietly
 * inverts during a refactor.
 *
 * The auth parameters are the other half. `/app/*` is an embedded route: a
 * redirect that drops `host` or `id_token` lands the merchant on a page that
 * cannot authenticate, which reads to them as the app logging them out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { prisma, authenticate, getContentMetrics, getOrCreatePlan, getMonthlyUsageCount, graphql } =
  vi.hoisted(() => ({
    prisma: {
      brandVoice: { findUnique: vi.fn(async () => null) },
      generationJob: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null) },
      generatedContent: { groupBy: vi.fn(async () => []) },
      growthState: { findUnique: vi.fn(async () => null) },
      blogPost: { groupBy: vi.fn(async () => []) },
    },
    authenticate: { admin: vi.fn() },
    getContentMetrics: vi.fn(async () => ({ publishedProducts: 0, draftProducts: 0 })),
    getOrCreatePlan: vi.fn(async () => ({ planName: "free", monthlyLimit: 25 })),
    getMonthlyUsageCount: vi.fn(async () => 0),
    graphql: vi.fn(),
  }));

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

const { loader } = await import("../../app/routes/app._index.jsx");

const SHOP = "brand-new.myshopify.com";
const HOST = Buffer.from("brand-new.myshopify.com/admin").toString("base64url");

/** Run the loader and normalise a thrown redirect into something inspectable. */
async function land(query = `?host=${HOST}&id_token=tok&embedded=1&shop=${SHOP}`) {
  try {
    const res = await loader({ request: new Request(`https://app.test/app${query}`) });
    if (res instanceof Response && res.status >= 300 && res.status < 400) {
      return { redirected: true, to: res.headers.get("location") };
    }
    // Phase 2 item 2.11 - this loader returns a plain object now, not a
    // Response: a Response body cannot carry the promise that streams the
    // below-the-fold data. Production code should not grow a fake json() to
    // keep a test helper happy, so the helper handles both shapes.
    return { redirected: false, data: res instanceof Response ? await res.json() : res };
  } catch (e) {
    if (e instanceof Response) return { redirected: true, to: e.headers.get("location") };
    throw e;
  }
}

const withContent = () => getContentMetrics.mockResolvedValue({ publishedProducts: 4, draftProducts: 2 });
const hasBrandVoice = () =>
  prisma.brandVoice.findUnique.mockResolvedValue({
    storeName: "A shop",
    targetAudience: "",
    sampleContent: "",
  });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FEATURE_MAGIC_MOMENT;
  authenticate.admin.mockResolvedValue({ session: { shop: SHOP }, admin: { graphql } });
  graphql.mockResolvedValue({ json: async () => ({ data: { productsCount: { count: 12 } } }) });
  getContentMetrics.mockResolvedValue({ publishedProducts: 0, draftProducts: 0 });
  prisma.brandVoice.findUnique.mockResolvedValue(null);
  prisma.growthState.findUnique.mockResolvedValue(null);
  prisma.generatedContent.groupBy.mockResolvedValue([]);
  prisma.generationJob.findFirst.mockResolvedValue(null);
  prisma.generationJob.count.mockResolvedValue(0);
  prisma.blogPost.groupBy.mockResolvedValue([]);
});

afterEach(() => {
  delete process.env.FEATURE_MAGIC_MOMENT;
});

describe("a brand-new shop, with the magic-moment flow switched off", () => {
  it("goes to setup, because there is nothing to put on a dashboard", async () => {
    const r = await land();
    expect(r.redirected).toBe(true);
    expect(r.to).toMatch(/^\/app\/setup\?/);
  });

  it("does not go to setup once a brand voice exists — setup is done", async () => {
    hasBrandVoice();
    const r = await land();
    expect(r.redirected).toBe(false);
    expect(r.data.isNewShop).toBe(true);
    expect(r.data.hasBrandVoice).toBe(true);
  });

  it("a brand voice of empty strings reaches the dashboard, but is not reported as configured", async () => {
    // Worth pinning because the two conditions differ deliberately. The setup
    // redirect asks whether a BrandVoice ROW exists; `hasBrandVoice`, which the
    // dashboard uses to decide whether to prompt, asks whether any field in it
    // has content. So a merchant who opened setup and saved nothing is not sent
    // back round the loop — the dashboard prompts them instead.
    prisma.brandVoice.findUnique.mockResolvedValue({
      storeName: "   ",
      targetAudience: "",
      sampleContent: null,
    });

    const r = await land();

    expect(r.redirected).toBe(false);
    expect(r.data.hasBrandVoice).toBe(false);
  });
});

describe("a brand-new shop, with the magic-moment flow switched on", () => {
  beforeEach(() => {
    process.env.FEATURE_MAGIC_MOMENT = "1";
  });

  it("goes to the welcome screen instead of setup", async () => {
    const r = await land();
    expect(r.redirected).toBe(true);
    expect(r.to).toMatch(/^\/app\/welcome\?/);
  });

  it("is shown once — a merchant who has seen it lands on the dashboard", async () => {
    // This is the whole point of welcomeSeenAt: "Skip to dashboard" must stick.
    // Without it the merchant is thrown back to the welcome screen every visit.
    prisma.growthState.findUnique.mockResolvedValue({ welcomeSeenAt: new Date() });

    const r = await land();

    expect(r.redirected).toBe(false);
    expect(r.data.isNewShop).toBe(true);
  });

  it("never sends a new shop to setup while the flag is on", async () => {
    // Both branches test isNewShop; only one may fire.
    const r = await land();
    expect(r.to).not.toMatch(/\/app\/setup/);
  });
});

describe("a shop that has done something", () => {
  it("with published content, goes straight to the dashboard", async () => {
    withContent();
    const r = await land();
    expect(r.redirected).toBe(false);
    expect(r.data.isNewShop).toBe(false);
    expect(r.data.generatedCount).toBe(4);
  });

  it("with drafts only, is still not new", async () => {
    // A merchant who generated drafts and did not publish has used the app.
    getContentMetrics.mockResolvedValue({ publishedProducts: 0, draftProducts: 3 });
    const r = await land();
    expect(r.redirected).toBe(false);
    expect(r.data.draftCount).toBe(3);
  });

  it("is not sent to welcome even with the flag on", async () => {
    process.env.FEATURE_MAGIC_MOMENT = "1";
    withContent();
    const r = await land();
    expect(r.redirected).toBe(false);
  });
});

describe("the redirect carries the embedded session with it", () => {
  const keys = ["host", "shop", "id_token", "embedded"];

  it("every auth parameter survives the redirect to setup", async () => {
    const r = await land(`?host=${HOST}&shop=${SHOP}&id_token=tok123&embedded=1&locale=en`);

    expect(r.redirected).toBe(true);
    const q = new URLSearchParams(r.to.split("?")[1]);
    for (const k of keys) {
      expect(q.get(k), `${k} must survive the redirect`).toBeTruthy();
    }
    expect(q.get("id_token")).toBe("tok123");
    expect(q.get("locale")).toBe("en");
  });

  it("the same is true of the redirect to welcome", async () => {
    process.env.FEATURE_MAGIC_MOMENT = "1";
    const r = await land(`?host=${HOST}&shop=${SHOP}&id_token=tok123&embedded=1`);
    const q = new URLSearchParams(r.to.split("?")[1]);
    expect(q.get("host")).toBe(HOST);
    expect(q.get("id_token")).toBe("tok123");
  });

  it("does not invent parameters that were not in the request", async () => {
    const r = await land(`?host=${HOST}&shop=${SHOP}`);
    const q = new URLSearchParams(r.to.split("?")[1]);
    expect(q.get("id_token")).toBeNull();
    expect(q.get("hmac")).toBeNull();
  });
});

describe("what the dashboard is given to render", () => {
  beforeEach(withContent);

  it("reports the shop's own name, not a placeholder", async () => {
    hasBrandVoice();
    const r = await land();
    expect(r.data.storeName).toBe("A shop");
  });

  it("falls back to the shop handle when no name was ever set", async () => {
    const r = await land();
    expect(r.data.storeName).toBe("brand-new");
  });

  it("reports the plan and what is left of it", async () => {
    getOrCreatePlan.mockResolvedValue({ planName: "growth", monthlyLimit: 500 });
    getMonthlyUsageCount.mockResolvedValue(120);

    const r = await land();

    expect(r.data.plan).toEqual({ planName: "growth", monthlyLimit: 500 });
    expect(r.data.usageCount).toBe(120);
  });

  it("does not invent a product count when Shopify will not answer", async () => {
    // The loader lets this throw, and the route error boundary shows it. That
    // is deliberate: rendering "0 products" to a merchant with four thousand
    // would be a made-up number on the first screen they see, and they would
    // reasonably conclude the app cannot see their catalogue.
    graphql.mockRejectedValue(new Error("Shopify 503"));
    await expect(land()).rejects.toThrow(/Shopify 503/);
  });

  it("reports the real product count when Shopify does answer", async () => {
    graphql.mockResolvedValue({ json: async () => ({ data: { productsCount: { count: 4212 } } }) });
    const r = await land();
    expect(r.data.totalProducts).toBe(4212);
  });
});
