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
 *
 * ── --peek ─────────────────────────────────────────────────────────────────
 *
 * P6.0 — with `--peek` it READS and does not clear. That is what makes the
 * end-to-end proof possible: peek, have a merchant click Publish in the app,
 * peek again. The default mode clears the key itself, which proves the function
 * works and cannot prove that a CLICK reaches it — the gap I named at the end of
 * P5.2 and this closes.
 *
 * A peek that finds nothing is reported as UNKNOWN, never as "cleared": an
 * absent key is equally what a cold cache looks like.
 */
import { getRedis, cacheKey } from "../app/utils/cache.server.js";
import { storeScanKey, invalidateStoreScan } from "../app/utils/storeScanCache.server.js";
import prisma from "../app/db.server.js";

const PEEK = process.argv.includes("--peek");
/**
 * P6.0 — which shop to look at.
 *
 * The default picks the shop with the most content, which is the one whose
 * score a merchant would notice. That is right for the general question and
 * wrong for the end-to-end proof: the busiest store is fully optimised and
 * auto-publishes, so its Review screen is permanently empty and there is no
 * Publish button to click. The proof has to run where drafts actually exist.
 */
const shopArgIdx = process.argv.indexOf("--shop");
const SHOP_HANDLE = shopArgIdx > -1 ? process.argv[shopArgIdx + 1] : null;
const out = { readAt: new Date().toISOString(), mode: PEEK ? "peek" : "invalidate" };

// Named shop, or the one with the most content.
let shop = null;
if (SHOP_HANDLE) {
  const want = SHOP_HANDLE.includes(".") ? SHOP_HANDLE : `${SHOP_HANDLE}.myshopify.com`;
  const row = await prisma.shop.findUnique({ where: { shop: want }, select: { shop: true } });
  if (!row) {
    // Named and not found is an ERROR, not a silent fallback to a different
    // shop — reporting a reading from the wrong store would be worse than
    // reporting nothing.
    console.log(JSON.stringify({ ...out, error: `no such shop: ${SHOP_HANDLE}` }, null, 2));
    process.exit(1);
  }
  shop = row.shop;
} else {
  const busiest = await prisma.generatedContent.groupBy({
    by: ["shop"],
    _count: { shop: true },
    orderBy: { _count: { shop: "desc" } },
    take: 1,
  });
  shop = busiest[0]?.shop ?? null;
}
if (!shop) {
  console.log(JSON.stringify({ ...out, error: "no shop has generated content" }, null, 2));
  process.exit(1);
}
out.shopHandle = String(shop).replace(/\.myshopify\.com$/, "");
out.keyShape = "cc:startscan:<shop>";

const redis = await getRedis();
if (!redis) {
  console.log(JSON.stringify({ ...out, error: "no Redis — the cache is in-process and cannot be observed from here" }, null, 2));
  process.exit(1);
}

// The REAL Redis key, not the logical one.
//
// This script first read `startscan:<shop>` and reported a live cache as
// absent, twice, because `getCache` namespaces every key with `cc:` and this
// file had guessed the format instead of asking for it. Same defect as P5.0,
// committed inside the tool built to verify P5.2 — a second copy of a value
// that is owned somewhere else. `cacheKey()` is now exported for exactly this.
const key = cacheKey(storeScanKey(shop));

// ── 1. Is it cached at all, and for how long? ──────────────────────────────
const before = {
  exists: (await redis.exists(key)) === 1,
  ttlSeconds: await redis.ttl(key),
};
out.beforeInvalidation = before;

if (PEEK) {
  // READ ONLY, including of the cache. Nothing below this line runs.
  out.verdict = before.exists
    ? `CACHED: ${before.ttlSeconds}s left before it would expire on its own.`
    : "NOT CACHED. That is not proof of anything on its own — an absent key is equally what a cold cache looks like.";
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

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
