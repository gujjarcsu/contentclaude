/**
 * P38 — the once-per-period claim every scheduled job takes before it runs.
 *
 * Until 2026-10-06 these claims were a Redis SET NX, and every caller wrapped it
 * in "if the claim fails, run anyway". On 2026-10-01 the Redis cache client
 * died, every claim threw, and every job ran on every minute of its hour: the
 * daily digest went to the owner 60 times a day, the funnel digest 30 times, and
 * the backup and the billing reconcile ran 60 times a night.
 *
 * The rule now:
 *   - the claim is a primary-key insert in Postgres (ScheduledRun)
 *   - the insert that wins runs the job; a duplicate key means it already ran
 *   - ANY other failure means we cannot tell whether it ran, so it does NOT run,
 *     and the owner is told — once, not once a minute
 *
 * Claim-then-run means a run that crashes after claiming is not retried that
 * period. That is the right way round for things that send email: a missed
 * digest is one missing email, a retry loop is sixty.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { sendOperatorEmail } from "./notify.server.js";

/** P38b — markers are only needed for the period they guard; a month is plenty of history. */
export const SCHEDULED_RUN_RETENTION_DAYS = 30;

/** Delete markers older than the retention window. Returns how many went. */
export async function sweepOldScheduledRuns({ now = new Date(), db = prisma } = {}) {
  const cutoff = new Date(now.getTime() - SCHEDULED_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.scheduledRun.deleteMany({ where: { claimedAt: { lt: cutoff } } });
  return { deleted: count, cutoff: cutoff.toISOString() };
}

/** Set while an unreadable-marker alert is outstanding; cleared by the next good claim. */
let _markerAlerted = false;

/**
 * @param {string} job     stable job name, e.g. "dailyDigest"
 * @param {string} period  the period it runs for, e.g. the Sydney day
 * @returns {Promise<{run: true} | {run: false, reason: "already ran" | "marker unreadable"}>}
 */
export async function claimScheduledRun(job, period, { db = prisma, alert = sendOperatorEmail } = {}) {
  try {
    await db.scheduledRun.create({ data: { job, period } });
    _markerAlerted = false;
    return { run: true };
  } catch (err) {
    if (err?.code === "P2002") return { run: false, reason: "already ran" };

    logger.error(
      { job, period, err: err?.message, event: "scheduled_marker_unreadable" },
      "scheduled job skipped: could not read or write its run marker",
    );
    if (!_markerAlerted) {
      _markerAlerted = true;
      await alert({
        subject: "Navaal scheduled jobs are SKIPPING — run markers unreadable",
        text: [
          "A scheduled job could not read or write its once-per-period marker in Postgres,",
          "so it did not run rather than risk sending twice. Every scheduled job will",
          "keep skipping until the marker table answers again.",
          "",
          `First job affected: ${job} (${period})`,
          `Error: ${err?.message ?? "unknown"}`,
          "",
          "This is the only email about it until a claim succeeds again.",
          "Check the database first: /api/health?deep=1 → checks.database.",
        ].join("\n"),
      }).catch(() => {});
    }
    return { run: false, reason: "marker unreadable" };
  }
}
