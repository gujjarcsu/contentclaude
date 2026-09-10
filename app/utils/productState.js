/**
 * Phase 2 item 2.1 — ONE definition of what state a product is in.
 *
 * This file exists because "one definition" was not enough on its own: the rule
 * lived in `metrics.server.js`, which imports Prisma, so no component could
 * import it. `app.products.jsx` therefore re-derived the rule from the
 * description row alone, and its tabs disagreed with the stat cards **on the
 * same screen** — "13 live · 4 ready to review" above "Draft (3) · Published
 * (14)". Caught by looking at a listing screenshot, not by a test.
 *
 * A shared rule that half the app cannot import is not shared. So the pure part
 * lives here, with no server imports, and `metrics.server.js` re-exports it.
 *
 * ── The precedence rule ─────────────────────────────────────────────────────
 *
 * Every product is in exactly ONE state, decided by what the merchant still has
 * to do:
 *
 *   any draft row      -> draft          (it is in the Review queue; say so)
 *   else any published -> published
 *   else any rejected  -> rejected
 *   else               -> needs_content
 *
 * The alternative — read the description row first, then meta — makes a product
 * with a published description and a draft meta title `published`, while it sits
 * in the Review queue waiting for that meta title. That is the same
 * contradiction this item exists to remove, pointing the other way.
 *
 * Description-first survives as the tie-break INSIDE a state, which is where it
 * belongs: `primaryRowOf` reads the description row before the meta rows when a
 * single row has to represent the product.
 */

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
export const ROW_PRECEDENCE = Object.freeze([
  "description",
  "metaTitle",
  "metaDescription",
  "faq",
  "altText",
]);

/**
 * The one state for one product, from its content rows. Pure.
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
 * The same rule, for the `{ [contentType]: { status } }` shape the Products
 * loader sends to the client. Pure.
 *
 * This is the adapter whose absence caused the bug: the component had a map
 * keyed by content type and the shared rule wanted an array, so the component
 * wrote its own rule instead of converting.
 *
 * @param {Record<string, {status: string}>|undefined|null} byType
 */
export function stateOfContentMap(byType) {
  if (!byType) return PRODUCT_STATE.NEEDS_CONTENT;
  const rows = Object.entries(byType)
    .filter(([, v]) => v && typeof v.status === "string")
    .map(([contentType, v]) => ({ contentType, status: v.status }));
  return stateOf(rows);
}

/**
 * The row that represents a product — description first, then meta. Used where
 * one row's content or score has to stand for the product. Pure.
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
