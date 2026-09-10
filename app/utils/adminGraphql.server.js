// Shared result-checking for Admin API mutations.
//
// A Shopify GraphQL mutation can fail three distinct ways, and ALL of them
// come back as HTTP 200:
//   1. top-level `errors` (removed/renamed field, syntax, throttling) — with
//      `data` null or missing the payload entirely
//   2. the payload's user-error list (`userErrors`, `mediaUserErrors`, ...)
//   3. an unparseable/empty body
// Checking only the payload's userErrors treats case 1 as SUCCESS, because
// `data?.mutation?.userErrors ?? []` is `[]` when data is null. That exact
// pattern shipped a dead mutation (`productImageUpdate`) that reported
// success on every call. Every mutation call site must go through this (or
// replicate all three checks explicitly, e.g. where retry logic needs the
// raw response).

/**
 * Parse an `admin.graphql()` Response and surface every failure mode.
 *
 * @param {Response} response - the fetch Response from admin.graphql()
 * @param {string} payloadKey - the mutation field name, e.g. "productUpdate"
 * @param {object} [opts]
 * @param {string[]} [opts.userErrorKeys] - payload keys holding user errors
 * @returns {Promise<{ok: boolean, payload: object|null, userErrors: object[], topLevelErrors: object[], errorMessages: string[]}>}
 */
import { verifyProductUpdate } from "./publishVerify.js";
export async function readMutationResult(response, payloadKey, { userErrorKeys = ["userErrors"] } = {}) {
  let json;
  try {
    json = await response.json();
  } catch {
    return {
      ok: false,
      payload: null,
      userErrors: [],
      topLevelErrors: [],
      errorMessages: [`Shopify returned an invalid response (HTTP ${response.status}).`],
    };
  }

  const topLevelErrors = Array.isArray(json?.errors) ? json.errors : [];
  const payload = json?.data?.[payloadKey] ?? null;
  const userErrors = userErrorKeys.flatMap((k) => (Array.isArray(payload?.[k]) ? payload[k] : []));

  const errorMessages = [
    ...topLevelErrors.map((e) => e.message ?? String(e)),
    ...userErrors.map((e) => {
      const field = Array.isArray(e.field) ? e.field.join(".") : e.field;
      return field ? `${field}: ${e.message}` : e.message;
    }),
  ];

  // No payload with no reported error still means the write did not happen
  // (e.g. data: {} from a partial outage) — never treat it as success.
  if (payload === null && errorMessages.length === 0) {
    errorMessages.push(`Shopify returned no ${payloadKey} result.`);
  }

  return {
    ok: payload !== null && errorMessages.length === 0,
    payload,
    userErrors,
    topLevelErrors,
    errorMessages,
  };
}

// productUpdate's `input` argument is deprecated in 2026-04 — use `product`
// with ProductUpdateInput (same field shape: id, descriptionHtml, seo).
// Phase 4 item 4.2 — ask for the fields we just wrote BACK in the same
// response. `productUpdate` returns the updated product anyway; this was
// requesting `product { id }` and discarding the rest, which is why a publish
// could only ever prove "Shopify accepted the request", never "the field now
// holds what we sent".
//
// Cost of the change: ZERO extra requests and zero extra round trips. Three
// more scalar fields on a response we were already receiving. The alternative —
// a second query per publish to read the product back — would double the API
// calls of a 5,000-product bulk run and turn a trust feature into a rate-limit
// incident.
export const PRODUCT_UPDATE_MUTATION = `mutation updateProduct($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product {
      id
      descriptionHtml
      seo { title description }
    }
    userErrors { field message }
  }
}`;

export const PUBLISH_MAX_RETRIES = 3;
export const PUBLISH_BACKOFF_BASE_MS = 2_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Publish a product update, honouring Retry-After on 429 and the GraphQL
 * THROTTLED extension code, with exponential backoff.
 *
 * Phase 0 item 9 — this is now the ONE publish path in the app. The bulk
 * processor carried its own copy that read `const { data } = await res.json()`
 * and then checked `data?.errors`. Top-level GraphQL errors are a SIBLING of
 * `data`, never a member of it, so `data.errors` was always undefined: a
 * THROTTLED response, a removed field or an access error was invisible.
 * `data.productUpdate` is null in that case, `?? []` makes userErrors empty,
 * nothing throws — so the row was saved "published", the credit consumed, and
 * Shopify never touched. The review screen already did this correctly; both
 * now share this function.
 *
 * @param {(query: string, opts?: {variables?: object}) => Promise<{status?: number, headers?: any, json: () => Promise<any>}>} graphql
 *   admin.graphql, or any caller with the same contract.
 * @returns {Promise<{productId: string, ok: boolean, error?: string, throttled?: boolean}>}
 *   Never throws — a failed publish is data, so the caller can keep the row a draft.
 */
export async function publishProductWithRetry(graphql, productId, input, attempt = 0) {
  let res;
  try {
    res = await graphql(PRODUCT_UPDATE_MUTATION, { variables: { product: input } });
  } catch (err) {
    if (attempt < PUBLISH_MAX_RETRIES) {
      await sleep(PUBLISH_BACKOFF_BASE_MS * 2 ** attempt);
      return publishProductWithRetry(graphql, productId, input, attempt + 1);
    }
    return { productId, ok: false, error: err.message };
  }

  if (res.status === 429 && attempt < PUBLISH_MAX_RETRIES) {
    const retryAfter = parseInt(res.headers?.get?.("Retry-After") || "2", 10);
    await sleep(Math.max(retryAfter * 1000, PUBLISH_BACKOFF_BASE_MS));
    return publishProductWithRetry(graphql, productId, input, attempt + 1);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    return { productId, ok: false, error: `Invalid response (HTTP ${res.status})` };
  }

  const throttled =
    Array.isArray(json?.errors) && json.errors.some((e) => e?.extensions?.code === "THROTTLED");
  if (throttled && attempt < PUBLISH_MAX_RETRIES) {
    await sleep(PUBLISH_BACKOFF_BASE_MS * 2 ** (attempt + 1));
    return publishProductWithRetry(graphql, productId, input, attempt + 1);
  }
  if (throttled) {
    return {
      productId,
      ok: false,
      throttled: true,
      error: "Shopify throttled this update — it stays a draft and can be retried.",
    };
  }

  // Non-throttle top-level errors (removed field, invalid id, access denied)
  // MUST fail the publish — with data null the userErrors check below sees []
  // and would otherwise report success for a write that never happened.
  if (Array.isArray(json?.errors) && json.errors.length > 0) {
    return { productId, ok: false, error: json.errors.map((e) => e.message).join("; ") };
  }

  const userErrors = json?.data?.productUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { productId, ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }
  if (!json?.data?.productUpdate) {
    return { productId, ok: false, error: "Shopify returned no result for this update." };
  }

  // Accepted. Now: did it actually land? Compared against the product Shopify
  // returned in THIS response — no second read. An unverified publish is still
  // `ok` (Shopify took it and it is live), but the caller records it
  // differently so the merchant is told to look.
  const verdict = verifyProductUpdate(input, json.data.productUpdate.product);
  return {
    productId,
    ok: true,
    verified: verdict.verified,
    verifyNote: verdict.note,
    mismatches: verdict.mismatches,
  };
}
