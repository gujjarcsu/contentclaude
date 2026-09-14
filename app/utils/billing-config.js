// The billing entries this app hands to Shopify — built from the locked table,
// never restated.
//
// P5.0 — WHY THIS MODULE EXISTS. `TRIAL_DAYS = 14` was exported from
// billing-plans.js, asserted by a passing test, and imported by NOTHING. The
// value that actually reached Shopify was a literal `trialDays: 7` inside
// shopify.server.js, so production granted 7-day trials while the locked table,
// the plans page copy and a green test all said something else. An exported
// constant whose only consumer is a test asserting its own value is dead code
// that greps as shipped (07-VERIFICATION.md, false green #11).
//
// The builder is PURE and takes the interval constants as arguments, so the
// object that is handed to `shopifyApp({ billing })` can be asserted in a test
// without booting the Shopify library, Prisma or the app. The test asserts on
// THIS OBJECT — not on the constants — which is the only assertion that fails
// when the wrong number would reach Shopify.
//
// No server-only imports: safe to import anywhere.
import { BILLING_PLANS, TRIAL_DAYS } from "./billing-plans.js";

/**
 * One recurring subscription entry in the lineItems format the Shopify billing
 * library requires. The older flat shape ({ amount, currencyCode, interval })
 * is rejected with "Must be either a one-time plan or a subscription plan with
 * line items" from appSubscriptionCreate.
 */
function recurringPlan(amount, currencyCode, interval, trialDays) {
  return {
    trialDays,
    lineItems: [{ amount, currencyCode, interval }],
  };
}

/**
 * Every subscription this app can create, monthly and annual, keyed by the
 * EXACT Shopify subscription name.
 *
 * `trialDays` comes from `TRIAL_DAYS` for every entry — there is no per-plan
 * trial and no literal anywhere on this path. A plan-specific trial would be a
 * second place for the number to live, which is the defect this replaced.
 *
 * @param {object} intervals - the library's BillingInterval values, passed in
 *   rather than imported so this module stays free of the Shopify server bundle.
 */
export function buildBillingConfig({ every30Days, annual, currencyCode = "USD" }) {
  if (!every30Days || !annual) {
    throw new Error("buildBillingConfig: both interval constants are required");
  }
  return Object.fromEntries(
    Object.values(BILLING_PLANS).flatMap((p) => [
      [p.key, recurringPlan(p.amount, currencyCode, every30Days, TRIAL_DAYS)],
      [p.annualKey, recurringPlan(p.annualAmount, currencyCode, annual, TRIAL_DAYS)],
    ]),
  );
}

/**
 * Money as a merchant reads it. $9.99, $95.90 — always two decimals, because
 * `95.9` rendered raw reads as $95.9 and a price with one decimal place looks
 * like a typo on a billing screen.
 */
export function formatPrice(amount) {
  // Free is "$0", not "$0.00 forever".
  if (!Number(amount)) return "$0";
  return `$${Number(amount).toFixed(2)}`;
}

/**
 * The annual discount, COMPUTED from the two prices rather than stated.
 *
 * 14-PRICING.md §4 is emphatic about this one: "2 months free" is 16.7%, it is
 * what every competitor already displays, and a merchant who does the
 * arithmetic and finds the claim wrong will not believe the next number we
 * show them. Deriving it means the badge can never disagree with the charge.
 */
export function annualSavingPct(plan) {
  if (!plan?.amount || !plan?.annualAmount) return 0;
  return Math.round((1 - plan.annualAmount / (plan.amount * 12)) * 100);
}
