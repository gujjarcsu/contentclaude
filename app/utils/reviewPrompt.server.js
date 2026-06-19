// Review-prompt eligibility — server-only, pure (no incentives, fully compliant).
//
// Decides WHETHER to show an App Store review prompt. The prompt itself (in the
// UI) must be neutral, dismissible, and link to the listing review URL — and must
// NEVER offer any incentive (Shopify prohibits incentivized reviews). This module
// only gates timing; it never rewards.
//
// Compliance guarantees enforced here:
//   • Only fires on a GENUINE success milestone.
//   • NEVER right after an error.
//   • Frequency-capped: a minimum interval between asks, a long cooldown after a
//     dismissal, and a hard lifetime cap.

export const SUCCESS_MILESTONES = new Set([
  "bulk_published",     // a bulk batch finished and published
  "geo_score_milestone",// store/product crossed a GEO readiness threshold
  "first_publish",      // first content published to the store (activation)
  "seo_score_milestone",
]);

const MIN_INTERVAL_DAYS = 30;      // don't re-ask within a month
const DISMISS_COOLDOWN_DAYS = 90;  // if they dismissed, wait a quarter
const MAX_LIFETIME_PROMPTS = 3;    // never nag beyond this

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} args
 *   now            – Date (defaults to now)
 *   milestone      – the success event that just occurred (string)
 *   hadRecentError – true if the merchant just hit an error (never ask then)
 *   state          – { lastPromptAt, dismissedAt, promptCount } (from GrowthState)
 * @returns {{ show:boolean, reason:string }}
 */
export function evaluateReviewPrompt({ now = new Date(), milestone, hadRecentError = false, state = {} } = {}) {
  if (hadRecentError) return { show: false, reason: "recent_error" };
  if (!milestone || !SUCCESS_MILESTONES.has(milestone)) return { show: false, reason: "no_success_milestone" };

  const { lastPromptAt, dismissedAt, promptCount = 0 } = state;

  if (promptCount >= MAX_LIFETIME_PROMPTS) return { show: false, reason: "lifetime_cap_reached" };

  if (dismissedAt) {
    const daysSinceDismiss = (now - new Date(dismissedAt)) / DAY_MS;
    if (daysSinceDismiss < DISMISS_COOLDOWN_DAYS) return { show: false, reason: "dismiss_cooldown" };
  }

  if (lastPromptAt) {
    const daysSincePrompt = (now - new Date(lastPromptAt)) / DAY_MS;
    if (daysSincePrompt < MIN_INTERVAL_DAYS) return { show: false, reason: "min_interval" };
  }

  return { show: true, reason: "eligible" };
}

export const REVIEW_PROMPT_CONFIG = {
  MIN_INTERVAL_DAYS,
  DISMISS_COOLDOWN_DAYS,
  MAX_LIFETIME_PROMPTS,
};
