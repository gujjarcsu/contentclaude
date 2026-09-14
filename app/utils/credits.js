/**
 * B1 — WHAT ONE GENERATION COSTS A MERCHANT, IN CREDITS.
 *
 * PURE and client-safe: the plans page and the quota surfaces show these numbers
 * to merchants, and a rule inside a Prisma-importing module is not shareable
 * (L10).
 *
 * ── Why weighting exists ───────────────────────────────────────────────────
 *
 * Every generation used to cost one unit of the monthly limit, and the units
 * were not comparable. Measured through the real code path in P0.6
 * (`08-ECONOMICS.md` §2): alt text costs **$0.000906** and a blog post
 * **$0.0300** — a **33× spread**. Selling both as "one generation" means the
 * plan's true cost depends entirely on the mix, and the worst case is three
 * times the plan.
 *
 * After weighting the worst cost per credit is **$0.0115 whatever the merchant
 * generates**, which is the whole reason the ≥42% margin in `14-PRICING.md` §3
 * holds. A blog post at 3 credits is $0.0100 per credit — *cheaper* per credit
 * than product content. The mix stops mattering.
 *
 * This is honest rather than clever: a merchant is charged more credits for the
 * thing that costs more, and nothing for the thing that costs almost nothing.
 *
 * ── Alt text at zero is NOT unbounded ──────────────────────────────────────
 *
 * It is bounded by the PRODUCT CAP (B2), not by the credit allowance. Without
 * that cap the free tier has no ceiling at all: unmetered alt text on a
 * 10,000-image store is unbounded. `14-PRICING.md` §4.4 prices the worst
 * realistic free install at ≈$1.51/month, and it is the 100-product cap that
 * makes that number true. The next person to read this will assume alt text is
 * simply free. It is free *per credit*; it is capped *per product*.
 */

/** Charged nothing. Costs $0.000906 — a thirteenth of a product generation. */
export const FREE_CONTENT_TYPES = Object.freeze(["altText"]);

/**
 * Credits per generation, by the `contentType` this app actually writes to
 * `UsageRecord.contentType`.
 *
 * These are the REAL stored values, not an idealised vocabulary: a bulk job
 * writes a CSV bundle, and `carryover` is a synthetic row. Both are handled
 * below rather than wished away.
 */
export const CREDIT_WEIGHTS = Object.freeze({
  // Unmetered — see above.
  altText: 0,

  // 3 credits. Measured at $0.0300, genuinely 2.6× a product generation.
  blog: 3,

  // 1 credit. One API call each.
  description: 1,
  metaTitle: 1,
  metaDescription: 1,
  faq: 1,
  social: 1,
  collection: 1,
  enhance: 1,
  product: 1,

  // Synthetic. `restoreUsageCarryover` writes one of these per credit a shop had
  // already spent this month, so an uninstall/reinstall cannot reset the
  // allowance. It must cost exactly what it is restoring, or reinstalling would
  // hand back free credits.
  carryover: 1,
});

/**
 * The credits ONE stored contentType costs.
 *
 * Throws on anything unrecognised. `14-PRICING.md` §6 item 1 and the brief are
 * explicit: a new content type that is not in this table must fail LOUDLY
 * rather than default to 1 and quietly under-bill. A silent default is how the
 * margin arithmetic in §3 stops being true without anybody noticing.
 */
function creditsForOne(type) {
  const key = String(type ?? "").trim();
  if (!Object.prototype.hasOwnProperty.call(CREDIT_WEIGHTS, key)) {
    throw new Error(
      `No credit weight for content type "${key}". Add it to CREDIT_WEIGHTS in app/utils/credits.js. ` +
        `A new content type must have its price decided deliberately, not inherited by default — ` +
        `see 14-PRICING.md §3, where every cap is planned against a known worst cost per credit.`,
    );
  }
  return CREDIT_WEIGHTS[key];
}

/**
 * The credits a `UsageRecord.contentType` costs, including bulk bundles.
 *
 * A bulk job stores a CSV — `"description,metaTitle,metaDescription"` — because
 * `bulkProcessor` passes `job.contentTypes` straight through. That bundle is
 * ONE Anthropic call that returns all three fields together, so it is ONE
 * product generation, not three.
 *
 * The bundle is charged the MAX of its members, not the sum. Max is what keeps
 * the two facts true at once: description+metaTitle+metaDescription is 1, and a
 * bundle that somehow contained a blog would still be charged 3 rather than
 * being smuggled through at 1. A bundle of description+altText is 1, because
 * the description call still costs what it costs.
 *
 * @param {string} contentType the value stored on UsageRecord
 * @returns {number} credits, ≥ 0
 */
export function creditsFor(contentType) {
  const parts = String(contentType ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error(
      "creditsFor() was given an empty content type. An unbilled generation is a hole in the " +
        "margin arithmetic, so this refuses rather than charging zero.",
    );
  }

  return parts.map(creditsForOne).reduce((max, n) => (n > max ? n : max), 0);
}

/** Is this content type unmetered? For UI that says so before a merchant spends. */
export function isUnmetered(contentType) {
  try {
    return creditsFor(contentType) === 0;
  } catch {
    return false;
  }
}
