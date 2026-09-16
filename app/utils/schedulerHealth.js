/**
 * Phase 16 — MAKE A SCHEDULED JOB THAT DIES ON EVERY TICK VISIBLE.
 *
 * `/api/health?deep=1` reported `worker running` and `jobs.failedLast10Min: 0`
 * while `weekly report threw` sixty times an hour for weeks. Both numbers were
 * true and neither could have been anything else: the queue probe asks BullMQ
 * whether a worker is attached, and the jobs probe counts rows in
 * `GenerationJob`. A scheduler tick that throws while IMPORTING its module dies
 * before it reaches either, so a job that is 100% dead looked exactly like a
 * job that is idle.
 *
 * What is recorded, and what is deliberately not:
 *
 *   consecutive   ticks in a row that threw, reset to 0 by one success
 *   code / name   the error's `code` and constructor name — never its MESSAGE,
 *                 because a message can carry a shop domain or a URL and this
 *                 value is read back by a public health endpoint
 *   at            when the last failure happened
 *
 * The counters live in Redis because the scheduler runs in the WORKER process
 * and the health endpoint answers from a WEB machine: an in-memory counter in
 * the worker is invisible to the thing that has to report it. The health route
 * already pings Redis on the deep path, so this adds one `HGETALL` of a hash
 * with four small fields.
 *
 * PURE — no I/O here, so the thresholds and the verdict can be tested without a
 * Redis. `schedulerHealth.server.js` does the reading and writing.
 */

/** The hash every scheduled job reports into. One key, one round trip. */
export const SCHEDULER_HEALTH_KEY = "scheduler:health";

/**
 * Ticks are 60 s apart, so these are minutes.
 *
 * Two thresholds rather than one, because "flaky" and "dead" deserve different
 * answers. Three in a row is past coincidence and someone should look; ten in a
 * row is not a wobble, it is a job that does not work, and the endpoint must
 * stop saying the worker is fine — which is the whole point of this file.
 */
export const DEGRADED_AFTER_CONSECUTIVE = 3;
export const UNHEALTHY_AFTER_CONSECUTIVE = 10;

/**
 * How long a record survives without being touched. Longer than the tick so a
 * failing job's count is never lost between ticks; short enough that a worker
 * that has been stopped for half an hour does not leave a stale red behind and
 * page somebody about a job that is no longer scheduled.
 */
export const RECORD_TTL_S = 30 * 60;

/**
 * The verdict for one hash of records.
 *
 * @param {Record<string, {consecutive?: number}>} records job name → record
 * @returns {{worst: string|null, consecutive: number, unhealthy: boolean, degraded: boolean, failing: string[]}}
 */
export function schedulerVerdict(records) {
  const entries = Object.entries(records ?? {}).filter(([, r]) => r && Number(r.consecutive) > 0);
  const failing = entries
    .filter(([, r]) => Number(r.consecutive) >= DEGRADED_AFTER_CONSECUTIVE)
    .map(([name]) => name)
    .sort();
  let worst = null;
  let consecutive = 0;
  for (const [name, r] of entries) {
    const n = Number(r.consecutive) || 0;
    if (n > consecutive) {
      consecutive = n;
      worst = name;
    }
  }
  return {
    worst,
    consecutive,
    failing,
    degraded: consecutive >= DEGRADED_AFTER_CONSECUTIVE && consecutive < UNHEALTHY_AFTER_CONSECUTIVE,
    unhealthy: consecutive >= UNHEALTHY_AFTER_CONSECUTIVE,
  };
}

/**
 * What a failure records. Separated from the write so the redaction rule — no
 * message, ever — is one function with a test on it rather than a habit.
 */
export function failureRecord(err, previous, now = Date.now()) {
  const prev = Number(previous?.consecutive) || 0;
  return {
    consecutive: prev + 1,
    // `code` is what names this class of fault (ERR_IMPORT_ATTRIBUTE_MISSING);
    // `name` is the constructor (TypeError). Neither can carry a merchant's data.
    code: typeof err?.code === "string" ? err.code.slice(0, 64) : null,
    name: typeof err?.name === "string" ? err.name.slice(0, 64) : "Error",
    at: new Date(now).toISOString(),
  };
}
