/**
 * Group 1 — the candidate primitive, server side.
 *
 * The pure rules live in `candidates.js` so a Polaris component can import
 * them; this file is the part that talks to Shopify and Prisma, and it
 * re-exports the pure module so a caller never has to import both.
 *
 * ── What every consumer gets, and why it is a bundle ───────────────────────
 *
 * `getCandidateCounts` returns the total AND the candidate count in one object,
 * because Group 1.5 is right: "Total Products 3,148 — In your Shopify catalog"
 * is a TRUE statement and must keep its meaning. Replacing it with the candidate
 * count would break a true sentence while leaving the bug — the app would then
 * under-report the catalogue instead of over-reporting the work. Both numbers,
 * each labelled, is the only version that is honest in both directions.
 *
 * ── Cost ───────────────────────────────────────────────────────────────────
 *
 * Two `productsCount` calls instead of one, in a single GraphQL document, so it
 * is one HTTP round trip and one bucket charge of ~2 points more than before.
 * Cached per shop per scope. A count query does not page and does not scale with
 * catalogue size, which is the entire reason for using it rather than
 * enumerating.
 */
import logger from "./logger.server.js";
import prisma from "../db.server.js";
import { getCache } from "./cache.server.js";
import { shopifyQuery } from "./shopifyQuery.server.js";
import {
  DEFAULT_SCOPE,
  normaliseScope,
  scopeQueryFor,
  scopeLabelFor,
  collectionScopeQueryFor,
  collectionScopeLabelFor,
  readCount,
  formatCount,
  isCandidate,
  actionFor,
  hasRealContent,
  notOptimizedFrom,
  splitByQuota,
  CONTENT_ACTION,
  CONTENT_ACTION_LABEL,
  CONTENT_ACTION_TONE,
  PRODUCT_STATUS,
} from "./candidates.js";

// Re-exported so no consumer needs to import both modules and pick the right
// one — picking wrong is how a shared rule ends up reimplemented by hand.
export {
  DEFAULT_SCOPE,
  normaliseScope,
  scopeQueryFor,
  scopeLabelFor,
  collectionScopeQueryFor,
  collectionScopeLabelFor,
  readCount,
  formatCount,
  isCandidate,
  actionFor,
  hasRealContent,
  notOptimizedFrom,
  splitByQuota,
  CONTENT_ACTION,
  CONTENT_ACTION_LABEL,
  CONTENT_ACTION_TONE,
  PRODUCT_STATUS,
};

/** Counts change when a merchant edits products; five minutes is plenty. */
export const CANDIDATE_TTL_S = 300;

/**
 * The shop's chosen scope. Never throws — a settings read failing must not take
 * a page down, and the DEFAULT is the safe direction (fewer products touched).
 *
 * @param {string} shop
 */
export async function scopeForShop(shop) {
  try {
    const bv = await prisma.brandVoice.findUnique({
      where: { shop },
      select: { includeDraftProducts: true },
    });
    return normaliseScope({ includeDrafts: bv?.includeDraftProducts === true });
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "candidate scope read failed — using defaults");
    return normaliseScope(undefined);
  }
}

/**
 * `productsCount` twice in one document: the whole catalogue, and the candidates.
 *
 * Both read `precision` as well as `count`. Shopify returns `AT_LEAST` when it
 * imposed a limit and reached it, which means the number is a FLOOR — on a
 * catalogue past that ceiling the old code was showing a capped value as an
 * exact total.
 */
const COUNTS_QUERY = `query candidateCounts($scoped: String) {
  total: productsCount { count precision }
  candidates: productsCount(query: $scoped) { count precision }
}`;

/** The same for collections, which have publication but no status. */
const COLLECTION_COUNTS_QUERY = `query collectionCandidateCounts($scoped: String) {
  total: collectionsCount { count precision }
  candidates: collectionsCount(query: $scoped) { count precision }
}`;

/**
 * How many products exist, and how many this app may touch.
 *
 * Never throws. On failure both counts are `null` rather than 0 — the same rule
 * as the 4.3 store-score baseline: zero is a claim ("you have no products") and
 * "we could not read it" is a different claim. A surface that receives null says
 * so; a surface that receives 0 lies confidently.
 *
 * @returns {Promise<{
 *   total: {count:number, exact:boolean}|null,
 *   candidates: {count:number, exact:boolean}|null,
 *   excluded: number|null,
 *   scope: object, label: string, query: string, ok: boolean, throttled: boolean
 * }>}
 */
export async function getCandidateCounts(admin, shop, { scope: given = null, ttlSeconds = CANDIDATE_TTL_S } = {}) {
  const scope = given ? normaliseScope(given) : await scopeForShop(shop);
  const scoped = scopeQueryFor(scope);
  const label = scopeLabelFor(scope);

  const empty = (extra) => ({
    total: null,
    candidates: null,
    excluded: null,
    scope,
    label,
    query: scoped,
    ok: false,
    throttled: false,
    ...extra,
  });

  try {
    return await getCache(
      `candidateCounts:${shop}:${scoped}`,
      async () => {
        const r = await shopifyQuery(
          admin.graphql,
          COUNTS_QUERY,
          // `null`, not "": an empty string is a search term Shopify has to
          // parse, while null is the absence of a filter. The scope that
          // excludes nothing produces "", and must mean "no query argument".
          { scoped: scoped || null },
          { shop, label: "candidate counts" },
        );
        // Throwing rather than returning: `getCache` stores whatever the
        // supplier RETURNS, so returning a failure here would cache a transient
        // throttle for five minutes and turn a rate limit into an outage.
        if (!r.ok) throw Object.assign(new Error(r.error ?? "counts unavailable"), { throttled: !!r.throttled });

        const total = readCount(r.data?.total);
        const candidates = readCount(r.data?.candidates);
        return {
          total,
          candidates,
          // Only meaningful when BOTH are exact: subtracting a floor from a
          // floor produces a number that means nothing.
          excluded: total?.exact && candidates?.exact ? Math.max(0, total.count - candidates.count) : null,
          scope,
          label,
          query: scoped,
          ok: !!total && !!candidates,
          throttled: false,
        };
      },
      ttlSeconds,
    );
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "candidate counts failed (non-fatal)");
    return empty({ throttled: !!err?.throttled });
  }
}

/** The collection equivalent. Same contract, same honesty about failure. */
export async function getCollectionCandidateCounts(
  admin,
  shop,
  { scope: given = null, ttlSeconds = CANDIDATE_TTL_S } = {},
) {
  const scope = given ? normaliseScope(given) : await scopeForShop(shop);
  const scoped = collectionScopeQueryFor(scope);
  const label = collectionScopeLabelFor(scope);

  try {
    return await getCache(
      `collectionCandidateCounts:${shop}:${scoped}`,
      async () => {
        const r = await shopifyQuery(
          admin.graphql,
          COLLECTION_COUNTS_QUERY,
          { scoped: scoped || null },
          { shop, label: "collection candidate counts" },
        );
        if (!r.ok) throw Object.assign(new Error(r.error ?? "counts unavailable"), { throttled: !!r.throttled });
        const total = readCount(r.data?.total);
        const candidates = readCount(r.data?.candidates);
        return {
          total,
          candidates,
          excluded: total?.exact && candidates?.exact ? Math.max(0, total.count - candidates.count) : null,
          scope,
          label,
          ok: !!total && !!candidates,
          throttled: false,
        };
      },
      ttlSeconds,
    );
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "collection candidate counts failed (non-fatal)");
    return { total: null, candidates: null, excluded: null, scope, label, ok: false, throttled: !!err?.throttled };
  }
}

/**
 * Split a page of products we already hold into the three content actions.
 *
 * This is what replaces the red "Needs content" badge that appeared on every row
 * of a store where every product had a description. It takes the rows and the
 * map of what WE hold, and never guesses: a product absent from `ourContent` has
 * no content from us, which is a fact, and whether the merchant wrote something
 * is read from the product itself, which is also a fact.
 *
 * @param {Array<{id:string, description?:string, descriptionHtml?:string}>} products
 * @param {Map<string, unknown>|Set<string>} ourContent  ids we hold content for
 */
export function classifyProducts(products, ourContent) {
  const has = (id) => (ourContent instanceof Set ? ourContent.has(id) : !!ourContent?.has?.(id));
  const out = new Map();
  const tally = { [CONTENT_ACTION.GENERATE]: 0, [CONTENT_ACTION.ENHANCE]: 0, [CONTENT_ACTION.OPTIMIZED]: 0 };
  for (const p of products ?? []) {
    const action = actionFor({
      hasOwnContent: hasRealContent(p?.descriptionHtml ?? p?.description),
      hasOurContent: has(p?.id),
    });
    out.set(p?.id, action);
    tally[action] += 1;
  }
  return { actions: out, tally };
}
