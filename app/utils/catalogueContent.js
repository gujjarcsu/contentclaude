/**
 * Part B — the join between what THIS APP has done and what the merchant's
 * catalogue actually contains.
 *
 * ── The screen that could not count ────────────────────────────────────────
 *
 * On a 15-product store, the first image on the listing carried: Total Products
 * 32 · AI Content Published 30 · 30 products optimized · across 14 products
 * sampled. Every number was individually defensible and no merchant could
 * reconcile them, because they came from FOUR populations:
 *
 *   32  every product record Shopify holds, archived included
 *   30  every product this app has ever published content for — our own
 *       table, joined to nothing, so archived and deleted products stay counted
 *   15  non-archived products (the Products list)
 *   14  non-archived AND published to the online store (the candidate scope)
 *
 * Twice this was "fixed" by relabelling one number. Relabelling is correct about
 * that number's meaning and does nothing for a screen. This is the class fix:
 * **one population per screen**, and the content record joined to it.
 *
 * ── What the join is, in one sentence ──────────────────────────────────────
 *
 * Take the set of product ids in the candidate scope (what the app may act on),
 * take our per-product content state, and count only the states whose product
 * is in the set. Then "published", "drafts" and "not yet optimized" are all
 * about the same N products, and they add up.
 *
 * The lifetime record (`metrics.publishedProducts`) is NOT redefined — the
 * decision in `04-DECISIONS.md` and at the top of `metrics.server.js` stands.
 * It is shown as secondary text: "30 since you installed". A merchant asking
 * "what have I got for my credits" still gets the true answer.
 *
 * PURE. No I/O. The walk and the query live in catalogueContent.server.js.
 */
import { PRODUCT_STATE } from "./productState.js";

/**
 * Count content states among a set of product ids.
 *
 * @param {Array<{productId: string, state: string}>} rows one row per product
 *   that has content, with its single precedence-resolved state
 * @param {Set<string>} inScope product ids in the population being described
 * @returns {{published: number, draft: number, unverified: number, rejected: number, withContent: number}}
 */
export function intersectContent(rows, inScope) {
  const out = { published: 0, draft: 0, unverified: 0, rejected: 0, withContent: 0 };
  if (!Array.isArray(rows) || !(inScope instanceof Set)) return out;
  for (const r of rows) {
    if (!r?.productId || !inScope.has(r.productId)) continue;
    switch (r.state) {
      case PRODUCT_STATE.PUBLISHED:
        out.published++;
        break;
      case PRODUCT_STATE.DRAFT:
        out.draft++;
        break;
      case PRODUCT_STATE.UNVERIFIED:
        out.unverified++;
        break;
      case PRODUCT_STATE.REJECTED:
        out.rejected++;
        break;
      default:
        continue;
    }
    out.withContent++;
  }
  return out;
}

/**
 * The words beside the "AI Content Published" number.
 *
 * Three cases, and each says exactly what the number is a count OF:
 *   - the join is unavailable → the lifetime record, named as such
 *   - the record exceeds the in-scope count → both, so the gap is explained
 *     ("30 since you installed" beside "14 of the 14 published to your store")
 *   - otherwise → the population alone
 */
export function publishedSubtext({ ok, inScope, candidateCount, candidateLabel, record }) {
  if (!ok || !Number.isFinite(candidateCount)) return "Products we have published content for";
  const base = `of your ${candidateCount} ${candidateLabel}`;
  if (Number.isFinite(record) && record > inScope) return `${base} · ${record} since you installed`;
  return base;
}
