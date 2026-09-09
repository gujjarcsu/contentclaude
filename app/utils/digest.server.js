/**
 * The daily digest — Phase 1 item 5.
 *
 * One email, once a day, that answers "what happened yesterday" without anyone
 * opening a dashboard. Every number is counted from our own tables; nothing here
 * is estimated, and nothing that cannot be measured is reported.
 *
 * Deliberately NOT in here: traffic, revenue, or anything sourced from a system
 * we cannot see. The install-source split needs the listing's GA4 property and
 * is called out as unavailable rather than guessed at.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";

/** Formats a count and its comparison honestly, including when it is zero. */
function line(label, value, extra = "") {
  return `  ${String(value).padStart(5)}  ${label}${extra ? ` ${extra}` : ""}`;
}

/**
 * Build the digest for the 24 hours ending at `now`.
 * Pure apart from the reads. Never throws — a digest that crashes tells nobody
 * anything, which is the failure it exists to prevent.
 *
 * @param {{now?: Date, db?: object}} [opts]
 * @returns {Promise<{subject: string, text: string, data: object}>}
 */
export async function buildDailyDigest({ now = new Date(), db = prisma } = {}) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const month = now.toISOString().slice(0, 7);

  const zero = async (p, fallback = 0) => {
    try {
      return await p;
    } catch (err) {
      logger.warn({ err: err?.message }, "digest: a count failed");
      return fallback;
    }
  };

  const [
    installs,
    uninstalls,
    reinstalls,
    firstDrafts,
    firstPublishes,
    reviewAsks,
    reviewShown,
    reviewDone,
    jobsFailed,
    jobsComplete,
    quotaSkipped,
    generations,
    paidShops,
    totalShops,
    liveShops,
  ] = await Promise.all([
    zero(db.shop.count({ where: { installedAt: { gte: since } } })),
    zero(db.shop.count({ where: { uninstalledAt: { gte: since } } })),
    zero(db.shop.count({ where: { reinstalledAt: { gte: since } } })),
    zero(db.shop.count({ where: { firstDraftSeenAt: { gte: since } } })),
    zero(db.shop.count({ where: { firstPublishAt: { gte: since } } })),
    zero(db.shop.count({ where: { reviewLastAskedAt: { gte: since } } })),
    zero(db.shop.count({ where: { reviewShownAt: { gte: since } } })),
    zero(db.shop.count({ where: { reviewDoneAt: { gte: since } } })),
    zero(db.generationJob.count({ where: { status: "failed", completedAt: { gte: since } } })),
    zero(db.generationJob.count({ where: { status: "complete", completedAt: { gte: since } } })),
    zero(
      db.generationJob
        .aggregate({ where: { createdAt: { gte: since } }, _sum: { quotaSkipped: true } })
        .then((r) => r?._sum?.quotaSkipped ?? 0),
    ),
    zero(db.usageRecord.count({ where: { createdAt: { gte: since } } })),
    zero(db.plan.count({ where: { planName: { not: "free" }, status: "active" } })),
    zero(db.shop.count()),
    zero(db.shop.count({ where: { uninstalledAt: null } })),
  ]);

  // "Jobs that failed" is only alarming relative to how many ran.
  const jobsRun = jobsFailed + jobsComplete;
  const failRate = jobsRun > 0 ? Math.round((jobsFailed / jobsRun) * 100) : 0;

  const data = {
    windowHours: 24,
    since: since.toISOString(),
    until: now.toISOString(),
    installs,
    uninstalls,
    reinstalls,
    firstDrafts,
    firstPublishes,
    reviewAsks,
    reviewShown,
    reviewDone,
    jobsRun,
    jobsFailed,
    failRate,
    quotaSkipped,
    generations,
    paidShops,
    totalShops,
    liveShops,
    month,
  };

  const net = installs - uninstalls;
  const subject =
    `Navaal daily — ${installs} install${installs === 1 ? "" : "s"}, ` +
    `${uninstalls} uninstall${uninstalls === 1 ? "" : "s"}, ` +
    `${generations} generation${generations === 1 ? "" : "s"}` +
    (jobsFailed > 0 ? `, ${jobsFailed} failed job${jobsFailed === 1 ? "" : "s"}` : "");

  const text = [
    `Navaal — last 24 hours (to ${now.toISOString().replace("T", " ").slice(0, 16)} UTC)`,
    "",
    "INSTALLS",
    line("installs", installs),
    line("uninstalls", uninstalls),
    line("reinstalls", reinstalls),
    line("net", net >= 0 ? `+${net}` : String(net)),
    line("live shops", liveShops, `(${totalShops} ever)`),
    "",
    "FIRST VALUE",
    line("shops that saw a first draft", firstDrafts),
    line("shops that published for the first time", firstPublishes),
    "",
    "WORK",
    line("generations charged", generations),
    line("jobs finished", jobsRun),
    line("jobs failed", jobsFailed, jobsRun > 0 ? `(${failRate}% of ${jobsRun})` : ""),
    line("products skipped for quota", quotaSkipped),
    "",
    "REVIEWS",
    line("asks opened", reviewAsks),
    line("modals actually shown", reviewShown),
    line("reached a terminal outcome", reviewDone),
    "",
    "MONEY",
    line("shops on a paid plan", paidShops),
    "",
    "Not in here, and why:",
    "  install SOURCE split — Shopify does not forward surface_* to the app under",
    "    managed installation; the listing's GA4 property (G-8H3DS31YQ8) has it.",
    "  traffic and revenue — this app cannot see either, so it does not guess.",
    "",
    "Health: https://app.navaal.ai/api/health?deep=1",
  ].join("\n");

  return { subject, text, data };
}
