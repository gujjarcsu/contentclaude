import {
  useLoaderData,
  useActionData,
  useNavigate,
  useSubmit,
  redirect,
  useSearchParams,
} from "react-router";
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
  Icon,
} from "@shopify/polaris";
import { useState, useCallback, useMemo } from "react";
import { CheckCircleIcon, ClockIcon, AlertCircleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { publishesWithoutReview } from "../utils/publishSetting.server.js";
import {
  getOrCreatePlan,
  getMonthlyUsageCount,
  checkEntitlement,
  remainingGenerations,
  sliceToQuota,
} from "../utils/plans.server.js";
import { getEntitlements } from "../utils/billing-plans.js";
import { getContentMetrics, needsContentFrom } from "../utils/metrics.server.js";
import { enqueueGenerationJob } from "../queues/generationQueue.server.js";
import { UpgradePrompt } from "../components/UpgradePrompt.jsx";
import { useRouteLoading } from "../utils/useRouteLoading.js";

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

  // Phase 2 item 2.11 — the two Admin calls were already issued together, but
  // their bodies were then READ one after the other, below the batch: the
  // product-count parse could not start until the 50-product page had been
  // fully parsed. Reading the body is part of the round-trip, so both reads
  // now happen inside Promise.all.
  const [gqlData, plan, usageCount, metrics, productCountData, publishWithoutReview] = await Promise.all([
    admin.graphql(gqlQuery, { variables: { cursor } }).then((r) => r.json()),
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
    getContentMetrics(shop),
    admin.graphql(`query { productsCount { count } }`).then((r) => r.json()),
    publishesWithoutReview(shop),
  ]);

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

  const totalStoreProducts = productCountData.data?.productsCount?.count ?? products.length;

  // Content status only for the products visible on THIS page — a bounded query
  // (≤ PAGE_SIZE rows) instead of loading every GeneratedContent row for the shop.
  // This is the fix for the unbounded findMany that did not scale past ~10k products.
  const visibleIds = products.map((p) => p.id);
  const generatedContent = visibleIds.length
    ? await prisma.generatedContent.findMany({
        where: { shop, productId: { in: visibleIds } },
        select: { productId: true, contentType: true, status: true, updatedAt: true },
      })
    : [];

  // Per-product map for the visible page: { [productId]: { description: {status, updatedAt}, ... } }
  const contentMap = {};
  generatedContent.forEach(({ productId, contentType, status, updatedAt }) => {
    if (!contentMap[productId]) contentMap[productId] = {};
    contentMap[productId][contentType] = { status, updatedAt };
  });

  // Phase 2 item 2.1 - read, never recompute. This page used to derive
  // "needs content" as total - published - draft, which undercounted every
  // product that had a published description AND a draft meta title, because
  // those were counted in both. The states are mutually exclusive now and
  // sum to totalStoreProducts.
  const publishedProducts = metrics.publishedProducts;
  const draftProducts = metrics.draftProducts;
  const noContentProducts = needsContentFrom(metrics, totalStoreProducts);

  const usageRemaining = Math.max(0, plan.monthlyLimit - usageCount);

  return Response.json({
    products,
    contentMap,
    pageInfo,
    statusFilter,
    totalStoreProducts,
    publishedProducts,
    draftProducts,
    noContentProducts,
    usageCount,
    usageRemaining,
    monthlyLimit: plan.monthlyLimit,
    planName: plan.planName,
    entitlements: getEntitlements(plan.planName),
    publishWithoutReview,
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType") || "generateSelected";

  const contentTypes = ["description", "metaTitle", "metaDescription", "faq"].filter(
    (t) => formData.get(`bulk_${t}`) === "true",
  );
  if (contentTypes.length === 0) return { error: "Select at least one content type." };
  // Phase 2 item 2.6 - read from Settings, never from the form. This panel
  // submitted with no confirmation at all.
  const autoPublish = await publishesWithoutReview(shop);

  // Bulk jobs are a Growth+ feature — enforce server-side
  const bulkEnt = await checkEntitlement(shop, "bulkJobs");
  if (!bulkEnt.allowed) {
    return {
      error: `Bulk generation requires the ${bulkEnt.requiredPlan ?? "Growth"} plan. Upgrade to unlock bulk jobs.`,
      limitReached: true,
    };
  }

  if (actionType === "generateAll") {
    const allIds = [];
    let cursor = null;
    let hasNextPage = true;
    let pageCount = 0;
    const MAX_PAGES = 80;

    while (hasNextPage && pageCount < MAX_PAGES) {
      pageCount++;
      let resp;
      try {
        resp = await admin.graphql(
          `query($cursor: String) {
            products(first: 250, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              edges { node { id } }
            }
          }`,
          { variables: { cursor } },
        );
      } catch {
        if (allIds.length > 0) break;
        return { error: "Could not fetch your product list from Shopify. Please try again." };
      }
      const { data } = await resp.json();
      if (!data?.products) {
        if (allIds.length > 0) break;
        return { error: "Shopify returned an unexpected response. Please try again." };
      }
      const { edges, pageInfo } = data.products;
      allIds.push(...edges.map((e) => e.node.id));
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }
    if (allIds.length === 0) return { error: "No products found in your store." };

    // Phase 0 item 4 — enqueue only what the quota can pay for; record the rest.
    const remainingAll = await remainingGenerations(shop);
    const { targetIds: runAllIds, quotaSkipped: skippedAll } = sliceToQuota(allIds, remainingAll);
    if (runAllIds.length === 0) {
      return {
        error: "You have no generations left this month, so there is nothing to run.",
        limitReached: true,
      };
    }

    const job = await prisma.generationJob.create({
      data: {
        shop,
        status: "queued",
        totalProducts: runAllIds.length,
        productIds: JSON.stringify(runAllIds),
        contentTypes: contentTypes.join(","),
        autoPublish,
        quotaSkipped: skippedAll,
      },
    });
    try {
      await enqueueGenerationJob(job.id);
    } catch (err) {
      // Concurrent-job cap (or enqueue failure) — show a banner, not the
      // full-page error boundary.
      return {
        error: err.message?.startsWith("You already have jobs")
          ? err.message
          : "Could not start the bulk job. Please try again.",
      };
    }
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

  // Phase 0 item 4 — same rule for an explicit selection.
  const remainingSel = await remainingGenerations(shop);
  const { targetIds: runSelIds, quotaSkipped: skippedSel } = sliceToQuota(selectedIds, remainingSel);
  if (runSelIds.length === 0) {
    return {
      error: "You have no generations left this month, so there is nothing to run.",
      limitReached: true,
    };
  }

  const job = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: runSelIds.length,
      productIds: JSON.stringify(runSelIds),
      contentTypes: contentTypes.join(","),
      autoPublish,
      quotaSkipped: skippedSel,
    },
  });
  try {
    await enqueueGenerationJob(job.id);
  } catch (err) {
    return {
      error: err.message?.startsWith("You already have jobs")
        ? err.message
        : "Could not start the bulk job. Please try again.",
    };
  }
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
    products,
    contentMap,
    pageInfo,
    statusFilter,
    totalStoreProducts,
    publishedProducts,
    draftProducts,
    noContentProducts,
    usageCount,
    usageRemaining,
    monthlyLimit,
    planName,
    entitlements,
    publishWithoutReview,
  } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const loadingThisRoute = useRouteLoading();
  // Action failures (plan gates, invalid selection, Shopify fetch errors) MUST
  // be visible — on success the action redirects to /app/jobs, so any object
  // return here is an error the merchant needs to see.
  const actionData = useActionData();
  const [, setSearchParams] = useSearchParams();

  const [searchValue, setSearchValue] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [bulkDesc, setBulkDesc] = useState(true);
  const [bulkMeta, setBulkMeta] = useState(true);
  const [bulkFaq, setBulkFaq] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [generateAllModal, setGenerateAllModal] = useState(false);
  // Phase 2 item 2.6 — the pending bulk run held back by the publish-without-review
  // confirm: { actionType, ids } while the modal is open, null otherwise.
  const [publishConfirm, setPublishConfirm] = useState(null);

  const handleSearchChange = useCallback((v) => setSearchValue(v), []);
  const handleSearchClear = useCallback(() => setSearchValue(""), []);

  // Store-wide coverage counts come from the loader (aggregated, accurate across
  // all pages). contentMap below is scoped to the visible page for per-row pills.
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
    p.title.toLowerCase().includes(searchValue.toLowerCase()),
  );

  // Tab counts are scoped to the CURRENT page (the tabs filter only the
  // visible 50-product page). Using store-wide counts here made labels like
  // "Draft (120)" sit above an empty list — the store-wide totals live in the
  // stat cards above instead.
  const pageCounts = useMemo(() => {
    let draft = 0,
      published = 0,
      none = 0;
    for (const p of products) {
      const s = contentMap[p.id]?.description?.status;
      if (s === "published") published++;
      else if (s === "draft") draft++;
      else none++;
    }
    return { draft, published, none };
  }, [products, contentMap]);

  const tabs = useMemo(
    () => [
      { id: "all", content: `All (${products.length} on page)`, panelID: "all" },
      { id: "needsContent", content: `Needs Content (${pageCounts.none})`, panelID: "needsContent" },
      { id: "draft", content: `Draft (${pageCounts.draft})`, panelID: "draft" },
      { id: "published", content: `Published (${pageCounts.published})`, panelID: "published" },
    ],
    [products.length, pageCounts],
  );
  const selectedTabIndex = tabs.findIndex((t) => t.id === statusFilter);
  const activeTab = selectedTabIndex >= 0 ? selectedTabIndex : 0;

  const handleTabChange = useCallback(
    (index) => {
      const tabId = tabs[index].id;
      setSearchParams({ status: tabId });
      setSelectedItems([]);
    },
    [tabs, setSearchParams],
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
          // A "✓" must mean the content is actually LIVE (published) — for FAQ that
          // is exactly when the faq_schema metafield is written. Draft = generated
          // but not yet live (info, no ✓). Rejected / none = not covered (muted, no
          // ✓). Showing "FAQ ✓" for a rejected or unpublished row overclaims.
          if (s === "published") {
            return (
              <Box key={key} padding="100" background="bg-surface-success" borderRadius="100">
                <Text as="span" variant="bodySm" tone="success">
                  {label} ✓
                </Text>
              </Box>
            );
          }
          if (s === "draft") {
            return (
              <Box key={key} padding="100" background="bg-surface-info" borderRadius="100">
                <Text as="span" variant="bodySm" tone="info">
                  {label} · draft
                </Text>
              </Box>
            );
          }
          // rejected, or no content generated → muted, never a checkmark
          return (
            <Box key={key} padding="100" background="bg-surface-secondary" borderRadius="100">
              <Text as="span" variant="bodySm" tone="subdued">
                {label}
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
      return fd;
    },
    [bulkDesc, bulkMeta, bulkFaq],
  );

  const handleBulkGenerate = useCallback(() => {
    if (!bulkDesc && !bulkMeta && !bulkFaq) {
      setBulkError("Select at least one content type to generate.");
      return;
    }
    setBulkError("");
    if (publishWithoutReview) {
      setPublishConfirm({ actionType: "generateSelected", ids: selectedItems });
      return;
    }
    submit(buildBulkFormData("generateSelected", selectedItems), { method: "POST" });
  }, [selectedItems, bulkDesc, bulkMeta, bulkFaq, buildBulkFormData, submit, publishWithoutReview]);

  const handleGenerateAll = useCallback(() => {
    if (!bulkDesc && !bulkMeta && !bulkFaq) {
      setBulkError("Select at least one content type to generate.");
      return;
    }
    setBulkError("");
    setGenerateAllModal(false);
    if (publishWithoutReview) {
      setPublishConfirm({ actionType: "generateAll", ids: null });
      return;
    }
    submit(buildBulkFormData("generateAll", null), { method: "POST" });
  }, [bulkDesc, bulkMeta, bulkFaq, buildBulkFormData, submit, publishWithoutReview]);

  if (loadingThisRoute) return <ProductListSkeleton />;

  return (
    <Page
      title="Products"
      subtitle={`${totalStoreProducts} products · ${publishedProducts} live · ${draftProducts} ready to review · ${noContentProducts} need content`}
      backAction={{ content: "Home", onAction: () => navigate("/app") }}
      /* Phase 2 item 2.3 — ONE bulk action, with ONE name.
         There were six labels for this job on this page alone: "Generate All
         (17)", "Quick Generate", "Generate {n} Products", "Generate for {n}
         selected", a per-row "Generate" that only navigated, and "Start Bulk
         Job" in the modal. Plus "Optimize N Products", "Fix All Missing
         Content" and "Refresh Stale Content" on other screens.

         It is now "Optimize store" everywhere, it always means the same thing —
         generate for every product that needs content, save as drafts, go to
         Review — and it is the page's PRIMARY action rather than a secondary
         one, which is what it always was in the merchant's head.

         Phase 2 item 2.7 — exactly one primary, chosen by state, never
         disabled. With nothing to do it is not rendered at all. */
      primaryAction={
        noContentProducts > 0
          ? {
              content: `Optimize store (${noContentProducts})`,
              onAction: () => (entitlements?.bulkJobs ? setGenerateAllModal(true) : navigate("/app/plans")),
            }
          : undefined
      }
      secondaryActions={[
        ...(draftProducts > 0
          ? [{ content: `Review ${draftProducts} drafts`, onAction: () => navigate("/app/review") }]
          : []),
        // Phase 2 item 2.2 — these left the sidebar, so they need a way back in
        // from the screen that absorbed them. Nothing became unreachable.
        { content: "Collections", onAction: () => navigate("/app/collections") },
        { content: "Activity", onAction: () => navigate("/app/jobs") },
      ]}
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner
            tone={actionData.limitReached ? "warning" : "critical"}
            title={actionData.limitReached ? "Plan upgrade required" : "Could not start generation"}
            action={
              actionData.limitReached
                ? { content: "View Plans", onAction: () => navigate("/app/plans") }
                : undefined
            }
          >
            <p>{actionData.error}</p>
          </Banner>
        )}

        {/* Usage alert "" only when critical */}
        {isOutOfUsage && (
          <Banner tone="critical" title="Monthly generation limit reached">
            <p>
              You've used all {monthlyLimit} generations for this month. Upgrade to keep optimizing your
              store.
            </p>
            <Box paddingBlockStart="200">
              <Button variant="plain" onClick={() => navigate("/app/plans")}>
                View plans
              </Button>
            </Box>
          </Banner>
        )}
        {isLowUsage && (
          <UpgradePrompt
            tone="warning"
            title={`Only ${usageRemaining} generation${usageRemaining !== 1 ? "s" : ""} left this month`}
            message={`You've used ${usageCount} of ${monthlyLimit}. Upgrade now to keep generating without interruption.`}
            ctaLabel="Upgrade plan"
            onUpgrade={() => navigate("/app/plans")}
          />
        )}

        {/* Stat bar */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={CheckCircleIcon} tone="success" />
                  <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                    {publishedProducts}
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  AI Content Published
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={ClockIcon} tone="info" />
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    {draftProducts}
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Drafts to Review
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={AlertCircleIcon} tone={noContentProducts > 0 ? "critical" : "subdued"} />
                  <Text
                    as="p"
                    variant="headingXl"
                    fontWeight="bold"
                    tone={noContentProducts > 0 ? "critical" : undefined}
                  >
                    {noContentProducts}
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Need Content
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Usage mini-bar "" show for free plan or when usage is above half */}
        {(planName === "free" || usagePct >= 50) && (
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" fontWeight="semibold">
                  Monthly Generations
                </Text>
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
              <ProgressBar progress={usagePct} tone={usagePct >= 90 ? "critical" : "success"} size="small" />
            </BlockStack>
          </Card>
        )}

        {/* Bulk generation panel */}
        {selectedItems.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Optimize {selectedItems.length} selected product{selectedItems.length > 1 ? "s" : ""}
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
                  {bulkError && (
                    <Banner tone="critical">
                      <p>{bulkError}</p>
                    </Banner>
                  )}

                  <Banner tone="warning">
                    <p>
                      <strong>This will replace existing product descriptions entirely.</strong>
                      {""}
                      Original content is saved automatically and can be restored from each product&apos;s
                      History tab. If a product has custom HTML, embedded videos, or widgets in its
                      description, they will be removed.
                    </p>
                  </Banner>

                  {/* BlockStack + minHeight 44px = Apple/Google touch-target minimum */}
                  <BlockStack gap="200">
                    <Box minHeight="44px" paddingBlockStart="100" paddingBlockEnd="100">
                      <Checkbox
                        label="Description"
                        checked={bulkDesc}
                        onChange={setBulkDesc}
                        helpText="Full product description"
                      />
                    </Box>
                    <Box minHeight="44px" paddingBlockStart="100" paddingBlockEnd="100">
                      <Checkbox
                        label="Meta Title & Description"
                        checked={bulkMeta}
                        onChange={setBulkMeta}
                        helpText="SEO meta tags"
                      />
                    </Box>
                    <Box minHeight="44px" paddingBlockStart="100" paddingBlockEnd="100">
                      <Checkbox
                        label="FAQ Content"
                        checked={bulkFaq}
                        onChange={setBulkFaq}
                        helpText="Q&A pairs"
                      />
                    </Box>
                  </BlockStack>

                  <InlineStack gap="300" blockAlign="center">
                    <Button variant="primary" onClick={handleBulkGenerate}>
                      Optimize {selectedItems.length} product{selectedItems.length > 1 ? "s" : ""}
                    </Button>
                    <Text as="p" variant="bodySm" tone="subdued">
                      ~{Math.ceil((selectedItems.length * 3.5) / 60)} min estimated · runs in background
                    </Text>
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
                queryPlaceholder="Search products..."
                onQueryChange={handleSearchChange}
                onQueryClear={handleSearchClear}
                filters={[]}
                onClearAll={handleSearchClear}
              />
            }
            promotedBulkActions={[
              {
                content: `Optimize ${selectedItems.length} selected`,
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
                      // Phase 2 item 2.3 - this used to be 'Quick Generate'
                      // and it submitted a BULK job, so on Free and Starter
                      // the most obvious button on the row answered 'Bulk
                      // generation requires Growth'. It now opens the product
                      // page, where a single generation is something every
                      // plan can do. One action, because the row itself
                      // already opens the same page.
                      content: "Generate",
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
                  statusFilter !== "all"
                    ? "No products match this filter"
                    : totalStoreProducts === 0
                      ? "No products yet"
                      : "Nothing on this page"
                }
                image="/empty-products.svg"
                action={
                  statusFilter !== "all"
                    ? { content: "View all products", onAction: () => setSearchParams({}) }
                    : { content: "Go to Dashboard", onAction: () => navigate("/app") }
                }
              >
                <p>
                  {statusFilter !== "all"
                    ? "Try another tab, or clear the filter."
                    : totalStoreProducts === 0
                      ? "Add products to your store, and this is where you generate content for them."
                      : "Try clearing your search."}
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
                  Previous
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
                  Next
                </Button>
              </InlineStack>
            </Box>
          )}
        </Card>

        {/* Generate All confirmation modal */}
        <Modal
          open={generateAllModal}
          onClose={() => setGenerateAllModal(false)}
          title={`Optimize ${noContentProducts} products?`}
          primaryAction={{ content: "Optimize store", onAction: handleGenerateAll }}
          secondaryActions={[{ content: "Cancel", onAction: () => setGenerateAllModal(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                This creates a background job for all {totalStoreProducts} products. Estimated time: ~
                {Math.ceil((totalStoreProducts * 3.5) / 60)} minutes.
              </Text>
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Content to generate:
              </Text>
              <Checkbox label="Description" checked={bulkDesc} onChange={setBulkDesc} />
              <Checkbox label="Meta Title & Description" checked={bulkMeta} onChange={setBulkMeta} />
              <Checkbox label="FAQ Content" checked={bulkFaq} onChange={setBulkFaq} />
              {bulkError && (
                <Banner tone="critical">
                  <p>{bulkError}</p>
                </Banner>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Publish-without-review confirmation. Driven by the merchant's Settings
            value, not by a per-run checkbox — this panel used to submit with no
            confirmation at all. */}
        <Modal
          open={publishConfirm !== null}
          onClose={() => setPublishConfirm(null)}
          title="Publish without review is on"
          primaryAction={{
            content: "Generate and publish",
            destructive: true,
            onAction: () => {
              const pending = publishConfirm;
              setPublishConfirm(null);
              if (pending) submit(buildBulkFormData(pending.actionType, pending.ids), { method: "POST" });
            },
          }}
          secondaryActions={[{ content: "Cancel", onAction: () => setPublishConfirm(null) }]}
        >
          <Modal.Section>
            <Text as="p" variant="bodyMd">
              This will publish straight to your live storefront without a review step. You can turn this off
              in Settings.
            </Text>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
