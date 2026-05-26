/**
 * Health check endpoint — GET /api/health
 *
 * Returns 200 when the app is operational: database is reachable and
 * the process is running. Returns 503 on any failure.
 *
 * Used by:
 *   - Railway / Fly.io health checks (configure as the health check URL)
 *   - Uptime monitors (UptimeRobot, Better Uptime, etc.)
 *   - Load balancer health probes
 *
 * Does NOT require Shopify auth — this endpoint is public by design.
 */

import prisma from "../db.server";

export const loader = async () => {
  const checks = {};
  let healthy = true;

  // Database ping
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    checks.database = `error: ${err.message}`;
    healthy = false;
  }

  // Redis ping (optional — not a hard failure)
  if (process.env.REDIS_URL) {
    try {
      const { default: Redis } = await import("ioredis");
      const r = new Redis(process.env.REDIS_URL, {
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      await r.connect();
      await r.ping();
      await r.quit();
      checks.redis = "ok";
    } catch (err) {
      // Redis failure is degraded, not fatal — app still works with in-memory fallback
      checks.redis = `degraded: ${err.message}`;
    }
  }

  const body = {
    status: healthy ? "ok" : "error",
    timestamp: new Date().toISOString(),
    checks,
    version: process.env.npm_package_version ?? "unknown",
  };

  return Response.json(body, { status: healthy ? 200 : 503 });
};
