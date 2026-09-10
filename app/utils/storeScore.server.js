/**
 * Phase 4 item 4.3 — the merchant's proof that the app worked.
 *
 * "13 products optimized" is activity. "Your store scored 61 when you installed
 * and scores 84 now" is an outcome, and it is the only claim in the app a
 * merchant can check against their own catalogue.
 *
 * ── Where the numbers come from ────────────────────────────────────────────
 *
 * Both ends of the comparison are produced by the SAME scanner
 * (`scanStoreForStart`), which is what makes the comparison honest. A "before"
 * measured one way and an "after" measured another is not a delta, it is two
 * unrelated numbers with an arrow between them.
 *
 * The before is captured on the first scan and **never updated**. A before that
 * moves is not a before.
 *
 * ── Cost ───────────────────────────────────────────────────────────────────
 *
 * The scan is one GraphQL page of 30 products, cached per shop. Home asks for
 * it with a 10-minute cache, so a shop costs at most 6 extra Shopify requests
 * per hour no matter how often the merchant reloads. Nothing here issues a
 * request per product.
 *
 * ── What it refuses to do ──────────────────────────────────────────────────
 *
 * If the scan fails, or the store has never been scanned, this returns
 * `{ available: false }` and Home shows nothing. It does not fall back to zero,
 * because "0 → 84" is a fabricated improvement and it would be the single most
 * persuasive lie the app could tell.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { scanStoreForStart } from "./startState.server.js";

/** Home re-reads the store score at most this often. */
export const STORE_SCORE_TTL_S = 600;

/**
 * The store's score now, what it was at install, and the delta.
 *
 * Never throws. Returns `{ available: false }` rather than a number it cannot
 * stand behind.
 *
 * @returns {Promise<{available: boolean, current?: number, atInstall?: number,
 *   delta?: number, since?: string|null, scanned?: number}>}
 */
export async function getStoreScore(admin, shop, { now = new Date() } = {}) {
  try {
    const scan = await scanStoreForStart(admin, shop, { ttlSeconds: STORE_SCORE_TTL_S });
    if (!scan || scan.error || scan.empty || !Number.isFinite(scan.storeScore)) {
      return { available: false };
    }

    // First writer wins. `storeScoreAtInstall: null` in the WHERE is what makes
    // it immutable — a second scan cannot move the baseline.
    const stamped = await prisma.shop
      .updateMany({
        where: { shop, storeScoreAtInstall: null },
        data: { storeScoreAtInstall: scan.storeScore, storeScoreAtInstallAt: now },
      })
      .catch(() => ({ count: 0 }));

    const row = await prisma.shop
      .findUnique({ where: { shop }, select: { storeScoreAtInstall: true, storeScoreAtInstallAt: true } })
      .catch(() => null);

    // Keep every scored product's "after" current, and capture a "before" for
    // any product we are seeing for the first time. This rides the scan that
    // already happened — no extra Shopify request.
    void recordProductScores(shop, scan.scored ?? [], now);

    const atInstall = row?.storeScoreAtInstall;
    if (!Number.isFinite(atInstall)) {
      // The stamp failed and there is no prior baseline: report the current
      // score with no comparison rather than inventing one.
      return {
        available: true,
        current: scan.storeScore,
        atInstall: null,
        delta: null,
        scanned: scan.totalScanned,
      };
    }

    return {
      available: true,
      current: scan.storeScore,
      atInstall,
      delta: scan.storeScore - atInstall,
      // A baseline captured in THIS call is not history. Without this the card
      // said "Unchanged since you installed" five seconds after first stamping
      // the baseline — a comparison over time that never happened. Caught by
      // reading the screen, not by a test.
      baselineIsNew: stamped.count > 0,
      since: stamped.count > 0 ? null : (row?.storeScoreAtInstallAt?.toISOString() ?? null),
      scanned: scan.totalScanned,
    };
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "store score unavailable (non-fatal)");
    return { available: false };
  }
}

/**
 * Write the per-product before/after rows for the products a scan just scored.
 *
 * `scoreBefore` is written only when the row is created — Prisma's `upsert`
 * with the before fields in `create` and NOT in `update` is what enforces that,
 * so a product scored a hundred times keeps the score it had the first time.
 *
 * Never throws and is never awaited by a loader: a scoreboard is not worth
 * delaying a page for.
 */
export async function recordProductScores(shop, scored, now = new Date()) {
  if (!Array.isArray(scored) || scored.length === 0) return 0;
  let written = 0;
  for (const p of scored) {
    const combined = p?.scores?.combined;
    if (!p?.id || !Number.isFinite(combined)) continue;
    try {
      await prisma.productScore.upsert({
        where: { shop_productId: { shop, productId: p.id } },
        create: {
          shop,
          productId: p.id,
          productTitle: p.title ?? "",
          scoreBefore: combined,
          geoBefore: p.scores.geo,
          seoBefore: p.scores.seo,
          scoreAfter: combined,
          geoAfter: p.scores.geo,
          seoAfter: p.scores.seo,
          firstSeenAt: now,
        },
        // Deliberately does NOT touch scoreBefore/geoBefore/seoBefore.
        update: {
          productTitle: p.title ?? "",
          scoreAfter: combined,
          geoAfter: p.scores.geo,
          seoAfter: p.scores.seo,
        },
      });
      written += 1;
    } catch (err) {
      logger.warn({ shop, productId: p.id, err: err?.message }, "product score write failed (non-fatal)");
    }
  }
  return written;
}

/**
 * The per-product deltas for a page of products, keyed by product id.
 * Returns `{}` on any failure — a missing scoreboard must not break Products.
 */
export async function productScoresFor(shop, productIds) {
  try {
    if (!Array.isArray(productIds) || productIds.length === 0) return {};
    const rows = await prisma.productScore.findMany({
      where: { shop, productId: { in: productIds } },
      select: { productId: true, scoreBefore: true, scoreAfter: true },
    });
    const out = {};
    for (const r of rows) {
      if (!Number.isFinite(r.scoreBefore) || !Number.isFinite(r.scoreAfter)) continue;
      out[r.productId] = {
        before: r.scoreBefore,
        after: r.scoreAfter,
        delta: r.scoreAfter - r.scoreBefore,
      };
    }
    return out;
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "product scores unavailable (non-fatal)");
    return {};
  }
}
