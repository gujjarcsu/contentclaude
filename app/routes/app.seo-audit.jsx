import { useLoaderData, useNavigate, useNavigation, useRevalidator } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  DataTable,
  ProgressBar,
  Banner,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { calculateSeoScore } = await import("../utils/seo.server.js");
  const shop = session.shop;

  const SIX_MONTHS_AGO = new Date();
  SIX_MONTHS_AGO.setMonth(SIX_MONTHS_AGO.getMonth() - 6);

  // Paginate through the full catalog (cap at 1000 products)
  const allEdges = [];
  let cursor = null;
  let hasNextPage = true;
  const MAX_AUDIT_PRODUCTS = 1000;

  while (hasNextPage && allEdges.length < MAX_AUDIT_PRODUCTS) {
    const response = await admin.graphql(
      `query getProducts($cursor: String) {
        products(first: 50, after: $cursor, sortKey: TITLE) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id title handle
              description
              seo { title description }
              images(first: 5) { edges { node { id url altText } } }
              variants(first: 1) { edges { node { price } } }
            }
          }
        }
      }`,
      { variables: { cursor } }
    );
    const { data } = await response.json();
    const page = data?.products;
    allEdges.push(...(page?.edges ?? []));
    hasNextPage = page?.pageInfo?.hasNextPage ?? false;
    cursor = page?.pageInfo?.endCursor ?? null;
  }

  // Fetch DB content records so we can check freshness
  const dbContent = await prisma.generatedContent.findMany({
    where: { shop, contentType: "description" },
    select: { productId: true, updatedAt: true, status: true },
  });
  const contentByProductId = new Map(dbContent.map((c) => [c.productId, c]));

  const products = allEdges.map(({ node }) => {
    const images = node.images.edges.map((e) => e.node);
    const productData = {
      description: node.description || "",
      seoTitle: node.seo?.title || "",
      seoDescription: node.seo?.description || "",
      images,
    };
    const { score, checks } = calculateSeoScore(productData);
    const dbRecord = contentByProductId.get(node.id);
    const isStale = dbRecord && dbRecord.status === "published" && new Date(dbRecord.updatedAt) < SIX_MONTHS_AGO;
    return {
      id: node.id,
      numericId: node.id.replace("gid://shopify/Product/", ""),
      title: node.title,
      score,
      checks,
      isStale,
      lastUpdated: dbRecord?.updatedAt ?? null,
    };
  });

  products.sort((a, b) => a.score - b.score); // worst first

  const totalScore =
    products.length > 0
      ? Math.round(products.reduce((sum, p) => sum + p.score, 0) / products.length)
      : 0;

  const missingDesc = products.filter((p) => !p.checks.hasDescription).length;
  const missingMeta = products.filter((p) => !p.checks.hasMetaTitle).length;
  const missingAlt = products.filter((p) => !p.checks.hasAltText).length;
  const staleCount = products.filter((p) => p.isStale).length;

  return Response.json({ products, totalScore, missingDesc, missingMeta, missingAlt, staleCount });
};

// ─── Component ───────────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  const tone = score >= 80 ? "success" : score >= 50 ? "highlight" : "critical";
  return (
    <BlockStack gap="200" inlineAlign="center">
      <Text as="p" variant="heading2xl" fontWeight="bold" tone={tone}>
        {score}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">/ 100 average SEO score</Text>
      <ProgressBar progress={score} tone={tone} size="medium" />
    </BlockStack>
  );
}

function CheckIcon({ pass }) {
  return pass
    ? <Badge tone="success">✓</Badge>
    : <Badge tone="critical">✗</Badge>;
}

export default function SeoAuditPage() {
  const { products, totalScore, missingDesc, missingMeta, missingAlt, staleCount } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isLoading = navigation.state === "loading" || revalidator.state === "loading";

  const rows = products.map((p) => [
    <InlineStack gap="200" blockAlign="center" key={p.id}>
      <Button variant="plain" onClick={() => navigate(`/app/products/${p.numericId}`)}>{p.title}</Button>
      {p.isStale && <Badge tone="attention">Stale</Badge>}
    </InlineStack>,
    <Text as="span" fontWeight="bold" tone={p.score >= 80 ? "success" : p.score >= 50 ? undefined : "critical"}>{p.score}</Text>,
    <CheckIcon pass={p.checks.hasDescription} />,
    <CheckIcon pass={p.checks.hasMetaTitle} />,
    <CheckIcon pass={p.checks.hasMetaDesc} />,
    <CheckIcon pass={p.checks.hasAltText} />,
  ]);

  return (
    <Page
      title="SEO Audit"
      subtitle={`${products.length} product${products.length !== 1 ? "s" : ""} analysed — sorted by score (worst first)${products.length >= 1000 ? " · showing first 1,000" : ""}`}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      primaryAction={{
        content: "Fix All Missing Content",
        onAction: () => navigate("/app/optimize"),
      }}
      secondaryActions={[
        {
          content: isLoading ? "Scanning…" : "Refresh Audit",
          onAction: () => revalidator.revalidate(),
          loading: isLoading,
          disabled: isLoading,
        },
      ]}
    >
      <BlockStack gap="500">
        {isLoading && (
          <Banner tone="info">
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="p" variant="bodyMd">Scanning your catalog... This may take a moment for large stores.</Text>
            </InlineStack>
          </Banner>
        )}

        {staleCount > 0 && (
          <Banner
            tone="warning"
            title={`${staleCount} product${staleCount !== 1 ? "s have" : " has"} content older than 6 months`}
          >
            <p>Refreshing old descriptions keeps your SEO rankings strong and content relevant.</p>
            <Box paddingBlockStart="200">
              <Button onClick={() => navigate("/app/optimize")}>Refresh Stale Content →</Button>
            </Box>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <ScoreRing score={totalScore} />
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Issues Found</Text>
                <InlineStack gap="400" wrap>
                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">{missingDesc}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Missing descriptions</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">{missingMeta}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Missing meta titles</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">{missingAlt}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Images without alt text</Text>
                  </BlockStack>
                  {staleCount > 0 && (
                    <BlockStack gap="100">
                      <Text as="p" variant="heading2xl" fontWeight="bold" tone="attention">{staleCount}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Content &gt;6 months old</Text>
                    </BlockStack>
                  )}
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  SEO score breakdown: Description (30pts) · Meta Title (25pts) · Meta Description (25pts) · Has Images (10pts) · Alt Text (10pts)
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {products.length > 0 && (
          <Card padding="0">
            <DataTable
              columnContentTypes={["text", "numeric", "text", "text", "text", "text"]}
              headings={["Product", "Score", "Description", "Meta Title", "Meta Desc", "Alt Text"]}
              rows={rows}
              defaultSortDirection="ascending"
              initialSortColumnIndex={1}
            />
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
