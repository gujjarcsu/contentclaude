import { useLoaderData, useNavigate } from "react-router";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import {
  InlineGrid,
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  ProgressBar,
  Badge,
  Button,
  EmptyState,
  Divider,
} from "@shopify/polaris";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import { authenticate } from "../shopify.server.js";
import { getCache } from "../utils/cache.server.js";
import { computeStoreResults } from "../utils/results.server.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const totalProducts = await getCache(
    `productCount:${shop}`,
    async () => {
      const r = await admin.graphql(`query { productsCount { count } }`);
      const d = await r.json();
      return d.data.productsCount.count;
    },
    300,
  );

  const results = await computeStoreResults(shop, totalProducts);
  return Response.json(results);
};

function StatCard({ value, label, sub, tone }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="heading2xl" fontWeight="bold" tone={tone}>
          {value}
        </Text>
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          {label}
        </Text>
        {sub && (
          <Text as="p" variant="bodySm" tone="subdued">
            {sub}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}

export default function ResultsPage() {
  const data = useLoaderData();
  const loadingThisRoute = useRouteLoading();
  const navigate = useNavigate();

  if (loadingThisRoute) {
    return <AppSkeleton title="Your Results" sections={3} layout="full" />;
  }

  if (!data.hasResults) {
    return (
      <Page
        title="Your Results"
        subtitle="The measurable impact of your AI-optimized content."
        backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      >
        <BlockStack gap="500">
          <Card>
            <EmptyState
              heading="Publish content to see your results"
              image="/empty-review.svg"
              action={{ content: "Review & Publish", onAction: () => navigate("/app/review") }}
              secondaryAction={{ content: "Generate content", onAction: () => navigate("/app/products") }}
            >
              <p>
                Once you publish AI-optimized content, this page shows the measurable before-and-after impact:
                coverage, SEO lift, AI-search schema, and time saved.
              </p>
            </EmptyState>
          </Card>
        </BlockStack>
      </Page>
    );
  }

  const s = data.summary;
  const seo = s.seoScore; // { before, after, change }

  return (
    <Page
      title="Your Results"
      subtitle="The measurable impact of your AI-optimized content."
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {/* Headline stats */}
        {/* Phase 2 item 2.5 - a hand-rolled CSS grid that also carried no
            data-cc-stat-grid hook, so the mobile breakpoint written for it
            in mobile.css never applied and these cards did not collapse at
            375px. Polaris InlineGrid is responsive by declaration. */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <StatCard
            value={s.optimizedProducts}
            label="Products optimized"
            sub={`${s.coveragePct}% of your catalog`}
            tone="success"
          />
          <StatCard
            value={s.contentPieces}
            label="Content pieces published"
            sub="Descriptions, meta tags & FAQs"
          />
          <StatCard value={s.timeSaved.label} label="Time saved (est.)" sub="vs. writing by hand" />
          <StatCard
            value={data.faqSchemaProducts}
            label="FAQ schema live"
            sub={data.faqSchemaProducts > 0 ? "products citable by AI" : "add FAQ content to activate"}
            tone={data.faqSchemaProducts > 0 ? "success" : undefined}
          />
        </InlineGrid>

        {/* SEO readiness lift — only shown when the improvement is genuinely
            meaningful (the checklist saturates once products already have basic
            content, so a small delta would undersell the real quality/GEO gain). */}
        {seo.change >= 8 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="h2" variant="headingMd">
                  Content SEO readiness
                </Text>
                <Badge tone="success">{`+${seo.change} points on average`}</Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                How complete and search-ready your product content is, before vs. after AI optimization
                (averaged across your published products).
              </Text>
              <BlockStack gap="300">
                <div>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Before
                    </Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {seo.before}/100
                    </Text>
                  </InlineStack>
                  <Box paddingBlockStart="100">
                    <ProgressBar progress={seo.before} tone="highlight" size="small" />
                  </Box>
                </div>
                <div>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" fontWeight="semibold" tone="success">
                      After (AI-optimized)
                    </Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold" tone="success">
                      {seo.after}/100
                    </Text>
                  </InlineStack>
                  <Box paddingBlockStart="100">
                    <ProgressBar progress={seo.after} tone="success" size="small" />
                  </Box>
                </div>
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* AI-search / GEO proof — the differentiator (honest: FAQPage is what we emit) */}
        <Box padding="500" background="bg-surface-info" borderRadius="300">
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center" wrap>
              <Text as="h2" variant="headingMd">
                AI-search schema
              </Text>
              {data.faqSchemaProducts > 0 && (
                <Badge tone="success">{`Q&A live on ${data.faqSchemaProducts} product${data.faqSchemaProducts !== 1 ? "s" : ""}`}</Badge>
              )}
            </InlineStack>
            {/* Phase 2 item 2.9 - the paragraph below carried five pieces of
                jargon a merchant has no reason to know (FAQPage, JSON-LD,
                structured data, answer-first, llms.txt), ran to seven lines, and
                finished on a marketing flourish. It states one fact now. */}
            {data.faqSchemaProducts > 0 ? (
              <Text as="p" variant="bodyMd">
                <strong>{data.faqSchemaProducts}</strong> of your products publish a question-and-answer
                section that AI assistants can quote.
              </Text>
            ) : (
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd">
                  You haven't published <strong>FAQ content</strong> yet — that's what adds{" "}
                  <strong>a question-and-answer section</strong> to your product pages, which AI assistants
                  cite. Generate content with the <strong>FAQ</strong> option selected, then publish, to make
                  your products citable by AI.
                </Text>
                <div>
                  <Button variant="primary" tone="success" onClick={() => navigate("/app/products")}>
                    Generate FAQ content
                  </Button>
                </div>
              </BlockStack>
            )}
          </BlockStack>
        </Box>

        {/* Time saved detail */}
        <Card>
          <BlockStack gap="150">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">
                ≈ {s.timeSaved.label} of writing saved
              </Text>
              <Badge>Estimate</Badge>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              {s.timeSaved.basis}.
            </Text>
          </BlockStack>
        </Card>

        {/* Biggest improvements */}
        {data.improvements.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Biggest content improvements
              </Text>
              {data.improvements.map((imp, i) => (
                <BlockStack key={imp.productId} gap="200">
                  <InlineStack align="space-between" blockAlign="center" wrap>
                    <Button variant="plain" onClick={() => navigate(`/app/products/${imp.numericId}`)}>
                      {imp.title}
                    </Button>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">
                        {imp.seoBefore} to {imp.seoAfter}
                      </Text>
                      <Badge tone="success">{`+${imp.lift}`}</Badge>
                    </InlineStack>
                  </InlineStack>
                  {i < data.improvements.length - 1 && <Divider />}
                </BlockStack>
              ))}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
