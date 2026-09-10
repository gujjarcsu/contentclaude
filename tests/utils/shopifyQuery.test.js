/**
 * Phase 4 item 6 — reading from Shopify on a large catalogue.
 *
 * A Shopify GraphQL response can fail three ways and all of them return HTTP
 * 200. `app.products.jsx` read `gqlData.data.products` directly, so a THROTTLED
 * response — where `data` is null — threw a TypeError and 500ed the Products
 * page. Shopify's leaky bucket refills at a fixed rate, so a 200-product shop
 * never sees it and a 5,000-product shop sees it constantly: it failed for
 * exactly the merchants worth having.
 *
 * Fake timers throughout, so the backoff is exercised without waiting for it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../app/utils/logger.server.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { shopifyQuery, productsPage, isThrottled, fatalErrors, QUERY_MAX_RETRIES } =
  await import("../../app/utils/shopifyQuery.server.js");

const res = (body, { status = 200, retryAfter = null } = {}) => ({
  status,
  headers: { get: (h) => (h === "Retry-After" ? retryAfter : null) },
  json: async () => body,
});

const THROTTLED = { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] };
const PAGE = {
  data: {
    products: {
      edges: [{ node: { id: "gid://shopify/Product/1" } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function run(graphql, opts) {
  const p = shopifyQuery(graphql, "query {}", {}, opts);
  await vi.runAllTimersAsync();
  return p;
}

describe("recognising a throttle", () => {
  it("sees the THROTTLED extension code", () => {
    expect(isThrottled(THROTTLED, 200)).toBe(true);
  });

  it("sees a 429 even with no body to read", () => {
    expect(isThrottled({}, 429)).toBe(true);
  });

  it("sees a throttle message without the extension code", () => {
    expect(isThrottled({ errors: [{ message: "Throttled by Shopify" }] }, 200)).toBe(true);
  });

  it("does not mistake an ordinary error for a throttle", () => {
    expect(isThrottled({ errors: [{ message: "Field 'foo' doesn't exist" }] }, 200)).toBe(false);
    expect(fatalErrors({ errors: [{ message: "Field 'foo' doesn't exist" }] })).toHaveLength(1);
    // ...and a throttle is not counted as a fatal error either.
    expect(fatalErrors(THROTTLED)).toHaveLength(0);
  });
});

describe("backing off", () => {
  it("retries a throttle and succeeds when Shopify recovers", async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(res(THROTTLED))
      .mockResolvedValueOnce(res(THROTTLED))
      .mockResolvedValueOnce(res(PAGE));

    const r = await run(graphql);

    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
    expect(graphql).toHaveBeenCalledTimes(3);
  });

  it("gives up as a RESULT, never a throw — a 500 page is not an answer", async () => {
    const graphql = vi.fn(async () => res(THROTTLED));
    const r = await run(graphql);

    expect(r.ok).toBe(false);
    expect(r.throttled).toBe(true);
    expect(r.reason).toBe("throttled");
    expect(graphql).toHaveBeenCalledTimes(QUERY_MAX_RETRIES + 1);
  });

  it("honours Retry-After on a 429", async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(res({}, { status: 429, retryAfter: "3" }))
      .mockResolvedValueOnce(res(PAGE));
    const r = await run(graphql);
    expect(r.ok).toBe(true);
  });

  it("retries a transport failure too", async () => {
    const graphql = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce(res(PAGE));
    const r = await run(graphql);
    expect(r.ok).toBe(true);
  });

  it("does NOT retry an ordinary GraphQL error — retrying will not fix a bad field", async () => {
    const graphql = vi.fn(async () => res({ errors: [{ message: "Field 'nope' doesn't exist" }] }));
    const r = await run(graphql);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("errors");
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("maxRetries: 0 means one attempt, for tests and for callers that cannot wait", async () => {
    const graphql = vi.fn(async () => res(THROTTLED));
    const r = await run(graphql, { maxRetries: 0 });
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
  });
});

describe("productsPage — the line that used to throw", () => {
  it("returns a usable page on success", () => {
    const p = productsPage({ ok: true, data: PAGE.data });
    expect(p.ok).toBe(true);
    expect(p.edges).toHaveLength(1);
  });

  it.each([
    ["a throttled result", { ok: false, throttled: true, reason: "throttled" }],
    ["null data", { ok: true, data: null }],
    ["data with no products", { ok: true, data: {} }],
    ["nothing at all", null],
    ["undefined", undefined],
  ])("returns empty edges rather than throwing for %s", (_label, result) => {
    // `const { edges } = gqlData.data.products` is what 500ed the page. Every
    // one of these inputs used to be a TypeError.
    expect(() => productsPage(result)).not.toThrow();
    const p = productsPage(result);
    expect(p.ok).toBe(false);
    expect(p.edges).toEqual([]);
    expect(p.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it("says WHY, so the caller can use the right words", () => {
    expect(productsPage({ ok: false, throttled: true, reason: "throttled" }).reason).toBe("throttled");
    expect(productsPage({ ok: false, reason: "transport" }).reason).toBe("transport");
    expect(productsPage({ ok: true, data: {} }).reason).toBe("no_data");
  });
});

describe("the crash sites are gone", () => {
  it("no route reads .data.products or .data.productsCount without a guard", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    let swept = 0;
    for (const name of readdirSync("app/routes")) {
      if (!/\.jsx$/.test(name)) continue;
      swept += 1;
      const src = readFileSync(`app/routes/${name}`, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      // `foo.data.products` / `foo.data.productsCount` with a plain dot after
      // `data` is the unguarded form; `data?.products` is fine.
      expect(src, `app/routes/${name} dereferences .data.products unguarded`).not.toMatch(
        /\w\.data\.products\b/,
      );
      expect(src, `app/routes/${name} dereferences .data.productsCount unguarded`).not.toMatch(
        /\w\.data\.productsCount\b/,
      );
    }
    expect(swept, "no route files were swept").toBeGreaterThan(10);
  });
});
