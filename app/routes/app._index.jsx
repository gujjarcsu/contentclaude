import { useLoaderData, useNavigate, redirect } from "react-router";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Box, Badge, ProgressBar, Banner, Divider,
} from "@shopify/polaris";
import {
  Package, CheckCircle, Clock, Zap, TrendingUp,
  BarChart2, BookOpen, Search, ArrowRight, Sparkles,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreatePlan, getMonthlyUsageCount } from "../utils/plans.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const productCountResponse = await admin.graphql(`query { productsCount { count } }`);
  const productCountData = await productCountResponse.json();
  const totalProducts = productCountData.data.productsCount.count;

  const [contentStats, brandVoice, activeJobCount, plan, usageCount, recentActivity, blogStats] = await Promise.all([
    prisma.generatedContent.groupBy({
      by: ["status"],
      where: { shop },
      _count: { status: true },
    }),
    prisma.brandVoice.findUnique({ where: { shop } }),
    prisma.generationJob.count({
      where: { shop, status: { in: ["queued", "processing"] } },
    }),
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
    prisma.generatedContent.findMany({
      where: { shop, contentType: "description" },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { productId: true, productTitle: true, status: true, updatedAt: true },
    }),
    prisma.blogPost.groupBy({
      by: ["status"],
      where: { shop },
      _count: { status: true },
    }),
  ]);

  const generatedCount = contentStats.find((s) => s.status === "published")?._count.status ?? 0;
  const draftCount = contentStats.find((s) => s.status === "draft")?._count.status ?? 0;
  const blogsPublished = blogStats.find((s) => s.status === "published")?._count.status ?? 0;
  const blogsDraft = blogStats.find((s) => s.status === "draft")?._count.status ?? 0;
  const blogsTotal = blogsPublished + blogsDraft;

  const hasBrandVoice = !!(
    brandVoice &&
    (brandVoice.storeName?.trim() || brandVoice.targetAudience?.trim() || brandVoice.sampleContent?.trim())
  );
  const isNewShop = generatedCount === 0 && draftCount === 0;

  if (isNewShop && !brandVoice) {
    throw redirect("/app/setup");
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
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
    })),
    storeName,
    blogsTotal,
    blogsPublished,
    blogsDraft,
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
            <Icon size={20} color={iconColor} />
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
          <Button size="slim" variant="primary" onClick={onAction}>
            {actionLabel} <ArrowRight size={14} />
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
    blogsTotal, blogsPublished, blogsDraft,
  } = useLoaderData();
  const navigate = useNavigate();

  const usagePct = Math.min(100, Math.round((usageCount / plan.monthlyLimit) * 100));
  const remaining = Math.max(0, plan.monthlyLimit - usageCount);
  const planLabels = { free: "Free", starter: "Starter", growth: "Growth", pro: "Professional" };
  const isFreePlan = plan.planName === "free";

  const usageTone = usagePct >= 90 ? "critical" : usagePct >= 60 ? "highlight" : "success";
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
          <InlineStack align="space-between" blockAlign="center" wrap={false}>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <Sparkles size={22} color="#ffffff" />
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
                <Sparkles size={20} color="#2C6ECB" />
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
              label="AI Content Published" value={generatedCount}
              subtext="Live on your storefront" tone="success"
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
                <Zap size={18} color={usagePct >= 90 ? "#D82C0D" : usagePct >= 60 ? "#916A00" : "#1a7345"} />
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
                <Button size="slim" variant="primary" onClick={() => navigate("/app/plans")}>
                  Upgrade Plan →
                </Button>
              )}
            </InlineStack>

            {isFreePlan && (
              <Divider />
            )}
            {isFreePlan && (
              <InlineStack gap="200" blockAlign="center">
                <Zap size={14} color="#2C6ECB" />
                <Text as="p" variant="bodySm">
                  <strong>Starter plan</strong> gives you {50} generations/month for $9.99.{" "}
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
                  <TrendingUp size={18} color="#2C6ECB" />
                  <Text as="h2" variant="headingMd">Recent Activity</Text>
                </InlineStack>
                <Button variant="plain" onClick={() => navigate("/app/products")}>View all →</Button>
              </InlineStack>

              <BlockStack gap="200">
                {recentActivity.map((item) => {
                  const numId = item.productId.replace("gid://shopify/Product/", "");
                  return (
                    <Box key={item.productId} padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">{item.productTitle}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Description · {timeAgo(item.updatedAt)}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={item.status === "published" ? "success" : "info"}>
                            {item.status === "published" ? "Published" : "Draft"}
                          </Badge>
                          <Button size="slim" onClick={() => navigate(`/app/products/${numId}`)}>
                            View
                          </Button>
                        </InlineStack>
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
                  <Sparkles size={18} color="#6D7175" />
                  <Text as="h2" variant="headingLg">Optimise Your Entire Store</Text>
                </InlineStack>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Generate AI content for every product missing a description — one click, runs in the background.
                </Text>
              </BlockStack>
              <Button variant="primary" size="large" onClick={() => navigate("/app/optimize")}>
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
                    <Search size={18} color="#2C6ECB" />
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
                    <BarChart2 size={18} color="#2C6ECB" />
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
                    <BookOpen size={18} color="#2C6ECB" />
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

      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
