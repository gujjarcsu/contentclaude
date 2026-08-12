// Client-safe billing plan constants.
// No server-only imports — safe to import in both route components and server utilities.

export const FREE_PLAN = {
  key: null,
  planName: "free",
  amount: 0,
  monthlyLimit: 25,
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
    annualAmount: 99.9,
    monthlyLimit: 50,
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
    annualAmount: 299.9,
    monthlyLimit: 200,
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
    annualAmount: 799.9,
    monthlyLimit: 1000,
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
