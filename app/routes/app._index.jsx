import { useState } from "react";
import { useLoaderData, useNavigate, redirect, useNavigation } from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Box, Badge, ProgressBar, Banner, Divider, Collapsible,
} from "@shopify/polaris";
import {
  Package, CheckCircle, Clock, Zap, TrendingUp,
  BarChart2, BookOpen, Search, ArrowRight, Sparkles,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreatePlan, getMonthlyUsageCount } from "../utils/plans.server";
import { getCache } from "../utils/cache.server";
import { getContentMetrics } from "../utils/metrics.server";
import { BILLING_PLANS } from "../utils/billing-plans.js";
import { isFeatureEnabled } from "../utils/featureFlags.server.js";

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

  // All dashboard data fetched in ONE parallel batch. The product count (an
  // Admin GraphQL call, cached 5 min) used to be awaited sequentially *before*
  // the DB queries, serializing a network round-trip ahead of everything else;
  // folding it into Promise.all makes total latency ≈ the single slowest call.
  const [totalProducts, metrics, brandVoice, activeJobCount, plan, usageCount, recentActivity, blogStats, recentlyCompletedJob] = await Promise.all([
    getCache(
      `productCount:${shop}`,
      async () => {
        const r = await admin.graphql(`query { productsCount { count } }`);
        const d = await r.json();
        return d.data.productsCount.count;
      },
      300
    ),
    getContentMetrics(shop),
    prisma.brandVoice.findUnique({ where: { shop } }),
    prisma.generationJob.count({
      where: { shop, status: { in: ["queued", "processing"] } },
    }),
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
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
  ]);

  // Use distinct-product counts so coverage can never exceed 100%
  const generatedCount = metrics.publishedProducts;
  const draftCount = metrics.draftProducts;
  const blogsPublished = blogStats.find((s) => s.status === "published")?._count.status ?? 0;
  const blogsDraft = blogStats.find((s) => s.status === "draft")?._count.status ?? 0;
  const blogsTotal = blogsPublished + blogsDraft;

  const hasBrandVoice = !!(
    brandVoice &&
    (brandVoice.storeName?.trim() || brandVoice.targetAudience?.trim() || brandVoice.sampleContent?.trim())
  );
  const isNewShop = generatedCount === 0 && draftCount === 0;

  // Phase 1 magic moment (flag-gated, dev-only for now): new shops land on the
  // auto-scan + live before→after first-run experience. Falls back to the
  // existing setup wizard when the flag is off.
  if (isNewShop && isFeatureEnabled("magicMoment")) {
    throw redirect(`/app/welcome?${authParams.toString()}`);
  }
  if (isNewShop && !brandVoice) {
    throw redirect(`/app/setup?${authParams.toString()}`);
  }

  const storeName = brandVoice?.storeName || shop.split(".")[0];

  return Response.json({
    totalProducts,
    generatedCount,
    draftCount,
    activeJobCount,
    hasBrandVoice,
    isNewShop,
    plan: { planName: plan.planName, monthlyLimit: plan.monthlyLimit },
    usageCount,
    recentActivity: recentActivity.map((r) => ({
      productId: r.productId,
      productTitle: r.productTitle || "Product",
      contentTypesCount: r._count.contentType,
      updatedAt: r._max.updatedAt.toISOString(),
    })),
    storeName,
    blogsTotal,
    blogsPublished,
    blogsDraft,
    recentlyCompletedJob: recentlyCompletedJob
      ? {
          completedProducts: recentlyCompletedJob.completedProducts,
          completedAt: recentlyCompletedJob.completedAt.toISOString(),
        }
      : null,
  });
};

function StatCard({ icon: Icon, iconColor, label, value, subtext, tone }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
            <Text as="p" variant="heading2xl" fontWeight="bold" tone={tone}>{value}</Text>
          </BlockStack>
          <Box padding="200" background="bg-surface-secondary" borderRadius="200">
            <Icon size={20} color={iconColor} aria-hidden="true" />
          </Box>
        </InlineStack>
        <Text as="p" variant="bodySm" tone="subdued">{subtext}</Text>
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
            <Text as="p" variant="bodySm" fontWeight="bold" alignment="center" tone={done ? "success" : undefined}>
              {done ? "✓" : number}
            </Text>
          </Box>
          <BlockStack gap="050">
            <Text as="p" variant="bodyMd" fontWeight="semibold">{title}</Text>
            <Text as="p" variant="bodySm" tone="subdued">{description}</Text>
          </BlockStack>
        </InlineStack>
        {done ? (
          <Badge tone="success">Done</Badge>
        ) : (
          <Button size="slim" variant="primary" tone="success" onClick={onAction}>
            {actionLabel} <ArrowRight aria-hidden="true" size={14} />
          </Button>
        )}
      </InlineStack>
    </Box>
  );
}

function timeAgo(isoString) {
  const secs = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function Dashboard() {
  const {
    totalProducts, generatedCount, draftCount, activeJobCount,
    hasBrandVoice, isNewShop, plan, usageCount, recentActivity, storeName,
    blogsTotal, blogsPublished, blogsDraft, recentlyCompletedJob,
  } = useLoaderData();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  const navigation = useNavigation();
  if (navigation.state === "loading") {
    return <AppSkeleton title="Dashboard" sections={3} layout="full" />;
  }

  const usagePct = Math.min(100, Math.round((usageCount / plan.monthlyLimit) * 100));
  const remaining = Math.max(0, plan.monthlyLimit - usageCount);
  const planLabels = { free: "Free", starter: "Starter", growth: "Growth", pro: "Professional" };
  const isFreePlan = plan.planName === "free";

  const usageTone = usagePct >= 90 ? "critical" : "success";
  const usageBg = usagePct >= 90 ? "bg-surface-critical-subdued" : usagePct >= 60 ? "bg-surface-warning-subdued" : "bg-surface-success-subdued";

  // Hero message
  let heroSubtitle;
  if (isNewShop) {
    heroSubtitle = "Let's generate your first product description — it takes under 30 seconds.";
  } else if (remaining <= 3) {
    heroSubtitle = `Only ${remaining} generation${remaining !== 1 ? "s" : ""} left this month — upgrade to keep momentum going.`;
  } else {
    heroSubtitle = `${generatedCount} product${generatedCount !== 1 ? "s" : ""} optimised · ${draftCount} draft${draftCount !== 1 ? "s" : ""} awaiting review`;
  }

  return (
    <Page>
      <BlockStack gap="600">

        {/* ── Job completion banner ──────────────────────────────────────── */}
        {recentlyCompletedJob && activeJobCount === 0 && (
          <Banner
            tone="success"
            title={`Bulk job complete — ${recentlyCompletedJob.completedProducts} product${recentlyCompletedJob.completedProducts !== 1 ? "s" : ""} generated`}
            action={{ content: "Review & Publish →", onAction: () => navigate("/app/review") }}
            onDismiss={() => {}}
          >
            <p>Your AI content is ready to review. Check drafts, make edits, and publish with one click.</p>
          </Banner>
        )}

        {/* ── Active jobs banner ─────────────────────────────────────────── */}
        {activeJobCount > 0 && (
          <Banner
            tone="info"
            title={`${activeJobCount} bulk job${activeJobCount > 1 ? "s" : ""} generating in the background`}
            action={{ content: "View progress →", onAction: () => navigate("/app/jobs") }}
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
                <Sparkles aria-hidden="true" size={22} color="#ffffff" />
                <Text as="h1" variant="headingXl" fontWeight="bold">
                  <span style={{ color: "#ffffff" }}>Welcome back, {storeName}!</span>
                </Text>
              </InlineStack>
              <Text as="p" variant="bodyMd">
                <span style={{ color: "rgba(255,255,255,0.85)" }}>{heroSubtitle}</span>
              </Text>
            </BlockStack>
            {!isNewShop && (
              <Button
                variant="primary"
                tone="success"
                size="large"
                onClick={() => navigate("/app/products")}
              >
                Generate Content →
              </Button>
            )}
          </InlineStack>
        </Box>

        {/* ── Onboarding checklist ───────────────────────────────────────── */}
        {isNewShop && (
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                <Sparkles aria-hidden="true" size={20} color="#2C6ECB" />
                <Text as="h2" variant="headingLg">Get started in 3 steps</Text>
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                Complete these steps to generate content that converts.
              </Text>
              <BlockStack gap="200">
                <OnboardingStep
                  number="1" title="Configure your brand voice"
                  description="Set your tone, audience, and differentiators so AI writes in your exact voice."
                  done={hasBrandVoice} actionLabel="Set up now"
                  onAction={() => navigate("/app/settings")}
                />
                <OnboardingStep
                  number="2" title="Generate your first product description"
                  description="Pick any product and get an AI description, meta title, and FAQ in under 30 seconds."
                  done={false} actionLabel="Choose a product"
                  onAction={() => navigate("/app/products")}
                />
                <OnboardingStep
                  number="3" title="Review and publish"
                  description="Read the draft, make edits, and publish with one click to your Shopify store."
                  done={false} actionLabel="View products"
                  onAction={() => navigate("/app/products")}
                />
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* ── Stats Grid ───────────────────────────────────────────────── */}
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard
              icon={Package} iconColor="#6D7175"
              label="Total Products" value={totalProducts}
              subtext="In your Shopify catalog"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              icon={CheckCircle} iconColor="#1a7345"
              label="Products Optimised" value={generatedCount}
              subtext="Products with published AI content" tone="success"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              icon={Clock} iconColor="#B98900"
              label="Drafts Pending Review" value={draftCount}
              subtext={draftCount > 0 ? "Ready to publish →" : "All caught up!"}
            />
          </Layout.Section>
        </Layout>

        {/* ── Usage Card ────────────────────────────────────────────────── */}
        <Box padding="400" background={usageBg} borderRadius="200">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Zap aria-hidden="true" size={18} color={usagePct >= 90 ? "#D82C0D" : usagePct >= 60 ? "#916A00" : "#1a7345"} />
                <Text as="h2" variant="headingMd">Monthly Usage</Text>
                <Badge tone={plan.planName === "free" ? "attention" : "success"}>
                  {planLabels[plan.planName] ?? plan.planName} Plan
                </Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone={usagePct >= 90 ? "critical" : "subdued"}>
                {usageCount} / {plan.monthlyLimit} used · {remaining} remaining
              </Text>
            </InlineStack>

            <ProgressBar progress={usagePct} tone={usageTone} size="medium" />

            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm" tone="subdued">
                {usagePct >= 90
                  ? "⚠️ Almost at your limit — upgrade to keep generating without interruption."
                  : usagePct >= 60
                  ? "You're more than halfway through your monthly quota."
                  : "You're in good shape for this month."}
              </Text>
              {isFreePlan && (
                <Button size="slim" variant="primary" tone="success" onClick={() => navigate("/app/plans")}>
                  Upgrade Plan →
                </Button>
              )}
            </InlineStack>

            {isFreePlan && (
              <Divider />
            )}
            {isFreePlan && (
              <InlineStack gap="200" blockAlign="center">
                <Zap aria-hidden="true" size={14} color="#2C6ECB" />
                <Text as="p" variant="bodySm">
                  <strong>Starter plan</strong> gives you {BILLING_PLANS.starter.monthlyLimit} generations/month for ${BILLING_PLANS.starter.amount}.{" "}
                  <Button variant="plain" onClick={() => navigate("/app/plans")}>View all plans →</Button>
                </Text>
              </InlineStack>
            )}
          </BlockStack>
        </Box>

        {/* ── Recent Activity ───────────────────────────────────────────── */}
        {recentActivity.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <TrendingUp aria-hidden="true" size={18} color="#2C6ECB" />
                  <Text as="h2" variant="headingMd">Recent Activity</Text>
                </InlineStack>
                <Button variant="plain" onClick={() => navigate("/app/analytics")}>View all activity →</Button>
              </InlineStack>

              <BlockStack gap="200">
                {recentActivity.map((item) => {
                  const numId = item.productId.replace("gid://shopify/Product/", "");
                  const typeLabel = item.contentTypesCount > 1 ? `${item.contentTypesCount} content types` : "1 content type";
                  return (
                    <Box key={item.productId} padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">{item.productTitle}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {typeLabel} · {timeAgo(item.updatedAt)}
                          </Text>
                        </BlockStack>
                        <Button size="slim" onClick={() => navigate(`/app/products/${numId}`)}>
                          View
                        </Button>
                      </InlineStack>
                    </Box>
                  );
                })}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* ── Optimise CTA ─────────────────────────────────────────────── */}
        {!isNewShop && (
          <Box padding="500" background="bg-surface-secondary" borderRadius="300">
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Sparkles aria-hidden="true" size={18} color="#6D7175" />
                  <Text as="h2" variant="headingLg">Optimise Your Entire Store</Text>
                </InlineStack>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Generate AI content for every product missing a description — one click, runs in the background.
                </Text>
              </BlockStack>
              <Button variant="primary" size="large" tone="success" onClick={() => navigate("/app/optimize")}>
                Optimise Store →
              </Button>
            </InlineStack>
          </Box>
        )}

        {/* ── Tools Row ────────────────────────────────────────────────── */}
        {!isNewShop && (
          <Layout>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Search aria-hidden="true" size={18} color="#2C6ECB" />
                    <Text as="h2" variant="headingMd">SEO Audit</Text>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Scan your entire catalog for missing descriptions, meta tags, and alt text.
                  </Text>
                  <Button onClick={() => navigate("/app/seo-audit")}>Run Audit →</Button>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <BarChart2 aria-hidden="true" size={18} color="#2C6ECB" />
                    <Text as="h2" variant="headingMd">Analytics</Text>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Track generation activity and usage trends month by month.
                  </Text>
                  <Button onClick={() => navigate("/app/analytics")}>View Analytics →</Button>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <BookOpen aria-hidden="true" size={18} color="#2C6ECB" />
                    <Text as="h2" variant="headingMd">Blog Generator</Text>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Write SEO-optimised blog posts in your brand voice in under 60 seconds.
                  </Text>
                  {blogsTotal > 0 && (
                    <InlineStack gap="200">
                      <Badge tone="success">{blogsPublished} published</Badge>
                      {blogsDraft > 0 && <Badge tone="info">{blogsDraft} draft</Badge>}
                    </InlineStack>
                  )}
                  <InlineStack gap="200">
                    <Button onClick={() => navigate("/app/blog")}>Write a Post →</Button>
                    {blogsTotal > 0 && (
                      <Button variant="plain" onClick={() => navigate("/app/blog/posts")}>
                        View all ({blogsTotal})
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* How ContentClaude works — value-communication + guidance (clean, collapsible) */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Sparkles aria-hidden="true" size={18} color="#2C6ECB" />
                <Text as="h2" variant="headingMd">How ContentClaude works</Text>
              </InlineStack>
              <Button variant="plain" disclosure={helpOpen ? "up" : "down"} onClick={() => setHelpOpen((v) => !v)}>
                {helpOpen ? "Hide" : "Learn how"}
              </Button>
            </InlineStack>
            <Text as="p" variant="bodyMd" tone="subdued">
              ContentClaude writes your product content to win two kinds of search at once:{" "}
              <strong>traditional SEO</strong> (ranking in Google &amp; Bing) and{" "}
              <strong>GEO / AI-search</strong> — being cited by AI answer engines like ChatGPT,
              Perplexity, Gemini, and Google&apos;s AI Overviews.
            </Text>
            <Collapsible open={helpOpen} id="how-it-works" transition={{ duration: "150ms" }}>
              <BlockStack gap="400">
                <Divider />
                <BlockStack gap="150">
                  <Text as="h3" variant="headingSm">How your content is made</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Premium AI writes in your brand voice (set it in Settings), using an answer-first
                    structure and adding structured data — Product &amp; FAQ schema (JSON-LD) — that
                    search crawlers and AI engines read to understand and quote your products.
                  </Text>
                </BlockStack>
                <BlockStack gap="150">
                  <Text as="h3" variant="headingSm">The three scores, explained</Text>
                  <Text as="p" variant="bodySm" tone="subdued"><strong>GEO / AI-search score</strong> — how ready a product is to be cited by AI answer engines.</Text>
                  <Text as="p" variant="bodySm" tone="subdued"><strong>Traditional SEO score</strong> — how well it&apos;s set up to rank in classic search results.</Text>
                  <Text as="p" variant="bodySm" tone="subdued"><strong>Content quality</strong> — how complete and well-written a specific draft is before you publish.</Text>
                </BlockStack>
                <BlockStack gap="150">
                  <Text as="h3" variant="headingSm">Get results in 3 steps</Text>
                  <Text as="p" variant="bodySm" tone="subdued">1. Set your brand voice in Settings so content sounds like you.</Text>
                  <Text as="p" variant="bodySm" tone="subdued">2. Generate content, then review the draft and its GEO lift.</Text>
                  <Text as="p" variant="bodySm" tone="subdued">3. Publish — your content goes live and AI-search FAQ schema is attached to the product.</Text>
                </BlockStack>
              </BlockStack>
            </Collapsible>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
