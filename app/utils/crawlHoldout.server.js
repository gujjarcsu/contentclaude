/**
 * P3.1 (Phase 8) — the crawl-time holdout, with I/O. Reasoning in crawlHoldout.js.
 *
 * ── Daily, for every shop that turned Bing on ──────────────────────────────
 *
 *   START  the product pages whose content we published in the last 24 h and
 *          that are in no experiment yet become one experiment: seeded split,
 *          the submit arm sent through Bing's URL Submission API, both arms
 *          stored with their changedAt (the publish time).
 *   CHECK  every running experiment: GetUrlInfo for each URL not yet crawled
 *          (both arms, bounded per day); firstCrawledAt is set when Bing's
 *          LastCrawledDate is after the URL's changedAt. When every URL is
 *          crawled or day CENSOR_DAYS arrives, the experiment is reported —
 *          summary stored, and if both arms reached MIN_PER_ARM,
 *          Shop.provedResultAt is stamped (first-writer-wins). That stamp is
 *          what the review ask and the weekly report are gated on.
 *
 * Boundaries from the brief: only shops whose merchant turned it on; never a
 * locked shop; never while REMEDIATION_LOCKED_SHOPS is unset in production
 * (a lock that does not exist cannot protect anything). Every call bounded.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { getRedis } from "./cache.server.js";
import { sydneyParts } from "./scheduler.server.js";
import { isRemediationLocked, lockConfigured } from "./remediation.server.js";
import { storefrontOrigin, storefrontPasswordProtected } from "./crawlerAccess.server.js";
import { getFreshOfflineSession } from "./offlineToken.server.js";
import { offlineGraphql } from "./catalogueWatch.server.js";
import { submitUrls, urlInfo } from "./bing.server.js";
import { underSite } from "./bing.js";
import { newSeed, splitArms, summariseExperiment, MAX_URLS_PER_EXPERIMENT, MIN_PER_ARM, CENSOR_DAYS } from "./crawlHoldout.js";

export const HOLDOUT_HOUR_SYDNEY = 3; // after the 02:00 catalogue walk
export const CHECKS_PER_SHOP_PER_DAY = 120;
const HOLDOUT_KEY = "cc:crawl-holdout:day";
const DAY_MS = 24 * 3600 * 1000;

/** Product pages published in the window that are in no experiment yet. */
export async function changedUrlsFor(shop, origin, { now = new Date(), windowMs = DAY_MS } = {}) {
  const since = new Date(now.getTime() - windowMs);
  const published = await prisma.generatedContent.findMany({
    where: { shop, status: { in: ["published", "published_unverified"] }, updatedAt: { gte: since }, productId: { startsWith: "gid://shopify/Product/" } },
    select: { productId: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  if (published.length === 0) return [];
  const ids = [...new Set(published.map((p) => p.productId))];
  const [watch, already] = await Promise.all([
    prisma.productWatch.findMany({ where: { shop, productId: { in: ids }, handle: { not: "" } }, select: { productId: true, handle: true, statusShop: true } }),
    prisma.crawlExperimentUrl.findMany({ where: { shop, productId: { in: ids } }, select: { productId: true } }),
  ]);
  const seen = new Set(already.map((a) => a.productId));
  const changedAt = new Map();
  for (const p of published) if (!changedAt.has(p.productId)) changedAt.set(p.productId, p.updatedAt);
  return watch
    .filter((w) => !seen.has(w.productId) && String(w.statusShop ?? "ACTIVE").toUpperCase() === "ACTIVE")
    .map((w) => ({ productId: w.productId, url: `${origin}/products/${encodeURIComponent(w.handle)}`, changedAt: changedAt.get(w.productId) }))
    .slice(0, MAX_URLS_PER_EXPERIMENT);
}

/** One experiment from a batch of changed URLs. Submits the submit arm. */
export async function startExperiment(shop, siteUrl, changed, { now = new Date() } = {}) {
  const eligible = (changed ?? []).filter((c) => underSite(c.url, siteUrl));
  if (eligible.length < 2) return { ok: false, reason: "fewer than two changed pages", id: null };
  const seed = newSeed(now.getTime());
  const { submit, hold } = splitArms(eligible.map((c) => c.url), seed);
  const byUrl = new Map(eligible.map((c) => [c.url, c]));
  const exp = await prisma.crawlExperiment.create({
    data: {
      shop,
      seed,
      startedAt: now,
      urls: {
        create: [
          ...submit.map((url) => ({ shop, productId: byUrl.get(url).productId, url, arm: "submit", changedAt: byUrl.get(url).changedAt })),
          ...hold.map((url) => ({ shop, productId: byUrl.get(url).productId, url, arm: "hold", changedAt: byUrl.get(url).changedAt })),
        ],
      },
    },
    select: { id: true },
  });
  const r = await submitUrls(shop, siteUrl, submit);
  if (r.ok) {
    await prisma.crawlExperimentUrl.updateMany({ where: { experimentId: exp.id, arm: "submit" }, data: { submittedAt: now } });
    await prisma.crawlExperiment.update({ where: { id: exp.id }, data: { submittedAt: now } });
  }
  logger.info({ shop, event: "crawl_experiment_started", id: exp.id, submit: submit.length, hold: hold.length, submitted: r.ok }, "crawl experiment started");
  return { ok: r.ok, reason: r.ok ? null : r.reason, id: exp.id, submit: submit.length, hold: hold.length };
}

/** Check one running experiment; report it when done. */
export async function checkExperiment(exp, siteUrl, { now = new Date(), budget = { left: CHECKS_PER_SHOP_PER_DAY } } = {}) {
  const urls = await prisma.crawlExperimentUrl.findMany({ where: { experimentId: exp.id }, orderBy: { changedAt: "asc" } });
  for (const u of urls) {
    if (u.firstCrawledAt || budget.left <= 0) continue;
    budget.left -= 1;
    const r = await urlInfo(exp.shop, siteUrl, u.url);
    const data = { lastCheckedAt: now };
    if (r.ok && r.info) {
      data.bingStatus = r.info.httpStatus;
      if (r.info.lastCrawledAt && r.info.lastCrawledAt.getTime() > new Date(u.changedAt).getTime()) data.firstCrawledAt = r.info.lastCrawledAt;
    }
    await prisma.crawlExperimentUrl.update({ where: { id: u.id }, data });
  }
  const fresh = await prisma.crawlExperimentUrl.findMany({ where: { experimentId: exp.id }, select: { arm: true, changedAt: true, firstCrawledAt: true } });
  const s = summariseExperiment(fresh, { seed: exp.seed, now });
  if (s.complete) {
    await prisma.crawlExperiment.update({ where: { id: exp.id }, data: { status: "reported", reportedAt: now, summary: JSON.stringify(s) } });
    if (s.enough) {
      await prisma.shop.updateMany({ where: { shop: exp.shop, provedResultAt: null }, data: { provedResultAt: now } });
    }
    logger.info({ shop: exp.shop, event: "crawl_experiment_reported", id: exp.id, enough: s.enough, favourable: s.favourable, diffHours: s.diffHours }, "crawl experiment reported");
  } else {
    await prisma.crawlExperiment.update({ where: { id: exp.id }, data: { summary: JSON.stringify(s) } });
  }
  return s;
}

/** The daily pass across every shop that turned Bing on. Never throws. */
export async function runCrawlHoldoutForAllShops({ now = new Date() } = {}) {
  const out = { shops: 0, skipped: 0, started: 0, checked: 0, reported: 0, lockUnset: false };
  if (!lockConfigured()) {
    // The brief: never while REMEDIATION_LOCKED_SHOPS is unset. A lock that
    // does not exist protects nothing, so nothing is submitted anywhere.
    out.lockUnset = true;
    logger.warn({ event: "crawl_holdout_skipped", reason: "REMEDIATION_LOCKED_SHOPS unset" }, "crawl holdout skipped: lock unset");
    return out;
  }
  const shops = await prisma.shop.findMany({
    where: { uninstalledAt: null, redactedAt: null, bingEnabledAt: { not: null }, bingSiteUrl: { not: null } },
    select: { shop: true, bingSiteUrl: true },
  });
  out.shops = shops.length;
  for (const { shop, bingSiteUrl } of shops) {
    try {
      if (isRemediationLocked(shop)) {
        out.skipped++;
        continue;
      }
      const session = await getFreshOfflineSession(shop).catch(() => null);
      if (!session?.accessToken) {
        out.skipped++;
        continue;
      }
      const graphql = offlineGraphql(session);
      const [origin, locked] = await Promise.all([storefrontOrigin(graphql, shop), storefrontPasswordProtected(graphql, shop)]);
      if (!origin || locked === true) {
        out.skipped++;
        continue;
      }
      const budget = { left: CHECKS_PER_SHOP_PER_DAY };
      const running = await prisma.crawlExperiment.findMany({ where: { shop, status: "running" }, select: { id: true, shop: true, seed: true } });
      for (const exp of running) {
        const s = await checkExperiment(exp, bingSiteUrl, { now, budget });
        out.checked++;
        if (s.complete) out.reported++;
      }
      const changed = await changedUrlsFor(shop, origin, { now });
      if (changed.length >= 2) {
        const r = await startExperiment(shop, bingSiteUrl, changed, { now });
        if (r.ok) out.started++;
      }
    } catch (err) {
      logger.warn({ shop, err: err?.message, event: "crawl_holdout_failed" }, "crawl holdout failed for a shop (non-fatal)");
    }
  }
  logger.info({ event: "crawl_holdout_daily", ...out }, "crawl holdout: daily run");
  return out;
}

/** Worker minute-tick hook — same Redis day-claim as the digest and the watch. */
export async function maybeRunCrawlHoldout({ now = new Date(), run = runCrawlHoldoutForAllShops } = {}) {
  const { day, hour } = sydneyParts(now);
  if (hour !== HOLDOUT_HOUR_SYDNEY) return { ran: false, reason: "not the hour" };
  try {
    const redis = await getRedis();
    if (redis) {
      const claimed = await redis.set(HOLDOUT_KEY, day, "EX", 36 * 3600, "NX");
      if (!claimed) {
        const current = await redis.get(HOLDOUT_KEY);
        if (current === day) return { ran: false, reason: "already ran today" };
        await redis.set(HOLDOUT_KEY, day, "EX", 36 * 3600);
      }
    }
  } catch (err) {
    logger.warn({ err: err?.message }, "crawl holdout: could not claim the day, running anyway");
  }
  const result = await run({ now });
  return { ran: true, day, ...result };
}

/** What the Proof screen and Home read. */
export async function experimentsFor(shop, { now = new Date(), limit = 12 } = {}) {
  const rows = await prisma.crawlExperiment.findMany({
    where: { shop },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: { id: true, seed: true, status: true, startedAt: true, submittedAt: true, reportedAt: true, summary: true, urls: { select: { arm: true, url: true, changedAt: true, submittedAt: true, firstCrawledAt: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    seed: r.seed,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    submittedAt: r.submittedAt?.toISOString() ?? null,
    reportedAt: r.reportedAt?.toISOString() ?? null,
    summary: summariseExperiment(r.urls, { seed: r.seed, now }),
    urls: r.urls.map((u) => ({ ...u, changedAt: u.changedAt.toISOString(), submittedAt: u.submittedAt?.toISOString() ?? null, firstCrawledAt: u.firstCrawledAt?.toISOString() ?? null })),
  }));
}

export { MIN_PER_ARM, CENSOR_DAYS };
