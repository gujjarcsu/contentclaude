// Token-free verification (HMAC only) — see app/utils/webhookAuth.server.js.
// Billing state must keep arriving even when the shop's offline token has
// expired; authenticate.webhook() refreshes that token first and 500s, which
// is the same retry-storm trap fixed for app/uninstalled in 08690b9.
import { verifyShopifyWebhook } from "../utils/webhookAuth.server.js";
import prisma from "../db.server.js";
import { FREE_PLAN, getPlanByKey, markTrialUsed, invalidatePlanCaches } from "../utils/plans.server.js";
import { getActiveSubscriptionsForShop } from "../utils/activeSubscriptions.server.js";
import logger from "../utils/logger.server.js";

export const action = async ({ request }) => {
  const { topic, shop, payload, duplicate } = await verifyShopifyWebhook(request);

  if (topic !== "APP_SUBSCRIPTIONS_UPDATE") {
    return new Response("Unhandled topic", { status: 422 });
  }

  if (duplicate) return new Response("Duplicate", { status: 200 });

  const sub = payload?.app_subscription;
  if (!sub) return new Response("No subscription in payload", { status: 422 });

  const status = sub.status; // "ACTIVE" | "CANCELLED" | "DECLINED" | "EXPIRED" | "FROZEN"
  const planDef = getPlanByKey(sub.name);

  // Phase 0 item 8b — this payload is the REST-shaped one: the subscription's
  // GraphQL id arrives as `admin_graphql_api_id`, not `id`. Reading `sub.id`
  // wrote null into shopifyChargeId on every ACTIVE, which then made the
  // CANCELLED comparison below impossible and left the cancel path unable to
  // tell which subscription had ended. The payload also carries no
  // current_period_end at all, so `sub.current_period_end ? … : null` nulled a
  // known-good renewal date on every single ACTIVE delivery.
  const chargeId = sub.admin_graphql_api_id ?? sub.id ?? null;
  const periodEndRaw = sub.current_period_end ?? sub.currentPeriodEnd ?? null;
  const periodEnd = periodEndRaw ? new Date(periodEndRaw) : null;

  let planChanged = false;

  if (status === "ACTIVE" && planDef) {
    const base = {
      planName: planDef.planName,
      status: "active",
      monthlyLimit: planDef.monthlyLimit,
      shopifyChargeId: chargeId,
      // Only write the period end when the delivery actually carried one.
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
    };
    await prisma.plan.upsert({ where: { shop }, update: base, create: { shop, ...base } });
    // The shop has now held a paid subscription — its one trial is spent.
    await markTrialUsed(shop);
    planChanged = true;
  } else if (["CANCELLED", "DECLINED", "EXPIRED"].includes(status)) {
    // Phase 0 item 8a — a Starter → Growth upgrade emits CANCELLED (old sub)
    // and ACTIVE (new sub) with NO ordering guarantee. Downgrading on any
    // CANCELLED meant that whenever the CANCELLED landed second, the merchant
    // sat on Free while Shopify billed them for Growth.
    //
    // Two guards, in order of cost:
    //   1. If we know which subscription is ours and this is a DIFFERENT one,
    //      it is the superseded half of an upgrade — ignore it outright.
    //   2. Otherwise ask Shopify what is active right now. Only an authoritative
    //      "nothing is active" downgrades; an unreachable Shopify holds the plan.
    const plan = await prisma.plan.findUnique({ where: { shop }, select: { shopifyChargeId: true } });
    if (plan?.shopifyChargeId && chargeId && plan.shopifyChargeId !== chargeId) {
      logger.info(
        {
          shop,
          event: "subscription_cancelled_superseded",
          cancelled: chargeId,
          current: plan.shopifyChargeId,
        },
        "CANCELLED for a subscription that is not the current one — ignored (upgrade in flight)",
      );
      return new Response(null, { status: 200 });
    }

    const { ok, subs, reason } = await getActiveSubscriptionsForShop(shop);
    if (!ok) {
      // Never downgrade on ambiguity. The Plans page reconcile and the next
      // webhook are the backstop.
      logger.warn(
        { shop, reason, event: "subscription_cancelled_unverified" },
        "CANCELLED could not be verified against Shopify — plan held, not downgraded",
      );
      return new Response(null, { status: 200 });
    }

    const stillActive = subs.find((s) => s.status === "ACTIVE" && getPlanByKey(s.name));
    if (stillActive) {
      const def = getPlanByKey(stillActive.name);
      const base = {
        planName: def.planName,
        status: "active",
        monthlyLimit: def.monthlyLimit,
        shopifyChargeId: stillActive.id,
        ...(stillActive.currentPeriodEnd ? { currentPeriodEnd: new Date(stillActive.currentPeriodEnd) } : {}),
      };
      await prisma.plan.upsert({ where: { shop }, update: base, create: { shop, ...base } });
      logger.info(
        { shop, event: "subscription_cancelled_but_another_active", plan: def.planName },
        "CANCELLED arrived while another subscription is active — kept the paid plan",
      );
      planChanged = true;
    } else {
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
      logger.info(
        { shop, status, event: "subscription_downgraded_to_free" },
        "No active subscription remains — plan is Free",
      );
      planChanged = true;
    }
  } else if (status === "FROZEN") {
    await prisma.plan.updateMany({ where: { shop }, data: { status: "frozen" } });
    planChanged = true;
  }

  // Bust the per-shop plan AND quota caches so /app/plans and the generation
  // gate reflect the new plan within seconds. Busting only `plan:` left the
  // generation gate answering "limit reached" for up to 60 s after an upgrade.
  if (planChanged) {
    await invalidatePlanCaches(shop);
  }

  return new Response(null, { status: 200 });
};
