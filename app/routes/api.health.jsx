/**
 * Health check endpoint — GET /api/health
 *
 * Shallow (default): can this web process serve? Database reachable, process
 * running. Fly's own check calls this every 30 s, so it stays cheap and must not
 * fail for things a single web machine cannot fix.
 *
 * Deep (?deep=1) — Phase 0 item 26: is the PRODUCT actually working? The shallow
 * check answered "ok" while Redis was dead (the cache silently falls back to
 * memory), while the BullMQ worker was not running at all, and while the AI
 * circuit breaker was open — that is, while no merchant could get a single
 * generation. An uptime monitor pointed at the shallow check would have reported
 * 100% availability through all of it.
 *
 * Status vocabulary:
 *   ok        200  everything the product needs is working
 *   degraded  200  something non-fatal is off (Redis down, breaker open); the
 *                  app still serves, and a monitor should warn rather than page
 *   error     503  the app cannot do its job: no database, a dead worker, or
 *                  jobs stranded for more than ten minutes
 *
 * Public by design, so it never returns error strings, hostnames or driver
 * internals — those stay in the logger.
 */

import prisma from "../db.server.js";
import { getRedis } from "../utils/cache.server.js";
import logger from "../utils/logger.server.js";

/** Answer even when a dependency will not: reject rather than hang. */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

const DB_TIMEOUT_MS = 2_000;
const REDIS_TIMEOUT_MS = 1_000;
/** Jobs failing for longer than this is an outage, not a blip. */
const FAILING_JOBS_WINDOW_MS = 10 * 60 * 1000;

export const loader = async ({ request }) => {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const checks = {};
  let healthy = true;
  let degraded = false;

  const isProd = process.env.NODE_ENV === "production";

  // ── Database ────────────────────────────────────────────────────────────
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS, "database");
    checks.database = "ok";
  } catch (err) {
    checks.database = "error";
    healthy = false;
    logger.error({ err: err.message }, "Health check: database ping failed");
  }

  // ── Redis ───────────────────────────────────────────────────────────────
  if (process.env.REDIS_URL) {
    try {
      // P38 — a real PING on the shared client. This used to go through
      // getCache, which falls back to the in-process cache when Redis fails, so
      // it said "ok" for four days while every Redis command threw.
      await withTimeout(
        (async () => {
          const redis = await getRedis();
          if (!redis) throw new Error("no redis connection");
          await redis.ping();
        })(),
        REDIS_TIMEOUT_MS,
        "redis",
      );
      checks.redis = "ok";
    } catch (err) {
      // Not fatal for serving pages — the cache falls back to memory — but it
      // IS fatal for durable jobs, which the queue check below reports.
      checks.redis = "degraded";
      degraded = true;
      logger.warn({ err: err.message }, "Health check: redis ping degraded");
    }
  }

  if (deep) {
    // ── The worker and the queue ──────────────────────────────────────────
    try {
      const { getQueueHealth } = await import("../queues/generationQueue.server.js");
      const q = await getQueueHealth();
      checks.queue = {
        configured: q.configured,
        workerRunning: q.workerRunning,
        counts: q.counts,
        ...(q.error ? { error: q.error } : {}),
      };
      // In production a dead worker means no bulk job will ever run: an outage
      // of the app's main promise, even though every page still loads.
      if (isProd && q.configured && !q.workerRunning) {
        healthy = false;
        logger.error("Health check: BullMQ worker is not running");
      } else if (q.error) {
        degraded = true;
      }
    } catch (err) {
      checks.queue = { error: "unavailable" };
      degraded = true;
      logger.warn({ err: err.message }, "Health check: queue probe failed");
    }

    // ── Jobs ──────────────────────────────────────────────────────────────
    try {
      const since = new Date(Date.now() - FAILING_JOBS_WINDOW_MS);
      const [recentFailed, stuckProcessing] = await Promise.all([
        prisma.generationJob.count({ where: { status: "failed", completedAt: { gte: since } } }),
        prisma.generationJob.count({ where: { status: "processing", updatedAt: { lt: since } } }),
      ]);
      checks.jobs = { failedLast10Min: recentFailed, stuckProcessing };
      // Jobs stranded in "processing" with nothing touching them for ten
      // minutes means the recovery loop is not running either.
      if (stuckProcessing > 0) {
        healthy = false;
        logger.error({ stuckProcessing }, "Health check: jobs stuck in processing");
      } else if (recentFailed > 0) {
        degraded = true;
      }
    } catch (err) {
      checks.jobs = { error: "unavailable" };
      degraded = true;
      logger.warn({ err: err.message }, "Health check: job probe failed");
    }

    // ── The SCHEDULED jobs ────────────────────────────────────────────────
    // Phase 16, and false green #33. The two probes above answer "is a worker
    // attached" and "are there failed rows in GenerationJob". Neither can see a
    // scheduler tick that throws while importing its own module — it dies
    // before it reaches the queue and before it writes a row — so the weekly
    // report threw sixty times an hour for weeks under a green deep check.
    // One HGETALL of a four-field hash the worker keeps; see
    // app/utils/schedulerHealth.js for why the thresholds are what they are.
    try {
      const { readSchedulerHealth } = await import("../utils/schedulerHealth.server.js");
      const sched = await readSchedulerHealth();
      checks.scheduler = sched.available
        ? { jobs: sched.jobs, failing: sched.failing, worstConsecutiveTicks: sched.consecutive }
        : { error: sched.reason ?? "unavailable" };
      if (!sched.available) {
        // "no redis" is already reported by the Redis check above; saying it
        // twice would be two alerts for one fact. A read that FAILED is
        // different: the counter exists and we could not see it.
        if (sched.reason === "read failed") degraded = true;
      } else if (sched.unhealthy) {
        // Ten ticks is ten minutes. That is not a wobble; that job does not work.
        healthy = false;
        logger.error({ job: sched.worst, consecutive: sched.consecutive, failing: sched.failing }, "Health check: a scheduled job has failed every tick");
      } else if (sched.degraded) {
        degraded = true;
        logger.warn({ job: sched.worst, consecutive: sched.consecutive }, "Health check: a scheduled job is failing repeatedly");
      }
    } catch (err) {
      checks.scheduler = { error: "unavailable" };
      degraded = true;
      logger.warn({ err: err.message }, "Health check: scheduler probe failed");
    }

    // ── The CLIENT SECRET ─────────────────────────────────────────────────
    //
    // False green #1, and the most expensive one: on 2026-09-16 the deployed
    // client secret was not the one Shopify signs with, every merchant got 401
    // on every page, and all five checks above were genuinely fine. The monitor
    // read 100% through an outage in which the product did not work at all.
    //
    // Shopify signs the embedded-app id_token with the client secret. If ours is
    // not Shopify's, authenticate.admin rejects every session token and every
    // webhook HMAC fails the same way. So: sign a synthetic token with the
    // secret this process is running with and put it through the same
    // verification a real id_token takes. Prints nothing — no secret, no length,
    // no fingerprint. See app/utils/sessionTokenHealth.server.js for why the
    // self-check and the live rejection rate are reported separately rather than
    // blended: a WRONG secret still verifies against itself, which is exactly
    // how this hid.
    try {
      const { checkSessionTokenSecret } = await import("../utils/sessionTokenHealth.server.js");
      const t = checkSessionTokenSecret();
      /* the live half: a wrong-but-well-formed secret passes the self-check and fails every real
         token, so the rejection rate is the only in-process signal that tells them apart */
      const { sessionTokenRejections } = await import("../utils/sessionTokenHealth.server.js");
      const { readAuthCounter } = await import("../utils/authCounter.server.js");
      const live = await sessionTokenRejections(readAuthCounter);
      checks.sessionToken = { ok: t.ok, reason: t.reason, live };
      if (live?.fatal) {
        healthy = false;
        logger.error({ attempts: live.attempts, rejected: live.rejected }, "Health check: every session token is being rejected — the client secret is almost certainly wrong");
      }
      if (!t.ok) {
        healthy = false;
        logger.error({ reason: t.reason }, "Health check: the app cannot validate a session token");
      }
    } catch (err) {
      checks.sessionToken = { error: "unavailable" };
      healthy = false;
      logger.error({ err: err.message }, "Health check: session-token probe failed");
    }

    // ── The AI circuit breaker ────────────────────────────────────────────
    try {
      const { getCircuitBreakerState } = await import("../utils/ai.server.js");
      const breaker = getCircuitBreakerState();
      checks.aiCircuitBreaker = breaker;
      // Open means no shop can generate anything right now. It closes itself
      // after a minute, so it warns rather than 503s.
      if (breaker.open) degraded = true;
    } catch (err) {
      checks.aiCircuitBreaker = { error: "unavailable" };
      logger.warn({ err: err.message }, "Health check: breaker probe failed");
    }

    // ── Schema drift ─────────────────────────────────────────────────────
    //
    // Does the database have the columns this build expects? This is the check
    // that was missing on 2026-09-09: a migration edited after it was applied
    // is skipped by name, so the code shipped expecting
    // BrandVoice.publishWithoutReview, the column never existed, and every
    // /app load returned 500 with P2022 for eight hours - while this endpoint
    // reported "ok", because its database check is SELECT 1 and SELECT 1 needs
    // no columns.
    //
    // Drift is an ERROR, not a degrade. A deploy whose schema does not match
    // production is not serving merchants, and it must fail the smoke job.
    try {
      const { checkSchemaDrift } = await import("../utils/schemaDrift.server.js");
      const drift = await checkSchemaDrift();
      if (drift.error) {
        checks.schema = { error: "unavailable" };
        degraded = true;
      } else if (!drift.ok) {
        checks.schema = {
          ok: false,
          missingColumns: drift.missing.length,
          missing: drift.missing.slice(0, 10),
        };
        healthy = false;
        logger.error({ missing: drift.missing, event: "schema_drift" }, "Health check: schema drift");
      } else {
        checks.schema = { ok: true, columns: drift.checked };
      }
    } catch (err) {
      checks.schema = { error: "unavailable" };
      degraded = true;
      logger.warn({ err: err.message }, "Health check: schema probe failed");
    }

    checks.build = process.env.GIT_SHA ? process.env.GIT_SHA.slice(0, 7) : "unknown";
  }

  const status = !healthy ? "error" : degraded ? "degraded" : "ok";

  // The shallow check stays minimal in production (it is public); the deep one
  // is what an operator explicitly asked for, so it answers in full.
  const body =
    deep || !isProd
      ? { status, timestamp: new Date().toISOString(), checks }
      : { status, timestamp: new Date().toISOString() };

  return Response.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
};
