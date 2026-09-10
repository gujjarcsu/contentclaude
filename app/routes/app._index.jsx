import { Suspense, useState } from "react";
import { Await, useLoaderData, useNavigate, useFetcher, useRevalidator } from "react-router";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import { EmbedSetupCard, embedDeepLink } from "../components/EmbedSetupCard.jsx";
import { StartState } from "../components/StartState.jsx";
import { QuotaWarningBanner } from "../components/UpgradePrompt.jsx";
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
  Banner,
  Icon,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import {
  ProductIcon,
  CheckCircleIcon,
  ClockIcon,
  PlanIcon,
  ChartHistogramGrowthIcon,
  BlogIcon,
  SearchIcon,
  MagicIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import logger from "../utils/logger.server.js";
import { getOrCreatePlan, getMonthlyUsageCount } from "../utils/plans.server.js";
import { getCache } from "../utils/cache.server.js";
import { getContentMetrics, needsContentFrom } from "../utils/metrics.server.js";
import { scanStoreForStart, START_TARGETS } from "../utils/startState.server.js";
import { stampProductCountAtFirstLoad } from "../utils/firstValue.server.js";
import { getQuotaWarning } from "../utils/quotaSurfaces.server.js";

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
    .then(([recent, blogStats]) => {
      const blogsPublished = blogStats.find((s) => s.status === "published")?._count.status ?? 0;
      const blogsDraft = blogStats.find((s) => s.status === "draft")?._count.status ?? 0;
      return {
        recentActivity: recent.map((r) => ({
          productId: r.productId,
          productTitle: r.productTitle || "Product",
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
    totalProducts,
    metrics,
    brandVoice,
    activeJobCount,
    plan,
    usageCount,
    recentlyCompletedJob,
    growthState,
    shopRow,
  ] = await Promise.all([
    getCache(
      `productCount:${shop}`,
      async () => {
        const r = await admin.graphql(`query { productsCount { count } }`);
        const d = await r.json();
        return d.data.productsCount.count;
      },
      300,
    ),
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
    prisma.shop.findUnique({ where: { shop }, select: { firstDraftSeenAt: true } }).catch(() => null),
  ]);

  // Phase 2 item 2.1 - one definition of product state, shared with Products
  // and Optimize. These are mutually exclusive and, with needsContent, sum to
  // totalProducts, so Home can never report a different number from Products
  // for the same store.
  const generatedCount = metrics.publishedProducts;
  const draftCount = metrics.draftProducts;
  const needsContentCount = needsContentFrom(metrics, totalProducts);

  const hasBrandVoice = !!(
    brandVoice &&
    (brandVoice.storeName?.trim() || brandVoice.targetAudience?.trim() || brandVoice.sampleContent?.trim())
  );
  const isNewShop = generatedCount === 0 && draftCount === 0;

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

  // Context for the time-to-value report: how big was the catalogue when this
  // merchant first arrived? It explains an install that never reaches a draft.
  // First-writer-wins, never throws, not awaited — nothing renders from it.
  if (isFirstRun) void stampProductCountAtFirstLoad(shop, totalProducts);

  // The scan is the slow part (an Admin GraphQL page plus scoring), so it is
  // streamed exactly like the below-fold queries: the Start shell and the
  // quota line paint immediately and the score reveal arrives behind a
  // skeleton. Resolved, never rejected — scanStoreForStart returns
  // { error: true } rather than throwing, so the card can offer a retry.
  // Phase 3 item 3.4 — the ONE upsell Home carries, and only between 80% and
  // 100% used. Null when the shop is below the threshold, already out (that is
  // the card's job, on the screens where the action lives), or dismissed it in
  // the last 7 days. Never throws.
  const quotaWarning = await getQuotaWarning({
    shop,
    plan,
    usageCount,
    surface: "dashboard",
  });

  const start = isFirstRun
    ? {
        targetCount: START_TARGETS,
        remaining: Math.max(0, plan.monthlyLimit - usageCount),
        monthlyLimit: plan.monthlyLimit,
        // The Start copy says "free generations" only on the free plan; a
        // merchant paying for Pro must not be told their allowance is free.
        planName: plan.planName,
        scan: scanStoreForStart(admin, shop),
      }
    : null;

  const storeName = brandVoice?.storeName || shop.split(".")[0];

  const payload = {
    shopDomain: shop,
    embedConfirmed: !!growthState?.embedConfirmedAt,
    totalProducts,
    generatedCount,
    draftCount,
    needsContentCount,
    geoNoteDismissed: !!growthState?.geoNoteDismissedAt,
    activeJobCount,
    hasBrandVoice,
    isNewShop,
    start,
    quotaWarning,
    plan: { planName: plan.planName, monthlyLimit: plan.monthlyLimit },
    usageCount,
    storeName,
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

function StatCard({ icon: iconSource, iconTone, label, value, subtext, tone }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              {label}
            </Text>
            <Text as="p" variant="heading2xl" fontWeight="bold" tone={tone}>
              {value}
            </Text>
          </BlockStack>
          <Box padding="200" background="bg-surface-secondary" borderRadius="200">
            <Icon source={iconSource} tone={iconTone} />
          </Box>
        </InlineStack>
        <Text as="p" variant="bodySm" tone="subdued">
          {subtext}
        </Text>
      </BlockStack>
    </Card>
  );
}

function OnboardingStep({ number, title, description, done, actionLabel, onAction }) {
  return (
    <Box
      padding="400"
      background={done ? "bg-surface-success-subdued" : "bg-surface-secondary"}
      borderRadius="200"
    >
      <InlineStack align="space-between" blockAlign="center" gap="400">
        <InlineStack gap="300" blockAlign="center">
          <Box
            padding="150"
            background={done ? "bg-fill-success" : "bg-fill-brand"}
            borderRadius="full"
            minWidth="32px"
          >
            <Text
              as="p"
              variant="bodySm"
              fontWeight="bold"
              alignment="center"
              tone={done ? "success" : undefined}
            >
              {done ? "✓" : number}
            </Text>
          </Box>
          <BlockStack gap="050">
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              {title}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {description}
            </Text>
          </BlockStack>
        </InlineStack>
        {done ? (
          <Badge tone="success">Done</Badge>
        ) : (
          <Button size="slim" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </InlineStack>
    </Box>
  );
}

/** Placeholder the size of the Recent Activity card, while it streams in. */
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

function RecentActivityCard({ items, navigate }) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={ChartHistogramGrowthIcon} tone="info" />
            <Text as="h2" variant="headingMd">
              Recent Activity
            </Text>
          </InlineStack>
        </InlineStack>

        <BlockStack gap="200">
          {items.map((item) => {
            // Activity rows can be products OR collections (they share the
            // GeneratedContent table). A Collection GID sent to the product
            // route 404s — route by GID type instead.
            const isProduct = item.productId.startsWith("gid://shopify/Product/");
            const target = isProduct
              ? `/app/products/${item.productId.replace("gid://shopify/Product/", "")}`
              : "/app/collections";
            const typeLabel =
              item.contentTypesCount > 1 ? `${item.contentTypesCount} content types` : "1 content type";
            return (
              <Box key={item.productId} padding="300" background="bg-surface-secondary" borderRadius="200">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {item.productTitle}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isProduct ? typeLabel : `Collection · ${typeLabel}`} · {timeAgo(item.updatedAt)}
                    </Text>
                  </BlockStack>
                  <Button size="slim" onClick={() => navigate(target)}>
                    View
                  </Button>
                </InlineStack>
              </Box>
            );
          })}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function timeAgo(isoString) {
  const secs = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
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
  const {
    totalProducts,
    generatedCount,
    draftCount,
    needsContentCount,
    activeJobCount,
    hasBrandVoice,
    isNewShop,
    start,
    quotaWarning,
    plan,
    usageCount,
    storeName,
    recentlyCompletedJob,
    shopDomain,
    embedConfirmed,
    geoNoteDismissed,
    belowFold,
  } = useLoaderData();
  const navigate = useNavigate();
  const dismissGeoNote = useFetcher();
  // Banner dismissal must actually stick — keyed per job completion so a NEW
  // completed job shows a fresh banner but a dismissed one stays dismissed.
  const [jobBannerDismissed, setJobBannerDismissed] = useState(() => {
    if (typeof window === "undefined" || !recentlyCompletedJob) return false;
    try {
      return sessionStorage.getItem(`navaal:jobBanner:${recentlyCompletedJob.completedAt}`) === "1";
    } catch {
      return false;
    }
  });

  const revalidator = useRevalidator();
  const loadingThisRoute = useRouteLoading();
  if (loadingThisRoute) {
    return <AppSkeleton title="Dashboard" sections={3} layout="full" />;
  }

  // Phase 3 items 3.1/3.2 — the first run IS Home. While this shop has never
  // seen a draft, /app renders the Start state instead of the dashboard: same
  // route, same embedded chain, no redirect.
  if (start) {
    return <StartState start={start} navigate={navigate} onRetry={() => revalidator.revalidate()} />;
  }

  const usagePct = Math.min(100, Math.round((usageCount / plan.monthlyLimit) * 100));
  const remaining = Math.max(0, plan.monthlyLimit - usageCount);
  const planLabels = { free: "Free", starter: "Starter", growth: "Growth", pro: "Professional" };

  // Reaching the monthly quota is "complete", not an error — so the high-usage
  // state is amber/neutral, never alarming red (usagePct is capped at 100).
  const usageTone = usagePct >= 90 ? "highlight" : "success";
  const usageBg = usagePct >= 60 ? "bg-surface-warning-subdued" : "bg-surface-success-subdued";

  // Hero message
  let heroSubtitle;
  if (isNewShop) {
    heroSubtitle = "Let's generate your first product description — it takes under 30 seconds.";
  } else {
    // Phase 2 item 2.9 - the hero used to turn into an upsell whenever quota
    // ran low ("Only 2 generations left - upgrade to keep momentum going").
    // Quota is stated once, plainly, in the usage card. The hero says what the
    // merchant has actually done.
    heroSubtitle = `${generatedCount} product${generatedCount !== 1 ? "s" : ""} optimized · ${draftCount} draft${draftCount !== 1 ? "s" : ""} awaiting review`;
  }

  /* Phase 2 item 2.7 — ONE primary action, chosen by what the merchant should
     do next.

     Home rendered six primary buttons at once for a new merchant: four in the
     onboarding checklist, one in the embed setup card, one in the usage card —
     and two of them ("Open theme editor") were the same action, from two
     different components, on the same screen. The two buttons that were the
     real primaries, "Generate content" and "Optimize store", were the ones
     HIDDEN from new shops.

     The order below is what actually helps: content waiting for a person beats
     content that does not exist yet, which beats a diagnostic. Everything else
     on the page is now secondary or plain. */
  const primaryAction =
    draftCount > 0
      ? {
          content: `Review ${draftCount} draft${draftCount === 1 ? "" : "s"}`,
          onAction: () => navigate("/app/review"),
        }
      : needsContentCount > 0
        ? {
            content: `Optimize ${needsContentCount} product${needsContentCount === 1 ? "" : "s"}`,
            onAction: () => navigate("/app/optimize"),
          }
        : { content: "Run audit", onAction: () => navigate("/app/seo-audit") };

  // Never a disabled primary: when there is nothing to review and nothing to
  // generate, the primary becomes the audit and this becomes the second option.
  const secondaryActions =
    draftCount === 0 && needsContentCount === 0
      ? [{ content: "Write a blog post", onAction: () => navigate("/app/blog") }]
      : undefined;

  return (
    <Page primaryAction={primaryAction} secondaryActions={secondaryActions}>
      <BlockStack gap="600">
        {/* Phase 3 item 3.4, surface (a) — the only upsell on this screen. */}
        <QuotaWarningBanner warning={quotaWarning} />

        {/* ── Job completion banner ──────────────────────────────────────── */}
        {recentlyCompletedJob && activeJobCount === 0 && !jobBannerDismissed && (
          <Banner
            tone="success"
            title={`Bulk job complete — ${recentlyCompletedJob.completedProducts} product${recentlyCompletedJob.completedProducts !== 1 ? "s" : ""} generated`}
            action={{ content: "Review drafts", onAction: () => navigate("/app/review") }}
            onDismiss={() => {
              setJobBannerDismissed(true);
              try {
                sessionStorage.setItem(`navaal:jobBanner:${recentlyCompletedJob.completedAt}`, "1");
              } catch {
                /* storage unavailable — dismiss still works for this view */
              }
            }}
          >
            <p>Your AI content is ready to review. Check drafts, make edits, and publish with one click.</p>
          </Banner>
        )}

        {/* ── Active jobs banner ─────────────────────────────────────────── */}
        {activeJobCount > 0 && (
          <Banner
            tone="info"
            title={`${activeJobCount} bulk job${activeJobCount > 1 ? "s" : ""} generating in the background`}
            action={{ content: "View progress", onAction: () => navigate("/app/jobs") }}
          >
            <p>You can navigate freely — generation continues without this tab open.</p>
          </Banner>
        )}

        {/* ── Hero Section ──────────────────────────────────────────────── */}
        <Box padding="600" background="bg-fill-brand" borderRadius="300">
          {/* wrap allowed on mobile so button drops below the heading on narrow screens */}
          <InlineStack align="space-between" blockAlign="center" gap="400">
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <span style={{ color: "#ffffff", display: "inline-flex" }}>
                  <Icon source={MagicIcon} tone="inherit" />
                </span>
                <Text as="h1" variant="headingXl" fontWeight="bold">
                  <span style={{ color: "#ffffff" }}>Welcome back, {storeName}!</span>
                </Text>
              </InlineStack>
              <Text as="p" variant="bodyMd">
                <span style={{ color: "rgba(255,255,255,0.85)" }}>{heroSubtitle}</span>
              </Text>
            </BlockStack>
          </InlineStack>
        </Box>

        {/* Phase 2 item 2.4 - ONE explainer, on Home only.
            A merchant who has already installed was told what the app does
            three times on this screen: a dark gradient hero, the onboarding
            checklist, and a 'How Navaal works' card. The same gradient strip
            also rendered on five other routes, twice on Results alone.

            Two lines, a link, and a dismiss that sticks. */}
        {!geoNoteDismissed && (
          <Banner
            tone="info"
            title="Written for Google and for AI search"
            onDismiss={() => dismissGeoNote.submit({ actionType: "dismissGeoNote" }, { method: "POST" })}
          >
            <Text as="p" variant="bodyMd">
              Your product content is written to rank in search and to be quoted by AI assistants, with FAQ
              content published as real page copy.
            </Text>
          </Banner>
        )}

        {/* ── Theme embed setup (5.1.3) — persistent until confirmed done ── */}
        <EmbedSetupCard shopDomain={shopDomain} confirmed={embedConfirmed} />

        {/* ── Onboarding checklist ───────────────────────────────────────── */}
        {isNewShop && (
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                <Icon source={MagicIcon} tone="info" />
                <Text as="h2" variant="headingLg">
                  Get started in 4 steps
                </Text>
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                Complete these steps to generate content that converts.
              </Text>
              <BlockStack gap="200">
                <OnboardingStep
                  number="1"
                  title="Configure your brand voice"
                  description="Set your tone, audience, and differentiators so AI writes in your exact voice."
                  done={hasBrandVoice}
                  actionLabel="Set up now"
                  onAction={() => navigate("/app/settings")}
                />
                <OnboardingStep
                  number="2"
                  title="Generate your first product description"
                  description="Pick any product and get an AI description, meta title, and FAQ in under 30 seconds."
                  done={generatedCount + draftCount > 0}
                  actionLabel="Choose a product"
                  onAction={() => navigate("/app/products")}
                />
                <OnboardingStep
                  number="3"
                  title="Review and publish"
                  description="Read the draft, make edits, and publish with one click to your Shopify store."
                  done={generatedCount > 0}
                  actionLabel="View products"
                  onAction={() => navigate("/app/products")}
                />
                <OnboardingStep
                  number="4"
                  title="Enable the AI-search FAQ schema in your theme"
                  description="One-time toggle in the theme editor — required for your FAQ content to reach the storefront and be readable by ChatGPT and Perplexity."
                  done={embedConfirmed}
                  actionLabel="Open theme editor"
                  onAction={() => window.open(embedDeepLink(shopDomain), "_top")}
                />
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* ── Stats Grid ───────────────────────────────────────────────── */}
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard
              icon={ProductIcon}
              iconTone="subdued"
              label="Total Products"
              value={totalProducts}
              subtext="In your Shopify catalog"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              icon={CheckCircleIcon}
              iconTone="success"
              label="Live on your storefront"
              value={generatedCount}
              subtext="Products with published AI content"
              tone="success"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              icon={ClockIcon}
              iconTone="caution"
              label="Drafts Pending Review"
              value={draftCount}
              subtext={
                draftCount > 0
                  ? "Ready to publish"
                  : totalProducts === 0
                    ? "No products yet"
                    : "Nothing waiting"
              }
            />
          </Layout.Section>
        </Layout>

        {/* ── Usage Card ────────────────────────────────────────────────── */}
        <Box padding="400" background={usageBg} borderRadius="200">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Icon source={PlanIcon} tone={usagePct >= 60 ? "caution" : "success"} />
                <Text as="h2" variant="headingMd">
                  Monthly Usage
                </Text>
                <Badge tone={plan.planName === "free" ? "attention" : "success"}>
                  {planLabels[plan.planName] ?? plan.planName} Plan
                </Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone={usagePct >= 90 ? "caution" : "subdued"}>
                {usageCount} / {plan.monthlyLimit} used · {remaining} remaining
              </Text>
            </InlineStack>

            <ProgressBar progress={usagePct} tone={usageTone} size="medium" />

            {/* Phase 3 item 3.4 — a readout, not an upsell. This card and the
                Home hero were two of the six surfaces a quota-hit merchant met.
                It still says exactly where they stand, and the single upgrade
                path is the banner above, which appears once and can be
                dismissed for a week. */}
            <Text as="p" variant="bodySm" tone="subdued">
              {remaining === 0
                ? `You've used all ${plan.monthlyLimit} generations for this month. They reset on the 1st.`
                : `${remaining} of ${plan.monthlyLimit} left this month.`}
            </Text>
          </BlockStack>
        </Box>

        {/* ── Recent Activity ─────────────────────────────────────────────
            Streamed: it is below the usage card, and its groupBy used to hold
            the whole first paint. An empty list renders nothing, so the error
            path (which resolves to []) simply hides the card. */}
        <Suspense fallback={<RecentActivitySkeleton />}>
          <Await resolve={belowFold} errorElement={<BelowFoldUnavailable />}>
            {({ recentActivity }) =>
              recentActivity.length > 0 && <RecentActivityCard items={recentActivity} navigate={navigate} />
            }
          </Await>
        </Suspense>

        {/* Optimize CTA ─────────────────────────────────────────────── */}
        {!isNewShop && (
          <Box padding="500" background="bg-surface-secondary" borderRadius="300">
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={MagicIcon} tone="subdued" />
                  <Text as="h2" variant="headingLg">
                    Optimize your store
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Generate AI content for every product missing a description — one click, runs in the
                  background.
                </Text>
              </BlockStack>
              <Button onClick={() => navigate("/app/optimize")}>Optimize store</Button>
            </InlineStack>
          </Box>
        )}

        {/* Tools row. Phase 2 item 2.2 - SEO Audit, Results and Analytics
            left the sidebar, so this row is now the ONLY way to reach them.
            It used to be hidden from new shops (`!isNewShop`), which made
            three features undiscoverable at exactly the moment somebody is
            exploring the app. Always shown. */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={SearchIcon} tone="info" />
                  <Text as="h2" variant="headingMd">
                    SEO Audit
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Scan your entire catalog for missing descriptions, meta tags, and alt text.
                </Text>
                <Button onClick={() => navigate("/app/seo-audit")}>Run audit</Button>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={BlogIcon} tone="info" />
                  <Text as="h2" variant="headingMd">
                    Blog
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Write SEO-optimized blog posts in your brand voice in under 60 seconds.
                </Text>
                {/* Same streamed promise as Recent Activity. "Write a post" is
                    there from the first paint; only the counts wait. */}
                <Suspense fallback={<SkeletonBodyText lines={1} />}>
                  <Await resolve={belowFold} errorElement={<BelowFoldUnavailable />}>
                    {({ blogsTotal, blogsPublished, blogsDraft }) =>
                      blogsTotal > 0 && (
                        <InlineStack gap="200">
                          <Badge tone="success">{blogsPublished} published</Badge>
                          {blogsDraft > 0 && <Badge tone="info">{blogsDraft} draft</Badge>}
                        </InlineStack>
                      )
                    }
                  </Await>
                </Suspense>
                <InlineStack gap="200">
                  <Button onClick={() => navigate("/app/blog")}>Write a post</Button>
                  <Suspense fallback={<SkeletonBodyText lines={1} />}>
                    <Await resolve={belowFold} errorElement={<BelowFoldUnavailable />}>
                      {({ blogsTotal }) =>
                        blogsTotal > 0 && (
                          <Button variant="plain" onClick={() => navigate("/app/blog/posts")}>
                            View all ({blogsTotal})
                          </Button>
                        )
                      }
                    </Await>
                  </Suspense>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
