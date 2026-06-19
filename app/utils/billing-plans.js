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

/** Returns the entitlements for a given planName string. */
export function getEntitlements(planName) {
  if (planName === "free") return FREE_PLAN.entitlements;
  const plan = Object.values(BILLING_PLANS).find((p) => p.planName === planName);
  return plan?.entitlements ?? FREE_PLAN.entitlements;
}
