/**
 * Score bands — what a 0-100 score looks like, everywhere.
 *
 * Three screens drew the same band by hand and did not agree:
 *
 *   StartState.jsx      >= 70 success, >= 40 "caution",   else critical
 *   app.seo-audit.jsx   >= 70 success, >= 40 "highlight", else critical   (the ring)
 *   app.seo-audit.jsx   >= 70 success, >= 40 undefined,   else critical   (the row badge)
 *
 * So a product scoring 55 was amber on one screen, blue on another, and
 * uncoloured in the list directly beneath the ring that had just coloured it.
 * Same number, same store, three appearances.
 *
 * The thresholds themselves are the important part and they are deliberate: a
 * mid-range score is "work to do", not "broken", so 40-69 must never be red.
 * Red is reserved for a product that is genuinely invisible to search.
 */

/** Above this a score is healthy. */
export const SCORE_GOOD = 70;
/** Below this a score is critical. Between the two is "work to do". */
export const SCORE_FAIR = 40;

/** `good` | `fair` | `poor`. Pure. */
export function scoreBand(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "poor";
  if (v >= SCORE_GOOD) return "good";
  return v >= SCORE_FAIR ? "fair" : "poor";
}

/**
 * The Polaris tone for a score. Pure.
 *
 * "caution" for the middle band, not "highlight" and not undefined: a score of
 * 55 needs attention and Polaris's caution token is what the rest of the admin
 * uses to say that. `highlight` is informational and reads as neutral.
 */
export function scoreTone(value) {
  return { good: "success", fair: "caution", poor: "critical" }[scoreBand(value)];
}

/** Plain words for the band, for a label or a screen reader. Pure. */
export function scoreLabel(value) {
  return { good: "Good", fair: "Needs work", poor: "Poor" }[scoreBand(value)];
}
