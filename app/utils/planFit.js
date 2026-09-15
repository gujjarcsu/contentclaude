// Client-safe plan-fit helpers (brief item 5). No server imports.
import { BILLING_PLANS } from "./billing-plans.js";
import { T, enT } from "../i18n/index.js";

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
  const fit = cands.find((p) => p.monthlyCredits >= need) ?? cands[cands.length - 1];
  return {
    planName: fit.planName,
    key: fit.key,
    label: PLAN_LABELS[fit.planName],
    monthlyCredits: fit.monthlyCredits,
    amount: fit.amount,
    priceLabel: `$${fit.amount.toFixed(2)}/mo`,
    covers: fit.monthlyCredits >= need,
    monthsToCover: Math.max(1, Math.ceil(need / fit.monthlyCredits)),
  };
}

/** 1st of the NEXT UTC month — the quota month key is toISOString().slice(0, 7). */
export function quotaResetDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * D3 - the quota month and its reset day travel as ISO instants (`monthAt`,
 * `resetAt`) and are formatted where they are shown, in the merchant's
 * language (`quotaMonthLabel`, `quotaResetLabel` in UpgradePrompt.jsx). The
 * English-only `fmtDay`/`fmtMonth` that used to live here put "September"
 * on a French screen; a loader ships data, never a sentence.
 */
export const QUOTA_MONTH_FORMAT = Object.freeze({ month: "long", timeZone: "UTC" });
export const QUOTA_RESET_FORMAT = Object.freeze({ day: "numeric", month: "long", timeZone: "UTC" });

/** The exact title line the brief asks for. Pure. */
/** D6 — `t` is the screen's translator; English by default so the tests that pin the brief's exact line hold. */
export function quotaGapTitle({ n, truncated = false, fit }, t = enT) {
  const count = Math.max(0, Number(n) || 0);
  const noun = t("{count, plural, one {# product still needs content} other {# products still need content}}", { count });
  const head = truncated ? t("At least {noun}", { noun }) : noun;
  return fit ? t("{head} · {label} covers {n}/month", { head, label: fit.label, n: fit.monthlyCredits }) : head;
}

// D6 — keys; the screen passes each through t()
export const N_DEFINITION_COPY = {
  catalog_gaps: T("active products whose description is missing or under 50 characters and that have no Navaal draft yet"),
  no_ai_description: T("products with no Navaal description (draft or published)"),
  audit_missing_description: T("products in this audit missing a description (scanned just now)"),
};
