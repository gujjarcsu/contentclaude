/**
 * A2.3 / A2.4 — what we can PROVE at 50,000 and 500,000 products.
 *
 * Two screens each had their own copy of the catalogue walk and they had
 * drifted: `app.products.jsx` went through `shopifyQuery` and backed off on a
 * throttle (Phase 4 item 6); `app.optimize.jsx` used raw `admin.graphql` and did
 * not. The same fix was applied to one and missed on the other.
 *
 * Both stopped at 80 pages — 20,000 products — **and said nothing**. On a
 * 50,000-product catalogue "Optimize store" enqueued at most 20,000 and reported
 * success. A cap presented as a total (L5), on the one action that spends money.
 *
 * ── What these print if the thing they watch is broken ────────────────────
 *
 * Make `enumerateProductIds` return `truncated: false` unconditionally and the
 * three size cases fail, each naming the count it actually walked. Remove the
 * page cap and "cursor exhaustion is bounded" hangs rather than passing, which
 * is why that case asserts a REQUEST COUNT and not just a result.
 *
 * ── What these CANNOT prove ───────────────────────────────────────────────
 *
 * That Shopify behaves this way. Every response here is a fake. This proves our
 * loop is bounded, reports why it stopped, and does not accumulate without
 * limit — not that a real 500,000-product store returns cursors the way the fake
 * does. Only a real catalogue of that size proves that, and we do not have one:
 * the largest real catalogue this code has met is 3,148 products.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// The REAL shopifyQuery with its retry budget set to 0.
//
// Its backoff sleeps for real — 1s + 2s + 4s — which is longer than vitest's
// 5s timeout, so the throttle cases below timed out rather than failing. Faking
// the module entirely would test the fake; this keeps every line of the real
// logic (error shape, THROTTLED detection, productsPage) and only removes the
// waiting. The backoff timing itself has its own fake-timer tests in
// tests/utils/shopifyQuery.test.js.
vi.mock("../../app/utils/shopifyQuery.server.js", async () => {
  const actual = await vi.importActual("../../app/utils/shopifyQuery.server.js");
  return {
    ...actual,
    shopifyQuery: (graphql, query, variables, opts = {}) =>
      actual.shopifyQuery(graphql, query, variables, { ...opts, maxRetries: 0 }),
  };
});

const { enumerateProductIds, ENUM_PAGE_SIZE, ENUM_MAX_PAGES, ENUM_STOP, describeStop } = await import(
  "../../app/utils/enumerateProducts.server.js"
);

/**
 * A fake Shopify that owns `total` products and pages through them honestly.
 * Counts its own calls, so a test can assert requests rather than trusting the
 * result object.
 */
function fakeShopify(total, { throttleAtPage = null } = {}) {
  const state = { calls: 0 };
  const graphql = async (_q, { variables }) => {
    state.calls += 1;
    if (throttleAtPage && state.calls >= throttleAtPage) {
      return {
        json: async () => ({
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
          data: null,
        }),
      };
    }
    const start = variables.cursor ? Number(variables.cursor) : 0;
    const end = Math.min(start + ENUM_PAGE_SIZE, total);
    return {
      json: async () => ({
        data: {
          products: {
            pageInfo: { hasNextPage: end < total, endCursor: String(end) },
            edges: Array.from({ length: end - start }, (_, i) => ({
              node: { id: `gid://shopify/Product/${start + i}`, description: "x" },
            })),
          },
        },
      }),
    };
  };
  return { graphql, state };
}

beforeEach(() => vi.clearAllMocks());

describe("catalogue sizes we can walk completely", () => {
  it.each([
    ["0 products", 0, 0],
    ["1 product", 1, 1],
    ["250 — exactly one page", 250, 250],
    ["3,000 — the largest real catalogue this code has met", 3000, 3000],
    ["20,000 — exactly the page cap", ENUM_PAGE_SIZE * ENUM_MAX_PAGES, 20000],
  ])("%s: walks all of them and reports nothing cut short", async (_n, total, expected) => {
    const { graphql } = fakeShopify(total);
    const r = await enumerateProductIds(graphql, { shop: "s.myshopify.com" });

    expect(r.ids).toHaveLength(expected);
    expect(r.stop).toBe(ENUM_STOP.COMPLETE);
    expect(r.truncated).toBe(false);
    // A message that always appears is one nobody reads.
    expect(r.message).toBeNull();
  });
});

describe("catalogue sizes we CANNOT walk completely — and say so", () => {
  it.each([
    ["50,000", 50_000],
    ["500,000", 500_000],
  ])("%s products: stops at the cap and tells the merchant", async (_n, total) => {
    const { graphql, state } = fakeShopify(total);
    const r = await enumerateProductIds(graphql, { shop: "s.myshopify.com" });

    // The measured facts.
    expect(r.ids).toHaveLength(ENUM_PAGE_SIZE * ENUM_MAX_PAGES); // 20,000
    expect(r.pages).toBe(ENUM_MAX_PAGES); // 80
    expect(state.calls).toBe(ENUM_MAX_PAGES); // 80 requests, not 200 or 2,000
    expect(r.stop).toBe(ENUM_STOP.PAGE_CAP);

    // The part that was missing entirely: the merchant is told.
    expect(r.truncated).toBe(true);
    expect(r.message).toMatch(/20000 most recently updated/);
    expect(r.message).toMatch(/run it again/i);
  });

  it("the request count does not grow with the catalogue", async () => {
    // 50,000 and 500,000 cost the SAME number of requests. If this ever fails,
    // a large store is paying for a walk it cannot finish.
    const a = fakeShopify(50_000);
    const b = fakeShopify(500_000);
    await enumerateProductIds(a.graphql, { shop: "s" });
    await enumerateProductIds(b.graphql, { shop: "s" });
    expect(a.state.calls).toBe(b.state.calls);
  });
});

describe("cursor exhaustion", () => {
  it("a connection that never says hasNextPage:false is still bounded", async () => {
    // The failure mode that hangs a loader forever. Asserting the REQUEST COUNT
    // rather than the result is deliberate: with no cap this test would not
    // fail, it would never finish.
    let calls = 0;
    const graphql = async () => {
      calls += 1;
      return {
        json: async () => ({
          data: {
            products: {
              pageInfo: { hasNextPage: true, endCursor: `c${calls}` },
              edges: [{ node: { id: `gid://shopify/Product/${calls}`, description: "x" } }],
            },
          },
        }),
      };
    };
    const r = await enumerateProductIds(graphql, { shop: "s" });
    expect(calls).toBe(ENUM_MAX_PAGES);
    expect(r.truncated).toBe(true);
    expect(r.stop).toBe(ENUM_STOP.PAGE_CAP);
  });
});

describe("THROTTLED mid-run", () => {
  it("keeps what it read and says why it stopped, instead of reporting success", async () => {
    // This is the defect on Optimize: raw admin.graphql, so the first throttle
    // silently truncated the run and the merchant was told it worked.
    const { graphql } = fakeShopify(50_000, { throttleAtPage: 6 });
    const r = await enumerateProductIds(graphql, { shop: "s" });

    expect(r.ids.length).toBe(ENUM_PAGE_SIZE * 5); // the five pages that landed
    expect(r.stop).toBe(ENUM_STOP.THROTTLED);
    expect(r.throttled).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.message).toMatch(/rate-limiting/i);
    expect(r.message).toMatch(/1250 products/);
  });

  it("a throttle on the very first page returns nothing, and says so", async () => {
    const { graphql } = fakeShopify(50_000, { throttleAtPage: 1 });
    const r = await enumerateProductIds(graphql, { shop: "s" });
    expect(r.ids).toHaveLength(0);
    expect(r.truncated).toBe(true);
    expect(r.message).toBeTruthy();
  });
});

describe("memory", () => {
  it("holds ids, not product bodies, so 20,000 products is bounded", async () => {
    // The worker OOM risk is accumulating whole nodes across 80 pages. Measured
    // rather than asserted: the id array for a full cap must stay small.
    const { graphql } = fakeShopify(500_000);
    const r = await enumerateProductIds(graphql, { shop: "s" });

    const bytes = r.ids.reduce((n, id) => n + id.length * 2, 0);
    // 20,000 gids at ~30 chars is roughly 1.2 MB of string data.
    expect(r.ids).toHaveLength(20_000);
    expect(bytes).toBeLessThan(4_000_000);
  });
});

describe("the message itself", () => {
  it("says nothing when nothing was cut short", () => {
    expect(describeStop(ENUM_STOP.COMPLETE, 500)).toBeNull();
  });

  it("never blames the merchant and always says what to do", () => {
    for (const stop of [ENUM_STOP.PAGE_CAP, ENUM_STOP.THROTTLED, ENUM_STOP.ERROR]) {
      const m = describeStop(stop, 20000);
      expect(m).toBeTruthy();
      expect(m).not.toMatch(/error|failed|invalid/i);
    }
    expect(describeStop(ENUM_STOP.PAGE_CAP, 20000)).toMatch(/run it again/i);
  });
});
