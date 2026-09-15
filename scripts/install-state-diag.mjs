#!/usr/bin/env node
/**
 * Phase 11 Part A — what the app believes about a shop's install state, and
 * what Shopify says. READ-ONLY of the merchant's data: the only write it can
 * cause is Shopify's own token refresh updating our Session row (the same
 * refresh every background job performs). Prints no token, ever.
 *
 *   DIAG_SHOP=navaal-qa-fresh.myshopify.com node /app/scripts/install-state-diag.mjs
 *   node /app/scripts/install-state-diag.mjs            # the cross-shop count
 *
 * One shop: the Shop row's install / uninstall / reinstall stamps and counts,
 * its sessions (presence, kind, expiry), the rows the uninstall path deletes
 * (so a deleted-and-recreated pattern shows as createdAt after uninstalledAt),
 * the GDPR audit, the LogEvent timeline of the install events, and a
 * `shop { name }` probe through the stored offline token — which is the
 * question: does Shopify still honour this shop's token?
 *
 * No shop: every row flagged uninstalled and not redacted; how many still
 * hold an offline session; how many of THOSE answer the probe. A flagged row
 * that answers is a shop the app believes gone and Shopify says is installed.
 */
import prisma from "../app/db.server.js";
import { getFreshOfflineSession } from "../app/utils/offlineToken.server.js";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const INSTALL_EVENTS = [
  "shop_installed",
  "shop_record_backfilled",
  "shop_reinstalled",
  "ttv_reset_on_reinstall",
  "shop_uninstalled",
  "uninstall_delivery_stale",
  "uninstall_delivery_contradicted",
  "shop_data_deleted",
  "uninstall_cleanup_unfinished",
  "webhook_sweep_recovered",
  "shop_install_reconciled",
  "shop_redacted",
  "redaction_unfinished",
  "redaction_superseded",
  "shop_redact_contradicted",
  "webhook_stale",
];

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Ask Shopify whether the stored offline token is still honoured. Never throws. */
async function probe(shop) {
  let sess;
  try {
    sess = await getFreshOfflineSession(shop);
  } catch (err) {
    return { installed: null, reason: `session load failed: ${err?.message ?? "?"}` };
  }
  if (!sess?.accessToken) return { installed: null, reason: "no offline session" };
  try {
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Shopify-Access-Token": sess.accessToken },
      body: JSON.stringify({ query: "{ shop { name } }" }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => null);
    const name = json?.data?.shop?.name ?? null;
    if (res.status === 200 && name) return { installed: true, status: 200, shopName: name };
    if (res.status === 401 || res.status === 403 || res.status === 404) return { installed: false, status: res.status, reason: "token not honoured" };
    if (res.status === 402) return { installed: null, status: 402, reason: "store frozen or payment required" };
    return { installed: null, status: res.status, reason: json?.errors?.[0]?.message ?? "unexpected response" };
  } catch (err) {
    return { installed: null, reason: `probe failed: ${err?.message ?? "?"}` };
  }
}

async function oneShop(shop) {
  const row = await prisma.shop.findUnique({ where: { shop } });
  const out = { shop, at: new Date().toISOString(), row: null };
  if (!row) {
    out.row = null;
    out.verdict = "NO SHOP ROW";
  } else {
    out.row = {
      installedAt: iso(row.installedAt),
      installSource: row.installSource,
      installCount: row.installCount,
      reinstalledAt: iso(row.reinstalledAt),
      reinstallSource: row.reinstallSource,
      uninstalledAt: iso(row.uninstalledAt),
      redactedAt: iso(row.redactedAt),
      productCountAtFirstLoad: row.productCountAtFirstLoad,
      quickStartStartedAt: iso(row.quickStartStartedAt),
      firstScreenAt: iso(row.firstScreenAt),
      firstDraftSeenAt: iso(row.firstDraftSeenAt),
      firstApproveAt: iso(row.firstApproveAt),
      firstPublishAt: iso(row.firstPublishAt),
      returnedAt: iso(row.returnedAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }
  const sessions = await prisma.session.findMany({ where: { shop }, select: { id: true, isOnline: true, expires: true, scope: true, accessToken: true, refreshToken: true, refreshTokenExpires: true } });
  out.sessions = sessions.map((s) => ({
    id: s.id.replace(/\.myshopify\.com.*$/, ".myshopify.com"),
    isOnline: s.isOnline,
    hasAccessToken: !!s.accessToken,
    hasRefreshToken: !!s.refreshToken,
    expires: iso(s.expires),
    refreshTokenExpires: iso(s.refreshTokenExpires),
    scope: s.scope,
  }));
  // Rows the uninstall path deletes. A createdAt AFTER uninstalledAt means the
  // row was recreated by the app serving this shop after it was "gone".
  const [plan, content, usage, jobs, growth, voice, gdpr] = await Promise.all([
    prisma.plan.findUnique({ where: { shop }, select: { planName: true, status: true, createdAt: true, updatedAt: true } }).catch(() => null),
    prisma.generatedContent.aggregate({ where: { shop }, _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true } }).catch(() => null),
    prisma.usageRecord.aggregate({ where: { shop }, _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true } }).catch(() => null),
    prisma.generationJob.count({ where: { shop } }).catch(() => null),
    prisma.growthState.findUnique({ where: { shop }, select: { createdAt: true } }).catch(() => null),
    prisma.brandVoice.findUnique({ where: { shop }, select: { createdAt: true } }).catch(() => null),
    prisma.gDPRRequest.findMany({ where: { shop }, select: { requestType: true, processedAt: true }, orderBy: { processedAt: "asc" } }).catch(() => []),
  ]);
  out.perShopRows = {
    plan: plan ? { planName: plan.planName, status: plan.status, createdAt: iso(plan.createdAt), updatedAt: iso(plan.updatedAt) } : null,
    generatedContent: content ? { count: content._count._all, first: iso(content._min.createdAt), last: iso(content._max.createdAt) } : null,
    usageRecords: usage ? { count: usage._count._all, first: iso(usage._min.createdAt), last: iso(usage._max.createdAt) } : null,
    generationJobs: jobs,
    growthStateCreatedAt: iso(growth?.createdAt),
    brandVoiceCreatedAt: iso(voice?.createdAt),
    gdprRequests: gdpr.map((g) => ({ type: g.requestType, at: iso(g.processedAt) })),
  };
  const events = await prisma.logEvent
    .findMany({
      where: { shop, OR: [{ event: { in: INSTALL_EVENTS } }, { msg: { contains: "app/uninstalled" } }] },
      select: { createdAt: true, level: true, event: true, msg: true, data: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    })
    .catch(() => []);
  const oldest = await prisma.logEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }).catch(() => null);
  out.logRetentionStartsAt = iso(oldest?.createdAt);
  out.timeline = events.map((e) => {
    const d = e.data && typeof e.data === "object" ? e.data : {};
    const keep = {};
    for (const k of ["triggeredAt", "matched", "installCount", "reinstallSource", "installSource", "leftovers", "count", "webhookId", "attempt", "firstDraftSeenAt", "firstPublishAt"]) if (k in d) keep[k] = d[k];
    return { at: iso(e.createdAt), level: e.level, event: e.event, msg: e.msg, ...keep };
  });
  out.probe = row ? await probe(shop) : { installed: null, reason: "no row" };
  if (row) {
    const believesInstalled = !row.uninstalledAt && !row.redactedAt;
    out.verdict =
      out.probe.installed === true && !believesInstalled
        ? "DISAGREE — the app believes this shop is uninstalled; Shopify honours its token"
        : out.probe.installed === false && believesInstalled
          ? "DISAGREE — the app believes this shop is installed; Shopify does not honour its token"
          : out.probe.installed === null
            ? `UNDECIDED — ${out.probe.reason}`
            : "AGREE";
  }
  return out;
}

async function crossShop() {
  const flagged = await prisma.shop.findMany({
    where: { uninstalledAt: { not: null }, redactedAt: null },
    select: { shop: true, uninstalledAt: true, reinstalledAt: true, installedAt: true, installCount: true },
    orderBy: { uninstalledAt: "desc" },
  });
  const out = { at: new Date().toISOString(), flaggedUninstalled: flagged.length, withOfflineSession: 0, probed: [], answers: 0, refused: 0, undecided: 0 };
  for (const r of flagged) {
    const sess = await prisma.session.findFirst({ where: { shop: r.shop, isOnline: false }, select: { id: true } });
    if (!sess) continue;
    out.withOfflineSession += 1;
    const p = await probe(r.shop);
    if (p.installed === true) out.answers += 1;
    else if (p.installed === false) out.refused += 1;
    else out.undecided += 1;
    out.probed.push({ shop: r.shop, uninstalledAt: iso(r.uninstalledAt), reinstalledAt: iso(r.reinstalledAt), installCount: r.installCount, probe: p });
  }
  const installed = await prisma.shop.count({ where: { uninstalledAt: null, redactedAt: null } });
  out.believedInstalled = installed;
  // The other shape of the disagreement: a shop/redact audit row whose domain
  // has a LIVE Shop row again (a reinstall after the redaction). Until Phase 11
  // the sweep re-applied such a row to every new install of that domain.
  const audits = await prisma.gDPRRequest.findMany({ where: { requestType: "shop_redact" }, select: { shop: true, processedAt: true, completedAt: true }, orderBy: { processedAt: "asc" } }).catch(() => []);
  out.redactLoop = [];
  for (const a of audits) {
    const row = await prisma.shop.findUnique({ where: { shop: a.shop }, select: { installedAt: true, reinstalledAt: true, uninstalledAt: true, redactedAt: true } });
    const sessions = await prisma.session.count({ where: { shop: a.shop } });
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [redactions, installs] = await Promise.all([
      prisma.logEvent.count({ where: { shop: a.shop, event: "shop_redacted", createdAt: { gte: since } } }).catch(() => null),
      prisma.logEvent.count({ where: { shop: a.shop, event: "shop_installed", createdAt: { gte: since } } }).catch(() => null),
    ]);
    out.redactLoop.push({
      shop: a.shop,
      auditProcessedAt: iso(a.processedAt),
      auditCompletedAt: iso(a.completedAt ?? null),
      liveRow: row ? { installedAt: iso(row.installedAt), reinstalledAt: iso(row.reinstalledAt), uninstalledAt: iso(row.uninstalledAt), redactedAt: iso(row.redactedAt) } : null,
      sessions,
      redactionsLast30d: redactions,
      installsLast30d: installs,
      looping: !!row && !row.redactedAt && (redactions ?? 0) > 1,
    });
  }
  out.ghostRows = {
    redacted: await prisma.shop.count({ where: { redactedAt: { not: null } } }),
    redactedWhileInstalled: await prisma.shop.count({ where: { redactedAt: { not: null }, uninstalledAt: null } }),
  };
  const looping = out.redactLoop.filter((r) => r.looping).length;
  const reinstalledAfterRedact = out.redactLoop.filter((r) => (r.installsLast30d ?? 0) > 0 && (r.redactionsLast30d ?? 0) > 0).length;
  out.verdict = [
    out.answers > 0 ? `${out.answers} shop(s) the app believes uninstalled answer Shopify` : "no flagged shop with a live session answers",
    `${reinstalledAfterRedact} domain(s) installed again after a shop/redact in the last 30 days`,
    `${looping} currently in the redact loop`,
  ].join("; ");
  return out;
}

const shop = String(process.env.DIAG_SHOP ?? "").trim().toLowerCase();
try {
  const out = shop ? await oneShop(shop) : await crossShop();
  console.log(JSON.stringify(out, null, 2));
} finally {
  await prisma.$disconnect();
}
