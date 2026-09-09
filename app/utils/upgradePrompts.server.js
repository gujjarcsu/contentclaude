/**
 * Upgrade prompts (brief item 5) — truthful, quota-aware, measured.
 *
 * One UpgradePrompt row per (shop, trigger, surface, month). A loader records
 * the CONDITION (n, fit plan, …) via recordPromptCondition — that is not an
 * exposure. Exposures and clicks are confirmed by the client
 * (markPromptEvent: shown / opened / dismissed / cta_clicked). Arrival on the
 * Plans page and a subscribe request are stamped by the Plans loader/action.
 * "Plan chosen" is attributed ONLY from the authoritative ACTIVE subscription
 * (syncBillingToPlan / subscriptions webhook) when the subscription id
 * changes, to the newest row the merchant actually acted on inside the
 * window — never from a view-only exposure. No billing decision is touched.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { scanCatalogGaps } from "./catalogGaps.server.js";
import { fitPlanFor, PLAN_LABELS, quotaResetDate, fmtDay, fmtMonth } from "./planFit.js";

const D = 24 * 3_600_000;
export const CLICK_WINDOW_MS = 7 * D;
export const SUBSCRIBE_WINDOW_MS = 24 * 3_600_000;
export const monthKey = (now = new Date()) => now.toISOString().slice(0, 7);

/** Upsert the condition row for (shop, trigger, surface, month). Never throws. → row | null */
export async function recordPromptCondition({ shop, trigger, surface, month, n, nDefinition = "catalog_gaps", truncated = false, remaining = 0, monthlyLimit = 0, currentPlan = "free", fitPlanName = null, monthsToCover = 1, now = new Date() }) {
  if (!shop || !prisma.upgradePrompt?.upsert) return null;
  try {
    const m = month || monthKey(now);
    const data = { n, nDefinition, truncated, remaining, monthlyLimit, currentPlan, fitPlanName, monthsToCover, lastSeenAt: now };
    return await prisma.upgradePrompt.upsert({
      where: { shop_trigger_surface_month: { shop, trigger, surface, month: m } },
      update: data,
      create: { shop, trigger, surface, month: m, ...data },
    });
  } catch (err) {
    logger.warn({ shop, trigger, surface, err: err?.message }, "recordPromptCondition failed (non-fatal)");
    return null;
  }
}

/**
 * The item-5a upsell for a surface. null when nothing should render; a
 * { neutral: true } object when the quota is exhausted but there is nothing
 * measurable to sell (N = 0 or already on the top plan). Never throws.
 */
export async function getUpsell({ admin, shop, plan, usageCount, surface, nDefinition = "catalog_gaps", n: givenN = null, truncated = false, needsBulk = false, now = new Date() }) {
  try {
    const remaining = Math.max(0, (plan?.monthlyLimit ?? 0) - (usageCount ?? 0));
    if (remaining > 0 || plan?.status !== "active") return null;
    let n = givenN;
    let trunc = truncated;
    let scanned = null;
    if (n == null) {
      if (!admin) return null;
      const gaps = await scanCatalogGaps(admin, shop);
      if (!gaps || gaps.error) return null;
      n = gaps.needsContent;
      trunc = !!gaps.truncated;
      scanned = gaps.scanned;
    }
    const fit = fitPlanFor({ n, currentPlan: plan.planName, needsBulk });
    const base = {
      n, truncated: trunc, scanned, nDefinition, remaining: 0,
      monthlyLimit: plan.monthlyLimit, planName: plan.planName, planLabel: PLAN_LABELS[plan.planName] ?? plan.planName,
      monthName: fmtMonth(now), resetDate: fmtDay(quotaResetDate(now)),
    };
    if (n === 0 || !fit) return { ...base, neutral: true, fit: null, promptId: null };
    const row = await recordPromptCondition({
      shop, trigger: "quota_exhausted", surface, month: monthKey(now), n, nDefinition, truncated: trunc, remaining: 0,
      monthlyLimit: plan.monthlyLimit, currentPlan: plan.planName, fitPlanName: fit.planName, monthsToCover: fit.monthsToCover, now,
    });
    return { ...base, neutral: false, fit, promptId: row?.id ?? null };
  } catch (err) {
    logger.warn({ shop, surface, err: err?.message }, "getUpsell failed (non-fatal)");
    return null;
  }
}

/** Client-confirmed events. Shop-scoped: a foreign promptId is a no-op. Never throws. → count */
export async function markPromptEvent(shop, promptId, event, now = new Date()) {
  if (!shop || !promptId || !prisma.upgradePrompt?.updateMany) return 0;
  const data =
    event === "shown" ? { shownCount: { increment: 1 }, lastShownAt: now }
    : event === "opened" ? { openedAt: now }
    : event === "dismissed" ? { dismissedAt: now }
    : event === "cta_clicked" ? { ctaClickedAt: now }
    : null;
  if (!data) return 0;
  try {
    let count = 0;
    if (event === "shown") {
      // firstShownAt only once
      const first = await prisma.upgradePrompt.updateMany({ where: { id: promptId, shop, firstShownAt: null }, data: { firstShownAt: now } });
      const r = await prisma.upgradePrompt.updateMany({ where: { id: promptId, shop }, data });
      count = r.count;
      if (first.count > 0) logger.info({ shop, event: "upgrade_prompt_shown", promptId }, "upgrade prompt shown");
    } else {
      const r = await prisma.upgradePrompt.updateMany({ where: { id: promptId, shop }, data });
      count = r.count;
      if (count > 0) logger.info({ shop, event: `upgrade_prompt_${event}`, promptId }, `upgrade prompt ${event}`);
    }
    return count;
  } catch (err) {
    logger.warn({ shop, promptId, event, err: err?.message }, "markPromptEvent failed (non-fatal)");
    return 0;
  }
}

/** Plans page loader saw ?prompt= (first arrival only). Never throws. */
export async function markPromptArrived(shop, promptId, now = new Date()) {
  if (!shop || !promptId || !prisma.upgradePrompt?.updateMany) return 0;
  try {
    const r = await prisma.upgradePrompt.updateMany({ where: { id: promptId, shop, arrivedAtPlansAt: null }, data: { arrivedAtPlansAt: now } });
    if (r.count > 0) logger.info({ shop, event: "upgrade_prompt_arrived", promptId }, "upgrade prompt arrived at plans");
    return r.count;
  } catch (err) {
    logger.warn({ shop, promptId, err: err?.message }, "markPromptArrived failed (non-fatal)");
    return 0;
  }
}

/** Plans action, BEFORE billing.request(). Never throws. */
export async function markSubscribeRequested(shop, promptId, planKey, now = new Date()) {
  if (!shop || !promptId || !prisma.upgradePrompt?.updateMany) return 0;
  try {
    const r = await prisma.upgradePrompt.updateMany({ where: { id: promptId, shop }, data: { subscribeRequestedAt: now, planKeyRequested: planKey ? String(planKey).slice(0, 40) : null } });
    if (r.count > 0) logger.info({ shop, event: "upgrade_prompt_subscribe_requested", promptId, planKey }, "upgrade prompt subscribe requested");
    return r.count;
  } catch (err) {
    logger.warn({ shop, promptId, err: err?.message }, "markSubscribeRequested failed (non-fatal)");
    return 0;
  }
}

/**
 * Called from the plan-sync paths AFTER the Plan write, with the previous
 * charge id. Attributes at most once per subscription, only to a row the
 * merchant acted on (subscribe request ≤ 24 h, CTA click / arrival ≤ 7 d).
 * Never throws; never affects the plan write.
 */
export async function attributePlanChoice(shop, { planName, chargeId, prevChargeId = null, prevPlanName = "free", now = new Date() } = {}) {
  try {
    if (!shop || !chargeId || chargeId === prevChargeId) return null; // same subscription re-synced → not a choice
    if (!prisma.upgradePrompt?.findFirst) return null;
    if (await prisma.upgradePrompt.count({ where: { chargeId } })) return null; // attributes at most once
    const row = await prisma.upgradePrompt.findFirst({
      where: {
        shop,
        planChosen: null,
        OR: [
          { subscribeRequestedAt: { gte: new Date(now.getTime() - SUBSCRIBE_WINDOW_MS) } },
          { ctaClickedAt: { gte: new Date(now.getTime() - CLICK_WINDOW_MS) } },
          { arrivedAtPlansAt: { gte: new Date(now.getTime() - CLICK_WINDOW_MS) } },
        ],
      },
      orderBy: [{ subscribeRequestedAt: "desc" }, { ctaClickedAt: "desc" }, { arrivedAtPlansAt: "desc" }],
    });
    if (!row) {
      logger.info({ shop, event: "upgrade_organic", planName, chargeId }, "plan chosen without a prompt");
      return null;
    }
    await prisma.upgradePrompt.update({ where: { id: row.id }, data: { planChosen: planName, planChosenAt: now, chargeId, planChosenFrom: prevPlanName ?? "free" } });
    logger.info({ shop, event: "upgrade_prompt_attributed", promptId: row.id, trigger: row.trigger, surface: row.surface, fitPlanName: row.fitPlanName, planChosen: planName, chargeId }, "upgrade prompt → plan chosen");
    return row.id;
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "attributePlanChoice failed (non-fatal)");
    return null;
  }
}

/** Subscription DECLINED / EXPIRED: stamp the newest recent, unattributed subscribe request. Never throws. */
export async function markPromptDeclined(shop, now = new Date()) {
  try {
    if (!shop || !prisma.upgradePrompt?.findFirst) return null;
    const row = await prisma.upgradePrompt.findFirst({
      where: { shop, planChosen: null, subscribeRequestedAt: { gte: new Date(now.getTime() - SUBSCRIBE_WINDOW_MS) } },
      orderBy: { subscribeRequestedAt: "desc" },
    });
    if (!row) return null;
    await prisma.upgradePrompt.update({ where: { id: row.id }, data: { declinedAt: now } });
    logger.info({ shop, event: "upgrade_prompt_declined", promptId: row.id }, "upgrade prompt: subscription declined");
    return row.id;
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "markPromptDeclined failed (non-fatal)");
    return null;
  }
}
