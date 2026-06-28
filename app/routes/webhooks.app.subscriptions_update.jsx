import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { FREE_PLAN, getPlanByKey } from "../utils/plans.server";
import { invalidateCache } from "../utils/cache.server.js";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "APP_SUBSCRIPTIONS_UPDATE") {
    return new Response("Unhandled topic", { status: 422 });
  }

  const sub = payload?.app_subscription;
  if (!sub) return new Response("No subscription in payload", { status: 422 });

  const status = sub.status; // "ACTIVE" | "CANCELLED" | "DECLINED" | "EXPIRED" | "FROZEN"
  const planDef = getPlanByKey(sub.name);

  let planChanged = false;
  if (status === "ACTIVE" && planDef) {
    await prisma.plan.upsert({
      where: { shop },
      update: {
        planName: planDef.planName,
        status: "active",
        monthlyLimit: planDef.monthlyLimit,
        shopifyChargeId: sub.id,
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : null,
      },
      create: {
        shop,
        planName: planDef.planName,
        status: "active",
        monthlyLimit: planDef.monthlyLimit,
        shopifyChargeId: sub.id,
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : null,
      },
    });
    planChanged = true;
  } else if (["CANCELLED", "DECLINED", "EXPIRED"].includes(status)) {
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
    planChanged = true;
  } else if (status === "FROZEN") {
    await prisma.plan.updateMany({
      where: { shop },
      data: { status: "frozen" },
    });
    planChanged = true;
  }

  // Bust the per-shop plan + quota caches so /app/plans and the generation gate
  // reflect the new plan within seconds, instead of after the 5-min cache TTL.
  if (planChanged) {
    const month = new Date().toISOString().slice(0, 7);
    await invalidateCache(`plan:${shop}`);
    await invalidateCache(`canGenerate:${shop}:${month}`);
  }

  return new Response(null, { status: 200 });
};
