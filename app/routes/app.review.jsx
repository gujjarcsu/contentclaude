import {
  useLoaderData,
  useActionData,
  useNavigation,
  useNavigate,
  useSubmit,
  useFetcher,
} from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import { scoreContent } from "../utils/contentScorer.server.js";
import {
  Modal,
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Button,
  ButtonGroup,
  Checkbox,
  Thumbnail,
  Badge,
  Banner,
  EmptyState,
  TextField,
  Divider,
  Tooltip,
} from "@shopify/polaris";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import pLimit from "p-limit";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { buildFaqSchemaMetafield, ensureFaqMetafieldDefinition } from "../utils/seo.server.js";
import { readMutationResult, publishProductWithRetry } from "../utils/adminGraphql.server.js";
import { decodeHtmlEntities } from "../utils/text.js";
import logger from "../utils/logger.server.js";
import { ReviewRequest } from "../components/ReviewRequest.jsx";
import { openReviewAsk } from "../utils/reviewAsk.server.js";
import { EmbedSetupCard } from "../components/EmbedSetupCard.jsx";
import { useRouteLoading } from "../utils/useRouteLoading.js";

// ── Publish helper: bounded concurrency + Shopify throttle backoff ──────────────
// The retry/result-checking itself now lives in adminGraphql.server.js so the
// bulk processor runs the identical code path (Phase 0 item 9).
const PUBLISH_CONCURRENCY = 3;

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
    const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables: { metafields: [metafieldInput] },
    });
    const result = await readMutationResult(response, "metafieldsSet");
    if (!result.ok) {
      logger.warn(
        { shop, productId, errors: result.errorMessages },
        "FAQ metafieldsSet failed during bulk review publish",
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ shop, productId, err: err.message }, "FAQ metafieldsSet threw during bulk review publish");
    return false;
  }
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

// The four draft types this page reviews, in the order they are shown.
const CONTENT_TYPES = ["description", "metaTitle", "metaDescription", "faq"];

// Merchant-facing names for the content types. The stored keys ("metaTitle")
// are ours, not words a merchant has ever seen — they were being rendered raw
// in the badges. One map, used by the badges, the section headings and the
// editor's accessible label, so the wording can never drift apart again.
const CONTENT_LABELS = {
  description: "Description",
  metaTitle: "Page title",
  metaDescription: "Search description",
  faq: "FAQ",
};

// Stable DOM id for a product's Approve checkbox, so the keyboard handler can
// put real browser focus on it (visible focus ring, scrolled into view).
const approveCheckboxId = (productId) => `approve-${String(productId).replace(/\W+/g, "-")}`;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const draftWhere = { shop, status: "draft", productId: { startsWith: PRODUCT_GID_PREFIX } };

  // Page by DISTINCT product: order rows by recency, derive the ordered
  // distinct product list, slice the page, then fetch that page's full rows.
  const [draftIdRows, growthState, unverifiedRows] = await Promise.all([
    prisma.generatedContent.findMany({
      where: draftWhere,
      select: { productId: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.growthState.findUnique({
      where: { shop },
      select: { embedConfirmedAt: true },
    }),
    // Phase 4 item 4.2 — content Shopify accepted but did not echo back
    // unchanged. It IS live; what is unconfirmed is that it is the content the
    // merchant approved. Surfaced here, at the top of the screen where they
    // approve things, because this is where they would look.
    prisma.generatedContent
      .findMany({
        where: {
          shop,
          status: "published_unverified",
          productId: { startsWith: PRODUCT_GID_PREFIX },
        },
        select: { productId: true, productTitle: true, verifyNote: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
      .catch(() => []),
  ]);

  // One entry per product — a product whose description and meta title both
  // came back different is one thing for the merchant to look at, not two.
  const needsCheck = [];
  const seenNeedsCheck = new Set();
  for (const r of unverifiedRows ?? []) {
    if (seenNeedsCheck.has(r.productId)) continue;
    seenNeedsCheck.add(r.productId);
    needsCheck.push({
      productId: r.productId,
      numericId: String(r.productId).split("/").pop(),
      productTitle: r.productTitle || "Untitled product",
      note: r.verifyNote || "Shopify stored something different from what we sent.",
    });
  }

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
    return Response.json({
      products: [],
      page: 1,
      totalPages: 1,
      totalDraftCount: 0,
      needsCheck,
      embedConfirmed,
      shopDomain: shop,
    });
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
      // What is on the product right now, so the merchant can see what the
      // draft would replace instead of approving blind.
      current: info.current || emptyCurrent(),
      qualityScore: score.score,
    };
  });

  return Response.json({
    products,
    page,
    totalPages: Math.ceil(totalDraftCount / PAGE_SIZE),
    totalDraftCount,
    needsCheck,
    embedConfirmed,
    shopDomain: shop,
  });
};

// "Nothing is on the product yet" — the shape the card expects when Shopify
// could not be reached, so a failed fetch shows "Nothing yet" rather than
// crashing the page.
const emptyCurrent = () => ({ description: "", metaTitle: "", metaDescription: "", faq: "" });

async function fetchProductsBatch(admin, productIds) {
  if (productIds.length === 0) return {};
  const BATCH_SIZE = 200;
  const result = {};

  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE);
    let response;
    try {
      // ONE query per batch for everything the page needs: the card header
      // (title, image) and the live values shown beside each draft.
      response = await admin.graphql(
        `query getNodes($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              descriptionHtml
              seo { title description }
              featuredImage { url altText }
            }
          }
        }`,
        { variables: { ids: batch } },
      );
    } catch (err) {
      logger.error(
        { batch: Math.floor(i / BATCH_SIZE) + 1, err: err.message },
        "fetchProductsBatch batch failed",
      );
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
          current: {
            description: node.descriptionHtml || "",
            metaTitle: node.seo?.title || "",
            metaDescription: node.seo?.description || "",
            // The FAQ lives in a metafield, not on the product record — there
            // is no "current" to compare against, so the card says so.
            faq: "",
          },
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

    // Make sure the faq_schema metafield definition exists before the batch
    // writes metafields (idempotent, cached 24h, non-fatal).
    await ensureFaqMetafieldDefinition(shop, async (q, v) =>
      (await admin.graphql(q, v ? { variables: v } : undefined)).json(),
    );

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
          const result = await publishProductWithRetry((q, o) => admin.graphql(q, o), productId, input);
          // On success, write the FAQ JSON-LD metafield so the storefront emits
          // FAQPage schema (the AI-search/GEO promise) — not just for single-product
          // publishes, but for this bulk review flow too.
          if (result.ok) {
            const faqOk = await writeFaqMetafield(admin, buildFaqSchemaMetafield(productId, content.faq), {
              shop,
              productId,
            });
            if (!faqOk) result.faqFailed = true;
          }
          return result;
        }),
      ),
    );

    const faqFailedIds = [];
    // Phase 4 item 4.2 — a publish Shopify accepted but whose returned value did
    // not match what we sent is LIVE but unconfirmed. It is recorded
    // separately so Review can tell the merchant to look, rather than being
    // filed alongside publishes we actually checked.
    const unverified = [];
    for (const r of results) {
      if (r.ok) {
        successfulProductIds.push(r.productId);
        if (r.verified === false) unverified.push({ productId: r.productId, note: r.verifyNote });
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
        const unverifiedIds = unverified.map((u) => u.productId);
        const verifiedIds = successfulProductIds.filter((id) => !unverifiedIds.includes(id));

        if (verifiedIds.length > 0) {
          await tx.generatedContent.updateMany({
            where: { shop, productId: { in: verifiedIds }, status: "draft" },
            data: { status: "published", verifiedAt: new Date(), verifyNote: null },
          });
        }
        // One update per product because the note differs per product — there
        // is no useful single note for "these four all went wrong differently".
        for (const u of unverified) {
          await tx.generatedContent.updateMany({
            where: { shop, productId: u.productId, status: "draft" },
            data: {
              status: "published_unverified",
              verifiedAt: null,
              verifyNote: u.note ?? "Shopify stored something different from what we sent.",
            },
          });
        }

        // A product whose FAQ metafield write failed must NOT show "FAQ ✓" —
        // downgrade just the FAQ row so the UI stays honest and the next
        // publish retries the metafield.
        if (faqFailedIds.length > 0) {
          await tx.generatedContent.updateMany({
            where: {
              shop,
              productId: { in: faqFailedIds },
              contentType: "faq",
              status: { in: ["published", "published_unverified"] },
            },
            data: { status: "draft" },
          });
        }

        const editedProductIds = Object.keys(successfulEdits).filter((id) =>
          successfulProductIds.includes(id),
        );
        if (editedProductIds.length > 0) {
          await Promise.all(
            editedProductIds.flatMap((productId) =>
              Object.entries(successfulEdits[productId]).map(([type, content]) =>
                tx.generatedContent.updateMany({
                  where: {
                    shop,
                    productId,
                    contentType: type,
                    status: { in: ["published", "published_unverified"] },
                  },
                  data: { generatedContent: content },
                }),
              ),
            ),
          );
        }
      });
    }

    const published = successfulProductIds.length;
    const faqWarning =
      faqFailedIds.length > 0
        ? ` FAQ schema failed for ${faqFailedIds.length} product${faqFailedIds.length !== 1 ? "s" : ""} — it stays in drafts so you can retry.`
        : "";

    // If FAQ content just published but the theme app embed is still off, the
    // JSON-LD won't reach the storefront — tell the merchant (5.1.3).
    const publishedFaq = draftRecords.some(
      (r) =>
        r.contentType === "faq" &&
        successfulProductIds.includes(r.productId) &&
        !faqFailedIds.includes(r.productId),
    );
    let embedNotice = "";
    if (publishedFaq) {
      const gs = await prisma.growthState.findUnique({ where: { shop }, select: { embedConfirmedAt: true } });
      if (!gs?.embedConfirmedAt) {
        embedNotice =
          ' Note: your FAQ schema won\'t appear to search engines until you enable the "AI-search FAQ schema" app embed in your theme (see the setup card).';
      }
    }

    // Phase 3 item 3.3 — the ONE place a review ask is opened from this
    // screen: inside the publish the merchant just confirmed, only when it
    // actually published something, and only on their third approve or later.
    // Returns null (never throws) whenever the shop is not eligible.
    const reviewAsk =
      published > 0
        ? await openReviewAsk({ shop, surface: "review_page", trigger: "publish", publishedCount: published })
        : null;

    return Response.json({
      success: true,
      published,
      failed,
      errors,
      reviewAsk,
      unverified: unverified.length,
      message:
        `Published content for ${published} product${published !== 1 ? "s" : ""}` +
        `${failed > 0 ? `, ${failed} failed` : ""}.` +
        (unverified.length > 0
          ? ` ${unverified.length} went live but Shopify stored something different — check ${unverified.length === 1 ? "it" : "them"} below.`
          : "") +
        `${faqWarning}${embedNotice}`,
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

  // Persist one inline edit as the merchant makes it (fired on blur, not on
  // every keystroke). Edits used to live only in React state, so turning the
  // page — or a reload, or a session timeout — threw the merchant's rewriting
  // away without a word. The publish-time `edits` merge above still runs; this
  // is what survives leaving the page.
  if (actionType === "saveEdit") {
    const productId = formData.get("productId");
    const contentType = formData.get("contentType");
    const content = formData.get("content");
    if (
      typeof productId !== "string" ||
      !productId ||
      typeof contentType !== "string" ||
      !CONTENT_TYPES.includes(contentType) ||
      typeof content !== "string"
    ) {
      return Response.json({ error: "Invalid edit." }, { status: 400 });
    }

    const productTitle = formData.get("productTitle");
    await prisma.generatedContent.upsert({
      where: { shop_productId_contentType: { shop, productId, contentType } },
      update: { generatedContent: content },
      create: {
        shop,
        productId,
        contentType,
        productTitle: typeof productTitle === "string" ? productTitle : "",
        generatedContent: content,
        status: "draft",
      },
    });

    return Response.json({ success: true, saved: true, productId, contentType });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
};

// A blur-save is a background write of text the page already has on screen.
// Without this, every blur would re-run the loader — and with it a Shopify
// GraphQL fetch for all 50 products on the page. Publish and reject still
// revalidate as before.
export const shouldRevalidate = ({ formData, defaultShouldRevalidate }) => {
  if (formData?.get("actionType") === "saveEdit") return false;
  return defaultShouldRevalidate;
};

/**
 * Phase 4 item 4.2 — content that went live but could not be confirmed.
 *
 * Shopify accepted the write and returned success, but the value it echoed back
 * in the same response was not the value we sent. The content IS on the
 * storefront; what is unconfirmed is that it is the content the merchant
 * approved. Most often that is Shopify truncating a page title.
 *
 * Tone is `warning`, not `critical`. Nothing is broken and nothing was lost —
 * something needs a look. Crying wolf here would teach merchants to dismiss the
 * one banner in the app that says "your storefront may not say what you think".
 */
function NeedsCheckBanner({ items, navigate }) {
  if (!items || items.length === 0) return null;
  return (
    <Banner
      tone="warning"
      title={
        items.length === 1
          ? "1 product went live, but Shopify stored something different"
          : `${items.length} products went live, but Shopify stored something different`
      }
    >
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd">
          These are on your storefront now. We checked what Shopify saved against what we sent, and they do
          not match — usually because Shopify shortened something. Open one to compare.
        </Text>
        <BlockStack gap="100">
          {items.slice(0, 5).map((it) => (
            <InlineStack key={it.productId} align="space-between" blockAlign="center" wrap gap="200">
              <Text as="p" variant="bodySm">
                <strong>{it.productTitle}</strong> — {it.note}
              </Text>
              <Button variant="plain" onClick={() => navigate(`/app/products/${it.numericId}`)}>
                Open
              </Button>
            </InlineStack>
          ))}
          {items.length > 5 && (
            <Text as="p" variant="bodySm" tone="subdued">
              {`and ${items.length - 5} more`}
            </Text>
          )}
        </BlockStack>
      </BlockStack>
    </Banner>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { products, page, totalPages, needsCheck, embedConfirmed, shopDomain } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const loadingThisRoute = useRouteLoading();
  // Ask for an App Store review right after a bulk publish succeeds (once ever).

  const navigate = useNavigate();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

  // NOTHING is approved until the merchant says so. This used to start as
  // every product on the page, so the first press of Publish pushed drafts the
  // merchant had never opened to a live storefront.
  const [approved, setApproved] = useState(() => new Set());
  const [search, setSearch] = useState("");
  // edits: { [productId]: { [contentType]: editedValue } } — still merged at
  // publish time; each one is also written to the draft row on blur.
  const [edits, setEdits] = useState({});
  const saveFetcher = useFetcher();

  const handleEdit = useCallback((productId, type, value) => {
    setEdits((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [type]: value },
    }));
  }, []);

  // Blur, not keystroke: one write when the merchant leaves the field.
  const handleSaveEdit = useCallback(
    (productId, productTitle, type, value) => {
      const fd = new FormData();
      fd.append("actionType", "saveEdit");
      fd.append("productId", productId);
      fd.append("productTitle", productTitle ?? "");
      fd.append("contentType", type);
      fd.append("content", value);
      saveFetcher.submit(fd, { method: "POST" });
    },
    [saveFetcher],
  );

  const toggleApproved = useCallback((productId) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const approveAllOnPage = useCallback(() => {
    setApproved(new Set(products.map((p) => p.productId)));
  }, [products]);

  const clearSelection = useCallback(() => setApproved(new Set()), []);

  const handlePublish = useCallback(() => {
    const fd = new FormData();
    fd.append("actionType", "publish");
    fd.append("approved", JSON.stringify([...approved]));
    fd.append("edits", JSON.stringify(edits));
    submit(fd, { method: "POST" });
  }, [approved, edits, submit]);

  /**
   * Phase 2 item 2.8 — rejecting is now confirmed.
   *
   * Making approvals start empty (so a merchant cannot publish content they
   * have never opened) had a consequence nobody asked for: this button, which
   * rejects everything NOT approved, became enabled in the default state. On a
   * freshly loaded page that is every draft, one click, no confirmation, and no
   * way back from the UI.
   *
   * Removing one foot-gun should not install another, so it asks first and says
   * the number.
   */
  const unapprovedIds = products.map((p) => p.productId).filter((id) => !approved.has(id));

  const doRejectUnapproved = useCallback(() => {
    if (unapprovedIds.length === 0) return;
    const fd = new FormData();
    fd.append("actionType", "reject");
    fd.append("rejected", JSON.stringify(unapprovedIds));
    submit(fd, { method: "POST" });
    setConfirmReject(false);
  }, [unapprovedIds, submit]);

  const [confirmReject, setConfirmReject] = useState(false);

  const prevActionData = useRef(null);
  useEffect(() => {
    if (actionData?.success && actionData !== prevActionData.current) {
      prevActionData.current = actionData;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show(actionData.message ?? "Done!", { duration: 4000 });
      }
    }
  }, [actionData]);

  const filtered = useMemo(
    () => products.filter((p) => p.productTitle.toLowerCase().includes(search.toLowerCase())),
    [products, search],
  );

  const approvedCount = [...approved].filter((id) => products.some((p) => p.productId === id)).length;

  // Keyboard review: arrow right steps to the next product, Enter approves the
  // one you are on. -1 means "nobody yet" — Enter must never approve something
  // the merchant has not stepped to.
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Never hijack a key the merchant is typing with.
      const target = event.target;
      const tag = target?.tagName;
      if (target?.isContentEditable || tag === "TEXTAREA" || tag === "SELECT") return;
      if (tag === "INPUT") {
        // The arrow keys move focus ONTO the Approve checkbox, so a checkbox
        // must not bail out of the handler that put it there. Only text entry
        // is protected.
        const inputType = (target.type || "text").toLowerCase();
        if (inputType !== "checkbox" && inputType !== "radio") return;
      }
      // A focused button already answers to Enter; approving as well would fire
      // two things off one keypress.
      if (event.key === "Enter" && (tag === "BUTTON" || tag === "A")) return;

      if (filtered.length === 0) return;
      const i = activeIndexRef.current;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex(Math.min(i + 1, filtered.length - 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex(i <= 0 ? 0 : i - 1);
      } else if (event.key === "Enter" && i >= 0 && i < filtered.length) {
        event.preventDefault();
        toggleApproved(filtered[i].productId);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [filtered, toggleApproved]);

  // Move the real browser focus with the arrow keys, so the merchant can see
  // where they are and the page scrolls the card into view for them.
  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= filtered.length) return;
    const el = document.getElementById(approveCheckboxId(filtered[activeIndex].productId));
    if (el && document.activeElement !== el) el.focus();
  }, [activeIndex, filtered]);

  if (products.length === 0) {
    return (
      <Page title="Review & Publish" backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}>
        {/* After publishing all drafts we land here with a success actionData —
            still the right moment to ask for a review. */}
        <ReviewRequest ask={actionData?.reviewAsk} />
        <EmptyState
          heading="Nothing to review — you're all caught up"
          image="/empty-review.svg"
          action={{ content: "Go to Products", onAction: () => navigate("/app/products") }}
        >
          <p>Generate content from the Products page, then come back here to review and publish.</p>
        </EmptyState>
      </Page>
    );
  }

  return loadingThisRoute ? (
    <AppSkeleton title="Review & Publish" sections={2} layout="full" />
  ) : (
    <Page
      title="Review & Publish"
      subtitle={`${products.length} product${products.length !== 1 ? "s" : ""} with draft content ready to review`}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        <ReviewRequest ask={actionData?.reviewAsk} />
        <NeedsCheckBanner items={needsCheck} navigate={navigate} />
        <EmbedSetupCard shopDomain={shopDomain} confirmed={embedConfirmed} />
        <Banner tone="info">
          Review each draft, then publish. Published content goes live in your store with AI-search (GEO) FAQ
          schema attached, in the structured format search engines and AI answer engines read and quote from.
        </Banner>

        {actionData?.success && <PublishFailures errors={actionData.errors} />}
        {actionData?.error && (
          <Banner tone="critical">
            <p>{actionData.error}</p>
          </Banner>
        )}

        {/* Action bar */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {approvedCount} of {products.length} approved
                </Text>
                <Button variant="plain" size="slim" onClick={approveAllOnPage}>
                  Approve all on this page
                </Button>
                <Button variant="plain" size="slim" onClick={clearSelection}>
                  Clear selection
                </Button>
              </InlineStack>
              <ButtonGroup>
                <Button
                  tone="critical"
                  onClick={() => setConfirmReject(true)}
                  loading={isSubmitting && navigation.formData?.get("actionType") === "reject"}
                  disabled={isSubmitting || unapprovedIds.length === 0}
                >
                  {`Reject ${unapprovedIds.length} not approved`}
                </Button>
                {/* No disabled primary: with nothing approved there is nothing
                    to publish, so the slot stays empty rather than dangling a
                    button the merchant cannot press. */}
                {approvedCount > 0 && (
                  <Button
                    variant="primary"
                    tone="success"
                    onClick={handlePublish}
                    loading={isSubmitting && navigation.formData?.get("actionType") === "publish"}
                    disabled={isSubmitting}
                  >
                    Publish {approvedCount} approved
                  </Button>
                )}
              </ButtonGroup>
            </InlineStack>

            <TextField
              label="Search products"
              labelHidden
              placeholder="Search products..."
              value={search}
              onChange={setSearch}
              clearButton
              onClearButtonClick={() => setSearch("")}
              autoComplete="off"
            />

            <Text as="p" variant="bodySm" tone="subdued">
              Keyboard: press the right arrow key to step to the next product, Enter to approve it.
            </Text>
          </BlockStack>
        </Card>

        {/* Product cards */}
        <BlockStack gap="400">
          {filtered.map((product, index) => (
            <ProductReviewCard
              key={product.productId}
              product={product}
              isApproved={approved.has(product.productId)}
              onToggle={() => toggleApproved(product.productId)}
              onFocusCard={() => setActiveIndex(index)}
              onEdit={(type, value) => handleEdit(product.productId, type, value)}
              onSaveEdit={(type, value) =>
                handleSaveEdit(product.productId, product.productTitle, type, value)
              }
            />
          ))}
        </BlockStack>

        {/* There is exactly one publish primary, in the action bar above. A
            second identical one at the foot of the list was the same action
            twice, and the merchant had to work out whether it was. */}

        {totalPages > 1 && (
          <Card>
            <InlineStack align="center" gap="400">
              <Button disabled={page <= 1} onClick={() => navigate(`/app/review?page=${page - 1}`)}>
                Previous
              </Button>
              <Text as="p" variant="bodySm" tone="subdued">
                Page {page} of {totalPages}
              </Text>
              <Button disabled={page >= totalPages} onClick={() => navigate(`/app/review?page=${page + 1}`)}>
                Next
              </Button>
            </InlineStack>
          </Card>
        )}
      </BlockStack>
      <Modal
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        title={`Reject ${unapprovedIds.length} draft${unapprovedIds.length === 1 ? "" : "s"}?`}
        primaryAction={{
          content: "Reject them",
          destructive: true,
          onAction: doRejectUnapproved,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setConfirmReject(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Every draft on this page that you have not approved will be marked rejected and will leave this
              queue. Your live storefront is not changed.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              You can generate fresh content for these products at any time.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function ProductReviewCard({ product, isApproved, onToggle, onFocusCard, onEdit, onSaveEdit }) {
  const [expanded, setExpanded] = useState({});
  const toggleExpand = (type) => setExpanded((prev) => ({ ...prev, [type]: !prev[type] }));

  const contentTypes = CONTENT_TYPES.filter((t) => product.content[t]);
  const current = product.current || {};

  return (
    // Phase 2 item 2.5 - this was a div with an inset box-shadow in
    // hard-coded #00A047 / #C9CCCF: status by COLOUR ALONE, which fails
    // anyone who cannot tell those two apart. Polaris Card carries the
    // state as a background token, and the Approve checkbox below states it
    // in words and in its own checked state.
    <Card background={isApproved ? "bg-surface-success" : "bg-surface-secondary"}>
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
                <Text as="h3" variant="headingMd">
                  {product.productTitle}
                </Text>
                {product.qualityScore != null && (
                  // Labelled "Content quality" (distinct from GEO/AI-search and
                  // traditional SEO scores shown elsewhere). Unified colour rule:
                  // >=70 green, 40–69 amber, <40 red — a mid score is "work to do",
                  // not "broken", so it never shows alarming red.
                  <Tooltip content="How complete this draft is, scored out of 100.">
                    <Badge
                      tone={
                        product.qualityScore >= 70
                          ? "success"
                          : product.qualityScore >= 40
                            ? "attention"
                            : "critical"
                      }
                    >
                      {`Content quality: ${product.qualityScore}/100`}
                    </Badge>
                  </Tooltip>
                )}
              </InlineStack>
              <InlineStack gap="200">
                {/* Merchant-facing names. These badges used to print the raw
                    storage keys — "metaTitle", "metaDescription". */}
                {contentTypes.map((t) => (
                  <Badge key={t} tone="info">
                    {CONTENT_LABELS[t] || t}
                  </Badge>
                ))}
              </InlineStack>
            </BlockStack>
          </InlineStack>
          {/* A checkbox, not a primary button. Approval is a choice you tick,
              and a green primary per card competed with the one real primary
              on the page while actually meaning "un-approve". */}
          <Checkbox
            id={approveCheckboxId(product.productId)}
            label="Approve"
            checked={isApproved}
            onChange={onToggle}
            onFocus={onFocusCard}
          />
        </InlineStack>

        <Divider />

        {contentTypes.map((type) => (
          <ContentSection
            key={type}
            type={type}
            content={product.content[type]}
            currentValue={current[type] || ""}
            expanded={!!expanded[type]}
            onToggle={() => toggleExpand(type)}
            onEdit={(value) => onEdit(type, value)}
            onSaveEdit={(value) => onSaveEdit(type, value)}
          />
        ))}
      </BlockStack>
    </Card>
  );
}

// decodeHtmlEntities: stored content (and stripped HTML) can carry entities
// ("Premium Skateboards &amp; Gear") which React renders literally.
function previewText(type, value) {
  const plain = type === "description" ? value.replace(/<[^>]+>/g, "") : value;
  const decoded = decodeHtmlEntities(plain).trim();
  return decoded.length > 200 ? `${decoded.substring(0, 200)}...` : decoded;
}

function ContentSection({ type, content, currentValue, expanded, onToggle, onEdit, onSaveEdit }) {
  const [editedValue, setEditedValue] = useState(content);
  const savedValue = useRef(content);

  const handleChange = useCallback(
    (value) => {
      setEditedValue(value);
      onEdit(value);
    },
    [onEdit],
  );

  // Persist on blur, not on every keystroke: one write when the merchant
  // leaves the field, and only if they actually changed something.
  const handleBlur = useCallback(() => {
    if (editedValue === savedValue.current) return;
    savedValue.current = editedValue;
    onSaveEdit(editedValue);
  }, [editedValue, onSaveEdit]);

  const label = CONTENT_LABELS[type] || type;
  const preview = previewText(type, content);
  const currentPreview = previewText(type, currentValue || "");

  const charLimit = type === "metaTitle" ? 60 : type === "metaDescription" ? 155 : null;
  const charCount = editedValue.length;
  const overLimit = charLimit && charCount > charLimit;

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="p" variant="bodySm" fontWeight="semibold">
          {label}
        </Text>
        <Button variant="plain" size="slim" onClick={onToggle}>
          {expanded ? "Collapse" : "Edit"}
        </Button>
      </InlineStack>

      {/* What is on the product now, beside what would replace it. One column
          at 375px, two from md up. */}
      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
        <BlockStack gap="100">
          <Text as="h4" variant="bodySm" fontWeight="semibold" tone="subdued">
            Current
          </Text>
          {currentPreview ? (
            <Text as="p" variant="bodySm">
              {currentPreview}
            </Text>
          ) : (
            <Text as="p" variant="bodySm" tone="subdued">
              Nothing yet
            </Text>
          )}
        </BlockStack>

        <BlockStack gap="100">
          <Text as="h4" variant="bodySm" fontWeight="semibold" tone="subdued">
            Proposed
          </Text>
          {expanded ? (
            <TextField
              label={`Proposed ${label}`}
              labelHidden
              value={editedValue}
              onChange={handleChange}
              onBlur={handleBlur}
              multiline={type === "description" ? 8 : type === "faq" ? 6 : 2}
              helpText={
                charLimit
                  ? `${charCount}/${charLimit} characters${overLimit ? " — too long" : ""}`
                  : "Edits are saved when you leave the field"
              }
              error={overLimit ? `Shorten to under ${charLimit} characters` : ""}
              autoComplete="off"
            />
          ) : (
            <Text as="p" variant="bodySm">
              {preview}
            </Text>
          )}
        </BlockStack>
      </InlineGrid>
    </BlockStack>
  );
}

// The products that did not publish, named. Kept out of the main render so the
// one publish primary is not buried in a list of failure rows.
function PublishFailures({ errors }) {
  if (!errors?.length) return null;
  return (
    <Banner tone="warning" title="Published with some errors">
      {errors.map((e, i) => (
        <p key={i}>
          Failed: {e.productTitle || "Untitled product"} — {e.error}
        </p>
      ))}
    </Banner>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
