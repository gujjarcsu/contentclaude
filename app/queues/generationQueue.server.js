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

import { Queue, Worker, QueueEvents } from "bullmq";
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
    _queue = new Queue(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: { count: 200 }, // Keep last 200 completed jobs for debugging
        removeOnFail: { count: 500 },
      },
    });
    logger.info({ queueName: QUEUE_NAME }, "BullMQ queue initialised");
  }
  return _queue;
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
      concurrency: 3, // Process up to 3 bulk jobs simultaneously
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

  logger.info({ concurrency: 3 }, "BullMQ worker started");
}

/**
 * Enqueue a bulk generation job.
 * Uses BullMQ when Redis is available, falls back to setTimeout in dev.
 */
export async function enqueueGenerationJob(jobId) {
  const queue = getQueue();

  if (queue) {
    // Start worker lazily on first enqueue (idempotent)
    await startWorker();
    await queue.add("process-bulk", { jobId }, { jobId }); // jobId as deduplication key
    logger.info({ jobId }, "Enqueued generation job in BullMQ");
  } else {
    // Dev fallback: no Redis configured
    logger.warn(
      { jobId },
      "REDIS_URL not set — running generation job in-process via setTimeout (dev mode). " +
        "Job will be lost on server restart. Set REDIS_URL for production reliability."
    );
    const { processBulkJob } = await import("../utils/bulkProcessor.server.js");
    setTimeout(() => processBulkJob(jobId).catch((err) => {
      logger.error({ jobId, err }, "In-process job failed");
    }), 0);
  }
}

/**
 * Graceful shutdown — call on SIGTERM.
 */
export async function closeQueue() {
  await _worker?.close();
  await _queue?.close();
  logger.info("BullMQ queue and worker closed");
}
