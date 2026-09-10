/**
 * Quota arithmetic — the client-safe half.
 *
 * This exists for the reason `productState.js` exists. The rule lived in
 * `quotaSurfaces.server.js`, which imports Prisma, so no component could import
 * it — and four components re-derived it by hand:
 *
 *   app/routes/app._index.jsx     Math.min(100, Math.round((usageCount / plan.monthlyLimit) * 100))
 *   app/routes/app.plans.jsx      the same, no zero guard
 *   app/routes/app.products.jsx   the same, WITH a zero guard
 *   app/routes/app.blog.jsx       the same, WITH a zero guard
 *
 * Two of the four had no `monthlyLimit > 0` guard, so on a plan with no limit
 * the division is `n / 0` → `Infinity` → capped to **100**. Home and Plans told
 * a merchant on an unmetered plan that they had used 100% of their quota, with
 * a red progress bar, while Products and Blog on the same store said 0%.
 *
 * Nobody wrote that bug twice on purpose. It is what happens when the correct
 * rule is one import away and unreachable, so the fix is not "add the guard in
 * two more places" — it is that there is one function and everything calls it.
 */

/** At or above this percentage the warning banner appears. */
export const WARN_AT_PCT = 80;
/** How long a dismissal of that banner lasts. */
export const DISMISS_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Percent of the monthly allowance used, 0-100. Pure.
 *
 * Capped at 100 because reaching a quota is 100%, never 104% — a merchant who
 * carried usage over is not "104% used", they are out.
 *
 * A limit of 0 or less means UNMETERED, and returns 0. It does not mean
 * "everything is used up", which is what the un-guarded division produced.
 */
export function quotaPct(usageCount, monthlyLimit) {
  const limit = Number(monthlyLimit) || 0;
  if (limit <= 0) return 0;
  const used = Math.max(0, Number(usageCount) || 0);
  return Math.min(100, Math.round((used / limit) * 100));
}

/**
 * Which of the three states this shop is in. Pure.
 *
 *   ok          below the warning threshold, or unmetered
 *   warn        at or above WARN_AT_PCT, but not out
 *   exhausted   at or over the limit
 */
export function quotaLevel(usageCount, monthlyLimit) {
  const limit = Number(monthlyLimit) || 0;
  if (limit <= 0) return "ok";
  const used = Math.max(0, Number(usageCount) || 0);
  if (used >= limit) return "exhausted";
  return quotaPct(used, limit) >= WARN_AT_PCT ? "warn" : "ok";
}

/** Generations left. Never negative, never NaN. Pure. */
export function quotaRemaining(usageCount, monthlyLimit) {
  const limit = Number(monthlyLimit) || 0;
  if (limit <= 0) return 0;
  return Math.max(0, limit - (Number(usageCount) || 0));
}

/**
 * Is a dismissal of the warning banner still in force? Pure.
 * A missing dismissal is not dismissed; an unreadable one is not dismissed;
 * one older than the window has expired and the banner returns.
 */
export function dismissalActive(dismissedAt, now = new Date(), days = DISMISS_DAYS) {
  if (!dismissedAt) return false;
  const t = new Date(dismissedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t < days * DAY_MS;
}
