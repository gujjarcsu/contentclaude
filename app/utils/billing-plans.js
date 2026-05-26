// Client-safe billing plan constants.
// No server-only imports — safe to import in both route components and server utilities.

export const FREE_PLAN = {
  key: null,
  planName: "free",
  amount: 0,
  monthlyLimit: 10,
};

export const BILLING_PLANS = {
  starter: {
    key: "Starter Plan",
    planName: "starter",
    amount: 9.99,
    monthlyLimit: 50,
  },
  growth: {
    key: "Growth Plan",
    planName: "growth",
    amount: 29.99,
    monthlyLimit: 200,
  },
  pro: {
    key: "Professional Plan",
    planName: "pro",
    amount: 79.99,
    monthlyLimit: 1000,
  },
};
