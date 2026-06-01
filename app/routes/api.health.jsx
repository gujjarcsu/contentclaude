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
import { getCache } from "../utils/cache.server";

export const loader = async () => {
  const checks = {};
  let healthy = true;

  const isProd = process.env.NODE_ENV === "production";

  // Database ping
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    checks.database = isProd ? "error" : `error: ${err.message}`;
    healthy = false;
  }

  // Redis ping — reuses the shared singleton from cache.server.js
  if (process.env.REDIS_URL) {
    try {
      await getCache("__health_ping__", async () => "ok", 5);
      checks.redis = "ok";
    } catch (err) {
      // Redis failure is degraded, not fatal — app falls back to in-memory cache
      checks.redis = isProd ? "degraded" : `degraded: ${err.message}`;
    }
  }

  // In production return minimal info; detailed checks only in dev/staging
  const body = isProd
    ? { status: healthy ? "ok" : "error", timestamp: new Date().toISOString() }
    : { status: healthy ? "ok" : "error", timestamp: new Date().toISOString(), checks };

  return Response.json(body, { status: healthy ? 200 : 503 });
};
