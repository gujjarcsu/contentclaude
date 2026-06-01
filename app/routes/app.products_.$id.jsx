import { useLoaderData, useFetcher, useNavigate, useRevalidator } from "react-router";
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
} from "@shopify/polaris";
import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import logger from "../utils/logger.server.js";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request, params }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = `gid://shopify/Product/${params.id}`;

  const response = await admin.graphql(
    `query getProduct($id: ID!) {
      product(id: $id) {
        id title handle status productType vendor
        description descriptionHtml
        seo { title description }
        featuredImage { url altText }
        images(first: 10) { edges { node { id url altText } } }
        variants(first: 10) { edges { node { title price sku } } }
        tags
      }
    }`,
    { variables: { id: productId } }
  );

  const { data } = await response.json();
  if (!data.product) throw new Response("Product not found", { status: 404 });
  const product = data.product;

  const [existingContent, brandVoice, versions, templates] = await Promise.all([
    prisma.generatedContent.findMany({ where: { shop, productId }, orderBy: { updatedAt: "desc" } }),
    prisma.brandVoice.findUnique({ where: { shop } }),
    prisma.contentVersion.findMany({
      where: { shop, productId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.contentTemplate.findMany({ where: { shop }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
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
      images: product.images.edges.map((e) => ({
        id: e.node.id,
        url: e.node.url,
        altText: e.node.altText || "",
      })),
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
    qualityScore,
    versionsByType,
    templates,
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
    { tryConsumeGeneration },
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
    if (existing.length > 0) {
      await prisma.contentVersion.createMany({
        data: existing.map((c) => ({ shop, productId, contentType: c.contentType, content: c.generatedContent, version: c.version })),
      });
    }
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
          images(first: 10) { edges { node { id url } } }
          variants(first: 10) { edges { node { title price } } }
          tags
        }
      }`,
      { variables: { id: productId } }
    );
    const { data: productData } = await productResponse.json();
    const product = productData.product;

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
    if (contentTypes.length > 0) {
      generated = await generateProductContent(
        {
          title: product.title,
          productType: product.productType,
          vendor: product.vendor,
          description: product.description,
          descriptionHtml: product.descriptionHtml,
          imageUrl: product.featuredImage?.url || "",
          images: (product.images?.edges || []).map((e) => e.node),
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
      if (existing.length > 0) {
        await prisma.contentVersion.createMany({
          data: existing.map((c) => ({
            shop, productId, contentType: c.contentType,
            content: c.generatedContent, version: c.version,
          })),
        });
      }

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

      // Auto-publish: immediately push to Shopify
      if (autoPublish) {
        const input = { id: productId };
        if (generated.description) input.descriptionHtml = generated.description;
        if (generated.metaTitle || generated.metaDescription) {
          input.seo = {};
          if (generated.metaTitle) input.seo.title = generated.metaTitle;
          if (generated.metaDescription) input.seo.description = generated.metaDescription;
        }
        if (Object.keys(input).length > 1) {
          await admin.graphql(
            `mutation updateProduct($input: ProductInput!) {
              productUpdate(input: $input) {
                product { id }
                userErrors { field message }
              }
            }`,
            { variables: { input } }
          );
        }
      }
    }

    let altTextResults = [];
    if (doAltText) {
      const images = product.images.edges.map((e) => e.node).filter((img) => img.url);
      if (images.length > 0) {
        for (const img of images) {
          try {
            const altText = await generateAltText(img.url, product.title);
            const mutResult = await admin.graphql(
              `mutation productImageUpdate($productId: ID!, $image: ImageInput!) {
                productImageUpdate(productId: $productId, image: $image) {
                  image { id altText }
                  userErrors { field message }
                }
              }`,
              { variables: { productId, image: { id: img.id, altText } } }
            );
            const { data: mutData } = await mutResult.json();
            const errors = mutData?.productImageUpdate?.userErrors ?? [];
            if (errors.length > 0) {
              altTextResults.push({ imageId: img.id, url: img.url, altText, error: errors[0].message });
            } else {
              altTextResults.push({ imageId: img.id, url: img.url, altText });
            }
          } catch (err) {
            altTextResults.push({ imageId: img.id, url: img.url, altText: "", error: err.message });
          }
        }

        await prisma.generatedContent.upsert({
          where: { shop_productId_contentType: { shop, productId, contentType: "altText" } },
          update: { generatedContent: JSON.stringify(altTextResults), status: "published", version: { increment: 1 } },
          create: { shop, productId, productTitle: product.title, contentType: "altText", originalContent: "", generatedContent: JSON.stringify(altTextResults), status: "published" },
        });
      }
    }

    const messageParts = [];
    if (contentTypes.length > 0) {
      messageParts.push(
        autoPublish
          ? "Content generated and published to your store!"
          : "Content generated — review below and publish when ready."
      );
    }
    if (doAltText && altTextResults.length > 0) {
      const succeeded = altTextResults.filter((r) => !r.error).length;
      messageParts.push(`Alt text applied to ${succeeded} image${succeeded !== 1 ? "s" : ""}.`);
    }

    return { success: true, generated, altTextResults, autoPublished: autoPublish, message: messageParts.join(" ") || "Done!" };
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
      `mutation updateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id }
          userErrors { field message }
        }
      }`,
      { variables: { input } }
    );

    const { data: mutationData } = await mutationResult.json();
    const userErrors = mutationData?.productUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      const msg = userErrors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join("; ");
      return { error: `Shopify rejected the update — ${msg}. Nothing was published.` };
    }

    const publishedTypes = [];
    if (description) publishedTypes.push("description");
    if (metaTitle) publishedTypes.push("metaTitle");
    if (metaDescription) publishedTypes.push("metaDescription");
    if (publishedTypes.length > 0) {
      await prisma.generatedContent.updateMany({
        where: { shop, productId, contentType: { in: publishedTypes }, status: "draft" },
        data: { status: "published" },
      });
    }

    // Write FAQ JSON-LD as a metafield so Liquid themes can embed structured data
    const faqRecord = await prisma.generatedContent.findUnique({
      where: { shop_productId_contentType: { shop, productId, contentType: "faq" } },
    });
    if (faqRecord?.generatedContent) {
      const { faqToJsonLd } = await import("../utils/seo.server.js");
      const jsonLd = faqToJsonLd(faqRecord.generatedContent);
      if (jsonLd) {
        await admin.graphql(
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
      }
    }

    return { success: true, published: true, message: "Content published to your Shopify store!" };
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
    const versionId = formData.get("versionId");
    const ver = await prisma.contentVersion.findUnique({ where: { id: versionId } });
    if (!ver || ver.shop !== shop || ver.productId !== productId) {
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
    const gate = await tryConsumeGeneration(shop, contentTypes[0], productId);
    if (!gate.allowed) {
      return { error: "You've reached your monthly generation limit. Upgrade your plan to continue.", limitReached: true };
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
    if (existing.length > 0) {
      await prisma.contentVersion.createMany({
        data: existing.map((c) => ({ shop, productId, contentType: c.contentType, content: c.generatedContent, version: c.version })),
      });
    }
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

  return { error: "Unknown action." };

  } catch (err) {
    if (err instanceof Response) throw err;
    logger.error({ err, shop, actionType }, "Unhandled action error in products.$id");
    return { error: "An unexpected error occurred. Please try again or contact support." };
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

function VersionHistorySection({ versions, contentType, restoreFetcher }) {
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
  const { product, existingContent, hasBrandVoice, qualityScore, versionsByType, templates } = useLoaderData();
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
  const hasUnsavedEdits =
    (editedDescription !== rawDescription && editedDescription !== "") ||
    (editedMetaTitle !== rawMetaTitle && editedMetaTitle !== "") ||
    (editedMetaDescription !== rawMetaDescription && editedMetaDescription !== "");

  useEffect(() => {
    const handler = (e) => {
      if (!hasUnsavedEdits) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedEdits]);

  const altTextResults = actionData?.altTextResults ?? (() => {
    const raw = existingContent.altText?.generated;
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
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

  const handleGenerate = useCallback((overrideTypes = null) => {
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

  return (
    <Page
      title={product.title}
      backAction={{ content: "Products", onAction: () => navigate("/app/products") }}
    >
      <BlockStack gap="500">
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
                        {qualityScore.grade} · {qualityScore.score}/100
                      </Badge>
                    )}
                  </InlineStack>

                  <Text as="p" variant="bodySm" tone="subdued">Select what to generate:</Text>
                  <Checkbox
                    label="Product Description"
                    checked={genDescription}
                    onChange={setGenDescription}
                    helpText="Full description with SEO optimisation"
                  />
                  <Checkbox
                    label="Meta Title"
                    checked={genMetaTitle}
                    onChange={setGenMetaTitle}
                    helpText="SEO title tag (max 60 characters)"
                  />
                  <Checkbox
                    label="Meta Description"
                    checked={genMetaDescription}
                    onChange={setGenMetaDescription}
                    helpText="SEO meta description (max 155 characters)"
                  />
                  <Checkbox
                    label="FAQ Content"
                    checked={genFaq}
                    onChange={setGenFaq}
                    helpText="4–5 questions and answers"
                  />
                  <Checkbox
                    label="Image Alt Text"
                    checked={genAltText}
                    onChange={setGenAltText}
                    disabled={noImages}
                    helpText={
                      noImages
                        ? "No images on this product"
                        : `Applied directly to ${product.images.length} image${product.images.length !== 1 ? "s" : ""}`
                    }
                  />

                  <Divider />

                  {/* Advanced options — collapsible */}
                  <Button
                    variant="plain"
                    size="slim"
                    icon={advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    onClick={() => setAdvancedOpen((v) => !v)}
                  >
                    Advanced Options
                  </Button>
                  <Collapsible open={advancedOpen} id="advanced-options">
                    <BlockStack gap="300">
                      {templates.length > 0 && (
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
                        placeholder="e.g., peptides Australia, BPC-157"
                        helpText="Overrides global keywords for this product"
                        autoComplete="off"
                      />
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

                  <Button
                    variant="primary"
                    size="large"
                    onClick={() => handleGenerate()}
                    loading={isGenerating}
                    disabled={isLoading || noneSelected}
                    fullWidth
                  >
                    {isGenerating ? "Generating..." : "Generate Content âŒ˜↵"}
                  </Button>

                  {(product.descriptionHtml || product.seoTitle) && (
                    <Button
                      size="large"
                      onClick={handleEnhance}
                      loading={isEnhancing}
                      disabled={isLoading || (!genDescription && !genMetaTitle && !genMetaDescription)}
                      fullWidth
                    >
                      {isEnhancing ? "Enhancing..." : "Enhance Existing Content"}
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
                        <CheckCircle2 size={20} color="#00A047" />
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
                      {isGenerating ? "Generating..." : "Generate Content âŒ˜↵"}
                    </Button>
                    {(product.descriptionHtml || product.seoTitle) && (
                      <Button
                        size="large"
                        onClick={handleEnhance}
                        loading={isEnhancing}
                        disabled={isLoading || isGeneratingVariants || (!genDescription && !genMetaTitle && !genMetaDescription)}
                        fullWidth
                      >
                        {isEnhancing ? "Enhancing..." : "Enhance Existing Content"}
                      </Button>
                    )}
                    <Button
                      size="large"
                      onClick={handleGenerateVariants}
                      loading={isGeneratingVariants}
                      disabled={isLoading || isGeneratingVariants || noneSelected}
                      fullWidth
                    >
                      {isGeneratingVariants ? "Generating 2 options..." : "Generate 2 Options (A/B)"}
                    </Button>

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
                  {versionsByType.description?.length > 0 && (
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
                      {rawMetaTitle && (
                        <Button size="slim" variant="plain" onClick={() => handleRegenerateSection("metaTitle")} loading={isGenerating}>
                          Regenerate
                        </Button>
                      )}
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
                          helpText={`${editedMetaTitle.length}/60 characters`}
                          error={editedMetaTitle.length > 60 ? "Over 60 characters — shorten before publishing" : ""}
                          autoComplete="off"
                        />
                      </BlockStack>
                    )}
                    {existingContent.metaTitle?.original && (
                      <>
                        <Divider />
                        <OriginalContentSection original={existingContent.metaTitle.original} contentType="metaTitle" revertFetcher={revertFetcher} />
                      </>
                    )}
                    {versionsByType.metaTitle?.length > 0 && (
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
                      {rawMetaDescription && (
                        <Button size="slim" variant="plain" onClick={() => handleRegenerateSection("metaDescription")} loading={isGenerating}>
                          Regenerate
                        </Button>
                      )}
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Current: {product.seoDescription || "(none set)"}
                    </Text>
                    {rawMetaDescription && (
                      <TextField
                        label=""
                        labelHidden
                        value={editedMetaDescription}
                        onChange={setEditedMetaDescription}
                        multiline={2}
                        helpText={`${editedMetaDescription.length}/155 characters`}
                        error={editedMetaDescription.length > 155 ? "Over 155 characters — shorten before publishing" : ""}
                        autoComplete="off"
                      />
                    )}
                    {existingContent.metaDescription?.original && (
                      <>
                        <Divider />
                        <OriginalContentSection original={existingContent.metaDescription.original} contentType="metaDescription" revertFetcher={revertFetcher} />
                      </>
                    )}
                    {versionsByType.metaDescription?.length > 0 && (
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

              {/* Image Alt Text */}
              {(altTextResults.length > 0 || genAltText) && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">Image Alt Text</Text>
                      <Badge tone="success">Applied to Shopify</Badge>
                    </InlineStack>
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
                        <VersionHistorySection versions={versionsByType[type]} contentType={type} restoreFetcher={restoreFetcher} />
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
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
