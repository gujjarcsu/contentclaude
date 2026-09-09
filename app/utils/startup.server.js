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

import prisma from "../db.server.js";
import logger from "./logger.server.js";

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
          error: "This job stopped responding and was ended. Use Resume to finish the remaining products — anything already generated will not be charged again.",
        },
      ]),
    },
  });

  for (const job of stuck) {
    logger.warn({ jobId: job.id, shop: job.shop, startedAt: job.startedAt, lastTouched: job.updatedAt }, "Marked stuck job as failed");
  }
  return count;
}

export function runStartupChecks() {
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
      "Set the REDIS_URL secret before deploying."
    );
  }
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
    warnings.push("Shopify API credentials not configured");
  }
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  if (!appUrl || appUrl.includes("example.com")) {
    const msg = "SHOPIFY_APP_URL is not set or is a placeholder — set it to your production URL before running shopify app deploy";
    if (process.env.NODE_ENV === "production") {
      warnings.push(msg);
    } else {
      logger.debug("SHOPIFY_APP_URL placeholder is OK in dev (CLI auto-updates via tunnel)");
    }
  }
  // Exactly the scopes the code uses: write_products (products, media,
  // product metafields via metafieldsSet) and write_content (blogs/articles).
  // There is NO metaobject code in this app — do not add metaobject scopes.
  const envScopes = new Set((process.env.SCOPES || "").split(",").map((s) => s.trim()).filter(Boolean));
  const requiredScopes = ["write_products", "write_content"];
  const missingScopes = requiredScopes.filter((s) => !envScopes.has(s));
  if (missingScopes.length > 0) {
    warnings.push(`Missing required scopes in SCOPES env var: ${missingScopes.join(", ")} — product/blog writes will fail`);
  }
  const extraScopes = [...envScopes].filter((s) => !requiredScopes.includes(s));
  if (extraScopes.length > 0) {
    warnings.push(`SCOPES contains scopes this app never uses: ${extraScopes.join(", ")} — remove them (over-broad scopes are an App Store rejection risk, requirement 3.2)`);
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
  const dbUrl = process.env.DATABASE_URL || "";
  if (process.env.NODE_ENV === "production" && dbUrl) {
    const pooled = dbUrl.includes("pgbouncer=true") || dbUrl.includes("-pooler.");
    const limitMatch = dbUrl.match(/[?&]connection_limit=(\d+)/);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : null;

    if (!pooled) {
      warnings.push(
        "DATABASE_URL does not look like a pooled endpoint (no pgbouncer=true and no -pooler host) — " +
        "use the pooled connection string, or concurrent load will exhaust the database's own connection limit."
      );
    }
    if (limit === null) {
      warnings.push(
        `DATABASE_URL has no connection_limit — set connection_limit=${RECOMMENDED_CONNECTION_LIMIT} on the pooled endpoint.`
      );
    } else if (limit < 2) {
      warnings.push(
        `DATABASE_URL sets connection_limit=${limit}. One connection serialises the web process behind every ` +
        "worker transaction and causes pool timeouts under modest load — " +
        `raise it to ${RECOMMENDED_CONNECTION_LIMIT} on the pooled endpoint.`
      );
    }
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

  runStartupChecks();

  try {
    await recoverStuckJobs();
  } catch (err) {
    // Startup recovery is best-effort — never crash the server
    logger.error({ err }, "Startup job recovery failed");
  }

  // Phase 0 item 12 — and keep checking. Running this only at boot meant a job
  // stranded by a crash stayed "Processing…" until the next deploy, holding the
  // shop's in-flight slot the whole time. unref() so the timer never keeps the
  // process alive during shutdown.
  const recoveryTimer = setInterval(() => {
    recoverStuckJobs().catch((err) => logger.error({ err }, "Periodic job recovery failed"));
  }, RECOVERY_INTERVAL_MS);
  recoveryTimer.unref?.();

  // Start BullMQ worker if Redis is configured
  if (process.env.REDIS_URL) {
    try {
      const { startWorker } = await import("../queues/generationQueue.server.js");
      await startWorker();
    } catch (err) {
      logger.error({ err }, "Failed to start BullMQ worker");
    }
  }
})();

// ── Graceful shutdown ──────────────────────────────────────────────────────
let _shuttingDown = false;

async function gracefulShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logger.info({ signal }, "Shutdown signal received — closing BullMQ and Prisma gracefully");

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

  try {
    await prisma.$disconnect();
    logger.info("Prisma connection pool closed");
  } catch (err) {
    logger.error({ err }, "Error disconnecting Prisma");
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
