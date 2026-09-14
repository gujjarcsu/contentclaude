/**
 * Read the shop's CURRENT name from Shopify.
 *
 * See shopName.js for why this exists: the greeting was a value captured once at
 * install and never refreshed, so a merchant who renamed their store saw the old
 * name for ever, and a store whose name was unreadable at install was greeted by
 * its raw handle.
 *
 * Cached, because the dashboard is the most-loaded page in the app and a shop
 * name changes approximately never. One hour means a rename is reflected within
 * an hour, which is the right trade for a field that is cosmetic on the
 * dashboard — and correctness on the blog-author path does not depend on this
 * being fresh, only on it being real.
 *
 * NEVER THROWS. A greeting must not be able to fail a page load. An unreadable
 * name returns null and the caller falls back; "I could not read it" and "it is
 * empty" both end up at the same safe place here, which is the one case where
 * that is correct, because the fallback chain handles both identically.
 */
import { getCache } from "./cache.server.js";
import logger from "./logger.server.js";

/**
 * A2 (Phase 8) — two minutes, keyed by SESSION, not by install. CW renamed a
 * store after install and five loads over twenty minutes still greeted the
 * old name: the one-hour cache was carrying the value the install had read.
 * The name is now read from Shopify on every session (the key carries the
 * session id) and re-read within two minutes inside one.
 */
const SHOP_NAME_TTL_SECONDS = 120;

export const SHOP_NAME_CACHE_PREFIX = "shopName:";

/**
 * @param {object} admin - the authenticated admin client
 * @param {string} shop  - myshopify domain
 * @returns {Promise<string|null>} the live name, or null if it could not be read
 */
export async function getLiveShopName(admin, shop, { sessionId = null } = {}) {
  if (!admin || !shop) return null;
  try {
    return await getCache(
      `${SHOP_NAME_CACHE_PREFIX}${shop}:${sessionId || "any"}`,
      async () => {
        const response = await admin.graphql(`query { shop { name } }`);
        const { data } = await response.json();
        const name = String(data?.shop?.name || "").trim();
        // Cache the empty string rather than null: a shop that genuinely has no
        // name should not be re-queried on every dashboard load.
        return name;
      },
      SHOP_NAME_TTL_SECONDS,
    ).then((v) => (v ? String(v) : null));
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "could not read the live shop name (non-fatal)");
    return null;
  }
}
