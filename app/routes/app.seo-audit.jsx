import { useLoaderData, useNavigate } from "react-router";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { calculateSeoScore } = await import("../utils/seo.server.js");
  const shop = session.shop;

  // Fetch up to 200 products for the audit
  const response = await admin.graphql(`
    query {
      products(first: 200, sortKey: TITLE) {
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
    }
  `);
  const { data } = await response.json();
  const products = (data?.products?.edges ?? []).map(({ node }) => {
    const images = node.images.edges.map((e) => e.node);
    const productData = {
      description: node.description || "",
      seoTitle: node.seo?.title || "",
      seoDescription: node.seo?.description || "",
      images,
    };
    const { score, checks } = calculateSeoScore(productData);
    return {
      id: node.id,
      numericId: node.id.replace("gid://shopify/Product/", ""),
      title: node.title,
      score,
      checks,
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

  return Response.json({ products, totalScore, missingDesc, missingMeta, missingAlt });
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
  const { products, totalScore, missingDesc, missingMeta, missingAlt } = useLoaderData();
  const navigate = useNavigate();

  const rows = products.map((p) => [
    <Button variant="plain" onClick={() => navigate(`/app/products/${p.numericId}`)}>{p.title}</Button>,
    <Text as="span" fontWeight="bold" tone={p.score >= 80 ? "success" : p.score >= 50 ? undefined : "critical"}>{p.score}</Text>,
    <CheckIcon pass={p.checks.hasDescription} />,
    <CheckIcon pass={p.checks.hasMetaTitle} />,
    <CheckIcon pass={p.checks.hasMetaDesc} />,
    <CheckIcon pass={p.checks.hasAltText} />,
  ]);

  return (
    <Page
      title="SEO Audit"
      subtitle={`${products.length} products analysed — sorted by score (worst first)`}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      primaryAction={{
        content: "Fix All Missing Content",
        onAction: () => navigate("/app/products"),
      }}
    >
      <BlockStack gap="500">
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
