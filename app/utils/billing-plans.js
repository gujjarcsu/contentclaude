// Client-safe billing plan constants.
//
// B4 — THE TRIAL ALLOWANCE, and it is deliberately NOT the plan's monthly
// allowance. A 14-day trial carrying the full Growth allowance exposes $17.25
// per abusive trial, which is $1,725 across a hundred of them. 250 credits caps
// that at $2.88, is still 2.5x the free tier, and is enough to prove the product
// on a real slice of a real catalogue (14-PRICING.md §5).
//
// Stated on the plan card, never discovered later.
// No server-only imports — safe to import in both route components and server utilities.
//
// B2 — THE LOCKED TABLE. 14-PRICING.md, approved by the owner 2026-09-14 and
// recorded in 04-DECISIONS.md §PRICING. Prices did not move; allowances
// multiplied 4-7.5x, because the diagnosis was that our price per credit was
// 14.99c against a category that charges 0.45c-5.00c. Every number below is
// margin-checked in 14-PRICING.md §4.1 at a uniform 2.00c per credit.
//
// TWO AXES, and both are enforced. `monthlyCredits` is the spend budget;
// `productLimit` is how many products the app will ACT on. The product cap is
// what bounds the free tier: alt text is unmetered (0 credits), so without a
// product cap the free tier has no ceiling at all. 14-PRICING.md §4.4 prices the
// worst realistic free install at ~$1.51/month, and that number is only true
// because of the 100-product cap.
//
// The AUDIT is never capped, on any plan including Free — a locked decision, and
// it is the hook: a 3,000-product store on Free sees every problem it has, and
// then discovers it needs bulk to fix them.

export const TRIAL_CREDITS = 250;

/** Shopify trial length, in days. 14 is Shopify's own recommendation. */
export const TRIAL_DAYS = 14;

export const FREE_PLAN = {
  key: null,
  planName: "free",
  amount: 0,
  monthlyCredits: 100, // was 25
  productLimit: 100,   // what bounds unmetered alt text on the free tier
  // Entitlements — what this plan can access
  entitlements: {
    bulkJobs: false,
    abVariants: false,
    autopilot: false,
    contentTemplates: false,
    versionHistory: false,
    // GEO / AEO entitlements
    geoScore: true,       // GEO Readiness Score is the free hook (read-only)
    llmsTxt: false,       // llms.txt generation/serving — Starter+
    aiVisibility: false,  // P1 live AI-visibility tracker — Pro only, flag-gated
  },
};

export const BILLING_PLANS = {
  starter: {
    key: "Starter Plan",
    planName: "starter",
    amount: 9.99,
    // Annual = 10× monthly (2 months free). Same generation limit; billed yearly.
    annualKey: "Starter Annual",
    // Annual is 20% off, not 10x monthly. 10x is 16.7% ("2 months free"), which
    // every competitor already displays; 20% beats all of them and reads as a
    // real discount. A merchant who does the arithmetic on "2 months free" and
    // finds 16.7% will not believe the next number we show them.
    annualAmount: 95.9,
    monthlyCredits: 500,  // was 50
    productLimit: 1000,
    entitlements: {
      // B3 — bulk starts HERE, at $9.99. The code gated it at Growth, which
      // contradicted the locked table (14-PRICING.md §4: Free no, Starter yes).
      // §5 is explicit about why it matters: 100 free credits is genuinely
      // useful for trying the product and genuinely insufficient for the job,
      // because without bulk a 500-product store would have to click 500 times.
      // "The thing you pay for is the thing that saves the time" — so bulk is
      // the conversion mechanism, and putting it three times further away at
      // $29.99 broke the ladder the pricing was designed around.
      bulkJobs: true,
      abVariants: false,
      autopilot: false,
      contentTemplates: true,
      versionHistory: true,
      geoScore: true,
      llmsTxt: true,
      aiVisibility: false,
    },
  },
  growth: {
    key: "Growth Plan",
    planName: "growth",
    amount: 29.99,
    annualKey: "Growth Annual",
    annualAmount: 287.9,
    monthlyCredits: 1500, // was 200
    productLimit: 5000,
    entitlements: {
      bulkJobs: true,
      abVariants: true,
      autopilot: true,
      contentTemplates: true,
      versionHistory: true,
      geoScore: true,
      llmsTxt: true,
      aiVisibility: false,
    },
  },
  pro: {
    key: "Professional Plan",
    planName: "pro",
    amount: 79.99,
    annualKey: "Professional Annual",
    annualAmount: 767.9,
    monthlyCredits: 4000, // was 1000
    productLimit: null,   // unlimited
    entitlements: {
      bulkJobs: true,
      abVariants: true,
      autopilot: true,
      contentTemplates: true,
      versionHistory: true,
      geoScore: true,
      llmsTxt: true,
      aiVisibility: true,  // P1 tracker entitled at Pro; still flag-gated off by default
    },
  },
};

// Every subscription name this app can ever have created on Shopify —
// monthly AND annual. billing.check() matches on EXACT subscription name, so
// any call site that passes fewer keys will silently miss those subscribers
// (an annual subscriber looked "unsubscribed" and was downgraded to Free
// while still being billed). ALWAYS use this constant with billing.check.
export const ALL_BILLING_PLAN_KEYS = Object.values(BILLING_PLANS)
  .flatMap((p) => [p.key, p.annualKey])
  .filter(Boolean);

/** Returns the entitlements for a given planName string. */
export function getEntitlements(planName) {
  if (planName === "free") return FREE_PLAN.entitlements;
  const plan = Object.values(BILLING_PLANS).find((p) => p.planName === planName);
  return plan?.entitlements ?? FREE_PLAN.entitlements;
}

/**
 * B2 — both limits for a plan name, in one place.
 *
 * `productLimit` is `null` for Pro (unlimited) and for any name we do not
 * recognise, because refusing to act on a merchant's catalogue because we could
 * not identify their plan would be the worst possible failure: they are paying.
 * An unknown plan therefore gets the CREDIT gate (which is authoritative and
 * comes from their Plan row) and no product cap.
 */
export function planLimitsFor(planName) {
  const plan =
    planName === "free" ? FREE_PLAN : Object.values(BILLING_PLANS).find((p) => p.planName === planName);
  return {
    monthlyCredits: plan?.monthlyCredits ?? FREE_PLAN.monthlyCredits,
    productLimit: plan ? plan.productLimit : null,
  };
}

/**
 * B3 — the refusal a merchant sees when bulk is gated.
 *
 * The brief's requirements, and each one is here for a reason:
 *  - it states WHY it is gated rather than just refusing;
 *  - it names what they get and what it costs, so the next step is obvious;
 *  - it never reads as a dead end.
 *
 * It reads the price off the plan table rather than hardcoding "$9.99", because
 * a refusal quoting a price the plans page does not charge is worse than no
 * refusal at all.
 *
 * Free is deliberately one-at-a-time. 100 credits is genuinely useful for trying
 * the product and genuinely insufficient for doing a catalogue, because without
 * bulk a 500-product store would have to click 500 times. That is the honest
 * version of a paywall: the gate is a CAPABILITY, not a rationed quantity, and
 * nothing about it is hidden (14-PRICING.md §5).
 */
export function bulkRefusal(what) {
  const cheapest = Object.values(BILLING_PLANS)
    .filter((p) => p.entitlements?.bulkJobs)
    .sort((a, b) => a.amount - b.amount)[0];
  if (!cheapest) return `${what} is not available on your plan.`;
  const label = cheapest.planName.charAt(0).toUpperCase() + cheapest.planName.slice(1);
  return (
    `${what} is a paid feature — on the free plan you can still generate for any product, ` +
    `one at a time, and the full catalogue audit is never capped. ` +
    `${label} adds bulk from $${cheapest.amount}/month with ${cheapest.monthlyCredits.toLocaleString()} credits.`
  );
}
