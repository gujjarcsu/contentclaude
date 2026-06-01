import prisma from "../db.server.js";
import { generateProductContent } from "./ai.server.js";
import logger from "./logger.server.js";
import { captureException } from "./errorMonitoring.server.js";
import { tryConsumeGeneration } from "./plans.server.js";
import { apiVersion as SHOPIFY_API_VERSION } from "../shopify.server.js";
// Throttle between products to stay within Anthropic's rate limits.
// For production scale, replace setTimeout-based queue with BullMQ + Redis.
const THROTTLE_MS = 3500;

export async function processBulkJob(jobId) {
  const jobLogger = logger.child({ jobId });
  let job = null;
  try {
    job = await prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "queued") return;

    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "processing", startedAt: new Date() },
    });

    const productIds = JSON.parse(job.productIds);
    const contentTypes = job.contentTypes.split(",").filter(Boolean);
    const errorLog = [];
    const MAX_ERROR_LOG_ENTRIES = 200;
    let completedCount = 0;
    let failedCount = 0;

    jobLogger.info({ shop: job.shop, productCount: productIds.length, contentTypes }, "Bulk job started");

    const session = await prisma.session.findFirst({
      where: { shop: job.shop, isOnline: false },
    });
    if (!session) throw new Error(`No offline session for shop ${job.shop}`);

    const [brandVoice, recentContent, collectionVoices] = await Promise.all([
      prisma.brandVoice.findUnique({ where: { shop: job.shop } }),
      prisma.generatedContent.findMany({
        where: { shop: job.shop, contentType: "description" },
        select: { productTitle: true },
        orderBy: { updatedAt: "desc" },
        take: 15,
      }),
      prisma.collectionVoice.findMany({ where: { shop: job.shop } }),
    ]);

    if (!brandVoice) {
      jobLogger.warn({ shop: job.shop }, "No brand voice configured — cannot run bulk generation");
      await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorLog: JSON.stringify([{ productId: "all", error: "Brand voice not configured. Go to Settings to set up your brand voice before running a bulk job." }]),
        },
      });
      return;
    }

    // Build a map of collectionId -> voice override for O(1) lookup
    const collectionVoiceMap = {};
    for (const cv of collectionVoices) {
      collectionVoiceMap[cv.collectionId] = cv;
    }
    const recentTitlesBase = recentContent.map((r) => r.productTitle).filter(Boolean);

    for (let i = 0; i < productIds.length; i++) {
      const productId = productIds[i];
      try {
        // Atomically check + consume one generation credit per product.
        // Uses a serializable DB transaction — prevents quota overrun under concurrent jobs.
        const gate = await tryConsumeGeneration(job.shop, job.contentTypes, productId);
        if (!gate.allowed) {
          const limitMsg = `Monthly generation limit reached. Upgrade at /app/plans.`;
          jobLogger.warn({ shop: job.shop, productId }, limitMsg);
          if (errorLog.length < MAX_ERROR_LOG_ENTRIES) errorLog.push({ productId, error: limitMsg });
          failedCount++;
          await prisma.generationJob.update({
            where: { id: jobId },
            data: { failedProducts: { increment: 1 }, errorLog: JSON.stringify(errorLog) },
          });
          continue;
        }

        const product = await fetchShopifyProduct(session, productId);
        if (!product) {
          jobLogger.warn({ shop: job.shop, productId }, "Product not found in Shopify during bulk job");
          if (errorLog.length < MAX_ERROR_LOG_ENTRIES) errorLog.push({ productId, error: "Product not found in Shopify" });
          failedCount++;
          await prisma.generationJob.update({
            where: { id: jobId },
            data: { failedProducts: { increment: 1 }, errorLog: JSON.stringify(errorLog) },
          });
          continue;
        }

        const recentTitles = recentTitlesBase.filter((t) => t !== product.title);

        // Find first matching collection voice override for this product
        const productCollectionIds = (product.collections?.edges || []).map((e) => e.node?.id).filter(Boolean);
        const collectionVoice = productCollectionIds
          .map((id) => collectionVoiceMap[id])
          .find((cv) => cv && (cv.brandTone || cv.targetAudience || cv.keywords));

        const generated = await generateProductContent(
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
          { recentTitles, collectionVoice }
        );

        const finalStatus = job.autoPublish ? "published" : "draft";
        const generatedTypes = contentTypes.filter((t) => generated[t]);

        const saveOps = generatedTypes.map((type) => {
          const originalContent =
            type === "description" ? product.descriptionHtml || "" :
            type === "metaTitle" ? product.seo?.title || "" :
            type === "metaDescription" ? product.seo?.description || "" : "";

          return prisma.generatedContent.upsert({
            where: { shop_productId_contentType: { shop: job.shop, productId, contentType: type } },
            update: {
              generatedContent: generated[type],
              // Never overwrite originalContent on re-generation — preserve the true
              // Shopify original so merchants can always roll back to it.
              status: finalStatus,
              version: { increment: 1 },
            },
            create: {
              shop: job.shop,
              productId,
              productTitle: product.title,
              contentType: type,
              originalContent,
              generatedContent: generated[type],
              status: finalStatus,
            },
          });
        });

        // tryConsumeGeneration already wrote the UsageRecord atomically.
        // Only save content; no duplicate usage record needed.
        await Promise.all(saveOps);

        // Auto-publish: push content directly to Shopify
        if (job.autoPublish && generatedTypes.length > 0) {
          const input = { id: productId };
          if (generated.description) input.descriptionHtml = generated.description;
          if (generated.metaTitle || generated.metaDescription) {
            input.seo = {};
            if (generated.metaTitle) input.seo.title = generated.metaTitle;
            if (generated.metaDescription) input.seo.description = generated.metaDescription;
          }
          if (Object.keys(input).length > 1) {
            await publishToShopify(session, productId, input);
          }
        }

        completedCount++;
        await prisma.generationJob.update({
          where: { id: jobId },
          data: { completedProducts: { increment: 1 } },
        });
        jobLogger.debug({ shop: job.shop, productId, productTitle: product.title }, "Product content generated");
      } catch (err) {
        jobLogger.error({ shop: job.shop, productId, err }, "Failed to generate content for product");
        captureException(err, { jobId, shop: job.shop, productId });
        if (errorLog.length < MAX_ERROR_LOG_ENTRIES) errorLog.push({ productId, error: err.message });
        failedCount++;
        await prisma.generationJob.update({
          where: { id: jobId },
          data: { failedProducts: { increment: 1 }, errorLog: JSON.stringify(errorLog) },
        });
      }

      // Throttle between products (skip after the last one)
      if (i < productIds.length - 1) {
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }

    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "complete", completedAt: new Date() },
    });
    jobLogger.info(
      { shop: job.shop, completedProducts: completedCount, failedProducts: failedCount },
      "Bulk job complete"
    );
  } catch (err) {
    jobLogger.error({ err, shop: job?.shop }, "Bulk job failed with unhandled error");
    captureException(err, { jobId, shop: job?.shop });
    if (job) {
      await prisma.generationJob
        .update({
          where: { id: jobId },
          data: { status: "failed", completedAt: new Date() },
        })
        .catch(() => {});
    }
  }
}

async function publishToShopify(session, productId, input) {
  const res = await fetch(
    `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query: `mutation updateProduct($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id }
            userErrors { field message }
          }
        }`,
        variables: { input },
      }),
    }
  );
  const { data } = await res.json();
  const errors = data?.productUpdate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
}

async function fetchShopifyProduct(session, productId) {
  const res = await fetch(
    `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query: `query getProduct($id: ID!) {
          product(id: $id) {
            id title productType vendor description descriptionHtml
            seo { title description }
            featuredImage { url }
            images(first: 4) { edges { node { url } } }
            variants(first: 10) { edges { node { title price } } }
            tags
            collections(first: 5) { edges { node { id } } }
          }
        }`,
        variables: { id: productId },
      }),
    }
  );
  const { data } = await res.json();
  return data?.product ?? null;
}
