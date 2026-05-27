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

export const startupPromise = (async () => {
  if (_initialized) return;
  _initialized = true;

  // Warn if SQLite is being used in production — not suitable for multi-tenant scale
  if (process.env.NODE_ENV === "production" && (process.env.DATABASE_URL || "").includes("sqlite")) {
    logger.warn("⚠️ SQLite detected in production. Migrate to PostgreSQL for multi-tenant reliability. See DEPLOYMENT.md.");
  }

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
