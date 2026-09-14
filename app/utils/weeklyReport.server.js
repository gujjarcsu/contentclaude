/**
 * P3.6 (Phase 8) — the weekly report. The heartbeat, and only when there is
 * something true to say.
 *
 * One email per week across the whole app, Monday 09:00 Sydney, to the
 * store's own contact address, ONLY for a shop that has turned Bing
 * measurement on and ONLY in a week where a crawl-time experiment reported
 * since the last report. Every number links to the screen that proves it.
 * A quiet week sends nothing — a report with nothing in it teaches a
 * merchant to stop opening them.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { getRedis } from "./cache.server.js";
import { sydneyParts } from "./scheduler.server.js";
import { shopifyQuery } from "./shopifyQuery.server.js";
import { getFreshOfflineSession } from "./offlineToken.server.js";
import { offlineGraphql } from "./catalogueWatch.server.js";
import { sendEmailTo } from "./notify.server.js";
import { verdictSentence } from "./crawlHoldout.js";
import { experimentsFor } from "./crawlHoldout.server.js";
import { attentionList } from "./catalogueWatch.server.js";

export const REPORT_DAY_SYDNEY = 1; // Monday
export const REPORT_HOUR_SYDNEY = 9;
const REPORT_KEY = "cc:weekly-report:week";
export const APP_URL = process.env.SHOPIFY_APP_URL || "https://app.navaal.ai";

/**
 * The report body for one shop, or null when there is nothing true to say.
 * Pure over its inputs so the decision can be tested without I/O.
 *
 * @param {{shop: string, storeHandle: string, experiments: Array<object>, sinceAt: Date|null, attentionCount: number}} input
 */
export function composeWeeklyReport({ storeHandle, experiments, sinceAt, attentionCount = 0 }) {
  const since = sinceAt ? new Date(sinceAt).getTime() : 0;
  const reported = (experiments ?? []).filter((e) => e.status === "reported" && e.reportedAt && new Date(e.reportedAt).getTime() > since && e.summary?.enough);
  if (reported.length === 0) return null;
  const admin = `https://admin.shopify.com/store/${storeHandle}/apps/navaal-seo-geo-content`;
  const lines = ["Your Navaal result this week", ""];
  for (const e of reported) {
    lines.push(verdictSentence(e.summary));
    lines.push(`Method: a seeded random half of ${e.summary.submit.n + e.summary.hold.n} changed pages submitted to Bing, the other half withheld; time to Bing's first crawl after the change, both arms, 95% bootstrap interval on the difference of medians. Seed ${e.seed}, so the split can be reproduced.`);
    lines.push(`See both arms: ${admin}/app/proof`);
    lines.push("");
  }
  if (attentionCount > 0) {
    lines.push(`${attentionCount} product${attentionCount === 1 ? "" : "s"} currently need${attentionCount === 1 ? "s" : ""} attention: ${admin}/app/attention`);
    lines.push("");
  }
  lines.push("You get one of these a week, and only in a week with a result. Reply to this email to reach us.");
  return { subject: reported.length === 1 ? "Your crawl-time result is in" : `${reported.length} crawl-time results this week`, text: lines.join("\n") };
}

async function shopEmail(graphql, shop) {
  const r = await shopifyQuery(graphql, `query shopContact { shop { email contactEmail } }`, {}, { shop, label: "shop email" });
  const e = r.ok ? String(r.data?.shop?.email || r.data?.shop?.contactEmail || "").trim() : "";
  return e || null;
}

/** Send to every shop with something to say. Never throws. */
export async function sendWeeklyReports({ now = new Date() } = {}) {
  const out = { candidates: 0, sent: 0, quiet: 0, noEmail: 0, failed: 0 };
  const shops = await prisma.shop.findMany({
    where: { uninstalledAt: null, redactedAt: null, bingEnabledAt: { not: null } },
    select: { shop: true, lastWeeklyReportAt: true },
  });
  out.candidates = shops.length;
  for (const row of shops) {
    try {
      const [experiments, attention] = await Promise.all([experimentsFor(row.shop, { now }), attentionList(row.shop, { limit: 500 })]);
      const report = composeWeeklyReport({
        storeHandle: String(row.shop).split(".")[0],
        experiments,
        sinceAt: row.lastWeeklyReportAt,
        attentionCount: attention.length,
      });
      if (!report) {
        out.quiet++;
        continue;
      }
      const session = await getFreshOfflineSession(row.shop).catch(() => null);
      const to = session?.accessToken ? await shopEmail(offlineGraphql(session), row.shop) : null;
      if (!to) {
        out.noEmail++;
        continue;
      }
      const r = await sendEmailTo({ to, subject: report.subject, text: report.text });
      if (r.sent) {
        await prisma.shop.update({ where: { shop: row.shop }, data: { lastWeeklyReportAt: now } });
        out.sent++;
      } else out.failed++;
    } catch (err) {
      out.failed++;
      logger.warn({ shop: row.shop, err: err?.message, event: "weekly_report_failed" }, "weekly report failed for a shop (non-fatal)");
    }
  }
  logger.info({ event: "weekly_report_run", ...out }, "weekly report run");
  return out;
}

/** Minute-tick hook: Monday at the hour, once, Redis-claimed by ISO week. */
export async function maybeSendWeeklyReports({ now = new Date(), run = sendWeeklyReports } = {}) {
  const { day, hour, weekday } = sydneyParts(now);
  if (weekday !== REPORT_DAY_SYDNEY || hour !== REPORT_HOUR_SYDNEY) return { ran: false, reason: "not the hour" };
  try {
    const redis = await getRedis();
    if (redis) {
      const claimed = await redis.set(REPORT_KEY, day, "EX", 8 * 24 * 3600, "NX");
      if (!claimed) {
        const current = await redis.get(REPORT_KEY);
        if (current === day) return { ran: false, reason: "already ran this week" };
        await redis.set(REPORT_KEY, day, "EX", 8 * 24 * 3600);
      }
    }
  } catch (err) {
    logger.warn({ err: err?.message }, "weekly report: could not claim the week, running anyway");
  }
  const result = await run({ now });
  return { ran: true, day, ...result };
}
