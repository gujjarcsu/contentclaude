import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  ProgressBar,
  DataTable,
  Box,
  Select,
} from "@shopify/polaris";
import { useCallback } from "react";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { getOrCreatePlan } from "../utils/plans.server.js";
import {
  getContentMetrics,
  coveragePct as calcCoveragePct,
  needsContentFrom,
} from "../utils/metrics.server.js";
import { getCache } from "../utils/cache.server.js";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const selectedMonth = url.searchParams.get("month") || currentMonth;
  // Clamp to a real YYYY-MM format to prevent injection
  const safeMonth = /^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : currentMonth;

  const [plan, usageCount, metrics, recentUsage, jobStats, totalProducts] = await Promise.all([
    getOrCreatePlan(shop),
    prisma.usageRecord.count({ where: { shop, month: safeMonth } }),
    getContentMetrics(shop),
    prisma.usageRecord.groupBy({
      by: ["month"],
      where: { shop },
      _count: { month: true },
      orderBy: { month: "desc" },
      take: 6,
    }),
    prisma.generationJob.groupBy({
      by: ["status"],
      where: { shop },
      _count: { status: true },
    }),
    // Shared 5-min cache with the dashboard — keeps the Admin GraphQL call off
    // most Analytics loads so the loader is effectively DB-only (fast paint).
    getCache(
      `productCount:${shop}`,
      async () => {
        const r = await admin.graphql(`query { productsCount { count } }`);
        const d = await r.json();
        return d.data.productsCount.count;
      },
      300,
    ),
  ]);

  // Phase 2 item 2.1 - the same mutually exclusive states every other screen
  // reads. Coverage can never exceed 100% and the numbers cannot disagree with
  // Home or Products for the same store.
  const published = metrics.publishedProducts;
  const draft = metrics.draftProducts;
  const needsContent = needsContentFrom(metrics, totalProducts);
  const publishedPieces = metrics.publishedPieces;
  const coveragePct = calcCoveragePct(published, totalProducts);

  const monthlyRows = recentUsage.map((r) => ({
    month: r.month,
    count: r._count.month,
  }));

  const completedJobs = jobStats.find((s) => s.status === "complete")?._count.status ?? 0;
  const failedJobs = jobStats.find((s) => s.status === "failed")?._count.status ?? 0;

  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  // Build list of last 6 months for the selector
  const availableMonths = recentUsage
    .map((r) => r.month)
    .sort()
    .reverse();
  if (!availableMonths.includes(currentMonth)) availableMonths.unshift(currentMonth);

  return Response.json({
    totalProducts,
    published, // products whose content is live
    draft, // products waiting for the merchant to review
    needsContent, // products with no AI content at all
    publishedPieces, // raw content-piece count — a DIFFERENT metric to the above
    coveragePct,
    monthlyRows,
    completedJobs,
    failedJobs,
    plan: { planName: plan.planName, monthlyLimit: plan.monthlyLimit },
    usageCount,
    daysRemaining,
    selectedMonth: safeMonth,
    currentMonth,
    availableMonths,
  });
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const {
    totalProducts,
    published,
    draft,
    needsContent,
    publishedPieces,
    coveragePct,
    monthlyRows,
    completedJobs,
    failedJobs,
    plan,
    usageCount,
    daysRemaining,
    selectedMonth,
    currentMonth,
    availableMonths,
  } = useLoaderData();
  const navigate = useNavigate();

  const loadingThisRoute = useRouteLoading();
  const [, setSearchParams] = useSearchParams();

  const handleMonthChange = useCallback(
    (month) => {
      setSearchParams({ month });
    },
    [setSearchParams],
  );

  const usagePct = Math.min(100, Math.round((usageCount / plan.monthlyLimit) * 100));
  const planLabels = { free: "Free", starter: "Starter", growth: "Growth", pro: "Professional" };

  const tableRows = monthlyRows.map((r) => [
    r.month,
    r.count,
    <ProgressBar
      key={r.month}
      progress={Math.min(100, Math.round((r.count / plan.monthlyLimit) * 100))}
      size="small"
    />,
  ]);

  return loadingThisRoute ? (
    <AppSkeleton title="Analytics" sections={3} layout="full" />
  ) : (
    <Page
      title="Analytics"
      subtitle="Content performance and usage overview"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {/* Summary stats */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Content Coverage
                </Text>
                <Text
                  as="p"
                  variant="heading2xl"
                  fontWeight="bold"
                  tone={coveragePct >= 50 ? "success" : "caution"}
                >
                  {coveragePct}%
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {published} of {totalProducts} products live
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {draft} ready to review · {needsContent} need content
                </Text>
                <ProgressBar
                  progress={coveragePct}
                  tone={coveragePct >= 50 ? "success" : "highlight"}
                  size="small"
                />
                <Text as="p" variant="bodySm" tone="subdued">
                  {publishedPieces} content pieces generated in total
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Products by Status
                </Text>
                <BlockStack gap="100">
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm">
                      Live on your storefront
                    </Text>
                    <Badge tone="success">{published}</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm">
                      Ready to review
                    </Text>
                    <Badge tone="info">{draft}</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm">
                      Need content
                    </Text>
                    <Badge>{needsContent}</Badge>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Bulk runs
                </Text>
                <InlineStack gap="300">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text as="p" variant="heading2xl" fontWeight="bold" tone="success">
                      {completedJobs}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Completed
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100" inlineAlign="center">
                    <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">
                      {failedJobs}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Failed
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Plan usage */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Monthly Usage
                </Text>
                <Badge tone={plan.planName === "free" ? "attention" : "success"}>
                  {planLabels[plan.planName] ?? plan.planName} Plan
                </Badge>
              </InlineStack>
              <InlineStack gap="300" blockAlign="center">
                {selectedMonth === currentMonth && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {daysRemaining} days remaining
                  </Text>
                )}
                <Box minWidth="140px">
                  <Select
                    label="Month"
                    labelHidden
                    options={availableMonths.map((m) => ({ label: m, value: m }))}
                    value={selectedMonth}
                    onChange={handleMonthChange}
                  />
                </Box>
              </InlineStack>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              {usageCount} / {plan.monthlyLimit} generations used
            </Text>
            <ProgressBar progress={usagePct} tone={usagePct >= 90 ? "critical" : "success"} size="medium" />
          </BlockStack>
        </Card>

        {/* Monthly history table */}
        {monthlyRows.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Generation History (last 6 months)
              </Text>
              <DataTable
                columnContentTypes={["text", "numeric", "text"]}
                headings={["Month", "Generations", "vs Plan Limit"]}
                rows={tableRows}
              />
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
