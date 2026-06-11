/**
 * Simple cache layer with Redis (production) and in-process Map (dev fallback).
 *
 * Usage:
 *   import { getCache, setCache, invalidateCache } from "./cache.server.js";
 *   const brandVoice = await getCache(`bv:${shop}`, () => prisma.brandVoice.findUnique(...), 300);
 *
 * The third argument is TTL in seconds. The supplier fn is called on cache miss.
 * All cache keys are namespaced by CACHE_PREFIX to avoid collisions.
 */

import logger from "./logger.server.js";

const REDIS_URL = process.env.REDIS_URL;
const CACHE_PREFIX = "cc:"; // contentclaude

// In-process fallback cache — bounded LRU to prevent memory growth on long-running servers.
// At 100k merchants with Redis available, this Map stays near-empty (Redis handles everything).
// In the rare case Redis is down, cap at 2000 entries so RAM stays bounded.
const MEM_CACHE_MAX = 2_000;
const memCache = new Map(); // key → { value, expiresAt } — insertion-ordered (oldest = first)

function memCacheSet(key, entry) {
  // Evict oldest entry when at capacity (O(1) — Map preserves insertion order)
  if (memCache.size >= MEM_CACHE_MAX && !memCache.has(key)) {
    memCache.delete(memCache.keys().next().value);
  }
  memCache.set(key, entry);
}

let _redis = null;
let _redisFailedAt = 0;
const REDIS_RETRY_BACKOFF_MS = 60_000; // only retry once per minute after a failure

async function getRedis() {
  if (!REDIS_URL) return null;
  if (_redis) return _redis;
  // Circuit breaker: don't hammer a broken Redis on every request
  if (_redisFailedAt && Date.now() - _redisFailedAt < REDIS_RETRY_BACKOFF_MS) return null;
  try {
    const { default: Redis } = await import("ioredis");
    _redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 0,
      retryStrategy: () => null, // disable ioredis internal retries — we handle retries ourselves
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    _redis.on("error", (err) => {
      logger.warn({ err: err.message }, "Redis cache connection error — falling back to in-process cache");
      _redis = null;
      _redisFailedAt = Date.now();
    });
    await _redis.connect();
    _redisFailedAt = 0;
    logger.info("Redis cache connected");
    return _redis;
  } catch (err) {
    logger.warn({ err: err.message }, "Could not connect to Redis — using in-process cache");
    _redis = null;
    _redisFailedAt = Date.now();
    return null;
  }
}

/**
 * Get a value from cache, or compute it via `supplier` and cache it.
 * @param {string} key - Cache key (will be prefixed)
 * @param {() => Promise<any>} supplier - Function to compute the value on cache miss
 * @param {number} ttlSeconds - TTL in seconds
 */
export async function getCache(key, supplier, ttlSeconds = 300) {
  const fullKey = CACHE_PREFIX + key;

  try {
    const redis = await getRedis();
    if (redis) {
      const cached = await redis.get(fullKey);
      if (cached !== null) return JSON.parse(cached);
      const value = await supplier();
      if (value !== null && value !== undefined) {
        await redis.setex(fullKey, ttlSeconds, JSON.stringify(value));
      }
      return value;
    }
  } catch (err) {
    logger.warn({ key, err: err.message }, "Redis cache get failed — falling back");
  }

  // In-process fallback
  const entry = memCache.get(fullKey);
  if (entry && entry.expiresAt > Date.now()) return entry.value;

  const value = await supplier();
  memCacheSet(fullKey, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  return value;
}

/**
 * Write a value directly to cache without a supplier.
 */
export async function setCache(key, value, ttlSeconds = 300) {
  const fullKey = CACHE_PREFIX + key;
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.setex(fullKey, ttlSeconds, JSON.stringify(value));
      return;
    }
  } catch (err) {
    logger.warn({ key, err: err.message }, "Redis cache set failed");
  }
  memCacheSet(fullKey, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Invalidate a cache key (e.g. after a write).
 */
export async function invalidateCache(key) {
  const fullKey = CACHE_PREFIX + key;
  memCache.delete(fullKey);
  try {
    const redis = await getRedis();
    if (redis) await redis.del(fullKey);
  } catch (err) {
    logger.warn({ key, err: err.message }, "Redis cache invalidation failed");
  }
}

/**
 * Invalidate all cache keys matching a pattern (e.g. all keys for a shop).
 * Uses SCAN cursor iteration (non-blocking) instead of KEYS (O(N) blocking).
 */
export async function invalidateCachePattern(pattern) {
  const fullPattern = CACHE_PREFIX + pattern;
  // Invalidate in-process cache
  const prefix = fullPattern.replace(/\*/g, "");
  for (const key of memCache.keys()) {
    if (key.startsWith(prefix)) memCache.delete(key);
  }
  try {
    const redis = await getRedis();
    if (!redis) return;
    // SCAN iterates in batches of 100 — non-blocking unlike KEYS which scans the
    // entire keyspace in a single command and blocks the Redis event loop.
    let cursor = "0";
    const toDelete = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", fullPattern, "COUNT", 100);
      cursor = nextCursor;
      toDelete.push(...keys);
    } while (cursor !== "0");
    if (toDelete.length > 0) {
      await redis.del(...toDelete);
    }
  } catch (err) {
    logger.warn({ pattern, err: err.message }, "Redis pattern invalidation failed");
  }
}
