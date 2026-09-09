/**
 * Phase 0 item 9 — the one publish path.
 *
 * A Shopify GraphQL mutation can fail three ways and ALL of them return HTTP
 * 200. The bulk processor's own copy read `const { data } = await res.json()`
 * and then tested `data?.errors` — but top-level `errors` is a SIBLING of
 * `data`, never a member of it. So for a THROTTLED response, a removed field or
 * an access error: `data.errors` was undefined, `data.productUpdate` was null,
 * `?? []` made userErrors empty, nothing threw — and the row was saved
 * "published", the credit consumed, and Shopify never touched.
 *
 * These lock the shared helper both the worker and the review screen now use.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { publishProductWithRetry, PUBLISH_MAX_RETRIES } from "../../app/utils/adminGraphql.server.js";

const PID = "gid://shopify/Product/1";
const INPUT = { id: PID, descriptionHtml: "<p>new</p>" };

const res = (body, { status = 200, retryAfter = null } = {}) => ({
  status,
  headers: { get: (h) => (h === "Retry-After" ? retryAfter : null) },
  json: async () => body,
});

beforeEach(() => {
  vi.useFakeTimers();
});

/** Run the helper with fake timers so backoff sleeps do not really wait. */
async function run(graphql) {
  const p = publishProductWithRetry(graphql, PID, INPUT);
  await vi.runAllTimersAsync();
  return p;
}

describe("publishProductWithRetry", () => {
  it("reports success only when Shopify returned a productUpdate payload", async () => {
    const graphql = vi.fn(async () => res({ data: { productUpdate: { product: { id: PID }, userErrors: [] } } }));
    await expect(run(graphql)).resolves.toEqual({ productId: PID, ok: true });
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("does NOT report success for a top-level GraphQL error with data null (the bug)", async () => {
    const graphql = vi.fn(async () =>
      res({ data: null, errors: [{ message: "Field 'productUpdate' doesn't exist on type 'Mutation'" }] }),
    );
    const out = await run(graphql);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/doesn't exist/);
  });

  it("retries a THROTTLED response and gives up as a failure, never a success", async () => {
    const graphql = vi.fn(async () => res({ data: null, errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }));
    const out = await run(graphql);
    expect(out.ok).toBe(false);
    expect(out.throttled).toBe(true);
    expect(graphql).toHaveBeenCalledTimes(PUBLISH_MAX_RETRIES + 1);
  });

  it("retries a THROTTLED response and succeeds when Shopify recovers", async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(res({ data: null, errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }))
      .mockResolvedValueOnce(res({ data: { productUpdate: { product: { id: PID }, userErrors: [] } } }));
    await expect(run(graphql)).resolves.toEqual({ productId: PID, ok: true });
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("fails on userErrors", async () => {
    const graphql = vi.fn(async () =>
      res({ data: { productUpdate: { product: null, userErrors: [{ field: ["seo", "title"], message: "Title is too long" }] } } }),
    );
    const out = await run(graphql);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/too long/);
  });

  it("fails when the payload is missing entirely, with no error reported", async () => {
    const graphql = vi.fn(async () => res({ data: {} }));
    const out = await run(graphql);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no result/i);
  });

  it("honours Retry-After on 429 and then succeeds", async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(res({}, { status: 429, retryAfter: "1" }))
      .mockResolvedValueOnce(res({ data: { productUpdate: { product: { id: PID }, userErrors: [] } } }));
    await expect(run(graphql)).resolves.toEqual({ productId: PID, ok: true });
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("retries a thrown network error, then returns it as data rather than throwing", async () => {
    const graphql = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const out = await run(graphql);
    expect(out.ok).toBe(false);
    expect(out.error).toBe("socket hang up");
    expect(graphql).toHaveBeenCalledTimes(PUBLISH_MAX_RETRIES + 1);
  });

  it("treats an unparseable body as a failure", async () => {
    const graphql = vi.fn(async () => ({
      status: 502,
      headers: { get: () => null },
      json: async () => {
        throw new Error("not json");
      },
    }));
    const out = await run(graphql);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/HTTP 502/);
  });
});
