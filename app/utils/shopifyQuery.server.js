/**
 * Phase 4 item 6 — one way to read from Shopify, for large catalogues.
 *
 * A Shopify GraphQL response can fail in three ways and **all of them return
 * HTTP 200**:
 *
 *   1. `errors` at the TOP LEVEL, a sibling of `data` — throttling, a removed
 *      field, an access problem. `data` is then null.
 *   2. `userErrors` inside the payload — a rejected write.
 *   3. an actual transport failure.
 *
 * `app.products.jsx` read `gqlData.data.products` directly. On a THROTTLED
 * response `data` is null, so that line threw a TypeError and the Products page
 * returned 500 — for a merchant whose only crime was having a big enough
 * catalogue to get throttled. That is the exact shape of the bug Phase 0 item 9
 * fixed in the publish path, still living in the read path.
 *
 * Shopify's cost model makes this a LARGE-CATALOGUE bug specifically: the
 * bucket refills at a fixed rate, so a shop with 200 products never sees it and
 * a shop with 5,000 sees it constantly. It fails for exactly the merchants
 * worth having.
 *
 * So every `products(first: …)` read goes through here. It retries a throttle
 * with exponential backoff, honours `Retry-After` on a 429, and — when it
 * finally gives up — returns a RESULT rather than throwing, so a caller can
 * show the merchant a partial catalogue and say so instead of a 500 page.
 */
import logger from "./logger.server.js";

export const QUERY_MAX_RETRIES = 3;
export const QUERY_BACKOFF_BASE_MS = 1_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Does this response carry Shopify's throttle signal? Pure. */
export function isThrottled(json, status) {
  if (status === 429) return true;
  return (
    Array.isArray(json?.errors) &&
    json.errors.some((e) => e?.extensions?.code === "THROTTLED" || /throttl/i.test(String(e?.message ?? "")))
  );
}

/** Top-level GraphQL errors that are NOT throttling. Pure. */
export function fatalErrors(json) {
  if (!Array.isArray(json?.errors)) return [];
  return json.errors.filter(
    (e) => e?.extensions?.code !== "THROTTLED" && !/throttl/i.test(String(e?.message ?? "")),
  );
}

/**
 * Run a GraphQL read, backing off on throttling. Never throws.
 *
 * @param {(q: string, o?: object) => Promise<{status?: number, headers?: any, json: () => Promise<any>}>} graphql
 * @param {string} query
 * @param {object} [variables]
 * @param {{shop?: string, label?: string, maxRetries?: number}} [opts]
 * @returns {Promise<{ok: boolean, data: any, throttled: boolean, error: string|null, attempts: number}>}
 */
export async function shopifyQuery(graphql, query, variables = {}, opts = {}) {
  const { shop = null, label = "query", maxRetries = QUERY_MAX_RETRIES } = opts;

  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await graphql(query, { variables });
    } catch (err) {
      if (attempt < maxRetries) {
        await sleep(QUERY_BACKOFF_BASE_MS * 2 ** attempt);
        continue;
      }
      logger.warn({ shop, label, err: err?.message }, "Shopify read failed after retries");
      return {
        ok: false,
        data: null,
        throttled: false,
        reason: "transport",
        error: err?.message ?? "request failed",
        attempts: attempt + 1,
      };
    }

    let json;
    try {
      json = await res.json();
    } catch {
      if (attempt < maxRetries) {
        await sleep(QUERY_BACKOFF_BASE_MS * 2 ** attempt);
        continue;
      }
      return {
        ok: false,
        data: null,
        throttled: false,
        reason: "no_data",
        error: `invalid response (HTTP ${res.status})`,
        attempts: attempt + 1,
      };
    }

    if (isThrottled(json, res.status)) {
      if (attempt < maxRetries) {
        // Shopify tells us how long to wait on a 429; on a THROTTLED extension
        // it does not, so back off exponentially.
        const retryAfter = parseInt(res.headers?.get?.("Retry-After") || "0", 10);
        const wait = retryAfter > 0 ? retryAfter * 1000 : QUERY_BACKOFF_BASE_MS * 2 ** (attempt + 1);
        logger.info({ shop, label, attempt, waitMs: wait }, "Shopify throttled this read - backing off");
        await sleep(wait);
        continue;
      }
      logger.warn({ shop, label, attempts: attempt + 1 }, "Shopify still throttling after retries");
      return {
        ok: false,
        data: null,
        throttled: true,
        reason: "throttled",
        error: "Shopify is rate-limiting this store right now.",
        attempts: attempt + 1,
      };
    }

    const fatal = fatalErrors(json);
    if (fatal.length > 0) {
      const message = fatal.map((e) => e.message).join("; ");
      logger.warn({ shop, label, err: message }, "Shopify read returned errors");
      return {
        ok: false,
        data: null,
        throttled: false,
        reason: "errors",
        error: message,
        attempts: attempt + 1,
      };
    }

    if (!json?.data) {
      return {
        ok: false,
        data: null,
        throttled: false,
        reason: "no_data",
        error: "Shopify returned no data.",
        attempts: attempt + 1,
      };
    }

    return { ok: true, data: json.data, throttled: false, reason: null, error: null, attempts: attempt + 1 };
  }
}

/**
 * Pull one page of products out of a `shopifyQuery` result. Pure.
 *
 * Returns empty edges rather than throwing when the read failed, so a caller
 * can render a partial catalogue with an honest banner. `ok: false` is the
 * caller's cue that what they have is incomplete.
 */
export function productsPage(result) {
  if (!result?.ok || !result.data?.products) {
    return {
      ok: false,
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      throttled: !!result?.throttled,
      // Why it failed, so a caller can say something specific. A throttle, a
      // malformed response and a dead connection all need different words.
      reason: result?.reason ?? "no_data",
      error: result?.error ?? "no products in the response",
    };
  }
  const { edges = [], pageInfo = { hasNextPage: false, endCursor: null } } = result.data.products;
  return { ok: true, edges, pageInfo, throttled: false, reason: null, error: null };
}
