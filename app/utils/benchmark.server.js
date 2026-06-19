// Category benchmarking (the data-flywheel moat) — server-only.
//
// Privacy-safe by construction: we persist ONLY an anonymized 10-bucket score
// histogram + sample count per category (CategoryBenchmark) — never a per-store
// row. A merchant's standing ("top quartile", percentile) is derived from the
// histogram, so no individual store's score is recoverable. Recording a sample
// is gated on explicit opt-in (GrowthState.benchmarkOptIn) and the
// `categoryBenchmarking` feature flag.

import prisma from "../db.server.js";
import { isFeatureEnabled } from "./featureFlags.server.js";
import logger from "./logger.server.js";

const BUCKETS = 10;
const EMPTY = () => Array(BUCKETS).fill(0);

// ─── Pure histogram helpers (unit-tested) ──────────────────────────────────────

/** Map a 0–100 score to a histogram bucket index 0–9. */
export function bucketIndex(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  return Math.min(BUCKETS - 1, Math.floor(s / 10));
}

/** Return a new histogram with `score` added. Tolerates a malformed input array. */
export function addToBuckets(buckets, score) {
  const next = normalizeBuckets(buckets);
  next[bucketIndex(score)] += 1;
  return next;
}

function normalizeBuckets(buckets) {
  if (!Array.isArray(buckets) || buckets.length !== BUCKETS) return EMPTY();
  return buckets.map((n) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0));
}

/** Total samples in a histogram. */
export function sampleCount(buckets) {
  return normalizeBuckets(buckets).reduce((a, b) => a + b, 0);
}

/**
 * Percentile rank (0–100) of `score` within the histogram: the share of samples
 * scoring below this score's bucket, plus half of the same bucket (mid-bucket
 * convention). Returns 0 for an empty histogram.
 */
export function percentileRank(buckets, score) {
  const b = normalizeBuckets(buckets);
  const total = b.reduce((a, c) => a + c, 0);
  if (total === 0) return 0;
  const idx = bucketIndex(score);
  let below = 0;
  for (let i = 0; i < idx; i++) below += b[i];
  const same = b[idx];
  return Math.round(((below + same / 2) / total) * 100);
}

/** Approximate median score (midpoint of the median bucket). */
export function medianScore(buckets) {
  const b = normalizeBuckets(buckets);
  const total = b.reduce((a, c) => a + c, 0);
  if (total === 0) return 0;
  const mid = total / 2;
  let cum = 0;
  for (let i = 0; i < BUCKETS; i++) {
    cum += b[i];
    if (cum >= mid) return i * 10 + 5;
  }
  return 95;
}

/** Human standing label from a percentile rank. */
export function quartileLabel(percentile) {
  if (percentile >= 75) return "top quartile";
  if (percentile >= 50) return "upper-middle";
  if (percentile >= 25) return "lower-middle";
  return "bottom quartile";
}

// ─── Persistence (opt-in + flag gated) ─────────────────────────────────────────

/** Normalize a Shopify productType into a stable category key. */
export function normalizeCategory(productType) {
  const c = String(productType || "").trim().toLowerCase();
  return c || "uncategorized";
}

/**
 * Record one anonymized sample into the category histograms. No-op unless the
 * benchmarking flag is on AND the shop opted in. Never stores shop-identifying data.
 */
export async function recordBenchmarkSample({ shop, category, geoScore, seoScore }) {
  if (!isFeatureEnabled("categoryBenchmarking")) return;
  try {
    const growth = await prisma.growthState.findUnique({ where: { shop } });
    if (!growth?.benchmarkOptIn) return;

    const key = normalizeCategory(category);
    const existing = await prisma.categoryBenchmark.findUnique({ where: { category: key } });
    const geo = addToBuckets(safeParse(existing?.geoBuckets), geoScore);
    const seo = addToBuckets(safeParse(existing?.seoBuckets), seoScore);

    await prisma.categoryBenchmark.upsert({
      where: { category: key },
      update: { geoBuckets: JSON.stringify(geo), seoBuckets: JSON.stringify(seo), sampleCount: { increment: 1 } },
      create: { category: key, geoBuckets: JSON.stringify(geo), seoBuckets: JSON.stringify(seo), sampleCount: 1 },
    });
  } catch (err) {
    logger.warn({ shop, err: err.message }, "recordBenchmarkSample failed (non-fatal)");
  }
}

/**
 * Get a merchant's standing for a category. Returns null when benchmarking is
 * off or the sample is too small to be meaningful (privacy + statistical floor).
 */
export async function getBenchmarkStanding({ category, geoScore, seoScore }) {
  if (!isFeatureEnabled("categoryBenchmarking")) return null;
  const key = normalizeCategory(category);
  const row = await prisma.categoryBenchmark.findUnique({ where: { category: key } });
  const MIN_SAMPLE = 20; // don't show a benchmark until it's statistically/privacy sound
  if (!row || row.sampleCount < MIN_SAMPLE) return null;

  const geoB = safeParse(row.geoBuckets);
  const seoB = safeParse(row.seoBuckets);
  const geoPct = percentileRank(geoB, geoScore);
  const seoPct = percentileRank(seoB, seoScore);
  return {
    category: key,
    sampleCount: row.sampleCount,
    geo: { percentile: geoPct, median: medianScore(geoB), standing: quartileLabel(geoPct) },
    seo: { percentile: seoPct, median: medianScore(seoB), standing: quartileLabel(seoPct) },
  };
}

function safeParse(json) {
  try {
    return normalizeBuckets(JSON.parse(json));
  } catch {
    return EMPTY();
  }
}
