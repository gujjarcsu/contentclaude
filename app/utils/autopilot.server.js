/**
 * Phase 4 item 5 — the bounds on autopilot.
 *
 * Autopilot is the only path in this app where a merchant's generation is spent
 * without them clicking anything. `products/create` fires once per product, and
 * a catalogue import fires it thousands of times in a burst. Every bound here
 * exists because a mistake in this path costs the merchant money rather than
 * showing them an error.
 *
 * The existing bounds: the Growth+ entitlement, a quota fast-fail, per-product
 * idempotency, and a concurrent-job cap. What was missing is a **ceiling per
 * day** — the thing that stops a bad import, a misbehaving integration or a
 * product-sync loop from quietly consuming a month's allowance in an afternoon.
 *
 * The failure direction is deliberate: a job whose `source` is unknown (written
 * before the column existed) is **not** counted against the cap. Erring toward
 * doing the work the merchant asked for is right; erring toward silently
 * refusing it is not.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";

/**
 * The most products autopilot will optimise for one shop in one UTC day.
 *
 * Chosen against the plans rather than picked round: Growth is 200/month, so 50
 * in a day is a quarter of the monthly allowance — enough that a normal day of
 * adding products is never blocked, small enough that a runaway import is
 * stopped on the first day rather than the second.
 */
export const AUTOPILOT_DAILY_CAP = 50;
export const AUTOPILOT_SOURCE = "autopilot";

/** Start of the current UTC day. Pure. */
export function startOfUtcDay(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * How many products autopilot has taken on for this shop today, and whether it
 * is allowed another.
 *
 * Counts PRODUCTS, not jobs: an autopilot job is one product today, but
 * counting jobs would make the cap meaningless the moment that changes.
 *
 * Never throws. A failed count returns `allowed: true` — a broken counter must
 * not silently stop a merchant's automation, and every other bound still
 * applies.
 */
export async function autopilotDailyUsage(shop, { now = new Date(), cap = AUTOPILOT_DAILY_CAP } = {}) {
  try {
    const since = startOfUtcDay(now);
    const agg = await prisma.generationJob.aggregate({
      where: { shop, source: AUTOPILOT_SOURCE, createdAt: { gte: since } },
      _sum: { totalProducts: true },
    });
    const used = Number(agg?._sum?.totalProducts) || 0;
    return { used, cap, remaining: Math.max(0, cap - used), allowed: used < cap, counted: true };
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "autopilot daily count failed - allowing (non-fatal)");
    return { used: 0, cap, remaining: cap, allowed: true, counted: false };
  }
}

/**
 * What autopilot has actually done for this shop in the last 24 hours, for the
 * Home banner. Never throws; returns null when there is nothing to say.
 *
 * Reports only COMPLETED jobs with products in them. A queued or failed job is
 * not something to tell a merchant about on their dashboard.
 */
export async function recentAutopilotWork(shop, { now = new Date() } = {}) {
  try {
    const since = new Date(now.getTime() - 24 * 3600 * 1000);
    const rows = await prisma.generationJob.findMany({
      where: {
        shop,
        source: AUTOPILOT_SOURCE,
        status: "complete",
        completedAt: { gte: since },
      },
      select: { completedProducts: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 200,
    });
    const products = rows.reduce((n, r) => n + (Number(r.completedProducts) || 0), 0);
    if (products === 0) return null;
    return { products, jobs: rows.length, lastAt: rows[0]?.completedAt?.toISOString() ?? null };
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "autopilot recap unavailable (non-fatal)");
    return null;
  }
}
