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
 * Same walk discipline as the catalogue join: 50 pages of 100 (5,000 products
 * — the Growth cap) and a time budget — 8 s inline from Home, where a page is
 * waiting, 30 s from the daily job, where nothing is — through `shopifyQuery`'s
 * backoff. Past the bound the run is reported PARTIAL and the summary says so;
 * it is never presented as the whole catalogue. Upserts go in chunks of 50 so
 * a 5,000-row day does not open 5,000 connections.
 *
 * ── One walk, three findings ───────────────────────────────────────────────
 *
 * P2.3 diffs each product against yesterday. P2.2 grades the same node against
 * what each AI surface asks for. P2.1 checks, once per walk, whether the six
 * crawlers can reach the storefront at all. Three methods, one read of the
 * catalogue, one page for the merchant.
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
import { checkCrawlerAccess, latestCrawlerAccess, storefrontPasswordProtected } from "./crawlerAccess.server.js";
import { gscState } from "./gscAiControl.js";
import { runIndexability, indexabilityRows } from "./indexability.server.js";
import { indexabilitySummary } from "./indexability.js";
import { WATCH_DESC_CAP, VARIANT_BARCODE_SAMPLE, snapshotFromNode, diffProduct, summarise, gradeProduct } from "./catalogueWatch.js";
import { getOrCreatePlan } from "./plans.server.js";
import { pageSampleFor } from "./indexability.js";

export const WATCH_HOUR_SYDNEY = 2; // before the 08:00 digest, after most edits
// 100, not 250: grading widened the query (options, first variant) and Shopify
// caps one query at 1,000 cost points. ~8 points a product × 100 ≈ 800.
export const WATCH_PAGE = 100;
export const WATCH_MAX_PAGES = 50; // 5,000 products — the Growth cap
export const WATCH_BUDGET_MS = 8_000; // inline from Home: a page is waiting
export const WATCH_DAILY_BUDGET_MS = 30_000; // the daily job: nothing is
const WATCH_KEY = "cc:catalogue-watch:day";
const UPSERT_CHUNK = 50;
const API_VERSION = "2026-04";

const WATCH_QUERY = `query catalogueWatch($cursor: String, $q: String) {
  products(first: ${WATCH_PAGE}, after: $cursor, sortKey: UPDATED_AT, reverse: true, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle productType vendor status createdAt onlineStoreUrl hasOnlyDefaultVariant
      description(truncateAt: ${WATCH_DESC_CAP})
      featuredMedia { preview { image { url altText } } }
      options(first: 3) { name }
      variants(first: 1) { nodes { barcode } }
    }
  }
}`;

// F3 (Phase 9) — validated against the Admin schema 2026-09-14. Ten products
// × (node + connection + 50 variants) ≈ 530 points, under the 1,000 cap.
const VARIANTS_QUERY = `query variantBarcodes($ids: [ID!]!) {
  nodes(ids: $ids) { ... on Product { id variants(first: ${VARIANT_BARCODE_SAMPLE}) { nodes { barcode } } } }
}`;
const VARIANTS_CHUNK = 10;

/**
 * F3 — every variant's barcode for the products that need the second look:
 * multi-variant, first variant blank, not a draft, not exempt. Returns a Map
 * of productId → string[]; a product missing from the map was not read and
 * grades on its first variant as before. Never throws.
 */
export async function fetchVariantBarcodes(graphql, shop, ids) {
  const out = new Map();
  for (let i = 0; i < (ids ?? []).length; i += VARIANTS_CHUNK) {
    const chunk = ids.slice(i, i + VARIANTS_CHUNK);
    try {
      const r = await shopifyQuery(graphql, VARIANTS_QUERY, { ids: chunk }, { shop, label: "variant barcodes" });
      if (!r.ok) continue;
      for (const n of r.data?.nodes ?? []) {
        if (n?.id) out.set(n.id, (n.variants?.nodes ?? []).map((v) => String(v?.barcode ?? "")));
      }
    } catch (err) {
      logger.warn({ shop, err: err?.message, event: "variant_barcodes_failed" }, "variant barcodes read failed (non-fatal)");
    }
  }
  return out;
}

/** F3 — which nodes need the second look. Pure over the page. */
export function needsBarcodeLook(node, prev) {
  if (!node || node.hasOnlyDefaultVariant !== false) return false;
  if (String(node.status ?? "").toUpperCase() === "DRAFT") return false;
  if (prev?.gtinExempt === true) return false;
  return String(node.variants?.nodes?.[0]?.barcode ?? "").trim().length === 0;
}

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
 * @param {{now?: Date, budgetMs?: number, crawler?: boolean|"background"}} [opts]
 *   `crawler: "background"` runs the crawler check after this returns — Home
 *   must not wait on six storefront fetches; the daily job awaits them.
 * @returns {Promise<{ok: boolean, partial: boolean, scanned: number, updated: number,
 *   needAttention: number, sinceYesterday: number, blocking: number,
 *   crawlerBlocked: number|null, reason: string|null}>}
 */
export async function runCatalogueWatch(graphql, shop, { now = new Date(), budgetMs = WATCH_BUDGET_MS, crawler = true } = {}) {
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
    const [agg, passwordProtected] = await Promise.all([
      prisma.productWatch.aggregate({ where: { shop }, _min: { firstSeenAt: true } }),
      // One shop-level fact the grading and the crawler check both need: a
      // locked storefront nulls every onlineStoreUrl and answers /password.
      storefrontPasswordProtected(graphql, shop),
    ]);
    const watchStartedAt = agg?._min?.firstSeenAt ?? now;
    const storefrontPublic = passwordProtected !== true;

    for (;;) {
      if (pages >= WATCH_MAX_PAGES || (pages > 0 && Date.now() - t0 >= budgetMs)) {
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
        // F3 — the second, cheap look at every variant of the products that need it.
        const variantBarcodes = await fetchVariantBarcodes(
          graphql,
          shop,
          nodes.filter((n) => needsBarcodeLook(n, prevById.get(n.id) ?? null)).map((n) => n.id),
        );

        const writes = nodes.map((node) => {
          const next = snapshotFromNode(node);
          const prev = prevById.get(next.productId) ?? null;
          const attention = diffProduct(prev, next, { hasContent: hasContent.has(next.productId), watchStartedAt, now });
          const g = gradeProduct(node, {
            storefrontPublic,
            gtinExempt: prev?.gtinExempt === true,
            variantBarcodes: variantBarcodes.get(node.id) ?? null,
          });
          const data = {
            title: next.title,
            handle: next.handle,
            descLen: next.descLen,
            hasType: next.hasType,
            hasAlt: next.hasAlt,
            createdAtShop: next.createdAtShop,
            statusShop: String(node?.status ?? "") || null,
            lastSeenAt: now,
            attention: JSON.stringify(attention),
            grade: JSON.stringify(g.findings),
            blocking: g.blocking,
            degrading: g.degrading,
            cosmetic: g.cosmetic,
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

    // P2.1 — crawler access is a component of the same walk: one robots.txt
    // read and six GETs, diffed against yesterday's row. Never throws.
    let crawlerResult = null;
    let indexability = null;
    if (crawler === "background") {
      void checkCrawlerAccess(graphql, shop, { now, passwordProtected });
    } else if (crawler) {
      crawlerResult = await checkCrawlerAccess(graphql, shop, { now, passwordProtected });
      // P2.4 — the daily path only: a sitemap read and a bounded page sample.
      // F6 (Phase 9) — the sample is the plan's, and attention comes first.
      const plan = await getOrCreatePlan(shop).catch(() => null);
      indexability = await runIndexability(graphql, shop, {
        now,
        origin: crawlerResult?.origin ?? null,
        passwordProtected: !storefrontPublic,
        sample: pageSampleFor(plan?.planName),
      });
    }

    const [rows, blocking] = await Promise.all([
      prisma.productWatch.findMany({ where: { shop, NOT: { attention: "{}" } }, select: { attention: true } }),
      prisma.productWatch.count({ where: { shop, blocking: { gt: 0 } } }),
    ]);
    const s = summarise(rows, now, { firstWalkAt: watchStartedAt });
    const crawlerBlocked = crawlerResult?.ok ? crawlerResult.blocked.length : null;
    logger.info(
      { shop, event: "catalogue_watch_ran", scanned, updated, partial, ...s, blocking, crawlerBlocked, indexability, ms: Date.now() - t0 },
      "catalogue watch ran",
    );
    return { ok: true, partial, scanned, updated, ...s, blocking, crawlerBlocked, indexability, reason: null };
  } catch (err) {
    logger.warn({ shop, err: err?.message, event: "catalogue_watch_failed" }, "catalogue watch failed (non-fatal)");
    return {
      ok: false,
      partial,
      scanned,
      updated,
      needAttention: 0,
      sinceYesterday: 0,
      byKind: {},
      blocking: 0,
      crawlerBlocked: null,
      indexability: null,
      reason: err?.message ?? "failed",
    };
  }
}

/**
 * What Home shows. Reads the summary; walks inline once if this shop has never
 * been walked, so the first load has a number.
 *
 * @returns {Promise<{available: boolean, everWalked: boolean, partial: boolean,
 *   needAttention: number, sinceYesterday: number, byKind: object,
 *   blocking: number, degrading: number, graded: number,
 *   crawler: {available: boolean, blocked: string[], newlyBlocked: string[], checkedAt: string|null},
 *   lastRunAt: string|null}>}
 */
export async function attentionFor(admin, shop, { now = new Date() } = {}) {
  const noCrawler = { available: false, blocked: [], newlyBlocked: [], checkedAt: null };
  try {
    const last = await prisma.productWatch.aggregate({ where: { shop }, _max: { lastSeenAt: true } });
    let everWalked = !!last?._max?.lastSeenAt;
    let partial = false;
    if (!everWalked && admin?.graphql) {
      const r = await runCatalogueWatch(admin.graphql, shop, { now, crawler: "background" });
      everWalked = r.ok;
      partial = r.partial;
    }
    const [rows, blocking, degrading, graded, crawler, lastRun, growth, idxRows, planRow] = await Promise.all([
      prisma.productWatch.findMany({ where: { shop, NOT: { attention: "{}" } }, select: { attention: true } }),
      prisma.productWatch.count({ where: { shop, blocking: { gt: 0 } } }),
      prisma.productWatch.count({ where: { shop, degrading: { gt: 0 } } }),
      prisma.productWatch.count({ where: { shop, grade: { not: null } } }),
      latestCrawlerAccess(shop, { now }),
      prisma.productWatch.aggregate({ where: { shop }, _max: { lastSeenAt: true }, _min: { firstSeenAt: true } }),
      // P2.5 — the merchant's own answer to the one check no app can make.
      prisma.growthState.findUnique({ where: { shop }, select: { gscAiControl: true, gscAiControlAt: true } }),
      // P2.4 — what the sitemap pass and the page sample found so far.
      indexabilityRows(shop),
      // F6 — the plan's nightly sample, so the screen says what coverage actually is.
      prisma.plan.findUnique({ where: { shop }, select: { planName: true } }).catch(() => null),
    ]);
    const s = summarise(rows, now, { firstWalkAt: lastRun?._min?.firstSeenAt ?? null });
    return {
      available: everWalked,
      everWalked,
      partial,
      ...s,
      blocking,
      degrading,
      graded,
      crawler,
      indexability: { ...indexabilitySummary(idxRows), nightly: pageSampleFor(planRow?.planName) },
      gsc: gscState({ answer: growth?.gscAiControl ?? null, answeredAt: growth?.gscAiControlAt ?? null }, now),
      lastRunAt: lastRun?._max?.lastSeenAt?.toISOString() ?? null,
    };
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "attention summary unavailable (non-fatal)");
    return {
      available: false,
      everWalked: false,
      partial: false,
      needAttention: 0,
      sinceYesterday: 0,
      byKind: {},
      blocking: 0,
      degrading: 0,
      graded: 0,
      crawler: noCrawler,
      gsc: gscState({}, now),
      indexability: indexabilitySummary([]),
      lastRunAt: null,
    };
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
 * P2.7 — the three specific things holding THIS store back, for the first
 * run. From the stored findings of the first walk; never throws, because the
 * first run must render whether or not the walk finished.
 */
export async function blockersFor(shop, { now = new Date() } = {}) {
  try {
    const { tallyFindings, blockerLines } = await import("./firstRun.js");
    const { parseFindings } = await import("./catalogueWatch.js");
    const [rows, crawler] = await Promise.all([
      prisma.productWatch.findMany({ where: { shop, grade: { not: null } }, select: { grade: true, statusShop: true } }),
      latestCrawlerAccess(shop, { now }),
    ]);
    return blockerLines(tallyFindings(rows, parseFindings), { passwordProtected: crawler?.passwordProtected === true });
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "first-run blockers unavailable (non-fatal)");
    return [];
  }
}

/** P2.4 — every product whose indexability columns produce a finding. */
export async function indexabilityList(shop, { limit = 200 } = {}) {
  const { indexabilityFindings } = await import("./indexability.js");
  const rows = await indexabilityRows(shop);
  return rows
    .map((r) => ({ ...r, findings: indexabilityFindings(r) }))
    .filter((r) => r.findings.length > 0)
    .sort((a, b) => b.findings.filter((f) => f.grade === "blocking").length - a.findings.filter((f) => f.grade === "blocking").length)
    .slice(0, limit);
}

/**
 * Every graded product with a blocking or degrading finding, worst first.
 * Cosmetic-only products are not listed: nothing a surface asks for is missing.
 */
export async function blockingList(shop, { limit = 200 } = {}) {
  return prisma.productWatch.findMany({
    where: { shop, OR: [{ blocking: { gt: 0 } }, { degrading: { gt: 0 } }] },
    select: { productId: true, title: true, handle: true, grade: true, blocking: true, degrading: true, cosmetic: true },
    orderBy: [{ blocking: "desc" }, { degrading: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });
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
  const out = {
    shops: shops.length,
    walked: 0,
    skipped: 0,
    partial: 0,
    failed: 0,
    needAttention: 0,
    blocking: 0,
    crawlerChecked: 0,
    crawlerBlockedShops: 0,
  };
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
    const r = await runCatalogueWatch(offlineGraphql(session), shop, { now, budgetMs: WATCH_DAILY_BUDGET_MS });
    if (!r.ok) out.failed++;
    else {
      out.walked++;
      if (r.partial) out.partial++;
      out.needAttention += r.needAttention;
      out.blocking += r.blocking;
      if (r.crawlerBlocked !== null) {
        out.crawlerChecked++;
        if (r.crawlerBlocked > 0) out.crawlerBlockedShops++;
      }
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
  // Phase 11 Part A — after the walk, ask Shopify about every row the flag
  // disagrees with. Dynamic import: installState imports installTracking,
  // which this module must not pull in at load.
  let reconcile = null;
  try {
    const { reconcileInstallState } = await import("./installState.server.js");
    reconcile = await reconcileInstallState({ now });
  } catch (err) {
    logger.error({ err: err?.message }, "install reconcile threw (non-fatal)");
  }
  return { ran: true, day, ...result, reconcile };
}
