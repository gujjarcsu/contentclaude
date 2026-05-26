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
const CACHE_PREFIX = "cp:"; // contentpilot

// In-process fallback cache for dev
const memCache = new Map(); // key → { value, expiresAt }

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
    _redis.on("error", (err) => {
      logger.warn({ err: err.message }, "Redis cache connection error — falling back to in-process cache");
      _redis = null; // Force reconnect on next call
    });
    await _redis.connect();
    logger.info("Redis cache connected");
    return _redis;
  } catch (err) {
    logger.warn({ err: err.message }, "Could not connect to Redis — using in-process cache");
    _redis = null;
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
  memCache.set(fullKey, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
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
  memCache.set(fullKey, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
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
 * Only works when Redis is configured. Mem-cache invalidation is by prefix scan.
 */
export async function invalidateCachePattern(pattern) {
  const fullPattern = CACHE_PREFIX + pattern;
  // Invalidate in-process cache
  for (const key of memCache.keys()) {
    if (key.startsWith(fullPattern.replace("*", ""))) memCache.delete(key);
  }
  try {
    const redis = await getRedis();
    if (!redis) return;
    const keys = await redis.keys(fullPattern);
    if (keys.length) await redis.del(...keys);
  } catch (err) {
    logger.warn({ pattern, err: err.message }, "Redis pattern invalidation failed");
  }
}
