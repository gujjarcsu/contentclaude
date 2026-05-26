import { useLoaderData, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Button,
  Box,
  Badge,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreatePlan, getMonthlyUsageCount } from "../utils/plans.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const productCountResponse = await admin.graphql(`
    query { productsCount { count } }
  `);
  const productCountData = await productCountResponse.json();
  const totalProducts = productCountData.data.productsCount.count;

  const [contentStats, brandVoice, activeJobCount, plan, usageCount] = await Promise.all([
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
  ]);

  const generatedCount = contentStats.find((s) => s.status === "published")?._count.status ?? 0;
  const draftCount = contentStats.find((s) => s.status === "draft")?._count.status ?? 0;

  // A brand voice is "configured" when the merchant has saved meaningful content —
  // not just the default tone value. Checking storeName OR targetAudience ensures
  // merchants who kept "professional" tone but filled other fields are marked done.
  const hasBrandVoice = !!(
    brandVoice &&
    (brandVoice.storeName?.trim() ||
      brandVoice.targetAudience?.trim() ||
      brandVoice.sampleContent?.trim())
  );
  // hasApiKey is a server config check only — not sent to the client
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const isNewShop = generatedCount === 0 && draftCount === 0;

  return Response.json({
    totalProducts,
    generatedCount,
    draftCount,
    activeJobCount,
    hasBrandVoice,
    hasApiKey,
    isNewShop,
    plan: { planName: plan.planName, monthlyLimit: plan.monthlyLimit },
    usageCount,
  });
};

// Onboarding step: shows a numbered step with a done/todo badge and CTA
function OnboardingStep({ number, title, description, done, actionLabel, onAction }) {
  return (
    <InlineStack align="space-between" blockAlign="start" gap="400">
      <InlineStack gap="300" blockAlign="start">
        <Box
          padding="150"
          background={done ? "bg-fill-success" : "bg-fill-secondary"}
          borderRadius="full"
          minWidth="28px"
        >
          <Text as="p" variant="bodySm" fontWeight="bold" alignment="center" tone={done ? "success" : undefined}>
            {done ? "✓" : number}
          </Text>
        </Box>
        <BlockStack gap="100">
          <Text as="p" variant="bodyMd" fontWeight={done ? undefined : "semibold"}>
            {title}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">{description}</Text>
        </BlockStack>
      </InlineStack>
      {!done && (
        <Button size="slim" onClick={onAction}>{actionLabel}</Button>
      )}
      {done && <Badge tone="success">Done</Badge>}
    </InlineStack>
  );
}

export default function Dashboard() {
  const {
    totalProducts,
    generatedCount,
    draftCount,
    activeJobCount,
    hasBrandVoice,
    hasApiKey,
    isNewShop,
    plan,
    usageCount,
  } = useLoaderData();
  const navigate = useNavigate();

  const usagePct = Math.min(100, Math.round((usageCount / plan.monthlyLimit) * 100));
  const planLabels = { free: "Free", starter: "Starter", growth: "Growth", pro: "Professional" };

  return (
    <Page title="ContentPilot AI">
      <BlockStack gap="500">

        {/* ── Setup warnings ──────────────────────────────────────────────── */}
        {!hasApiKey && (
          <Banner tone="warning" title="API Key Missing">
            <p>
              Add your Anthropic API key to the .env file to enable AI content
              generation. Without it, the app cannot generate content.
            </p>
          </Banner>
        )}

        {activeJobCount > 0 && (
          <Banner tone="info" title={`${activeJobCount} bulk job${activeJobCount > 1 ? "s" : ""} running`}>
            <p>Content is being generated in the background.</p>
            <Box paddingBlockStart="200">
              <Button onClick={() => navigate("/app/jobs")} variant="plain">
                View job progress →
              </Button>
            </Box>
          </Banner>
        )}

        {/* ── Onboarding checklist (shown only for new shops) ─────────────── */}
        {isNewShop && hasApiKey && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">Welcome to ContentPilot AI</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Complete these three steps to start generating content that converts.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <OnboardingStep
                  number="1"
                  title="Configure your brand voice"
                  description="Tell ContentPilot your tone, audience, and what makes you unique. The AI will match your exact voice."
                  done={hasBrandVoice}
                  actionLabel="Set up now"
                  onAction={() => navigate("/app/settings")}
                />
                <OnboardingStep
                  number="2"
                  title="Generate your first product description"
                  description="Pick any product and generate an AI description, meta title, and FAQ in under 20 seconds."
                  done={false}
                  actionLabel="Choose a product"
                  onAction={() => navigate("/app/products")}
                />
                <OnboardingStep
                  number="3"
                  title="Review and publish"
                  description="Read the draft, make any edits, and publish with one click directly to your Shopify store."
                  done={false}
                  actionLabel="View products"
                  onAction={() => navigate("/app/products")}
                />
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Total Products</Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">{totalProducts}</Text>
                <Text as="p" variant="bodySm" tone="subdued">In your Shopify store</Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Content Published</Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">{generatedCount}</Text>
                <Text as="p" variant="bodySm" tone="subdued">AI descriptions live on your store</Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Drafts Pending</Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">{draftCount}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Ready for your review</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ── Plan usage card ─────────────────────────────────────────────── */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">Monthly Usage</Text>
                <Badge tone={plan.planName === "free" ? "attention" : "success"}>
                  {planLabels[plan.planName] ?? plan.planName} Plan
                </Badge>
              </InlineStack>
              <InlineStack gap="300" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">
                  {usageCount} / {plan.monthlyLimit} generations used
                </Text>
                {plan.planName === "free" && (
                  <Button size="slim" onClick={() => navigate("/app/plans")}>
                    Upgrade
                  </Button>
                )}
              </InlineStack>
            </InlineStack>
            <ProgressBar
              progress={usagePct}
              tone={usagePct >= 90 ? "critical" : usagePct >= 70 ? "highlight" : "success"}
              size="small"
            />
            {usagePct >= 90 && (
              <Text as="p" variant="bodySm" tone="critical">
                Almost at your limit — <Button variant="plain" onClick={() => navigate("/app/plans")}>upgrade your plan</Button> to keep generating.
              </Text>
            )}
          </BlockStack>
        </Card>

        {/* Active jobs card */}
        {activeJobCount > 0 && (
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Active Bulk Jobs</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {activeJobCount} job{activeJobCount > 1 ? "s" : ""} generating content in the background
                </Text>
              </BlockStack>
              <Button onClick={() => navigate("/app/jobs")}>View Jobs</Button>
            </InlineStack>
          </Card>
        )}

        {/* ── Quick actions ────────────────────────────────────────────────── */}
        {!isNewShop && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingLg">Quick Actions</Text>
              <InlineStack gap="300" wrap={true}>
                <Button variant="primary" size="large" onClick={() => navigate("/app/products")}>
                  Generate Product Content
                </Button>
                <Button size="large" onClick={() => navigate("/app/review")}>
                  Review & Publish Drafts
                </Button>
                <Button size="large" onClick={() => navigate("/app/seo-audit")}>
                  SEO Audit
                </Button>
                <Button size="large" onClick={() => navigate("/app/collections")}>
                  Collection Descriptions
                </Button>
                <Button size="large" onClick={() => navigate("/app/blog")}>
                  Blog Generator
                </Button>
                <Button size="large" onClick={() => navigate("/app/analytics")}>
                  Analytics
                </Button>
                <Button size="large" onClick={() => navigate("/app/settings")}>
                  Brand Voice Settings
                </Button>
                <Button size="large" onClick={() => navigate("/app/plans")}>
                  Plans & Billing
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

      </BlockStack>
    </Page>
  );
}
