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
import { getCache } from "../utils/cache.server.js";
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
      await withTimeout(
        getCache("__health_ping__", async () => "ok", 5),
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
