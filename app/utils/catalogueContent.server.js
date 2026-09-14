/**
 * Part B — the join, with I/O. The reasoning is in catalogueContent.js.
 *
 * ── Cost, and why the walk is the cheap direction ──────────────────────────
 *
 * Two ways to join our content record to the catalogue:
 *
 *   look OUR ids up in Shopify   `nodes(ids:)` costs ~1 point per node. A Pro
 *                                 store with 4,000 published products is 16
 *                                 calls of 250 points against a 1,000-point
 *                                 bucket. Not on a Home load.
 *   walk the catalogue for ids   `products(first: 250) { nodes { id } }` costs
 *                                 ~2 points a page. 5,000 products is 20 pages
 *                                 and ~40 points.
 *
 * So it walks — through `enumerateProductIds`, which already carries the
 * backoff, the page cap and the time budget, and REPORTS when it stopped early
 * rather than absorbing it. The bounds here are deliberately tighter than the
 * bulk-optimize walk: 20 pages and 4 s, because this runs inside a page loader.
 *
 * 20 pages is 5,000 products, which is the Growth product cap. Every plan below
 * Pro is complete by construction; a Pro store past 5,000 gets `ok: false` and
 * the screens fall back to the lifetime record with its honest wording, rather
 * than a joined number computed over part of the catalogue and presented as
 * whole. A partial join labelled as complete would be a new instance of the
 * exact defect this exists to remove.
 *
 * Cached ten minutes per shop and cleared on every publish — the same key
 * lifecycle as the store scan, through the same invalidator, so a merchant who
 * publishes and returns to Home sees the join move with the score.
 */
import logger from "./logger.server.js";
import { getCache } from "./cache.server.js";
import { enumerateProductIds } from "./enumerateProducts.server.js";
import { scopeForShop, scopeQueryFor } from "./candidates.server.js";
import { productStateRows } from "./metrics.server.js";
import { catalogueContentKey } from "./storeScanCache.server.js";
import { intersectContent } from "./catalogueContent.js";

export const CATALOGUE_CONTENT_TTL_S = 600;
/** Bounds for a walk that runs inside a page loader, not a bulk action. */
export const JOIN_MAX_PAGES = 20; // 5,000 products — the Growth cap
export const JOIN_BUDGET_MS = 4_000;

/**
 * Content counts restricted to the shop's candidate scope.
 *
 * @returns {Promise<{ok: boolean, truncated: boolean, scopeSize: number|null,
 *   published: number, draft: number, unverified: number, rejected: number,
 *   withContent: number, reason: string|null}>}
 *   `ok: false` means the numbers are NOT to be shown as catalogue counts;
 *   callers fall back to the lifetime record and say so.
 */
export async function contentInCatalogue(admin, shop) {
  const unavailable = (reason) => ({
    ok: false,
    truncated: false,
    scopeSize: null,
    published: 0,
    draft: 0,
    unverified: 0,
    rejected: 0,
    withContent: 0,
    reason,
  });
  if (!admin?.graphql || !shop) return unavailable("no admin client");

  try {
    return await getCache(
      catalogueContentKey(shop),
      async () => {
        const scope = await scopeForShop(shop);
        const query = scopeQueryFor(scope) || null;

        const [walk, rows] = await Promise.all([
          enumerateProductIds(admin.graphql, {
            shop,
            query,
            maxPages: JOIN_MAX_PAGES,
            budgetMs: JOIN_BUDGET_MS,
            label: "catalogue join",
          }),
          productStateRows(shop),
        ]);

        if (walk.truncated) {
          // Throwing rather than returning: getCache stores whatever the
          // supplier RETURNS, so returning a failure would cache "unavailable"
          // for ten minutes and turn a throttle into a ten-minute outage of the
          // joined numbers. Same reasoning as getCandidateCounts.
          throw Object.assign(new Error(walk.message ?? "walk incomplete"), { truncated: true });
        }

        const inScope = new Set(walk.ids);
        return {
          ok: true,
          truncated: false,
          scopeSize: inScope.size,
          ...intersectContent(rows, inScope),
          reason: null,
        };
      },
      CATALOGUE_CONTENT_TTL_S,
    );
  } catch (err) {
    // Non-fatal by design: a screen with the lifetime record and honest words
    // beats a screen that failed to load because a count did.
    logger.warn(
      { shop, err: err?.message, truncated: !!err?.truncated, event: "catalogue_join_unavailable" },
      "catalogue join unavailable — screens fall back to the lifetime record",
    );
    return unavailable(err?.truncated ? "catalogue larger than one walk covers" : "walk failed");
  }
}
