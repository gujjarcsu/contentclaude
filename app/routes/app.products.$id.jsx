// app/routes/app.products.$id.jsx
// ContentPilot AI - Single Product Content Generator

import { useLoaderData, useActionData, useNavigation, useNavigate, Form } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Thumbnail,
  Badge,
  Box,
  Divider,
  Banner,
  Checkbox,
  Spinner,
  TextField,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { generateProductContent } from "../utils/ai.server";

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = `gid://shopify/Product/${params.id}`;

  // Fetch product from Shopify
  const response = await admin.graphql(`
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        status
        productType
        vendor
        description
        descriptionHtml
        seo {
          title
          description
        }
        featuredImage {
          url
          altText
        }
        images(first: 5) {
          edges {
            node {
              url
              altText
            }
          }
        }
        variants(first: 10) {
          edges {
            node {
              title
              price
              sku
            }
          }
        }
        tags
      }
    }
  `, {
    variables: { id: productId },
  });

  const data = await response.json();
  const product = data.data.product;

  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  // Get existing generated content
  const existingContent = await prisma.generatedContent.findMany({
    where: { shop, productId },
    orderBy: { updatedAt: "desc" },
  });

  // Get brand voice
  const brandVoice = await prisma.brandVoice.findUnique({
    where: { shop },
  });

  return Response.json({
    product: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      productType: product.productType,
      vendor: product.vendor,
      description: product.description || "",
      descriptionHtml: product.descriptionHtml || "",
      seoTitle: product.seo?.title || "",
      seoDescription: product.seo?.description || "",
      imageUrl: product.featuredImage?.url || "",
      imageAlt: product.featuredImage?.altText || "",
      images: product.images.edges.map(e => ({ url: e.node.url, altText: e.node.altText })),
      variants: product.variants.edges.map(e => ({
        title: e.node.title,
        price: e.node.price,
        sku: e.node.sku,
      })),
      tags: product.tags || [],
    },
    existingContent: existingContent.reduce((acc, item) => {
      acc[item.contentType] = {
        generated: item.generatedContent,
        original: item.originalContent,
        status: item.status,
        id: item.id,
      };
      return acc;
    }, {}),
    hasBrandVoice: !!brandVoice,
  });
};

export const action = async ({ request, params }) => {
  console.log("ACTION FIRED - product id:", params.id, "method:", request.method);
  try {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = `gid://shopify/Product/${params.id}`;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  console.log("ACTION CALLED", actionType, "product:", params.id);
  console.log("API KEY EXISTS:", !!process.env.ANTHROPIC_API_KEY);

  if (actionType === "test") {
    return Response.json({ success: true, message: "Test passed! Actions are wired correctly. The form submission pipeline works." });
  }

  if (actionType === "generate") {
    // Get content types to generate
    const contentTypes = [];
    if (formData.get("genDescription") === "true") contentTypes.push("description");
    if (formData.get("genMetaTitle") === "true") contentTypes.push("metaTitle");
    if (formData.get("genMetaDescription") === "true") contentTypes.push("metaDescription");
    if (formData.get("genFaq") === "true") contentTypes.push("faq");

    if (contentTypes.length === 0) {
      return Response.json({ error: "Select at least one content type to generate." });
    }

    // Fetch product data
    const response = await admin.graphql(`
      query getProduct($id: ID!) {
        product(id: $id) {
          title
          productType
          vendor
          description
          descriptionHtml
          seo { title description }
          variants(first: 10) {
            edges { node { title price } }
          }
          tags
        }
      }
    `, { variables: { id: productId } });

    const productData = await response.json();
    const product = productData.data.product;

    // Get brand voice
    const brandVoice = await prisma.brandVoice.findUnique({
      where: { shop },
    });

    // Generate content with AI
    console.log("GENERATE STARTED");
    try {
      const generated = await generateProductContent(
        {
          title: product.title,
          productType: product.productType,
          vendor: product.vendor,
          description: product.description,
          descriptionHtml: product.descriptionHtml,
          variants: product.variants.edges.map(e => e.node),
          tags: product.tags,
        },
        brandVoice,
        contentTypes
      );

      // Save generated content to database
      const savePromises = [];

      if (generated.description && contentTypes.includes("description")) {
        savePromises.push(
          prisma.generatedContent.upsert({
            where: {
              id: (await prisma.generatedContent.findFirst({
                where: { shop, productId, contentType: "description" },
              }))?.id || "new-desc",
            },
            update: {
              generatedContent: generated.description,
              originalContent: product.descriptionHtml || "",
              status: "draft",
              version: { increment: 1 },
            },
            create: {
              shop,
              productId,
              productTitle: product.title,
              contentType: "description",
              originalContent: product.descriptionHtml || "",
              generatedContent: generated.description,
              status: "draft",
            },
          })
        );
      }

      if (generated.metaTitle && contentTypes.includes("metaTitle")) {
        savePromises.push(
          prisma.generatedContent.upsert({
            where: {
              id: (await prisma.generatedContent.findFirst({
                where: { shop, productId, contentType: "metaTitle" },
              }))?.id || "new-mt",
            },
            update: {
              generatedContent: generated.metaTitle,
              originalContent: product.seo?.title || "",
              status: "draft",
              version: { increment: 1 },
            },
            create: {
              shop,
              productId,
              productTitle: product.title,
              contentType: "metaTitle",
              originalContent: product.seo?.title || "",
              generatedContent: generated.metaTitle,
              status: "draft",
            },
          })
        );
      }

      if (generated.metaDescription && contentTypes.includes("metaDescription")) {
        savePromises.push(
          prisma.generatedContent.upsert({
            where: {
              id: (await prisma.generatedContent.findFirst({
                where: { shop, productId, contentType: "metaDescription" },
              }))?.id || "new-md",
            },
            update: {
              generatedContent: generated.metaDescription,
              originalContent: product.seo?.description || "",
              status: "draft",
              version: { increment: 1 },
            },
            create: {
              shop,
              productId,
              productTitle: product.title,
              contentType: "metaDescription",
              originalContent: product.seo?.description || "",
              generatedContent: generated.metaDescription,
              status: "draft",
            },
          })
        );
      }

      if (generated.faq && contentTypes.includes("faq")) {
        savePromises.push(
          prisma.generatedContent.upsert({
            where: {
              id: (await prisma.generatedContent.findFirst({
                where: { shop, productId, contentType: "faq" },
              }))?.id || "new-faq",
            },
            update: {
              generatedContent: generated.faq,
              status: "draft",
              version: { increment: 1 },
            },
            create: {
              shop,
              productId,
              productTitle: product.title,
              contentType: "faq",
              originalContent: "",
              generatedContent: generated.faq,
              status: "draft",
            },
          })
        );
      }

      await Promise.all(savePromises);

      return Response.json({
        success: true,
        generated,
        message: "Content generated successfully! Review below and publish when ready.",
      });
    } catch (error) {
      console.error("Generation error:", error);
      return Response.json({
        error: `Failed to generate content: ${error.message}`,
      });
    }
  }

  if (actionType === "publish") {
    // Publish content to Shopify
    const description = formData.get("publishDescription");
    const metaTitle = formData.get("publishMetaTitle");
    const metaDescription = formData.get("publishMetaDescription");

    const updateFields = {};
    if (description) updateFields.descriptionHtml = description;

    const seoFields = {};
    if (metaTitle) seoFields.title = metaTitle;
    if (metaDescription) seoFields.description = metaDescription;

    try {
      await admin.graphql(`
        mutation updateProduct($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              title
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            id: productId,
            ...updateFields,
            ...(Object.keys(seoFields).length > 0 ? { seo: seoFields } : {}),
          },
        },
      });

      // Update status in our database
      await prisma.generatedContent.updateMany({
        where: { shop, productId, status: "draft" },
        data: { status: "published" },
      });

      return Response.json({
        success: true,
        published: true,
        message: "Content published to your Shopify store!",
      });
    } catch (error) {
      return Response.json({
        error: `Failed to publish: ${error.message}`,
      });
    }
  }

  return Response.json({ error: "Unknown action" });
  } catch (error) {
    // Re-throw Response objects (Shopify auth redirects) so React Router handles them
    if (error instanceof Response) throw error;
    console.error("UNHANDLED ACTION ERROR:", error);
    return Response.json({ error: `Action failed: ${error.message}` });
  }
};

export default function ProductGeneratePage() {
  const { product, existingContent, hasBrandVoice } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isGenerating = navigation.state === "submitting" && navigation.formData?.get("actionType") === "generate";
  const isPublishing = navigation.state === "submitting" && navigation.formData?.get("actionType") === "publish";

  // Content type selections
  const [genDescription, setGenDescription] = useState(true);
  const [genMetaTitle, setGenMetaTitle] = useState(true);
  const [genMetaDescription, setGenMetaDescription] = useState(true);
  const [genFaq, setGenFaq] = useState(false);

  // Get the latest content (from action response or from database)
  const description = actionData?.generated?.description || existingContent.description?.generated || "";
  const metaTitle = actionData?.generated?.metaTitle || existingContent.metaTitle?.generated || "";
  const metaDescription = actionData?.generated?.metaDescription || existingContent.metaDescription?.generated || "";
  const faq = actionData?.generated?.faq || existingContent.faq?.generated || "";

  const hasGeneratedContent = description || metaTitle || metaDescription || faq;

  return (
    <Page
      title={product.title}
      backAction={{ content: "Products", onAction: () => navigate("/app/products") }}
    >
      <BlockStack gap="500">
        {/* Messages */}
        {actionData?.error && (
          <Banner tone="critical" title="Error">
            <p>{actionData.error}</p>
          </Banner>
        )}
        {actionData?.message && !actionData?.error && (
          <Banner tone="success" title="Success">
            <p>{actionData.message}</p>
          </Banner>
        )}
        {!hasBrandVoice && (
          <Banner tone="warning">
            <p>
              No brand voice configured. Content will use default tone.{" "}
              <Button variant="plain" onClick={() => navigate("/app/settings")}>
                Set up brand voice →
              </Button>
            </p>
          </Banner>
        )}

        <Layout>
          {/* Left Column - Product Info & Controls */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Product Card */}
              <Card>
                <BlockStack gap="300">
                  {product.imageUrl && (
                    <Thumbnail
                      source={product.imageUrl}
                      alt={product.title}
                      size="large"
                    />
                  )}
                  <Text as="h2" variant="headingMd">{product.title}</Text>
                  <InlineStack gap="200">
                    <Badge>{product.status}</Badge>
                    {product.productType && <Badge tone="info">{product.productType}</Badge>}
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    ${product.variants[0]?.price || "0.00"} · {product.vendor || "No vendor"}
                  </Text>
                  {product.tags.length > 0 && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Tags: {product.tags.join(", ")}
                    </Text>
                  )}
                </BlockStack>
              </Card>

              {/* Generation Controls */}
              <Card>
                <Form method="post">
                  <input type="hidden" name="actionType" value="generate" />
                  <input type="hidden" name="genDescription" value={genDescription.toString()} />
                  <input type="hidden" name="genMetaTitle" value={genMetaTitle.toString()} />
                  <input type="hidden" name="genMetaDescription" value={genMetaDescription.toString()} />
                  <input type="hidden" name="genFaq" value={genFaq.toString()} />
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Generate Content</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Select what to generate:
                    </Text>
                    <Checkbox
                      label="Product Description"
                      checked={genDescription}
                      onChange={setGenDescription}
                      helpText="Full product description with SEO optimization"
                    />
                    <Checkbox
                      label="Meta Title"
                      checked={genMetaTitle}
                      onChange={setGenMetaTitle}
                      helpText="SEO title tag (max 60 characters)"
                    />
                    <Checkbox
                      label="Meta Description"
                      checked={genMetaDescription}
                      onChange={setGenMetaDescription}
                      helpText="SEO meta description (max 155 characters)"
                    />
                    <Checkbox
                      label="FAQ Content"
                      checked={genFaq}
                      onChange={setGenFaq}
                      helpText="4-5 frequently asked questions and answers"
                    />
                    <Button
                      variant="primary"
                      size="large"
                      submit
                      loading={isGenerating}
                      disabled={isGenerating || (!genDescription && !genMetaTitle && !genMetaDescription && !genFaq)}
                      fullWidth
                    >
                      {isGenerating ? "Generating with AI..." : "Generate Content"}
                    </Button>
                  </BlockStack>
                </Form>
              </Card>

              {/* Test Form — confirms action wiring works */}
              <Card>
                <Form method="post">
                  <input type="hidden" name="actionType" value="test" />
                  <Button submit size="slim" fullWidth>
                    Test Actions (debug)
                  </Button>
                </Form>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Right Column - Content Preview */}
          <Layout.Section>
            <BlockStack gap="400">
              {/* Current vs Generated Description */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Product Description</Text>

                  {/* Current */}
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" fontWeight="bold" tone="subdued">
                        CURRENT DESCRIPTION:
                      </Text>
                      <Text as="p" variant="bodyMd">
                        {product.descriptionHtml ? (
                          <span dangerouslySetInnerHTML={{ __html: product.descriptionHtml.substring(0, 500) }} />
                        ) : (
                          <Text tone="critical">No description — this product needs content!</Text>
                        )}
                      </Text>
                    </BlockStack>
                  </Box>

                  {/* Generated */}
                  {description && (
                    <Box padding="300" background="bg-surface-success" borderRadius="200">
                      <BlockStack gap="100">
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm" fontWeight="bold" tone="success">
                            ✨ AI-GENERATED DESCRIPTION:
                          </Text>
                          <Badge tone="success">Ready to Publish</Badge>
                        </InlineStack>
                        <Box paddingBlockStart="100">
                          <div dangerouslySetInnerHTML={{ __html: description }} />
                        </Box>
                      </BlockStack>
                    </Box>
                  )}

                  {!description && !isGenerating && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Click "Generate Content" to create an AI-optimized description.
                    </Text>
                  )}

                  {isGenerating && (
                    <Box padding="400">
                      <InlineStack align="center" gap="200">
                        <Spinner size="small" />
                        <Text as="p" variant="bodyMd">
                          Generating your content... this takes 10-20 seconds
                        </Text>
                      </InlineStack>
                    </Box>
                  )}
                </BlockStack>
              </Card>

              {/* Meta Title */}
              {(metaTitle || genMetaTitle) && (
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Meta Title</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Current: {product.seoTitle || "(using product title)"}
                    </Text>
                    {metaTitle && (
                      <Box padding="200" background="bg-surface-success" borderRadius="200">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          ✨ {metaTitle}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {metaTitle.length}/60 characters
                        </Text>
                      </Box>
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* Meta Description */}
              {(metaDescription || genMetaDescription) && (
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Meta Description</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Current: {product.seoDescription || "(none set)"}
                    </Text>
                    {metaDescription && (
                      <Box padding="200" background="bg-surface-success" borderRadius="200">
                        <Text as="p" variant="bodyMd">
                          ✨ {metaDescription}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {metaDescription.length}/155 characters
                        </Text>
                      </Box>
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* FAQ */}
              {faq && (
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">FAQ Content</Text>
                    <Box padding="200" background="bg-surface-success" borderRadius="200">
                      <Text as="p" variant="bodyMd" breakWord>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
                          {faq}
                        </pre>
                      </Text>
                    </Box>
                  </BlockStack>
                </Card>
              )}

              {/* Publish Form */}
              {hasGeneratedContent && (
                <Card>
                  <Form method="post">
                    <input type="hidden" name="actionType" value="publish" />
                    {description && <input type="hidden" name="publishDescription" value={description} />}
                    {metaTitle && <input type="hidden" name="publishMetaTitle" value={metaTitle} />}
                    {metaDescription && <input type="hidden" name="publishMetaDescription" value={metaDescription} />}
                    <Button
                      variant="primary"
                      size="large"
                      submit
                      loading={isPublishing}
                      disabled={isPublishing || isGenerating}
                      fullWidth
                    >
                      {isPublishing ? "Publishing..." : "Publish to Store"}
                    </Button>
                  </Form>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
