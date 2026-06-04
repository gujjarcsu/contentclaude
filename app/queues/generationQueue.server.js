/**
 * Production-grade job queue using BullMQ + Redis.
 *
 * When REDIS_URL is set the app uses BullMQ:
 *   - Jobs survive server restarts (stored in Redis)
 *   - Automatic retry with exponential backoff
 *   - BullMQ stall detection requeues crashed jobs
 *   - Concurrency controlled at the worker level
 *
 * When REDIS_URL is absent (local dev without Redis):
 *   - Falls back to a fire-and-forget setTimeout
 *   - Log warning so developers know they're on the degraded path
 *
 * Worker is started lazily on first job enqueue and lives for the
 * lifetime of the process. Railway/Fly.io keep the process alive.
 */

import { Queue, Worker } from "bullmq";
import logger from "../utils/logger.server.js";

const QUEUE_NAME = "content-generation";
const REDIS_URL = process.env.REDIS_URL;

// Shared Redis connection options — ioredis parses the URL
const redisConnection = REDIS_URL ? { url: REDIS_URL } : null;

let _queue = null;
let _worker = null;
let _workerStarted = false;

function getQueue() {
  if (!redisConnection) return null;
  if (!_queue) {
    try {
      _queue = new Queue(QUEUE_NAME, {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 10_000 },
          removeOnComplete: { age: 86_400, count: 1_000 }, // Keep last 1000 completed for 24h
          removeOnFail: { age: 604_800, count: 5_000 },    // Keep failed for 7 days
        },
      });
      _queue.on("failed", (job, err) => {
        logger.error(
          { jobId: job?.id, err: err?.message, attemptsMade: job?.attemptsMade },
          "Job permanently failed — moved to DLQ"
        );
      });
      logger.info({ queueName: QUEUE_NAME }, "BullMQ queue initialised");
    } catch (err) {
      logger.warn({ err: err.message }, "Redis not available — queue disabled, using inline processing");
      _queue = null;
    }
  }
  return _queue;
}

export function isQueueAvailable() {
  return !!getQueue();
}

/**
 * Starts the in-process BullMQ worker.
 * Safe to call multiple times — idempotent.
 */
export async function startWorker() {
  if (!redisConnection || _workerStarted) return;
  _workerStarted = true;

  // Dynamic import to avoid circular dep at module load time
  const { processBulkJob } = await import("../utils/bulkProcessor.server.js");

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { jobId } = job.data;
      logger.info({ jobId, attempt: job.attemptsMade + 1 }, "Worker picked up generation job");
      await processBulkJob(jobId);
    },
    {
      connection: redisConnection,
      // Configurable via BULLMQ_CONCURRENCY env var — increase for higher throughput servers.
      // Default 3: safe for a single Fly.io machine sharing Anthropic rate limits.
      // At 100k merchants scale, run multiple worker machines each with concurrency 3-5.
      concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || "3", 10),
      lockDuration: 300_000, // 5-minute lock; jobs taking longer are re-queued
    }
  );

  _worker.on("completed", (job) => {
    logger.info({ jobId: job.data.jobId }, "Worker: job completed");
  });

  _worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.data?.jobId, err, attempts: job?.attemptsMade }, "Worker: job failed");
  });

  _worker.on("stalled", (jobId) => {
    logger.warn({ bullJobId: jobId }, "Worker: job stalled — will be retried");
  });

  const concurrency = parseInt(process.env.BULLMQ_CONCURRENCY || "3", 10);
  logger.info({ concurrency }, "BullMQ worker started");
}

/**
 * Enqueue a bulk generation job.
 * Uses BullMQ when Redis is available, falls back to setTimeout in dev.
 */
export async function enqueueGenerationJob(jobId) {
  const queue = getQueue();

  if (queue) {
    try {
      await startWorker();
      await queue.add("process-bulk", { jobId }, { jobId });
      logger.info({ jobId }, "Enqueued generation job in BullMQ");
      return;
    } catch (redisError) {
      logger.warn({ jobId, err: redisError.message }, "Redis unavailable — processing job inline");
    }
  } else {
    logger.warn(
      { jobId },
      "REDIS_URL not set — running generation job in-process (dev mode). Set REDIS_URL for production reliability."
    );
  }

  // Inline fallback: Redis unavailable or not configured
  const { processBulkJob } = await import("../utils/bulkProcessor.server.js");
  setTimeout(() => processBulkJob(jobId).catch((err) => {
    logger.error({ jobId, err }, "In-process job failed");
  }), 0);
}

/**
 * Graceful shutdown — call on SIGTERM.
 * force=false: waits for active jobs to finish (up to lockDuration).
 * force=true:  closes immediately without waiting.
 */
export async function closeQueue(force = false) {
  if (_worker) {
    await _worker.close(force);
    logger.info({ force }, "BullMQ worker closed");
  }
  if (_queue) {
    await _queue.close();
    logger.info("BullMQ queue closed");
  }
}
