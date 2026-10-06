#!/usr/bin/env node
/**
 * P38b — did the nightly jobs run once a night, or once a minute, while every
 * Redis claim was failing open (2026-10-01 11:40Z until the P38 deploy)?
 * And: is hark-fauy0olp.myshopify.com a merchant or a test shop?
 *
 * READ ONLY. Nothing is written or deleted — not in Postgres, not in R2, not in
 * Shopify. Prints shop domains; do not paste the output into a CI log.
 *
 *   fly ssh console -a contentclaude -C "node /app/scripts/p38b-scheduled-audit.mjs"
 *   optional: SINCE=2026-10-01T00:00:00Z  SHOP=hark-fauy0olp.myshopify.com
 *
 * Evidence, per Sydney night:
 *   - LogEvent rows the log sink kept: every run's own event tag
 *     (backup_ok/backup_failed, billing_reconciled, catalogue_watch_daily,
 *     crawl_holdout_daily, and per shop catalogue_watch_ran /
 *     crawl_experiment_started) plus the "…running anyway" warning the
 *     fail-open path wrote on every run
 *   - CrawlExperiment rows: each one is a real Bing URL submission
 *   - R2: every backup object under neondb/, with its size
 * Shopify keeps no per-app API call log we can read; catalogue_watch_ran (one
 * per shop per run) is the record of how often each store was queried.
 */
import { createHash, createHmac } from "node:crypto";
import prisma from "../app/db.server.js";
import { backupConfig } from "../app/utils/backup.server.js";
import { sydneyParts } from "../app/utils/scheduler.server.js";
import { getFreshOfflineSession } from "../app/utils/offlineToken.server.js";
import { offlineGraphql } from "../app/utils/catalogueWatch.server.js";
import { shopifyQuery } from "../app/utils/shopifyQuery.server.js";

const SINCE = new Date(process.env.SINCE || "2026-10-01T00:00:00Z");
const SHOP = process.env.SHOP || "hark-fauy0olp.myshopify.com";

const RUN_EVENTS = [
  "backup_ok",
  "backup_failed",
  "billing_reconciled",
  "catalogue_watch_daily",
  "catalogue_watch_ran",
  "crawl_holdout_daily",
  "crawl_experiment_started",
];
const night = (d) => sydneyParts(new Date(d)).day;
const bump = (o, k, n = 1) => ((o[k] = (o[k] ?? 0) + n), o);

// ── 1. LogEvent: run events and fail-open warnings, per Sydney night ─────────
const runRows = await prisma.logEvent.findMany({
  where: { createdAt: { gte: SINCE }, event: { in: RUN_EVENTS } },
  select: { event: true, shop: true, createdAt: true },
});
const failOpen = await prisma.logEvent.findMany({
  where: { createdAt: { gte: SINCE }, msg: { contains: "running anyway" } },
  select: { msg: true, createdAt: true },
});
const dropped = await prisma.logEvent.count({ where: { createdAt: { gte: SINCE }, event: "log_sink_dropped" } });

const perNight = {};
for (const r of runRows) bump((perNight[night(r.createdAt)] ??= {}), r.event);
for (const r of failOpen) bump((perNight[night(r.createdAt)] ??= {}), `failOpen: ${r.msg.split(":")[0]}`);
const shopsQueriedPerNight = {};
for (const r of runRows.filter((x) => x.event === "catalogue_watch_ran" && x.shop)) {
  bump((shopsQueriedPerNight[night(r.createdAt)] ??= {}), r.shop);
}

// ── 2. CrawlExperiment rows: each is a Bing submission ───────────────────────
const experiments = await prisma.crawlExperiment.findMany({
  where: { startedAt: { gte: SINCE } },
  select: { shop: true, startedAt: true, submittedAt: true, _count: { select: { urls: true } } },
});
const experimentsPerNight = {};
for (const e of experiments) {
  const n = (experimentsPerNight[night(e.startedAt)] ??= {});
  const s = (n[e.shop] ??= { experiments: 0, submitted: 0, urls: 0 });
  s.experiments++;
  if (e.submittedAt) s.submitted++;
  s.urls += e._count.urls;
}

// ── 3. R2: backups since SINCE ───────────────────────────────────────────────
const sha = (b) => createHash("sha256").update(b).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

async function listR2(cfg, prefix) {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const out = [];
  let token = null;
  for (let page = 0; page < 50; page++) {
    const params = { "list-type": "2", prefix };
    if (token) params["continuation-token"] = token;
    const query = Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join("&");
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha("");
    const canonical = ["GET", `/${cfg.bucket}`, query, `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`, "host;x-amz-content-sha256;x-amz-date", payloadHash].join("\n");
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const key = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
    const sig = createHmac("sha256", key).update(["AWS4-HMAC-SHA256", amzDate, scope, sha(canonical)].join("\n")).digest("hex");
    const res = await fetch(`https://${host}/${cfg.bucket}?${query}`, {
      headers: {
        Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}`,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const xml = await res.text();
    if (!res.ok) return { error: `R2 list ${res.status}: ${xml.slice(0, 300)}`, partial: out };
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const tag = (t) => (m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1];
      out.push({ key: tag("Key"), bytes: Number(tag("Size")), lastModified: tag("LastModified") });
    }
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
    token = (xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/) || [])[1];
    if (!token) break;
  }
  return { objects: out };
}

let backups;
const cfg = backupConfig();
if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey) {
  backups = { error: `R2 not configured on this machine: ${cfg.missing.join(", ")}` };
} else {
  const listed = await listR2(cfg, "neondb/");
  const objects = (listed.objects ?? listed.partial ?? []).filter((o) => new Date(o.lastModified) >= SINCE);
  const byNight = {};
  for (const o of objects) {
    const n = (byNight[night(o.lastModified)] ??= { count: 0, bytes: 0 });
    n.count++;
    n.bytes += o.bytes;
  }
  const total = objects.reduce((a, o) => a + o.bytes, 0);
  backups = {
    error: listed.error ?? null,
    bucket: cfg.bucket,
    count: objects.length,
    totalBytes: total,
    totalMB: +(total / 1048576).toFixed(1),
    byNight,
    objects: objects.sort((a, b) => a.key.localeCompare(b.key)),
  };
}

// ── 4. The 5 Oct install ─────────────────────────────────────────────────────
const shopRow = await prisma.shop.findUnique({
  where: { shop: SHOP },
  select: {
    shop: true, kind: true, installedAt: true, installSource: true, surfaceType: true, surfaceDetail: true,
    installRef: true, utmSource: true, utmMedium: true, utmCampaign: true, installReferer: true,
    installLandingPath: true, installCount: true, reinstalledAt: true, uninstalledAt: true,
    productCountAtFirstLoad: true, storeScoreAtInstall: true, quickStartStartedAt: true, quickStartDraftCount: true,
    firstScreenAt: true, firstDraftSeenAt: true, firstApproveAt: true, firstPublishAt: true, returnedAt: true,
    locale: true, uiLocale: true, trialUsedAt: true, bingEnabledAt: true, aiKeyValidatedAt: true,
  },
});
const count = async (model, where) => {
  try {
    return await prisma[model].count({ where });
  } catch (err) {
    return `n/a (${err.message.split("\n")[0].slice(0, 80)})`;
  }
};
const shopEvents = await prisma.logEvent.findMany({
  where: { shop: SHOP },
  select: { level: true, event: true, msg: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});
const eventCounts = {};
for (const e of shopEvents) bump(eventCounts, `${e.level}: ${e.event ?? e.msg.slice(0, 60)}`);
const webhookTopics = await prisma.webhookDelivery
  .groupBy({ by: ["topic"], where: { shop: SHOP }, _count: { _all: true } })
  .then((rows) => Object.fromEntries(rows.map((r) => [r.topic, r._count._all])))
  .catch((err) => `n/a (${err.message.slice(0, 80)})`);

// What Shopify says the store is. A development store is the strongest single
// "test shop" signal there is. No contact fields are requested.
let shopify;
try {
  const session = await getFreshOfflineSession(SHOP);
  if (!session?.accessToken) {
    shopify = { error: "no offline session (uninstalled, or token never stored)" };
  } else {
    const r = await shopifyQuery(
      offlineGraphql(session),
      `query p38bShop { shop { name createdAt currencyCode primaryDomain { host } billingAddress { countryCodeV2 } plan { displayName partnerDevelopment shopifyPlus } } productsCount { count } }`,
      {},
      { shop: SHOP, label: "p38b shop" },
    );
    shopify = r.ok ? { ...r.data.shop, productsCount: r.data.productsCount?.count ?? null } : { error: r.error ?? "query failed" };
  }
} catch (err) {
  shopify = { error: err.message };
}

console.log(
  JSON.stringify(
    {
      readAt: new Date().toISOString(),
      since: SINCE.toISOString(),
      scheduledJobs: { perNight, shopsQueriedPerNight, experimentsPerNight, logSinkDropped: dropped },
      backups,
      shop: {
        shop: SHOP,
        row: shopRow,
        plan: await prisma.plan.findUnique({ where: { shop: SHOP }, select: { planName: true, status: true, trialEndsAt: true } }),
        counts: {
          generatedContent: await count("generatedContent", { shop: SHOP }),
          usageRecords: await count("usageRecord", { shop: SHOP }),
          generationJobs: await count("generationJob", { shop: SHOP }),
          productWatch: await count("productWatch", { shop: SHOP }),
          productScores: await count("productScore", { shop: SHOP }),
          sessions: await count("session", { shop: SHOP }),
        },
        events: eventCounts,
        firstEventAt: shopEvents[0]?.createdAt ?? null,
        lastEventAt: shopEvents.at(-1)?.createdAt ?? null,
        webhookTopics,
        shopify,
      },
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
