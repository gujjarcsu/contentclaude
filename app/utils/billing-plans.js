// Client-safe billing plan constants.
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
      bulkJobs: false,
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
