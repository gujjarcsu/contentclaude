/**
 * Phase 11 Part B — who a shop is, explicitly.
 *
 * The funnel's first reading said "11 real shops". CW's ledger, reconciled to
 * Shopify's own counter, said real is 3 ever and 2 now. The difference was a
 * name pattern that knew four of our naming conventions and nothing else, so
 * the owner's own commercial store, an old test store, and Shopify's reviewer
 * and demo stores all counted as merchants.
 *
 * A pattern is a guess. This is a classification:
 *
 *   ours          our dev, QA, shape and test stores, and the owner's own store
 *   shopify       Shopify's reviewers, the Mars / Ace demo stores, appstoretest
 *   real          a merchant
 *   unclassified  nobody has said — NEVER counted as real, always reported
 *
 * Stored on the Shop row (`kind`), seeded from the ledger in 06-QUEUE.md
 * §PHASE 7 through the Shop kind workflow, and defaulting to unclassified for
 * every new install until the owner or CW classifies it. The only inference
 * is our own naming convention: a shop whose handle matches OURS_PATTERN is
 * ours whatever the row says, and can never be classified real.
 *
 * PURE. The write lives in scripts/shop-kind--writes-classification.mjs.
 */

export const SHOP_KINDS = Object.freeze(["ours", "shopify", "real", "unclassified"]);

/** Our own naming convention — the same guard the reset and diag workflows use, plus the two old test names. */
export const OURS_PATTERN = /^(navaal-ttv-\d+|navaal-qa-[a-z0-9-]+|navaal-shape-[a-z0-9-]+|navaal-test-[a-z0-9-]+|contentpilot-dev\d*|contentpilot-test)\.myshopify\.com$/;

export const normaliseShop = (s) => String(s ?? "").trim().toLowerCase();

/** The effective kind of a row: the stored classification, else our naming convention, else unclassified. */
export function kindOf(row) {
  if (OURS_PATTERN.test(normaliseShop(row?.shop))) return "ours"; // whatever the row says
  const stored = String(row?.kind ?? "").trim().toLowerCase();
  if (stored && stored !== "unclassified" && SHOP_KINDS.includes(stored)) return stored;
  return "unclassified";
}

export const isRealShop = (row) => kindOf(row) === "real";

/** Counts per effective kind. */
export function tallyKinds(rows) {
  const t = { ours: 0, shopify: 0, real: 0, unclassified: 0 };
  for (const r of rows ?? []) t[kindOf(r)] += 1;
  return t;
}

/**
 * Parse "a.myshopify.com=real b.myshopify.com=shopify" (space, comma or
 * newline separated) into assignments, refusing anything that is not a
 * myshopify domain, not a known kind, or a real classification on one of our
 * own handles. Returns both lists so the caller can print the refusals and
 * write none of them.
 *
 * @returns {{assignments: Array<{shop: string, kind: string}>, refused: Array<{input: string, reason: string}>}}
 */
export function parseKindAssignments(text) {
  const assignments = [];
  const refused = [];
  for (const raw of String(text ?? "").split(/[\s,]+/).filter(Boolean)) {
    const eq = raw.indexOf("=");
    if (eq < 1) {
      refused.push({ input: raw, reason: "expected domain=kind" });
      continue;
    }
    const shop = normaliseShop(raw.slice(0, eq));
    const kind = raw.slice(eq + 1).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      refused.push({ input: raw, reason: "not a myshopify domain" });
      continue;
    }
    if (!SHOP_KINDS.includes(kind)) {
      refused.push({ input: raw, reason: `kind must be one of ${SHOP_KINDS.join(", ")}` });
      continue;
    }
    if (kind === "real" && OURS_PATTERN.test(shop)) {
      refused.push({ input: raw, reason: "one of our own handles can never be classified real" });
      continue;
    }
    assignments.push({ shop, kind });
  }
  return { assignments, refused };
}
