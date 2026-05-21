// app/routes/app.products.jsx
// ContentPilot AI - Product Listing Page

import { useLoaderData, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Thumbnail,
  Badge,
  BlockStack,
  InlineStack,
  Button,
  EmptyState,
  Filters,
  TextField,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch products from Shopify
  const response = await admin.graphql(`
    query {
      products(first: 50, sortKey: TITLE) {
        edges {
          node {
            id
            title
            handle
            status
            productType
            vendor
            description
            descriptionHtml
            featuredImage {
              url
              altText
            }
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
            tags
          }
        }
      }
    }
  `);

  const data = await response.json();
  const products = data.data.products.edges.map((edge) => {
    const node = edge.node;
    return {
      id: node.id,
      numericId: node.id.replace("gid://shopify/Product/", ""),
      title: node.title,
      handle: node.handle,
      status: node.status,
      productType: node.productType,
      vendor: node.vendor,
      description: node.description || "",
      descriptionHtml: node.descriptionHtml || "",
      imageUrl: node.featuredImage?.url || "",
      imageAlt: node.featuredImage?.altText || "",
      price: node.variants.edges[0]?.node?.price || "0.00",
      tags: node.tags || [],
    };
  });

  // Get generation status for each product
  const generatedProducts = await prisma.generatedContent.findMany({
    where: {
      shop,
      contentType: "description",
    },
    select: {
      productId: true,
      status: true,
      updatedAt: true,
    },
  });

  const statusMap = {};
  generatedProducts.forEach((gc) => {
    statusMap[gc.productId] = {
      status: gc.status,
      updatedAt: gc.updatedAt,
    };
  });

  return Response.json({ products, statusMap });
};

export default function ProductsPage() {
  const { products, statusMap } = useLoaderData();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");

  const handleSearchChange = useCallback((value) => {
    setSearchValue(value);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchValue("");
  }, []);

  // Filter products by search
  const filteredProducts = products.filter((product) =>
    product.title.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Stats
  const totalProducts = products.length;
  const publishedCount = Object.values(statusMap).filter(
    (s) => s.status === "published"
  ).length;
  const draftCount = Object.values(statusMap).filter(
    (s) => s.status === "draft"
  ).length;
  const noContentCount = totalProducts - publishedCount - draftCount;

  function getStatusBadge(productId) {
    const genStatus = statusMap[productId];
    if (!genStatus) {
      return <Badge tone="attention">No AI Content</Badge>;
    }
    if (genStatus.status === "published") {
      return <Badge tone="success">Published</Badge>;
    }
    if (genStatus.status === "draft") {
      return <Badge tone="info">Draft Ready</Badge>;
    }
    return <Badge>Unknown</Badge>;
  }

  function getContentPreview(product) {
    if (!product.description || product.description.length < 20) {
      return (
        <Text as="p" variant="bodySm" tone="critical">
          ⚠ Missing or very short description
        </Text>
      );
    }
    return (
      <Text as="p" variant="bodySm" tone="subdued" truncate>
        {product.description.substring(0, 120)}...
      </Text>
    );
  }

  return (
    <Page
      title="Products"
      subtitle={`${totalProducts} products · ${publishedCount} optimized · ${noContentCount} need content`}
      primaryAction={{
        content: "Bulk Generate (Coming Soon)",
        disabled: true,
      }}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {/* Stats Bar */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                  {publishedCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  AI Content Published
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {draftCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Drafts to Review
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="headingXl" fontWeight="bold" tone="critical">
                  {noContentCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Need Content
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Product List */}
        <Card>
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={filteredProducts}
            filterControl={
              <Filters
                queryValue={searchValue}
                queryPlaceholder="Search products..."
                onQueryChange={handleSearchChange}
                onQueryClear={handleSearchClear}
                filters={[]}
                onClearAll={handleSearchClear}
              />
            }
            renderItem={(product) => {
              const { id, numericId, title, imageUrl, price, productType } = product;

              return (
                <ResourceItem
                  id={id}
                  media={
                    <Thumbnail
                      source={imageUrl || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"}
                      alt={title}
                      size="medium"
                    />
                  }
                  onClick={() => navigate(`/app/products/${numericId}`)}
                  shortcutActions={[
                    {
                      content: "Generate Content",
                      onAction: () => navigate(`/app/products/${numericId}`),
                    },
                  ]}
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h3" variant="bodyMd" fontWeight="bold">
                        {title}
                      </Text>
                      <InlineStack gap="200">
                        <Text as="span" variant="bodySm" tone="subdued">
                          ${price}
                        </Text>
                        {productType && (
                          <Text as="span" variant="bodySm" tone="subdued">
                            · {productType}
                          </Text>
                        )}
                      </InlineStack>
                      {getContentPreview(product)}
                    </BlockStack>
                    <BlockStack gap="200" inlineAlign="end">
                      {getStatusBadge(id)}
                      <Button
                        size="slim"
                        onClick={() => navigate(`/app/products/${numericId}`)}
                      >
                        Generate
                      </Button>
                    </BlockStack>
                  </InlineStack>
                </ResourceItem>
              );
            }}
            emptyState={
              <EmptyState
                heading="No products found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Add products to your Shopify store first, then come back to
                  generate AI content.
                </p>
              </EmptyState>
            }
          />
        </Card>
      </BlockStack>
    </Page>
  );
}
