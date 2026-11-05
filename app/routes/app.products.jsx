import {
  useLoaderData,
  useActionData,
  useNavigate,
  useSubmit,
  redirect,
  useSearchParams,
} from "react-router";
import { storedTFor } from "../i18n/storedKeys.js";
import { useT } from "../i18n/react.jsx";
import { tForRequest } from "../i18n/index.js";
import {
  Page,
  Card,
  IndexTable,
  IndexFilters,
  useSetIndexFiltersMode,
  useIndexResourceState,
  useBreakpoints,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Button,
  EmptyState,
  Checkbox,
  Banner,
  Box,
  Modal,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
  ProgressBar,
} from "@shopify/polaris";
import { useState, useCallback, useMemo, useEffect } from "react";
import { StatStrip } from "../components/StatStrip.jsx";
import { ScoreRing } from "../components/ScoreRing.jsx";
import { ProductThumb } from "../components/ProductThumb.jsx";
import { authenticate } from "../shopify.server.js";
import { LIST_SCOPE_QUERY } from "../utils/candidates.js";
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
import { getEntitlements, bulkRefusal } from "../utils/billing-plans.js";
import { runQuickStartOne, PRODUCT_GID_RE } from "../utils/quickStart.server.js";
import { getContentMetrics } from "../utils/metrics.server.js";
import { getCandidateCounts, notOptimizedFrom, splitByQuota } from "../utils/candidates.server.js";
import { contentInCatalogue } from "../utils/catalogueContent.server.js";
import { publishedSubtext } from "../utils/catalogueContent.js";
import {
  actionFor,
  hasRealContent,
  CONTENT_ACTION,
  CONTENT_ACTION_LABEL,
  CONTENT_ACTION_TONE,
} from "../utils/candidates.js";
import { enqueueGenerationJob } from "../queues/generationQueue.server.js";
import { QuotaWarningBanner, QuotaReachedCard } from "../components/UpgradePrompt.jsx";
import { getQuotaWarning } from "../utils/quotaSurfaces.server.js";
import { PRODUCT_STATE, PRODUCT_STATE_LABEL, stateOfContentMap, matchesListFilter, rowActionHref } from "../utils/productState.js";
import { productScoresFor } from "../utils/storeScore.server.js";
import { shopifyQuery, productsPage } from "../utils/shopifyQuery.server.js";
import { publishProductWithRetry } from "../utils/adminGraphql.server.js";
import { getUpsell } from "../utils/upgradePrompts.server.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";

const PAGE_SIZE = 50;

export const loader = async ({ request }) => {
  const t = tForRequest(request);
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  const direction = url.searchParams.get("dir") || "next";
  const statusFilter = url.searchParams.get("status") || "all";

  const gqlQuery =
    direction === "prev"
      ? `query($cursor: String) {
          products(last: ${PAGE_SIZE}, before: $cursor, sortKey: TITLE, query: "${LIST_SCOPE_QUERY}") {
            pageInfo { hasPreviousPage hasNextPage startCursor endCursor }
            edges { node {
              id title handle status productType vendor description publishedAt
              featuredImage { url altText }
              variants(first: 1) { edges { node { price } } }
              tags
            }}
          }
        }`
      : `query($cursor: String) {
          products(first: ${PAGE_SIZE}, after: $cursor, sortKey: TITLE, query: "${LIST_SCOPE_QUERY}") {
            pageInfo { hasPreviousPage hasNextPage startCursor endCursor }
            edges { node {
              id title handle status productType vendor description publishedAt
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
    shopifyQuery(admin.graphql, gqlQuery, { cursor }, { shop, label: t("products page") }),
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
  // D6 — the loader ships a reason, never a sentence; the screen makes the sentence in its language
  const catalogError = page.ok ? null : page.throttled ? "throttled" : "unreadable";
  const products = edges.map(({ node }) => ({
    id: node.id,
    numericId: node.id.replace("gid://shopify/Product/", ""),
    title: node.title,
    handle: node.handle,
    status: node.status,
    // Frame 03 — `publishedAt` is Shopify's own answer to "is this product on
    // the Online Store channel". The page lists `-status:archived` (deliberately
    // wide: a merchant's drafts are still theirs) while the header counts the
    // CANDIDATE scope, which requires online-store publication. One product can
    // therefore be on this page and outside every number above it. The row now
    // carries the fact, so the difference can be seen instead of inferred.
    onStorefront: !!node.publishedAt,
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
  // Part B — joined to the candidate scope, so "with content published",
  // "ready to review" and "not yet optimized" describe the same N products the
  // subtitle names. The lifetime record is `recordPublished`, shown as
  // secondary text. See catalogueContent.js.
  const catalogue = await contentInCatalogue(admin, shop);
  const catalogueOk = catalogue.ok;
  const recordPublished = metrics.publishedProducts;
  const publishedProducts = catalogue.ok ? catalogue.published : metrics.publishedProducts;
  // A3 (Phase 8), second pass — every product draft, the same count Review
  // and the page tabs use. Drafts on products outside the Online Store scope
  // are counted AND named, so the header's sum can be checked by a reader.
  const draftProducts = metrics.draftProducts;
  const draftsOutsideScope = Math.max(0, metrics.draftProducts - (catalogue.ok ? catalogue.draft : metrics.draftProducts));
  const archivedProducts = candidateCounts.archived?.count ?? null;

  // Group 4.1 — "has no content at all" and "not yet optimized by us" are two
  // different states and must never share a number, a label, a badge or a
  // colour. This one is the SECOND: candidates we have not written for. It is
  // no longer called "need content", because on a store whose every product
  // already had a description that sentence was false about ~3,146 of them.
  //
  // Counted against CANDIDATES, not the catalogue: offering to optimize an
  // archived product spends a generation on a page nobody can reach.
  const notOptimized = notOptimizedFrom(
    candidateProducts,
    catalogue.ok ? catalogue.withContent : metrics.withContent,
  );

  // Group 3.3 — what will ACTUALLY happen when they press the button. The app
  // already knew this before the click and still promised the whole catalogue.
  const { now: willProcessNow, waiting: waitingForQuota } = splitByQuota(notOptimized, remaining);

  const usageRemaining = Math.max(0, plan.monthlyCredits - usageCount);

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
    draftsOutsideScope,
    candidateProducts,
    candidateLabel: candidateCounts.label,
    candidateExact: candidateCounts.candidates?.exact ?? true,
    totalExact: candidateCounts.total?.exact ?? true,
    countsOk: candidateCounts.ok,
    notOptimized,
    archivedProducts,
    recordPublished,
    catalogueOk,
    willProcessNow,
    waitingForQuota,
    remaining,
    usageCount,
    usageRemaining,
    quotaWarning,
    upsell,
    productScores,
    catalogError,
    monthlyCredits: plan.monthlyCredits,
    planName: plan.planName,
    entitlements: getEntitlements(plan.planName),
    publishWithoutReview,
  });
};

export const action = async ({ request }) => {
  const t = tForRequest(request);
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
      return { error: t("Invalid product.") };
    }
    const row = await prisma.generatedContent.findUnique({
      where: { shop_productId_contentType: { shop, productId, contentType: "description" } },
      select: { originalContent: true, productTitle: true },
    });
    const original = String(row?.originalContent ?? "").trim();
    if (!original) {
      return {
        error: t("We do not have this product's original description saved, so there is nothing to put back."),
      };
    }

    const pub = await publishProductWithRetry((q, o) => admin.graphql(q, o), productId, {
      id: productId,
      descriptionHtml: original,
    });
    if (!pub.ok) {
      return {
        error: pub.throttled ? t("Shopify is rate-limiting your store right now. Please try again in a minute.") : t("Could not restore the original: {error}", { error: pub.error }),
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
      message: t("Your original description is live again for \"{v}\". The AI version is saved as a draft.", { v: row?.productTitle || t("this product") }),
    };
  }

  const contentTypes = ["description", "metaTitle", "metaDescription", "faq"].filter(
    (t) => formData.get(`bulk_${t}`) === "true",
  );
  if (contentTypes.length === 0) return { error: t("Select at least one content type.") };
  // Phase 2 item 2.6 - read from Settings, never from the form. This panel
  // submitted with no confirmation at all.
  const autoPublish = await publishesWithoutReview(shop);

  // Bulk jobs are a Growth+ feature — enforce server-side
  const bulkEnt = await checkEntitlement(shop, "bulkJobs");
  if (!bulkEnt.allowed) {
    return {
      error: bulkRefusal("Generating for many products at once"),
      limitReached: true,
    };
  }

  // A5/FR10 (Phase 8) — the Free plan's one-press action: up to three drafts
  // through the first run's per-product path. Same credits, same idempotency,
  // same Review page. Never a bulk job, so no bulk entitlement is needed.
  if (actionType === "quickBatch") {
    let ids = [];
    try {
      ids = JSON.parse(formData.get("quickIds") || "[]");
    } catch {
      ids = [];
    }
    ids = (Array.isArray(ids) ? ids : []).filter((id) => PRODUCT_GID_RE.test(String(id))).slice(0, 3);
    if (ids.length === 0) return { error: t("Nothing on this page needs a draft.") };
    let ok = 0;
    let limitReached = false;
    for (const productId of ids) {
      const r = await runQuickStartOne({ admin, shop, productId, mode: "generate" });
      if (r?.ok) ok += 1;
      if (r?.limitReached) limitReached = true;
    }
    if (ok > 0) return redirect("/app/review");
    return { error: limitReached ? t("You have no credits left this month.") : t("We couldn't write those drafts — no credit was used."), limitReached };
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
            products(first: 250, after: $cursor, query: "${LIST_SCOPE_QUERY}") {
              pageInfo { hasNextPage endCursor }
              edges { node { id } }
            }
          }`,
        { cursor },
        { shop, label: t("enumerate products") },
      );
      const pageResult = productsPage(res);
      if (!pageResult.ok) {
        if (allIds.length > 0) break; // partial is better than nothing, and the
        // quota slice below reports what was actually enqueued
        return {
          error: pageResult.throttled ? t("Shopify is rate-limiting your store right now. Please try again in a minute.") : pageResult.reason === "no_data" || pageResult.reason === "errors" ? t("Shopify returned an unexpected response. Please try again.") : t("Could not fetch your product list from Shopify. Please try again."),
        };
      }
      const { edges, pageInfo } = pageResult;
      allIds.push(...edges.map((e) => e.node.id));
      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }
    if (allIds.length === 0) return { error: t("No products found in your store.") };

    // Phase 0 item 4 — enqueue only what the quota can pay for; record the rest.
    const remainingAll = await remainingGenerations(shop);
    const { targetIds: runAllIds, quotaSkipped: skippedAll } = sliceToQuota(allIds, remainingAll);
    if (runAllIds.length === 0) {
      return {
        error: t("You have no credits left this month, so there is nothing to run."),
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
        error: err.message?.startsWith("You already have jobs") ? storedTFor(t)(err.message) : t("Could not start the bulk job. Please try again."),
      };
    }
    return redirect("/app/jobs");
  }

  let selectedIds;
  try {
    selectedIds = JSON.parse(formData.get("selectedIds") || "[]");
    if (!Array.isArray(selectedIds)) selectedIds = [];
  } catch {
    return { error: t("Invalid selection data. Please refresh and try again.") };
  }
  if (selectedIds.length === 0) return { error: t("No products selected.") };

  // Phase 0 item 4 — same rule for an explicit selection.
  const remainingSel = await remainingGenerations(shop);
  const { targetIds: runSelIds, quotaSkipped: skippedSel } = sliceToQuota(selectedIds, remainingSel);
  if (runSelIds.length === 0) {
    return {
      error: t("You have no credits left this month, so there is nothing to run."),
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
      error: err.message?.startsWith("You already have jobs") ? storedTFor(t)(err.message) : t("Could not start the bulk job. Please try again."),
    };
  }
  return redirect("/app/jobs");
};

function ProductListSkeleton() {
  return (
    <SkeletonPage primaryAction>
      <BlockStack gap="500">
        <Card>
          <InlineStack gap="800">
            {[1, 2, 3, 4].map((i) => (
              <BlockStack key={i} gap="200">
                <SkeletonBodyText lines={1} />
                <SkeletonDisplayText size="small" />
              </BlockStack>
            ))}
          </InlineStack>
        </Card>
        <Card>
          <BlockStack gap="400">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <InlineStack key={i} gap="400" blockAlign="center">
                <SkeletonThumbnail size="small" />
                <Box width="100%">
                  <SkeletonBodyText lines={2} />
                </Box>
              </InlineStack>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    </SkeletonPage>
  );
}

export default function ProductsPage() {
  const t = useT();
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
    draftsOutsideScope,
    notOptimized,
    archivedProducts,
    recordPublished,
    catalogueOk,
    willProcessNow,
    waitingForQuota,
    usageCount,
    usageRemaining,
    quotaWarning,
    upsell,
    productScores,
    catalogError,
    monthlyCredits,
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchValue, setSearchValue] = useState("");
  // Phase 4 item 7 — which product the merchant is being asked to confirm a
  // restore for. Null when the modal is closed.
  const [restoring, setRestoring] = useState(null);
  // Selection is Polaris' own (useIndexResourceState, below), so the table's
  // checkboxes, the "n selected" header and the bulk action agree by construction.
  const [bulkDesc, setBulkDesc] = useState(true);
  const [bulkMeta, setBulkMeta] = useState(true);
  const [bulkFaq, setBulkFaq] = useState(false);
  const [bulkError, setBulkError] = useState("");
  // A3.2 — opened directly by Home's "Optimize" entry points via
  // ?optimize=1, so every surface carrying that label ends in this one
  // confirmation instead of two different next steps.
  const [generateAllModal, setGenerateAllModal] = useState(searchParams.get("optimize") === "1");
  // Phase 2 item 2.6 — the pending bulk run held back by the publish-without-review
  // confirm: { actionType, ids } while the modal is open, null otherwise.
  const [publishConfirm, setPublishConfirm] = useState(null);

  const handleSearchChange = useCallback((v) => setSearchValue(v), []);
  const handleSearchClear = useCallback(() => setSearchValue(""), []);

  // Store-wide coverage counts come from the loader (aggregated, accurate across
  // all pages). contentMap below is scoped to the visible page for per-row pills.
  const usagePct = quotaPct(usageCount, monthlyCredits);
  // A5/FR10 — what one press can do on Free: up to three not-yet-optimized,
  // active products on this page, bounded by the credits left.
  const quickIds = useMemo(
    () =>
      products
        .filter((p) => String(p.status ?? "").toUpperCase() === "ACTIVE" && stateOfContentMap(contentMap[p.id]) === PRODUCT_STATE.NEEDS_CONTENT)
        .slice(0, 3)
        .map((p) => p.id),
    [products, contentMap],
  );
  const quickBatch = Math.min(quickIds.length, Math.max(0, monthlyCredits - usageCount));
  const handleQuickBatch = () => {
    const fd = new FormData();
    fd.append("actionType", "quickBatch");
    fd.append("quickIds", JSON.stringify(quickIds.slice(0, quickBatch)));
    submit(fd, { method: "post" });
  };
  const isOutOfUsage = usageRemaining === 0;

  // The SHARED rule — the same one the stat cards above are counted with.
  // This used to read `contentMap[p.id]?.description?.status`, i.e. the
  // description row alone, so a product with a published description and a
  // draft meta title landed in "Published" here while the cards counted it as
  // a draft. The screen contradicted itself: "13 live · 4 ready to review"
  // above "Draft (3) · Published (14)".
  // A1 — the SHARED rule, in productState.js beside stateOfContentMap. It lives
  // there rather than here because the last time a rule like this lived inside
  // the component, the component grew its own version and the screen
  // contradicted its own stat cards.
  const tabFilteredProducts = products.filter((p) =>
    matchesListFilter(p, contentMap[p.id], statusFilter),
  );

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
      return t("We could not read your catalog totals from Shopify just now.");
    }
    const total = totalExact ? t.number(totalStoreProducts) : `${t.number(totalStoreProducts)}+`;
    const cand = candidateExact ? t.number(candidateProducts) : `${t.number(candidateProducts)}+`;
    const scope = candidateProducts === totalStoreProducts ? "" : t(" · {n} {label}", { n: cand, label: candidateLabel });
    // Redesign (Nov 2026): the subtitle names the catalogue and its scope;
    // the published / ready-to-review / not-yet-optimized counts moved into the
    // strip under it, each with its own scope line, so the title row is one
    // sentence instead of six clauses. Part B's rule holds: `total` is
    // non-archived, and the archived count is stated so "15" beside a Shopify
    // admin showing 32 is not a contradiction.
    //
    // P5.1 — the published count is never called "live": it is a record of
    // what THIS APP has published (our own table), and it keeps counting a
    // product after the merchant archives or deletes it. See the strip's
    // hint, which says whose products it is "of".
    const archivedNote = archivedProducts > 0 ? t(" · {n} archived not shown", { n: t.number(archivedProducts) }) : "";
    return t("{total} products in your catalog{scope}{archived}", { total, scope, archived: archivedNote });
  }, [t, countsOk, totalStoreProducts, totalExact, candidateProducts, candidateExact, candidateLabel, archivedProducts]);

  const statusById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.status])), [products]);
  // Frame 03 — the badge and the count must key on the SAME fact. Shopify
  // status alone misses a product that is ACTIVE but unpublished from the
  // Online Store channel: it is out of the header's population just the same,
  // and it used to carry no marker at all.
  const onStorefrontById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.onStorefront])), [products]);

  /* The tabs FILTER; they do not count. Group 6.2 found the same defect three
     times: the strip is store-wide, the tabs could only count the visible
     page, and "Draft (0)" under "2 ready to review" read as a contradiction.
     Labelling every tab "on this page" fixed the scope and cluttered the bar.
     Redesign (Nov 2026): the category's list screens (Smart SEO's All · Active
     · Draft · Archived) carry no number on a tab, so neither does this one. The
     store-wide numbers live in the strip; the one page-scoped number, how many
     rows are shown, sits beside the pager and says it is page-scoped
     (tests/routes/numberScope.test.js). */
  const tabs = useMemo(
    () => [
      { id: "all", content: t("All"), panelID: "all" },
      { id: "needsContent", content: t("Not optimized"), panelID: "needsContent" },
      { id: "draft", content: t("Draft"), panelID: "draft" },
      { id: "published", content: t("Published"), panelID: "published" },
    ],
    [t],
  );
  const selectedTabIndex = tabs.findIndex((t) => t.id === statusFilter);
  const activeTab = selectedTabIndex >= 0 ? selectedTabIndex : 0;

  const handleTabChange = useCallback(
    (index) => {
      const tabId = tabs[index].id;
      setSearchParams({ status: tabId });
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

  /**
   * What this row offers to DO, matching what its badge already says.
   *
   * Three states, three verbs. "Generate" over a merchant's own paragraph is
   * the app telling them their work is missing.
   */
  // FR13 (Phase 14) — the LABEL and the DESTINATION are now derived separately
  // from the same state, because the old code compared this label to the
  // English "Review" to pick the route. See rowActionHref in productState.js.
  // The label was also rendering raw English on a six-language UI; it is a key
  // now, like every other string on this screen.
  function rowActionLabel(productId, description) {
    const state = stateOfContentMap(contentMap[productId]);
    if (state !== PRODUCT_STATE.NEEDS_CONTENT) return t("Review");
    return actionFor({ hasOwnContent: hasRealContent(description) }) === CONTENT_ACTION.ENHANCE
      ? t("Enhance")
      : t("Generate");
  }

  function getStatusBadge(productId, description) {
    const state = stateOfContentMap(contentMap[productId]);
    if (state !== PRODUCT_STATE.NEEDS_CONTENT) {
      // A7 (Phase 8) — published content on a product Shopify holds as a draft
      // or archived has no storefront page. Say both things.
      const shopifyStatus = String(statusById[productId] ?? "ACTIVE").toUpperCase();
      const live = state === PRODUCT_STATE.PUBLISHED || state === PRODUCT_STATE.UNVERIFIED;
      if (live && shopifyStatus !== "ACTIVE") {
        return <Badge tone="attention">{t("{state} · product is a Shopify {v}, not on your storefront", { state: t(PRODUCT_STATE_LABEL[state]), v: shopifyStatus.toLowerCase() })}</Badge>;
      }
      // Frame 03 — ACTIVE but never published to the Online Store channel.
      // Same consequence, no page for anyone to read, and the old badge said
      // nothing because it only looked at `status`.
      if (live && onStorefrontById[productId] === false) {
        return <Badge tone="attention">{t("{state} · not on your Online Store, so it has no public page", { state: t(PRODUCT_STATE_LABEL[state]) })}</Badge>;
      }
      return <Badge tone={BADGE_TONE[state]}>{t(PRODUCT_STATE_LABEL[state])}</Badge>;
    }
    // Group 4.1 — NEEDS_CONTENT means "we hold nothing for this product". It
    // does NOT mean the product has no description: on a store where all 100
    // sampled products had one, every row still showed a red "Needs content".
    // Whether this is a problem depends entirely on whose content is missing.
    const action = actionFor({ hasOwnContent: hasRealContent(description) });
    return <Badge tone={CONTENT_ACTION_TONE[action]}>{t(CONTENT_ACTION_LABEL[action])}</Badge>;
  }

  /**
   * Frame 03 — the row the strip's totals leave out, marked on the row itself.
   *
   * The list is `-status:archived`; the strip counts the candidate scope, which
   * requires the Online Store channel. The two used to be reconciled by a
   * sentence above the table ("1 product here is not on your Online Store…").
   * Redesign (Nov 2026): every such row says so in its own status cell, keyed
   * on the SAME fact the count uses (onStorefront, from `publishedAt`), so the
   * difference is seen where it is, not explained above it. A row whose state
   * badge already says it (published content with no public page, above) gets
   * no second mark.
   */
  function channelBadge(productId) {
    if (onStorefrontById[productId] !== false) return null;
    const state = stateOfContentMap(contentMap[productId]);
    const live = state === PRODUCT_STATE.PUBLISHED || state === PRODUCT_STATE.UNVERIFIED;
    if (live) return null;
    return <Badge>{t("Not on your Online Store")}</Badge>;
  }

  /**
   * Phase 4 item 4.3 — what this product scored before we touched it, and now.
   *
   * Redesign (Nov 2026): the latest score as a small ring, as every top app's
   * product list shows it, and the gain beside it only when there is a real,
   * positive one. A product that went DOWN is not advertised here — it is
   * shown on the product page where there is room to explain. A product we
   * have never scored shows nothing, never a dash pretending to be a column.
   */
  function getScoreCell(productId) {
    const sc = productScores?.[productId];
    if (!sc || !Number.isFinite(sc.after)) return null;
    return (
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        <ScoreRing value={sc.after} size="xs" label={t("Score")} />
        {Number.isFinite(sc.delta) && sc.delta > 0 ? (
          <Text as="span" variant="bodySm" tone="success">
            {t("+{delta}", { delta: sc.delta })}
          </Text>
        ) : null}
      </InlineStack>
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

  /**
   * What we hold for this product, as words, only where something exists.
   * A badge means the content is actually LIVE (published); a draft says
   * "draft". Rejected or never written → no badge at all. (These were three
   * pills on every row, two of them grey and empty on most stores.)
   */
  function getContentBadges(productId) {
    const m = contentMap[productId] || {};
    const types = [
      { key: "description", label: t("Description") },
      { key: "metaTitle", label: t("Meta") },
      { key: "faq", label: "FAQ" },
    ];
    const badges = types
      .map(({ key, label }) => {
        const st = m[key]?.status;
        if (st === "published" || st === "published_unverified") return <Badge key={key} tone="success">{label}</Badge>;
        if (st === "draft") return <Badge key={key}>{t("{label} · draft", { label })}</Badge>;
        return null;
      })
      .filter(Boolean);
    if (badges.length === 0) return null;
    return (
      <InlineStack gap="100" wrap>
        {badges}
      </InlineStack>
    );
  }

  /** When we last wrote anything for this product, from the page's own content map. */
  function lastWritten(productId) {
    const m = contentMap[productId] || {};
    const latest = Object.values(m)
      .map((v) => (v?.updatedAt ? new Date(v.updatedAt).getTime() : 0))
      .reduce((a, b) => Math.max(a, b), 0);
    return latest > 0 ? t.date(new Date(latest)) : null;
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

  // Polaris' selection, over the rows on screen. The table's checkboxes, the
  // "n selected" header and the bulk action all read the same state.
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } = useIndexResourceState(filteredProducts);
  const selectedItems = selectedResources;
  // The tab and the search change what is on screen; a selection made on the
  // old rows must not survive into the new ones.
  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchValue]);
  // Redesign (Nov 2026): the content-type choice for a selection lives in the
  // same confirmation the bulk run uses, opened by the table's bulk action —
  // not in a panel that appeared above the list.
  const [selectionModal, setSelectionModal] = useState(false);

  const handleBulkGenerate = useCallback(() => {
    if (!bulkDesc && !bulkMeta && !bulkFaq) {
      setBulkError(t("Select at least one content type to generate."));
      return;
    }
    setBulkError("");
    setSelectionModal(false);
    if (publishWithoutReview) {
      setPublishConfirm({ actionType: "generateSelected", ids: selectedItems });
      return;
    }
    submit(buildBulkFormData("generateSelected", selectedItems), { method: "POST" });
  }, [selectedItems, bulkDesc, bulkMeta, bulkFaq, buildBulkFormData, submit, publishWithoutReview, t]);

  const handleGenerateAll = useCallback(() => {
    if (!bulkDesc && !bulkMeta && !bulkFaq) {
      setBulkError(t("Select at least one content type to generate."));
      return;
    }
    setBulkError("");
    setGenerateAllModal(false);
    if (publishWithoutReview) {
      setPublishConfirm({ actionType: "generateAll", ids: null });
      return;
    }
    submit(buildBulkFormData("generateAll", null), { method: "POST" });
  }, [bulkDesc, bulkMeta, bulkFaq, buildBulkFormData, submit, publishWithoutReview, t]);

  // The filter bar: the four page-scoped tabs and the search, in Polaris' own
  // IndexFilters so the list reads like the admin's product list.
  const { mode, setMode } = useSetIndexFiltersMode();
  const { smDown } = useBreakpoints();

  // The headline numbers, one divided strip (as on Home), each cell a link to
  // the list behind it. Store-wide; the tabs below count only this page.
  const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : t.number(Number(v)));
  const stats = [
    {
      id: "published",
      label: t("AI Content Published"),
      value: num(publishedProducts),
      hint: publishedSubtext({ ok: catalogueOk, inScope: publishedProducts, candidateCount: candidateProducts, candidateLabel, record: recordPublished }, t),
      onClick: () => setSearchParams({ status: "published" }),
    },
    {
      id: "drafts",
      label: t("Ready to review"),
      value: num(draftProducts),
      hint: draftsOutsideScope > 0 ? t("{n, plural, one {# on a product} other {# on products}} not on your Online Store", { n: draftsOutsideScope }) : t("Waiting for you"),
      url: "/app/review",
    },
    {
      id: "notOptimized",
      label: t("Not yet optimized"),
      value: num(notOptimized),
      hint: t("Products we have not written for"),
      onClick: () => setSearchParams({ status: "needsContent" }),
    },
    {
      id: "credits",
      label: t("Monthly credits"),
      value: (
        <Text as="span" id="products-credit-usage">
          {t("{usageCount} / {monthlyCredits} used", { usageCount: t.number(usageCount), monthlyCredits: t.number(monthlyCredits) })}
        </Text>
      ),
      // FR14 — labelled by the count, never by the rounded percent alone.
      extra: <ProgressBar progress={usagePct} tone={usagePct >= 90 ? "critical" : "success"} size="small" ariaLabelledBy="products-credit-usage" />,
    },
  ];

  if (loadingThisRoute) return <ProductListSkeleton />;

  const emptyState = (
    <EmptyState
      heading={statusFilter !== "all" ? t("No products match this filter") : totalStoreProducts === 0 ? t("No products yet") : t("Nothing on this page")}
      image="/empty-products.svg"
      action={
        statusFilter !== "all"
          ? { content: t("View all products"), onAction: () => setSearchParams({}) }
          : { content: t("Go to Home"), onAction: () => navigate("/app") }
      }
    >
      <p>
        {statusFilter !== "all" ? t("Try another tab, or clear the filter.") : totalStoreProducts === 0 ? t("Add products to your store, and this is where you generate content for them.") : t("Try clearing your search.")}
      </p>
    </EmptyState>
  );

  const pagination =
    pageInfo?.hasPreviousPage || pageInfo?.hasNextPage
      ? {
          hasPrevious: !!pageInfo.hasPreviousPage,
          hasNext: !!pageInfo.hasNextPage,
          onPrevious: () => setSearchParams({ cursor: pageInfo.startCursor, dir: "prev", status: statusFilter }),
          onNext: () => setSearchParams({ cursor: pageInfo.endCursor, dir: "next", status: statusFilter }),
          // The one page-scoped number on the screen, so it says so: how many
          // rows are shown, out of the page's own rows when a tab or the
          // search narrows them (numberScope.test.js).
          label:
            filteredProducts.length === products.length
              ? t("{n, plural, one {# product on this page} other {# products on this page}}", { n: products.length })
              : t("{shown} of the {n} products on this page", { shown: filteredProducts.length, n: products.length }),
        }
      : undefined;

  /* One row. The title, the vendor or type under it, what we hold as badges,
     the state badge, the score where we have one, when we last wrote, and the
     one action the state calls for. On a phone the same facts stack. */
  const rowAction = (id, numericId, description) => (
    <Button
      size="slim"
      onClick={(e) => {
        // FR13, third time (Phase 12 A1). This handler always ran — and
        // then the click BUBBLED into the row's own onClick, which navigated
        // to /app/products/<id> last. The route was right twice over and the
        // click still landed on the product page. Stop the bubble; then
        // navigate once.
        e?.stopPropagation?.();
        e?.preventDefault?.();
        navigate(rowActionHref(stateOfContentMap(contentMap[id]), numericId));
      }}
    >
      {rowActionLabel(id, description)}
    </Button>
  );

  const rows = filteredProducts.map((product, index) => {
    const { id, numericId, title, imageUrl, productType, vendor, description } = product;
    const subline = [vendor, productType].filter(Boolean).join(" · ");
    const written = lastWritten(id);
    if (smDown) {
      return (
        <IndexTable.Row id={id} key={id} position={index} selected={selectedResources.includes(id)} onClick={() => navigate(`/app/products/${numericId}`)}>
          <Box padding="300" width="100%">
            <BlockStack gap="200">
              <InlineStack gap="300" blockAlign="center" wrap={false}>
                <ProductThumb url={imageUrl} />
                <Box width="100%">
                  <BlockStack gap="050">
                    <Text as="span" variant="bodyMd" fontWeight="medium">
                      {title}
                    </Text>
                    {subline ? (
                      <Text as="span" variant="bodySm" tone="subdued">
                        {subline}
                      </Text>
                    ) : null}
                  </BlockStack>
                </Box>
                {getScoreCell(id)}
              </InlineStack>
              <InlineStack gap="200" blockAlign="center" wrap>
                {getStatusBadge(id, description)}
                {channelBadge(id)}
                {getContentBadges(id)}
              </InlineStack>
              <InlineStack gap="200" blockAlign="center">
                {rowAction(id, numericId, description)}
                {canRestore(id) && (
                  <Button size="slim" variant="plain" onClick={(e) => { e?.stopPropagation?.(); setRestoring({ id, title }); }}>
                    {t("Restore original")}
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Box>
        </IndexTable.Row>
      );
    }
    return (
      <IndexTable.Row id={id} key={id} position={index} selected={selectedResources.includes(id)} onClick={() => navigate(`/app/products/${numericId}`)}>
        <IndexTable.Cell>
          <ProductThumb url={imageUrl} />
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodyMd" fontWeight="medium">
              {title}
            </Text>
            {subline ? (
              <Text as="span" variant="bodySm" tone="subdued">
                {subline}
              </Text>
            ) : null}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="100" blockAlign="center" wrap>
            {getStatusBadge(id, description)}
            {channelBadge(id)}
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{getContentBadges(id)}</IndexTable.Cell>
        <IndexTable.Cell>{getScoreCell(id)}</IndexTable.Cell>
        <IndexTable.Cell>
          {written ? (
            <Text as="span" variant="bodySm" tone="subdued">
              {written}
            </Text>
          ) : null}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack align="end" gap="200" blockAlign="center" wrap={false}>
            {canRestore(id) && (
              <Button size="slim" variant="plain" onClick={(e) => { e?.stopPropagation?.(); setRestoring({ id, title }); }}>
                {t("Restore original")}
              </Button>
            )}
            {rowAction(id, numericId, description)}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title={t("Products")}
      subtitle={subtitleText}
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
              // A5/FR10 (Phase 8) — on Free the primary does what Free can do:
              // three drafts through the same per-product path as the first run,
              // three credits, to Review. The bulk run is offered as a secondary
              // action that names what it needs, and the modal explains.
              ...(entitlements?.bulkJobs
                ? { content: t("Optimize store ({notOptimized})", { notOptimized: t.number(notOptimized) }), onAction: () => setGenerateAllModal(true) }
                : {
                    content: quickBatch > 0 ? t("Write the next {n, plural, one {# draft} other {# drafts}}", { n: quickBatch }) : t("Review your drafts"),
                    onAction: () => (quickBatch > 0 ? handleQuickBatch() : navigate("/app/review")),
                  }),
            }
          : undefined
      }
      secondaryActions={[
        ...(notOptimized > 0 && !entitlements?.bulkJobs
          ? [{ content: t("Optimize all {notOptimized} at once · needs Starter", { notOptimized: t.number(notOptimized) }), onAction: () => setGenerateAllModal(true) }]
          : []),
        ...(draftProducts > 0
          ? [{ content: t("Review {draftProducts} drafts", { draftProducts: t.number(draftProducts) }), onAction: () => navigate("/app/review") }]
          : []),
      ]}
      /* Phase 2 item 2.2 — Collections and Activity left the sidebar, so they
         need a way back in from the screen that absorbed them; nothing became
         unreachable. Redesign (Nov 2026): they are destinations, not actions on
         this list, so they sit in one menu instead of two more buttons in a
         title row that already holds the primary and its alternatives. */
      actionGroups={[
        {
          title: t("More actions"),
          actions: [
            { content: t("Collections"), onAction: () => navigate("/app/collections") },
            { content: t("Activity"), onAction: () => navigate("/app/jobs") },
          ],
        },
      ]}
    >
      <BlockStack gap="500">
        {/* At most one notice (the brief): what the merchant just did failed
            beats a list that may be incomplete, which beats the 80–100% quota
            warning. All three were able to stack. */}
        {actionData?.error ? (
          <Banner
            tone={actionData.limitReached ? "warning" : "critical"}
            title={actionData.limitReached ? t("Plan upgrade required") : t("Could not start writing")}
            action={
              actionData.limitReached
                ? { content: t("View Plans"), onAction: () => navigate("/app/plans") }
                : undefined
            }
          >
            <p>{actionData.error}</p>
          </Banner>
        ) : catalogError ? (
          <Banner tone="warning" title={t("This list may be incomplete")}>
            <p>{catalogError === "throttled" ? t("Shopify is rate-limiting your store right now, so this list may be incomplete. It will fill in shortly.") : t("We could not read your full product list from Shopify just now. This list may be incomplete.")}</p>
          </Banner>
        ) : (
          /* Phase 3 item 3.4, surface (a) — the only upsell banner on this
             screen, 80%-100%, dismissible for a week. Reaching a quota is
             completion, not an error; at 100% the message belongs where the
             action was, not at the top of the page. */
          <QuotaWarningBanner warning={quotaWarning} />
        )}

        {/* The headline numbers. Group 4.1 — the third cell said "Need Content"
            in critical red on a store where all 100 sampled products already
            had a description. The number was never "products with no content";
            it was "products WE have not written for", which is not a fault of
            the merchant's and is not red. */}
        <StatStrip items={stats} />

        {/* Phase 4 item 7 — restoring puts the merchant's own words back on a
            LIVE storefront, so it asks first. The copy says exactly what will
            happen to both sides: the original goes live, the AI version is
            kept. Nothing here is destroyed. */}
        <Modal
          open={!!restoring}
          onClose={() => setRestoring(null)}
          title={t("Put your original description back?")}
          primaryAction={{
            content: t("Restore original"),
            onAction: () => {
              const fd = new FormData();
              fd.append("actionType", "restoreOriginal");
              fd.append("productId", restoring.id);
              submit(fd, { method: "post" });
              setRestoring(null);
            },
          }}
          secondaryActions={[{ content: t("Cancel"), onAction: () => setRestoring(null) }]}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                {t("Your original description for \"{v}\" goes back on your storefront, replacing the AI version that is live now.", { v: restoring?.title ?? "" })}
              </Text>
              <Text as="p" variant="bodyMd">
                {t("The AI version is kept as a draft, so you can publish it again whenever you want. Nothing is deleted.")}
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* The list: page-scoped tabs and search in one bar, then the table. */}
        <Card padding="0">
          <IndexFilters
            tabs={tabs}
            selected={activeTab}
            onSelect={handleTabChange}
            queryValue={searchValue}
            queryPlaceholder={t("Search products on this page")}
            onQueryChange={handleSearchChange}
            onQueryClear={handleSearchClear}
            onClearAll={handleSearchClear}
            filters={[]}
            appliedFilters={[]}
            mode={mode}
            setMode={setMode}
            hideFilters
            canCreateNewView={false}
            cancelAction={{ onAction: handleSearchClear, disabled: false, loading: false }}
          />
          <IndexTable
            resourceName={{ singular: t("product"), plural: t("products") }}
            itemCount={filteredProducts.length}
            selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
            onSelectionChange={handleSelectionChange}
            condensed={smDown}
            emptyState={emptyState}
            pagination={pagination}
            headings={[
              { id: "thumb", title: "", hidden: true },
              { id: "product", title: t("Product") },
              { id: "state", title: t("Status") },
              { id: "written", title: t("Content") },
              { id: "score", title: t("Score") },
              { id: "updated", title: t("Last written") },
              { id: "action", title: "", hidden: true },
            ]}
            promotedBulkActions={[
              {
                content: t("Optimize {length} selected", { length: t.number(selectedResources.length) }),
                onAction: () => {
                  if (isOutOfUsage) {
                    setBulkError(t("You have no credits left this month."));
                  }
                  setSelectionModal(true);
                },
              },
            ]}
          >
            {rows}
          </IndexTable>
        </Card>

        {/* The selection's confirmation: what will be written for the selected
            products, and the one warning that matters. */}
        <Modal
          open={selectionModal}
          onClose={() => setSelectionModal(false)}
          title={t("Optimize {n, plural, one {# selected product} other {# selected products}}", { n: selectedItems.length })}
          primaryAction={
            isOutOfUsage
              ? { content: t("See plans"), onAction: () => navigate("/app/plans") }
              : { content: t("Optimize {n, plural, one {# product} other {# products}}", { n: selectedItems.length }), onAction: handleBulkGenerate }
          }
          secondaryActions={[{ content: t("Cancel"), onAction: () => setSelectionModal(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              {isOutOfUsage ? (
                <QuotaReachedCard upsell={upsell} surface="products" />
              ) : (
                <>
                  <Banner tone="warning">
                    <p>
                      <strong>{t("This will replace existing product descriptions entirely.")}</strong>
                      {t("{v} Original content is saved automatically and can be restored from each product's History tab. If a product has custom HTML, embedded videos, or widgets in its description, they will be removed.", { v: "" })}
                    </p>
                  </Banner>
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    {t("Content to generate:")}
                  </Text>
                  <Checkbox label={t("Description")} checked={bulkDesc} onChange={setBulkDesc} helpText={t("Full product description")} />
                  <Checkbox label={t("Meta Title & Description")} checked={bulkMeta} onChange={setBulkMeta} helpText={t("SEO meta tags")} />
                  <Checkbox label={t("FAQ Content")} checked={bulkFaq} onChange={setBulkFaq} helpText={t("Q&A pairs")} />
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("~{minutes} min estimated · runs in background", { minutes: Math.ceil((selectedItems.length * 3.5) / 60) })}
                  </Text>
                  {bulkError && (
                    <Banner tone="critical">
                      <p>{bulkError}</p>
                    </Banner>
                  )}
                </>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Generate All confirmation modal */}
        <Modal
          open={generateAllModal}
          onClose={() => setGenerateAllModal(false)}
          title={entitlements?.bulkJobs ? t("Optimize {willProcessNow} products now?", { willProcessNow: t.number(willProcessNow) }) : t("Bulk optimize is on Starter")}
          primaryAction={
            entitlements?.bulkJobs
              ? { content: t("Optimize store"), onAction: handleGenerateAll }
              : { content: t("See plans"), onAction: () => navigate("/app/plans") }
          }
          secondaryActions={[{ content: t("Cancel"), onAction: () => setGenerateAllModal(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              {/* Group 3.1 — the merchant learns what the feature is and what it
                  costs BEFORE they are moved to a pricing page, and the thing
                  they CAN do today stays available. */}
              {!entitlements?.bulkJobs && (
                <Text as="p" variant="bodyMd">
                  {t("Bulk optimize writes content for every product in one background job. It is included from Starter. On your current plan you can still optimize products one at a time from the list below — nothing here is taken away.")}
                </Text>
              )}
              {entitlements?.bulkJobs && (
                <>
                  {/* Group 3.3 — this said "a background job for all 3,148
                      products ... ~184 minutes" while sliceToQuota was about to
                      cut the run to whatever quota remained. The app knew before
                      the click and promised the whole catalogue anyway. */}
                  <Text as="p" variant="bodyMd">
                    {t("This starts a background job for {willProcessNow} of the {notOptimized} products not yet optimized. Estimated time: ~{minutes} minutes.", { willProcessNow: t.number(willProcessNow), notOptimized: t.number(notOptimized), minutes: Math.max(1, Math.ceil((willProcessNow * 3.5) / 60)) })}
                  </Text>
                  {waitingForQuota > 0 && (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {t("The remaining {waitingForQuota} need more generations than your plan has left this month. They stay untouched — nothing is lost, and you can run this again after your quota resets or on a larger plan.", { waitingForQuota: t.number(waitingForQuota) })}
                    </Text>
                  )}
                </>
              )}
              <Text as="p" variant="bodySm" fontWeight="semibold">
                {t("Content to generate:")}
              </Text>
              <Checkbox label={t("Description")} checked={bulkDesc} onChange={setBulkDesc} />
              <Checkbox label={t("Meta Title & Description")} checked={bulkMeta} onChange={setBulkMeta} />
              <Checkbox label={t("FAQ Content")} checked={bulkFaq} onChange={setBulkFaq} />
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
          title={t("Publish without review is on")}
          primaryAction={{
            content: t("Generate and publish"),
            destructive: true,
            onAction: () => {
              const pending = publishConfirm;
              setPublishConfirm(null);
              if (pending) submit(buildBulkFormData(pending.actionType, pending.ids), { method: "POST" });
            },
          }}
          secondaryActions={[{ content: t("Cancel"), onAction: () => setPublishConfirm(null) }]}
        >
          <Modal.Section>
            <Text as="p" variant="bodyMd">
              {t("This will publish straight to your live storefront without a review step. You can turn this off in Settings.")}
            </Text>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
