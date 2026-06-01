import { useLoaderData, useNavigate, useSubmit, redirect, useSearchParams, useNavigation } from "react-router";
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
  Tabs,
  Modal,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
  ProgressBar,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreatePlan, getMonthlyUsageCount } from "../utils/plans.server.js";
import { enqueueGenerationJob } from "../queues/generationQueue.server";
import { UpgradePrompt } from "../components/UpgradePrompt";

const PAGE_SIZE = 50;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  const direction = url.searchParams.get("dir") || "next";
  const statusFilter = url.searchParams.get("status") || "all";

  const gqlQuery =
    direction === "prev"
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

  const [gqlResponse, generatedContent, plan, usageCount] = await Promise.all([
    admin.graphql(gqlQuery, { variables: { cursor } }),
    prisma.generatedContent.findMany({
      where: { shop },
      select: { productId: true, contentType: true, status: true, updatedAt: true },
    }),
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
  ]);

  const gqlData = await gqlResponse.json();
  const { edges, pageInfo } = gqlData.data.products;
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

  // Per-product map: { [productId]: { description: {status, updatedAt}, metaTitle: ..., ... } }
  const contentMap = {};
  const dbCounts = { draft: 0, published: 0 };
  generatedContent.forEach(({ productId, contentType, status, updatedAt }) => {
    if (!contentMap[productId]) contentMap[productId] = {};
    contentMap[productId][contentType] = { status, updatedAt };
    if (contentType === "description") {
      if (status === "draft") dbCounts.draft++;
      else if (status === "published") dbCounts.published++;
    }
  });

  const usageRemaining = Math.max(0, plan.monthlyLimit - usageCount);

  return Response.json({
    products,
    contentMap,
    pageInfo,
    statusFilter,
    dbCounts,
    usageCount,
    usageRemaining,
    monthlyLimit: plan.monthlyLimit,
    planName: plan.planName,
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType") || "generateSelected";

  const contentTypes = ["description", "metaTitle", "metaDescription", "faq"].filter(
    (t) => formData.get(`bulk_${t}`) === "true"
  );
  if (contentTypes.length === 0) return { error: "Select at least one content type." };
  const autoPublish = formData.get("bulk_autoPublish") === "true";

  if (actionType === "generateAll") {
    const allIds = [];
    let cursor = null;
    let hasNextPage = true;
    while (hasNextPage) {
      const resp = await admin.graphql(
        `query($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges { node { id } }
          }
        }`,
        { variables: { cursor } }
      );
      const { data } = await resp.json();
      const { edges, pageInfo } = data.products;
      allIds.push(...edges.map((e) => e.node.id));
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }
    if (allIds.length === 0) return { error: "No products found in your store." };

    const job = await prisma.generationJob.create({
      data: {
        shop,
        status: "queued",
        totalProducts: allIds.length,
        productIds: JSON.stringify(allIds),
        contentTypes: contentTypes.join(","),
        autoPublish,
      },
    });
    await enqueueGenerationJob(job.id);
    return redirect("/app/jobs");
  }

  let selectedIds;
  try {
    selectedIds = JSON.parse(formData.get("selectedIds") || "[]");
    if (!Array.isArray(selectedIds)) selectedIds = [];
  } catch {
    return { error: "Invalid selection data. Please refresh and try again." };
  }
  if (selectedIds.length === 0) return { error: "No products selected." };

  const job = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: selectedIds.length,
      productIds: JSON.stringify(selectedIds),
      contentTypes: contentTypes.join(","),
      autoPublish,
    },
  });
  await enqueueGenerationJob(job.id);
  return redirect("/app/jobs");
};

function ProductListSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <Layout>
        {[1, 2, 3].map((i) => (
          <Layout.Section key={i} variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={1} />
              </BlockStack>
            </Card>
          </Layout.Section>
        ))}
      </Layout>
      <Card>
        <BlockStack gap="400">
          {[1, 2, 3, 4, 5].map((i) => (
            <InlineStack key={i} gap="400" blockAlign="center">
              <SkeletonThumbnail size="medium" />
              <BlockStack gap="200">
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={1} />
              </BlockStack>
            </InlineStack>
          ))}
        </BlockStack>
      </Card>
    </SkeletonPage>
  );
}

export default function ProductsPage() {
  const {
    products, contentMap, pageInfo, statusFilter, dbCounts,
    usageCount, usageRemaining, monthlyLimit, planName,
  } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [, setSearchParams] = useSearchParams();

  const [searchValue, setSearchValue] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [bulkDesc, setBulkDesc] = useState(true);
  const [bulkMeta, setBulkMeta] = useState(true);
  const [bulkFaq, setBulkFaq] = useState(false);
  const [bulkAutoPublish, setBulkAutoPublish] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [generateAllModal, setGenerateAllModal] = useState(false);

  const handleSearchChange = useCallback((v) => setSearchValue(v), []);
  const handleSearchClear = useCallback(() => setSearchValue(""), []);

  // Derived values (no hooks below)
  const totalProducts = products.length;
  const publishedCount = Object.values(contentMap).filter((m) => m.description?.status === "published").length;
  const draftCount = Object.values(contentMap).filter((m) => m.description?.status === "draft").length;
  const noContentCount = totalProducts - publishedCount - draftCount;
  const usagePct = monthlyLimit > 0 ? Math.min(100, Math.round((usageCount / monthlyLimit) * 100)) : 0;
  const isLowUsage = usageRemaining > 0 && usageRemaining <= 5;
  const isOutOfUsage = usageRemaining === 0;

  const tabFilteredProducts = products.filter((p) => {
    if (statusFilter === "draft") return contentMap[p.id]?.description?.status === "draft";
    if (statusFilter === "published") return contentMap[p.id]?.description?.status === "published";
    if (statusFilter === "needsContent") return !contentMap[p.id]?.description;
    return true;
  });

  const filteredProducts = tabFilteredProducts.filter((p) =>
    p.title.toLowerCase().includes(searchValue.toLowerCase())
  );

  const tabs = [
    { id: "all", content: `All (${totalProducts})`, panelID: "all" },
    { id: "needsContent", content: `Needs Content (${noContentCount})`, panelID: "needsContent" },
    { id: "draft", content: `Draft (${dbCounts.draft})`, panelID: "draft" },
    { id: "published", content: `Published (${dbCounts.published})`, panelID: "published" },
  ];
  const selectedTabIndex = tabs.findIndex((t) => t.id === statusFilter);
  const activeTab = selectedTabIndex >= 0 ? selectedTabIndex : 0;

  const handleTabChange = useCallback(
    (index) => {
      const tabId = tabs[index].id;
      setSearchParams({ status: tabId });
      setSelectedItems([]);
    },
    [tabs, setSearchParams]
  );

  function getStatusBadge(productId) {
    const m = contentMap[productId];
    if (!m?.description) return <Badge tone="attention">No AI Content</Badge>;
    if (m.description.status === "published") return <Badge tone="success">Published</Badge>;
    if (m.description.status === "draft") return <Badge tone="info">Draft Ready</Badge>;
    return <Badge>Unknown</Badge>;
  }

  function getContentTypePills(productId) {
    const m = contentMap[productId] || {};
    const types = [
      { key: "description", label: "Desc" },
      { key: "metaTitle", label: "Meta" },
      { key: "faq", label: "FAQ" },
    ];
    return (
      <InlineStack gap="100">
        {types.map(({ key, label }) => {
          const s = m[key]?.status;
          if (!s) {
            return (
              <Box key={key} padding="100" background="bg-surface-secondary" borderRadius="100">
                <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
              </Box>
            );
          }
          return (
            <Box
              key={key}
              padding="100"
              background={s === "published" ? "bg-surface-success" : "bg-surface-info"}
              borderRadius="100"
            >
              <Text as="span" variant="bodySm" tone={s === "published" ? "success" : "info"}>
                {label} âœ“
              </Text>
            </Box>
          );
        })}
      </InlineStack>
    );
  }

  const buildBulkFormData = useCallback(
    (actionType, ids) => {
      const fd = new FormData();
      fd.append("actionType", actionType);
      if (ids) fd.append("selectedIds", JSON.stringify(ids));
      fd.append("bulk_description", bulkDesc.toString());
      fd.append("bulk_metaTitle", bulkMeta.toString());
      fd.append("bulk_metaDescription", bulkMeta.toString());
      fd.append("bulk_faq", bulkFaq.toString());
      fd.append("bulk_autoPublish", bulkAutoPublish.toString());
      return fd;
    },
    [bulkDesc, bulkMeta, bulkFaq, bulkAutoPublish]
  );

  const handleBulkGenerate = useCallback(() => {
    if (!bulkDesc && !bulkMeta && !bulkFaq) {
      setBulkError("Select at least one content type to generate.");
      return;
    }
    setBulkError("");
    submit(buildBulkFormData("generateSelected", selectedItems), { method: "POST" });
  }, [selectedItems, bulkDesc, bulkMeta, bulkFaq, buildBulkFormData, submit]);

  const handleGenerateAll = useCallback(() => {
    if (!bulkDesc && !bulkMeta && !bulkFaq) {
      setBulkError("Select at least one content type to generate.");
      return;
    }
    setBulkError("");
    setGenerateAllModal(false);
    submit(buildBulkFormData("generateAll", null), { method: "POST" });
  }, [bulkDesc, bulkMeta, bulkFaq, buildBulkFormData, submit]);

  if (navigation.state === "loading") return <ProductListSkeleton />;

  return (
    <Page
      title="Products"
      subtitle={`${totalProducts} products Â· ${publishedCount} optimised Â· ${noContentCount} need content`}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      secondaryActions={[
        {
          content: "Review Drafts",
          onAction: () => navigate("/app/review"),
          disabled: dbCounts.draft === 0,
        },
        {
          content: `Generate All (${totalProducts})`,
          onAction: () => setGenerateAllModal(true),
        },
        {
          content: "Bulk Jobs â†’",
          onAction: () => navigate("/app/jobs"),
        },
      ]}
    >
      <BlockStack gap="500">

        {/* Usage alert â€” only when critical */}
        {isOutOfUsage && (
          <Banner tone="critical" title="Monthly generation limit reached">
            <p>You've used all {monthlyLimit} generations for this month. Upgrade to keep optimising your store.</p>
            <Box paddingBlockStart="200">
              <Button variant="plain" onClick={() => navigate("/app/plans")}>View Plans & Upgrade â†’</Button>
            </Box>
          </Banner>
        )}
        {isLowUsage && (
          <UpgradePrompt
            compact
            tone="warning"
            title={`Only ${usageRemaining} generation${usageRemaining !== 1 ? "s" : ""} left this month`}
            message={`${usageCount}/${monthlyLimit} used Â· upgrade to continue without interruption`}
            onUpgrade={() => navigate("/app/plans")}
          />
        )}

        {/* Stat bar */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <CheckCircle2 size={20} color="#00A047" />
                  <Text as="p" variant="headingXl" fontWeight="bold" tone="success">{publishedCount}</Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">AI Content Published</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Clock size={20} color="#1656AC" />
                  <Text as="p" variant="headingXl" fontWeight="bold">{draftCount}</Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">Drafts to Review</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <AlertCircle size={20} color={noContentCount > 0 ? "#E51C00" : "#8C9196"} />
                  <Text as="p" variant="headingXl" fontWeight="bold" tone={noContentCount > 0 ? "critical" : undefined}>
                    {noContentCount}
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">Need Content</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Usage mini-bar â€” show for free plan or when usage is above half */}
        {(planName === "free" || usagePct >= 50) && (
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" fontWeight="semibold">Monthly Generations</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {usageCount} / {monthlyLimit} used
                  </Text>
                  {planName === "free" && (
                    <Button size="slim" variant="plain" onClick={() => navigate("/app/plans")}>
                      Upgrade
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
              <ProgressBar
                progress={usagePct}
                tone={usagePct >= 90 ? "critical" : usagePct >= 60 ? "highlight" : "success"}
                size="small"
              />
            </BlockStack>
          </Card>
        )}

        {/* Bulk generation panel */}
        {selectedItems.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Generate for {selectedItems.length} selected product{selectedItems.length > 1 ? "s" : ""}
                </Text>
                <Button variant="plain" tone="critical" onClick={() => setSelectedItems([])}>
                  Clear selection
                </Button>
              </InlineStack>

              {isOutOfUsage ? (
                <UpgradePrompt
                  tone="warning"
                  title="No generations remaining"
                  message="Upgrade your plan to generate content for these products"
                  onUpgrade={() => navigate("/app/plans")}
                />
              ) : (
                <>
                  {bulkError && <Banner tone="critical"><p>{bulkError}</p></Banner>}

                  <InlineStack gap="500" wrap>
                    <Checkbox label="Description" checked={bulkDesc} onChange={setBulkDesc} helpText="Full product description" />
                    <Checkbox label="Meta Title & Description" checked={bulkMeta} onChange={setBulkMeta} helpText="SEO meta tags" />
                    <Checkbox label="FAQ Content" checked={bulkFaq} onChange={setBulkFaq} helpText="Q&A pairs" />
                    <Checkbox label="Auto-publish" checked={bulkAutoPublish} onChange={setBulkAutoPublish} helpText="Push to Shopify immediately â€” skips review" />
                  </InlineStack>

                  <InlineStack gap="300" blockAlign="center">
                    <Button variant="primary" onClick={handleBulkGenerate}>
                      Generate {selectedItems.length} Product{selectedItems.length > 1 ? "s" : ""} â†’
                    </Button>
                    <Text as="p" variant="bodySm" tone="subdued">
                      ~{Math.ceil((selectedItems.length * 3.5) / 60)} min estimated Â· runs in background
                    </Text>
                    {isLowUsage && (
                      <Text as="p" variant="bodySm" tone="critical">
                        Only {usageRemaining} generation{usageRemaining !== 1 ? "s" : ""} left!
                      </Text>
                    )}
                  </InlineStack>
                </>
              )}
            </BlockStack>
          </Card>
        )}

        {/* Product list with status tabs */}
        <Card padding="0">
          <Tabs tabs={tabs} selected={activeTab} onSelect={handleTabChange} fitted />
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={filteredProducts}
            selectedItems={selectedItems}
            onSelectionChange={setSelectedItems}
            selectable
            filterControl={
              <Filters
                queryValue={searchValue}
                queryPlaceholder="Search productsâ€¦"
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
                      source={
                        imageUrl ||
                        "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"
                      }
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
                          <Text as="span" variant="bodySm" tone="subdued">Â· {productType}</Text>
                        )}
                      </InlineStack>
                      {getContentTypePills(id)}
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
                heading={
                  statusFilter === "all"
                    ? "Your store is all set!"
                    : `No ${statusFilter} products found`
                }
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={
                  statusFilter !== "all"
                    ? { content: "View all products", onAction: () => setSearchParams({}) }
                    : { content: "Go to Dashboard", onAction: () => navigate("/app") }
                }
              >
                <p>
                  {statusFilter === "all"
                    ? "Add products in Shopify, then come back here to generate AI content for them."
                    : `No products match the "${statusFilter}" filter. Try switching tabs or clearing the filter.`}
                </p>
              </EmptyState>
            }
          />
          {(pageInfo?.hasPreviousPage || pageInfo?.hasNextPage) && (
            <Box padding="400" borderBlockStartWidth="025" borderColor="border">
              <InlineStack align="center" gap="300">
                <Button
                  disabled={!pageInfo.hasPreviousPage}
                  onClick={() =>
                    setSearchParams({ cursor: pageInfo.startCursor, dir: "prev", status: statusFilter })
                  }
                >
                  â† Previous
                </Button>
                <Text as="p" variant="bodySm" tone="subdued">
                  Showing {filteredProducts.length} products
                </Text>
                <Button
                  disabled={!pageInfo.hasNextPage}
                  onClick={() =>
                    setSearchParams({ cursor: pageInfo.endCursor, dir: "next", status: statusFilter })
                  }
                >
                  Next â†’
                </Button>
              </InlineStack>
            </Box>
          )}
        </Card>

        {/* Generate All confirmation modal */}
        <Modal
          open={generateAllModal}
          onClose={() => setGenerateAllModal(false)}
          title={`Generate content for all ${totalProducts} products?`}
          primaryAction={{ content: "Start Bulk Job", onAction: handleGenerateAll }}
          secondaryActions={[{ content: "Cancel", onAction: () => setGenerateAllModal(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                This creates a background job for all {totalProducts} products. Estimated time: ~{Math.ceil((totalProducts * 3.5) / 60)} minutes.
              </Text>
              <Text as="p" variant="bodySm" fontWeight="semibold">Content to generate:</Text>
              <Checkbox label="Description" checked={bulkDesc} onChange={setBulkDesc} />
              <Checkbox label="Meta Title & Description" checked={bulkMeta} onChange={setBulkMeta} />
              <Checkbox label="FAQ Content" checked={bulkFaq} onChange={setBulkFaq} />
              <Checkbox
                label="Auto-publish (skip review)"
                checked={bulkAutoPublish}
                onChange={setBulkAutoPublish}
                helpText="Pushes directly to Shopify â€” no review step"
              />
              {bulkError && <Banner tone="critical"><p>{bulkError}</p></Banner>}
            </BlockStack>
          </Modal.Section>
        </Modal>

      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
