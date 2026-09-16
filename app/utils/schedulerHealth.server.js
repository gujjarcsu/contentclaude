/**
 * Phase 16 — the I/O half of the scheduled-job health record. The reasoning,
 * the thresholds and the redaction rule are in `schedulerHealth.js`, which is
 * pure so they can be tested without a Redis.
 *
 * Every function here is best-effort by design. A scheduled job must never fail
 * BECAUSE its bookkeeping failed, and a health endpoint must never 500 because
 * it could not read a counter — both would be a worse version of the defect
 * this exists to fix.
 */
import logger from "./logger.server.js";
import { getRedis } from "./cache.server.js";
import { SCHEDULER_HEALTH_KEY, RECORD_TTL_S, failureRecord, schedulerVerdict } from "./schedulerHealth.js";

/** One tick of `job` threw. Never throws itself. */
export async function recordJobFailure(job, err) {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const raw = await redis.hget(SCHEDULER_HEALTH_KEY, job);
    let previous = null;
    try {
      previous = raw ? JSON.parse(raw) : null;
    } catch {
      previous = null;
    }
    const record = failureRecord(err, previous);
    await redis.hset(SCHEDULER_HEALTH_KEY, job, JSON.stringify(record));
    await redis.expire(SCHEDULER_HEALTH_KEY, RECORD_TTL_S);
    return record;
  } catch (e) {
    logger.warn({ job, err: e?.message }, "scheduler health: could not record a failure");
    return null;
  }
}

/**
 * One tick of `job` completed.
 *
 * This RECORDS the success rather than deleting the failure, and the
 * difference matters. Most of these jobs do their real work once a week and
 * return `{ ran: false, reason: "not the hour" }` the other 10,079 minutes,
 * silently — so "no error in the log" is equally consistent with the job
 * working and with the job having found a new way to fail quietly. That
 * ambiguity is what let this run for weeks. A timestamp that moves every
 * minute is the difference between absence of evidence and evidence.
 *
 * The streak is cleared by the overwrite: a job that works today is not a job
 * that is broken, however many times it failed last week.
 */
export async function recordJobSuccess(job) {
  try {
    const redis = await getRedis();
    if (!redis) return;
    await redis.hset(SCHEDULER_HEALTH_KEY, job, JSON.stringify({ ok: true, at: new Date().toISOString() }));
    await redis.expire(SCHEDULER_HEALTH_KEY, RECORD_TTL_S);
  } catch (e) {
    logger.warn({ job, err: e?.message }, "scheduler health: could not clear a streak");
  }
}

/**
 * What the health endpoint reads: one `HGETALL`, plus the verdict.
 * `available: false` means Redis could not be read — which is a fact about the
 * probe, not a claim that the jobs are fine.
 */
export async function readSchedulerHealth() {
  try {
    const redis = await getRedis();
    // No Redis is not a fault here. The scheduler cannot record without one and
    // the health route already reports Redis itself; calling this "degraded"
    // too would turn one fact into two alerts and make a dev machine look ill.
    if (!redis) return { available: false, reason: "no redis", jobs: {}, ...schedulerVerdict({}) };
    const raw = (await redis.hgetall(SCHEDULER_HEALTH_KEY)) ?? {};
    const jobs = {};
    for (const [job, value] of Object.entries(raw)) {
      try {
        jobs[job] = JSON.parse(value);
      } catch {
        // a corrupt field is a failing job we cannot describe, not a healthy one
        jobs[job] = { consecutive: 1, code: "UNPARSEABLE_RECORD", name: "Error", at: null };
      }
    }
    return { available: true, jobs, ...schedulerVerdict(jobs) };
  } catch (e) {
    logger.warn({ err: e?.message }, "scheduler health: could not be read");
    return { available: false, reason: "read failed", jobs: {}, ...schedulerVerdict({}) };
  }
}

/**
 * Run one scheduled job and record the outcome.
 *
 * This replaces the bare `.catch(err => logger.error(...))` each job had. The
 * log line is kept exactly as it was — it is what the log greps in
 * `07-VERIFICATION.md` and in the runbook match on — and the record is added
 * beside it.
 */
export function runScheduled(job, work, message) {
  return Promise.resolve()
    .then(work)
    .then(
      () => recordJobSuccess(job),
      (err) => {
        logger.error({ err }, message);
        return recordJobFailure(job, err);
      },
    )
    .catch(() => {});
}
