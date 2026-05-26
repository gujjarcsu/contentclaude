import { useLoaderData, useNavigate, useSubmit, redirect, useSearchParams } from "react-router";
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
  Checkbox,
  Banner,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueGenerationJob } from "../queues/generationQueue.server";

const PAGE_SIZE = 50;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  const direction = url.searchParams.get("dir") || "next";

  const query = direction === "prev"
    ? `query($cursor: String) {
        products(last: ${PAGE_SIZE}, before: $cursor, sortKey: TITLE) {
          pageInfo { hasPreviousPage hasNextPage startCursor endCursor }
          edges { node {
            id title handle status productType vendor description
            featuredImage { url altText }
            variants(first: 1) { edges { node { price } } }
            tags
          }}
        }
      }`
    : `query($cursor: String) {
        products(first: ${PAGE_SIZE}, after: $cursor, sortKey: TITLE) {
          pageInfo { hasPreviousPage hasNextPage startCursor endCursor }
          edges { node {
            id title handle status productType vendor description
            featuredImage { url altText }
            variants(first: 1) { edges { node { price } } }
            tags
          }}
        }
      }`;

  const response = await admin.graphql(query, { variables: { cursor } });

  const data = await response.json();
  const { edges, pageInfo } = data.data.products;
  const products = edges.map(({ node }) => ({
    id: node.id,
    numericId: node.id.replace("gid://shopify/Product/", ""),
    title: node.title,
    handle: node.handle,
    status: node.status,
    productType: node.productType,
    vendor: node.vendor,
    description: node.description || "",
    imageUrl: node.featuredImage?.url || "",
    imageAlt: node.featuredImage?.altText || "",
    price: node.variants.edges[0]?.node?.price || "0.00",
    tags: node.tags || [],
  }));

  const generatedProducts = await prisma.generatedContent.findMany({
    where: { shop, contentType: "description" },
    select: { productId: true, status: true, updatedAt: true },
  });

  const statusMap = {};
  generatedProducts.forEach(({ productId, status, updatedAt }) => {
    statusMap[productId] = { status, updatedAt };
  });

  return Response.json({ products, statusMap, pageInfo });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  let selectedIds;
  try {
    selectedIds = JSON.parse(formData.get("selectedIds") || "[]");
    if (!Array.isArray(selectedIds)) selectedIds = [];
  } catch {
    return { error: "Invalid selection data. Please refresh and try again." };
  }
  const contentTypes = ["description", "metaTitle", "metaDescription", "faq"].filter(
    (t) => formData.get(`bulk_${t}`) === "true"
  );

  if (selectedIds.length === 0) return { error: "No products selected." };
  if (contentTypes.length === 0) return { error: "Select at least one content type." };

  const job = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: selectedIds.length,
      productIds: JSON.stringify(selectedIds),
      contentTypes: contentTypes.join(","),
    },
  });

  // Enqueue via BullMQ (Redis) when REDIS_URL is set; falls back to
  // in-process setTimeout for local dev without Redis.
  await enqueueGenerationJob(job.id);

  return redirect("/app/jobs");
};

export default function ProductsPage() {
  const { products, statusMap, pageInfo } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [, setSearchParams] = useSearchParams();

  const [searchValue, setSearchValue] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [bulkDesc, setBulkDesc] = useState(true);
  const [bulkMeta, setBulkMeta] = useState(true);
  const [bulkFaq, setBulkFaq] = useState(false);
  const [bulkError, setBulkError] = useState("");

  const handleSearchChange = useCallback((v) => setSearchValue(v), []);
  const handleSearchClear = useCallback(() => setSearchValue(""), []);

  const filteredProducts = products.filter((p) =>
    p.title.toLowerCase().includes(searchValue.toLowerCase())
  );

  const totalProducts = products.length;
  const publishedCount = Object.values(statusMap).filter((s) => s.status === "published").length;
  const draftCount = Object.values(statusMap).filter((s) => s.status === "draft").length;
  const noContentCount = totalProducts - publishedCount - draftCount;

  function getStatusBadge(productId) {
    const s = statusMap[productId];
    if (!s) return <Badge tone="attention">No AI Content</Badge>;
    if (s.status === "published") return <Badge tone="success">Published</Badge>;
    if (s.status === "draft") return <Badge tone="info">Draft Ready</Badge>;
    return <Badge>Unknown</Badge>;
  }

  function getContentPreview(product) {
    if (!product.description || product.description.length < 20) {
      return <Text as="p" variant="bodySm" tone="critical">⚠ Missing description</Text>;
    }
    return (
      <Text as="p" variant="bodySm" tone="subdued" truncate>
        {product.description.substring(0, 100)}…
      </Text>
    );
  }

  const handleBulkGenerate = useCallback(() => {
    if (!bulkDesc && !bulkMeta && !bulkFaq) {
      setBulkError("Select at least one content type to generate.");
      return;
    }
    setBulkError("");
    const fd = new FormData();
    fd.append("selectedIds", JSON.stringify(selectedItems));
    fd.append("bulk_description", bulkDesc.toString());
    fd.append("bulk_metaTitle", bulkMeta.toString());
    fd.append("bulk_metaDescription", bulkMeta.toString());
    fd.append("bulk_faq", bulkFaq.toString());
    submit(fd, { method: "POST" });
  }, [selectedItems, bulkDesc, bulkMeta, bulkFaq, submit]);

  return (
    <Page
      title="Products"
      subtitle={`${totalProducts} products · ${publishedCount} optimised · ${noContentCount} need content`}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {/* Stats Bar */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="headingXl" fontWeight="bold" tone="success">{publishedCount}</Text>
                <Text as="p" variant="bodySm" tone="subdued">AI Content Published</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="headingXl" fontWeight="bold">{draftCount}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Drafts to Review</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="headingXl" fontWeight="bold" tone="critical">{noContentCount}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Need Content</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Bulk generation panel — visible only when items are selected */}
        {selectedItems.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Generate for {selectedItems.length} selected product{selectedItems.length > 1 ? "s" : ""}
                </Text>
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={() => setSelectedItems([])}
                >
                  Clear selection
                </Button>
              </InlineStack>

              {bulkError && (
                <Banner tone="critical"><p>{bulkError}</p></Banner>
              )}

              <InlineStack gap="500" wrap={false}>
                <Checkbox
                  label="Description"
                  checked={bulkDesc}
                  onChange={setBulkDesc}
                  helpText="Full product description"
                />
                <Checkbox
                  label="Meta Title & Description"
                  checked={bulkMeta}
                  onChange={setBulkMeta}
                  helpText="SEO meta tags"
                />
                <Checkbox
                  label="FAQ Content"
                  checked={bulkFaq}
                  onChange={setBulkFaq}
                  helpText="Q&A pairs"
                />
              </InlineStack>

              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={handleBulkGenerate}
                >
                  Generate {selectedItems.length} Product{selectedItems.length > 1 ? "s" : ""} →
                </Button>
                <Text as="p" variant="bodySm" tone="subdued">
                  ~{Math.ceil(selectedItems.length * 3.5 / 60)} min estimated · runs in background
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Product List */}
        <Card padding="0">
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={filteredProducts}
            selectedItems={selectedItems}
            onSelectionChange={setSelectedItems}
            selectable
            filterControl={
              <Filters
                queryValue={searchValue}
                queryPlaceholder="Search products…"
                onQueryChange={handleSearchChange}
                onQueryClear={handleSearchClear}
                filters={[]}
                onClearAll={handleSearchClear}
              />
            }
            promotedBulkActions={[
              {
                content: `Generate for ${selectedItems.length} selected`,
                onAction: handleBulkGenerate,
              },
            ]}
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
                      content: "Generate",
                      onAction: () => navigate(`/app/products/${numericId}`),
                    },
                  ]}
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h3" variant="bodyMd" fontWeight="bold">{title}</Text>
                      <InlineStack gap="200">
                        <Text as="span" variant="bodySm" tone="subdued">${price}</Text>
                        {productType && (
                          <Text as="span" variant="bodySm" tone="subdued">· {productType}</Text>
                        )}
                      </InlineStack>
                      {getContentPreview(product)}
                    </BlockStack>
                    <BlockStack gap="200" inlineAlign="end">
                      {getStatusBadge(id)}
                      <Button size="slim" onClick={() => navigate(`/app/products/${numericId}`)}>
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
                <p>Add products to your Shopify store first, then come back to generate AI content.</p>
              </EmptyState>
            }
          />
          {(pageInfo?.hasPreviousPage || pageInfo?.hasNextPage) && (
            <Box padding="400" borderBlockStartWidth="025" borderColor="border">
              <InlineStack align="center" gap="300">
                <Button
                  disabled={!pageInfo.hasPreviousPage}
                  onClick={() => setSearchParams({ cursor: pageInfo.startCursor, dir: "prev" })}
                >
                  ← Previous
                </Button>
                <Text as="p" variant="bodySm" tone="subdued">
                  Showing {products.length} products
                </Text>
                <Button
                  disabled={!pageInfo.hasNextPage}
                  onClick={() => setSearchParams({ cursor: pageInfo.endCursor, dir: "next" })}
                >
                  Next →
                </Button>
              </InlineStack>
            </Box>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
