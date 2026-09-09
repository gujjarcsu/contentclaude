/**
 * Phase 2 item 2.1 — ONE definition of what state a product is in.
 *
 * There were four. `getContentMetrics` counted distinct products with any
 * published row; `optimize.jsx` counted description rows only; the `products.jsx`
 * tabs counted per page, by description status; `seo-audit.jsx` asked Shopify
 * whether the description was empty. So Home said 5 and Products said 3, and
 * Products said 12 where Optimize said 14, for the same store at the same
 * moment. A merchant who sees two numbers for one thing stops trusting both.
 *
 * The deeper fault was that the old counts were not mutually exclusive. A
 * product with a published description AND a draft meta title was counted in
 * `publishedProducts` and again in `draftProducts`, so
 * `total - published - draft` — which is exactly how `products.jsx` derived
 * "needs content" — undercounted, and the numbers on one screen did not add up.
 *
 * Now every product is in exactly ONE state:
 *
 *   needs_content  no AI content at all
 *   draft          has content waiting for the merchant to review
 *   published      reviewed and live on the storefront
 *   rejected       the merchant said no and has not regenerated
 *
 * The four counts always sum to the store's product total. Every screen, tab,
 * subtitle, badge and the Optimize action read them from here.
 *
 * ── The precedence rule, and where it departs from the brief ────────────────
 *
 * The brief says to compute the state "from the description row first, then
 * meta". Read literally, a product with a published description and a draft meta
 * title is `published` — and it would then sit in the Review queue, which lists
 * every draft row, while the dashboard counted it as done. That is the same
 * contradiction this item exists to remove, pointing the other way.
 *
 * So state is decided by what the merchant still has to do:
 *
 *   any draft row      -> draft       (it is in the Review queue; say so)
 *   else any published -> published
 *   else any rejected  -> rejected
 *   else               -> needs_content
 *
 * Description-first survives as the tie-break inside a state, which is where it
 * matters: `primaryRowOf` reads the description row before the meta rows when a
 * single row has to represent the product. The departure is deliberate and is
 * recorded in PROGRESS.md rather than made silently.
 */
import prisma from "../db.server.js";

/** The only vocabulary for product state. Nothing else may invent its own. */
export const PRODUCT_STATE = Object.freeze({
  NEEDS_CONTENT: "needs_content",
  DRAFT: "draft",
  PUBLISHED: "published",
  REJECTED: "rejected",
});

/** Plain-language labels. No jargon, no raw keys — Phase 2 item 2.9. */
export const PRODUCT_STATE_LABEL = Object.freeze({
  needs_content: "Needs content",
  draft: "Ready to review",
  published: "Live",
  rejected: "Rejected",
});

/**
 * Most-urgent-first. A product is in the first state that applies to any of its
 * rows. Exported so a test and any caller ordering by attention agree.
 */
export const STATE_PRECEDENCE = Object.freeze([
  PRODUCT_STATE.DRAFT,
  PRODUCT_STATE.PUBLISHED,
  PRODUCT_STATE.REJECTED,
]);

/** Which single row speaks for a product when one has to. Description first. */
const ROW_PRECEDENCE = ["description", "metaTitle", "metaDescription", "faq", "altText"];

/**
 * The one state for one product, from its content rows.
 * Pure, so the rule can be tested without a database.
 *
 * @param {Array<{contentType: string, status: string}>} rows
 * @returns {string} a PRODUCT_STATE value
 */
export function stateOf(rows) {
  if (!rows || rows.length === 0) return PRODUCT_STATE.NEEDS_CONTENT;
  for (const state of STATE_PRECEDENCE) {
    if (rows.some((r) => r.status === state)) return state;
  }
  return PRODUCT_STATE.NEEDS_CONTENT;
}

/**
 * The row that represents a product — description first, then meta. Used where
 * one row's content or score has to stand for the product.
 *
 * @param {Array<{contentType: string, status: string}>} rows
 */
export function primaryRowOf(rows) {
  if (!rows || rows.length === 0) return null;
  for (const type of ROW_PRECEDENCE) {
    const hit = rows.find((r) => r.contentType === type);
    if (hit) return hit;
  }
  return rows[0];
}

/** Only product GIDs. GeneratedContent also stores collection content. */
const PRODUCT_GID = "gid://shopify/Product/%";

/**
 * Coverage metrics for a shop, in ONE round-trip.
 *
 * Pass `totalProducts` (the store's product count from Shopify) to get
 * `needsContentProducts` and a `byState` that sums to it. Without it the
 * needs-content count cannot be known — this function sees only products that
 * already have rows — and it is reported as `null` rather than guessed at.
 *
 * @param {string} shop
 * @param {{ totalProducts?: number }} [opts]
 */
export async function getContentMetrics(shop, { totalProducts } = {}) {
  // One query, two shapes:
  //   kind='state' — one row per product, reduced to its single state
  //   kind='piece' — raw row counts, which are a different and separate metric
  // Both are needed and asking twice would be two round-trips on every page.
  const rows = await prisma.$queryRaw`
    WITH per_product AS (
      SELECT "productId",
             CASE
               WHEN bool_or(status = 'draft')     THEN 'draft'
               WHEN bool_or(status = 'published') THEN 'published'
               WHEN bool_or(status = 'rejected')  THEN 'rejected'
               ELSE 'needs_content'
             END AS state
      FROM "GeneratedContent"
      WHERE shop = ${shop}
        AND "productId" LIKE ${PRODUCT_GID}
      GROUP BY "productId"
    )
    SELECT 'state' AS kind, state AS key, COUNT(*)::integer AS n
    FROM per_product
    GROUP BY state
    UNION ALL
    SELECT 'piece' AS kind, status AS key, COUNT(*)::integer AS n
    FROM "GeneratedContent"
    WHERE shop = ${shop}
      AND "productId" LIKE ${PRODUCT_GID}
      AND status IN ('published', 'draft')
    GROUP BY status
  `;

  // Number() because PostgreSQL COUNT() comes back as BigInt through $queryRaw,
  // and BigInt does not survive JSON.stringify in a loader response.
  const pick = (kind, key) => Number(rows.find((r) => r.kind === kind && r.key === key)?.n ?? 0);

  const draftProducts = pick("state", PRODUCT_STATE.DRAFT);
  const publishedProducts = pick("state", PRODUCT_STATE.PUBLISHED);
  const rejectedProducts = pick("state", PRODUCT_STATE.REJECTED);
  const withContent = draftProducts + publishedProducts + rejectedProducts;

  const hasTotal = Number.isFinite(totalProducts) && totalProducts >= 0;
  const needsContentProducts = hasTotal ? Math.max(0, totalProducts - withContent) : null;

  return {
    // One state per product. These are mutually exclusive and, given a
    // totalProducts, they sum to it.
    byState: {
      [PRODUCT_STATE.NEEDS_CONTENT]: needsContentProducts,
      [PRODUCT_STATE.DRAFT]: draftProducts,
      [PRODUCT_STATE.PUBLISHED]: publishedProducts,
      [PRODUCT_STATE.REJECTED]: rejectedProducts,
    },
    needsContentProducts,
    draftProducts,
    publishedProducts,
    rejectedProducts,
    /** Products that have any AI content at all, in any state. */
    withContent,
    // Raw row counts. A DIFFERENT metric, always labelled as pieces, never
    // mixed with product counts on one screen.
    publishedPieces: pick("piece", "published"),
    draftPieces: pick("piece", "draft"),
  };
}

/**
 * How many products have no AI content, given the store's product total.
 *
 * Exists so the arithmetic lives in ONE place. Every screen needs this number
 * and every screen also needs `getContentMetrics` to run in parallel with the
 * Shopify product-count call, so the count is not known when the metrics query
 * is issued. Deriving it here keeps the loaders parallel (Phase 2 item 2.11)
 * without letting four screens each write `total - published - draft` again,
 * which is the exact expression that was wrong.
 *
 * @param {{withContent: number}} metrics from getContentMetrics
 * @param {number} totalProducts the store's product count from Shopify
 */
export function needsContentFrom(metrics, totalProducts) {
  if (!Number.isFinite(totalProducts) || totalProducts < 0) return null;
  return Math.max(0, totalProducts - (metrics?.withContent ?? 0));
}

/**
 * The state of specific products, for a page of a product list.
 * Returns a Map of productId to a PRODUCT_STATE value. Products with no rows
 * are absent from the Map; the caller treats those as `needs_content`.
 *
 * @param {string} shop
 * @param {string[]} productIds
 * @returns {Promise<Map<string, string>>}
 */
export async function getProductStates(shop, productIds) {
  if (!productIds || productIds.length === 0) return new Map();

  const rows = await prisma.generatedContent.findMany({
    where: { shop, productId: { in: productIds } },
    select: { productId: true, contentType: true, status: true },
  });

  const byProduct = new Map();
  for (const r of rows) {
    if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
    byProduct.get(r.productId).push(r);
  }

  const states = new Map();
  for (const [productId, productRows] of byProduct) {
    states.set(productId, stateOf(productRows));
  }
  return states;
}

/** The state to show for one product, including the no-rows case. */
export function stateForProduct(states, productId) {
  return (states instanceof Map ? states.get(productId) : states?.[productId]) ?? PRODUCT_STATE.NEEDS_CONTENT;
}

/**
 * Coverage percentage: products live on the storefront over total products.
 * Clamped, so it can never read over 100%.
 */
export function coveragePct(publishedProducts, totalProducts) {
  if (!totalProducts || totalProducts <= 0) return 0;
  return Math.min(100, Math.round((publishedProducts / totalProducts) * 100));
}
