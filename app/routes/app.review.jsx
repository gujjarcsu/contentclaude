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
import { ReviewRequest } from "../components/ReviewRequest";

// ── Publish helper: bounded concurrency + Shopify throttle backoff ──────────────
const PUBLISH_CONCURRENCY = 3;
const PUBLISH_MAX_RETRIES = 3;
const PUBLISH_BACKOFF_BASE_MS = 2000;

const METAFIELDS_SET_MUTATION = `mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } }
}`;

// Write a product's FAQ JSON-LD metafield so the theme app embed emits FAQPage
// schema on the storefront. Non-fatal: the content already published, and the
// metafield is re-written on the next publish, so we never fail a batch over it.
async function writeFaqMetafield(admin, metafieldInput) {
  if (!metafieldInput) return;
  try {
    await admin.graphql(METAFIELDS_SET_MUTATION, { variables: { metafields: [metafieldInput] } });
  } catch {
    /* non-fatal */
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

  const userErrors = json?.data?.productUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { productId, ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }
  return { productId, ok: true };
}

// ─── Loader ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const [drafts, totalDraftCount, growthState] = await Promise.all([
    prisma.generatedContent.findMany({
      where: { shop, status: "draft" },
      orderBy: { updatedAt: "desc" },
      take: PAGE_SIZE,
      skip,
    }),
    prisma.generatedContent.count({ where: { shop, status: "draft" } }),
    prisma.growthState.findUnique({ where: { shop }, select: { reviewRequestedAt: true } }),
  ]);
  const reviewRequested = !!growthState?.reviewRequestedAt;

  if (drafts.length === 0 && page === 1) {
    return Response.json({ products: [], page: 1, totalPages: 1, totalDraftCount: 0, reviewRequested });
  }

  // Group by productId
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

  // Batch-fetch product info from Shopify (chunked at 200 per request)
  const productIds = Object.keys(byProduct);
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
      console.error(`fetchProductsBatch batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
      continue;
    }

    const { data } = await response.json();
    if (data?.errors) {
      console.error("Shopify nodes query error:", JSON.stringify(data.errors));
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

    // Fetch draft content for each approved product
    const draftRecords = await prisma.generatedContent.findMany({
      where: { shop, productId: { in: approved }, status: "draft" },
    });

    const byProduct = {};
    for (const r of draftRecords) {
      if (!byProduct[r.productId]) byProduct[r.productId] = {};
      byProduct[r.productId][r.contentType] = r.generatedContent;
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
            await writeFaqMetafield(admin, buildFaqSchemaMetafield(productId, content.faq));
          }
          return result;
        })
      )
    );

    for (const r of results) {
      if (r.ok) {
        successfulProductIds.push(r.productId);
        if (edits[r.productId]) successfulEdits[r.productId] = edits[r.productId];
      } else {
        failed++;
        errors.push({ productId: r.productId, error: r.error });
      }
    }

    // BATCH all DB status updates in a single transaction
    if (successfulProductIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.generatedContent.updateMany({
          where: { shop, productId: { in: successfulProductIds }, status: "draft" },
          data: { status: "published" },
        });

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

    return Response.json({
      success: true,
      published,
      failed,
      errors,
      message: `Published content for ${published} product${published !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}.`,
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
  const { products, page, totalPages, reviewRequested } = useLoaderData();
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
        <Banner tone="info">
          Generated by premium AI in your brand voice. Review each draft, then publish — published
          content goes live in your store with AI-search (GEO) FAQ schema attached, so it can rank in
          search and be cited by AI answer engines.
        </Banner>

        {actionData?.success && actionData.errors?.length > 0 && (
          <Banner tone="warning" title="Published with some errors">
            {actionData.errors.map((e, i) => (
              <p key={i}>Failed: {e.productId} — {e.error}</p>
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

  const preview =
    type === "description"
      ? content.replace(/<[^>]+>/g, "").substring(0, 120) + "..."
      : content.substring(0, 120) + (content.length > 120 ? "..." : "");

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
