/**
 * Per-shop rate limiter for the AI generate endpoint.
 *
 * Prevents a single merchant from firing multiple simultaneous generation
 * requests (e.g. double-click, two browser tabs open, scripted abuse).
 *
 * Uses Redis sliding-window when available; falls back to an in-process
 * Map for dev/single-server deployments.
 *
 * Default: 1 concurrent generation per shop, max 10 per minute.
 */

import logger from "./logger.server.js";

const REDIS_URL = process.env.REDIS_URL;
const RL_PREFIX = "rl:";

// In-process fallback store — bounded to prevent unbounded memory growth
const RL_MEM_MAX = 5_000; // covers 5k concurrent shops in Redis-down scenario
const memStore = new Map(); // shop → { count, windowStart }

function memStoreSet(key, entry) {
  if (memStore.size >= RL_MEM_MAX && !memStore.has(key)) {
    memStore.delete(memStore.keys().next().value);
  }
  memStore.set(key, entry);
}

let _redis = null;

async function getRedis() {
  if (!REDIS_URL) return null;
  if (_redis) return _redis;
  try {
    const { default: Redis } = await import("ioredis");
    _redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    _redis.on("error", () => { _redis = null; });
    await _redis.connect();
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

/**
 * Check and consume a rate-limit slot for a shop.
 *
 * @param {string} shop - The shop domain
 * @param {object} options
 * @param {number} options.maxPerMinute - Max requests per 60-second window (default 10)
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
 */
export async function checkRateLimit(shop, { maxPerMinute = 10 } = {}) {
  const key = RL_PREFIX + shop;
  const windowMs = 60_000;
  const now = Date.now();

  try {
    const redis = await getRedis();
    if (redis) {
      // Sliding window using Redis sorted set
      const windowStart = now - windowMs;
      const pipe = redis.pipeline();
      pipe.zremrangebyscore(key, 0, windowStart);
      pipe.zadd(key, now, `${now}-${Math.random()}`);
      pipe.zcard(key);
      pipe.expire(key, 65);
      const results = await pipe.exec();
      const count = results[2][1]; // zcard result

      if (count > maxPerMinute) {
        const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
        const retryAfterSeconds = oldest[1]
          ? Math.ceil((Number(oldest[1]) + windowMs - now) / 1000)
          : 60;
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }
      return { allowed: true, remaining: maxPerMinute - count, retryAfterSeconds: 0 };
    }
  } catch (err) {
    logger.warn({ shop, err: err.message }, "Rate limiter Redis error — allowing request");
  }

  // In-process fallback
  const entry = memStore.get(shop) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart > windowMs) {
    // Window expired, reset
    memStoreSet(shop, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxPerMinute - 1, retryAfterSeconds: 0 };
  }
  if (entry.count >= maxPerMinute) {
    const retryAfterSeconds = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  entry.count++;
  memStoreSet(shop, entry);
  return { allowed: true, remaining: maxPerMinute - entry.count, retryAfterSeconds: 0 };
}
