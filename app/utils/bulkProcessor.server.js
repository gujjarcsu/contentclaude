import prisma from "../db.server.js";
import { generateProductContent, enhanceExistingContent } from "./ai.server.js";
import logger from "./logger.server.js";
import { captureException } from "./errorMonitoring.server.js";
import { tryConsumeGeneration, remainingGenerations } from "./plans.server.js";
import { publishProductWithRetry } from "./adminGraphql.server.js";
import { apiVersion as SHOPIFY_API_VERSION } from "../shopify.server.js";
import { getFreshOfflineSession, refreshOfflineToken } from "./offlineToken.server.js";
import { buildFaqSchemaMetafield, ensureFaqMetafieldDefinition } from "./seo.server.js";
import { gateContent, fingerprintFor } from "./qualityGate.server.js";
import { scoreContent } from "./contentScorer.server.js";
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
    if (!job) return;

    // ── Phase 0 item 12: a deploy or crash mid-job must not strand it ────────
    // This used to `return` unless status === "queued", which made BullMQ's
    // stall retry a no-op: the row was already "processing" from the killed
    // attempt, so the retry did nothing and the job sat at "Processing…"
    // forever — while still counting against the per-shop in-flight cap, so the
    // merchant then got "You already have jobs running" and could not start a
    // new one either. A RETRY (attemptsMade > 0) may now pick up a row that is
    // already processing.
    const isRetry = (bullJob?.attemptsMade ?? 0) > 0;
    if (job.status !== "queued" && !(isRetry && job.status === "processing")) return;

    const resuming = job.status === "processing";
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "processing",
        // Keep the ORIGINAL start time on a resume: it is the boundary for
        // "what has this run already written", used just below and by the
        // merchant-facing resume on the Jobs page.
        ...(resuming && job.startedAt ? {} : { startedAt: new Date() }),
      },
    });

    // On a resume, skip whatever the killed attempt already produced, so no
    // product is generated (or charged) twice.
    let alreadyDone = new Set();
    if (resuming) {
      const since = job.startedAt ?? job.createdAt;
      const rows = await prisma.generatedContent.findMany({
        where: { shop: job.shop, updatedAt: { gte: since } },
        select: { productId: true },
        distinct: ["productId"],
      });
      alreadyDone = new Set(rows.map((r) => r.productId));
      jobLogger.warn(
        { shop: job.shop, attempt: (bullJob?.attemptsMade ?? 0) + 1, alreadyDone: alreadyDone.size },
        "Resuming an interrupted job — products already written will be skipped",
      );
    }

    const productIds = JSON.parse(job.productIds);
    const contentTypes = job.contentTypes.split(",").filter(Boolean);
    // "enhance" improves the product's existing live content (preserving structure
    // and facts) instead of generating from scratch. Older jobs have no mode
    // column value beyond the default, so anything but "enhance" means generate.
    const isEnhance = job.mode === "enhance";
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
        if (r) {
          session.accessToken = r.accessToken;
          session.expires = r.expires;
        }
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
          errorLog: JSON.stringify([
            {
              productId: "all",
              error:
                "Brand voice not configured. Go to Settings to set up your brand voice before running a bulk job.",
            },
          ]),
        },
      });
      return;
    }

    // Auto-publish jobs write FAQ metafields — make sure the definition exists
    // once per job (idempotent, cached, non-fatal on failure).
    if (job.autoPublish) {
      await ensureFaqMetafieldDefinition(job.shop, async (query, variables) => {
        const res = await fetch(`https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
          body: JSON.stringify({ query, variables }),
        });
        return res.json();
      });
    }

    // Build a map of collectionId -> voice override for O(1) lookup
    const collectionVoiceMap = {};
    for (const cv of collectionVoices) {
      collectionVoiceMap[cv.collectionId] = cv;
    }
    const recentTitlesBase = recentContent.map((r) => r.productTitle).filter(Boolean);

    for (let i = 0; i < productIds.length; i++) {
      const productId = productIds[i];

      // Written by the attempt this run is resuming — already paid for.
      if (alreadyDone.has(productId)) {
        completedCount++;
        pendingCompleted++;
        await flushCounters();
        continue;
      }

      // Honour cancellation: "Cancel job" flips the row out of "processing".
      // Without this re-check the loop kept generating (and consuming credits)
      // to the end and then overwrote the cancelled status with "complete".
      const currentJob = await prisma.generationJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      if (currentJob?.status !== "processing") {
        await flushCounters(true);
        jobLogger.info(
          { shop: job.shop, status: currentJob?.status, processed: completedCount + failedCount },
          "Bulk job no longer processing (cancelled or superseded) — aborting loop",
        );
        return; // never touch the status the merchant set
      }

      // ── Phase 0 item 4: never call the model without a credit to pay for it ──
      // The job is already sliced to the quota at creation, but a month can also
      // run out mid-run (a second job, an interactive generation, a downgrade).
      // This is a cheap COUNT, not a consume, and it happens BEFORE the
      // expensive call — previously the model ran first and the job then logged
      // "limit reached" once per remaining product, for thousands of products.
      const creditsLeft = await remainingGenerations(job.shop);
      if (creditsLeft <= 0) {
        const notRun = productIds.length - i;
        await flushCounters(true);
        await prisma.generationJob.update({
          where: { id: jobId },
          data: { quotaSkipped: { increment: notRun } },
        });
        jobLogger.info(
          { shop: job.shop, skipped: notRun, event: "bulk_quota_exhausted" },
          "Monthly quota reached — remaining products recorded as skipped, job finishing",
        );
        break;
      }

      try {
        await keepTokenFresh(); // refresh the offline token before it lapses mid-run
        const product = await fetchShopifyProduct(session, productId);
        if (!product) {
          jobLogger.warn({ shop: job.shop, productId }, "Product not found in Shopify during bulk job");
          if (errorLog.length < MAX_ERROR_LOG_ENTRIES)
            errorLog.push({ productId, error: "Product not found in Shopify" });
          failedCount++;
          pendingFailed++;
          await flushCounters();
          continue;
        }

        const recentTitles = recentTitlesBase.filter((t) => t !== product.title);
        const productCollectionIds = (product.collections?.edges || [])
          .map((e) => e.node?.id)
          .filter(Boolean);
        const collectionVoice = productCollectionIds
          .map((id) => collectionVoiceMap[id])
          .find((cv) => cv && (cv.brandTone || cv.targetAudience || cv.keywords));

        // In enhance mode a product with no live description has nothing to
        // enhance for the "description" type. Drop it from this product's type
        // list; if nothing remains, skip WITHOUT consuming a credit (generation
        // never runs, so the merchant must not be charged).
        let effectiveTypes = contentTypes;
        if (isEnhance && !(product.descriptionHtml || product.description)) {
          effectiveTypes = contentTypes.filter((t) => t !== "description");
          if (effectiveTypes.length === 0) {
            jobLogger.warn(
              { shop: job.shop, productId },
              "Enhance skipped — product has no existing description",
            );
            if (errorLog.length < MAX_ERROR_LOG_ENTRIES)
              errorLog.push({ productId, error: "[NO CHARGE] No existing description to enhance" });
            failedCount++;
            pendingFailed++;
            await flushCounters();
            continue;
          }
        }

        // ── GENERATE FIRST — no credit consumed yet ──────────────────────
        let generated;
        try {
          const productImages = (product.media?.edges || [])
            .filter((e) => e.node?.mediaContentType === "IMAGE" && e.node?.image?.url)
            .map((e) => ({ url: e.node.image.url, altText: e.node.image.altText || "" }));
          generated = isEnhance
            ? await enhanceExistingContent(
                {
                  title: product.title,
                  productType: product.productType,
                  description: product.description,
                  descriptionHtml: product.descriptionHtml,
                  seoTitle: product.seo?.title || "",
                  seoDescription: product.seo?.description || "",
                  images: productImages,
                  tags: product.tags,
                },
                brandVoice,
                effectiveTypes,
                // A bulk run has nobody waiting on it, so it can afford the longer
                // rate-limit backoff (Phase 0 item 23).
                { interactive: false },
              )
            : await generateProductContent(
                {
                  title: product.title,
                  productType: product.productType,
                  vendor: product.vendor,
                  description: product.description,
                  descriptionHtml: product.descriptionHtml,
                  imageUrl: product.featuredMedia?.preview?.image?.url || "",
                  images: productImages,
                  variants: product.variants.edges.map((e) => e.node),
                  tags: product.tags,
                },
                brandVoice,
                effectiveTypes,
                { recentTitles, collectionVoice, interactive: false },
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
            jobLogger.warn(
              { shop: job.shop, productId, err: genErr.message },
              "API refused content — skipping without credit charge",
            );
            if (errorLog.length < MAX_ERROR_LOG_ENTRIES)
              errorLog.push({ productId, error: `[NO CHARGE] ${genErr.message}` });
            failedCount++;
            pendingFailed++;
            await flushCounters();
            continue;
          }
          throw genErr; // re-throw unexpected errors to outer catch
        }

        // ── Phase 0 item 6: an empty completion is not a generation ──────
        // The credit used to be taken here regardless, then `generatedTypes`
        // came out empty, `saveOps` was an empty array, nothing was written —
        // and the product still counted as COMPLETED. The merchant paid a
        // credit for a row that does not exist.
        const generatedTypes = contentTypes.filter((t) => generated?.[t]);
        if (generatedTypes.length === 0) {
          jobLogger.warn(
            { shop: job.shop, productId },
            "AI returned no usable content — skipping without credit charge",
          );
          if (errorLog.length < MAX_ERROR_LOG_ENTRIES)
            errorLog.push({
              productId,
              error: "[NO CHARGE] The AI returned no usable content for this product.",
            });
          failedCount++;
          pendingFailed++;
          await flushCounters();
          continue;
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

        // ── Phase 4 item 4.1: the quality gate, before anything is saved ──
        // One regeneration on failure. A draft that still fails is KEPT with a
        // note — the merchant paid for it — but autopilot will not publish it.
        let qualityNote = null;
        // Group 5.4 — a WARN-band draft SAVES and is publishable by hand, so it
        // does not fail the gate. It must still never be auto-published, and
        // that decision is this flag rather than the truthiness of a string.
        let withholdFromAutopilot = false;
        try {
          const gated = await gateContent({
            shop: job.shop,
            productId,
            generated,
            product: {
              title: product.title,
              vendor: product.vendor,
              productType: product.productType,
              // Group 5 — tags and options are what turn a guessed family into a
              // known one: `colour:chrome`, `size:600mm`. Without them the family
              // is still detected from the title, just less precisely.
              tags: product.tags,
              options: product.options,
            },
            shopDomain: job.shop,
            scoreOf: (c) => scoreContent(c)?.score ?? null,
            regenerate: async () =>
              job.mode === "enhance"
                ? await enhanceExistingContent(product, brandVoice || {}, contentTypes)
                : await generateProductContent(product, brandVoice || {}, contentTypes),
          });
          generated = gated.content;
          qualityNote = gated.note;
          withholdFromAutopilot = gated.withholdFromAutopilot;
        } catch (qErr) {
          // A gate that cannot run must not stop a merchant's job, and must not
          // withhold their content either — there is no finding to justify it.
          jobLogger.warn({ shop: job.shop, productId, err: qErr?.message }, "quality gate failed to run");
        }

        // ── SAVE CONTENT ──────────────────────────────────────────────────
        // Saved as a draft first even on an auto-publish job: the row is only
        // promoted to "published" once Shopify has actually accepted the write
        // (Phase 0 item 9). Claiming "published" before the mutation is checked
        // is how throttled updates were reported as successes.
        const finalStatus = "draft";

        const saveOps = generatedTypes.map((type) => {
          const originalContent =
            type === "description"
              ? product.descriptionHtml || ""
              : type === "metaTitle"
                ? product.seo?.title || ""
                : type === "metaDescription"
                  ? product.seo?.description || ""
                  : "";
          return prisma.generatedContent.upsert({
            where: { shop_productId_contentType: { shop: job.shop, productId, contentType: type } },
            update: {
              generatedContent: generated[type],
              status: finalStatus,
              version: { increment: 1 },
              ...(type === "description"
                ? {
                    simhash: fingerprintFor(generated.description, {
                      title: product.title,
                      vendor: product.vendor,
                      productType: product.productType,
                    }),
                    qualityNote,
                  }
                : {}),
            },
            create: {
              shop: job.shop,
              productId,
              productTitle: product.title,
              contentType: type,
              originalContent,
              generatedContent: generated[type],
              status: finalStatus,
              ...(type === "description"
                ? {
                    simhash: fingerprintFor(generated.description, {
                      title: product.title,
                      vendor: product.vendor,
                      productType: product.productType,
                    }),
                    qualityNote,
                  }
                : {}),
            },
          });
        });
        await Promise.all(saveOps);

        if (job.autoPublish) {
          const input = { id: productId };
          if (generated.description) input.descriptionHtml = generated.description;
          if (generated.metaTitle || generated.metaDescription) {
            input.seo = {};
            if (generated.metaTitle) input.seo.title = generated.metaTitle;
            if (generated.metaDescription) input.seo.description = generated.metaDescription;
          }

          // Phase 0 item 9 — the SAME publish helper the review screen uses.
          // The old local copy read `data.errors`, which is never populated for
          // a top-level GraphQL error, so a THROTTLED or rejected update was
          // reported as a successful publish: the row said "published", the
          // credit was spent, and Shopify was never touched.
          // Phase 4 item 4.1 — AUTOPILOT NEVER PUBLISHES A FAILING ITEM.
          // Pushing content the gate rejected onto a live storefront without
          // anybody reading it is the worst thing this app could do.
          // Fail-safe on EITHER signal. `withholdFromAutopilot` is the explicit
          // decision, but a note with no flag must still withhold: if the gate
          // ever returns one without the other, the direction we want to be
          // wrong in is "did not publish".
          if (withholdFromAutopilot || qualityNote) {
            jobLogger.warn(
              { shop: job.shop, productId, note: qualityNote, event: "autopilot_withheld" },
              "Quality gate flagged this - saved as a draft, NOT auto-published",
            );
            if (errorLog.length < MAX_ERROR_LOG_ENTRIES)
              errorLog.push({ productId, error: `Saved as a draft for you to check: ${qualityNote}` });
          }
          let published = Object.keys(input).length === 1; // nothing to publish → nothing to fail
          // Phase 4 item 4.2 — verified only when Shopify's own mutation
          // response echoed back what we sent. A publish nobody could confirm
          // is recorded as such rather than filed with the checked ones.
          let verifyNote = null;
          // `!qualityNote` is the autopilot refusal: a flagged draft is never
          // published without a merchant reading it.
          if (!published && !withholdFromAutopilot && !qualityNote) {
            const pub = await publishProductWithRetry(shopifyGraphql(session), productId, input);
            published = pub.ok;
            if (pub.ok && pub.verified === false) {
              verifyNote = pub.verifyNote ?? "Shopify stored something different from what we sent.";
              jobLogger.warn(
                { shop: job.shop, productId, note: verifyNote, event: "publish_unverified" },
                "Published but not verified - the merchant is told to check it",
              );
            }
            if (!pub.ok) {
              jobLogger.warn(
                { shop: job.shop, productId, throttled: !!pub.throttled, err: pub.error },
                "Auto-publish failed — content stays a draft",
              );
              if (errorLog.length < MAX_ERROR_LOG_ENTRIES)
                errorLog.push({
                  productId,
                  error: `Saved as a draft — publishing to Shopify failed: ${pub.error}`,
                });
            }
          }

          // Only now, with Shopify's acceptance in hand, may the rows claim to
          // be published.
          if (published) {
            await prisma.generatedContent.updateMany({
              where: { shop: job.shop, productId, contentType: { in: generatedTypes }, status: "draft" },
              data: verifyNote
                ? { status: "published_unverified", verifiedAt: null, verifyNote }
                : { status: "published", verifiedAt: new Date(), verifyNote: null },
            });
          }

          // Write the FAQ JSON-LD metafield so the storefront emits FAQPage schema
          // (the AI-search/GEO promise) for auto-published products too. The FAQ
          // row is only promoted with the rest above, and is put back to draft
          // here if the metafield write fails, so the Products list never shows
          // a "FAQ ✓" for a metafield that was never written.
          if (published && generated.faq) {
            await setFaqMetafield(session, productId, generated.faq).catch(async (err) => {
              jobLogger.warn(
                { shop: job.shop, productId, err: err.message },
                "FAQ metafield write failed — downgrading FAQ status so UI doesn't overclaim",
              );
              await prisma.generatedContent
                .update({
                  where: { shop_productId_contentType: { shop: job.shop, productId, contentType: "faq" } },
                  data: { status: "draft" },
                })
                .catch(() => {});
            });
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

        jobLogger.debug(
          { shop: job.shop, productId, productTitle: product.title },
          "Product content generated",
        );
      } catch (err) {
        // Phase 0 item 14 — the app is gone; there is nothing left to do for
        // any remaining product. Stop now instead of grinding through 401s.
        if (err.isAuthGone) {
          await flushCounters(true);
          jobLogger.warn(
            { shop: job.shop, event: "bulk_auth_gone" },
            "Access token is no longer valid — ending the job",
          );
          await prisma.generationJob.updateMany({
            where: { id: jobId, status: "processing" },
            data: {
              status: "failed",
              completedAt: new Date(),
              errorLog: JSON.stringify(
                [...errorLog, { productId: "N/A", error: err.message }].slice(-MAX_ERROR_LOG_ENTRIES),
              ),
            },
          });
          return;
        }
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

    // Guarded write: only a job still in "processing" may become "complete".
    // A cancellation that raced the final product must never be overwritten.
    const completed = await prisma.generationJob.updateMany({
      where: { id: jobId, status: "processing" },
      data: { status: "complete", completedAt: new Date() },
    });
    if (completed.count === 0) {
      jobLogger.info(
        { shop: job.shop },
        "Bulk job finished but status changed mid-run (cancelled) — leaving status as-is",
      );
      return;
    }
    jobLogger.info(
      { shop: job.shop, completedProducts: completedCount, failedProducts: failedCount },
      "Bulk job complete",
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

/**
 * An `admin.graphql`-shaped caller backed by the worker's offline session, so
 * shared helpers written against the admin context (publishProductWithRetry,
 * readMutationResult) work identically here. The worker has no admin context —
 * it runs outside any request — which is why it grew its own copies in the
 * first place.
 */
function shopifyGraphql(session) {
  return (query, opts = {}) =>
    fetch(`https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables: opts.variables }),
    });
}

async function fetchShopifyProduct(session, productId, attempt = 0) {
  let res;
  try {
    res = await fetch(`https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        // media/featuredMedia (Product.images/featuredImage are deprecated
        // in 2026-04). Only MediaImage nodes carry an image.
        query: `query getProduct($id: ID!) {
            product(id: $id) {
              id title productType vendor description descriptionHtml
              seo { title description }
              featuredMedia { preview { image { url } } }
              media(first: 4) { edges { node { id mediaContentType ... on MediaImage { image { url altText } } } } }
              variants(first: 10) { edges { node { title price } } }
              tags
              collections(first: 5) { edges { node { id } } }
            }
          }`,
        variables: { id: productId },
      }),
    });
  } catch (networkErr) {
    if (attempt < MAX_SHOPIFY_RETRIES) {
      const delay = SHOPIFY_BACKOFF_BASE_MS * Math.pow(2, attempt);
      logger.warn(
        { productId, attempt, err: networkErr.message },
        `Shopify network error — retrying in ${delay}ms`,
      );
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
    throw new Error(
      `Shopify rate limit exceeded fetching product ${productId} after ${MAX_SHOPIFY_RETRIES} retries`,
    );
  }

  if (res.status === 401) {
    // Offline token lapsed mid-run — refresh it and retry with the new token.
    // Phase 0 item 14: if the refresh FAILS, the app has almost certainly been
    // uninstalled. Retrying is then pointless and expensive — the old code spun
    // through four immediate 401s for every remaining product in the job. One
    // failed refresh aborts the whole run.
    const r = await refreshOfflineToken(session.shop);
    if (!r) {
      const err = new Error(
        "Shopify rejected our access token and it could not be refreshed — the app may have been uninstalled.",
      );
      err.isAuthGone = true;
      throw err;
    }
    session.accessToken = r.accessToken;
    session.expires = r.expires;
    if (attempt < MAX_SHOPIFY_RETRIES) {
      logger.warn({ productId, attempt }, "Shopify 401 on product fetch — refreshed token, retrying");
      return fetchShopifyProduct(session, productId, attempt + 1);
    }
    throw new Error(`Shopify kept rejecting the access token for product ${productId}`);
  }

  if (!res.ok) {
    throw new Error(`Shopify GraphQL error ${res.status} fetching product ${productId}`);
  }

  // Phase 0 item 9 — top-level GraphQL `errors` sit BESIDE `data`, never inside
  // it, so the old `data?.errors` check never fired: a throttled read looked
  // like "product not found" and the product was recorded as a failure with a
  // misleading reason instead of being retried.
  const body = await res.json();
  const topLevelErrors = Array.isArray(body?.errors) ? body.errors : [];

  if (topLevelErrors.some((e) => e?.extensions?.code === "THROTTLED")) {
    if (attempt < MAX_SHOPIFY_RETRIES) {
      const delay = SHOPIFY_BACKOFF_BASE_MS * Math.pow(2, attempt + 1);
      logger.warn({ productId, attempt }, "Shopify GraphQL throttled — backing off");
      await new Promise((r) => setTimeout(r, delay));
      return fetchShopifyProduct(session, productId, attempt + 1);
    }
    throw new Error("Shopify GraphQL throttle error after max retries");
  }

  if (topLevelErrors.length > 0 && !body?.data?.product) {
    throw new Error(
      `Shopify GraphQL error fetching product: ${topLevelErrors.map((e) => e.message).join("; ")}`,
    );
  }

  return body?.data?.product ?? null;
}

// Write the product's FAQ JSON-LD metafield (contentclaude/faq_schema) so the
// theme app embed emits FAQPage structured data on the storefront. No-op if the
// FAQ produces no usable schema. Caller treats failures as non-fatal (the rest
// of the product's content still published), but MUST NOT report the FAQ as
// published when this throws — see the status downgrade at the call site.
async function setFaqMetafield(session, productId, faqContent) {
  const metafield = buildFaqSchemaMetafield(productId, faqContent);
  if (!metafield) return;
  const res = await fetch(`https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
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
  });
  // A rejected mutation (bad owner id, invalid JSON, permission issue, etc.)
  // still comes back as HTTP 200 — res.ok alone can't detect it. Must inspect
  // the GraphQL body's userErrors, otherwise a rejected write looks identical
  // to a successful one to the caller.
  if (!res.ok) throw new Error(`metafieldsSet failed ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length) {
    throw new Error(`metafieldsSet GraphQL error: ${errors.map((e) => e.message).join("; ")}`);
  }
  const userErrors = data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `metafieldsSet rejected: ${userErrors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join("; ")}`,
    );
  }
}

// publishToShopify was deleted here (Phase 0 item 9). It was a second copy of
// the publish logic whose result check read `data?.errors`, which is never set
// for a top-level GraphQL error, so THROTTLED and rejected updates were
// reported as successful publishes. The one shared implementation now lives in
// adminGraphql.server.js and is used by both this worker and the review screen.
