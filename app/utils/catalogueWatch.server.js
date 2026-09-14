/**
 * P2.3 — catalogue decay, with I/O. The reasoning is in catalogueWatch.js.
 *
 * ── Two ways in ────────────────────────────────────────────────────────────
 *
 *   DAILY   `maybeRunCatalogueWatch()` from the worker's minute tick: at the
 *           Sydney hour, claim the day in Redis (NX, exactly like the digest and
 *           the backup), then walk every installed shop through its stored
 *           offline token. This is the subscription firing.
 *   INLINE  `attentionFor(admin, shop)` from Home: read the summary; if this
 *           shop has never been walked, walk it now, bounded, so a fresh install
 *           sees a real number on its first load rather than "—" for a day.
 *
 * ── Bounds ─────────────────────────────────────────────────────────────────
 *
 * Same walk discipline as the catalogue join: 20 pages (5,000 products — the
 * Growth cap) and a time budget, through `shopifyQuery`'s backoff. Past the
 * bound the run is reported PARTIAL and the summary says so; it is never
 * presented as the whole catalogue. Upserts go in chunks of 50 so a 5,000-row
 * day does not open 5,000 connections.
 *
 * ── What "installed" means here ────────────────────────────────────────────
 *
 * A Shop row with no uninstalledAt and no redactedAt, whose offline token still
 * refreshes. A token that will not refresh is skipped and COUNTED as skipped —
 * an unreachable shop is unknown, not "no decay".
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { getRedis } from "./cache.server.js";
import { shopifyQuery } from "./shopifyQuery.server.js";
import { getFreshOfflineSession } from "./offlineToken.server.js";
import { scopeForShop, scopeQueryFor } from "./candidates.server.js";
import { sydneyParts } from "./scheduler.server.js";
import { WATCH_DESC_CAP, snapshotFromNode, diffProduct, summarise } from "./catalogueWatch.js";

export const WATCH_HOUR_SYDNEY = 2; // before the 08:00 digest, after most edits
export const WATCH_PAGE = 250;
export const WATCH_MAX_PAGES = 20;
export const WATCH_BUDGET_MS = 8_000;
const WATCH_KEY = "cc:catalogue-watch:day";
const UPSERT_CHUNK = 50;
const API_VERSION = "2026-04";

const WATCH_QUERY = `query catalogueWatch($cursor: String, $q: String) {
  products(first: ${WATCH_PAGE}, after: $cursor, sortKey: UPDATED_AT, reverse: true, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle productType createdAt
      description(truncateAt: ${WATCH_DESC_CAP})
      featuredImage { altText }
    }
  }
}`;

/**
 * An `admin.graphql`-shaped function backed by a stored offline session, so a
 * scheduled job with no request can use the same `shopifyQuery` backoff path
 * the routes use. Returns the raw Response, exactly as admin.graphql does.
 */
export function offlineGraphql(session) {
  return async (query, { variables } = {}) =>
    fetch(`https://${session.shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
}

/**
 * Walk one shop and bring its ProductWatch rows up to date.
 *
 * @param {(q: string, o: object) => Promise<Response>} graphql
 * @param {string} shop
 * @returns {Promise<{ok: boolean, partial: boolean, scanned: number, updated: number,
 *   needAttention: number, sinceYesterday: number, reason: string|null}>}
 */
export async function runCatalogueWatch(graphql, shop, { now = new Date() } = {}) {
  const t0 = Date.now();
  let cursor = null;
  let pages = 0;
  let scanned = 0;
  let updated = 0;
  let partial = false;

  try {
    const scope = await scopeForShop(shop);
    const q = scopeQueryFor(scope) || null;

    // "After the watch began" — first sighting of the whole store must not flag
    // every product as new. With no rows yet this is `now`, so nothing is.
    const agg = await prisma.productWatch.aggregate({ where: { shop }, _min: { firstSeenAt: true } });
    const watchStartedAt = agg?._min?.firstSeenAt ?? now;

    for (;;) {
      if (pages >= WATCH_MAX_PAGES || (pages > 0 && Date.now() - t0 >= WATCH_BUDGET_MS)) {
        partial = true;
        break;
      }
      pages += 1;
      const r = await shopifyQuery(graphql, WATCH_QUERY, { cursor, q }, { shop, label: "catalogue watch" });
      if (!r.ok) throw new Error(r.error ?? "watch query failed");
      const page = r.data?.products;
      if (!page) throw new Error("no products payload");

      const nodes = (page.nodes ?? []).filter((n) => String(n?.id ?? "").startsWith("gid://shopify/Product/"));
      const ids = nodes.map((n) => n.id);
      if (ids.length) {
        const [prevRows, contentRows] = await Promise.all([
          prisma.productWatch.findMany({ where: { shop, productId: { in: ids } } }),
          prisma.generatedContent.findMany({
            where: { shop, productId: { in: ids } },
            distinct: ["productId"],
            select: { productId: true },
          }),
        ]);
        const prevById = new Map(prevRows.map((p) => [p.productId, p]));
        const hasContent = new Set(contentRows.map((c) => c.productId));

        const writes = nodes.map((node) => {
          const next = snapshotFromNode(node);
          const prev = prevById.get(next.productId) ?? null;
          const attention = diffProduct(prev, next, { hasContent: hasContent.has(next.productId), watchStartedAt, now });
          const data = {
            title: next.title,
            handle: next.handle,
            descLen: next.descLen,
            hasType: next.hasType,
            hasAlt: next.hasAlt,
            createdAtShop: next.createdAtShop,
            lastSeenAt: now,
            attention: JSON.stringify(attention),
          };
          return prisma.productWatch.upsert({
            where: { shop_productId: { shop, productId: next.productId } },
            create: { shop, productId: next.productId, firstSeenAt: now, ...data },
            update: data,
          });
        });
        for (let i = 0; i < writes.length; i += UPSERT_CHUNK) {
          await Promise.all(writes.slice(i, i + UPSERT_CHUNK));
        }
        scanned += nodes.length;
        updated += writes.length;
      }

      if (!page.pageInfo?.hasNextPage) break;
      cursor = page.pageInfo.endCursor;
    }

    const rows = await prisma.productWatch.findMany({
      where: { shop, NOT: { attention: "{}" } },
      select: { attention: true },
    });
    const s = summarise(rows, now);
    logger.info(
      { shop, event: "catalogue_watch_ran", scanned, updated, partial, ...s, ms: Date.now() - t0 },
      "catalogue watch ran",
    );
    return { ok: true, partial, scanned, updated, ...s, reason: null };
  } catch (err) {
    logger.warn({ shop, err: err?.message, event: "catalogue_watch_failed" }, "catalogue watch failed (non-fatal)");
    return { ok: false, partial, scanned, updated, needAttention: 0, sinceYesterday: 0, byKind: {}, reason: err?.message ?? "failed" };
  }
}

/**
 * What Home shows. Reads the summary; walks inline once if this shop has never
 * been walked, so the first load has a number.
 *
 * @returns {Promise<{available: boolean, everWalked: boolean, partial: boolean,
 *   needAttention: number, sinceYesterday: number, byKind: object, lastRunAt: string|null}>}
 */
export async function attentionFor(admin, shop, { now = new Date() } = {}) {
  try {
    const last = await prisma.productWatch.aggregate({ where: { shop }, _max: { lastSeenAt: true } });
    let everWalked = !!last?._max?.lastSeenAt;
    let partial = false;
    if (!everWalked && admin?.graphql) {
      const r = await runCatalogueWatch(admin.graphql, shop, { now });
      everWalked = r.ok;
      partial = r.partial;
    }
    const rows = await prisma.productWatch.findMany({
      where: { shop, NOT: { attention: "{}" } },
      select: { attention: true },
    });
    const s = summarise(rows, now);
    const lastRun = await prisma.productWatch.aggregate({ where: { shop }, _max: { lastSeenAt: true } });
    return {
      available: everWalked,
      everWalked,
      partial,
      ...s,
      lastRunAt: lastRun?._max?.lastSeenAt?.toISOString() ?? null,
    };
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "attention summary unavailable (non-fatal)");
    return { available: false, everWalked: false, partial: false, needAttention: 0, sinceYesterday: 0, byKind: {}, lastRunAt: null };
  }
}

/** Every product that needs the merchant, for the list page. Newest first. */
export async function attentionList(shop, { limit = 200 } = {}) {
  const rows = await prisma.productWatch.findMany({
    where: { shop, NOT: { attention: "{}" } },
    select: { productId: true, title: true, handle: true, attention: true, lastSeenAt: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows;
}

/**
 * The daily run across every installed shop. Never throws; counts everything
 * it skipped, because an unreachable shop is unknown, not decay-free.
 */
export async function runCatalogueWatchForAllShops({ now = new Date() } = {}) {
  const shops = await prisma.shop.findMany({
    where: { uninstalledAt: null, redactedAt: null },
    select: { shop: true },
  });
  const out = { shops: shops.length, walked: 0, skipped: 0, partial: 0, failed: 0, needAttention: 0 };
  for (const { shop } of shops) {
    let session = null;
    try {
      session = await getFreshOfflineSession(shop);
    } catch {
      session = null;
    }
    if (!session?.accessToken) {
      out.skipped++;
      continue;
    }
    const r = await runCatalogueWatch(offlineGraphql(session), shop, { now });
    if (!r.ok) out.failed++;
    else {
      out.walked++;
      if (r.partial) out.partial++;
      out.needAttention += r.needAttention;
    }
  }
  logger.info({ event: "catalogue_watch_daily", ...out }, "catalogue watch: daily run");
  return out;
}

/**
 * Worker minute-tick hook. Same Redis NX claim as the digest: the first caller
 * in the hour wins and every other machine is a no-op.
 */
export async function maybeRunCatalogueWatch({ now = new Date(), run = runCatalogueWatchForAllShops } = {}) {
  const { day, hour } = sydneyParts(now);
  if (hour !== WATCH_HOUR_SYDNEY) return { ran: false, reason: "not the hour" };
  try {
    const redis = await getRedis();
    if (redis) {
      const claimed = await redis.set(WATCH_KEY, day, "EX", 36 * 3600, "NX");
      if (!claimed) {
        const current = await redis.get(WATCH_KEY);
        if (current === day) return { ran: false, reason: "already ran today" };
        await redis.set(WATCH_KEY, day, "EX", 36 * 3600);
      }
    }
  } catch (err) {
    logger.warn({ err: err?.message }, "catalogue watch: could not claim the day, running anyway");
  }
  const result = await run({ now });
  return { ran: true, day, ...result };
}
