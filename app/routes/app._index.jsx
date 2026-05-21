// app/routes/app._index.jsx
// ContentPilot AI - Main Dashboard

import { useLoaderData, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Icon,
  Banner,
  Button,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch product count from Shopify
  const productCountResponse = await admin.graphql(`
    query {
      productsCount {
        count
      }
    }
  `);
  const productCountData = await productCountResponse.json();
  const totalProducts = productCountData.data.productsCount.count;

  // Get generated content stats from our database
  const generatedCount = await prisma.generatedContent.count({
    where: { shop, status: "published" },
  });

  const draftCount = await prisma.generatedContent.count({
    where: { shop, status: "draft" },
  });

  // Check if brand voice is configured
  const brandVoice = await prisma.brandVoice.findUnique({
    where: { shop },
  });

  const hasBrandVoice = !!brandVoice?.brandTone && brandVoice.brandTone !== "professional";
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  return Response.json({
    totalProducts,
    generatedCount,
    draftCount,
    hasBrandVoice,
    hasApiKey,
    shop,
  });
};

export default function Dashboard() {
  const {
    totalProducts,
    generatedCount,
    draftCount,
    hasBrandVoice,
    hasApiKey,
  } = useLoaderData();
  const navigate = useNavigate();

  return (
    <Page title="ContentPilot AI">
      <BlockStack gap="500">

        {/* Setup Warnings */}
        {!hasApiKey && (
          <Banner tone="warning" title="API Key Missing">
            <p>
              Add your Anthropic API key to the .env file to enable AI content
              generation. Without it, the app cannot generate content.
            </p>
          </Banner>
        )}

        {!hasBrandVoice && hasApiKey && (
          <Banner tone="info" title="Set Up Your Brand Voice">
            <p>
              Configure your brand voice settings so ContentPilot generates
              content that sounds like YOU, not generic AI.
            </p>
            <Box paddingBlockStart="200">
              <Button onClick={() => navigate("/app/settings")} variant="plain">
                Configure Brand Voice →
              </Button>
            </Box>
          </Banner>
        )}

        {/* Stats Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Total Products
                </Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {totalProducts}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  In your Shopify store
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Content Published
                </Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {generatedCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  AI-generated descriptions live on your store
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Drafts Pending
                </Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {draftCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Ready for your review
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Quick Actions */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Get Started
                </Text>

                <InlineStack gap="300" wrap={true}>
                  <Button variant="primary" size="large" onClick={() => navigate("/app/products")}>
                    Generate Product Content
                  </Button>
                  <Button size="large" onClick={() => navigate("/app/settings")}>
                    Brand Voice Settings
                  </Button>
                </InlineStack>

                <Box paddingBlockStart="200">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">
                      How ContentPilot Works:
                    </Text>
                    <Text as="p" variant="bodyMd">
                      1. Configure your brand voice — tell us your tone, audience, and what makes you unique.
                    </Text>
                    <Text as="p" variant="bodyMd">
                      2. Select products — choose individual products or generate in bulk.
                    </Text>
                    <Text as="p" variant="bodyMd">
                      3. Review AI content — preview generated descriptions, meta tags, and FAQs before publishing.
                    </Text>
                    <Text as="p" variant="bodyMd">
                      4. Publish to store — one click to push approved content live.
                    </Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

      </BlockStack>
    </Page>
  );
}
