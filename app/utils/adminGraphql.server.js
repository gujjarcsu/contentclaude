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
