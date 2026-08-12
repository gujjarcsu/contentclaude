import { useLoaderData, useFetcher, useNavigate, useRevalidator, useNavigation } from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
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
  Banner,
  Checkbox,
  Spinner,
  Divider,
  TextField,
  Select,
  Tabs,
  ProgressBar,
  Collapsible,
  Modal,
} from "@shopify/polaris";
import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { GeoValueBanner } from "../components/GeoValueBanner";
import { ContentBenefits } from "../components/ContentBenefits";
import { ReviewRequest } from "../components/ReviewRequest";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import logger from "../utils/logger.server.js";
import { getOrCreatePlan } from "../utils/plans.server.js";
import { getEntitlements } from "../utils/billing-plans.js";
import { snapshotAndPrune } from "../utils/contentVersion.server.js";
import { readMutationResult } from "../utils/adminGraphql.server.js";
import { normalizeAltTextResults } from "../utils/altText.js";

// How many product images alt-text generation covers in one run. Shopify's
// media connection is paginated; anything beyond this is disclosed in the UI
// rather than silently skipped (requirement 2.1.4 — data accuracy).
const MAX_ALT_TEXT_IMAGES = 50;

// Map a product's media connection to the image list the UI and alt-text
// writes use. Only MediaImage nodes carry an image; ids are MediaImage GIDs.
function mediaToImages(media) {
  return (media?.edges || [])
    .filter((e) => e.node?.mediaContentType === "IMAGE" && e.node?.image?.url)
    .map((e) => ({ id: e.node.id, url: e.node.image.url, altText: e.node.image.altText || "" }));
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request, params }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = `gid://shopify/Product/${params.id}`;

  // media (not the legacy images connection) — alt-text writes need MediaImage
  // GIDs (gid://shopify/MediaImage/...), which productUpdateMedia accepts.
  // Legacy ProductImage IDs are NOT valid for any 2026-04 media mutation.
  const response = await admin.graphql(
    `query getProduct($id: ID!) {
      product(id: $id) {
        id title handle status productType vendor
        description descriptionHtml
        seo { title description }
        featuredImage { url altText }
        media(first: ${MAX_ALT_TEXT_IMAGES}) {
          pageInfo { hasNextPage }
          edges { node { id mediaContentType ... on MediaImage { image { url altText } } } }
        }
        variants(first: 10) { edges { node { title price sku } } }
        tags
      }
    }`,
    { variables: { id: productId } }
  );

  const { data } = await response.json();
  if (!data.product) throw new Response("Product not found", { status: 404 });
  const product = data.product;

  const [existingContent, brandVoice, versions, templates, plan, growthState] = await Promise.all([
    prisma.generatedContent.findMany({ where: { shop, productId }, orderBy: { updatedAt: "desc" } }),
    prisma.brandVoice.findUnique({ where: { shop } }),
    prisma.contentVersion.findMany({
      where: { shop, productId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.contentTemplate.findMany({ where: { shop }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], take: 50 }),
    getOrCreatePlan(shop),
    prisma.growthState.findUnique({ where: { shop }, select: { reviewRequestedAt: true } }),
  ]);

  const { scoreContent } = await import("../utils/contentScorer.server.js");
  const contentMap = existingContent.reduce((acc, c) => { acc[c.contentType] = c; return acc; }, {});
  const qualityScore = scoreContent({
    description: contentMap.description?.generatedContent || "",
    metaTitle: contentMap.metaTitle?.generatedContent || "",
    metaDescription: contentMap.metaDescription?.generatedContent || "",
    faq: contentMap.faq?.generatedContent || "",
  });

  // Group versions by content type, keep last 5 per type
  const versionsByType = {};
  for (const v of versions) {
    if (!versionsByType[v.contentType]) versionsByType[v.contentType] = [];
    if (versionsByType[v.contentType].length < 5) versionsByType[v.contentType].push(v);
  }

  return {
    product: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status || "ACTIVE",
      productType: product.productType,
      vendor: product.vendor,
      description: product.description || "",
      descriptionHtml: product.descriptionHtml || "",
      seoTitle: product.seo?.title || "",
      seoDescription: product.seo?.description || "",
      imageUrl: product.featuredImage?.url || "",
      imageAlt: product.featuredImage?.altText || "",
      images: mediaToImages(product.media),
      hasMoreImages: product.media?.pageInfo?.hasNextPage ?? false,
      variants: product.variants.edges.map((e) => ({
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
        version: item.version,
        id: item.id,
      };
      return acc;
    }, {}),
    hasBrandVoice: !!brandVoice,
    reviewRequested: !!growthState?.reviewRequestedAt,
    qualityScore,
    versionsByType,
    templates,
    planName: plan.planName,
    entitlements: getEntitlements(plan.planName),
    shopDomain: shop,
  };
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request, params }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = `gid://shopify/Product/${params.id}`;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  try {

  // Dynamic imports keep server-only modules out of the client bundle
  const [
    { generateProductContent, generateAltText, enhanceExistingContent },
    { tryConsumeGeneration, checkEntitlement, refundGeneration },
    { checkRateLimit },
    { getCache },
  ] = await Promise.all([
    import("../utils/ai.server.js"),
    import("../utils/plans.server.js"),
    import("../utils/rateLimit.server.js"),
    import("../utils/cache.server.js"),
  ]);

  // ── Enhance Existing ─────────────────────────────────────────────────────
  if (actionType === "enhance") {
    const rl = await checkRateLimit(shop, { maxPerMinute: 10 });
    if (!rl.allowed) {
      return { error: "You're generating too fast. Please wait a moment before trying again." };
    }
    const contentTypes = ["description", "metaTitle", "metaDescription"].filter(
      (t) => formData.get(`gen_${t}`) === "true"
    );
    if (contentTypes.length === 0) return { error: "Select at least one content type to enhance." };

    const gate = await tryConsumeGeneration(shop, contentTypes[0], productId);
    if (!gate.allowed) {
      return { error: "You've reached your monthly generation limit. Upgrade your plan to continue.", limitReached: true };
    }

    const [productResponse, brandVoice] = await Promise.all([
      admin.graphql(
        `query getProduct($id: ID!) {
          product(id: $id) {
            title productType vendor description descriptionHtml
            seo { title description }
            images(first: 4) { edges { node { url } } }
            tags
          }
        }`,
        { variables: { id: productId } }
      ),
      getCache(`bv:${shop}`, () => prisma.brandVoice.findUnique({ where: { shop } }), 300),
    ]);
    const { data: pd } = await productResponse.json();
    const p = pd.product;
    const targetKeywords = (formData.get("targetKeywords") || "").slice(0, 500).trim();

    const generated = await enhanceExistingContent(
      {
        title: p.title,
        productType: p.productType,
        description: p.description,
        descriptionHtml: p.descriptionHtml,
        seoTitle: p.seo?.title || "",
        seoDescription: p.seo?.description || "",
        images: (p.images?.edges || []).map((e) => e.node),
        tags: p.tags,
      },
      brandVoice,
      contentTypes,
      { keywords: targetKeywords }
    );

    const typesToSave = contentTypes.filter((t) => generated[t]);
    const existing = await prisma.generatedContent.findMany({
      where: { shop, productId, contentType: { in: typesToSave } },
    });
    await snapshotAndPrune(shop, productId, existing);
    await Promise.all(
      typesToSave.map((type) =>
        prisma.generatedContent.upsert({
          where: { shop_productId_contentType: { shop, productId, contentType: type } },
          update: { generatedContent: generated[type], status: "draft", version: { increment: 1 } },
          create: { shop, productId, productTitle: p.title, contentType: type, originalContent: "", generatedContent: generated[type], status: "draft" },
        })
      )
    );
    return { success: true, generated, message: "Existing content enhanced — review and publish when ready." };
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  if (actionType === "generate") {
    const rl = await checkRateLimit(shop, { maxPerMinute: 10 });
    if (!rl.allowed) {
      return { error: "You're generating too fast. Please wait a moment before trying again." };
    }

    const contentTypes = ["description", "metaTitle", "metaDescription", "faq"].filter(
      (t) => formData.get(`gen_${t}`) === "true"
    );
    const doAltText = formData.get("gen_altText") === "true";
    const autoPublish = formData.get("autoPublish") === "true";
    const targetKeywords = (formData.get("targetKeywords") || "").slice(0, 500).trim();
    const contentLength = ["short", "standard", "detailed"].includes(formData.get("contentLength"))
      ? formData.get("contentLength")
      : "standard";

    if (contentTypes.length === 0 && !doAltText) {
      return { error: "Select at least one content type to generate." };
    }

    const primaryContentType = contentTypes[0] ?? "altText";
    const gate = await tryConsumeGeneration(shop, primaryContentType, productId);
    if (!gate.allowed) {
      return {
        error: "You've reached your monthly generation limit. Upgrade your plan to continue.",
        limitReached: true,
      };
    }

    const productResponse = await admin.graphql(
      `query getProduct($id: ID!) {
        product(id: $id) {
          title productType vendor description descriptionHtml
          seo { title description }
          featuredImage { url }
          media(first: ${MAX_ALT_TEXT_IMAGES}) {
            pageInfo { hasNextPage }
            edges { node { id mediaContentType ... on MediaImage { image { url altText } } } }
          }
          variants(first: 10) { edges { node { title price } } }
          tags
        }
      }`,
      { variables: { id: productId } }
    );
    const { data: productData } = await productResponse.json();
    const product = productData.product;
    const productImages = mediaToImages(product.media);

    const [brandVoice, recentContent] = await Promise.all([
      getCache(`bv:${shop}`, () => prisma.brandVoice.findUnique({ where: { shop } }), 300),
      prisma.generatedContent.findMany({
        where: { shop, contentType: "description", NOT: { productId } },
        select: { productTitle: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);
    const recentTitles = recentContent.map((r) => r.productTitle).filter(Boolean);

    let generated = {};
    let autoPublishFailed = false;
    if (contentTypes.length > 0) {
      generated = await generateProductContent(
        {
          title: product.title,
          productType: product.productType,
          vendor: product.vendor,
          description: product.description,
          descriptionHtml: product.descriptionHtml,
          imageUrl: product.featuredImage?.url || "",
          images: productImages,
          variants: product.variants.edges.map((e) => e.node),
          tags: product.tags,
        },
        brandVoice,
        contentTypes,
        { keywords: targetKeywords, length: contentLength, recentTitles }
      );

      const finalStatus = autoPublish ? "published" : "draft";
      const typesToSave = contentTypes.filter((t) => generated[t]);

      // Snapshot existing content into version history before overwriting
      const existing = await prisma.generatedContent.findMany({
        where: { shop, productId, contentType: { in: typesToSave } },
      });
      await snapshotAndPrune(shop, productId, existing);

      await Promise.all(
        typesToSave.map((type) => {
          const originalContent =
            type === "description" ? product.descriptionHtml || "" :
            type === "metaTitle" ? product.seo?.title || "" :
            type === "metaDescription" ? product.seo?.description || "" : "";
          return prisma.generatedContent.upsert({
            where: { shop_productId_contentType: { shop, productId, contentType: type } },
            // Never overwrite originalContent on update — it preserves the true
            // Shopify original so merchants can always roll back.
            update: { generatedContent: generated[type], status: finalStatus, version: { increment: 1 } },
            create: { shop, productId, productTitle: product.title, contentType: type, originalContent, generatedContent: generated[type], status: finalStatus },
          });
        })
      );

      // Auto-publish: immediately push to Shopify. The result MUST be read —
      // a failed productUpdate here previously went completely unchecked and
      // the merchant was told "published" regardless.
      if (autoPublish) {
        const input = { id: productId };
        if (generated.description) input.descriptionHtml = generated.description;
        if (generated.metaTitle || generated.metaDescription) {
          input.seo = {};
          if (generated.metaTitle) input.seo.title = generated.metaTitle;
          if (generated.metaDescription) input.seo.description = generated.metaDescription;
        }
        if (Object.keys(input).length > 1) {
          const pubResponse = await admin.graphql(
            `mutation updateProduct($product: ProductUpdateInput!) {
              productUpdate(product: $product) {
                product { id }
                userErrors { field message }
              }
            }`,
            { variables: { product: input } }
          );
          const pub = await readMutationResult(pubResponse, "productUpdate");
          if (!pub.ok) {
            logger.warn({ shop, productId, errors: pub.errorMessages }, "Auto-publish productUpdate failed — keeping content as draft");
            // The rows were saved as "published" above; make the DB honest.
            await prisma.generatedContent.updateMany({
              where: { shop, productId, contentType: { in: typesToSave }, status: "published" },
              data: { status: "draft" },
            });
            autoPublishFailed = true;
          }
        }
      }
    }

    let altTextResults = [];
    if (doAltText) {
      // productImages are MediaImage nodes ({ id: MediaImage GID, url }).
      // 1) Generate alt text per image (AI failures tracked per image).
      // 2) Write ALL successful generations in ONE productUpdateMedia call.
      //    (fileUpdate is Shopify's successor but requires the write_files
      //    scope this app deliberately does not request; productUpdateMedia
      //    is valid in 2026-04 and runs on write_products.)
      const generatedAlts = [];
      for (const img of productImages) {
        try {
          const altText = await generateAltText(img.url, product.title);
          generatedAlts.push({ mediaId: img.id, url: img.url, altText });
        } catch (err) {
          logger.warn({ shop, productId, mediaId: img.id, err: err.message }, "Alt text generation failed for image");
          altTextResults.push({ imageId: img.id, url: img.url, altText: "", error: "Couldn't generate alt text for this image. Please try again." });
        }
      }

      if (generatedAlts.length > 0) {
        let mutation;
        try {
          const mutResponse = await admin.graphql(
            `mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
              productUpdateMedia(productId: $productId, media: $media) {
                media { id alt }
                mediaUserErrors { field message code }
              }
            }`,
            {
              variables: {
                productId,
                media: generatedAlts.map((g) => ({ id: g.mediaId, alt: g.altText })),
              },
            }
          );
          mutation = await readMutationResult(mutResponse, "productUpdateMedia", { userErrorKeys: ["mediaUserErrors"] });
        } catch (err) {
          mutation = { ok: false, userErrors: [], errorMessages: [err.message] };
        }

        if (mutation.ok) {
          altTextResults.push(...generatedAlts.map((g) => ({ imageId: g.mediaId, url: g.url, altText: g.altText })));
        } else {
          logger.error({ shop, productId, errors: mutation.errorMessages }, "productUpdateMedia failed — alt text NOT applied");
          // mediaUserErrors reference items by index in their field path
          // (["media", "0", ...]); map those to the specific image where
          // possible, otherwise the whole batch failed.
          const failedIndexes = new Set(
            mutation.userErrors
              .map((e) => (Array.isArray(e.field) && e.field[0] === "media" ? parseInt(e.field[1], 10) : NaN))
              .filter((n) => !Number.isNaN(n))
          );
          const wholeBatchFailed = failedIndexes.size === 0;
          generatedAlts.forEach((g, idx) => {
            const failed = wholeBatchFailed || failedIndexes.has(idx);
            altTextResults.push(
              failed
                ? { imageId: g.mediaId, url: g.url, altText: g.altText, error: "Shopify couldn't apply this alt text. Please try again." }
                : { imageId: g.mediaId, url: g.url, altText: g.altText }
            );
          });
        }
      }

      if (altTextResults.length > 0) {
        const anyApplied = altTextResults.some((r) => !r.error);
        await prisma.generatedContent.upsert({
          where: { shop_productId_contentType: { shop, productId, contentType: "altText" } },
          update: { generatedContent: JSON.stringify(altTextResults), status: anyApplied ? "published" : "draft", version: { increment: 1 } },
          create: { shop, productId, productTitle: product.title, contentType: "altText", originalContent: "", generatedContent: JSON.stringify(altTextResults), status: anyApplied ? "published" : "draft" },
        });
      }
    }

    const altTextApplied = altTextResults.filter((r) => !r.error).length;
    const altTextFailed = altTextResults.length - altTextApplied;
    const hasMoreImages = product.media?.pageInfo?.hasNextPage ?? false;

    const messageParts = [];
    if (contentTypes.length > 0) {
      if (autoPublish && autoPublishFailed) {
        messageParts.push("Content generated, but publishing to Shopify failed — it's saved as a draft. Please try publishing again.");
      } else {
        messageParts.push(
          autoPublish
            ? "Content generated and published to your store!"
            : "Content generated — review below and publish when ready."
        );
      }
    }
    if (doAltText && altTextResults.length > 0) {
      if (altTextFailed === 0) {
        messageParts.push(`Alt text applied to all ${altTextApplied} image${altTextApplied !== 1 ? "s" : ""}.`);
      } else if (altTextApplied > 0) {
        messageParts.push(`Alt text applied to ${altTextApplied} of ${altTextResults.length} images — ${altTextFailed} failed.`);
      } else {
        messageParts.push("Alt text could not be applied to any image. Please try again.");
      }
      if (hasMoreImages) {
        messageParts.push(`Note: this product has more than ${MAX_ALT_TEXT_IMAGES} images — only the first ${MAX_ALT_TEXT_IMAGES} were processed.`);
      }
    }

    return {
      success: true,
      generated,
      altTextResults,
      altTextApplied,
      altTextFailed,
      altTextTruncated: doAltText && hasMoreImages,
      autoPublished: autoPublish && !autoPublishFailed,
      autoPublishFailed,
      message: messageParts.join(" ") || "Done!",
    };
  }

  // ── Publish (with optional edited content) ────────────────────────────────
  if (actionType === "publish") {
    const description = formData.get("publishDescription");
    const metaTitle = formData.get("publishMetaTitle");
    const metaDescription = formData.get("publishMetaDescription");

    const input = { id: productId };
    if (description) input.descriptionHtml = description;
    if (metaTitle || metaDescription) {
      input.seo = {};
      if (metaTitle) input.seo.title = metaTitle;
      if (metaDescription) input.seo.description = metaDescription;
    }

    const mutationResult = await admin.graphql(
      `mutation updateProduct($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id }
          userErrors { field message }
        }
      }`,
      { variables: { product: input } }
    );

    const mutation = await readMutationResult(mutationResult, "productUpdate");
    if (!mutation.ok) {
      logger.error({ shop, productId, errors: mutation.errorMessages }, "Publish productUpdate failed");
      // userErrors are merchant-fixable (bad values); top-level errors are not —
      // show the specific reason only when it's actionable.
      const msg = mutation.userErrors.length > 0
        ? mutation.errorMessages.join("; ")
        : "Shopify couldn't apply the update. Please try again in a moment.";
      return { error: `Publishing failed — ${msg} Nothing was published.` };
    }

    // Persist edited content + mark as published. The form fields carry
    // whatever the merchant had in the editor (possibly hand-edited).
    const typeContentMap = {
      ...(description ? { description } : {}),
      ...(metaTitle ? { metaTitle } : {}),
      ...(metaDescription ? { metaDescription } : {}),
    };
    const publishedTypes = Object.keys(typeContentMap);
    await Promise.all(
      publishedTypes.map((type) =>
        prisma.generatedContent.updateMany({
          where: { shop, productId, contentType: type, status: "draft" },
          data: { status: "published", generatedContent: typeContentMap[type] },
        })
      )
    );

    // Write FAQ JSON-LD as a metafield so Liquid themes can embed structured data
    let faqWarning = null;
    const faqRecord = await prisma.generatedContent.findUnique({
      where: { shop_productId_contentType: { shop, productId, contentType: "faq" } },
    });
    if (faqRecord?.generatedContent) {
      const { faqToJsonLd, ensureFaqMetafieldDefinition } = await import("../utils/seo.server.js");
      const jsonLd = faqToJsonLd(faqRecord.generatedContent);
      if (jsonLd) {
        // Definition gives the metafield admin visibility + a type guarantee.
        // Non-fatal, cached 24h per shop.
        await ensureFaqMetafieldDefinition(shop, async (q, v) => (await admin.graphql(q, v ? { variables: v } : undefined)).json());
        const faqMutationResult = await admin.graphql(
          `mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              metafields: [{
                ownerId: productId,
                namespace: "contentclaude",
                key: "faq_schema",
                type: "json",
                value: JSON.stringify(jsonLd),
              }],
            },
          }
        );
        // metafieldsSet returns HTTP 200 even when Shopify rejects it — the
        // failure can be in userErrors OR the top-level errors array. Both
        // must fail the write, or the merchant is told everything published
        // when the FAQ schema silently didn't.
        const faqMutation = await readMutationResult(faqMutationResult, "metafieldsSet");
        if (!faqMutation.ok) {
          logger.warn({ shop, productId, errors: faqMutation.errorMessages }, "FAQ metafieldsSet failed on publish");
          faqWarning = faqMutation.errorMessages.join("; ");
        }
      }
    }

    // FAQ schema published while the theme app embed is off never reaches the
    // storefront \u2014 say so instead of implying the outcome already happened.
    let embedNotice = "";
    if (faqRecord?.generatedContent && !faqWarning) {
      const gs = await prisma.growthState.findUnique({ where: { shop }, select: { embedConfirmedAt: true } });
      if (!gs?.embedConfirmedAt) {
        embedNotice = " Note: enable the \"AI-search FAQ schema\" app embed in your theme (see the Dashboard setup card) for the FAQ schema to appear to search engines.";
      }
    }

    return {
      success: true,
      published: true,
      message: faqWarning
        ? `Content published to your Shopify store \u2014 but the FAQ schema failed to publish (${faqWarning}). Everything else went through; try publishing again to retry just the FAQ schema.`
        : `Content published to your Shopify store!${embedNotice}`,
    };
  }

  // ── Generate Social Media Content ────────────────────────────────────────
  if (actionType === "generateSocial") {
    const { generateSocialContent } = await import("../utils/ai.server.js");
    const [productResp, brandVoice, descRecord] = await Promise.all([
      admin.graphql(`query($id:ID!){product(id:$id){title description}}`, { variables: { id: productId } }),
      prisma.brandVoice.findUnique({ where: { shop } }),
      prisma.generatedContent.findUnique({
        where: { shop_productId_contentType: { shop, productId, contentType: "description" } },
      }),
    ]);
    const { data: pd } = await productResp.json();
    const social = await generateSocialContent(
      { title: pd.product?.title || "", description: descRecord?.generatedContent || pd.product?.description || "" },
      brandVoice
    );
    return { success: true, social };
  }

  // ── Restore Version ───────────────────────────────────────────────────────
  if (actionType === "restoreVersion") {
    // Version history & rollback is a Starter+ feature (pricing table row).
    const vhEnt = await checkEntitlement(shop, "versionHistory");
    if (!vhEnt.allowed) {
      return {
        error: `Version history requires the ${vhEnt.requiredPlan ?? "Starter"} plan. Upgrade to unlock this feature.`,
        limitReached: true,
      };
    }
    const versionId = formData.get("versionId");
    // Scope the lookup to this shop + product in the WHERE clause so a guessed
    // versionId can never read another tenant's row (defence in depth).
    const ver = await prisma.contentVersion.findFirst({
      where: { id: versionId, shop, productId },
    });
    if (!ver) {
      return { error: "Version not found." };
    }
    await prisma.generatedContent.upsert({
      where: { shop_productId_contentType: { shop, productId, contentType: ver.contentType } },
      update: { generatedContent: ver.content, status: "draft" },
      create: { shop, productId, productTitle: "", contentType: ver.contentType, generatedContent: ver.content, status: "draft" },
    });
    return { success: true, reverted: true, contentType: ver.contentType, message: `${ver.contentType} restored to version ${ver.version}.` };
  }

  // ── Generate A/B Variants ─────────────────────────────────────────────────
  if (actionType === "generateVariants") {
    // Server-side entitlement gate — A/B is a Growth+ feature
    const ent = await checkEntitlement(shop, "abVariants");
    if (!ent.allowed) {
      return {
        error: `A/B Variants require the ${ent.requiredPlan ?? "Growth"} plan. Upgrade to unlock this feature.`,
        limitReached: true,
      };
    }

    const rl = await checkRateLimit(shop, { maxPerMinute: 10 });
    if (!rl.allowed) {
      return { error: "You're generating too fast. Please wait a moment before trying again." };
    }
    const contentTypes = ["description", "metaTitle", "metaDescription"].filter(
      (t) => formData.get(`gen_${t}`) === "true"
    );
    if (contentTypes.length === 0) {
      return { error: "Select at least one content type to generate variants for." };
    }
    // A/B makes 2 parallel AI calls — consume 2 credits (one per call).
    const gate1 = await tryConsumeGeneration(shop, contentTypes[0], productId);
    if (!gate1.allowed) {
      return { error: "You've reached your monthly generation limit. Upgrade your plan to continue.", limitReached: true };
    }
    const gate2 = await tryConsumeGeneration(shop, contentTypes[0], productId);
    if (!gate2.allowed) {
      // A/B needs 2 credits and only 1 was available — refund the credit gate1
      // consumed so the merchant isn't charged for a generation that won't run.
      await refundGeneration(shop, { productId, contentType: contentTypes[0] });
      return { error: "Only 1 generation remaining — A/B requires 2. Upgrade your plan to continue.", limitReached: true };
    }

    const [productResp, brandVoice] = await Promise.all([
      admin.graphql(
        `query getProduct($id: ID!) {
          product(id: $id) {
            title productType vendor description descriptionHtml
            seo { title description }
            featuredImage { url }
            images(first: 4) { edges { node { url } } }
            variants(first: 10) { edges { node { title price } } }
            tags
          }
        }`,
        { variables: { id: productId } }
      ),
      getCache(`bv:${shop}`, () => prisma.brandVoice.findUnique({ where: { shop } }), 300),
    ]);
    const { data: pd } = await productResp.json();
    const p = pd.product;
    const targetKeywords = (formData.get("targetKeywords") || "").trim();
    const productData = {
      title: p.title, productType: p.productType, vendor: p.vendor,
      description: p.description, descriptionHtml: p.descriptionHtml,
      imageUrl: p.featuredImage?.url || "",
      images: (p.images?.edges || []).map((e) => e.node),
      variants: p.variants.edges.map((e) => e.node),
      tags: p.tags,
    };
    const baseOptions = { keywords: targetKeywords, length: "standard" };

    // Run both variants in parallel — 2 API credits but merchant gets a real choice
    const [variantA, variantB] = await Promise.all([
      generateProductContent(productData, brandVoice, contentTypes, baseOptions),
      generateProductContent(productData, brandVoice, contentTypes, {
        ...baseOptions,
        variantHint: "Write a COMPLETELY DIFFERENT version. Use a different opening hook, different structural approach, and emphasise different product benefits. The tone should remain consistent but the angle and flow should be clearly distinct from option A.",
      }),
    ]);
    return { success: true, variants: [variantA, variantB] };
  }

  // ── Save chosen A/B variant ───────────────────────────────────────────────
  if (actionType === "saveVariant") {
    let variantContent;
    try {
      variantContent = JSON.parse(formData.get("variantContent") || "{}");
    } catch {
      return { error: "Invalid variant data." };
    }
    const typesToSave = Object.keys(variantContent).filter((t) =>
      ["description", "metaTitle", "metaDescription"].includes(t) && variantContent[t]
    );
    if (typesToSave.length === 0) return { error: "No content to save." };

    const existing = await prisma.generatedContent.findMany({
      where: { shop, productId, contentType: { in: typesToSave } },
    });
    await snapshotAndPrune(shop, productId, existing);
    await Promise.all(
      typesToSave.map((type) =>
        prisma.generatedContent.upsert({
          where: { shop_productId_contentType: { shop, productId, contentType: type } },
          update: { generatedContent: variantContent[type], status: "draft", version: { increment: 1 } },
          create: { shop, productId, productTitle: "", contentType: type, originalContent: "", generatedContent: variantContent[type], status: "draft" },
        })
      )
    );
    return { success: true, generated: variantContent, message: "Variant saved as draft — review and publish when ready." };
  }

  // ── Revert ────────────────────────────────────────────────────────────────
  if (actionType === "revert") {
    const contentType = formData.get("contentType");
    const existing = await prisma.generatedContent.findUnique({
      where: { shop_productId_contentType: { shop, productId, contentType } },
    });
    if (!existing?.originalContent) {
      return { error: "No original content saved to revert to." };
    }
    await prisma.generatedContent.update({
      where: { shop_productId_contentType: { shop, productId, contentType } },
      data: { generatedContent: existing.originalContent, status: "draft" },
    });
    return { success: true, reverted: true, contentType, message: `${contentType} reverted to original content.` };
  }

  if (actionType === "saveTemplate") {
    // Content templates are a Starter+ feature (pricing table row) — enforce.
    const tplEnt = await checkEntitlement(shop, "contentTemplates");
    if (!tplEnt.allowed) {
      return {
        error: `Content templates require the ${tplEnt.requiredPlan ?? "Starter"} plan. Upgrade to unlock this feature.`,
        limitReached: true,
      };
    }
    const name = (formData.get("name") || "").slice(0, 100).trim() || `Template ${new Date().toLocaleDateString()}`;
    const contentTypes = (formData.get("contentTypes") || "description").slice(0, 200);
    const tplContentLength = (formData.get("contentLength") || "standard").slice(0, 50);
    const keywords = (formData.get("keywords") || "").slice(0, 500);
    await prisma.contentTemplate.create({
      data: { shop, name, contentTypes, contentLength: tplContentLength, keywords },
    });
    return { success: true, message: "Template saved! Available in Advanced Options." };
  }

  return { error: "Unknown action." };

  } catch (err) {
    if (err instanceof Response) throw err;
    logger.error({ err, shop, actionType }, "Unhandled action error in products.$id");
    return { error: "An unexpected error occurred. Please try again or contact support." };
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

function VersionHistorySection({ versions, restoreFetcher }) {
  const [open, setOpen] = useState(false);
  if (!versions || versions.length === 0) return null;

  return (
    <BlockStack gap="100">
      <Button variant="plain" size="slim" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide" : `History (${versions.length})`}
      </Button>
      {open && (
        <BlockStack gap="200">
          {versions.map((v) => (
            <Box key={v.id} padding="200" background="bg-surface-secondary" borderRadius="200">
              <InlineStack align="space-between" blockAlign="start">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                    v{v.version} · {new Date(v.createdAt).toLocaleDateString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {v.content.replace(/<[^>]+>/g, "").substring(0, 80)}...
                  </Text>
                </BlockStack>
                <restoreFetcher.Form method="post">
                  <input type="hidden" name="actionType" value="restoreVersion" />
                  <input type="hidden" name="versionId" value={v.id} />
                  <Button size="slim" variant="plain"
                    loading={restoreFetcher.state !== "idle" && restoreFetcher.formData?.get("versionId") === v.id}
                    submit>
                    Restore
                  </Button>
                </restoreFetcher.Form>
              </InlineStack>
            </Box>
          ))}
        </BlockStack>
      )}
    </BlockStack>
  );
}

function OriginalContentSection({ original, contentType, revertFetcher }) {
  const [expanded, setExpanded] = useState(false);
  if (!original) return null;
  const isReverting =
    revertFetcher.state !== "idle" && revertFetcher.formData?.get("contentType") === contentType;

  return (
    <BlockStack gap="200">
      <Button variant="plain" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Hide original" : "Show original content"}
      </Button>
      {expanded && (
        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" fontWeight="bold" tone="subdued">ORIGINAL (before AI):</Text>
            {contentType === "description" ? (
              <div dangerouslySetInnerHTML={{ __html: original || "(empty)" }} />
            ) : (
              <Text as="p" variant="bodySm">{original || "(empty)"}</Text>
            )}
            {original && (
              <revertFetcher.Form method="post">
                <input type="hidden" name="actionType" value="revert" />
                <input type="hidden" name="contentType" value={contentType} />
                <Button variant="plain" tone="critical" size="slim" submit loading={isReverting}>
                  Revert to this original
                </Button>
              </revertFetcher.Form>
            )}
          </BlockStack>
        </Box>
      )}
    </BlockStack>
  );
}

export default function ProductGeneratePage() {
  const { product, existingContent, hasBrandVoice, reviewRequested, qualityScore, versionsByType, templates, entitlements, shopDomain } = useLoaderData();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const fetcher = useFetcher();
  const revertFetcher = useFetcher();
  const socialFetcher = useFetcher();
  const variantFetcher = useFetcher();
  const restoreFetcher = useFetcher();
  const prevFetcherData = useRef(null);
  const prevRevertData = useRef(null);

  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;
  // Ask for an App Store review once, right after a publish succeeds (single
  // publish or generate-with-auto-publish).
  const askReview = !reviewRequested && (actionData?.published === true || actionData?.autoPublished === true);
  const isGenerating = isLoading && fetcher.formData?.get("actionType") === "generate";
  const isEnhancing = isLoading && fetcher.formData?.get("actionType") === "enhance";
  const isPublishing = isLoading && fetcher.formData?.get("actionType") === "publish";
  const isGeneratingVariants = variantFetcher.state !== "idle";
  const variants = variantFetcher.data?.variants ?? null;

  // Progressive loading messages during AI generation
  const loadingMessages = [
    "Analysing your product...",
    "Crafting your brand voice...",
    "Writing compelling copy...",
    "Optimising for SEO...",
    "Polishing the final draft...",
  ];
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  useEffect(() => {
    if (!isGenerating && !isEnhancing) { setLoadingMsgIdx(0); return; }
    const interval = setInterval(() => setLoadingMsgIdx((i) => (i + 1) % loadingMessages.length), 3000);
    return () => clearInterval(interval);
  }, [isGenerating, isEnhancing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate panel state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [genDescription, setGenDescription] = useState(true);
  const [genMetaTitle, setGenMetaTitle] = useState(true);
  const [genMetaDescription, setGenMetaDescription] = useState(true);
  const [genFaq, setGenFaq] = useState(false);
  const [genAltText, setGenAltText] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [showAutoPublishConfirm, setShowAutoPublishConfirm] = useState(false);
  const [pendingGenerateTypes, setPendingGenerateTypes] = useState(null);
  const [targetKeywords, setTargetKeywords] = useState("");
  const [contentLength, setContentLength] = useState("standard");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const applyTemplate = useCallback((templateId) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const types = tpl.contentTypes.split(",");
    setGenDescription(types.includes("description"));
    setGenMetaTitle(types.includes("metaTitle"));
    setGenMetaDescription(types.includes("metaDescription"));
    setGenFaq(types.includes("faq"));
    setContentLength(tpl.contentLength || "standard");
    if (tpl.keywords) setTargetKeywords(tpl.keywords);
  }, [templates]);

  // Editable content state — initialized from generated or existing
  const rawDescription = actionData?.generated?.description || existingContent.description?.generated || "";
  const rawMetaTitle = actionData?.generated?.metaTitle || existingContent.metaTitle?.generated || "";
  const rawMetaDescription = actionData?.generated?.metaDescription || existingContent.metaDescription?.generated || "";
  const faq = actionData?.generated?.faq || existingContent.faq?.generated || "";

  const [editedDescription, setEditedDescription] = useState(rawDescription);
  const [editedMetaTitle, setEditedMetaTitle] = useState(rawMetaTitle);
  const [editedMetaDescription, setEditedMetaDescription] = useState(rawMetaDescription);

  // Sync edited state when new content arrives
  useEffect(() => {
    if (rawDescription) setEditedDescription(rawDescription);
  }, [rawDescription]);
  useEffect(() => {
    if (rawMetaTitle) setEditedMetaTitle(rawMetaTitle);
  }, [rawMetaTitle]);
  useEffect(() => {
    if (rawMetaDescription) setEditedMetaDescription(rawMetaDescription);
  }, [rawMetaDescription]);

  const hasGeneratedContent = !!(rawDescription || rawMetaTitle || rawMetaDescription || faq);

  // Track whether the merchant has hand-edited content since it was last generated/saved
  // Include empty-string clears so intentionally clearing a field triggers the unsaved warning
  const hasUnsavedEdits =
    editedDescription !== rawDescription ||
    editedMetaTitle !== rawMetaTitle ||
    editedMetaDescription !== rawMetaDescription;

  useEffect(() => {
    const handler = (e) => {
      if (!hasUnsavedEdits) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedEdits]);

  // Stored rows pass through normalizeAltTextResults: pre-fix rows are
  // success-shaped but never wrote anything (dead mutation era) — they must
  // render as "Not applied", never as the original false-success badge.
  const altTextResults = actionData?.altTextResults ?? (() => {
    const raw = existingContent.altText?.generated;
    try { return normalizeAltTextResults(raw ? JSON.parse(raw) : []); } catch { return []; }
  })();

  // Toast on success
  useEffect(() => {
    if (actionData?.success && actionData !== prevFetcherData.current) {
      prevFetcherData.current = actionData;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show(actionData.message ?? "Done!", { duration: 4000 });
      }
    }
  }, [actionData]);

  // Revalidate after revert
  useEffect(() => {
    if (revertFetcher.data?.reverted && revertFetcher.data !== prevRevertData.current) {
      prevRevertData.current = revertFetcher.data;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        window.shopify.toast.show(revertFetcher.data.message ?? "Reverted.", { duration: 3000 });
      }
      if (revalidator.state === "idle") revalidator.revalidate();
    }
  }, [revertFetcher.data, revalidator]);

  const doGenerate = useCallback((overrideTypes = null) => {
    const fd = new FormData();
    fd.append("actionType", "generate");
    const types = overrideTypes || {
      description: genDescription,
      metaTitle: genMetaTitle,
      metaDescription: genMetaDescription,
      faq: genFaq,
      altText: genAltText,
    };
    fd.append("gen_description", (types.description ?? false).toString());
    fd.append("gen_metaTitle", (types.metaTitle ?? false).toString());
    fd.append("gen_metaDescription", (types.metaDescription ?? false).toString());
    fd.append("gen_faq", (types.faq ?? false).toString());
    fd.append("gen_altText", (types.altText ?? false).toString());
    fd.append("autoPublish", autoPublish.toString());
    fd.append("targetKeywords", targetKeywords);
    fd.append("contentLength", contentLength);
    fetcher.submit(fd, { method: "POST" });
  }, [genDescription, genMetaTitle, genMetaDescription, genFaq, genAltText, autoPublish, targetKeywords, contentLength, fetcher]);

  const handleGenerate = useCallback((overrideTypes = null) => {
    if (autoPublish && !overrideTypes) {
      setPendingGenerateTypes(null);
      setShowAutoPublishConfirm(true);
      return;
    }
    doGenerate(overrideTypes);
  }, [autoPublish, doGenerate]);

  const handleRegenerateSection = useCallback((type) => {
    const types = { description: false, metaTitle: false, metaDescription: false, faq: false, altText: false };
    types[type] = true;
    handleGenerate(types);
  }, [handleGenerate]);

  const handleEnhance = useCallback(() => {
    const fd = new FormData();
    fd.append("actionType", "enhance");
    fd.append("gen_description", genDescription.toString());
    fd.append("gen_metaTitle", genMetaTitle.toString());
    fd.append("gen_metaDescription", genMetaDescription.toString());
    fd.append("targetKeywords", targetKeywords);
    fetcher.submit(fd, { method: "POST" });
  }, [genDescription, genMetaTitle, genMetaDescription, targetKeywords, fetcher]);

  const handleGenerateVariants = useCallback(() => {
    const fd = new FormData();
    fd.append("actionType", "generateVariants");
    fd.append("gen_description", genDescription.toString());
    fd.append("gen_metaTitle", genMetaTitle.toString());
    fd.append("gen_metaDescription", genMetaDescription.toString());
    fd.append("targetKeywords", targetKeywords);
    variantFetcher.submit(fd, { method: "POST" });
  }, [genDescription, genMetaTitle, genMetaDescription, targetKeywords, variantFetcher]);

  const handleSaveVariant = useCallback((variantContent) => {
    const fd = new FormData();
    fd.append("actionType", "saveVariant");
    fd.append("variantContent", JSON.stringify(variantContent));
    fetcher.submit(fd, { method: "POST" });
  }, [fetcher]);

  const handlePublish = useCallback(() => {
    const fd = new FormData();
    fd.append("actionType", "publish");
    if (editedDescription) fd.append("publishDescription", editedDescription);
    if (editedMetaTitle) fd.append("publishMetaTitle", editedMetaTitle);
    if (editedMetaDescription) fd.append("publishMetaDescription", editedMetaDescription);
    fetcher.submit(fd, { method: "POST" });
  }, [editedDescription, editedMetaTitle, editedMetaDescription, fetcher]);

  // Tab state for right column
  const [selectedTab, setSelectedTab] = useState(0);
  const productDetailTabs = [
    { id: "generate", content: "Generate" },
    { id: "content", content: "Content" },
    { id: "history", content: "History" },
    { id: "images", content: "Alt Text" },
  ];

  // Auto-switch to Content tab when generation completes
  const navigation = useNavigation();
  const prevGeneratingRef = useRef(false);

  useEffect(() => {
    if (prevGeneratingRef.current && !isGenerating && !isEnhancing && actionData?.success) {
      setSelectedTab(1);
    }
    prevGeneratingRef.current = isGenerating || isEnhancing;
  }, [isGenerating, isEnhancing, actionData]);

  const noneSelected = !genDescription && !genMetaTitle && !genMetaDescription && !genFaq && !genAltText;
  const noImages = product.images.length === 0;

  // Keyboard shortcut: Cmd/Ctrl+Enter to generate
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isLoading && !noneSelected) {
        e.preventDefault();
        handleGenerate();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isLoading, noneSelected, handleGenerate]);

  const lengthOptions = [
    { label: "Short (~100-150 words) — simple products", value: "short" },
    { label: "Standard (~200-300 words) — default", value: "standard" },
    { label: "Detailed (~400-500 words) — complex/high-value products", value: "detailed" },
  ];


  return navigation.state === "loading" ? (
    <AppSkeleton title="Product" sections={3} layout="full" />
  ) : (
    <Page
      title={product.title}
      backAction={{ content: "Products", onAction: () => navigate("/app/products") }}
    >
      <BlockStack gap="500">
        <ReviewRequest active={askReview} />
        <GeoValueBanner variant="compact" />
        {actionData?.error && (
          <Banner tone="critical" title="Error">
            <p>{actionData.error}</p>
            {actionData.limitReached && (
              <Box paddingBlockStart="200">
                <Button variant="plain" onClick={() => navigate("/app/plans")}>
                  View Plans & Billing →
                </Button>
              </Box>
            )}
          </Banner>
        )}
        {revertFetcher.data?.error && (
          <Banner tone="critical"><p>{revertFetcher.data.error}</p></Banner>
        )}
        {!hasBrandVoice && (
          <Banner tone="warning">
            <p>
              No brand voice configured — content will use a default tone.{" "}
              <Button variant="plain" onClick={() => navigate("/app/settings")}>
                Set up brand voice →
              </Button>
            </p>
          </Banner>
        )}

        <Layout>
          {/* ── Left: product info + controls ─────────────────────────────── */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  {product.imageUrl && (
                    <Thumbnail source={product.imageUrl} alt={product.title} size="large" />
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

              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Generate Content</Text>
                    {qualityScore.score > 0 && (
                      <Badge tone={qualityScore.grade === "Excellent" ? "success" : qualityScore.grade === "Good" ? "info" : qualityScore.grade === "Fair" ? "attention" : "critical"}>
                        {`Content quality: ${qualityScore.grade} · ${qualityScore.score}/100`}
                      </Badge>
                    )}
                  </InlineStack>

                  <Text as="p" variant="bodySm" tone="subdued">Select what to generate:</Text>
                  <Checkbox
                    label="Product Description"
                    checked={genDescription}
                    onChange={setGenDescription}
                    helpText="Answer-first & keyword-rich — so Google ranks it and AI engines can quote it."
                  />
                  <Checkbox
                    label="Meta Title"
                    checked={genMetaTitle}
                    onChange={setGenMetaTitle}
                    helpText="≤60 chars, keyword front-loaded — wins the click in search results."
                  />
                  <Checkbox
                    label="Meta Description"
                    checked={genMetaDescription}
                    onChange={setGenMetaDescription}
                    helpText="≤155 chars — lifts your click-through from search."
                  />
                  <Checkbox
                    label="FAQ Content"
                    checked={genFaq}
                    onChange={setGenFaq}
                    helpText="Adds FAQPage schema — the format ChatGPT, Perplexity & Google AI cite."
                  />
                  <Checkbox
                    label="Image Alt Text"
                    checked={genAltText}
                    onChange={setGenAltText}
                    disabled={noImages}
                    helpText={
                      noImages
                        ? "No images on this product"
                        : `Applied directly to ${product.images.length} image${product.images.length !== 1 ? "s" : ""}${product.hasMoreImages ? " (first 50)" : ""} — one generation covers all of them`
                    }
                  />

                  <Divider />

                  {/* Advanced options — collapsible */}
                  <Button
                    variant="plain"
                    size="slim"
                    icon={advancedOpen ? <ChevronUp aria-hidden="true" size={14} /> : <ChevronDown aria-hidden="true" size={14} />}
                    onClick={() => setAdvancedOpen((v) => !v)}
                  >
                    Advanced Options
                  </Button>
                  <Collapsible open={advancedOpen} id="advanced-options">
                    <BlockStack gap="300">
                      {entitlements?.contentTemplates && templates.length > 0 && (
                        <Select
                          label="Apply Template"
                          options={[{ label: "— No template —", value: "" }, ...templates.map((t) => ({ label: t.name + (t.isDefault ? " (Default)" : ""), value: t.id }))]}
                          value={selectedTemplate}
                          onChange={applyTemplate}
                          helpText="Pre-fills the options below"
                        />
                      )}
                      <Select
                        label="Description Length"
                        options={lengthOptions}
                        value={contentLength}
                        onChange={setContentLength}
                      />
                      <TextField
                        label="Target Keywords (optional)"
                        value={targetKeywords}
                        onChange={setTargetKeywords}
                        placeholder="e.g., organic skincare Australia, Vitamin C"
                        helpText="Overrides global keywords for this product"
                        autoComplete="off"
                      />
                      {entitlements?.contentTemplates && (genDescription || genMetaTitle || genMetaDescription || genFaq) && (
                        <Button
                          variant="plain"
                          size="slim"
                          onClick={() => {
                            const templateFd = new FormData();
                            templateFd.append("actionType", "saveTemplate");
                            templateFd.append("contentTypes", [
                              genDescription && "description",
                              genMetaTitle && "metaTitle",
                              genMetaDescription && "metaDescription",
                              genFaq && "faq",
                            ].filter(Boolean).join(","));
                            templateFd.append("contentLength", contentLength);
                            templateFd.append("keywords", targetKeywords);
                            fetcher.submit(templateFd, { method: "POST" });
                          }}
                        >
                          Save current settings as template →
                        </Button>
                      )}
                    </BlockStack>
                  </Collapsible>

                  <Divider />

                  <Checkbox
                    label="Auto-publish after generation"
                    checked={autoPublish}
                    onChange={setAutoPublish}
                    helpText="Skips the review step — publishes immediately to Shopify"
                  />

                  {/* Animated progress bar during generation */}
                  {(isGenerating || isEnhancing) && (
                    <Box padding="300" background="bg-surface-info" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Spinner size="small" />
                          <Text as="p" variant="bodySm" fontWeight="semibold">
                            {loadingMessages[loadingMsgIdx]}
                          </Text>
                        </InlineStack>
                        <ProgressBar progress={((loadingMsgIdx + 1) / 5) * 85} tone="highlight" size="small" animated />
                        <Text as="p" variant="bodySm" tone="subdued">
                          Takes 10–30 seconds — you can stay on this page
                        </Text>
                      </BlockStack>
                    </Box>
                  )}

                  {actionData?.limitReached && (
                    <UpgradePrompt
                      tone="warning"
                      title="Monthly limit reached"
                      message="Upgrade your plan to keep generating content"
                      onUpgrade={() => navigate("/app/plans")}
                    />
                  )}
                </BlockStack>
              </Card>
              {/* What the generated content actually does for the merchant (GEO/SEO/AI) */}
              <ContentBenefits />
            </BlockStack>
          </Layout.Section>

          {/* ── Right: tabbed content sections ───────────────────────────── */}
          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={productDetailTabs} selected={selectedTab} onSelect={setSelectedTab} fitted />
            </Card>
            <Box paddingBlockStart="400">
            <BlockStack gap="400">

            {/* ── Tab 0: Generate controls ── */}
            {selectedTab === 0 && (
              <>
                {/* Success state after generation */}
                {actionData?.success && !isGenerating && !isEnhancing && (
                  <Box padding="400" background="bg-surface-success" borderRadius="200">
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <CheckCircle2 aria-hidden="true" size={20} color="#00A047" />
                        <Text as="p" variant="headingSm" fontWeight="semibold">
                          {actionData.autoPublished ? "Content published to your store!" : "Content generated — review & publish"}
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">{actionData.message}</Text>
                      {!actionData.autoPublished && (
                        <Button size="slim" onClick={() => setSelectedTab(1)}>
                          Review Generated Content →
                        </Button>
                      )}
                      {(actionData.autoPublished || actionData.published) && product.handle && shopDomain && (
                        <Button
                          variant="plain"
                          size="slim"
                          url={`https://${shopDomain}/products/${product.handle}`}
                          external
                          target="_blank"
                        >
                          Preview in store →
                        </Button>
                      )}
                    </BlockStack>
                  </Box>
                )}

                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      {hasGeneratedContent ? "Regenerate Content" : "Ready to Generate"}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {hasGeneratedContent
                        ? "Your product already has AI content. Generate again to create a fresh version."
                        : "Select your content types in the left panel, then click Generate Content."}
                    </Text>

                    {(isGenerating || isGeneratingVariants || isEnhancing) && (
                      <Box padding="300" background="bg-surface-info" borderRadius="200">
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Spinner size="small" />
                            <Text as="p" variant="bodySm" fontWeight="semibold">
                              {isGeneratingVariants
                                ? "Writing 2 different versions..."
                                : loadingMessages[loadingMsgIdx]}
                            </Text>
                          </InlineStack>
                          <ProgressBar
                            progress={isGeneratingVariants ? 60 : ((loadingMsgIdx + 1) / 5) * 85}
                            tone="highlight"
                            size="small"
                            animated
                          />
                          <Text as="p" variant="bodySm" tone="subdued">
                            {isGeneratingVariants ? "20–40 seconds" : "10–30 seconds"} — you can stay on this page
                          </Text>
                        </BlockStack>
                      </Box>
                    )}

                    <Button
                      variant="primary"
                      size="large"
                      onClick={() => handleGenerate()}
                      loading={isGenerating}
                      disabled={isLoading || noneSelected}
                      fullWidth
                    >
                      {isGenerating ? "Generating..." : "Generate Content ⌘↵"}
                    </Button>
                    {!isGenerating && !isEnhancing && (
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        Tip: Press ⌘↵ (Mac) or Ctrl+↵ (Windows) to generate
                      </Text>
                    )}
                    {(product.descriptionHtml || product.seoTitle) && (
                      <BlockStack gap="100">
                        <Button
                          size="large"
                          onClick={handleEnhance}
                          loading={isEnhancing}
                          disabled={isLoading || isGeneratingVariants || (!genDescription && !genMetaTitle && !genMetaDescription)}
                          fullWidth
                        >
                          {isEnhancing ? "Enhancing..." : "Enhance Existing Content"}
                        </Button>
                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                          Improves what&apos;s already there — structure, SEO keywords, and
                          AI-search readiness — without losing your facts or voice
                        </Text>
                      </BlockStack>
                    )}
                    {entitlements?.abVariants ? (
                      <Button
                        size="large"
                        onClick={handleGenerateVariants}
                        loading={isGeneratingVariants}
                        disabled={isLoading || isGeneratingVariants || noneSelected}
                        fullWidth
                      >
                        {isGeneratingVariants ? "Generating 2 options..." : "Generate 2 Options (A/B)"}
                      </Button>
                    ) : (
                      // NOT disabled — a disabled Polaris button never fires
                      // onClick, which made this upsell a dead control. It
                      // looks locked but genuinely navigates to Plans.
                      <Button
                        size="large"
                        fullWidth
                        onClick={() => navigate("/app/plans")}
                      >
                        🔒 A/B Variants — upgrade to Growth
                      </Button>
                    )}

                    {actionData?.limitReached && (
                      <UpgradePrompt
                        tone="warning"
                        title="Monthly limit reached"
                        message="Upgrade your plan to keep generating content"
                        onUpgrade={() => navigate("/app/plans")}
                      />
                    )}
                  </BlockStack>
                </Card>
              </>
            )}

            {/* ── A/B Variant comparison ── */}
            {selectedTab === 0 && variants && (
              <BlockStack gap="400">
                <Banner tone="info" title="2 Options Generated">
                  Compare both versions and click "Use This One" to save your favourite as a draft.
                </Banner>
                {variants.map((v, idx) => (
                  <Card key={idx}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingMd">Option {idx === 0 ? "A" : "B"}</Text>
                        <Button
                          variant="primary"
                          size="slim"
                          onClick={() => handleSaveVariant(v)}
                          loading={isLoading}
                          disabled={isLoading}
                        >
                          Use This One
                        </Button>
                      </InlineStack>
                      {v.description && (
                        <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                          <span dangerouslySetInnerHTML={{ __html: v.description.substring(0, 600) + (v.description.length > 600 ? "..." : "") }} />
                        </Box>
                      )}
                      {v.metaTitle && (
                        <Text as="p" variant="bodySm"><strong>Meta Title:</strong> {v.metaTitle}</Text>
                      )}
                      {v.metaDescription && (
                        <Text as="p" variant="bodySm"><strong>Meta Desc:</strong> {v.metaDescription}</Text>
                      )}
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            )}

            {/* ── Tab 1: Generated content + publish ── */}
            {selectedTab === 1 && (<>

              <Banner tone="info">
                All content below was generated by AI — review and edit before publishing to your store.
              </Banner>

              {/* Description */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Product Description</Text>
                    {rawDescription && (
                      <Button size="slim" variant="plain" onClick={() => handleRegenerateSection("description")} loading={isGenerating}>
                        Regenerate
                      </Button>
                    )}
                  </InlineStack>

                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" fontWeight="bold" tone="subdued">CURRENT:</Text>
                      {product.descriptionHtml ? (
                        <span dangerouslySetInnerHTML={{ __html: product.descriptionHtml.substring(0, 500) }} />
                      ) : (
                        <Text as="p" tone="critical">No description — this product needs content.</Text>
                      )}
                    </BlockStack>
                  </Box>

                  {isGenerating && (
                    <Box padding="400">
                      <InlineStack align="center" gap="200">
                        <Spinner size="small" />
                        <Text as="p" variant="bodyMd">Generating... this takes 10–20 seconds</Text>
                      </InlineStack>
                    </Box>
                  )}

                  {rawDescription && (
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm" fontWeight="bold" tone="success">AI-GENERATED (editable):</Text>
                        <Badge tone={existingContent.description?.status === "published" ? "success" : "info"}>
                          {existingContent.description?.status === "published" ? "Published" : "Draft"}
                        </Badge>
                      </InlineStack>
                      <TextField
                        label=""
                        labelHidden
                        value={editedDescription}
                        onChange={setEditedDescription}
                        multiline={8}
                        helpText="Edit the HTML directly — changes are saved when you click Publish"
                        autoComplete="off"
                      />
                      {editedDescription && (
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm" tone="subdued">
                            {editedDescription.replace(/<[^>]+>/g, "").trim().split(/\s+/).filter(Boolean).length} words
                            {" · "}
                            {editedDescription.replace(/<[^>]+>/g, "").length} characters
                          </Text>
                          <Button
                            size="slim"
                            variant="plain"
                            onClick={() => {
                              navigator.clipboard.writeText(editedDescription.replace(/<[^>]+>/g, ""));
                              window.shopify?.toast?.show("Copied!", { duration: 1500 });
                            }}
                          >
                            Copy text
                          </Button>
                        </InlineStack>
                      )}
                    </BlockStack>
                  )}

                  {!rawDescription && !isGenerating && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Click "Generate Content" to create an AI-optimised description.
                    </Text>
                  )}

                  {existingContent.description?.original && (
                    <>
                      <Divider />
                      <OriginalContentSection original={existingContent.description.original} contentType="description" revertFetcher={revertFetcher} />
                    </>
                  )}
                  {entitlements?.versionHistory && versionsByType.description?.length > 0 && (
                    <VersionHistorySection versions={versionsByType.description} contentType="description" restoreFetcher={restoreFetcher} />
                  )}
                </BlockStack>
              </Card>

              {/* Meta Title */}
              {(rawMetaTitle || genMetaTitle) && (
                <Card>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">Meta Title</Text>
                      <InlineStack gap="200">
                        {rawMetaTitle && (
                          <Button size="slim" variant="plain" onClick={() => {
                            navigator.clipboard.writeText(editedMetaTitle);
                            window.shopify?.toast?.show("Copied!", { duration: 1500 });
                          }}>
                            Copy
                          </Button>
                        )}
                        {rawMetaTitle && (
                          <Button size="slim" variant="plain" onClick={() => handleRegenerateSection("metaTitle")} loading={isGenerating}>
                            Regenerate
                          </Button>
                        )}
                      </InlineStack>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Current: {product.seoTitle || "(using product title)"}
                    </Text>
                    {rawMetaTitle && (
                      <BlockStack gap="100">
                        <TextField
                          label=""
                          labelHidden
                          value={editedMetaTitle}
                          onChange={setEditedMetaTitle}
                          error={editedMetaTitle.length > 60 ? "Over 60 characters — shorten before publishing" : ""}
                          autoComplete="off"
                        />
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm" tone={editedMetaTitle.length > 60 ? "critical" : "subdued"}>
                            {editedMetaTitle.length}/60 characters
                          </Text>
                        </InlineStack>
                        <ProgressBar
                          progress={Math.min(100, Math.round((editedMetaTitle.length / 60) * 100))}
                          tone={editedMetaTitle.length > 60 ? "critical" : editedMetaTitle.length >= 48 ? "highlight" : "success"}
                          size="small"
                        />
                      </BlockStack>
                    )}
                    {existingContent.metaTitle?.original && (
                      <>
                        <Divider />
                        <OriginalContentSection original={existingContent.metaTitle.original} contentType="metaTitle" revertFetcher={revertFetcher} />
                      </>
                    )}
                    {entitlements?.versionHistory && versionsByType.metaTitle?.length > 0 && (
                      <VersionHistorySection versions={versionsByType.metaTitle} contentType="metaTitle" restoreFetcher={restoreFetcher} />
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* Meta Description */}
              {(rawMetaDescription || genMetaDescription) && (
                <Card>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">Meta Description</Text>
                      <InlineStack gap="200">
                        {rawMetaDescription && (
                          <Button size="slim" variant="plain" onClick={() => {
                            navigator.clipboard.writeText(editedMetaDescription);
                            window.shopify?.toast?.show("Copied!", { duration: 1500 });
                          }}>
                            Copy
                          </Button>
                        )}
                        {rawMetaDescription && (
                          <Button size="slim" variant="plain" onClick={() => handleRegenerateSection("metaDescription")} loading={isGenerating}>
                            Regenerate
                          </Button>
                        )}
                      </InlineStack>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Current: {product.seoDescription || "(none set)"}
                    </Text>
                    {rawMetaDescription && (
                      <BlockStack gap="100">
                        <TextField
                          label=""
                          labelHidden
                          value={editedMetaDescription}
                          onChange={setEditedMetaDescription}
                          multiline={2}
                          error={editedMetaDescription.length > 155 ? "Over 155 characters — shorten before publishing" : ""}
                          autoComplete="off"
                        />
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm" tone={editedMetaDescription.length > 155 ? "critical" : "subdued"}>
                            {editedMetaDescription.length}/155 characters
                          </Text>
                        </InlineStack>
                        <ProgressBar
                          progress={Math.min(100, Math.round((editedMetaDescription.length / 155) * 100))}
                          tone={editedMetaDescription.length > 155 ? "critical" : editedMetaDescription.length >= 124 ? "highlight" : "success"}
                          size="small"
                        />
                      </BlockStack>
                    )}
                    {existingContent.metaDescription?.original && (
                      <>
                        <Divider />
                        <OriginalContentSection original={existingContent.metaDescription.original} contentType="metaDescription" revertFetcher={revertFetcher} />
                      </>
                    )}
                    {entitlements?.versionHistory && versionsByType.metaDescription?.length > 0 && (
                      <VersionHistorySection versions={versionsByType.metaDescription} contentType="metaDescription" restoreFetcher={restoreFetcher} />
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* FAQ */}
              {faq && (
                <Card>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">FAQ Content</Text>
                      <Button size="slim" variant="plain" onClick={() => handleRegenerateSection("faq")} loading={isGenerating}>
                        Regenerate
                      </Button>
                    </InlineStack>
                    <Box padding="200" background="bg-surface-success" borderRadius="200">
                      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{faq}</pre>
                    </Box>
                    {existingContent.faq?.original && (
                      <>
                        <Divider />
                        <OriginalContentSection
                          original={existingContent.faq.original}
                          contentType="faq"
                          revertFetcher={revertFetcher}
                        />
                      </>
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* Image Alt Text — the badge reflects the ACTUAL outcome:
                  all applied / partially applied / failed. Never claim success
                  for an operation that failed. */}
              {(altTextResults.length > 0 || genAltText) && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">Image Alt Text</Text>
                      {altTextResults.length > 0 && (() => {
                        const applied = altTextResults.filter((r) => !r.error).length;
                        if (applied === altTextResults.length) return <Badge tone="success">Applied to Shopify</Badge>;
                        if (applied > 0) return <Badge tone="attention">{`Partially applied — ${applied} of ${altTextResults.length}`}</Badge>;
                        return <Badge tone="critical">Not applied</Badge>;
                      })()}
                    </InlineStack>
                    {actionData?.altTextTruncated && (
                      <Banner tone="info">
                        <p>This product has more images than one run covers — the first {altTextResults.length} were processed. Run again after reviewing to cover the rest, or edit the remaining images in Shopify admin.</p>
                      </Banner>
                    )}
                    {isGenerating && genAltText && (
                      <InlineStack gap="200">
                        <Spinner size="small" />
                        <Text as="p" variant="bodySm" tone="subdued">
                          Generating alt text for {product.images.length} image{product.images.length !== 1 ? "s" : ""}...
                        </Text>
                      </InlineStack>
                    )}
                    {altTextResults.length > 0 && (
                      <BlockStack gap="300">
                        {altTextResults.map((result, i) => (
                          <Box key={result.imageId ?? i} padding="200" background="bg-surface-secondary" borderRadius="200">
                            <InlineStack gap="300" blockAlign="start">
                              <Thumbnail source={result.url} alt="" size="small" />
                              <BlockStack gap="100">
                                {result.error ? (
                                  <Text as="p" variant="bodySm" tone="critical">{result.error}</Text>
                                ) : (
                                  <>
                                    <Text as="p" variant="bodySm" fontWeight="semibold">{result.altText}</Text>
                                    <Text as="p" variant="bodySm" tone="subdued">{result.altText.length} characters</Text>
                                  </>
                                )}
                              </BlockStack>
                            </InlineStack>
                          </Box>
                        ))}
                      </BlockStack>
                    )}
                    {!altTextResults.length && !isGenerating && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        Check "Image Alt Text" and click Generate to create alt text for all images.
                      </Text>
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* Publish button */}
              {hasGeneratedContent && !actionData?.autoPublished && (
                <Card>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Content generated by AI • Review before publishing
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Your edits above will be published — not the original AI output.
                    </Text>
                    <Button
                      variant="primary"
                      size="large"
                      onClick={handlePublish}
                      loading={isPublishing}
                      disabled={isLoading}
                      fullWidth
                    >
                      {isPublishing ? "Publishing..." : "Publish to Store"}
                    </Button>
                  </BlockStack>
                </Card>
              )}

              {/* Social Media Content */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Social Media Content</Text>
                    <Button
                      size="slim"
                      loading={socialFetcher.state !== "idle"}
                      onClick={() => {
                        const fd = new FormData();
                        fd.append("actionType", "generateSocial");
                        socialFetcher.submit(fd, { method: "POST" });
                      }}
                    >
                      Generate
                    </Button>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Ready-to-post captions for Instagram, Facebook, and TikTok.
                  </Text>
                  {socialFetcher.data?.social && (
                    <BlockStack gap="300">
                      {[
                        { key: "instagram", label: "Instagram" },
                        { key: "facebook", label: "Facebook" },
                        { key: "tiktok", label: "TikTok" },
                      ].map(({ key, label }) =>
                        socialFetcher.data.social[key] ? (
                          <Box key={key} padding="300" background="bg-surface-secondary" borderRadius="200">
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
                                <Button
                                  size="slim"
                                  variant="plain"
                                  onClick={() => {
                                    navigator.clipboard.writeText(socialFetcher.data.social[key]);
                                    if (window.shopify?.toast) {
                                      window.shopify.toast.show(`${label} caption copied!`, { duration: 2000 });
                                    }
                                  }}
                                >
                                  Copy
                                </Button>
                              </InlineStack>
                              <Text as="p" variant="bodySm">{socialFetcher.data.social[key]}</Text>
                            </BlockStack>
                          </Box>
                        ) : null
                      )}
                    </BlockStack>
                  )}
                  {socialFetcher.data?.error && (
                    <Text as="p" variant="bodySm" tone="critical">{socialFetcher.data.error}</Text>
                  )}
                </BlockStack>
              </Card>

            </>)}

            {/* ── Tab 2: Version history ── */}
            {selectedTab === 2 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Version History</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Previous versions of your generated content. Click Restore to roll back.
                  </Text>
                  {["description", "metaTitle", "metaDescription", "faq"].map((type) =>
                    versionsByType[type]?.length > 0 ? (
                      <BlockStack key={type} gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                          {type === "description" ? "Description" : type === "metaTitle" ? "Meta Title" : type === "metaDescription" ? "Meta Description" : "FAQ"}
                        </Text>
                        {entitlements?.versionHistory && (
                          <VersionHistorySection versions={versionsByType[type]} contentType={type} restoreFetcher={restoreFetcher} />
                        )}
                      </BlockStack>
                    ) : null
                  )}
                  {Object.values(versionsByType).every((v) => !v?.length) && (
                    <Text as="p" variant="bodySm" tone="subdued">No version history yet. Generate content to start building history.</Text>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* ── Tab 3: Alt text ── */}
            {selectedTab === 3 && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Image Alt Text</Text>
                    {altTextResults.length > 0 && <Badge tone="success">Applied to Shopify</Badge>}
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    AI-generated accessibility descriptions applied directly to your product images.
                  </Text>
                  {product.images.length > 0 && (
                    <Button
                      onClick={() => {
                        setGenAltText(true);
                        handleGenerate({ description: false, metaTitle: false, metaDescription: false, faq: false, altText: true });
                      }}
                      loading={isGenerating && genAltText}
                      disabled={isLoading}
                    >
                      Generate Alt Text for {product.images.length} Image{product.images.length !== 1 ? "s" : ""}
                    </Button>
                  )}
                  {altTextResults.length > 0 && (
                    <BlockStack gap="300">
                      {altTextResults.map((result, i) => (
                        <Box key={result.imageId ?? i} padding="200" background="bg-surface-secondary" borderRadius="200">
                          <InlineStack gap="300" blockAlign="start">
                            <Thumbnail source={result.url} alt="" size="small" />
                            <BlockStack gap="100">
                              {result.error ? (
                                <Text as="p" variant="bodySm" tone="critical">Error: {result.error}</Text>
                              ) : (
                                <>
                                  <Text as="p" variant="bodySm" fontWeight="semibold">{result.altText}</Text>
                                  <Text as="p" variant="bodySm" tone="subdued">{result.altText.length} characters</Text>
                                </>
                              )}
                            </BlockStack>
                          </InlineStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                  {!altTextResults.length && !isGenerating && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Click Generate Alt Text to create accessibility descriptions for all product images.
                    </Text>
                  )}
                </BlockStack>
              </Card>
            )}

            </BlockStack>
            </Box>
          </Layout.Section>
        </Layout>
      </BlockStack>

      <Modal
        open={showAutoPublishConfirm}
        onClose={() => setShowAutoPublishConfirm(false)}
        title="Auto-publish is enabled"
        primaryAction={{
          content: "Generate & Publish Now",
          destructive: true,
          onAction: () => { setShowAutoPublishConfirm(false); doGenerate(pendingGenerateTypes); },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowAutoPublishConfirm(false) }]}
      >
        <Modal.Section>
          <Text as="p" variant="bodyMd">
            This will generate content and immediately publish it to your live Shopify store, skipping the review step. Are you sure?
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
