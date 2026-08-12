import { useLoaderData, useActionData, useNavigation, useNavigate, useSubmit } from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import { scoreContent } from "../utils/contentScorer.server.js";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  ButtonGroup,
  Thumbnail,
  Badge,
  Banner,
  EmptyState,
  TextField,
  Divider,
  Tooltip,
} from "@shopify/polaris";
import { useState, useCallback, useEffect, useRef } from "react";
import pLimit from "p-limit";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { buildFaqSchemaMetafield } from "../utils/seo.server.js";
import { readMutationResult } from "../utils/adminGraphql.server.js";
import { decodeHtmlEntities } from "../utils/text.js";
import logger from "../utils/logger.server.js";
import { ReviewRequest } from "../components/ReviewRequest";
import { EmbedSetupCard } from "../components/EmbedSetupCard";

// ── Publish helper: bounded concurrency + Shopify throttle backoff ──────────────
const PUBLISH_CONCURRENCY = 3;
const PUBLISH_MAX_RETRIES = 3;
const PUBLISH_BACKOFF_BASE_MS = 2000;

const METAFIELDS_SET_MUTATION = `mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } }
}`;

// Write a product's FAQ JSON-LD metafield so the theme app embed emits FAQPage
// schema on the storefront. Non-fatal for the batch (the content itself already
// published, and the metafield is re-written on the next publish) — but the
// failure must be OBSERVED: check top-level errors AND userErrors, log, and
// return false so the caller can tell the merchant the schema didn't go live.
async function writeFaqMetafield(admin, metafieldInput, { shop, productId } = {}) {
  if (!metafieldInput) return true;
  try {
    const response = await admin.graphql(METAFIELDS_SET_MUTATION, { variables: { metafields: [metafieldInput] } });
    const result = await readMutationResult(response, "metafieldsSet");
    if (!result.ok) {
      logger.warn({ shop, productId, errors: result.errorMessages }, "FAQ metafieldsSet failed during bulk review publish");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ shop, productId, err: err.message }, "FAQ metafieldsSet threw during bulk review publish");
    return false;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRODUCT_UPDATE_MUTATION = `mutation updateProduct($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id }
    userErrors { field message }
  }
}`;

// Mirrors bulkProcessor.publishToShopify: honour Retry-After on 429 and the
// GraphQL THROTTLED extension code, with exponential backoff (base 2s, 3 retries).
async function publishProductWithRetry(admin, productId, input, attempt = 0) {
  let res;
  try {
    res = await admin.graphql(PRODUCT_UPDATE_MUTATION, { variables: { input } });
  } catch (err) {
    if (attempt < PUBLISH_MAX_RETRIES) {
      await sleep(PUBLISH_BACKOFF_BASE_MS * 2 ** attempt);
      return publishProductWithRetry(admin, productId, input, attempt + 1);
    }
    return { productId, ok: false, error: err.message };
  }

  if (res.status === 429 && attempt < PUBLISH_MAX_RETRIES) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
    await sleep(Math.max(retryAfter * 1000, PUBLISH_BACKOFF_BASE_MS));
    return publishProductWithRetry(admin, productId, input, attempt + 1);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    return { productId, ok: false, error: `Invalid response (HTTP ${res.status})` };
  }

  if (json?.errors?.[0]?.extensions?.code === "THROTTLED" && attempt < PUBLISH_MAX_RETRIES) {
    await sleep(PUBLISH_BACKOFF_BASE_MS * 2 ** (attempt + 1));
    return publishProductWithRetry(admin, productId, input, attempt + 1);
  }

  // Non-throttle top-level errors (removed field, invalid id, access denied)
  // MUST fail the publish — with data null the userErrors check below sees []
  // and would otherwise report success for a write that never happened.
  if (Array.isArray(json?.errors) && json.errors.length > 0) {
    return { productId, ok: false, error: json.errors.map((e) => e.message).join("; ") };
  }

  const userErrors = json?.data?.productUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { productId, ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }
  if (!json?.data?.productUpdate) {
    return { productId, ok: false, error: "Shopify returned no result for this update." };
  }
  return { productId, ok: true };
}

// ─── Loader ──────────────────────────────────────────────────────────────────

// Products per page (NOT content rows — a product can have up to 4 draft rows,
// so paging by row split one product's content across pages and made the page
// header disagree with the page size).
const PAGE_SIZE = 50;

// This queue publishes via productUpdate, so it must only ever contain
// PRODUCT drafts. Collection drafts share the GeneratedContent table (their
// productId column holds a Collection GID) and are reviewed/published on the
// Collections page — sending one to productUpdate fails forever ("Invalid id")
// and permanently jams the queue.
const PRODUCT_GID_PREFIX = "gid://shopify/Product/";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const draftWhere = { shop, status: "draft", productId: { startsWith: PRODUCT_GID_PREFIX } };

  // Page by DISTINCT product: order rows by recency, derive the ordered
  // distinct product list, slice the page, then fetch that page's full rows.
  const [draftIdRows, growthState] = await Promise.all([
    prisma.generatedContent.findMany({
      where: draftWhere,
      select: { productId: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.growthState.findUnique({ where: { shop }, select: { reviewRequestedAt: true, embedConfirmedAt: true } }),
  ]);
  const reviewRequested = !!growthState?.reviewRequestedAt;
  const embedConfirmed = !!growthState?.embedConfirmedAt;

  const orderedProductIds = [...new Set(draftIdRows.map((r) => r.productId))];
  const totalDraftCount = orderedProductIds.length;
  const pageProductIds = orderedProductIds.slice(skip, skip + PAGE_SIZE);

  const drafts = pageProductIds.length
    ? await prisma.generatedContent.findMany({
        where: { ...draftWhere, productId: { in: pageProductIds } },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  if (drafts.length === 0 && page === 1) {
    return Response.json({ products: [], page: 1, totalPages: 1, totalDraftCount: 0, reviewRequested, embedConfirmed, shopDomain: shop });
  }

  // Group by productId — preserve the recency order from pageProductIds
  const byProduct = {};
  for (const d of drafts) {
    if (!byProduct[d.productId]) {
      byProduct[d.productId] = {
        productId: d.productId,
        productTitle: d.productTitle || d.productId,
        content: {},
      };
    }
    byProduct[d.productId].content[d.contentType] = d.generatedContent;
  }

  // Batch-fetch product info from Shopify (chunked at 200 per request).
  // Iterate pageProductIds (not Object.keys) to keep recency order stable.
  const productIds = pageProductIds.filter((pid) => byProduct[pid]);
  const shopifyData = await fetchProductsBatch(admin, productIds);

  // Merge Shopify data + quality scores
  const products = productIds.map((pid) => {
    const info = shopifyData[pid] || {};
    const content = byProduct[pid].content;
    const score = scoreContent({
      description: content.description || "",
      metaTitle: content.metaTitle || "",
      metaDescription: content.metaDescription || "",
      faq: content.faq || "",
    });
    return {
      ...byProduct[pid],
      productTitle: info.title || byProduct[pid].productTitle,
      imageUrl: info.imageUrl || "",
      qualityScore: score.score,
    };
  });

  return Response.json({
    products,
    page,
    totalPages: Math.ceil(totalDraftCount / PAGE_SIZE),
    totalDraftCount,
    reviewRequested,
    embedConfirmed,
    shopDomain: shop,
  });
};

async function fetchProductsBatch(admin, productIds) {
  if (productIds.length === 0) return {};
  const BATCH_SIZE = 200;
  const result = {};

  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE);
    let response;
    try {
      response = await admin.graphql(
        `query getNodes($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              featuredImage { url altText }
            }
          }
        }`,
        { variables: { ids: batch } }
      );
    } catch (err) {
      logger.error({ batch: Math.floor(i / BATCH_SIZE) + 1, err: err.message }, "fetchProductsBatch batch failed");
      continue;
    }

    const { data, errors } = await response.json();
    if (errors?.length) {
      logger.error({ errors }, "Shopify nodes query returned errors");
      continue;
    }

    for (const node of data?.nodes ?? []) {
      if (node?.id) {
        result[node.id] = {
          title: node.title || "",
          imageUrl: node.featuredImage?.url || "",
        };
      }
    }
  }

  return result;
}

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "publish") {
    let approved;
    let edits = {};
    try {
      approved = JSON.parse(formData.get("approved") || "[]");
      edits = JSON.parse(formData.get("edits") || "{}");
    } catch {
      return Response.json({ error: "Invalid submission data." }, { status: 400 });
    }
    if (!Array.isArray(approved) || approved.length === 0) {
      return Response.json({ error: "No products approved for publishing." }, { status: 400 });
    }
    // Defence in depth: this action publishes via productUpdate, so drop any
    // non-Product GID (e.g. a Collection draft from a stale page) instead of
    // sending it to a mutation that can only ever reject it.
    approved = approved.filter((id) => typeof id === "string" && id.startsWith(PRODUCT_GID_PREFIX));
    if (approved.length === 0) {
      return Response.json({ error: "No publishable products in the selection." }, { status: 400 });
    }

    // Fetch draft content for each approved product
    const draftRecords = await prisma.generatedContent.findMany({
      where: { shop, productId: { in: approved }, status: "draft" },
    });

    const byProduct = {};
    const titleByProduct = {};
    for (const r of draftRecords) {
      if (!byProduct[r.productId]) byProduct[r.productId] = {};
      byProduct[r.productId][r.contentType] = r.generatedContent;
      if (r.productTitle) titleByProduct[r.productId] = r.productTitle;
    }

    let failed = 0;
    const errors = [];
    const successfulProductIds = [];
    const successfulEdits = {};

    // Publish with bounded concurrency (3) so a large approval batch doesn't
    // hammer Shopify into throttling; each call retries on 429/THROTTLED.
    const limit = pLimit(PUBLISH_CONCURRENCY);
    const results = await Promise.all(
      approved.map((productId) =>
        limit(async () => {
          // Merge DB drafts with any inline edits (edits take precedence)
          const content = { ...byProduct[productId], ...edits[productId] };
          const input = { id: productId };
          if (content.description) input.descriptionHtml = content.description;
          if (content.metaTitle || content.metaDescription) {
            input.seo = {};
            if (content.metaTitle) input.seo.title = content.metaTitle;
            if (content.metaDescription) input.seo.description = content.metaDescription;
          }
          const result = await publishProductWithRetry(admin, productId, input);
          // On success, write the FAQ JSON-LD metafield so the storefront emits
          // FAQPage schema (the AI-search/GEO promise) — not just for single-product
          // publishes, but for this bulk review flow too.
          if (result.ok) {
            const faqOk = await writeFaqMetafield(admin, buildFaqSchemaMetafield(productId, content.faq), { shop, productId });
            if (!faqOk) result.faqFailed = true;
          }
          return result;
        })
      )
    );

    const faqFailedIds = [];
    for (const r of results) {
      if (r.ok) {
        successfulProductIds.push(r.productId);
        if (r.faqFailed) faqFailedIds.push(r.productId);
        if (edits[r.productId]) successfulEdits[r.productId] = edits[r.productId];
      } else {
        failed++;
        // Show the merchant the product's name, never a raw GID.
        errors.push({
          productId: r.productId,
          productTitle: titleByProduct[r.productId] || "Untitled product",
          error: r.error,
        });
      }
    }

    // BATCH all DB status updates in a single transaction
    if (successfulProductIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.generatedContent.updateMany({
          where: { shop, productId: { in: successfulProductIds }, status: "draft" },
          data: { status: "published" },
        });

        // A product whose FAQ metafield write failed must NOT show "FAQ ✓" —
        // downgrade just the FAQ row so the UI stays honest and the next
        // publish retries the metafield.
        if (faqFailedIds.length > 0) {
          await tx.generatedContent.updateMany({
            where: { shop, productId: { in: faqFailedIds }, contentType: "faq", status: "published" },
            data: { status: "draft" },
          });
        }

        const editedProductIds = Object.keys(successfulEdits).filter((id) =>
          successfulProductIds.includes(id)
        );
        if (editedProductIds.length > 0) {
          await Promise.all(
            editedProductIds.flatMap((productId) =>
              Object.entries(successfulEdits[productId]).map(([type, content]) =>
                tx.generatedContent.updateMany({
                  where: { shop, productId, contentType: type, status: "published" },
                  data: { generatedContent: content },
                })
              )
            )
          );
        }
      });
    }

    const published = successfulProductIds.length;
    const faqWarning = faqFailedIds.length > 0
      ? ` FAQ schema failed for ${faqFailedIds.length} product${faqFailedIds.length !== 1 ? "s" : ""} — it stays in drafts so you can retry.`
      : "";

    // If FAQ content just published but the theme app embed is still off, the
    // JSON-LD won't reach the storefront — tell the merchant (5.1.3).
    const publishedFaq = draftRecords.some(
      (r) => r.contentType === "faq" && successfulProductIds.includes(r.productId) && !faqFailedIds.includes(r.productId)
    );
    let embedNotice = "";
    if (publishedFaq) {
      const gs = await prisma.growthState.findUnique({ where: { shop }, select: { embedConfirmedAt: true } });
      if (!gs?.embedConfirmedAt) {
        embedNotice = " Note: your FAQ schema won't appear to search engines until you enable the \"AI-search FAQ schema\" app embed in your theme (see the setup card).";
      }
    }

    return Response.json({
      success: true,
      published,
      failed,
      errors,
      message: `Published content for ${published} product${published !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}.${faqWarning}${embedNotice}`,
    });
  }

  if (actionType === "reject") {
    let rejected;
    try {
      rejected = JSON.parse(formData.get("rejected") || "[]");
    } catch {
      return Response.json({ error: "Invalid rejection data." }, { status: 400 });
    }
    if (Array.isArray(rejected) && rejected.length > 0) {
      await prisma.generatedContent.updateMany({
        where: { shop, productId: { in: rejected }, status: "draft" },
        data: { status: "rejected" },
      });
    }
    return Response.json({ success: true, message: `${rejected.length} product(s) marked as rejected.` });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { products, page, totalPages, reviewRequested, embedConfirmed, shopDomain } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  // Ask for an App Store review right after a bulk publish succeeds (once ever).
  const askReview = !reviewRequested && !!actionData?.success && (actionData?.published ?? 0) >= 1;
  const navigate = useNavigate();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";


  const [approved, setApproved] = useState(() => new Set(products.map((p) => p.productId)));
  const [search, setSearch] = useState("");
  // edits: { [productId]: { [contentType]: editedValue } }
  const [edits, setEdits] = useState({});

  const handleEdit = useCallback((productId, type, value) => {
    setEdits((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [type]: value },
    }));
  }, []);

  const toggleApproved = useCallback((productId) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setApproved(new Set(products.map((p) => p.productId)));
  }, [products]);

  const deselectAll = useCallback(() => setApproved(new Set()), []);

  const handlePublish = useCallback(() => {
    const fd = new FormData();
    fd.append("actionType", "publish");
    fd.append("approved", JSON.stringify([...approved]));
    fd.append("edits", JSON.stringify(edits));
    submit(fd, { method: "POST" });
  }, [approved, edits, submit]);

  const handleRejectUnapproved = useCallback(() => {
    const rejectedIds = products
      .map((p) => p.productId)
      .filter((id) => !approved.has(id));
    if (rejectedIds.length === 0) return;
    const fd = new FormData();
    fd.append("actionType", "reject");
    fd.append("rejected", JSON.stringify(rejectedIds));
    submit(fd, { method: "POST" });
  }, [products, approved, submit]);

  const prevActionData = useRef(null);
  useEffect(() => {
    if (actionData?.success && actionData !== prevActionData.current) {
      prevActionData.current = actionData;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show(actionData.message ?? "Done!", { duration: 4000 });
      }
    }
  }, [actionData]);

  const filtered = products.filter((p) =>
    p.productTitle.toLowerCase().includes(search.toLowerCase())
  );

  const approvedCount = [...approved].filter((id) =>
    products.some((p) => p.productId === id)
  ).length;

  if (products.length === 0) {
    return (
      <Page
        title="Review & Publish"
        backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      >
        {/* After publishing all drafts we land here with a success actionData —
            still the right moment to ask for a review. */}
        <ReviewRequest active={askReview} />
        <EmptyState
          heading="Nothing to review — you're all caught up! 🎉"
          image="/empty-review.svg"
          action={{ content: "Go to Products", onAction: () => navigate("/app/products") }}
        >
          <p>Generate content from the Products page, then come back here to review and publish.</p>
        </EmptyState>
      </Page>
    );
  }


  return navigation.state === "loading" ? (
    <AppSkeleton title="Review & Publish" sections={2} layout="full" />
  ) : (
    <Page
      title="Review & Publish"
      subtitle={`${products.length} product${products.length !== 1 ? "s" : ""} with draft content ready to review`}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        <ReviewRequest active={askReview} />
        <EmbedSetupCard shopDomain={shopDomain} confirmed={embedConfirmed} />
        <Banner tone="info">
          Generated by premium AI in your brand voice. Review each draft, then publish — published
          content goes live in your store with AI-search (GEO) FAQ schema attached, so it can rank in
          search and be cited by AI answer engines.
        </Banner>

        {actionData?.success && actionData.errors?.length > 0 && (
          <Banner tone="warning" title="Published with some errors">
            {actionData.errors.map((e, i) => (
              <p key={i}>Failed: {e.productTitle || "Untitled product"} — {e.error}</p>
            ))}
          </Banner>
        )}
        {actionData?.error && (
          <Banner tone="critical"><p>{actionData.error}</p></Banner>
        )}

        {/* Action bar */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {approvedCount} of {products.length} approved
                </Text>
                <Button variant="plain" size="slim" onClick={selectAll}>Select All</Button>
                <Button variant="plain" size="slim" onClick={deselectAll}>Deselect All</Button>
              </InlineStack>
              <ButtonGroup>
                <Button
                  tone="critical"
                  onClick={handleRejectUnapproved}
                  loading={isSubmitting && navigation.formData?.get("actionType") === "reject"}
                  disabled={isSubmitting || approvedCount === products.length}
                >
                  Reject skipped
                </Button>
                <Button
                  variant="primary"
                  tone="success"
                  onClick={handlePublish}
                  loading={isSubmitting && navigation.formData?.get("actionType") === "publish"}
                  disabled={isSubmitting || approvedCount === 0}
                >
                  Publish {approvedCount} approved →
                </Button>
              </ButtonGroup>
            </InlineStack>

            <TextField
              label=""
              labelHidden
              placeholder="Search products..."
              value={search}
              onChange={setSearch}
              clearButton
              onClearButtonClick={() => setSearch("")}
              autoComplete="off"
            />
          </BlockStack>
        </Card>

        {/* Product cards */}
        <BlockStack gap="400">
          {filtered.map((product) => (
            <ProductReviewCard
              key={product.productId}
              product={product}
              isApproved={approved.has(product.productId)}
              onToggle={() => toggleApproved(product.productId)}
              onEdit={(type, value) => handleEdit(product.productId, type, value)}
            />
          ))}
        </BlockStack>

        {/* Bottom publish button */}
        {filtered.length > 3 && (
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {approvedCount} of {products.length} approved and ready to publish
              </Text>
              <Button
                variant="primary"
                tone="success"
                size="large"
                onClick={handlePublish}
                loading={isSubmitting && navigation.formData?.get("actionType") === "publish"}
                disabled={isSubmitting || approvedCount === 0}
              >
                Publish {approvedCount} approved →
              </Button>
            </InlineStack>
          </Card>
        )}

        {totalPages > 1 && (
          <Card>
            <InlineStack align="center" gap="400">
              <Button
                disabled={page <= 1}
                onClick={() => navigate(`/app/review?page=${page - 1}`)}
              >
                ← Previous
              </Button>
              <Text as="p" variant="bodySm" tone="subdued">Page {page} of {totalPages}</Text>
              <Button
                disabled={page >= totalPages}
                onClick={() => navigate(`/app/review?page=${page + 1}`)}
              >
                Next →
              </Button>
            </InlineStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

function ProductReviewCard({ product, isApproved, onToggle, onEdit }) {
  const [expanded, setExpanded] = useState({});
  const toggleExpand = (type) =>
    setExpanded((prev) => ({ ...prev, [type]: !prev[type] }));

  const contentTypes = ["description", "metaTitle", "metaDescription", "faq"].filter(
    (t) => product.content[t]
  );

  return (
    // Left accent stripe makes each card's include/skip state obvious at a glance:
    // green = will publish, grey = skipped.
    <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: `inset 4px 0 0 ${isApproved ? "#00A047" : "#C9CCCF"}` }}>
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
          <InlineStack gap="300" blockAlign="center">
            <Thumbnail
              source={
                product.imageUrl ||
                "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png"
              }
              alt={product.productTitle}
              size="medium"
            />
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h3" variant="headingMd">{product.productTitle}</Text>
                {product.qualityScore != null && (
                  // Labelled "Content quality" (distinct from GEO/AI-search and
                  // traditional SEO scores shown elsewhere). Unified colour rule:
                  // >=70 green, 40–69 amber, <40 red — a mid score is "work to do",
                  // not "broken", so it never shows alarming red.
                  <Tooltip content="Content quality score — measures how complete and structured this content is for AI search.">
                    <Badge tone={product.qualityScore >= 70 ? "success" : product.qualityScore >= 40 ? "attention" : "critical"}>
                      {`Content quality: ${product.qualityScore}`}
                    </Badge>
                  </Tooltip>
                )}
              </InlineStack>
              <InlineStack gap="200">
                {contentTypes.map((t) => (
                  <Badge key={t} tone="info">{t}</Badge>
                ))}
              </InlineStack>
            </BlockStack>
          </InlineStack>
          {isApproved ? (
            <Button variant="primary" tone="success" onClick={onToggle}>✓ Approved</Button>
          ) : (
            <Button variant="tertiary" onClick={onToggle}>Skipped — tap to include</Button>
          )}
        </InlineStack>

        <Divider />

        {contentTypes.map((type) => (
          <ContentSection
            key={type}
            type={type}
            content={product.content[type]}
            expanded={!!expanded[type]}
            onToggle={() => toggleExpand(type)}
            onEdit={(value) => onEdit(type, value)}
          />
        ))}
      </BlockStack>
    </Card>
    </div>
  );
}

function ContentSection({ type, content, expanded, onToggle, onEdit }) {
  const [editedValue, setEditedValue] = useState(content);


  const labels = {
    description: "Description",
    metaTitle: "Meta Title",
    metaDescription: "Meta Description",
    faq: "FAQ",
  };

  const handleChange = useCallback((value) => {
    setEditedValue(value);
    onEdit(value);
  }, [onEdit]);

  // decodeHtmlEntities: stored content (and stripped HTML) can carry entities
  // ("Premium Skateboards &amp; Gear") which React renders literally.
  const preview =
    type === "description"
      ? decodeHtmlEntities(content.replace(/<[^>]+>/g, "")).substring(0, 120) + "..."
      : decodeHtmlEntities(content).substring(0, 120) + (content.length > 120 ? "..." : "");

  const charLimit = type === "metaTitle" ? 60 : type === "metaDescription" ? 155 : null;
  const charCount = editedValue.length;
  const overLimit = charLimit && charCount > charLimit;

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="p" variant="bodySm" fontWeight="semibold">{labels[type] || type}</Text>
        <Button variant="plain" size="slim" onClick={onToggle}>
          {expanded ? "Collapse" : "Edit"}
        </Button>
      </InlineStack>
      {expanded ? (
        <BlockStack gap="100">
          <TextField
            label=""
            labelHidden
            value={editedValue}
            onChange={handleChange}
            multiline={type === "description" ? 8 : type === "faq" ? 6 : 2}
            helpText={charLimit ? `${charCount}/${charLimit} characters${overLimit ? " — too long" : ""}` : "Edit before publishing"}
            error={overLimit ? `Shorten to under ${charLimit} characters` : ""}
            autoComplete="off"
          />
        </BlockStack>
      ) : (
        <Text as="p" variant="bodySm" tone="subdued">{preview}</Text>
      )}
    </BlockStack>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
