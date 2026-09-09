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
import prisma from "../db.server.js";

const QUEUE_NAME = "content-generation";
const REDIS_URL = process.env.REDIS_URL;
const INFLIGHT_CAP = 2; // max concurrent jobs per shop

// Shared Redis connection options — ioredis parses the URL.
//
// Phase 0 item 13: ioredis defaults to an OFFLINE QUEUE plus unlimited retries,
// so when Redis is unreachable `queue.add` does not fail — it buffers the
// command and waits. "Start job" then hung until the edge proxy returned a 502,
// and the inline fallback below (the entire point of the try/catch) was never
// reached. Failing fast is what makes that fallback real.
//
// The WORKER keeps the offline queue: it is a long-lived consumer that should
// ride out a brief Redis blip rather than die, and nothing is waiting on it.
const enqueueConnection = REDIS_URL
  ? { url: REDIS_URL, enableOfflineQueue: false, maxRetriesPerRequest: 1 }
  : null;
const workerConnection = REDIS_URL ? { url: REDIS_URL } : null;
const redisConnection = enqueueConnection;

/** How long we are willing to wait for Redis before falling back to inline. */
const ENQUEUE_TIMEOUT_MS = 5_000;

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
    async (job, token) => {
      const { jobId } = job.data;
      logger.info({ jobId, attempt: job.attemptsMade + 1 }, "Worker picked up generation job");
      // Pass the live Job + token so the processor can heartbeat the lock
      // (extendLock) between products on long bulk runs.
      await processBulkJob(jobId, job, token);
    },
    {
      connection: workerConnection,
      // Configurable via BULLMQ_CONCURRENCY env var — increase for higher throughput servers.
      // Default 3: safe for a single Fly.io machine sharing Anthropic rate limits.
      // At 100k merchants scale, run multiple worker machines each with concurrency 3-5.
      concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || "3", 10),
      // Phase 0 item 12: 5 minutes, not 30. The lock is what BullMQ waits for
      // before deciding a killed worker's job has stalled and re-running it, so
      // a 30-minute lock meant a job killed by a deploy sat dead for half an
      // hour before anything even looked at it. The processor heartbeats this
      // lock after every product (extendLock), so a long, healthy run is never
      // cut short by the shorter value.
      lockDuration: 5 * 60 * 1000,
      stalledInterval: 60_000,      // check for stalled jobs every 60s
    }
  );

  _worker.on("completed", (job) => {
    logger.info({ jobId: job.data.jobId }, "Worker: job completed");
  });

  _worker.on("failed", async (job, err) => {
    logger.error({ jobId: job?.data?.jobId, err, attempts: job?.attemptsMade }, "Worker: job failed");
    // Phase 0 item 12 — when BullMQ gives up (all attempts exhausted), the DB
    // row was left in "processing" forever: the merchant saw a permanent
    // "Processing…", and the row kept counting against the per-shop in-flight
    // cap so no new job could be started either. Only mark it failed once
    // BullMQ has genuinely finished retrying.
    const jobId = job?.data?.jobId;
    const finished = (job?.attemptsMade ?? 0) >= (job?.opts?.attempts ?? 1);
    if (!jobId || !finished) return;
    try {
      const { count } = await prisma.generationJob.updateMany({
        where: { id: jobId, status: { in: ["queued", "processing"] } },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorLog: JSON.stringify([
            { productId: "N/A", error: `The job stopped unexpectedly: ${err?.message ?? "unknown error"}` },
          ]),
        },
      });
      if (count > 0) logger.warn({ jobId }, "Marked job failed after BullMQ exhausted its retries");
    } catch (dbErr) {
      logger.error({ jobId, err: dbErr?.message }, "Could not mark the failed job as failed");
    }
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
    // Per-shop in-flight cap: stop one tenant monopolising the worker pool.
    // Counted from the DB (queued/processing) — accurate and self-healing, unlike
    // a Redis counter which leaks on process restarts (Fly auto-stops machines)
    // and could permanently wedge a shop's bulk jobs. The just-created job is
    // already 'queued', so it's included in the count.
    const row = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { shop: true } });
    const shop = row?.shop ?? null;
    if (shop) {
      const active = await prisma.generationJob.count({
        where: { shop, status: { in: ["queued", "processing"] } },
      });
      if (active > INFLIGHT_CAP) {
        await prisma.generationJob.deleteMany({ where: { id: jobId, status: "queued" } });
        throw new Error("You already have jobs running — please wait for them to finish, then try again.");
      }
    }

    try {
      // Phase 0 item 13 — bound the wait. Even with the offline queue disabled,
      // a half-open connection can leave `add` pending; the merchant is sitting
      // on a spinner, so five seconds is the whole budget before we fall back.
      await Promise.race([
        (async () => {
          await startWorker();
          await queue.add("process-bulk", { jobId, shop }, { jobId });
        })(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Redis did not respond within ${ENQUEUE_TIMEOUT_MS}ms`)), ENQUEUE_TIMEOUT_MS),
        ),
      ]);
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
