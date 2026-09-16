#!/usr/bin/env node
/**
 * Phase 14 item 4 — WHO ARE THE TWO SHOPS NOBODY RECOGNISES?
 *
 * `zephyrin-wynter-a01g3uy4.myshopify.com` and `peter-shops-2.myshopify.com`
 * installed this app on 11 and 12 September. The owner does not recognise
 * either. Both storefronts are password-protected, so Cowork could learn
 * nothing from outside. They are therefore Shopify's reviewers, or merchants
 * who found the listing and installed — and if either is a merchant, the
 * scoreboard's "real merchants: 0" is wrong and B0.2 has its first data point.
 *
 * STRICTLY READ-ONLY.
 *   - Every Prisma call is a count / findUnique / findFirst. There is no
 *     create, update, upsert or delete in this file, and a test asserts that.
 *   - It does NOT probe Shopify. `install-state-diag.mjs` does that with the
 *     stored token, and a token probe can cause our own Session row to be
 *     refreshed — a write. Whether a token is PRESENT is read from the Session
 *     row instead, which answers the brief's question without touching anyone.
 *   - It prints no token, no email, no name, no product title and no content.
 *     Presence, counts, lengths and timestamps only.
 *
 * It classifies NOTHING. `Shop.kind` is read and reported as stored; deciding
 * it on the evidence below would be the exact failure the field exists to
 * prevent, which is why CW left both unclassified rather than flattering the
 * digest.
 *
 *   node /app/scripts/unidentified-shops-diag.mjs
 *   DIAG_SHOPS="a.myshopify.com,b.myshopify.com" node /app/scripts/unidentified-shops-diag.mjs
 */
import prisma from "../app/db.server.js";

const DEFAULT_SHOPS = [
  "zephyrin-wynter-a01g3uy4.myshopify.com",
  "peter-shops-2.myshopify.com",
];

const shops = (process.env.DIAG_SHOPS || DEFAULT_SHOPS.join(","))
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const iso = (d) => (d ? new Date(d).toISOString() : null);
const days = (a, b) => (a && b ? Math.round(((new Date(b) - new Date(a)) / 86400000) * 10) / 10 : null);

/**
 * The App Store review window. The listing went live 2026-09-08; Shopify's
 * reviewers install within days of a submission, and their installs cluster
 * immediately after one. Stated as a fact to compare against, not as a verdict.
 */
const LISTING_LIVE = "2026-09-08T00:00:00.000Z";

/**
 * WHICH NULLS MEAN SOMETHING, AND WHICH ONLY MEAN THE COLUMN DID NOT EXIST.
 *
 * `firstScreenAt`, `firstApproveAt` and `returnedAt` were added by migration
 * `20260915090000_funnel` on 15 September. Both of these shops installed on the
 * 10th and 11th. Reading their nulls as "never opened the app" would be a
 * false finding about a possible real merchant, so the output says so instead
 * of leaving the reader to assume.
 *
 * `productCountAtFirstLoad`, `quickStartStartedAt` and `firstDraftSeenAt`
 * predate both installs (0_init and 20260910120000_retire_welcome_setup), so
 * for these two shops those ARE evidence.
 */
const FUNNEL_MIGRATION_AT = "2026-09-15T09:00:00.000Z";
const PRE_FUNNEL = (installedAt) => new Date(installedAt) < new Date(FUNNEL_MIGRATION_AT);

async function readShop(shop) {
  const row = await prisma.shop.findUnique({ where: { shop } });
  if (!row) return { shop, present: false };

  const [plan, sessions, offline, online, contentTotal, published, drafts, scores, creditRows, credits, lastContent, firstContent] =
    await Promise.all([
      prisma.plan.findUnique({ where: { shop } }),
      prisma.session.count({ where: { shop } }),
      prisma.session.findFirst({ where: { shop, isOnline: false }, select: { id: true, expires: true, scope: true, accessToken: true } }),
      prisma.session.count({ where: { shop, isOnline: true } }),
      prisma.generatedContent.count({ where: { shop } }),
      prisma.generatedContent.count({ where: { shop, status: { in: ["published", "published_unverified"] } } }),
      prisma.generatedContent.count({ where: { shop, status: "draft" } }),
      prisma.productScore.count({ where: { shop } }),
      prisma.usageRecord.count({ where: { shop } }),
      prisma.usageRecord.aggregate({ where: { shop }, _sum: { credits: true } }),
      prisma.generatedContent.findFirst({ where: { shop }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true, status: true } }),
      prisma.generatedContent.findFirst({ where: { shop }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ]);

  // "Last admin activity" — the latest stamp the app writes when a human is in
  // front of it. No page-view log exists, so these are the honest proxies.
  const activity = [
    ["installedAt", row.installedAt],
    ["reinstalledAt", row.reinstalledAt],
    ["firstScreenAt", row.firstScreenAt],
    ["quickStartStartedAt", row.quickStartStartedAt],
    ["firstDraftSeenAt", row.firstDraftSeenAt],
    ["firstApproveAt", row.firstApproveAt],
    ["firstPublishAt", row.firstPublishAt],
    ["returnedAt", row.returnedAt],
    ["lastContentUpdate", lastContent?.updatedAt ?? null],
  ].filter(([, v]) => v);
  activity.sort((a, b) => new Date(b[1]) - new Date(a[1]));

  return {
    shop,
    present: true,
    kindAsStored: row.kind,

    install: {
      installedAt: iso(row.installedAt),
      installCount: row.installCount,
      reinstalledAt: iso(row.reinstalledAt),
      uninstalledAt: iso(row.uninstalledAt),
      redactedAt: iso(row.redactedAt),
      stillInstalledPerOurRow: !row.uninstalledAt,
      // how the install was attributed — a reviewer arrives differently from a
      // merchant who searched for us
      installSource: row.installSource,
      surfaceType: row.surfaceType,
      surfaceDetail: row.surfaceDetail,
      installRef: row.installRef,
      utmSource: row.utmSource,
      installLandingPath: row.installLandingPath,
      installRefererHost: row.installReferer ? safeHost(row.installReferer) : null,
      locale: row.locale,
      localeSource: row.localeSource,
      uiLocale: row.uiLocale,
    },

    reviewWindow: {
      listingLive: LISTING_LIVE,
      daysAfterListingLive: days(LISTING_LIVE, row.installedAt),
    },

    token: {
      // PRESENCE ONLY — never the value, never a prefix, never a length.
      offlineSessionPresent: !!offline,
      offlineTokenPresent: !!offline?.accessToken,
      offlineTokenExpires: iso(offline?.expires),
      offlineScope: offline?.scope ?? null,
      onlineSessions: online,
      sessionsTotal: sessions,
    },

    plan: plan
      ? {
          planName: plan.planName,
          status: plan.status,
          monthlyCredits: plan.monthlyCredits,
          hasShopifyCharge: !!plan.shopifyChargeId,
          trialEndsAt: iso(plan.trialEndsAt),
          createdAt: iso(plan.createdAt),
        }
      : null,
    trialUsedAt: iso(row.trialUsedAt),

    catalogue: {
      // The app has no product table; this is the catalogue size it saw on the
      // first dashboard load, plus how many products it has ever scored.
      productCountAtFirstLoad: row.productCountAtFirstLoad,
      productsScored: scores,
    },

    content: {
      rowsTotal: contentTotal,
      published,
      drafts,
      firstCreatedAt: iso(firstContent?.createdAt),
      lastUpdatedAt: iso(lastContent?.updatedAt),
      lastStatus: lastContent?.status ?? null,
    },

    credits: {
      usageRows: creditRows,
      creditsSpent: credits?._sum?.credits ?? 0,
      trialCreditsUsed: row.trialCreditsUsed,
    },

    funnel: {
      // Read this first, or the three nulls below will be mistaken for evidence.
      caveat: PRE_FUNNEL(row.installedAt)
        ? `installed before the funnel migration (${FUNNEL_MIGRATION_AT}): firstScreenAt / firstApproveAt / returnedAt are null because the columns did not exist, NOT because nothing happened`
        : null,
      firstScreenAt: iso(row.firstScreenAt),
      quickStartStartedAt: iso(row.quickStartStartedAt),
      quickStartDraftCount: row.quickStartDraftCount,
      firstDraftSeenAt: iso(row.firstDraftSeenAt),
      firstDraftSource: row.firstDraftSource,
      firstApproveAt: iso(row.firstApproveAt),
      firstPublishAt: iso(row.firstPublishAt),
      returnedAt: iso(row.returnedAt),
      reviewAskCount: row.reviewAskCount,
    },

    lastActivity: activity.length ? { what: activity[0][0], at: iso(activity[0][1]) } : null,
    activityTimeline: activity.map(([k, v]) => ({ what: k, at: iso(v) })),
  };
}

/** A referer's host only — the path can carry a search query, which is a person's words. */
function safeHost(u) {
  try {
    return new URL(u).host;
  } catch {
    return null;
  }
}

const out = { readAt: new Date().toISOString(), listingLive: LISTING_LIVE, shops: [] };
for (const s of shops) out.shops.push(await readShop(s));
console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
