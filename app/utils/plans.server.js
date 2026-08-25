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
  return Object.values(BILLING_PLANS).find(
    (p) => p.key === shopifyKey || p.annualKey === shopifyKey
  ) ?? null;
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
  const plan = await getCache(`plan:${shop}`, async () => {
    const existing = await prisma.plan.findUnique({ where: { shop } });
    if (existing) return existing;
    return prisma.plan.create({
      data: {
        shop,
        planName: FREE_PLAN.planName,
        status: "active",
        monthlyLimit: FREE_PLAN.monthlyLimit,
      },
    });
  }, 60); // 60-second TTL — plan changes only via billing webhooks which call syncBillingToPlan
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
  return getCache(cacheKey, async () => {
    const [plan, usageCount] = await Promise.all([
      getOrCreatePlan(shop),
      getMonthlyUsageCount(shop),
    ]);
    const allowed = plan.status === "active" && usageCount < plan.monthlyLimit;
    return {
      allowed,
      usageCount,
      monthlyLimit: plan.monthlyLimit,
      planName: plan.planName,
      remaining: Math.max(0, plan.monthlyLimit - usageCount),
    };
  }, 60);
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
      }
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
      logger.warn({ shop, err: err.message }, "tryConsumeGeneration: P2034 write conflict after retry — denying safely");
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
 * Sync the active Shopify subscription into our Plan table.
 * Called from Plans page loader and subscription webhook.
 */
export async function syncBillingToPlan(shop, appSubscriptions) {
  const activeSub = (appSubscriptions ?? []).find((s) => s.status === "ACTIVE");

  if (activeSub) {
    const planDef = getPlanByKey(activeSub.name);
    if (planDef) {
      await prisma.plan.upsert({
        where: { shop },
        update: {
          planName: planDef.planName,
          status: "active",
          monthlyLimit: planDef.monthlyLimit,
          shopifyChargeId: activeSub.id,
          currentPeriodEnd: activeSub.currentPeriodEnd
            ? new Date(activeSub.currentPeriodEnd)
            : null,
        },
        create: {
          shop,
          planName: planDef.planName,
          status: "active",
          monthlyLimit: planDef.monthlyLimit,
          shopifyChargeId: activeSub.id,
          currentPeriodEnd: activeSub.currentPeriodEnd
            ? new Date(activeSub.currentPeriodEnd)
            : null,
        },
      });
      await invalidateCache(`plan:${shop}`);
      return;
    }
  }

  // No active paid subscription → downgrade to free.
  // RECONCILE_DIAG: log EVERY downgrade with the evidence it was based on.
  import("./logger.server.js").then((m) => m.default.warn(
    { shop, subCount: (appSubscriptions ?? []).length, subs: (appSubscriptions ?? []).map((s) => ({ name: s.name, status: s.status, test: s.test })) },
    "SYNC_DIAG downgrading to FREE (no ACTIVE sub in the given list)"
  )).catch(() => {});
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
  await invalidateCache(`plan:${shop}`);
}
