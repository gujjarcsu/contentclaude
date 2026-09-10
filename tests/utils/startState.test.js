/**
 * Phase 3 items 3.1 / 3.2 — the Start-state scan.
 *
 * This is the magic-moment engine, absorbed out of the retired `/app/welcome`.
 * It computes the number the first screen leads with, so the bar is that the
 * number is either **true or absent**. A store score is the first claim this
 * app makes to a merchant about their own catalogue; getting it from a partial
 * scan, a failed API call or a default would be the worst possible place to
 * invent something.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// Phase 4 item 6 — the catalogue reads now back off on THROTTLED, which means
// real 1s/2s/4s sleeps. These tests are about THIS module's behaviour, not the
// backoff, so the shared helper keeps its real logic with retries disabled. The
// backoff itself is tested with fake timers in tests/utils/shopifyQuery.test.js.
vi.mock("../../app/utils/shopifyQuery.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/shopifyQuery.server.js");
  return {
    ...actual,
    shopifyQuery: (graphql, query, variables, opts = {}) =>
      actual.shopifyQuery(graphql, query, variables, { ...opts, maxRetries: 0 }),
  };
});

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// The cache is exercised separately; here it must not hide a second call.
vi.mock("../../app/utils/cache.server.js", () => ({
  getCache: vi.fn(async (_key, fn) => fn()),
}));

const { scanStoreForStart, scoreProduct, pickWeakest, toScorable, SCAN_LIMIT, START_TARGETS } =
  await import("../../app/utils/startState.server.js");
const { getCache } = await import("../../app/utils/cache.server.js");

const SHOP = "a-store.myshopify.com";

/** A GraphQL node, with a description length that drives the score. */
function node(id, { title = `P${id}`, description = "", seoTitle = "", seoDescription = "" } = {}) {
  return {
    id: `gid://shopify/Product/${id}`,
    title,
    description,
    productType: "Thing",
    vendor: "V",
    tags: [],
    seo: { title: seoTitle, description: seoDescription },
    featuredMedia: { preview: { image: { url: `https://img/${id}.jpg` } } },
    media: { edges: [{ node: { mediaContentType: "IMAGE", image: { altText: "" } } }] },
    variants: { edges: [{ node: { price: "10.00" } }] },
  };
}

const adminReturning = (nodes) => ({
  graphql: vi.fn(async () => ({
    json: async () => ({ data: { products: { edges: nodes.map((n) => ({ node: n })) } } }),
  })),
});

beforeEach(() => vi.clearAllMocks());

describe("a store with nothing in it is told so, not scored", () => {
  it("reports empty rather than a score of zero", async () => {
    const r = await scanStoreForStart(adminReturning([]), SHOP);
    expect(r).toEqual({ empty: true });
    expect(r.storeScore).toBeUndefined();
  });
});

describe("a failed scan produces no number at all", () => {
  it("returns error when the Admin API throws", async () => {
    const admin = {
      graphql: vi.fn(async () => {
        throw new Error("Shopify 503");
      }),
    };
    expect(await scanStoreForStart(admin, SHOP)).toEqual({ error: true });
  });

  it("returns error when the response carries GraphQL errors", async () => {
    // A 200 with an errors array is the case that silently produces zeroes if
    // you only check `data`.
    const admin = {
      graphql: vi.fn(async () => ({ json: async () => ({ errors: [{ message: "Throttled" }] }) })),
    };
    expect(await scanStoreForStart(admin, SHOP)).toEqual({ error: true });
  });

  it("never invents a score on failure", async () => {
    const admin = {
      graphql: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const r = await scanStoreForStart(admin, SHOP);
    expect(r.storeScore).toBeUndefined();
    expect(r.targets).toBeUndefined();
  });
});

describe("the score is computed from the merchant's own catalogue", () => {
  it("averages the scanned products and reports how many were scanned", async () => {
    const nodes = [
      node(1, { description: "x".repeat(400), seoTitle: "T", seoDescription: "D" }),
      node(2, { description: "" }),
      node(3, { description: "short" }),
    ];
    const r = await scanStoreForStart(adminReturning(nodes), SHOP);

    expect(r.empty).toBe(false);
    expect(r.totalScanned).toBe(3);
    expect(r.storeScore).toBeGreaterThanOrEqual(0);
    expect(r.storeScore).toBeLessThanOrEqual(100);
    // The well-filled product must score above the empty one.
    const scores = nodes.map((n) => scoreProduct(toScorable(n)).combined);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });

  it("the store score is the mean of the products it scanned", async () => {
    const nodes = [node(1, { description: "x".repeat(400), seoTitle: "T", seoDescription: "D" }), node(2)];
    const r = await scanStoreForStart(adminReturning(nodes), SHOP);
    const each = nodes.map((n) => scoreProduct(toScorable(n)).combined);
    expect(r.storeScore).toBe(Math.round((each[0] + each[1]) / 2));
  });

  it("asks Shopify for a bounded page — the score is a sample, and is described as one", async () => {
    const admin = adminReturning([node(1)]);
    await scanStoreForStart(admin, SHOP);
    expect(admin.graphql.mock.calls[0][1]).toEqual({ variables: { n: SCAN_LIMIT } });
    expect(SCAN_LIMIT).toBeGreaterThan(0);
  });

  it("scans only ACTIVE products — a draft product is not a storefront problem", async () => {
    const admin = adminReturning([node(1)]);
    await scanStoreForStart(admin, SHOP);
    expect(admin.graphql.mock.calls[0][0]).toMatch(/status:active/);
  });
});

describe("it offers the products that actually hurt the score", () => {
  it("picks the weakest, worst first", async () => {
    const nodes = [
      node(1, { description: "x".repeat(400), seoTitle: "T", seoDescription: "D" }),
      node(2, { description: "" }),
      node(3, { description: "tiny" }),
      node(4, { description: "x".repeat(300), seoTitle: "T" }),
    ];
    const r = await scanStoreForStart(adminReturning(nodes), SHOP);

    expect(r.targets).toHaveLength(START_TARGETS);
    const combined = r.targets.map((t) => t.scoreBefore);
    expect(combined).toEqual([...combined].sort((a, b) => a - b));
    // The strongest product is not offered as something to fix.
    expect(r.targets.map((t) => t.productId)).not.toContain("gid://shopify/Product/1");
  });

  it("never offers more than three — that is the free-credit ceiling", async () => {
    const many = Array.from({ length: 12 }, (_, i) => node(i + 1));
    const r = await scanStoreForStart(adminReturning(many), SHOP);
    expect(r.targets).toHaveLength(3);
    expect(START_TARGETS).toBe(3);
  });

  it("offers fewer than three when the store has fewer than three", async () => {
    const r = await scanStoreForStart(adminReturning([node(1), node(2)]), SHOP);
    expect(r.targets).toHaveLength(2);
  });

  it("breaks a tie toward the emptiest description — the most convincing fix", () => {
    const a = { description: "some words here", scores: { combined: 40 } };
    const b = { description: "", scores: { combined: 40 } };
    expect(pickWeakest([a, b], 1)[0]).toBe(b);
  });

  it("carries the before-state each card needs", async () => {
    const r = await scanStoreForStart(adminReturning([node(7, { description: "Old copy." })]), SHOP);
    const t = r.targets[0];
    expect(t.productId).toBe("gid://shopify/Product/7");
    expect(t.numericId).toBe("7");
    expect(t.title).toBe("P7");
    expect(t.beforeSnippet).toBe("Old copy.");
    expect(typeof t.scoreBefore).toBe("number");
  });

  it("strips markup out of the before snippet", async () => {
    const r = await scanStoreForStart(
      adminReturning([node(8, { description: "<p>Hello <b>there</b></p>" })]),
      SHOP,
    );
    expect(r.targets[0].beforeSnippet).toBe("Hello there");
    expect(r.targets[0].beforeSnippet).not.toMatch(/</);
  });
});

describe("the scan is cached, so a refresh does not re-scan", () => {
  it("goes through the cache under a per-shop key", async () => {
    await scanStoreForStart(adminReturning([node(1)]), SHOP);
    expect(getCache).toHaveBeenCalledTimes(1);
    expect(getCache.mock.calls[0][0]).toBe(`startscan:${SHOP}`);
  });

  it("skipCache bypasses it, for the retry button", async () => {
    await scanStoreForStart(adminReturning([node(1)]), SHOP, { skipCache: true });
    expect(getCache).not.toHaveBeenCalled();
  });
});

describe("scoreProduct", () => {
  it("combines the two rubrics and returns all three numbers", () => {
    const s = scoreProduct(toScorable(node(1, { description: "x".repeat(400) })));
    expect(s).toHaveProperty("seo");
    expect(s).toHaveProperty("geo");
    expect(s.combined).toBe(Math.round((s.seo + s.geo) / 2));
  });

  it("is total — a product with nothing in it still scores a number", () => {
    const s = scoreProduct(toScorable(node(1)));
    expect(Number.isFinite(s.combined)).toBe(true);
    expect(s.combined).toBeGreaterThanOrEqual(0);
  });
});

describe("the Start screen itself — structural guarantees", () => {
  const src = readFileSync("app/components/StartState.jsx", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  it("asks the merchant nothing before showing them something", () => {
    // The retired /app/setup asked five questions first. There is no form here.
    expect(code).not.toMatch(/<TextField|<Form\b|<Select\b|<Checkbox/);
  });

  it("calls the allowance FREE only on the free plan", () => {
    // Caught on a real Pro store while capturing listing screenshots: the copy
    // read "1000 remaining free generations" to a merchant who is paying for
    // them. Telling somebody the thing they bought is free is not a rounding
    // error in trust.
    expect(code).toMatch(/start\.planName === "free" \? "free generations" : "generations"/);
    expect(code).not.toMatch(/remaining free generations/);
  });

  it("says what it will spend, in the same breath as what is left", () => {
    // Auto-spending credits without saying so would be indefensible. This is
    // the sentence that makes it defensible, so it is pinned.
    expect(code).toMatch(/free generations/);
    expect(code).toMatch(/remaining/);
    expect(code).toMatch(/Nothing is published until you approve it/);
  });

  it("starts no more generations than the quota can pay for", () => {
    expect(code).toMatch(/Math\.min\(targets\.length, start\.remaining\)/);
  });

  it("fires each product exactly once, from a ref rather than state", () => {
    // A re-render must not be able to start a second paid request.
    expect(code).toMatch(/fired\s*=\s*useRef\(false\)/);
    expect(code).toMatch(/fired\.current\s*=\s*true/);
  });

  it("has a watchdog, so a hung generation becomes a retry and not a spinner", () => {
    expect(code).toMatch(/WATCHDOG_MS/);
    expect(code).toMatch(/setTimedOut\(true\)/);
    expect(code).toMatch(/Retry/);
  });

  it("tells the truth when a generation fails: the credit is intact", () => {
    expect(code).toMatch(/no generation was used/);
  });

  it("shows an empty store an empty state rather than a score of zero", () => {
    expect(code).toMatch(/scan\?\.empty/);
    expect(code).toMatch(/<EmptyState/);
  });

  it("offers a retry rather than a fabricated score when the scan fails", () => {
    expect(code).toMatch(/scan\?\.error/);
    expect(code).toMatch(/ScanFailed/);
  });

  it("uses no urgency or countdown language", () => {
    expect(code).not.toMatch(/hurry|limited time|only \d+ left|offer ends|act now/i);
  });

  it("sends the merchant to Review to approve — it never publishes for them", () => {
    expect(code).toMatch(/\/app\/review/);
    expect(code).not.toMatch(/publish\w*\s*:\s*true|autoPublish/);
  });
});
