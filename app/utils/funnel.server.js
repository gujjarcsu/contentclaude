/**
 * Phase 10 Part B — the funnel, with I/O. Reasoning in funnel.js.
 *
 * One weekly digest to the OWNER (the operator address, the same mailer as
 * support), Monday 08:30 Sydney, Redis-claimed by week, only when there is at
 * least one non-test shop. Counts and medians; no shop domain in the email or
 * in any log line here.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { getRedis } from "./cache.server.js";
import { sydneyParts } from "./scheduler.server.js";
import { sendOperatorEmail } from "./notify.server.js";
import { computeFunnel, composeFunnelDigest, FUNNEL_SELECT } from "./funnel.js";

export const FUNNEL_DAY_SYDNEY = 1; // Monday
export const FUNNEL_HOUR_SYDNEY = 8;
export const FUNNEL_MINUTE_MIN = 30; // after the 08:00 support digest
const FUNNEL_KEY = "cc:funnel-digest:week";

export async function funnelRows(db = prisma) {
  return db.shop.findMany({ select: FUNNEL_SELECT });
}

/** Compute and (unless dryRun) send. Returns the summary and whether it went. */
export async function sendFunnelDigest({ now = new Date(), dryRun = false } = {}) {
  const rows = await funnelRows();
  const f = computeFunnel(rows);
  const digest = composeFunnelDigest(f, { now });
  if (!digest) {
    logger.info({ event: "funnel_digest_quiet", shops: f.shops }, "funnel digest: no non-test shop, nothing sent");
    return { sent: false, reason: "no non-test shop", funnel: f };
  }
  if (dryRun) return { sent: false, reason: "dry run", funnel: f, digest };
  const r = await sendOperatorEmail({ subject: digest.subject, text: digest.text });
  logger.info({ event: "funnel_digest", sent: r?.sent === true, shops: f.shops, installed: f.counts.installed, published: f.counts.firstPublish, returned: f.counts.returned }, "funnel digest");
  return { sent: r?.sent === true, reason: r?.sent ? null : r?.reason ?? "not sent", funnel: f, digest };
}

/** Minute-tick hook: Monday 08:30+ Sydney, once, Redis-claimed by ISO day of that Monday. */
export async function maybeSendFunnelDigest({ now = new Date(), run = sendFunnelDigest } = {}) {
  const { day, hour, minute, weekday } = sydneyParts(now);
  if (weekday !== FUNNEL_DAY_SYDNEY || hour !== FUNNEL_HOUR_SYDNEY || minute < FUNNEL_MINUTE_MIN) return { ran: false, reason: "not the hour" };
  try {
    const redis = await getRedis();
    if (redis) {
      const claimed = await redis.set(FUNNEL_KEY, day, "EX", 8 * 24 * 3600, "NX");
      if (!claimed) {
        const current = await redis.get(FUNNEL_KEY);
        if (current === day) return { ran: false, reason: "already ran this week" };
        await redis.set(FUNNEL_KEY, day, "EX", 8 * 24 * 3600);
      }
    }
  } catch (err) {
    logger.warn({ err: err?.message }, "funnel digest: could not claim the week, running anyway");
  }
  const result = await run({ now });
  return { ran: true, day, ...result };
}
