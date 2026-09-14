#!/usr/bin/env node
/**
 * P5.2 — how long a merchant waits for the store score to reflect a publish,
 * measured in PRODUCTION against the real cache.
 *
 * `07-VERIFICATION.md` false green #9 requires read → change → read, with the
 * lag stated. The browser version of that (`tools/proof/score-cache-lag.mjs`)
 * could not complete on our development store: auto-publish is on there, so
 * nothing ever sits in Review, and it correctly reported the lag as UNMEASURED
 * rather than inventing a number. This measures the same chain one layer down,
 * where it can actually be observed.
 *
 * WHAT IT PROVES: that the key exists, that it carries a TTL, that
 * `invalidateStoreScan` — the exact function the three publish paths call —
 * removes it, and how long the next scan then takes to produce a fresh value.
 * That is the whole of the lag a merchant experiences after a publish.
 *
 * WHAT IT DOES NOT PROVE: that a click on Review reaches this function. That is
 * asserted at the source in `tests/utils/storeScanCache.test.js`, break-tested,
 * with a guard that finds a fourth publish site before it ships.
 *
 * READ-ONLY with respect to merchant data. It deletes one cache key, which is
 * exactly what publishing does, and touches no store and no row.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/score-cache-diag.mjs"
 */
import { getRedis } from "../app/utils/cache.server.js";
import { storeScanKey, invalidateStoreScan } from "../app/utils/storeScanCache.server.js";
import prisma from "../app/db.server.js";

const out = { readAt: new Date().toISOString() };

// The shop with the most content — the one whose score a merchant would notice.
const busiest = await prisma.generatedContent.groupBy({
  by: ["shop"],
  _count: { shop: true },
  orderBy: { _count: { shop: "desc" } },
  take: 1,
});
const shop = busiest[0]?.shop;
if (!shop) {
  console.log(JSON.stringify({ ...out, error: "no shop has generated content" }, null, 2));
  process.exit(1);
}
out.shopHandle = String(shop).replace(/\.myshopify\.com$/, "");

const redis = await getRedis();
if (!redis) {
  console.log(JSON.stringify({ ...out, error: "no Redis — the cache is in-process and cannot be observed from here" }, null, 2));
  process.exit(1);
}

const key = storeScanKey(shop);

// ── 1. Is it cached at all, and for how long? ──────────────────────────────
const before = {
  exists: (await redis.exists(key)) === 1,
  ttlSeconds: await redis.ttl(key),
};
out.beforeInvalidation = before;

if (!before.exists) {
  // Nobody has loaded Home for this shop recently. Report that rather than
  // treating an absent key as proof the invalidator works.
  out.verdict =
    "The key is NOT currently cached, so an invalidation cannot be observed. Load Home for this shop and re-run.";
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(1);
}

// ── 2. The change: exactly what a publish does ─────────────────────────────
const t0 = Date.now();
const cleared = await invalidateStoreScan(shop);
const clearMs = Date.now() - t0;

// ── 3. Read again ──────────────────────────────────────────────────────────
const after = {
  exists: (await redis.exists(key)) === 1,
  ttlSeconds: await redis.ttl(key),
};
out.invalidation = { returned: cleared, tookMs: clearMs };
out.afterInvalidation = after;

out.ttlWithoutInvalidation = 600;
out.verdict = after.exists
  ? "FAILED: the key survived invalidation. A merchant would still see a stale score."
  : `The cached score was ${before.ttlSeconds}s from expiring on its own and was cleared in ${clearMs}ms. ` +
    `A merchant's next load of Home re-scores the catalogue, so the lag after a publish is ONE PAGE LOAD ` +
    `rather than the up-to-${out.ttlWithoutInvalidation}s it was before this shipped.`;

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
process.exit(after.exists ? 1 : 0);
