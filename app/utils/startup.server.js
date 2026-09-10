/**
 * Server startup tasks — runs once when the module is first imported.
 *
 * 1. Stuck job recovery: any GenerationJob stuck in "processing" for
 *    more than STALL_THRESHOLD_MS is reset to "failed" so merchants
 *    don't see a permanent "Processing…" state after a server crash.
 *
 * 2. BullMQ worker startup: ensures the worker is running in this process.
 *
 * Import this module from entry.server.jsx to guarantee it runs at boot.
 */

import prisma, { DB_ROLE_URL_SOURCE } from "../db.server.js";
import logger from "./logger.server.js";
import { RUNS_JOBS, PROCESS_ROLE, MACHINE_ID, REGION } from "./processRole.server.js";
import { logSchemaDriftAtStartup } from "./schemaDrift.server.js";

// Refuse to boot if NODE_ENV is unset — billing test mode, cookie security and
// other safety branches depend on it, so an unset value is unsafe to run with.
if (!process.env.NODE_ENV) {
  throw new Error("FATAL: NODE_ENV is unset — refuse to boot");
}

// Phase 0 item 12 — a job is "stuck" when nothing has TOUCHED it for this long.
// The old rule used startedAt, so a healthy 40-minute run over a large catalogue
// looked identical to a job whose worker had been killed 40 minutes earlier. The
// processor writes progress after every product, so updatedAt is the honest
// liveness signal, and 15 minutes of complete silence is well beyond the
// worst case for a single product (a 65-second breaker pause plus retries).
const STALL_THRESHOLD_MS = 15 * 60 * 1000;
/** Re-check for stranded jobs this often, not only at boot. */
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Phase 0 item 15 — connections per process against the POOLED endpoint.
 * 5 for the web process; the worker wants 3 (BULLMQ_CONCURRENCY defaults to 3).
 * Both are advisory: the value itself lives in DATABASE_URL, which only a human
 * with the Fly secrets can change (see HUMAN-NEEDED).
 */
export const RECOMMENDED_CONNECTION_LIMIT = 5;

let _initialized = false;

export async function recoverStuckJobs() {
  const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS);
  const stuck = await prisma.generationJob.findMany({
    where: { status: "processing", updatedAt: { lt: cutoff } },
    select: { id: true, shop: true, startedAt: true, updatedAt: true },
  });

  if (stuck.length === 0) return 0;

  logger.warn({ count: stuck.length }, "Recovering stuck generation jobs");

  // Guarded by the same condition so a job that woke up between the read and
  // the write is never stamped failed underneath a live worker.
  const { count } = await prisma.generationJob.updateMany({
    where: { id: { in: stuck.map((j) => j.id) }, status: "processing", updatedAt: { lt: cutoff } },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorLog: JSON.stringify([
        {
          productId: "N/A",
          error:
            "This job stopped responding and was ended. Use Resume to finish the remaining products — anything already generated will not be charged again.",
        },
      ]),
    },
  });

  for (const job of stuck) {
    logger.warn(
      { jobId: job.id, shop: job.shop, startedAt: job.startedAt, lastTouched: job.updatedAt },
      "Marked stuck job as failed",
    );
  }
  return count;
}

export async function runStartupChecks() {
  const warnings = [];

  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.push("ANTHROPIC_API_KEY not set — AI generation will fail");
  }
  if (process.env.NODE_ENV === "production" && (process.env.DATABASE_URL || "").includes("sqlite")) {
    warnings.push("SQLite detected in production — migrate to PostgreSQL for multi-tenant reliability");
  }
  if (!process.env.REDIS_URL && process.env.NODE_ENV === "production") {
    // FAIL LOUDLY: without Redis the queue silently degrades to in-process
    // setTimeout — bulk jobs die on every deploy/restart and the merchant
    // sees a permanently stuck job. A missing secret must stop the boat, not
    // sail with a hole in it.
    throw new Error(
      "FATAL: REDIS_URL is not set in production — bulk jobs would not survive restarts. " +
        "Set the REDIS_URL secret before deploying.",
    );
  }
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
    warnings.push("Shopify API credentials not configured");
  }
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  if (!appUrl || appUrl.includes("example.com")) {
    const msg =
      "SHOPIFY_APP_URL is not set or is a placeholder — set it to your production URL before running shopify app deploy";
    if (process.env.NODE_ENV === "production") {
      warnings.push(msg);
    } else {
      logger.debug("SHOPIFY_APP_URL placeholder is OK in dev (CLI auto-updates via tunnel)");
    }
  }
  // Exactly the scopes the code uses: write_products (products, media,
  // product metafields via metafieldsSet) and write_content (blogs/articles).
  // There is NO metaobject code in this app — do not add metaobject scopes.
  const envScopes = new Set(
    (process.env.SCOPES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const requiredScopes = ["write_products", "write_content"];
  const missingScopes = requiredScopes.filter((s) => !envScopes.has(s));
  if (missingScopes.length > 0) {
    warnings.push(
      `Missing required scopes in SCOPES env var: ${missingScopes.join(", ")} — product/blog writes will fail`,
    );
  }
  const extraScopes = [...envScopes].filter((s) => !requiredScopes.includes(s));
  if (extraScopes.length > 0) {
    warnings.push(
      `SCOPES contains scopes this app never uses: ${extraScopes.join(", ")} — remove them (over-broad scopes are an App Store rejection risk, requirement 3.2)`,
    );
  }
  if (process.env.NODE_ENV === "production" && !process.env.SENTRY_DSN) {
    warnings.push("SENTRY_DSN not set — runtime errors will not be captured by Sentry");
  }

  // Phase 0 item 15 — connection budget.
  //
  // The old advice here was connection_limit=1, and it was enforced by
  // string-matching "neon.tech" in the URL (so a pooler hostname, a proxy, or
  // any other provider silently skipped the check entirely). One connection is
  // actively harmful: tryConsumeGeneration holds a SERIALIZABLE transaction
  // while three worker slots and every web request compete for that single
  // connection, which surfaces as "Timed out fetching a new connection from the
  // pool" under quite ordinary load. Against a POOLED endpoint (pgbouncer) a
  // handful of connections per process is correct and cheap.
  // Each process checks the connection string it actually uses: the worker may
  // have its own (WORKER_DATABASE_URL), and warning about a URL this process
  // never opens would be a lie in the logs.
  const dbUrl =
    (RUNS_JOBS ? process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL : process.env.DATABASE_URL) ||
    "";
  if (process.env.NODE_ENV === "production" && dbUrl) {
    const pooled = dbUrl.includes("pgbouncer=true") || dbUrl.includes("-pooler.");
    const limitMatch = dbUrl.match(/[?&]connection_limit=(\d+)/);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : null;

    if (!pooled) {
      warnings.push(
        `${DB_ROLE_URL_SOURCE} does not look like a pooled endpoint (no pgbouncer=true and no -pooler host) — ` +
          "use the pooled connection string, or concurrent load will exhaust the database's own connection limit.",
      );
    }
    if (limit === null) {
      warnings.push(
        `${DB_ROLE_URL_SOURCE} has no connection_limit — set connection_limit=${RECOMMENDED_CONNECTION_LIMIT} on the pooled endpoint.`,
      );
    } else if (limit < 2) {
      warnings.push(
        `${DB_ROLE_URL_SOURCE} sets connection_limit=${limit}. One connection serialises the web process behind every ` +
          "worker transaction and causes pool timeouts under modest load — " +
          `raise it to ${RECOMMENDED_CONNECTION_LIMIT} on the pooled endpoint.`,
      );
    }
  }

  // Does the database actually have the columns this build needs? The
  // 2026-09-09 incident is the reason: a migration edited after it was applied
  // is skipped by name, so the code ships expecting a column that was never
  // created, and every query touching it fails with P2022. Nothing else here
  // would notice - a connection check needs no columns.
  const drift = await logSchemaDriftAtStartup();
  if (!drift.ok && drift.missing?.length) {
    warnings.push(
      `SCHEMA DRIFT: ${drift.missing.length} column(s) missing from the database (${drift.missing.slice(0, 3).join(", ")}${drift.missing.length > 3 ? ", ..." : ""}). Deep health is reporting 503.`,
    );
  }

  warnings.forEach((w) => logger.warn(`⚠️ STARTUP: ${w}`));
  if (warnings.length === 0) {
    logger.info("✅ All startup checks passed");
  }

  return warnings;
}

export const startupPromise = (async () => {
  if (_initialized) return;
  _initialized = true;

  // Phase 0 item 25 — before anything else, so the very first error of the
  // process is reported and the global handlers are live.
  try {
    const { initErrorMonitoring, installProcessErrorHandlers } = await import("./errorMonitoring.server.js");
    installProcessErrorHandlers();
    await initErrorMonitoring();
  } catch (err) {
    logger.error({ err }, "Could not initialise error monitoring");
  }

  await runStartupChecks();

  if (RUNS_JOBS) {
    try {
      await recoverStuckJobs();
    } catch (err) {
      // Startup recovery is best-effort — never crash the server
      logger.error({ err }, "Startup job recovery failed");
    }
  }

  // Phase 0 item 12 — and keep checking. Running this only at boot meant a job
  // stranded by a crash stayed "Processing…" until the next deploy, holding the
  // shop's in-flight slot the whole time. unref() so the timer never keeps the
  // process alive during shutdown.
  //
  // Phase 1 item 2 — this belongs to whichever process runs jobs. Every web
  // machine doing it would mean N machines racing to mark the same job failed,
  // and the guarded write makes that harmless but pointless.
  if (RUNS_JOBS) {
    const recoveryTimer = setInterval(() => {
      recoverStuckJobs().catch((err) => logger.error({ err }, "Periodic job recovery failed"));
    }, RECOVERY_INTERVAL_MS);
    recoveryTimer.unref?.();
  }

  // Start the BullMQ worker — only in the process whose job that is.
  if (process.env.REDIS_URL && RUNS_JOBS) {
    try {
      const { startWorker } = await import("../queues/generationQueue.server.js");
      await startWorker();
    } catch (err) {
      logger.error({ err }, "Failed to start BullMQ worker");
    }
  }

  // Phase 1 item 5 — the operator scheduler: a deep-health probe every five
  // minutes that emails on failure, and the daily digest at 07:00 Sydney. Worker
  // only, because exactly one worker exists — running these on every web machine
  // would send one alert per machine.
  if (RUNS_JOBS) {
    try {
      const { startScheduler } = await import("./scheduler.server.js");
      startScheduler();
    } catch (err) {
      logger.error({ err }, "Failed to start the operator scheduler");
    }
  }

  logger.info(
    {
      role: PROCESS_ROLE,
      machine: MACHINE_ID,
      region: REGION,
      runsJobs: RUNS_JOBS,
      dbUrlSource: DB_ROLE_URL_SOURCE,
    },
    "Startup complete",
  );
})();

// ── Graceful shutdown ──────────────────────────────────────────────────────
/**
 * How long a web machine waits for requests that are already running, after Fly
 * has cordoned it and before the process exits. Must stay below kill_timeout in
 * fly.toml (60 s) — past that Fly sends SIGKILL and the wait achieves nothing.
 */
export const WEB_DRAIN_MS = Number(process.env.WEB_DRAIN_MS || 15_000);

let _shuttingDown = false;

async function gracefulShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logger.info({ signal }, "Shutdown signal received — closing BullMQ and Prisma gracefully");

  // Webhook handlers answer 200 and finish the deletion afterwards. Waiting for
  // that here is what stops a routine deploy from interrupting a GDPR redaction
  // that started two seconds earlier. Anything still going after the timeout is
  // left to the worker's sweep.
  try {
    const { drainWebhookWork } = await import("./webhookWork.server.js");
    await drainWebhookWork();
  } catch (err) {
    logger.error({ err }, "Error draining deferred webhook work");
  }

  try {
    if (process.env.REDIS_URL) {
      const { closeQueue } = await import("../queues/generationQueue.server.js");
      await Promise.race([
        closeQueue(false),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Drain timeout")), 30_000)),
      ]);
      logger.info("BullMQ worker drained and closed");
    }
  } catch (err) {
    logger.error({ err }, "Error closing BullMQ — forcing exit anyway");
  }

  // ── In-flight HTTP requests ───────────────────────────────────────────────
  // `react-router-serve` installs its own SIGTERM handler that calls
  // server.close(): it stops accepting new connections and lets requests that
  // are already running finish. This handler was racing it — on a web machine
  // there is no BullMQ worker to drain, so everything above completes in a few
  // milliseconds and `process.exit(0)` killed those in-flight requests.
  //
  // Fly cordons the machine before it sends SIGTERM, so no NEW request arrives
  // during this wait; it is purely time for the ones already running to finish.
  //
  // Why a bounded wait and not a count of in-flight requests: React Router only
  // routes DOCUMENT and .data requests through entry.server, so a counter there
  // would miss every resource route — including the generation endpoint, which
  // is the single request we least want to drop. A counter that misses the
  // important case is worse than an honest timer, because it reads as proof.
  //
  // 15 s sits inside kill_timeout (60 s) with room for the worker's 30 s BullMQ
  // drain on the machines that have one.
  if (!RUNS_JOBS) {
    logger.info({ ms: WEB_DRAIN_MS }, "Waiting for in-flight HTTP requests before exit");
    await new Promise((r) => setTimeout(r, WEB_DRAIN_MS));
  }

  try {
    await prisma.$disconnect();
    logger.info("Prisma connection pool closed");
  } catch (err) {
    logger.error({ err }, "Error disconnecting Prisma");
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
