import prisma from "../db.server.js";
import { generateProductContent } from "./ai.server.js";
import logger from "./logger.server.js";
import { captureException } from "./errorMonitoring.server.js";
import { tryConsumeGeneration } from "./plans.server.js";
import { apiVersion as SHOPIFY_API_VERSION } from "../shopify.server.js";
import { getFreshOfflineSession, refreshOfflineToken } from "./offlineToken.server.js";
import { buildFaqSchemaMetafield } from "./seo.server.js";
// Throttle between products to stay within Anthropic's rate limits.
// Configurable via BULK_THROTTLE_MS env var.
// Default 2000ms: safe for claude-sonnet-4-6 with 3 concurrent workers.
// Lower to 1000ms on Pro plan with higher Anthropic rate limits.
const THROTTLE_MS = parseInt(process.env.BULK_THROTTLE_MS || "2000", 10);

// bullJob/token are supplied by the BullMQ worker wrapper so we can heartbeat the
// lock between products; they're null on the inline (no-Redis) fallback path.
export async function processBulkJob(jobId, bullJob = null, token = null) {
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
    let pendingCompleted = 0;
    let pendingFailed = 0;

    // Flush after every product (was every 10) so the progress bar moves smoothly
    // and live, instead of sitting at 0% then jumping. The ~2s inter-product
    // throttle naturally bounds the write rate, so this is cheap.
    const flushCounters = async (force = false) => {
      if (pendingCompleted === 0 && pendingFailed === 0) return;
      void force; // always flush when there's pending progress
      await prisma.generationJob.update({
        where: { id: jobId },
        data: {
          ...(pendingCompleted > 0 ? { completedProducts: { increment: pendingCompleted } } : {}),
          ...(pendingFailed > 0 ? { failedProducts: { increment: pendingFailed } } : {}),
          ...(errorLog.length > 0 ? { errorLog: JSON.stringify(errorLog) } : {}),
        },
      });
      pendingCompleted = 0;
      pendingFailed = 0;
    };

    jobLogger.info({ shop: job.shop, productCount: productIds.length, contentTypes }, "Bulk job started");

    // Start with a freshly-refreshed token; a bulk job can outlive the ~1h token
    // life, so we also refresh proactively per product (below) and on 401.
    const session = await getFreshOfflineSession(job.shop);
    if (!session) throw new Error(`No offline session for shop ${job.shop}`);

    // Keep the in-memory session token valid mid-run. Cheap: only refreshes when
    // within 5 min of expiry. Mutates the session object the fetch/publish helpers use.
    const keepTokenFresh = async () => {
      if (session.expires && session.expires.getTime() - Date.now() < 5 * 60 * 1000 && session.refreshToken) {
        const r = await refreshOfflineToken(job.shop);
        if (r) { session.accessToken = r.accessToken; session.expires = r.expires; }
      }
    };

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
        await keepTokenFresh(); // refresh the offline token before it lapses mid-run
        const product = await fetchShopifyProduct(session, productId);
        if (!product) {
          jobLogger.warn({ shop: job.shop, productId }, "Product not found in Shopify during bulk job");
          if (errorLog.length < MAX_ERROR_LOG_ENTRIES) errorLog.push({ productId, error: "Product not found in Shopify" });
          failedCount++;
          pendingFailed++;
          await flushCounters();
          continue;
        }

        const recentTitles = recentTitlesBase.filter((t) => t !== product.title);
        const productCollectionIds = (product.collections?.edges || []).map((e) => e.node?.id).filter(Boolean);
        const collectionVoice = productCollectionIds
          .map((id) => collectionVoiceMap[id])
          .find((cv) => cv && (cv.brandTone || cv.targetAudience || cv.keywords));

        // ── GENERATE FIRST — no credit consumed yet ──────────────────────
        let generated;
        try {
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
            { recentTitles, collectionVoice }
          );
        } catch (genErr) {
          // Circuit breaker open — pause the entire job for 65s then retry same product
          if (genErr.message?.includes("temporarily unavailable")) {
            jobLogger.warn({ shop: job.shop, jobId }, "Circuit breaker open — pausing bulk job for 65s");
            await new Promise((r) => setTimeout(r, 65_000));
            i--; // retry this product
            continue;
          }
          // Content policy refusal or Anthropic rate limit exhausted — skip without charging
          const isApiRefusal = genErr.isContentPolicy || genErr.isRateLimit || genErr.isAnthropicClientError;
          if (isApiRefusal) {
            jobLogger.warn({ shop: job.shop, productId, err: genErr.message }, "API refused content — skipping without credit charge");
            if (errorLog.length < MAX_ERROR_LOG_ENTRIES)
              errorLog.push({ productId, error: `[NO CHARGE] ${genErr.message}` });
            failedCount++;
            pendingFailed++;
            await flushCounters();
            continue;
          }
          throw genErr; // re-throw unexpected errors to outer catch
        }

        // ── CREDIT CONSUMED ONLY AFTER SUCCESSFUL GENERATION ─────────────
        const gate = await tryConsumeGeneration(job.shop, job.contentTypes, productId);
        if (!gate.allowed) {
          const limitMsg = gate.isContention
            ? "Temporary server contention — will retry on next job run."
            : "Monthly generation limit reached. Upgrade at /app/plans.";
          jobLogger.warn({ shop: job.shop, productId }, limitMsg);
          if (errorLog.length < MAX_ERROR_LOG_ENTRIES) errorLog.push({ productId, error: limitMsg });
          failedCount++;
          pendingFailed++;
          await flushCounters();
          continue;
        }

        // ── SAVE CONTENT ──────────────────────────────────────────────────
        const finalStatus = job.autoPublish ? "published" : "draft";
        const generatedTypes = contentTypes.filter((t) => generated[t]);

        const saveOps = generatedTypes.map((type) => {
          const originalContent =
            type === "description" ? product.descriptionHtml || "" :
            type === "metaTitle" ? product.seo?.title || "" :
            type === "metaDescription" ? product.seo?.description || "" : "";
          return prisma.generatedContent.upsert({
            where: { shop_productId_contentType: { shop: job.shop, productId, contentType: type } },
            update: { generatedContent: generated[type], status: finalStatus, version: { increment: 1 } },
            create: { shop: job.shop, productId, productTitle: product.title, contentType: type, originalContent, generatedContent: generated[type], status: finalStatus },
          });
        });
        await Promise.all(saveOps);

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
          // Write the FAQ JSON-LD metafield so the storefront emits FAQPage schema
          // (the AI-search/GEO promise) for auto-published products too.
          if (generated.faq) {
            await setFaqMetafield(session, productId, generated.faq).catch(() => {});
          }
        }

        completedCount++;
        pendingCompleted++;
        await flushCounters();

        // Heartbeat the BullMQ lock so a long bulk run isn't deemed stalled and
        // re-queued mid-flight. Uses the real worker token; no-op on the inline path.
        if (typeof bullJob?.extendLock === "function" && token) {
          await bullJob.extendLock(token, 5 * 60 * 1000).catch(() => {});
        }

        jobLogger.debug({ shop: job.shop, productId, productTitle: product.title }, "Product content generated");
      } catch (err) {
        jobLogger.error({ shop: job.shop, productId, err }, "Failed to generate content for product");
        captureException(err, { jobId, shop: job.shop, productId });
        if (errorLog.length < MAX_ERROR_LOG_ENTRIES) errorLog.push({ productId, error: err.message });
        failedCount++;
        pendingFailed++;
        await flushCounters();
      }

      // Throttle between products (skip after the last one)
      if (i < productIds.length - 1) {
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }

    await flushCounters(true);

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

const MAX_SHOPIFY_RETRIES = 4;
const SHOPIFY_BACKOFF_BASE_MS = 2_000;

async function fetchShopifyProduct(session, productId, attempt = 0) {
  let res;
  try {
    res = await fetch(
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
  } catch (networkErr) {
    if (attempt < MAX_SHOPIFY_RETRIES) {
      const delay = SHOPIFY_BACKOFF_BASE_MS * Math.pow(2, attempt);
      logger.warn({ productId, attempt, err: networkErr.message }, `Shopify network error — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      return fetchShopifyProduct(session, productId, attempt + 1);
    }
    throw new Error(`Shopify network error after ${MAX_SHOPIFY_RETRIES} retries: ${networkErr.message}`);
  }

  if (res.status === 429) {
    if (attempt < MAX_SHOPIFY_RETRIES) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
      const delay = Math.max(retryAfter * 1000, SHOPIFY_BACKOFF_BASE_MS * Math.pow(2, attempt));
      logger.warn({ productId, attempt, retryAfterMs: delay }, "Shopify 429 on product fetch — backing off");
      await new Promise((r) => setTimeout(r, delay));
      return fetchShopifyProduct(session, productId, attempt + 1);
    }
    throw new Error(`Shopify rate limit exceeded fetching product ${productId} after ${MAX_SHOPIFY_RETRIES} retries`);
  }

  if (res.status === 401 && attempt < MAX_SHOPIFY_RETRIES) {
    // Offline token lapsed mid-run — refresh it and retry with the new token.
    const r = await refreshOfflineToken(session.shop);
    if (r) { session.accessToken = r.accessToken; session.expires = r.expires; }
    logger.warn({ productId, attempt }, "Shopify 401 on product fetch — refreshed token, retrying");
    return fetchShopifyProduct(session, productId, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`Shopify GraphQL error ${res.status} fetching product ${productId}`);
  }

  const { data } = await res.json();

  if (data?.errors?.[0]?.extensions?.code === "THROTTLED") {
    if (attempt < MAX_SHOPIFY_RETRIES) {
      const delay = SHOPIFY_BACKOFF_BASE_MS * Math.pow(2, attempt + 1);
      logger.warn({ productId, attempt }, "Shopify GraphQL throttled — backing off");
      await new Promise((r) => setTimeout(r, delay));
      return fetchShopifyProduct(session, productId, attempt + 1);
    }
    throw new Error("Shopify GraphQL throttle error after max retries");
  }

  return data?.product ?? null;
}

// Write the product's FAQ JSON-LD metafield (contentclaude/faq_schema) so the
// theme app embed emits FAQPage structured data on the storefront. No-op if the
// FAQ produces no usable schema. Caller treats failures as non-fatal.
async function setFaqMetafield(session, productId, faqContent) {
  const metafield = buildFaqSchemaMetafield(productId, faqContent);
  if (!metafield) return;
  const res = await fetch(
    `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query: `mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } }
        }`,
        variables: { metafields: [metafield] },
      }),
    }
  );
  if (!res.ok) throw new Error(`metafieldsSet failed ${res.status}`);
}

async function publishToShopify(session, productId, input, attempt = 0) {
  const MAX_RETRIES = 3;

  let res;
  try {
    res = await fetch(
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
  } catch (networkErr) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, SHOPIFY_BACKOFF_BASE_MS * Math.pow(2, attempt)));
      return publishToShopify(session, productId, input, attempt + 1);
    }
    throw networkErr;
  }

  if (res.status === 401 && attempt < MAX_RETRIES) {
    // Offline token lapsed mid-run — refresh it and retry the publish.
    const r = await refreshOfflineToken(session.shop);
    if (r) { session.accessToken = r.accessToken; session.expires = r.expires; }
    logger.warn({ productId, attempt }, "Shopify 401 on publish — refreshed token, retrying");
    return publishToShopify(session, productId, input, attempt + 1);
  }

  if (res.status === 429) {
    if (attempt < MAX_RETRIES) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
      logger.warn({ productId, attempt }, "Shopify 429 on publish — backing off");
      await new Promise((r) => setTimeout(r, Math.max(retryAfter * 1000, SHOPIFY_BACKOFF_BASE_MS)));
      return publishToShopify(session, productId, input, attempt + 1);
    }
    throw new Error(`Shopify rate limit exceeded publishing product ${productId}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify publish error ${res.status}: ${body}`);
  }

  const { data } = await res.json();

  if (data?.errors?.[0]?.extensions?.code === "THROTTLED") {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, SHOPIFY_BACKOFF_BASE_MS * Math.pow(2, attempt + 1)));
      return publishToShopify(session, productId, input, attempt + 1);
    }
    throw new Error("Shopify GraphQL throttle error during publish");
  }

  const errors = data?.productUpdate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
}
