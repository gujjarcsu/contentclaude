/**
 * The daily digest — Phase 1 item 5.
 *
 * One email, once a day, that answers "what happened yesterday" without anyone
 * opening a dashboard. Every number is counted from our own tables; nothing here
 * is estimated, and nothing that cannot be measured is reported.
 *
 * Deliberately NOT in here: traffic, revenue, or anything sourced from a system
 * we cannot see.
 *
 * Phase 5 item 6 — the install-source split IS in here now, with a caveat that
 * matters. Shopify does not forward `surface_*` to the app under managed
 * installation, so which App Store surface an organic install came from is
 * still only in the listing's GA4 property. But installs through OUR OWN links
 * (`/go?ref=<handle>`) are recorded as `ref:<handle>` by the install tracker,
 * and those we can see exactly. So the split reports what we know, names what
 * we do not, and never fills the gap with a guess.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { describeSource } from "./installChannels.js";

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

  // Phase 5 item 6 — where the last 24 hours of installs came from. Grouped
  // rather than counted per channel so a handle nobody registered still shows
  // up: an unrecognised ref is either a link somebody added without telling us
  // or a typo losing installs, and both are worth seeing.
  // `zero` catches a REJECTED promise; a missing method throws before there is
  // one. The digest's own reason for existing is that it still arrives when
  // something is broken, so the call itself is guarded too.
  const sourceRows = await zero(
    typeof db.shop?.groupBy === "function"
      ? db.shop.groupBy({
          by: ["installSource"],
          where: { installedAt: { gte: since } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    [],
  );
  const sourceSplit = (sourceRows ?? [])
    .map((r) => ({ source: r.installSource, label: describeSource(r.installSource), n: r._count._all }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  data.sourceSplit = sourceSplit;

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
    "WHERE THEY CAME FROM",
    ...(sourceSplit.length
      ? sourceSplit.map((r) => line(r.label, r.n))
      : ["      -  no installs in the last 24 hours"]),
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
    "  which App Store SURFACE an organic install came from — Shopify does not",
    "    forward surface_* under managed installation; the listing's GA4 property",
    "    (G-8H3DS31YQ8) has it. Installs through our own /go?ref= links ARE above.",
    "  traffic and revenue — this app cannot see either, so it does not guess.",
    "",
    "Health: https://app.navaal.ai/api/health?deep=1",
  ].join("\n");

  return { subject, text, data };
}
