#!/usr/bin/env node
/**
 * B8 — GRANDFATHER NOBODY, verified rather than assumed.
 *
 * `14-PRICING.md` §6 item 8: "There are no paying merchants. This is the only
 * moment this change is free." That is a claim about production, and the whole
 * pricing change rests on it — allowances multiplied 4-7.5x and bulk moved a
 * tier, which is harmless if nobody is paying and a change with a person on the
 * other end of it if somebody is.
 *
 * So this asks the database instead of believing the sentence.
 *
 * READ ONLY. Counts and plan names. It prints no shop domain and no charge id —
 * a subscription GID identifies a merchant's billing record, and this output
 * goes into a CI log.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/paid-plans-diag.mjs"
 */
import prisma from "../app/db.server.js";

const rows = await prisma.plan.findMany({
  select: { planName: true, status: true, shopifyChargeId: true, trialEndsAt: true },
});

const paidActive = rows.filter(
  (r) => r.status === "active" && r.planName !== "free" && r.shopifyChargeId,
);
const anyCharge = rows.filter((r) => r.shopifyChargeId);
const trialling = rows.filter((r) => r.trialEndsAt && new Date(r.trialEndsAt) > new Date());

const byPlan = {};
for (const r of rows) {
  const k = `${r.planName}:${r.status}`;
  byPlan[k] = (byPlan[k] ?? 0) + 1;
}

console.log(
  JSON.stringify(
    {
      readAt: new Date().toISOString(),
      totalPlanRows: rows.length,
      byPlanAndStatus: byPlan,
      // THE NUMBER B8 IS ABOUT.
      activePaidWithSubscription: paidActive.length,
      anyRowEverHeldACharge: anyCharge.length,
      currentlyTrialling: trialling.length,
      verdict:
        paidActive.length === 0
          ? "SAFE — no active paid subscription. The pricing change grandfathers nobody."
          : "STOP — an active paid subscription exists. Route to the owner before changing allowances.",
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
