import { Prisma } from "@prisma/client";
import prisma from "../db.server.js";
import { BILLING_PLANS, FREE_PLAN, getEntitlements } from "./billing-plans.js";
import { getCache, invalidateCache } from "./cache.server.js";
import logger from "./logger.server.js";

export { FREE_PLAN };

// Map a Shopify billing plan key → our internal plan definition. Matches both
// the monthly key and the annual key, so an annual subscription resolves to the
// same plan (same generation limit + entitlements; only the billing interval differs).
export function getPlanByKey(shopifyKey) {
  return Object.values(BILLING_PLANS).find((p) => p.key === shopifyKey || p.annualKey === shopifyKey) ?? null;
}

/**
 * Server-side entitlement check.
 * Returns { allowed: boolean, planName, requiredPlan } so the action
 * can return a structured upgrade prompt.
 */
export async function checkEntitlement(shop, feature) {
  const plan = await getOrCreatePlan(shop);
  const ents = getEntitlements(plan.planName);
  const allowed = !!ents[feature];
  // Find the lowest plan that grants this feature
  const requiredPlan = allowed
    ? null
    : (Object.values(BILLING_PLANS).find((p) => p.entitlements[feature])?.planName ?? "growth");
  return { allowed, planName: plan.planName, requiredPlan };
}

export async function getOrCreatePlan(shop) {
  const plan = await getCache(
    `plan:${shop}`,
    async () => {
      // Phase 0 item 16 — findUnique-then-create is a read-modify-write race. On a
      // fresh install the dashboard loader, the jobs-status poll and the billing
      // reconcile all fire within milliseconds of each other, all miss, and all
      // try to create the row: two of them get P2002 and the merchant's very
      // first page load is a 500. upsert makes it one atomic statement.
      return prisma.plan.upsert({
        where: { shop },
        update: {},
        create: {
          shop,
          planName: FREE_PLAN.planName,
          status: "active",
          monthlyLimit: FREE_PLAN.monthlyLimit,
        },
      });
    },
    60,
  ); // 60-second TTL — plan changes only via billing webhooks which call syncBillingToPlan
  // The Redis cache round-trips values through JSON, so Prisma DateTime fields
  // come back as ISO STRINGS on cache hits — while cache misses return live
  // Date objects. Every consumer must see the same shape, so rehydrate the
  // date fields here. Without this, any shop with a paid subscription (the
  // first non-null currentPeriodEnd this code ever saw in production) got a
  // 500 on the Plans page on every cache-hit load: the loader calls
  // plan.currentPeriodEnd.toISOString(), which does not exist on a string.
  if (plan) {
    for (const field of ["currentPeriodEnd", "createdAt", "updatedAt"]) {
      if (plan[field] && !(plan[field] instanceof Date)) {
        plan[field] = new Date(plan[field]);
      }
    }
  }
  return plan;
}

export async function getMonthlyUsageCount(shop) {
  const month = new Date().toISOString().slice(0, 7);
  return prisma.usageRecord.count({ where: { shop, month } });
}

/**
 * Read-only gate: returns current plan state and usage.
 * Use tryConsumeGeneration() for the actual gate check + atomic write.
 * Result is cached for 60 s to reduce DB load on page loads.
 */
export async function canGenerate(shop) {
  const month = new Date().toISOString().slice(0, 7);
  const cacheKey = `canGenerate:${shop}:${month}`;
  return getCache(
    cacheKey,
    async () => {
      const [plan, usageCount] = await Promise.all([getOrCreatePlan(shop), getMonthlyUsageCount(shop)]);
      const allowed = plan.status === "active" && usageCount < plan.monthlyLimit;
      return {
        allowed,
        usageCount,
        monthlyLimit: plan.monthlyLimit,
        planName: plan.planName,
        remaining: Math.max(0, plan.monthlyLimit - usageCount),
      };
    },
    60,
  );
}

/**
 * Atomic gate + usage record creation in one serializable transaction.
 *
 * Uses SERIALIZABLE isolation so two concurrent requests cannot both
 * pass the limit check before either writes the usage record.
 * In SQLite this is a no-op (single writer already serializes everything).
 * In PostgreSQL this prevents phantom reads.
 *
 * Returns { allowed, planName, monthlyLimit, remaining } — if allowed is
 * true, the UsageRecord has already been written inside the transaction.
 * The caller must NOT write another UsageRecord for the same generation.
 */
export async function tryConsumeGeneration(shop, contentType, productId = null, attempt = 0) {
  const month = new Date().toISOString().slice(0, 7);

  // Every generation — including regenerate, Enhance, A/B variants — consumes
  // exactly one credit. The previous "free first-3-regens" bypass was removed
  // because it allowed unlimited unmetered AI calls on the Free tier (P0-2 fix).
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const plan = await tx.plan.findUnique({ where: { shop } });
        if (!plan || plan.status !== "active") {
          return {
            allowed: false,
            planName: plan?.planName ?? "free",
            monthlyLimit: plan?.monthlyLimit ?? FREE_PLAN.monthlyLimit,
            remaining: 0,
          };
        }

        const usageCount = await tx.usageRecord.count({ where: { shop, month } });

        if (usageCount >= plan.monthlyLimit) {
          return {
            allowed: false,
            planName: plan.planName,
            monthlyLimit: plan.monthlyLimit,
            remaining: 0,
          };
        }

        // Write the record atomically — inside the transaction this is the
        // only writer for this shop in this transaction, preventing double-spend.
        await tx.usageRecord.create({
          data: { shop, month, contentType, productId, tokensUsed: 0 },
        });

        return {
          allowed: true,
          planName: plan.planName,
          monthlyLimit: plan.monthlyLimit,
          remaining: plan.monthlyLimit - usageCount - 1,
        };
      },
      {
        // Prevents phantom reads across concurrent transactions in PostgreSQL.
        // SQLite ignores this option (it's always serializable due to write lock).
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      },
    );
    if (result.allowed) {
      await invalidateCache(`canGenerate:${shop}:${month}`);
    }
    return result;
  } catch (err) {
    // P2034 = "Transaction failed due to a write conflict or a deadlock"
    // This can happen under very high concurrent load with Serializable isolation.
    if (err.code === "P2034") {
      if (attempt < 1) {
        // Retry once after brief jitter — write conflict is transient. Track the
        // retry via the attempt counter, NOT by overloading contentType, so the
        // real contentType is always what gets persisted to UsageRecord.
        const jitter = 50 + Math.random() * 100;
        await new Promise((r) => setTimeout(r, jitter));
        return tryConsumeGeneration(shop, contentType, productId, attempt + 1);
      }
      // Second failure — return safe denial with distinct error tag
      logger.warn(
        { shop, err: err.message },
        "tryConsumeGeneration: P2034 write conflict after retry — denying safely",
      );
      return {
        allowed: false,
        planName: "contention",
        monthlyLimit: 0,
        remaining: 0,
        isContention: true,
      };
    }
    throw err;
  }
}

/**
 * Refund a single generation credit previously taken by tryConsumeGeneration.
 * Used when a multi-credit action (e.g. A/B variants needs 2) acquires the first
 * credit but can't get the rest — the consumed credit must be rolled back so the
 * merchant isn't billed for a generation that never happens. Deletes the most
 * recent matching UsageRecord for the current month and busts the quota cache.
 * Returns true if a row was refunded.
 */
export async function refundGeneration(shop, { productId = null, contentType } = {}) {
  const month = new Date().toISOString().slice(0, 7);
  const row = await prisma.usageRecord.findFirst({
    where: { shop, month, productId, contentType },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!row) return false;
  await prisma.usageRecord.delete({ where: { id: row.id } });
  await invalidateCache(`canGenerate:${shop}:${month}`);
  return true;
}

/**
 * Phase 0 item 5 — a merchant is NEVER charged a credit for a generation they
 * did not get.
 *
 * Every interactive path used to consume the credit and then call the model:
 * a 45 s timeout, a 5xx, an open circuit breaker or an empty completion ate the
 * credit with nothing to show for it. `refundGeneration` existed but was only
 * used for the second A/B credit.
 *
 * Wrap the work instead. The credit is taken first (so the quota gate stays
 * atomic and two tabs cannot both slip past the limit) and given back on any
 * throw, and on any result the caller declares empty.
 *
 * @param {string} shop
 * @param {{contentType: string, productId?: string|null}} key  what is being charged
 * @param {(gate: object) => Promise<any>} work  runs only when a credit was taken
 * @param {{isEmpty?: (result:any) => boolean}} [opts]
 *   isEmpty decides whether the work produced nothing usable; default: falsy,
 *   or an object with no truthy own values.
 * @returns {Promise<{allowed:boolean, gate:object, result?:any, refunded?:boolean}>}
 *   allowed:false → quota exhausted, nothing was charged and `work` never ran.
 *   refunded:true → the work produced nothing and the credit was returned.
 */
export async function withGenerationCredit(shop, { contentType, productId = null }, work, { isEmpty } = {}) {
  const gate = await tryConsumeGeneration(shop, contentType, productId);
  if (!gate.allowed) return { allowed: false, gate };

  const empty =
    isEmpty ??
    ((r) => {
      if (!r) return true;
      if (typeof r === "string") return r.trim() === "";
      if (typeof r === "object") return !Object.values(r).some((v) => (typeof v === "string" ? v.trim() : v));
      return false;
    });

  let result;
  try {
    result = await work(gate);
  } catch (err) {
    await refundGeneration(shop, { productId, contentType }).catch(() => {});
    logger.info(
      { shop, productId, contentType, err: err?.message, event: "generation_credit_refunded" },
      "Generation failed — credit refunded",
    );
    throw err;
  }

  if (empty(result)) {
    await refundGeneration(shop, { productId, contentType }).catch(() => {});
    logger.info(
      { shop, productId, contentType, event: "generation_credit_refunded_empty" },
      "Generation produced nothing usable — credit refunded",
    );
    return { allowed: true, gate, result, refunded: true };
  }

  return { allowed: true, gate, result, refunded: false };
}

/**
 * Phase 0 item 4 — a bulk job may only contain work the quota can pay for.
 *
 * Both bulk entry points enqueued every matching product id (up to 20,000)
 * while the UI beside the button said "your quota covers N". The processor then
 * called the model for each one and only afterwards discovered it had no credit:
 * a Growth merchant with 5,000 products bought 4,800 discarded generations and a
 * job that logged "limit reached" 4,800 times over 24 hours.
 *
 * Slice at creation and record what was left out, so the count is disclosed
 * before the run rather than discovered as failures during it. Pure.
 *
 * @param {string[]} ids   every product the merchant asked for
 * @param {number} remaining  generations left this month
 * @returns {{targetIds: string[], quotaSkipped: number}}
 */
export function sliceToQuota(ids, remaining) {
  const capped = Math.max(0, Number.isFinite(remaining) ? remaining : 0);
  const targetIds = ids.slice(0, capped);
  return { targetIds, quotaSkipped: Math.max(0, ids.length - targetIds.length) };
}

/**
 * Uncached remaining-generations count. `canGenerate` caches for 60 s, which is
 * right for page loads but wrong inside a bulk run: the loop must see credits
 * it has itself just consumed. Phase 0 item 4 uses this for the cheap check
 * before each (expensive) model call.
 * @returns {Promise<number>} 0 when the plan is not active
 */
export async function remainingGenerations(shop) {
  const month = new Date().toISOString().slice(0, 7);
  const [plan, usageCount] = await Promise.all([
    prisma.plan.findUnique({ where: { shop } }),
    prisma.usageRecord.count({ where: { shop, month } }),
  ]);
  if (!plan || plan.status !== "active") return 0;
  return Math.max(0, plan.monthlyLimit - usageCount);
}

/**
 * Phase 0 item 10 — a trial is once per shop, for the life of the shop.
 *
 * `trialDays: 7` is baked into every plan in the billing config, so
 * subscribe → cancel → resubscribe granted an unlimited series of free trials.
 * The Plan row cannot record that: it is deleted on uninstall. The Shop row
 * survives uninstall (that is its whole purpose), so the flag lives there.
 * First-writer-wins; never reset by a reinstall.
 */
export async function markTrialUsed(shop, trialEndsAt = null) {
  try {
    await prisma.shop.updateMany({
      where: { shop, trialUsedAt: null },
      data: { trialUsedAt: new Date() },
    });
    if (trialEndsAt) {
      await prisma.plan.updateMany({ where: { shop }, data: { trialEndsAt } });
    }
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "markTrialUsed failed (non-fatal)");
  }
}

/** Has this shop ever started a trial? Used to send trialDays: 0 the next time. */
export async function hasUsedTrial(shop) {
  try {
    const row = await prisma.shop.findUnique({ where: { shop }, select: { trialUsedAt: true } });
    return !!row?.trialUsedAt;
  } catch (err) {
    // Unknown → assume used. Wrongly charging a second trial is a revenue leak;
    // wrongly withholding one is visible and recoverable by support.
    logger.warn({ shop, err: err?.message }, "hasUsedTrial lookup failed — assuming the trial was used");
    return true;
  }
}

/**
 * Phase 0 item 10 — the monthly usage count must survive uninstall.
 *
 * Uninstall deletes Plan and every UsageRecord, so uninstall + reinstall handed
 * out a fresh 25 free generations on demand. Called from the uninstall handler
 * BEFORE the deletion transaction, it copies this month's count onto the Shop
 * row, which is not deleted. A number, not content — nothing here identifies a
 * customer, so it is safe to keep (and shop/redact anonymises the row anyway).
 * Never throws.
 */
export async function captureUsageCarryover(shop) {
  const month = new Date().toISOString().slice(0, 7);
  try {
    const used = await prisma.usageRecord.count({ where: { shop, month } });
    await prisma.shop.updateMany({ where: { shop }, data: { usageMonth: month, usageCarryover: used } });
    logger.info(
      { shop, month, used, event: "usage_carryover_captured" },
      "Usage carried over for a possible reinstall",
    );
    return used;
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "captureUsageCarryover failed (non-fatal)");
    return 0;
  }
}

/**
 * Restore the carried-over usage on reinstall, so the free allowance is monthly
 * rather than per-install. Only applies within the SAME calendar month — a new
 * month is a genuinely fresh allowance. Idempotent: it tops the month up to the
 * carried figure rather than adding to it. Never throws.
 */
export async function restoreUsageCarryover(shop) {
  const month = new Date().toISOString().slice(0, 7);
  try {
    const row = await prisma.shop.findUnique({
      where: { shop },
      select: { usageMonth: true, usageCarryover: true },
    });
    if (!row || row.usageMonth !== month || !row.usageCarryover) return 0;

    const present = await prisma.usageRecord.count({ where: { shop, month } });
    const missing = row.usageCarryover - present;
    if (missing <= 0) return 0;

    await prisma.usageRecord.createMany({
      data: Array.from({ length: missing }, () => ({
        shop,
        month,
        contentType: "carryover",
        productId: null,
        tokensUsed: 0,
      })),
    });
    await invalidateCache(`canGenerate:${shop}:${month}`);
    logger.info(
      { shop, month, restored: missing, event: "usage_carryover_restored" },
      "Reinstall did not reset this month's usage",
    );
    return missing;
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "restoreUsageCarryover failed (non-fatal)");
    return 0;
  }
}

/**
 * Sync the active Shopify subscription into our Plan table.
 * Called from Plans page loader and subscription webhook.
 */
export async function syncBillingToPlan(shop, appSubscriptions) {
  const activeSub = (appSubscriptions ?? []).find((s) => s.status === "ACTIVE");

  if (activeSub) {
    const planDef = getPlanByKey(activeSub.name);
    if (planDef) {
      // What the shop was on BEFORE this write — needed to tell a genuine plan
      // change from the same subscription being re-synced. Read defensively:
      // this exists only to improve an ATTRIBUTION, and nothing about it is
      // allowed to interfere with recording the plan the merchant just bought.
      let prev = null;
      try {
        prev = await prisma.plan.findUnique({
          where: { shop },
          select: { planName: true, shopifyChargeId: true },
        });
      } catch {
        prev = null;
      }
      await prisma.plan.upsert({
        where: { shop },
        update: {
          planName: planDef.planName,
          status: "active",
          monthlyLimit: planDef.monthlyLimit,
          shopifyChargeId: activeSub.id,
          currentPeriodEnd: activeSub.currentPeriodEnd ? new Date(activeSub.currentPeriodEnd) : null,
        },
        create: {
          shop,
          planName: planDef.planName,
          status: "active",
          monthlyLimit: planDef.monthlyLimit,
          shopifyChargeId: activeSub.id,
          currentPeriodEnd: activeSub.currentPeriodEnd ? new Date(activeSub.currentPeriodEnd) : null,
        },
      });
      // The shop has now held a paid subscription, so its one trial is spent
      // (item 10 — otherwise cancel + resubscribe grants another).
      await markTrialUsed(shop, activeSub.trialEndsAt ? new Date(activeSub.trialEndsAt) : null);
      await invalidatePlanCaches(shop);

      // Phase 3 item 3.4 — attribute the subscription to the prompt the
      // merchant actually acted on, and record WHICH of the two upsell
      // surfaces it was. This runs AFTER the plan write and both calls swallow
      // their own errors, deliberately: getting an attribution wrong must
      // never be able to cost a merchant the plan they just paid for.
      //
      // attributePlanChoice returns null for a re-sync of the same
      // subscription and for an upgrade with no prompt behind it — an organic
      // upgrade, which is recorded as such rather than credited to whatever
      // prompt happened to be nearest.
      try {
        const { attributePlanChoice } = await import("./upgradePrompts.server.js");
        const promptId = await attributePlanChoice(shop, {
          planName: planDef.planName,
          chargeId: activeSub.id,
          prevChargeId: prev?.shopifyChargeId ?? null,
          prevPlanName: prev?.planName ?? "free",
        });
        if (promptId) {
          const { stampUpgradeSource } = await import("./quotaSurfaces.server.js");
          await stampUpgradeSource(shop, promptId);
        }
      } catch (err) {
        logger.warn({ shop, err: err?.message }, "upgrade attribution failed (non-fatal)");
      }
      return;
    }
  }

  // No active paid subscription in the given list → downgrade to free.
  // AUDIT: every downgrade is logged with the evidence it was based on. Callers
  // MUST only pass an authoritative list here (App Store 1.2.3): the reconcile
  // passes the test-agnostic active-subscriptions result and only when the
  // lookup succeeded; the cancel action passes [] only after billing.cancel
  // genuinely succeeded; the webhook writes Free directly on CANCELLED/EXPIRED.
  logger.warn(
    {
      shop,
      subCount: (appSubscriptions ?? []).length,
      subs: (appSubscriptions ?? []).map((s) => ({ name: s.name, status: s.status, test: s.test })),
    },
    "billing: downgrading plan to Free (no ACTIVE subscription in authoritative list)",
  );
  await prisma.plan.upsert({
    where: { shop },
    update: {
      planName: FREE_PLAN.planName,
      status: "active",
      monthlyLimit: FREE_PLAN.monthlyLimit,
      shopifyChargeId: null,
      currentPeriodEnd: null,
    },
    create: {
      shop,
      planName: FREE_PLAN.planName,
      status: "active",
      monthlyLimit: FREE_PLAN.monthlyLimit,
    },
  });
  await invalidatePlanCaches(shop);
}

/**
 * Bust BOTH per-shop plan caches.
 *
 * Phase 0 item 8: syncBillingToPlan only dropped `plan:<shop>`, but the
 * generation gate reads `canGenerate:<shop>:<month>` — which caches
 * `{allowed:false, remaining:0}` for 60 s. A merchant who upgraded because they
 * hit the limit was still told "limit reached" for up to a minute after paying,
 * on the one screen where that message is most damaging.
 */
export async function invalidatePlanCaches(shop) {
  const month = new Date().toISOString().slice(0, 7);
  await invalidateCache(`plan:${shop}`);
  await invalidateCache(`canGenerate:${shop}:${month}`);
}
