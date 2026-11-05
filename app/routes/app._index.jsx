import { Suspense, useState } from "react";
import { useT } from "../i18n/react.jsx";
import { Await, useLoaderData, useNavigate, useFetcher, useRevalidator } from "react-router";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import { ThemeStepActions } from "../components/EmbedSetupCard.jsx";
import { changeWindowFor, autopilotBannerTitle, windowLabel, sinceLabelFor } from "../utils/homeCopy.js";
import { StartState } from "../components/StartState.jsx";
import { QuotaWarningBanner } from "../components/UpgradePrompt.jsx";
import { quotaPct } from "../utils/quota.js";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Box,
  Badge,
  ProgressBar,
  Divider,
  SkeletonBodyText,
  SkeletonDisplayText,
  InlineGrid,
  Tabs,
} from "@shopify/polaris";
import { EditIcon, CheckCircleIcon, TextBlockIcon, ProductIcon, ClockIcon, CreditCardIcon } from "@shopify/polaris-icons";
import { IconTile, MetricCard } from "../components/Kit.jsx";
import { IlluScore, IlluBrandVoice, IlluDrafts, IlluThemeEditor, IlluAllGood, IlluProducts } from "../components/Illustrations.jsx";
import { T } from "../i18n/index.js";
import { gscLine } from "../utils/gscAiControl.js";
import { indexabilityLine } from "../utils/indexability.js";
import { ScoreRing } from "../components/ScoreRing.jsx";
import { IssueList } from "../components/IssueList.jsx";
import { SetupGuide } from "../components/SetupGuide.jsx";
import { ProductThumb } from "../components/ProductThumb.jsx";
import { getEntitlements } from "../utils/billing-plans.js";
import { blockerRows } from "../utils/fixRows.js";
import { authenticate } from "../shopify.server.js";
import { GeoRubric } from "../components/GeoRubric.jsx";
import prisma from "../db.server.js";
import logger from "../utils/logger.server.js";
import { getOrCreatePlan, getMonthlyUsageCount } from "../utils/plans.server.js";
import { getContentMetrics } from "../utils/metrics.server.js";
import { getCandidateCounts, notOptimizedFrom } from "../utils/candidates.server.js";
import { contentInCatalogue } from "../utils/catalogueContent.server.js";
import { publishedSubtext } from "../utils/catalogueContent.js";
import { attentionFor, blockersFor } from "../utils/catalogueWatch.server.js";
import { recentDraftIds, fetchCardInfo } from "../utils/quickStart.server.js";
import { proofSummary } from "../utils/proofCard.server.js";
import { proofCardLines } from "../utils/proofCard.js";
import { homeAttentionLines } from "../utils/catalogueWatch.js";
import { scanStoreForStart, START_TARGETS } from "../utils/startState.server.js";
import { stampProductCountAtFirstLoad, markFirstScreen, markReturned } from "../utils/firstValue.server.js";
import { getQuotaWarning } from "../utils/quotaSurfaces.server.js";
import { getStoreScore, firstRunFindings } from "../utils/storeScore.server.js";
import { recentAutopilotWork } from "../utils/autopilot.server.js";

/** A2 (Phase 8) — how long after the first draft a visit is still the first one. */
const FIRST_VISIT_MS = 24 * 3600 * 1000;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  // Preserve all Shopify auth params so server-side redirects can re-authenticate.
  // Third-party cookies are blocked in embedded iframes, so we must carry id_token
  // and session through every redirect for the token exchange to succeed.
  const url = new URL(request.url);
  const authParams = new URLSearchParams();
  for (const key of ["host", "shop", "id_token", "session", "embedded", "locale", "timestamp", "hmac"]) {
    const val = url.searchParams.get(key);
    if (val) authParams.set(key, val);
  }

  // Phase 2 item 2.11 — the two below-the-fold queries are started here, with
  // the batch below, but never awaited. Recent Activity and the blog counts sit
  // under the stat cards, the usage card and the primary action; making the
  // first paint wait on two groupBy aggregates over the whole content table
  // charged every merchant for something most of them never scroll to.
  // Streamed to <Await> instead, and resolved (never rejected) so a failed
  // aggregate costs the merchant a decorative card, not the dashboard.
  const belowFold = Promise.all([
    prisma.generatedContent.groupBy({
      by: ["productId", "productTitle"],
      where: { shop },
      _max: { updatedAt: true },
      _count: { contentType: true },
      orderBy: { _max: { updatedAt: "desc" } },
      take: 5,
    }),
    prisma.blogPost.groupBy({
      by: ["status"],
      where: { shop },
      _count: { status: true },
    }),
  ])
    .then(async ([recent, blogStats]) => {
      const blogsPublished = blogStats.find((s) => s.status === "published")?._count.status ?? 0;
      const blogsDraft = blogStats.find((s) => s.status === "draft")?._count.status ?? 0;
      // Redesign (Nov 2026) — each row shows the product's own photo, as every
      // list in the category does. One nodes() lookup for at most five ids,
      // inside this streamed promise, never thrown: a failed lookup costs the
      // thumbnails (the rows fall back to Polaris's image icon), not the card.
      const productIds = recent.map((r) => r.productId).filter((id) => String(id).startsWith("gid://shopify/Product/"));
      const cards = await fetchCardInfo(admin, productIds);
      return {
        recentActivity: recent.map((r) => ({
          productId: r.productId,
          productTitle: r.productTitle || "Product",
          imageUrl: cards[r.productId]?.imageUrl || "",
          contentTypesCount: r._count.contentType,
          updatedAt: r._max.updatedAt.toISOString(),
        })),
        blogsTotal: blogsPublished + blogsDraft,
        blogsPublished,
        blogsDraft,
      };
    })
    .catch((err) => {
      // A streamed promise cannot redirect or re-authenticate — the headers are
      // already sent — so this degrades to an empty activity list and no blog
      // badges. Log the real cause so the failure is not invisible.
      logger.error({ shop, err: err?.message }, "dashboard below-fold queries failed");
      return { recentActivity: [], blogsTotal: 0, blogsPublished: 0, blogsDraft: 0 };
    });

  // Everything the first paint needs, in ONE parallel batch. The product count
  // (an Admin GraphQL call, cached 5 min) used to be awaited sequentially
  // *before* the DB queries, serializing a network round-trip ahead of
  // everything else; folding it into Promise.all makes total latency ≈ the
  // single slowest call.
  const [
    candidateCounts,
    metrics,
    brandVoice,
    activeJobCount,
    plan,
    usageCount,
    recentlyCompletedJob,
    growthState,
    shopRow,
  ] = await Promise.all([
    // Group 1 — this was a cached, UNFILTERED `productsCount { count }`. It
    // became the "Total Products" card, the "N need content" figure and the
    // "Optimize N products" primary. On a catalogue of 3,148 with 1,350 active
    // it reported 3,148 to all three. The primitive answers both questions —
    // the true catalogue total AND what this app may actually touch — and reads
    // Shopify's `precision`, which we were ignoring.
    getCandidateCounts(admin, shop),
    getContentMetrics(shop),
    prisma.brandVoice.findUnique({ where: { shop } }),
    prisma.generationJob.count({
      where: { shop, status: { in: ["queued", "processing"] } },
    }),
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
    // Detect a job that finished in the last 15 min so we can surface a success banner
    prisma.generationJob.findFirst({
      where: {
        shop,
        status: "complete",
        completedAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
      orderBy: { completedAt: "desc" },
      select: { completedProducts: true, completedAt: true },
    }),
    // embedConfirmedAt drives the theme-embed setup card (requirement 5.1.3).
    prisma.growthState.findUnique({
      where: { shop },
      select: { embedConfirmedAt: true, geoNoteDismissedAt: true },
    }),
    // Phase 3 item 3.2 — the ONE fact that decides whether this is a first run.
    // Not "has no content" (a merchant who deleted every draft is not new) and
    // not a GrowthState flag (those did not survive uninstall/reinstall): the
    // first-value milestone on the Shop row, which ttvReport measures.
    prisma.shop.findUnique({ where: { shop }, select: { firstDraftSeenAt: true, firstPublishAt: true } }).catch(() => null),
  ]);

  // Phase 2 item 2.1 - one definition of product state, shared with Products
  // and Optimize. These are mutually exclusive and, with needsContent, sum to
  // totalProducts, so Home can never report a different number from Products
  // for the same store.
  // Group 1.5 — "Total Products 3,148 — In your Shopify catalog" is a TRUE
  // sentence and keeps its meaning. What changes is that the number the app
  // ACTS on is no longer the same number.
  // Part B — the join. Cached ten minutes, cleared on publish, and honest
  // about being unavailable: `ok: false` means the screen shows the lifetime
  // record with wording that says so, never a partial join presented as whole.
  const catalogue = await contentInCatalogue(admin, shop);
  const catalogueOk = catalogue.ok;

  const totalProducts = candidateCounts.total?.count ?? null;
  const candidateProducts = candidateCounts.candidates?.count ?? null;
  const archivedProducts = candidateCounts.archived?.count ?? null;

  // Part B — every count on this screen is about the SAME population: the
  // candidate scope. The lifetime record is kept beside it as `recordPublished`
  // and shown as secondary text, never redefined (metrics.server.js, top).
  const recordPublished = metrics.publishedProducts;
  const generatedCount = catalogue.ok ? catalogue.published : metrics.publishedProducts;
  // A3 (Phase 8), second pass — drafts are a CONTENT-state number, not a
  // Shopify-scope one. Counting only drafts on candidate products put "4" here
  // and "5" on Review for the same store. Home, the Products header, Review
  // and the page tabs now all count every product draft.
  const draftCount = metrics.draftProducts;
  // Group 4.1 — not "needs content". These are candidates WE have not written
  // for, which on a store with its own copy is a completely different set.
  const notOptimizedCount = notOptimizedFrom(
    candidateProducts,
    catalogue.ok ? catalogue.withContent : metrics.withContent,
  );

  const hasBrandVoice = !!(
    brandVoice &&
    (brandVoice.storeName?.trim() || brandVoice.targetAudience?.trim() || brandVoice.sampleContent?.trim())
  );
  // "New" is about whether the merchant has ever done anything, so it reads
  // the RECORD: a shop whose only content sits on since-archived products is
  // not new, and must not be shown the first-run experience again.
  const isNewShop = metrics.publishedProducts === 0 && metrics.draftProducts === 0;

  // Phase 3 items 3.1/3.2 — Home IS the first run. A brand-new shop used to be
  // redirected to /app/welcome (magic moment) or /app/setup (a form wizard).
  // Both are gone: the Start state renders here, on /app, with no redirect and
  // no new top-level route, so the embedded chain stays exactly as proven.
  //
  // A shop with no Shop row (installed before tracking shipped and not seen
  // since) is NOT treated as a first run — it would restart onboarding for an
  // established merchant. Absent evidence of a first draft, the safe default is
  // the normal dashboard.
  const isFirstRun = !!shopRow && shopRow.firstDraftSeenAt == null;
  // A2 (Phase 8) — "Welcome back" to somebody who has never been here. The
  // hero renders the moment the first drafts are seen; for the first day it
  // greets a first visit, not a return.
  const firstVisit = !!shopRow?.firstDraftSeenAt && Date.now() - new Date(shopRow.firstDraftSeenAt).getTime() < FIRST_VISIT_MS;

  // Context for the time-to-value report: how big was the catalogue when this
  // merchant first arrived? It explains an install that never reaches a draft.
  // First-writer-wins, never throws, not awaited — nothing renders from it.
  if (isFirstRun) void stampProductCountAtFirstLoad(shop, totalProducts);
  // Phase 10 Part B — the funnel: first screen (once) and returned on a later
  // day (once). Timestamps only; never awaited, never fatal.
  void markFirstScreen(shop);
  void markReturned(shop);

  // The scan is the slow part (an Admin GraphQL page plus scoring), so it is
  // streamed exactly like the below-fold queries: the Start shell and the
  // quota line paint immediately and the score reveal arrives behind a
  // skeleton. Resolved, never rejected — scanStoreForStart returns
  // { error: true } rather than throwing, so the card can offer a retry.
  // Phase 3 item 3.4 — the ONE upsell Home carries, and only between 80% and
  // 100% used. Null when the shop is below the threshold, already out (that is
  // the card's job, on the screens where the action lives), or dismissed it in
  // the last 7 days. Never throws.
  // Phase 12 A5 — the admin locale Shopify passes to the embedded app, one of
  // the three scope-free signals the language default reads.
  const adminLocale = new URL(request.url).searchParams.get("locale");
  const [quotaWarning, storeScore] = await Promise.all([
    getQuotaWarning({ shop, plan, usageCount, surface: "dashboard" }),
    // Phase 4 item 4.3 — the merchant's proof the app worked. One GraphQL page,
    // cached 10 minutes per shop, so reloading Home does not re-scan. Returns
    // { available: false } rather than a number it cannot stand behind.
    getStoreScore(admin, shop, { adminLocale }),
  ]);
  // Phase 12 A3 — ONE window for "what changed" on this screen: the score
  // card's baseline moment. Frame 01 read "Unchanged since September 14" above
  // "Autopilot optimized 15 new products in the last 24 hours" — two windows,
  // one screen. The autopilot recap now counts from the same moment and the
  // banner names the same date.
  const changeWindow = changeWindowFor(storeScore);
  // Phase 4 item 5 — autopilot works while the merchant is not looking, so
  // the one place it must show up is the screen they open next.
  const autopilotRecap = await recentAutopilotWork(shop, { since: changeWindow.since });

  // P2.3 — the subscription's one number. Walks inline once for a shop that
  // has never been walked, so the first load has a real number, not a dash.
  const attention = await attentionFor(admin, shop);
  // P3.1 (Phase 8) — the Proof card: the latest crawl-time batch, if the
  // merchant turned Bing on. One query; never throws.
  const proof = await proofSummary(shop);

  // P2.7 — the first run names the three specific things holding THIS store
  // back, from the walk that just ran. One query; never throws.
  // Phase 12 A4 / FR8 — until the first publish, Home leads with the result of
  // the first run: the three lowest-scoring products (durable, from
  // ProductScore) and the specific things the walk found. The theme step
  // waits until there is published content to show.
  const beforeFirstPublish = !!shopRow && !shopRow.firstPublishAt;
  // Redesign (Nov 2026) — Home leads with "what to fix first" for every shop,
  // not only before the first publish, so the blockers are read on every load.
  // One indexed query over ProductWatch; never throws.
  // Redesign v2 — every finding once (the severity counts), the top three
  // sliced from it (the rows). blockerLines sorts before it slices, so the
  // three are exactly what the old max-3 call returned, password row included.
  const allBlockers = await blockersFor(shop, { max: 99 });
  const blockers = allBlockers.slice(0, 3);
  const findings = beforeFirstPublish && !isFirstRun ? await firstRunFindings(shop) : [];
  // A4/FR9 — drafts already inside the reuse window, so a reload never re-announces a charge.
  const draftedIds = isFirstRun ? await recentDraftIds(shop) : [];

  const start = isFirstRun
    ? {
        targetCount: START_TARGETS,
        remaining: Math.max(0, plan.monthlyCredits - usageCount),
        monthlyCredits: plan.monthlyCredits,
        // The Start copy says "free generations" only on the free plan; a
        // merchant paying for Pro must not be told their allowance is free.
        planName: plan.planName,
        blockers,
        // Every finding, for the result screen's severity cards and its headline count.
        allBlockers,
        draftedIds,
        // Phase 10 Part C (F1, the ALL_DRAFT / B2B_ONLY cells) — the scan is
        // scoped to Active products on the Online Store, so a store being
        // built (every product a draft) or a trade-only store (nothing on the
        // channel) scans as EMPTY. The empty screen then said "add a product"
        // to a merchant who has forty. These two counts let it say the true
        // thing: the products exist; none is where AI search can read it.
        // The ring's scope reads "across 30 of 10,000+ products" when Shopify capped the count.
        totalExact: candidateCounts.total?.exact ?? true,
        totalProducts,
        candidateProducts,
        scan: scanStoreForStart(admin, shop, { adminLocale }),
      }
    : null;

  // Redesign (Nov 2026): Home no longer addresses the store by name — not in a
  // greeting (gone: it greeted renamed stores by their old name, and unnamed
  // ones by their handle) and not in the subtitle (the admin's own chrome
  // already names the store, and a long name pushed the subtitle under the
  // page actions). So the live-name lookup is not made here at all; Blog still
  // uses it for the author line. See app/utils/shopName.js.

  const payload = {
    shopDomain: shop,
    embedConfirmed: !!growthState?.embedConfirmedAt,
    totalProducts,
    generatedCount,
    draftCount,
    notOptimizedCount,
    archivedProducts,
    recordPublished,
    catalogueOk,
    candidateProducts,
    // Shopify caps productsCount (precision AT_LEAST, readCount in
    // candidates.js). Products already says "10,000+"; Home said "10,000",
    // which sat under "10,843 products need attention" from the nightly walk
    // over the whole catalogue (EBS, Nov 2026) — the walk was right and the
    // capped count was presented as a total (L5). Read here, shown with "+".
    totalExact: candidateCounts.total?.exact ?? true,
    candidateExact: candidateCounts.candidates?.exact ?? true,
    candidateLabel: candidateCounts.label,
    countsOk: candidateCounts.ok,
    geoNoteDismissed: !!growthState?.geoNoteDismissedAt,
    activeJobCount,
    hasBrandVoice,
    isNewShop,
    start,
    quotaWarning,
    storeScore,
    autopilotRecap,
    changeWindow: { since: changeWindow.since, kind: changeWindow.kind },
    beforeFirstPublish,
    findings,
    blockers,
    allBlockers,
    attention,
    proof,
    plan: { planName: plan.planName, monthlyCredits: plan.monthlyCredits },
    usageCount,
    firstVisit,
    recentlyCompletedJob: recentlyCompletedJob
      ? {
          completedProducts: recentlyCompletedJob.completedProducts,
          completedAt: recentlyCompletedJob.completedAt.toISOString(),
        }
      : null,
    // recentActivity, blogsTotal, blogsPublished and blogsDraft resolve here.
    belowFold,
  };

  // A promise only streams if the loader returns a plain object - Response.json
  // cannot carry one, so this returns the object itself.
  return payload;
};

/**
 * Phase 3 item 3.2 — do not re-run this loader for a quick-start submission.
 *
 * The Start state fires up to three fetchers at /app/quick-start, one per
 * product. By default React Router revalidates every loader after any fetcher
 * submission, which here would mean three full re-runs of this loader — and the
 * first one is actively harmful: `runQuickStartOne` stamps
 * `Shop.firstDraftSeenAt` as soon as a draft is written, so the reloaded loader
 * would decide this shop is no longer on its first run and replace the Start
 * state with the dashboard while the other two generations were still in
 * flight. The merchant would watch their screen change out from under them and
 * lose sight of the drafts they were waiting for.
 *
 * The cards render their own results, so nothing is lost by staying put. Real
 * navigation and the retry button's explicit revalidate still refresh normally.
 */
export function shouldRevalidate({ formAction, defaultShouldRevalidate }) {
  if (formAction && formAction.startsWith("/app/quick-start")) return false;
  return defaultShouldRevalidate;
}


/**
 * Redesign (Nov 2026) — Home answers one question: "is my catalogue ready
 * for search and AI shopping, and what do I fix first?"
 *
 * The five top apps in the category (Tapita, Avada, Smart SEO, StoreSEO,
 * SEOWILL; walked on EBS, 2 Nov 2026) all open the same way: a score ring with
 * its scope under it, the findings as rows with one button each, a setup
 * checklist with progress while setup is unfinished, and one small strip of
 * numbers. This screen had eleven blocks, four stacked notices, a dark greeting
 * band and no title. The data below it is the same loader; what changed is the
 * arrangement and the copy.
 *
 * What is deliberately gone, and where its content went:
 *   - the greeting band → the Page title and subtitle name the store and plan;
 *   - the three KPI cards with icons → one divided strip (StatStrip);
 *   - the explainer banner, the FAQ "later" note, the attention banner, the
 *     autopilot and bulk-job banners → the setup guide's steps, the "what to
 *     fix first" rows, and the strip's hints. One notice at most survives on
 *     the page: the quota warning, which only appears between 80% and 100%;
 *   - the "Optimize your store" strip, the SEO Audit and Blog promo cards →
 *     Audit and Blog are sidebar items now (app.jsx);
 *   - "The 3 products holding this store back" → the first run's drafts are
 *     the primary action ("Review 3 drafts"); a list of three identical scores
 *     carried no information.
 *
 * Laws kept (00-CONSTITUTION L5): every number states its scope in a few
 * words beneath it; two blocks never disagree, because every count comes from
 * one loader field; nothing is rendered as zero when it was not measured.
 */

/**
 * The checks the daily walk runs, said in the positive, for the Passed tab:
 * a check appears there when no walked product fails it (redesign v2 —
 * SEOWILL 122 "Good result", Tapita 074 "Good").
 */
const PASSED_CHECK = {
  "openai·description·blocking": T("Every product has a description"),
  "openai·image_link·blocking": T("Every product has an image"),
  "openai·brand·blocking": T("Every product has a brand"),
  "openai·title·blocking": T("Every product has a title"),
  "openai·link·blocking": T("Every product has a public page"),
  "openai·description·degrading": T("Descriptions are long enough to quote"),
  "openai·image alt·degrading": T("Every image has alt text"),
  "openai·variant options·degrading": T("Variant options are named"),
  "openai·gtin·degrading": T("Barcodes are set or not needed"),
};

/** "57 across 30 products sampled, −1 since 21 Sep" — the ring on its tint, its scope, its change. */
function ScoreSummary({ score, navigate }) {
  const t = useT();
  const available = !!score?.available && Number.isFinite(score.current);
  const hasBaseline = available && Number.isFinite(score.atInstall) && !score.baselineIsNew;
  const delta = hasBaseline ? score.current - score.atInstall : null;
  const baselineIsToday = !!score?.since && new Date(score.since).toDateString() === new Date().toDateString();
  const sinceLabel = available ? sinceLabelFor(score.since, t) : null;
  const sincePhrase = sinceLabel ? t("since {date}", { date: sinceLabel }) : t("since we first scored your store");
  const scopeLine = available && Number.isFinite(score.scanned) && score.scanned > 0 ? t("across {n, plural, one {# product} other {# products}} sampled", { n: score.scanned }) : null;

  let changeBadge = null;
  if (available && hasBaseline && !baselineIsToday && delta !== 0) {
    changeBadge = delta > 0 ? <Badge tone="success">{t("+{delta} {sincePhrase}", { delta, sincePhrase })}</Badge> : <Badge tone="attention">{t("Down {v} {sincePhrase}", { v: Math.abs(delta), sincePhrase })}</Badge>;
  } else if (available && hasBaseline && !baselineIsToday && delta === 0) {
    changeBadge = <Badge>{t("Unchanged {sincePhrase}", { sincePhrase })}</Badge>;
  }

  return (
    <BlockStack gap="300" inlineAlign="center">
      <Text as="h2" variant="headingMd" alignment="center">
        {t("Search readiness")}
      </Text>
      <ScoreRing value={available ? score.current : null} size="xl" label={t("Search readiness")} caption={scopeLine ?? t("Not scored yet")} tint />
      {changeBadge}
      <GeoRubric />
      {/* A plain link, not a second dark button: when nothing is waiting the
          page's own primary action is already "Run audit". */}
      <Button variant="plain" onClick={() => navigate("/app/seo-audit")}>
        {available ? t("See the full audit") : t("Score my catalog")}
      </Button>
    </BlockStack>
  );
}

/**
 * Every finding as a row, split by severity for the tabs (SEOWILL 122,
 * Tapita 074). The feed findings come through the one mapping every screen
 * shares (utils/fixRows.js), so Home and the Audit say the same thing the same
 * way; each carries a chip naming what it is about (GEO = AI shopping feeds,
 * SEO = search engines, Both). The catalogue watch's own lines follow, built
 * by the same helpers homeAttentionLines uses, in its order.
 */
function fixFirstRows({ blockers, attention, entitlements, t, navigate }) {
  const list = Array.isArray(blockers) ? blockers : [];
  const feed = blockerRows(list, { entitlements, t, navigate }).map((row, i) => ({
    ...row,
    tag: String(list[i]?.key).startsWith("openai") ? "geo" : "both",
  }));
  const extra = [];
  if (attention?.available) {
    const blocked = attention?.crawler?.blocked ?? [];
    const crawlerLine = blocked.length ? t("{agents} {n, plural, one {is} other {are}} blocked from your storefront.", { agents: blocked.join(", "), n: blocked.length }) : null;
    const gsc = gscLine(attention?.gsc, t);
    const idx = indexabilityLine(attention?.indexability, t);
    const blocking = Number(attention?.blocking ?? 0);
    const summaryLine = blocking > 0 ? t("{n, plural, one {# product is} other {# products are}} missing something an AI shopping surface requires.", { n: blocking }) : null;
    const see = { content: t("See what changed"), onAction: () => navigate("/app/attention") };
    homeAttentionLines(attention, t).forEach((line, i) => {
      // The feed rows above already itemise the blocking count; the watch's
      // one-line summary of the same fact would say it twice (L5).
      if (line === summaryLine && list.length > 0) return;
      const kind =
        line === crawlerLine
          ? { severity: "critical", tag: "both" }
          : line === gsc
            ? { severity: "warning", tag: "geo" }
            : line === idx
              ? { severity: "warning", tag: "seo" }
              : line === summaryLine
                ? { severity: "critical", tag: "geo" }
                : { severity: "info" };
      extra.push({ id: `attention-${i}`, title: line, action: see, ...kind });
    });
  }
  const rows = [...feed, ...extra];
  const found = new Set(list.map((b) => b?.key));
  const passed = Object.entries(PASSED_CHECK)
    .filter(([key]) => !found.has(key))
    .map(([key, label]) => ({ id: `passed-${key}`, severity: "passed", title: t(label), tag: "geo" }));
  return {
    critical: rows.filter((r) => r.severity === "critical"),
    warning: rows.filter((r) => r.severity === "warning" || r.severity === "info"),
    passed,
  };
}

/** The findings card's right half: tabs with counts, the rows of the chosen one. */
function FixFirst({ groups, attention, totalProducts }) {
  const t = useT();
  const tabs = [
    { id: "critical", content: t("Critical"), badge: String(groups.critical.length), rows: groups.critical },
    { id: "warning", content: t("Needs work"), badge: String(groups.warning.length), rows: groups.warning },
    { id: "passed", content: t("Passed"), badge: String(groups.passed.length), rows: groups.passed },
  ];
  // Open on the first tab with something to do in it.
  const firstWithRows = tabs.findIndex((x) => x.id !== "passed" && x.rows.length > 0);
  const [chosen, setChosen] = useState(null);
  const selected = chosen ?? (firstWithRows >= 0 ? firstWithRows : 2);
  const active = tabs[selected];
  const nothingToFix = groups.critical.length === 0 && groups.warning.length === 0;
  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
        <Text as="h2" variant="headingMd">
          {t("What to fix first")}
        </Text>
        {attention?.available ? (
          <Text as="p" variant="bodySm" tone="subdued">
            {attention.partial ? t("From the products we could reach in one check") : t("Checked daily against your catalog")}
          </Text>
        ) : null}
      </InlineStack>
      <Tabs tabs={tabs.map(({ id, content, badge }) => ({ id, content, badge, panelID: `fix-${id}` }))} selected={selected} onSelect={setChosen} fitted />
      <Box id={`fix-${active.id}`}>
        {totalProducts === 0 ? (
          <InlineGrid columns={{ xs: "1fr", sm: "1fr 160px" }} gap="400" alignItems="center">
            <Text as="p" variant="bodyMd" tone="subdued">
              {t("Add products to your store, and this is where you generate content for them.")}
            </Text>
            <IlluProducts width={160} />
          </InlineGrid>
        ) : nothingToFix && active.id !== "passed" ? (
          <InlineGrid columns={{ xs: "1fr", sm: "1fr 160px" }} gap="400" alignItems="center">
            <Text as="p" variant="bodyMd" tone="subdued">
              {t("Nothing needs you right now. The daily check covers the rest.")}
            </Text>
            <IlluAllGood width={160} />
          </InlineGrid>
        ) : (
          <IssueList items={active.rows} emptyText={active.id === "passed" ? t("No check is passed by every product yet.") : t("Nothing in this group right now.")} />
        )}
      </Box>
    </BlockStack>
  );
}

function RecentActivitySkeleton() {
  return (
    <Card>
      <BlockStack gap="400">
        <SkeletonDisplayText size="small" />
        <SkeletonBodyText lines={5} />
      </BlockStack>
    </Card>
  );
}

/**
 * The <Await> error path. The streamed promise resolves rather than rejects
 * (see the loader), so this only fires on something genuinely unexpected —
 * and both pieces behind it are decoration, so the dashboard keeps working
 * without them.
 */
function BelowFoldUnavailable() {
  return null;
}

/** Before anything is written: the card keeps its frame, says so, and offers the way in. */
function RecentActivityEmpty({ navigate }) {
  const t = useT();
  return (
    <Card>
      <InlineGrid columns={{ xs: "1fr", sm: "1fr 160px" }} gap="400" alignItems="center">
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="center">
            <IconTile icon={ClockIcon} tone="brand" size="sm" />
            <Text as="h2" variant="headingMd">
              {t("Recent activity")}
            </Text>
          </InlineStack>
          <Text as="p" variant="bodyMd" tone="subdued">
            {t("Nothing written yet. Drafts you generate show up here.")}
          </Text>
          <InlineStack>
            <Button onClick={() => navigate("/app/products")}>{t("Open products")}</Button>
          </InlineStack>
        </BlockStack>
        <IlluDrafts width={160} />
      </InlineGrid>
    </Card>
  );
}

/** The last five products or collections touched, as plain rows with their photos. */
function RecentActivityCard({ items, navigate }) {
  const t = useT();
  const rows = items.slice(0, 5);
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <IconTile icon={ClockIcon} tone="brand" size="sm" />
            <Text as="h2" variant="headingMd">
              {t("Recent activity")}
            </Text>
          </InlineStack>
          <Button variant="plain" onClick={() => navigate("/app/products")}>
            {t("All products")}
          </Button>
        </InlineStack>
        <BlockStack gap="0">
          {rows.map((item, i) => {
            // Activity rows can be products OR collections (they share the
            // GeneratedContent table). A Collection GID sent to the product
            // route 404s — route by GID type instead.
            const isProduct = item.productId.startsWith("gid://shopify/Product/");
            const target = isProduct ? `/app/products/${item.productId.replace("gid://shopify/Product/", "")}` : "/app/collections";
            const typeLabel = t("{n, plural, one {# content type} other {# content types}}", { n: item.contentTypesCount });
            return (
              <Box key={item.productId}>
                {i > 0 ? <Divider /> : null}
                <Box paddingBlock="300">
                  <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      <ProductThumb url={item.imageUrl} />
                      <BlockStack gap="050">
                        <Text as="p" variant="bodyMd" fontWeight="medium" truncate>
                          {item.productTitle}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {isProduct ? typeLabel : t("Collection · {typeLabel}", { typeLabel })} · {timeAgo(item.updatedAt, t)}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <Button size="slim" onClick={() => navigate(target)}>
                      {t("View")}
                    </Button>
                  </InlineStack>
                </Box>
              </Box>
            );
          })}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function timeAgo(isoString, t) {
  const secs = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (secs < 60) return t("just now");
  if (secs < 3600) return t("{n}m ago", { n: Math.floor(secs / 60) });
  if (secs < 86400) return t("{n}h ago", { n: Math.floor(secs / 3600) });
  return t("{n}d ago", { n: Math.floor(secs / 86400) });
}

/** The credits readout: the fraction names the bar (FR14), the reset date rides beside it. */
function CreditsCard({ plan, usageCount, remaining, usagePct, planLabel }) {
  const t = useT();
  const usageTone = usagePct >= 90 ? "highlight" : "success";
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
          <InlineStack gap="200" blockAlign="center">
            <IconTile icon={CreditCardIcon} tone="brand" size="sm" />
            <Text as="h2" variant="headingMd">
              {t("Monthly credits")}
            </Text>
          </InlineStack>
          {/* A plan is a fact, not a warning: no tone (colour is for meaning). */}
          <Badge>{t("{plan} plan", { plan: planLabel })}</Badge>
        </InlineStack>
        <Text id="home-credit-usage" as="p" variant="headingLg" fontWeight="semibold">
          {t("{usageCount} / {monthlyCredits} used", { usageCount: t.number(usageCount), monthlyCredits: t.number(plan.monthlyCredits) })}
        </Text>
        <ProgressBar progress={usagePct} tone={usageTone} size="small" ariaLabelledBy="home-credit-usage" />
        <Text as="p" variant="bodySm" tone="subdued">
          {remaining === 0
            ? t("You've used all {monthlyCredits} credits for this month. They reset on the 1st.", { monthlyCredits: t.number(plan.monthlyCredits) })
            : t("{remaining} of {monthlyCredits} left this month.", { remaining: t.number(remaining), monthlyCredits: t.number(plan.monthlyCredits) })}
        </Text>
      </BlockStack>
    </Card>
  );
}
/**
 * Phase 2 item 2.4 — dismissing the one explainer banner.
 *
 * Stored against the shop, not the browser. localStorage would bring the banner
 * back on the merchant's phone, and on their laptop the next time they cleared
 * site data — which is how a "dismissible" banner becomes an undismissable one.
 */
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("actionType") !== "dismissGeoNote") {
    return Response.json({ ok: false }, { status: 400 });
  }
  await prisma.growthState.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, geoNoteDismissedAt: new Date() },
    update: { geoNoteDismissedAt: new Date() },
  });
  return Response.json({ ok: true });
};


export default function Dashboard() {
  const t = useT();
  const {
    totalProducts,
    generatedCount,
    draftCount,
    notOptimizedCount,
    archivedProducts,
    recordPublished,
    catalogueOk,
    candidateProducts,
    totalExact,
    candidateExact,
    candidateLabel,
    countsOk,
    activeJobCount,
    hasBrandVoice,
    start,
    quotaWarning,
    storeScore,
    autopilotRecap,
    changeWindow,
    blockers,
    allBlockers,
    attention,
    proof,
    plan,
    usageCount,
    recentlyCompletedJob,
    shopDomain,
    embedConfirmed,
    geoNoteDismissed,
    belowFold,
  } = useLoaderData();
  // D1 — the window's sentence is made here, in the merchant's language, from the loader's data
  const changeWindowLabel = windowLabel(changeWindow, t);
  const navigate = useNavigate();
  const dismissGuide = useFetcher();

  const revalidator = useRevalidator();
  const loadingThisRoute = useRouteLoading();
  if (loadingThisRoute) {
    return <AppSkeleton title={t("Home")} sections={3} layout="full" />;
  }

  // Phase 3 items 3.1/3.2 — the first run IS Home. While this shop has never
  // seen a draft, /app renders the Start state instead of the dashboard: same
  // route, same embedded chain, no redirect.
  if (start) {
    return <StartState start={start} navigate={navigate} onRetry={() => revalidator.revalidate()} />;
  }

  const usagePct = quotaPct(usageCount, plan.monthlyCredits);
  const remaining = Math.max(0, plan.monthlyCredits - usageCount);
  const planLabels = { free: t("Free"), starter: t("Starter"), growth: t("Growth"), pro: t("Professional") };
  const planLabel = planLabels[plan.planName] ?? plan.planName;
  const entitlements = getEntitlements(plan.planName);

  /* Phase 2 item 2.7 — ONE primary action, chosen by what the merchant should
     do next. Content waiting for a person beats content that does not exist
     yet, which beats a diagnostic. Everything else on the page is secondary. */
  const primaryAction =
    draftCount > 0
      ? {
          content: t("Review {n, plural, one {# draft} other {# drafts}}", { n: draftCount }),
          onAction: () => navigate("/app/review"),
        }
      : notOptimizedCount > 0
        ? {
            // Above Shopify's count ceiling the candidates are a floor, so the
            // difference is one too, and the button says so with "+".
            content: candidateExact === false ? t("Optimize {count}+ products", { count: t.number(notOptimizedCount) }) : t("Optimize {n, plural, one {# product} other {# products}}", { n: notOptimizedCount }),
            // A3.2 — every Optimize entry point lands on the same confirmation
            // on Products, the one that states what will run against the
            // quota (A3.3) and names the plan before the click (A3.1).
            onAction: () => navigate("/app/products?optimize=1"),
          }
        : { content: t("Run audit"), onAction: () => navigate("/app/seo-audit") };

  // Never a disabled primary: when there is nothing to review and nothing to
  // generate, the primary becomes the audit and this becomes the second option.
  const secondaryActions =
    draftCount === 0 && notOptimizedCount === 0
      ? [{ content: t("Write a blog post"), onAction: () => navigate("/app/blog") }]
      : undefined;

  // The title row names the store, the catalogue and the plan — the facts the
  // greeting band used to carry, without the greeting.
  // The merchant is inside their own store; the store's name is already on
  // the admin's own chrome, and with it here the subtitle wraps under the
  // page actions. Two facts, one line.
  const subtitle = [
    totalProducts === null ? null : totalExact === false ? t("{count}+ products", { count: t.number(totalProducts) }) : t("{n, plural, one {# product} other {# products}}", { n: totalProducts }),
    t("{plan} plan", { plan: planLabel }),
  ]
    .filter(Boolean)
    .join(" · ");

  /* The setup guide. Four steps, each decided by real state, the first
     unfinished one open. Step 4 is App Store requirement 5.1.3 (setup
     instructions and a deep link for the theme block) and stays until the
     merchant confirms it; the one-line "complete" state can be dismissed for
     good, stored per shop (geoNoteDismissedAt — the same flag the retired
     explainer banner used, repurposed rather than migrated). */
  const steps = [
    {
      id: "scan",
      title: t("Scan your catalog"),
      description: t("A score for what search engines and AI shopping feeds find on your product pages."),
      done: !!storeScore?.available,
      action: { content: t("Score my catalog"), onAction: () => navigate("/app/seo-audit") },
      illustration: <IlluScore />,
    },
    {
      id: "voice",
      title: t("Set your brand voice"),
      description: t("Tone, audience and what sets you apart, so every draft sounds like you."),
      done: hasBrandVoice,
      action: { content: t("Open settings"), onAction: () => navigate("/app/settings") },
      illustration: <IlluBrandVoice />,
    },
    {
      id: "review",
      title: t("Review your first drafts"),
      description: t("Nothing goes live until you publish it."),
      done: generatedCount > 0,
      action: { content: draftCount > 0 ? t("Review {n, plural, one {# draft} other {# drafts}}", { n: draftCount }) : t("Open products"), onAction: () => navigate(draftCount > 0 ? "/app/review" : "/app/products") },
      illustration: <IlluDrafts />,
    },
    {
      id: "theme",
      title: t("Show FAQ on product pages"),
      description: t("The FAQ (Navaal) theme block puts the answers on your product pages, where shoppers and search engines read them."),
      done: embedConfirmed,
      extra: <ThemeStepActions shopDomain={shopDomain} />,
      illustration: <IlluThemeEditor />,
    },
  ];
  const setupDone = steps.every((s) => s.done);
  const showGuide = !(setupDone && geoNoteDismissed);

  // Every finding, split for the tabs; the counts on the tabs are these lengths.
  const fixGroups = fixFirstRows({ blockers: allBlockers ?? blockers, attention, entitlements, t, navigate });

  /* The strip's hints carry what the autopilot and bulk-job banners used to
     announce: counted over the score card's own window (Phase 12 A3), so the
     two can never name different dates. */
  const autopilotTitle = autopilotRecap ? autopilotBannerTitle(autopilotRecap, { label: changeWindowLabel }, t) : null;
  const readyHint =
    autopilotTitle ??
    (recentlyCompletedJob && activeJobCount === 0
      ? t("Bulk run finished: {n, plural, one {# product} other {# products}} written", { n: recentlyCompletedJob.completedProducts })
      : draftCount > 0
        ? t("Waiting for you")
        : totalProducts === 0
          ? t("No products yet")
          : t("Nothing waiting"));

  // Grouped digits ("10,000"), and a count we do not have stays a dash — never "0".
  // A capped count keeps its "+" (Shopify's AT_LEAST precision): a floor is never shown as a total.
  const num = (v, exact = true) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : exact === false ? `${t.number(Number(v))}+` : t.number(Number(v)));
  const stats = [
    { id: "ready", icon: EditIcon, tone: "brand", label: t("Ready to review"), value: num(draftCount), hint: readyHint, url: "/app/review" },
    {
      id: "published",
      icon: CheckCircleIcon,
      tone: "success",
      label: t("Published"),
      value: num(generatedCount),
      hint: publishedSubtext({ ok: catalogueOk, inScope: generatedCount, candidateCount: candidateProducts, candidateLabel, record: recordPublished }, t),
      url: "/app/products?tab=published",
    },
    { id: "unwritten", icon: TextBlockIcon, tone: "caution", label: t("Not yet written"), value: num(notOptimizedCount, candidateExact), hint: t("Products we have not written for"), url: "/app/products?tab=needs_content" },
    {
      id: "catalogue",
      icon: ProductIcon,
      tone: "neutral",
      label: t("In your catalog"),
      value: num(totalProducts, totalExact),
      hint: !countsOk
        ? t("We could not read this from Shopify just now")
        : [candidateProducts === totalProducts ? null : t("{n} {label}", { n: num(candidateProducts, candidateExact), label: candidateLabel }), archivedProducts > 0 ? t("{n} archived not counted", { n: t.number(archivedProducts) }) : null].filter(Boolean).join(" · ") || t("Active products on your Online Store"),
    },
  ];

  return (
    <Page title={t("Home")} subtitle={subtitle} primaryAction={primaryAction} secondaryActions={secondaryActions}>
      <BlockStack gap="500">
        {/* Phase 3 item 3.4, surface (a) — the only notice on this screen, and
            only between 80% and 100% of the month's credits. */}
        <QuotaWarningBanner warning={quotaWarning} />

        {showGuide && (
          <SetupGuide
            steps={steps}
            onDismiss={() => dismissGuide.submit({ actionType: "dismissGeoNote" }, { method: "POST" })}
          />
        )}

        {/* The question, answered: the score with its scope on the left, what
            to fix first on the right. */}
        <Card>
          <InlineGrid columns={{ xs: "1fr", md: "minmax(240px, 1fr) 2fr" }} gap="600">
            <ScoreSummary score={storeScore} navigate={navigate} />
            <FixFirst groups={fixGroups} attention={attention} totalProducts={totalProducts} />
          </InlineGrid>
        </Card>

        {/* The category's metric cards: a tinted icon tile, the label, the
            figure and its scope, and the way to the list behind it. */}
        <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
          {stats.map((s) => (
            <MetricCard
              key={s.id}
              icon={s.icon}
              tone={s.tone}
              label={s.label}
              value={s.value}
              scope={s.hint}
              action={s.url ? <Button variant="plain" url={s.url} accessibilityLabel={t("Open {label}", { label: s.label })}>{t("View")}</Button> : null}
            />
          ))}
        </InlineGrid>

        <Layout>
          <Layout.Section>
            <Suspense fallback={<RecentActivitySkeleton />}>
              <Await resolve={belowFold} errorElement={<BelowFoldUnavailable />}>
                {({ recentActivity }) => (recentActivity.length > 0 ? <RecentActivityCard items={recentActivity} navigate={navigate} /> : <RecentActivityEmpty navigate={navigate} />)}
              </Await>
            </Suspense>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <CreditsCard plan={plan} usageCount={usageCount} remaining={remaining} usagePct={usagePct} planLabel={planLabel} />
              {/* P3.1 (Phase 8) — Proof: the latest crawl-time batch, both arms,
                  the interval — or the one sentence that says why there is none
                  yet. Rendered only when Bing measurement is on. */}
              {proof?.enabled && (
                <Card>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center" wrap>
                      <Text as="h2" variant="headingMd">
                        {t("Proof")}
                      </Text>
                      <Button variant="plain" onClick={() => navigate("/app/proof")}>
                        {t("See both arms")}
                      </Button>
                    </InlineStack>
                    {proofCardLines(proof, t).map((line) => (
                      <Text key={line} as="p" variant="bodySm">
                        {line}
                      </Text>
                    ))}
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
