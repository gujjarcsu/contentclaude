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
  // Count DISTINCT productIds that have ≥1 published field
  const publishedDistinct = await prisma.generatedContent.findMany({
    where: { shop, status: "published" },
    select: { productId: true },
    distinct: ["productId"],
  });

  const draftDistinct = await prisma.generatedContent.findMany({
    where: { shop, status: "draft" },
    select: { productId: true },
    distinct: ["productId"],
  });

  // Raw piece counts (for the "content pieces" metric)
  const [publishedPieces, draftPieces] = await Promise.all([
    prisma.generatedContent.count({ where: { shop, status: "published" } }),
    prisma.generatedContent.count({ where: { shop, status: "draft" } }),
  ]);

  return {
    publishedProducts: publishedDistinct.length,
    draftProducts: draftDistinct.length,
    publishedPieces,
    draftPieces,
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
