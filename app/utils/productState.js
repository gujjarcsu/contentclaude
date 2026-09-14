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
  // Phase 4 item 4.2 — Shopify accepted the write, but the value it returned
  // did not match what we sent. The content IS live; what is unconfirmed is
  // that it is the content the merchant approved. It ranks above `published`
  // in precedence because it needs an eye and a clean publish does not.
  UNVERIFIED: "published_unverified",
  PUBLISHED: "published",
  REJECTED: "rejected",
});

/** Plain-language labels. No jargon, no raw keys — Phase 2 item 2.9. */
export const PRODUCT_STATE_LABEL = Object.freeze({
  needs_content: "Needs content",
  draft: "Ready to review",
  // A7 (Phase 8) — "Live" meant live on the storefront, and a Shopify DRAFT
  // product has no storefront page. This is the state of OUR content on the
  // product; the Products list adds the product's own status beside it.
  published_unverified: "Published, needs a check",
  published: "Published",
  rejected: "Rejected",
});

/**
 * Most-urgent-first. A product is in the first state that applies to any of its
 * rows. Exported so a test and any caller ordering by attention agree.
 */
export const STATE_PRECEDENCE = Object.freeze([
  PRODUCT_STATE.DRAFT,
  PRODUCT_STATE.UNVERIFIED,
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

/**
 * Does this product belong on the Products list, under this tab?
 *
 * A1 — extracted from `app.products.jsx` so it can be tested directly. The
 * comment on `stateOfContentMap` above records why that matters: the last time a
 * rule lived only inside the component, the component wrote its own version and
 * the screen contradicted its own stat cards.
 *
 * TWO DIFFERENT AXES, and conflating them is the trap:
 *
 *   `product.status`  — Shopify's status: ACTIVE / DRAFT / ARCHIVED / UNLISTED.
 *                       Whether the product exists for sale.
 *   `statusFilter`    — OUR tabs, which are CONTENT states. "draft" here means
 *                       we generated copy that is awaiting review, and has
 *                       nothing to do with a Shopify draft product.
 *
 * Mapping the tabs onto Shopify's `status:` in the GraphQL query would silently
 * return a completely different set of products under the same tab name.
 *
 * ARCHIVED is dropped regardless of tab. The loader already excludes it in the
 * query — the only place that can also fix the counts and the cursor — and this
 * is the second line of defence, because Shopify's search reference says an
 * INVALID FIELD makes the query be ignored and ALL results returned. A typo in
 * that scope string does not error; the archived products just come back.
 *
 * Pure.
 *
 * @param {{status?: string}} product
 * @param {Record<string, {status: string}>|undefined} contentByType
 * @param {string} statusFilter  "all" | "draft" | "published" | "needsContent"
 */
export function matchesListFilter(product, contentByType, statusFilter) {
  if (product?.status === "ARCHIVED") return false;

  const state = stateOfContentMap(contentByType);
  if (statusFilter === "draft") return state === PRODUCT_STATE.DRAFT;
  if (statusFilter === "published") return state === PRODUCT_STATE.PUBLISHED;
  if (statusFilter === "needsContent") return state === PRODUCT_STATE.NEEDS_CONTENT;
  return true;
}
