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

const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

let _initialized = false;

async function recoverStuckJobs() {
  const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS);
  const stuck = await prisma.generationJob.findMany({
    where: { status: "processing", startedAt: { lt: cutoff } },
    select: { id: true, shop: true, startedAt: true },
  });

  if (stuck.length === 0) return;

  logger.warn({ count: stuck.length }, "Recovering stuck generation jobs");

  await prisma.generationJob.updateMany({
    where: { id: { in: stuck.map((j) => j.id) } },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorLog: JSON.stringify([{ productId: "N/A", error: "Server restarted while job was processing." }]),
    },
  });

  for (const job of stuck) {
    logger.warn({ jobId: job.id, shop: job.shop, startedAt: job.startedAt }, "Marked stuck job as failed");
  }
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
    warnings.push(
      "REDIS_URL not set in production — bulk jobs run in-process. " +
      "Concurrent jobs share the same process and will compete for Anthropic rate limits."
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
  const envScopes = new Set((process.env.SCOPES || "").split(",").map((s) => s.trim()).filter(Boolean));
  const requiredScopes = ["write_products", "write_metaobjects"];
  const missingScopes = requiredScopes.filter((s) => !envScopes.has(s));
  if (missingScopes.length > 0) {
    warnings.push(`Missing required scopes in SCOPES env var: ${missingScopes.join(", ")} — FAQ metafield writes will fail`);
  }
  if (process.env.NODE_ENV === "production" && !process.env.CONTENTCLAUDE_API_TOKEN) {
    warnings.push("CONTENTCLAUDE_API_TOKEN not set — /api/generate external endpoint will reject all requests");
  }
  if (process.env.NODE_ENV === "production" && !process.env.SENTRY_DSN) {
    warnings.push("SENTRY_DSN not set — runtime errors will not be captured by Sentry");
  }

  const dbUrl = process.env.DATABASE_URL || "";
  if (process.env.NODE_ENV === "production") {
    if (dbUrl.includes("neon.tech") && !dbUrl.includes("pgbouncer=true")) {
      warnings.push(
        "DATABASE_URL is a Neon connection but missing ?pgbouncer=true&connection_limit=1 — " +
        "connection pool exhaustion will occur under concurrent load. Add these params to DATABASE_URL immediately."
      );
    }
    if (dbUrl.includes("neon.tech") && !dbUrl.includes("connection_limit=")) {
      warnings.push("DATABASE_URL missing connection_limit parameter for Neon — set connection_limit=1 with pgbouncer.");
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
