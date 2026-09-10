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
import { quotaPct } from "../utils/quota.js";
import {
  getOrCreatePlan,
  getMonthlyUsageCount,
  checkEntitlement,
  remainingGenerations,
  sliceToQuota,
} from "../utils/plans.server.js";
import { getEntitlements } from "../utils/billing-plans.js";
import { getContentMetrics } from "../utils/metrics.server.js";
import { getCandidateCounts, notOptimizedFrom, splitByQuota } from "../utils/candidates.server.js";
import {
  actionFor,
  hasRealContent,
  CONTENT_ACTION_LABEL,
  CONTENT_ACTION_TONE,
} from "../utils/candidates.js";
import { enqueueGenerationJob } from "../queues/generationQueue.server.js";
import { QuotaWarningBanner, QuotaReachedCard } from "../components/UpgradePrompt.jsx";
import { getQuotaWarning } from "../utils/quotaSurfaces.server.js";
import { PRODUCT_STATE, PRODUCT_STATE_LABEL, stateOfContentMap } from "../utils/productState.js";
import { productScoresFor } from "../utils/storeScore.server.js";
import { shopifyQuery, productsPage } from "../utils/shopifyQuery.server.js";
import { publishProductWithRetry } from "../utils/adminGraphql.server.js";
import { getUpsell } from "../utils/upgradePrompts.server.js";
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
  const [gqlData, plan, usageCount, metrics, candidateCounts, publishWithoutReview, remaining] =
    await Promise.all([
    shopifyQuery(admin.graphql, gqlQuery, { cursor }, { shop, label: "products page" }),
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
    getContentMetrics(shop),
    // Group 1 — this was `productsCount { count }`, unfiltered, and it became
    // the Products header, the "Need Content" card, the "Optimize store (N)"
    // label, the confirmation modal and the SEO Audit population. On a 3,148
    // product catalogue of which 1,350 were active, every one of them said
    // 3,148. One line, five symptoms.
    getCandidateCounts(admin, shop),
    publishesWithoutReview(shop),
    // Group 3.3 — a confirmation that spends a merchant's money has to state
    // what will actually happen, and what happens is decided by the quota.
    remainingGenerations(shop),
  ]);

  // Phase 4 item 6 — this used to read `gqlData.data.products` directly. On a
  // THROTTLED response `data` is null, so the line threw and the Products page
  // returned 500 — to a merchant whose only crime was having a catalogue big
  // enough to get throttled. Shopify's bucket refills at a fixed rate, so a
  // 200-product store never sees it and a 5,000-product store sees it
  // constantly: it failed for exactly the merchants worth having.
  const page = productsPage(gqlData);
  const { edges, pageInfo } = page;
  const catalogError = page.ok
    ? null
    : page.throttled
      ? "Shopify is rate-limiting your store right now, so this list may be incomplete. It will fill in shortly."
      : "We could not read your full product list from Shopify just now. This list may be incomplete.";
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

  // Group 1.5 — BOTH numbers survive, each labelled. "3,148 products in your
  // catalog" is TRUE and must keep its meaning; replacing it with the candidate
  // count would break a true sentence while leaving the bug in place.
  const totalStoreProducts = candidateCounts.total?.count ?? null;
  const candidateProducts = candidateCounts.candidates?.count ?? null;

  // Content status only for the products visible on THIS page — a bounded query
  // (≤ PAGE_SIZE rows) instead of loading every GeneratedContent row for the shop.
  // This is the fix for the unbounded findMany that did not scale past ~10k products.
  const visibleIds = products.map((p) => p.id);
  const generatedContent = visibleIds.length
    ? await prisma.generatedContent.findMany({
        where: { shop, productId: { in: visibleIds } },
        select: {
          productId: true,
          contentType: true,
          status: true,
          updatedAt: true,
          // Phase 4 item 7 — is there an original to put back? Only the
          // presence matters here, never the text: sending fifty product
          // descriptions to the browser to render a button would be absurd.
          originalContent: true,
        },
      })
    : [];

  // Per-product map for the visible page: { [productId]: { description: {status, updatedAt}, ... } }
  const contentMap = {};
  generatedContent.forEach(({ productId, contentType, status, updatedAt, originalContent }) => {
    if (!contentMap[productId]) contentMap[productId] = {};
    contentMap[productId][contentType] = {
      status,
      updatedAt,
      hasOriginal: !!String(originalContent ?? "").trim(),
    };
  });

  // Phase 2 item 2.1 - read, never recompute. This page used to derive
  // "needs content" as total - published - draft, which undercounted every
  // product that had a published description AND a draft meta title, because
  // those were counted in both. The states are mutually exclusive now and
  // sum to totalStoreProducts.
  const publishedProducts = metrics.publishedProducts;
  const draftProducts = metrics.draftProducts;

  // Group 4.1 — "has no content at all" and "not yet optimized by us" are two
  // different states and must never share a number, a label, a badge or a
  // colour. This one is the SECOND: candidates we have not written for. It is
  // no longer called "need content", because on a store whose every product
  // already had a description that sentence was false about ~3,146 of them.
  //
  // Counted against CANDIDATES, not the catalogue: offering to optimize an
  // archived product spends a generation on a page nobody can reach.
  const notOptimized = notOptimizedFrom(candidateProducts, metrics.withContent);

  // Group 3.3 — what will ACTUALLY happen when they press the button. The app
  // already knew this before the click and still promised the whole catalogue.
  const { now: willProcessNow, waiting: waitingForQuota } = splitByQuota(notOptimized, remaining);

  const usageRemaining = Math.max(0, plan.monthlyLimit - usageCount);

  // Phase 3 item 3.4 — the two surviving conversion surfaces, both computed on
  // the server so the count and the fit plan are measured rather than guessed.
  // getQuotaWarning returns null below 80%, at 100%, or while dismissed;
  // getUpsell returns null unless the quota is actually exhausted. Neither
  // throws — an upsell is never worth a broken screen.
  // Phase 4 item 4.3 — the per-product before/after for THIS page only. A
  // scoreboard for products the merchant cannot see is a query for nothing.
  const [quotaWarning, upsell, productScores] = await Promise.all([
    getQuotaWarning({ shop, plan, usageCount, surface: "products" }),
    getUpsell({ admin, shop, plan, usageCount, surface: "products" }),
    productScoresFor(
      shop,
      products.map((p) => p.id),
    ),
  ]);

  return Response.json({
    products,
    contentMap,
    pageInfo,
    statusFilter,
    totalStoreProducts,
    publishedProducts,
    draftProducts,
    candidateProducts,
    candidateLabel: candidateCounts.label,
    candidateExact: candidateCounts.candidates?.exact ?? true,
    totalExact: candidateCounts.total?.exact ?? true,
    countsOk: candidateCounts.ok,
    notOptimized,
    willProcessNow,
    waitingForQuota,
    remaining,
    usageCount,
    usageRemaining,
    quotaWarning,
    upsell,
    productScores,
    catalogError,
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

  // Phase 4 item 7 — "Restore original", handled BEFORE the bulk entitlement
  // gate below. Putting a merchant's own words back is not a paid feature, and
  // gating it behind Growth would mean a downgraded shop could not undo what
  // the app did to their storefront.
  if (actionType === "restoreOriginal") {
    const productId = String(formData.get("productId") || "");
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) {
      return { error: "Invalid product." };
    }
    const row = await prisma.generatedContent.findUnique({
      where: { shop_productId_contentType: { shop, productId, contentType: "description" } },
      select: { originalContent: true, productTitle: true },
    });
    const original = String(row?.originalContent ?? "").trim();
    if (!original) {
      return {
        error: "We do not have this product's original description saved, so there is nothing to put back.",
      };
    }

    const pub = await publishProductWithRetry((q, o) => admin.graphql(q, o), productId, {
      id: productId,
      descriptionHtml: original,
    });
    if (!pub.ok) {
      return {
        error: pub.throttled
          ? "Shopify is rate-limiting your store right now. Please try again in a minute."
          : `Could not restore the original: ${pub.error}`,
      };
    }

    // The AI content is no longer live, so it goes back to being a draft the
    // merchant can publish again. It is NOT deleted — undoing a publish is not
    // the same as throwing the work away.
    await prisma.generatedContent
      .updateMany({
        where: { shop, productId, status: { in: ["published", "published_unverified"] } },
        data: { status: "draft", verifiedAt: null, verifyNote: null },
      })
      .catch(() => {});

    return {
      success: true,
      restored: true,
      message: `Your original description is live again for "${row?.productTitle || "this product"}". The AI version is saved as a draft.`,
    };
  }

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
      // Phase 4 item 6 — with backoff. Enumerating 5,000 products is 20 pages,
      // and without a retry the first throttle silently truncated the run: the
      // merchant asked to optimize everything and got whatever had been read
      // before Shopify said no.
      const res = await shopifyQuery(
        admin.graphql,
        `query($cursor: String) {
            products(first: 250, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              edges { node { id } }
            }
          }`,
        { cursor },
        { shop, label: "enumerate products" },
      );
      const pageResult = productsPage(res);
      if (!pageResult.ok) {
        if (allIds.length > 0) break; // partial is better than nothing, and the
        // quota slice below reports what was actually enqueued
        return {
          error: pageResult.throttled
            ? "Shopify is rate-limiting your store right now. Please try again in a minute."
            : pageResult.reason === "no_data" || pageResult.reason === "errors"
              ? "Shopify returned an unexpected response. Please try again."
              : "Could not fetch your product list from Shopify. Please try again.",
        };
      }
      const { edges, pageInfo } = pageResult;
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
    candidateProducts,
    candidateLabel,
    candidateExact,
    totalExact,
    countsOk,
    publishedProducts,
    draftProducts,
    notOptimized,
    willProcessNow,
    waitingForQuota,
    usageCount,
    usageRemaining,
    quotaWarning,
    upsell,
    productScores,
    catalogError,
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
  // Phase 4 item 7 — which product the merchant is being asked to confirm a
  // restore for. Null when the modal is closed.
  const [restoring, setRestoring] = useState(null);
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
  const usagePct = quotaPct(usageCount, monthlyLimit);
  const isOutOfUsage = usageRemaining === 0;

  // The SHARED rule — the same one the stat cards above are counted with.
  // This used to read `contentMap[p.id]?.description?.status`, i.e. the
  // description row alone, so a product with a published description and a
  // draft meta title landed in "Published" here while the cards counted it as
  // a draft. The screen contradicted itself: "13 live · 4 ready to review"
  // above "Draft (3) · Published (14)".
  const tabFilteredProducts = products.filter((p) => {
    const state = stateOfContentMap(contentMap[p.id]);
    if (statusFilter === "draft") return state === PRODUCT_STATE.DRAFT;
    if (statusFilter === "published") return state === PRODUCT_STATE.PUBLISHED;
    if (statusFilter === "needsContent") return state === PRODUCT_STATE.NEEDS_CONTENT;
    return true;
  });

  const filteredProducts = tabFilteredProducts.filter((p) =>
    p.title.toLowerCase().includes(searchValue.toLowerCase()),
  );

  /**
   * Group 1.5 + 2.1. The old subtitle was
   *   `${totalStoreProducts} products · ... · ${noContentProducts} need content`
   * where BOTH numbers came from one unfiltered `productsCount`. On a catalogue
   * of 3,148 products with 1,350 active it said "3,148 products ... 3,146 need
   * content", and neither half was true.
   *
   * Now: the catalogue total (which is true, and stays), then the population the
   * other numbers are actually about, named rather than implied. When Shopify
   * could not give us a count we say so instead of printing a zero.
   */
  const subtitleText = useMemo(() => {
    if (!countsOk || totalStoreProducts === null) {
      return "We could not read your catalogue totals from Shopify just now.";
    }
    const total = totalExact ? `${totalStoreProducts}` : `${totalStoreProducts}+`;
    const cand = candidateExact ? `${candidateProducts}` : `${candidateProducts}+`;
    const scope = candidateProducts === totalStoreProducts ? "" : ` · ${cand} ${candidateLabel}`;
    return (
      `${total} products in your catalog${scope} · ` +
      `${publishedProducts} live · ${draftProducts} ready to review · ${notOptimized} not yet optimized`
    );
  }, [
    countsOk,
    totalStoreProducts,
    totalExact,
    candidateProducts,
    candidateExact,
    candidateLabel,
    publishedProducts,
    draftProducts,
    notOptimized,
  ]);

  // Tab counts are scoped to the CURRENT page (the tabs filter only the
  // visible 50-product page). Using store-wide counts here made labels like
  // "Draft (120)" sit above an empty list — the store-wide totals live in the
  // stat cards above instead.
  const pageCounts = useMemo(() => {
    let draft = 0,
      published = 0,
      none = 0;
    for (const p of products) {
      const state = stateOfContentMap(contentMap[p.id]);
      if (state === PRODUCT_STATE.PUBLISHED) published++;
      else if (state === PRODUCT_STATE.DRAFT) draft++;
      else if (state === PRODUCT_STATE.NEEDS_CONTENT) none++;
      // rejected is deliberately in no tab; it is counted in the cards above.
    }
    return { draft, published, none };
  }, [products, contentMap]);

  const tabs = useMemo(
    () => [
      { id: "all", content: `All (${products.length} on page)`, panelID: "all" },
      { id: "needsContent", content: `Not optimized on this page (${pageCounts.none})`, panelID: "needsContent" },
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

  // The SAME rule as the tabs and the stat cards, and the SAME words as every
  // other screen. This was a third independent classifier: it read the
  // description row alone, so a product with a published description and a
  // draft meta title showed "Published" while sitting in the Draft tab one
  // line above. It also invented its own vocabulary — "No AI Content",
  // "Unknown" — where PRODUCT_STATE_LABEL is the one the rest of the app uses.
  const BADGE_TONE = {
    [PRODUCT_STATE.PUBLISHED]: "success",
    [PRODUCT_STATE.DRAFT]: "info",
    [PRODUCT_STATE.NEEDS_CONTENT]: "attention",
    [PRODUCT_STATE.REJECTED]: "warning",
  };

  function getStatusBadge(productId, description) {
    const state = stateOfContentMap(contentMap[productId]);
    if (state !== PRODUCT_STATE.NEEDS_CONTENT) {
      return <Badge tone={BADGE_TONE[state]}>{PRODUCT_STATE_LABEL[state]}</Badge>;
    }
    // Group 4.1 — NEEDS_CONTENT means "we hold nothing for this product". It
    // does NOT mean the product has no description: on a store where all 100
    // sampled products had one, every row still showed a red "Needs content".
    // Whether this is a problem depends entirely on whose content is missing.
    const action = actionFor({ hasOwnContent: hasRealContent(description) });
    return <Badge tone={CONTENT_ACTION_TONE[action]}>{CONTENT_ACTION_LABEL[action]}</Badge>;
  }

  /**
   * Phase 4 item 4.3 — what this product scored before we touched it, and now.
   *
   * Renders NOTHING unless there is a real, positive change. A product we have
   * only ever seen once has a before equal to its after, and "67 -> 67" is
   * noise on every row of a long list. A product that went DOWN is not
   * advertised either — it is shown on the product page where there is room to
   * explain, not as a red number in a list the merchant is scanning.
   */
  function getScoreDelta(productId) {
    const sc = productScores?.[productId];
    if (!sc || !Number.isFinite(sc.delta) || sc.delta <= 0) return null;
    return (
      <Text as="span" variant="bodySm" tone="success">
        SEO {sc.before} &rarr; {sc.after}
      </Text>
    );
  }

  /**
   * Phase 4 item 7 — can we put this merchant's own words back?
   *
   * Only when the AI version is actually LIVE and we saved what was there
   * before. Offering "Restore original" beside a draft would be offering to
   * undo something that never happened.
   */
  function canRestore(productId) {
    const desc = contentMap[productId]?.description;
    if (!desc?.hasOriginal) return false;
    return desc.status === "published" || desc.status === "published_unverified";
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
      subtitle={subtitleText}
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
        notOptimized > 0
          ? {
              // Group 3.1 — this used to be a bare `navigate("/app/plans")` for
              // a shop without the entitlement: the highest-contrast control on
              // the busiest screen, with no lock, no badge and no plan name,
              // taking a Free merchant straight to a pricing page. Built for
              // Shopify calls that a dark pattern and a reviewer finds it in
              // thirty seconds. The plan is now named in the label, and the
              // click opens a modal that explains rather than a checkout.
              content: entitlements?.bulkJobs
                ? `Optimize store (${notOptimized})`
                : `Optimize store (${notOptimized}) · Starter`,
              onAction: () => setGenerateAllModal(true),
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

        {/* Phase 3 item 3.4, surface (a) — the only upsell banner on this
            screen, 80%-100%, dismissible for a week. The critical "Monthly
            generation limit reached" banner that used to sit here is gone:
            reaching a quota is completion, not an error, and at 100% the
            message belongs where the action was, not at the top of the page. */}
        {catalogError && (
          <Banner tone="warning" title="This list may be incomplete">
            <p>{catalogError}</p>
          </Banner>
        )}

        <QuotaWarningBanner warning={quotaWarning} />
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
                  {/* Group 4.1 — this said "Need Content" in critical red on a
                      store where all 100 sampled products already had a
                      description, an SEO title and an SEO description. The
                      number was never "products with no content"; it was
                      "products WE have not written for", which is not a fault
                      of the merchant's and is not red. */}
                  <Icon source={AlertCircleIcon} tone="subdued" />
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    {notOptimized === null ? "—" : notOptimized}
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Not yet optimized
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
                <QuotaReachedCard upsell={upsell} surface="products" />
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

        {/* Phase 4 item 7 — restoring puts the merchant's own words back on a
            LIVE storefront, so it asks first. The copy says exactly what will
            happen to both sides: the original goes live, the AI version is
            kept. Nothing here is destroyed. */}
        <Modal
          open={!!restoring}
          onClose={() => setRestoring(null)}
          title="Put your original description back?"
          primaryAction={{
            content: "Restore original",
            onAction: () => {
              const fd = new FormData();
              fd.append("actionType", "restoreOriginal");
              fd.append("productId", restoring.id);
              submit(fd, { method: "post" });
              setRestoring(null);
            },
          }}
          secondaryActions={[{ content: "Cancel", onAction: () => setRestoring(null) }]}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                {`Your original description for "${restoring?.title ?? ""}" goes back on your storefront, replacing the AI version that is live now.`}
              </Text>
              <Text as="p" variant="bodyMd">
                The AI version is kept as a draft, so you can publish it again whenever you want. Nothing is
                deleted.
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>

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
              const { id, numericId, title, imageUrl, price, productType, description } = product;
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
                      {getStatusBadge(id, description)}
                      {getScoreDelta(id)}
                      <InlineStack gap="200">
                        {canRestore(id) && (
                          <Button size="slim" variant="plain" onClick={() => setRestoring({ id, title })}>
                            Restore original
                          </Button>
                        )}
                        <Button size="slim" onClick={() => navigate(`/app/products/${numericId}`)}>
                          Generate
                        </Button>
                      </InlineStack>
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
          title={
            entitlements?.bulkJobs ? `Optimize ${willProcessNow} products now?` : "Bulk optimize is on Starter"
          }
          primaryAction={
            entitlements?.bulkJobs
              ? { content: "Optimize store", onAction: handleGenerateAll }
              : { content: "See plans", onAction: () => navigate("/app/plans") }
          }
          secondaryActions={[{ content: "Cancel", onAction: () => setGenerateAllModal(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              {/* Group 3.1 — the merchant learns what the feature is and what it
                  costs BEFORE they are moved to a pricing page, and the thing
                  they CAN do today stays available. */}
              {!entitlements?.bulkJobs && (
                <Text as="p" variant="bodyMd">
                  Bulk optimize writes content for every product in one background job. It is included from
                  Starter. On your current plan you can still optimize products one at a time from the list
                  below — nothing here is taken away.
                </Text>
              )}
              {entitlements?.bulkJobs && (
                <>
                  {/* Group 3.3 — this said "a background job for all 3,148
                      products ... ~184 minutes" while sliceToQuota was about to
                      cut the run to whatever quota remained. The app knew before
                      the click and promised the whole catalogue anyway. */}
                  <Text as="p" variant="bodyMd">
                    This starts a background job for {willProcessNow} of the {notOptimized} products not yet
                    optimized. Estimated time: ~{Math.max(1, Math.ceil((willProcessNow * 3.5) / 60))} minutes.
                  </Text>
                  {waitingForQuota > 0 && (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      The remaining {waitingForQuota} need more generations than your plan has left this month.
                      They stay untouched — nothing is lost, and you can run this again after your quota
                      resets or on a larger plan.
                    </Text>
                  )}
                </>
              )}
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
