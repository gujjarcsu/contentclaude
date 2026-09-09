/**
 * Catalog gaps — the one definition of "products still missing content" that
 * every screen uses (brief items 3 and 5), from a truthful Admin API scan.
 *
 *   missing       plain-text description of 0 characters
 *   thin          1–49 characters — the SAME 50-char rule as
 *                 calculateSeoScore().checks.hasDescription (seo.server.js)
 *   needsContent  missing + thin among ACTIVE products that have NO Navaal
 *                 description row (any status: draft / approved / published /
 *                 rejected — Navaal already touched it)
 *   enhance       description ≥ 50 chars but no SEO title or no SEO description
 *   truncated     the scan stopped while Shopify still had more products —
 *                 every count is then a floor and copy must say "At least N"
 *
 * Scans the most recently updated ACTIVE products first, 100 per page
 * (≈ 402 GraphQL cost points; the 1,000-point cap rules out 250), at most
 * `maxPages` pages within `budgetMs`, and stops early once `want` candidates
 * exist. Cached 10 minutes per shop; invalidated whenever Navaal writes a
 * description. Never throws — an Admin API failure returns { error: true }
 * so no screen can render a fabricated count.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { getCache, invalidateCache } from "./cache.server.js";

export const THIN_DESCRIPTION_CHARS = 50;
export const CATALOG_GAPS_TTL_S = 600;
const PAGE = 100;
const PRODUCT_GID_PREFIX = "gid://shopify/Product/";

/** "missing" | "thin" | null. Pure. */
export function classifyDescription(plainText) {
  const len = String(plainText || "").trim().length;
  if (len === 0) return "missing";
  if (len < THIN_DESCRIPTION_CHARS) return "thin";
  return null;
}

export const CATALOG_GAPS_QUERY = `query catalogGaps($c: String) {
  products(first: ${PAGE}, after: $c, sortKey: UPDATED_AT, reverse: true, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    edges { node { id title updatedAt description(truncateAt: 80) seo { title description } featuredMedia { preview { image { url } } } } }
  }
}`;

/**
 * @param {object} admin authenticated admin client (admin.graphql)
 * @param {string} shop
 * @param {{maxPages?: number, budgetMs?: number, want?: number, skipCache?: boolean}} [opts]
 */
export async function scanCatalogGaps(admin, shop, { maxPages = 3, budgetMs = 4000, want = 3, skipCache = false } = {}) {
  const run = async () => {
    const t0 = Date.now();
    let cursor = null;
    let pages = 0;
    let scanned = 0;
    let hasNext = false;
    const missing = [];
    const thin = [];
    const enhance = [];
    try {
      do {
        pages += 1;
        const r = await admin.graphql(CATALOG_GAPS_QUERY, { variables: { c: cursor } });
        const { data } = await r.json();
        const page = data?.products;
        if (!page) throw new Error("no products payload");
        const nodes = (page.edges ?? []).map((e) => e.node).filter((n) => n?.id?.startsWith(PRODUCT_GID_PREFIX));
        const ids = nodes.map((n) => n.id);
        const covered = new Set(
          ids.length
            ? (await prisma.generatedContent.findMany({
                where: { shop, contentType: "description", productId: { in: ids } },
                select: { productId: true },
              })).map((row) => row.productId)
            : []
        );
        for (const node of nodes) {
          scanned += 1;
          if (covered.has(node.id)) continue;
          const text = String(node.description || "").trim();
          const c = {
            id: node.id,
            numericId: node.id.split("/").pop(),
            title: node.title || "",
            imageUrl: node.featuredMedia?.preview?.image?.url || "",
            descriptionPreview: text.slice(0, 80),
            descriptionLength: text.length,
          };
          const gap = classifyDescription(text);
          if (gap === "missing") missing.push({ ...c, tier: 0, mode: "generate" });
          else if (gap === "thin") thin.push({ ...c, tier: 1, mode: "generate" });
          else if (!node.seo?.title?.trim() || !node.seo?.description?.trim()) enhance.push({ ...c, mode: "enhance" });
        }
        hasNext = !!page.pageInfo?.hasNextPage;
        cursor = page.pageInfo?.endCursor ?? null;
      } while (hasNext && pages < maxPages && Date.now() - t0 < budgetMs && missing.length + thin.length < want);
    } catch (err) {
      logger.warn({ shop, err: err?.message }, "catalogGaps scan failed");
      return { error: true, scannedAt: new Date().toISOString() };
    }
    // Image first within a tier (vision context makes a better draft), UPDATED_AT order otherwise (stable sort).
    const rank = (a, b) => (b.imageUrl ? 1 : 0) - (a.imageUrl ? 1 : 0);
    const candidates = [...missing.sort(rank), ...thin.sort(rank)];
    return {
      scanned,
      missingDesc: missing.length,
      thinDesc: thin.length,
      needsContent: candidates.length,
      candidates,
      enhanceCandidates: enhance,
      truncated: hasNext,
      scannedAt: new Date().toISOString(),
    };
  };
  if (skipCache) return run();
  try {
    return await getCache(`catalogGaps:${shop}`, run, CATALOG_GAPS_TTL_S);
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "catalogGaps cache failed");
    return run();
  }
}

export const invalidateCatalogGaps = (shop) => invalidateCache(`catalogGaps:${shop}`).catch(() => {});
