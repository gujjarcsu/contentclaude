/**
 * A1 (Phase 8) — every Plan row reads against the locked table, never below it.
 *
 * B2 raised the tiers (Free 25 → 100, Starter 50 → 500, Growth 200 → 1,500,
 * Pro 1,000 → 4,000) in `billing-plans.js` and on the listing, the plans page
 * and the locked table — and left every EXISTING `Plan.monthlyCredits` where
 * it was. Both real merchants installed before B2, so their first screen said
 * "3 / 25 used" under a listing that says 100. `14-PRICING.md` §6 item 8,
 * *grandfather nobody*, was written for exactly this moment.
 *
 * The rule is favourable by construction: a row is only ever RAISED to the
 * locked number for its plan name, never lowered. A row above the table (an
 * owner-granted allowance, a future promotion) is left alone. A row that is
 * not active is left alone — a cancelled plan's number is history, not an
 * entitlement.
 *
 * PURE. The one-shot script and the self-heal in `getOrCreatePlan` both call
 * this, so there is one definition of "what this row should say".
 */
import { planLimitsFor } from "./billing-plans.js";

/** The locked monthly credits for a plan name, from the one table. */
export function lockedCreditsFor(planName) {
  return Number(planLimitsFor(planName)?.monthlyCredits) || 0;
}

/**
 * What `monthlyCredits` should be for this row. Never less than it is now.
 * @param {{planName: string, status?: string, monthlyCredits: number}} row
 * @returns {number}
 */
export function rebasedCredits(row) {
  const current = Math.max(0, Number(row?.monthlyCredits) || 0);
  if (row?.status && row.status !== "active") return current;
  const locked = lockedCreditsFor(row?.planName);
  return Math.max(current, locked);
}

/** True when the row would change — i.e. it is active and below the table. */
export function needsRebase(row) {
  return rebasedCredits(row) !== Math.max(0, Number(row?.monthlyCredits) || 0);
}

/**
 * Plan the update set for a list of rows: only rows that go UP, with their
 * new value. Used by the script for its before/after counts and by tests to
 * prove nothing is ever lowered.
 */
export function rebasePlan(rows) {
  const out = [];
  for (const r of rows ?? []) {
    if (!needsRebase(r)) continue;
    out.push({ shop: r.shop, planName: r.planName, from: Number(r.monthlyCredits) || 0, to: rebasedCredits(r) });
  }
  return out;
}
