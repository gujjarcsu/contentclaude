import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { FREE_PLAN, getPlanByKey } from "../utils/plans.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "APP_SUBSCRIPTIONS_UPDATE") {
    return new Response("Unhandled topic", { status: 422 });
  }

  const sub = payload?.app_subscription;
  if (!sub) return new Response("No subscription in payload", { status: 422 });

  const status = sub.status; // "ACTIVE" | "CANCELLED" | "DECLINED" | "EXPIRED" | "FROZEN"
  const planDef = getPlanByKey(sub.name);

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
  } else if (status === "FROZEN") {
    await prisma.plan.updateMany({
      where: { shop },
      data: { status: "frozen" },
    });
  }

  return new Response(null, { status: 200 });
};
