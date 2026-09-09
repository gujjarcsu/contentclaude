// Client-safe plan-fit helpers (brief item 5). No server imports.
import { BILLING_PLANS } from "./billing-plans.js";

export const PLAN_RANK = { free: 0, starter: 1, growth: 2, pro: 3 };
export const PLAN_LABELS = { free: "Free", starter: "Starter", growth: "Growth", pro: "Professional" };

/**
 * The smallest paid plan above `currentPlan` whose monthly limit covers `n`
 * products (Growth+ when the action needs bulk jobs). null when n ≤ 0 or the
 * merchant is already on the top plan. Pure.
 */
export function fitPlanFor({ n, currentPlan = "free", needsBulk = false } = {}) {
  const need = Number(n);
  if (!(need > 0)) return null;
  const cur = PLAN_RANK[currentPlan] ?? 0;
  const cands = ["starter", "growth", "pro"]
    .map((k) => BILLING_PLANS[k])
    .filter((p) => PLAN_RANK[p.planName] > cur && (!needsBulk || p.entitlements.bulkJobs));
  if (cands.length === 0) return null;
  const fit = cands.find((p) => p.monthlyLimit >= need) ?? cands[cands.length - 1];
  return {
    planName: fit.planName,
    key: fit.key,
    label: PLAN_LABELS[fit.planName],
    monthlyLimit: fit.monthlyLimit,
    amount: fit.amount,
    priceLabel: `$${fit.amount.toFixed(2)}/mo`,
    covers: fit.monthlyLimit >= need,
    monthsToCover: Math.max(1, Math.ceil(need / fit.monthlyLimit)),
  };
}

/** 1st of the NEXT UTC month — the quota month key is toISOString().slice(0, 7). */
export function quotaResetDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export const fmtDay = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }); // "1 October"
export const fmtMonth = (d) => new Date(d).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }); // "September"

/** The exact title line the brief asks for. Pure. */
export function quotaGapTitle({ n, truncated = false, fit }) {
  const count = Math.max(0, Number(n) || 0);
  const noun = `${count} product${count === 1 ? "" : "s"} still need${count === 1 ? "s" : ""} content`;
  const head = `${truncated ? "At least " : ""}${noun}`;
  return fit ? `${head} · ${fit.label} covers ${fit.monthlyLimit}/month` : head;
}

export const N_DEFINITION_COPY = {
  catalog_gaps: "active products whose description is missing or under 50 characters and that have no Navaal draft yet",
  no_ai_description: "products with no Navaal description (draft or published)",
  audit_missing_description: "products in this audit missing a description (scanned just now)",
};
