/**
 * Quota-aware conversion — Phase 3 item 3.4.
 *
 * A merchant who hit their quota used to meet SIX upsell surfaces: the Home
 * hero, the Home usage card, a Products banner, the Products bulk panel, the
 * product page twice, and Optimize. Each one was defensible on its own and the
 * sum was not: the app spent a merchant's worst moment — the moment it stopped
 * doing what they wanted — asking them for money six times.
 *
 * Two survive:
 *
 *   `warn`       at >= 80% used, ONE dismissible banner, on Home and Products
 *                only. Dismissal sticks for 7 days, server-side.
 *   `exhausted`  at 100%, the generate/optimise action is REPLACED (not
 *                hidden) by a card saying what a bigger plan includes.
 *
 * Replaced rather than hidden is the important half. A button that vanishes
 * reads as a bug; a button that has been swapped for an explanation of why it
 * cannot run, and what would make it run, is the app telling the truth. And
 * everything that does NOT cost a generation keeps working at 100%: the audit
 * still runs, drafts can still be reviewed, approved and published. Being out
 * of quota stops new generation, not the app.
 *
 * The `from=` on the upgrade link is what makes this measurable. It is recorded
 * on the prompt row when the merchant arrives at Plans, and on the `Shop` row
 * when a subscription actually activates — so the question "which of the two
 * surfaces is doing the work" has an answer, rather than an opinion.
 */
import logger from "./logger.server.js";
import prisma from "../db.server.js";
import { fitPlanFor, PLAN_LABELS, quotaResetDate, fmtDay, fmtMonth } from "./planFit.js";
import { monthKey, recordPromptCondition } from "./upgradePrompts.server.js";
import { quotaLevel, quotaPct, dismissalActive } from "./quota.js";

// The pure arithmetic now lives in quota.js so COMPONENTS can import it. It
// used to live here, behind a Prisma import, and four screens re-derived it by
// hand — two of them without the zero guard, so an unmetered plan rendered as
// 100% used. Same shape as the productState.js bug.
export { WARN_AT_PCT, DISMISS_DAYS, quotaLevel, quotaPct, quotaRemaining, dismissalActive } from "./quota.js";

/** Where the `from=` values come from, so the two surfaces stay tellable apart. */
export const FROM_WARN = "quota80";
export const FROM_EXHAUSTED = "quota100";
export const KNOWN_FROM = Object.freeze([FROM_WARN, FROM_EXHAUSTED]);

/** Only these two screens carry the warning banner. Everything else stays quiet. */
export const WARN_SURFACES = Object.freeze(["dashboard", "products"]);

/**
 * The 80%-used warning banner for one surface, or null.
 *
 * Returns null — the banner does not render — when the shop is not in the warn
 * band, when the surface is not one of the two that carry it, or when the
 * merchant dismissed it inside the last 7 days. Never throws: a failure here
 * costs an upsell, and an upsell is never worth a broken screen.
 *
 * The dismissal is stored on the `UpgradePrompt` row rather than in the
 * browser, so it holds across the merchant's devices and does not come back
 * when they clear site data — the same reasoning as the Phase 2.4 explainer.
 * It is written by the existing `markPromptEvent(shop, id, "dismissed")` path
 * through /app/upgrade-prompt; there is deliberately no second writer here,
 * because two functions setting the same column is how they drift apart.
 */
export async function getQuotaWarning({ shop, plan, usageCount, surface, now = new Date() }) {
  try {
    if (!WARN_SURFACES.includes(surface)) return null;
    if (plan?.status && plan.status !== "active") return null;
    const monthlyLimit = plan?.monthlyLimit ?? 0;
    if (quotaLevel(usageCount, monthlyLimit) !== "warn") return null;

    const remaining = Math.max(0, monthlyLimit - (usageCount ?? 0));
    const planName = plan?.planName ?? "free";
    // The fit plan for "keep going at this rate": the merchant is not out yet,
    // so what they need is headroom, not a count of unfinished products.
    const fit = fitPlanFor({ n: monthlyLimit, currentPlan: planName });
    if (!fit) return null; // already on the top plan — nothing honest to sell

    const row = await recordPromptCondition({
      shop,
      trigger: "quota_80",
      surface,
      month: monthKey(now),
      n: usageCount ?? 0,
      nDefinition: "generations_used",
      remaining,
      monthlyLimit,
      currentPlan: planName,
      fitPlanName: fit.planName,
      monthsToCover: fit.monthsToCover,
      now,
    });

    if (dismissalActive(row?.dismissedAt, now)) return null;

    return {
      level: "warn",
      promptId: row?.id ?? null,
      from: FROM_WARN,
      usageCount: usageCount ?? 0,
      monthlyLimit,
      remaining,
      pct: quotaPct(usageCount, monthlyLimit),
      planName,
      planLabel: PLAN_LABELS[planName] ?? planName,
      monthName: fmtMonth(now),
      resetDate: fmtDay(quotaResetDate(now)),
      fit,
    };
  } catch (err) {
    logger.warn({ shop, surface, err: err?.message }, "getQuotaWarning failed (non-fatal)");
    return null;
  }
}

/**
 * Read and validate a `from=` parameter. Pure.
 * Anything we did not mint is discarded rather than stored: an attribution
 * a merchant can type into their own URL bar is not an attribution.
 */
export function normalizeFrom(raw) {
  const v = String(raw ?? "").trim();
  return KNOWN_FROM.includes(v) ? v : null;
}

/**
 * Record which surface a merchant arrived at Plans from. Never throws.
 * Idempotent-ish: the first `from` for a prompt wins, so a merchant who
 * wanders back to Plans later does not overwrite where they actually came from.
 */
export async function recordArrivedFrom(shop, promptId, from) {
  const value = normalizeFrom(from);
  try {
    if (!shop || !promptId || !value) return false;
    const r = await prisma.upgradePrompt.updateMany({
      where: { id: promptId, shop, arrivedFrom: null },
      data: { arrivedFrom: value },
    });
    return r.count === 1;
  } catch (err) {
    logger.warn({ shop, promptId, err: err?.message }, "recordArrivedFrom failed (non-fatal)");
    return false;
  }
}

/**
 * Stamp the surface an ACTIVATED subscription came from onto the Shop row.
 *
 * Called after the plan write, from the same place `attributePlanChoice` is
 * called. Takes the attributed prompt id, reads its `arrivedFrom`, and writes
 * it. A subscription with no prompt behind it leaves the column null, which is
 * the truthful record of an organic upgrade — it is never guessed.
 *
 * Never throws, and never affects the plan write: getting the attribution wrong
 * must not be able to cost a merchant the plan they paid for.
 */
export async function stampUpgradeSource(shop, promptId) {
  try {
    if (!shop || !promptId) return null;
    const row = await prisma.upgradePrompt.findUnique({
      where: { id: promptId },
      select: { arrivedFrom: true, trigger: true },
    });
    // Fall back to the trigger when the merchant reached Plans another way:
    // the prompt row still knows which surface generated the condition.
    const source =
      normalizeFrom(row?.arrivedFrom) ??
      (row?.trigger === "quota_80" ? FROM_WARN : row?.trigger === "quota_exhausted" ? FROM_EXHAUSTED : null);
    if (!source) return null;
    await prisma.shop.updateMany({ where: { shop }, data: { upgradePromptSource: source } });
    logger.info({ shop, promptId, source, event: "upgrade_source_recorded" }, "upgrade source recorded");
    return source;
  } catch (err) {
    logger.warn({ shop, promptId, err: err?.message }, "stampUpgradeSource failed (non-fatal)");
    return null;
  }
}
