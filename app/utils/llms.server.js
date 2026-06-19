// llms.txt rendering — server-only.
//
// Produces the llms.txt / llms-full.txt documents served via the Shopify App
// Proxy (see app/routes/proxy.llms[.]txt.jsx). Reuses generateLlmsTxt() from the
// GEO engine and the existing cache layer. Plan-gated (Starter+) via entitlements.
//
// The rendered document is cached for 1 hour per shop and invalidated when the
// catalog changes (products/create webhook) — so it stays current without an
// Admin API call on every storefront/crawler hit.

import { unauthenticated } from "../shopify.server.js";
import { getCache, invalidateCache } from "./cache.server.js";
import { getOrCreatePlan } from "./plans.server.js";
import { getEntitlements } from "./billing-plans.js";
import { generateLlmsTxt } from "./geo.server.js";
import logger from "./logger.server.js";

const LLMS_CACHE_TTL = 3600; // 1 hour

function cacheKey(shop, full) {
  return `llmstxt:${shop}:${full ? "full" : "base"}`;
}

/**
 * Render the llms.txt (or llms-full.txt) document for a shop.
 * Returns null when the shop is not entitled (Starter+) — callers serve a 404.
 */
export async function renderLlmsTxt(shop, { full = false } = {}) {
  const plan = await getOrCreatePlan(shop);
  if (!getEntitlements(plan.planName).llmsTxt) return null;

  return getCache(
    cacheKey(shop, full),
    async () => {
      const { admin } = await unauthenticated.admin(shop);
      const resp = await admin.graphql(
        `query llmsCatalog {
          shop { name primaryDomain { url } }
          products(first: 100, query: "status:active", sortKey: TITLE) {
            edges { node { title handle onlineStoreUrl description productType vendor } }
          }
          collections(first: 25, sortKey: TITLE) {
            edges { node { title handle onlineStoreUrl description } }
          }
        }`
      );
      const { data } = await resp.json();
      const storeName = data?.shop?.name || shop.split(".")[0];
      const baseUrl = data?.shop?.primaryDomain?.url || `https://${shop}`;

      const items = (data?.products?.edges ?? []).map(({ node }) => ({
        type: "product",
        title: node.title,
        url: node.onlineStoreUrl || `${baseUrl}/products/${node.handle}`,
        summary: node.description || "",
        attributes: full
          ? { Type: node.productType || "", Brand: node.vendor || "" }
          : undefined,
      }));

      const collections = (data?.collections?.edges ?? [])
        .map(({ node }) => ({
          title: node.title,
          url: node.onlineStoreUrl || `${baseUrl}/collections/${node.handle}`,
          summary: node.description || "",
        }))
        .filter((c) => c.title);

      return generateLlmsTxt(
        { name: storeName, domain: baseUrl, description: data?.shop?.name ? `${storeName} — official product catalog.` : "" },
        items,
        { full, collections }
      );
    },
    LLMS_CACHE_TTL
  );
}

/** Invalidate both cached variants for a shop (called on catalog changes). */
export async function invalidateLlmsTxt(shop) {
  try {
    await Promise.all([
      invalidateCache(cacheKey(shop, false)),
      invalidateCache(cacheKey(shop, true)),
    ]);
  } catch (err) {
    logger.warn({ shop, err: err.message }, "Failed to invalidate llms.txt cache");
  }
}
