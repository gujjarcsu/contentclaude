import { PrismaClient } from "@prisma/client";
import { RUNS_JOBS, PROCESS_ROLE } from "./utils/processRole.server.js";

const globalForPrisma = globalThis;

/**
 * Phase 1 item 2 — web and worker are separate machines, and each one keeps its
 * own Prisma connection pool. They do not want the same size pool.
 *
 * Web serves short requests and wants headroom for bursts. The worker runs
 * BULLMQ_CONCURRENCY jobs at a time and holds connections for the length of a
 * generation, so a smaller, predictable pool keeps the two processes together
 * inside Neon's ceiling instead of each claiming the full DATABASE_URL limit.
 *
 * Fly has no per-process-group secrets, so the worker's connection string is a
 * separate secret and the process picks the one that belongs to its role. If
 * WORKER_DATABASE_URL is not set, the worker uses DATABASE_URL like everything
 * else — this is an optimisation, never a requirement to boot.
 */
function datasourceUrl() {
  if (RUNS_JOBS && process.env.WORKER_DATABASE_URL) return process.env.WORKER_DATABASE_URL;
  return process.env.DATABASE_URL;
}

const url = datasourceUrl();

const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

/** Which connection string this process picked, for the startup log and health. */
export const DB_ROLE_URL_SOURCE =
  RUNS_JOBS && process.env.WORKER_DATABASE_URL ? "WORKER_DATABASE_URL" : "DATABASE_URL";
export { PROCESS_ROLE };

export default prisma;
