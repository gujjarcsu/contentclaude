/**
 * Shared content-metrics helper — single source of truth for Dashboard,
 * Analytics, and Optimise Store.
 *
 * "Products optimised" = DISTINCT products that have ≥1 published AI field.
 * This is always ≤ totalProducts and can never exceed 100%.
 * "Content pieces" = raw row count — a separate, clearly-labelled metric.
 */
import prisma from "../db.server.js";

/**
 * Returns coverage metrics for a shop.
 * @param {string} shop
 * @returns {{ publishedProducts: number, draftProducts: number,
 *             publishedPieces: number, draftPieces: number }}
 */
export async function getContentMetrics(shop) {
  // Single grouped query returns BOTH distinct-product counts AND raw piece
  // counts per status in one round-trip — replacing the previous 4 separate
  // queries. Served by the (shop, status, productId) covering index, so the
  // COUNT(DISTINCT productId) is an index-only scan.
  const rows = await prisma.$queryRaw`
    SELECT status,
           COUNT(DISTINCT "productId")::integer AS products,
           COUNT(*)::integer               AS pieces
    FROM "GeneratedContent"
    WHERE shop = ${shop} AND status IN ('published', 'draft')
    GROUP BY status
  `;

  const row = (s) => rows.find((r) => r.status === s);
  const pub = row("published");
  const draft = row("draft");

  return {
    // Number() cast handles BigInt returned by PostgreSQL COUNT() via $queryRaw
    publishedProducts: Number(pub?.products ?? 0),
    draftProducts:     Number(draft?.products ?? 0),
    publishedPieces:   Number(pub?.pieces ?? 0),
    draftPieces:       Number(draft?.pieces ?? 0),
  };
}

/**
 * Coverage percentage: distinct published products ÷ total products, 0-100.
 * Always clamped so it can never exceed 100%.
 */
export function coveragePct(publishedProducts, totalProducts) {
  if (!totalProducts || totalProducts <= 0) return 0;
  return Math.min(100, Math.round((publishedProducts / totalProducts) * 100));
}
