import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData, redirect } from "react-router";
import { useT } from "../i18n/react.jsx";
import { tForRequest } from "../i18n/index.js";
import {
  EmptyState,
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  ProgressBar,
  Banner,
  Checkbox,
  Box,
  Modal,
  TextContainer,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { publishesWithoutReview } from "../utils/publishSetting.server.js";
import { enqueueGenerationJob } from "../queues/generationQueue.server.js";
import { FREE_PLAN, bulkRefusal } from "../utils/billing-plans.js";
import { checkEntitlement, remainingGenerations, sliceToQuota } from "../utils/plans.server.js";
import { getContentMetrics } from "../utils/metrics.server.js";
import { getCandidateCounts, notOptimizedFrom, LIST_SCOPE_QUERY } from "../utils/candidates.server.js";
import { contentInCatalogue } from "../utils/catalogueContent.server.js";
import { enumerateProductIds } from "../utils/enumerateProducts.server.js";
import { getUpsell } from "../utils/upgradePrompts.server.js";
import { QuotaReachedCard } from "../components/UpgradePrompt.jsx";
import { useRouteLoading } from "../utils/useRouteLoading.js";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // productsCount shares the dashboard/analytics 5-min cache and runs in parallel
  // with the DB queries, so the loader isn't blocked on a serial Admin API call.
  const [candidateCounts, metrics, plan, usageCount, publishWithoutReview] = await Promise.all([
    // Group 1 — the same unfiltered `productsCount` that produced five wrong
    // numbers elsewhere. Optimize is the screen where it mattered most: it fed
    // `canOptimize`, i.e. how many products a bulk run would be pointed at.
    getCandidateCounts(admin, shop),
    getContentMetrics(shop),
    prisma.plan.findUnique({ where: { shop } }),
    prisma.usageRecord.count({ where: { shop, month: new Date().toISOString().slice(0, 7) } }),
    publishesWithoutReview(shop),
  ]);

  // Phase 2 item 2.1 - one definition of product state, shared with Home and
  // Products. This used to count DESCRIPTION ROWS ONLY, which is why Optimize
  // said 14 where Products said 12: a product with a meta title but no
  // description read as needing content here and as having content there.
  // Group 1.5 — the catalogue total stays true; the number the bulk run is
  // pointed at is a different number and is now named as one.
  const totalProducts = candidateCounts.total?.count ?? null;
  const candidateProducts = candidateCounts.candidates?.count ?? null;

  const publishedCount = metrics.publishedProducts;
  const draftCount = metrics.draftProducts;
  // Group 4.1 — candidates we have not written for, not "products with no
  // content". The two are only the same on a store that has written nothing.
  // Part B — the number the bulk run is pointed at must be about the
  // candidates, not about every product this app has ever touched.
  const catalogue = await contentInCatalogue(admin, shop);
  const needsContent =
    notOptimizedFrom(candidateProducts, catalogue.ok ? catalogue.withContent : metrics.withContent) ?? 0;
  const remaining = Math.max(0, (plan?.monthlyCredits ?? FREE_PLAN.monthlyCredits) - usageCount);
  const canOptimize = Math.min(needsContent, remaining);

  // Phase 3 item 3.4 — null unless the quota is exhausted, in which case the
  // optimise action is replaced by a card. Server-computed and never throws.
  const upsell = await getUpsell({ admin, shop, plan, usageCount, surface: "optimize" });

  return Response.json({
    totalProducts,
    candidateProducts,
    candidateLabel: candidateCounts.label,
    countsOk: candidateCounts.ok,
    publishedCount,
    draftCount,
    needsContent,
    remaining,
    canOptimize,
    upsell,
    publishWithoutReview,
    planName: plan?.planName ?? "free",
    monthlyCredits: plan?.monthlyCredits ?? FREE_PLAN.monthlyCredits,
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const t = tForRequest(request);
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  // Optimize store uses bulk jobs — Growth+ feature
  const bulkEnt = await checkEntitlement(shop, "bulkJobs");
  if (!bulkEnt.allowed) {
    return Response.json({
      error: bulkRefusal("Optimising your whole store at once"),
      limitReached: true,
    });
  }

  // "generate" (default) fills products missing AI content; "enhance" improves
  // the live content of products that already have a description. FAQ is a
  // generate-only type — enhance mode preserves existing content and the
  // enhance prompt doesn't support FAQ.
  const mode = formData.get("mode") === "enhance" ? "enhance" : "generate";
  const allowedTypes =
    mode === "enhance"
      ? ["description", "metaTitle", "metaDescription"]
      : ["description", "metaTitle", "metaDescription", "faq"];
  const contentTypes = allowedTypes.filter((t) => formData.get(t) === "true");
  if (contentTypes.length === 0) return Response.json({ error: t("Select at least one content type.") });
  // Phase 2 item 2.6 - read from Settings, never from the form.
  const autoPublish = await publishesWithoutReview(shop);

  // Use $queryRaw for O(1) ID lookup — findMany would load all rows into memory
  // which is prohibitive at 100k+ products per merchant.
  // Enhance mode doesn't exclude products with prior AI content (its whole point
  // is re-optimizing what's already live), so the lookup is generate-only.
  let existingIds = new Set();
  if (mode === "generate") {
    const generatedRows = await prisma.$queryRaw`
      SELECT DISTINCT "productId" FROM "GeneratedContent"
      WHERE shop = ${shop} AND "contentType" = 'description'
    `;
    existingIds = new Set(generatedRows.map((r) => r.productId));
  }

  // Paginate all Shopify product IDs and filter to the mode's target set:
  // generate → products missing AI content; enhance → products that already
  // have a live description to improve.
  // Hard-limit to 80 pages (80 × 250 = 20,000 products max) to prevent runaway loops.
  // A2.3 — this was a hand-rolled copy of the catalogue walk using RAW
  // `admin.graphql`. Products had the same loop and was moved onto the backoff
  // wrapper in Phase 4 item 6; this one was missed, so the first THROTTLE
  // silently truncated a bulk run — the merchant asked to optimize everything
  // and got whatever had been read before Shopify said no, reported as success.
  //
  // It also stopped at 80 pages (20,000 products) and said nothing at all. One
  // enumerator now, and its result carries WHY it stopped.
  // P5.1 — THE SCOPE, and its absence was spending money.
  //
  // This call passed no `query` at all, so `enumerateProductIds` sent
  // `products(query: null)` and Shopify returned EVERYTHING — archived products
  // included. Bulk optimize then enqueued generations against products the
  // merchant had deliberately archived, and under credit weighting each one is
  // a real charge against a real allowance at 2.00c per credit.
  //
  // A1 scoped the three READ paths on the Products page. It did not scope this,
  // which is the WRITE path, and the write path is the one that costs money.
  //
  // The same Shopify trap applies as everywhere else this constant is used: an
  // invalid field in a search query is IGNORED and all results are returned, so
  // a typo here does not error — it silently goes back to charging for archived
  // products. Hence one constant, asserted by test, never a literal.
  const walk = await enumerateProductIds(admin.graphql, {
    shop,
    query: LIST_SCOPE_QUERY,
    label: t("optimize enumerate"),
    select: (node) =>
      mode === "enhance" ? !!(node.description && node.description.trim()) : !existingIds.has(node.id),
  });
  const targetIds = walk.ids;

  // Nothing usable AND we know why. The wording and the 503 are the contract
  // this route already had and its tests pin: a throttle, a malformed response
  // and a dead connection each get their own sentence, because "something went
  // wrong" tells a merchant nothing about whether to retry.
  if (targetIds.length === 0 && walk.truncated) {
    return Response.json(
      {
        error: walk.throttled ? t("Shopify is rate-limiting your store right now. Please try again in a minute.") : walk.reason === "no_data" || walk.reason === "errors" ? t("Shopify returned an unexpected response. Please try again.") : t("Could not fetch your product list from Shopify. Please try again."),
      },
      { status: 503 },
    );
  }

  if (targetIds.length === 0) {
    return Response.json({
      error:
        mode === "enhance" ? t("No products with an existing description were found — use the optimize flow above to generate fresh content first.") : t("All products already have AI content — nothing to optimize."),
    });
  }

  // Phase 0 item 4 — only enqueue what the quota can actually pay for. The
  // count beside the button already promises this ("your quota covers N"); the
  // job used to take every id anyway and burn the model on work it could not
  // credit.
  const remaining = await remainingGenerations(shop);
  const { targetIds: runIds, quotaSkipped } = sliceToQuota(targetIds, remaining);
  if (runIds.length === 0) {
    return Response.json({
      error: t("You have no credits left this month, so there is nothing to run. {n, plural, one {# product is} other {# products are}} waiting.", { n: targetIds.length }),
      limitReached: true,
    });
  }

  const job = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: runIds.length,
      productIds: JSON.stringify(runIds),
      contentTypes: contentTypes.join(","),
      mode,
      autoPublish,
      quotaSkipped,
    },
  });

  try {
    await enqueueGenerationJob(job.id);
  } catch (err) {
    // Concurrent-job cap or enqueue failure — banner, not the error boundary.
    return Response.json({
      error: err.message?.startsWith("You already have jobs") ? err.message : t("Could not start the bulk job. Please try again."),
    });
  }
  // A2.3 — a redirect discards the action's return value, so a run that was
  // cut short would have landed on Jobs looking like a complete success. The
  // note travels in the URL and Jobs renders it.
  return redirect(walk.truncated ? `/app/jobs?partial=${encodeURIComponent(walk.message)}` : "/app/jobs");
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function OptimizePage() {
  const t = useT();
  const {
    totalProducts,
    publishedCount,
    draftCount,
    needsContent,
    candidateLabel,
    remaining,
    canOptimize,
    planName,
    monthlyCredits,
    publishWithoutReview,
    upsell,
  } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const loadingThisRoute = useRouteLoading();
  const actionData = useActionData();
  const isSubmitting = navigation.state === "submitting";

  // All hooks before any conditional return
  const coveragePct = totalProducts > 0 ? Math.round((publishedCount / totalProducts) * 100) : 0;

  const [genDesc, setGenDesc] = useState(true);
  const [genMeta, setGenMeta] = useState(true);
  const [genFaq, setGenFaq] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Enhance panel (improve existing descriptions) — mirrors the generate panel
  const [enhDesc, setEnhDesc] = useState(true);
  const [enhMeta, setEnhMeta] = useState(true);
  // Which panel the publish-without-review confirm modal belongs to
  const [confirmMode, setConfirmMode] = useState("generate");

  const doSubmit = useCallback(() => {
    const fd = new FormData();
    fd.append("description", genDesc.toString());
    fd.append("metaTitle", genMeta.toString());
    fd.append("metaDescription", genMeta.toString());
    fd.append("faq", genFaq.toString());
    submit(fd, { method: "POST" });
  }, [genDesc, genMeta, genFaq, submit]);

  const doSubmitEnhance = useCallback(() => {
    const fd = new FormData();
    fd.append("mode", "enhance");
    fd.append("description", enhDesc.toString());
    fd.append("metaTitle", enhMeta.toString());
    fd.append("metaDescription", enhMeta.toString());
    submit(fd, { method: "POST" });
  }, [enhDesc, enhMeta, submit]);

  const handleOptimize = useCallback(() => {
    if (publishWithoutReview) {
      setConfirmMode("generate");
      setConfirmOpen(true);
    } else {
      doSubmit();
    }
  }, [publishWithoutReview, doSubmit]);

  const handleEnhance = useCallback(() => {
    if (publishWithoutReview) {
      setConfirmMode("enhance");
      setConfirmOpen(true);
    } else {
      doSubmitEnhance();
    }
  }, [publishWithoutReview, doSubmitEnhance]);

  const planLabels = { free: "Free", starter: "Starter", growth: "Growth", pro: "Professional" };
  const estMinutes = Math.ceil((canOptimize * 3.5) / 60);

  if (loadingThisRoute) {
    return (
      <SkeletonPage title={t("Optimize store")} primaryAction>
        <BlockStack gap="400">
          <Card>
            <SkeletonDisplayText size="small" />
            <Box paddingBlockStart="400">
              <SkeletonBodyText lines={4} />
            </Box>
          </Card>
          <Card>
            <SkeletonDisplayText size="small" />
            <Box paddingBlockStart="400">
              <SkeletonBodyText lines={6} />
            </Box>
          </Card>
        </BlockStack>
      </SkeletonPage>
    );
  }

  return (
    <Page
      title={t("Optimize store")}
      subtitle={t("Generate AI content for products missing a description — or improve the descriptions you already have")}
      backAction={{ content: t("Dashboard"), onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner
            tone={actionData?.limitReached ? "warning" : "critical"}
            title={actionData?.limitReached ? t("Plan upgrade required") : t("Error")}
            action={
              actionData?.limitReached
                ? { content: t("View Plans"), onAction: () => navigate("/app/plans") }
                : undefined
            }
          >
            <p>{actionData.error}</p>
          </Banner>
        )}

        {/* Coverage overview */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                 {t("Content Coverage")}
                </Text>
                <Text
                  as="p"
                  variant="heading2xl"
                  fontWeight="bold"
                  tone={coveragePct >= 50 ? "success" : "critical"}
                >
                  {coveragePct}%
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                 {t("{publishedCount} of {totalProducts} products have a published description", { publishedCount, totalProducts })}
                </Text>
                <ProgressBar
                  progress={coveragePct}
                  tone={coveragePct >= 50 ? "success" : "critical"}
                  size="small"
                />
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                 {t("Not yet optimized")}
                </Text>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {needsContent}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {candidateLabel ? t("Of your {candidateLabel}", { candidateLabel }) : t("Products we have not written for yet")}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                 {t("Quota Available")}
                </Text>
                <Text
                  as="p"
                  variant="heading2xl"
                  fontWeight="bold"
                  tone={remaining > 0 ? "success" : "critical"}
                >
                  {remaining}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                 {t("Credits left this month")}
                  <br />
                  <Badge tone={planName === "free" ? "attention" : "success"}>
                    {planLabels[planName] ?? planName} — {monthlyCredits}/mo
                  </Badge>
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Optimize panel */}
        {/* Phase 2 item 2.10 - an empty store is not a finished store.

            needsContent was total - published - draft with a Math.max(0)
            floor, so a shop with NO PRODUCTS AT ALL computed 0 and fell
            into the success branch. A brand-new merchant saw a green
            banner reading "Your store is fully optimized!" above the
            literal sentence "All 0 products have AI-generated content." -
            and the page had no action anywhere, so the only way out was
            the back link. SEO Audit showed that same store a red 0/100. */}
        {totalProducts === 0 ? (
          <EmptyState heading={t("No products yet")} image="/empty-products.svg">
            <p>{t("Add products to your store, and this is where you generate content for them.")}</p>
          </EmptyState>
        ) : needsContent === 0 ? (
          <Banner tone="success" title={t("Every product has content")}>
            <p>{t("All {totalProducts} products have AI content. New products will appear here.", { totalProducts })}</p>
          </Banner>
        ) : remaining === 0 ? (
          /* Phase 3 item 3.4, surface (b) — the optimise action is REPLACED by
             this card rather than hidden. A button that vanishes reads as a
             bug; a card in its place says why it cannot run and what would
             make it run. Auditing, reviewing and publishing existing drafts
             all keep working. */
          <QuotaReachedCard upsell={upsell} surface="optimize" />
        ) : (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
               {t("Optimize {n, plural, one {# product} other {# products}}", { n: canOptimize })}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
               {t("This will create a background bulk job for all {needsContent} products missing AI content.", { needsContent })}
                {canOptimize < needsContent && t(" Your quota covers {canOptimize} of them this month.", { canOptimize })}
                {estMinutes > 0 && t(" Estimated time: ~{n, plural, one {# minute} other {# minutes}}.", { n: estMinutes })}
              </Text>

              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">
                 {t("Content to generate:")}
                </Text>
                <InlineStack gap="500" wrap>
                  <Checkbox label={t("Description")} checked={genDesc} onChange={setGenDesc} />
                  <Checkbox label={t("Meta Title & Description")} checked={genMeta} onChange={setGenMeta} />
                  <Checkbox label="FAQ" checked={genFaq} onChange={setGenFaq} />
                </InlineStack>
              </BlockStack>

              <Button
                variant="primary"
                size="large"
                onClick={handleOptimize}
                loading={isSubmitting}
                disabled={isSubmitting || (!genDesc && !genMeta && !genFaq)}
              >
                {isSubmitting ? t("Starting job...") : t("Optimize store ({canOptimize})", { canOptimize })}
              </Button>
            </BlockStack>
          </Card>
        )}

        {/* Enhance existing panel — improves live descriptions instead of
            generating from scratch. Hidden when there's nothing it could run on
            or the quota banner above already explains why nothing can run. */}
        {totalProducts > 0 && remaining > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
               {t("Improve existing descriptions")}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
               {t("Rewrites descriptions you already have. Your facts, claims and voice stay as they are. Saved as drafts for your review unless publish without review is turned on in Settings.")}
              </Text>

              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">
                 {t("Content to enhance:")}
                </Text>
                <InlineStack gap="500" wrap>
                  <Checkbox label={t("Description")} checked={enhDesc} onChange={setEnhDesc} />
                  <Checkbox label={t("Meta Title & Description")} checked={enhMeta} onChange={setEnhMeta} />
                </InlineStack>
              </BlockStack>

              <Button
                size="large"
                onClick={handleEnhance}
                loading={isSubmitting}
                disabled={isSubmitting || (!enhDesc && !enhMeta)}
              >
                {isSubmitting ? t("Starting job...") : t("Improve existing descriptions")}
              </Button>
            </BlockStack>
          </Card>
        )}

        {draftCount > 0 && (
          <Banner tone="info" title={t("{n, plural, one {# draft} other {# drafts}} waiting for review", { n: draftCount })}>
            <Box paddingBlockStart="200">
              <Button onClick={() => navigate("/app/review")}>{t("Review drafts")}</Button>
            </Box>
          </Banner>
        )}
      </BlockStack>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("Publish without review is on")}
        primaryAction={{
          content: t("Generate and publish"),
          destructive: true,
          onAction: () => {
            setConfirmOpen(false);
            if (confirmMode === "enhance") doSubmitEnhance();
            else doSubmit();
          },
        }}
        secondaryActions={[{ content: t("Cancel"), onAction: () => setConfirmOpen(false) }]}
      >
        <Modal.Section>
          <TextContainer>
            <Text as="p">
             {t("This will publish straight to your live storefront without a review step. You can turn this off in Settings.")}
            </Text>
            <Banner tone="warning">
              <p>
                {confirmMode === "enhance" ? (
                  <>
                    <strong>
                     {t("This will replace existing product descriptions with the enhanced versions.")}
                    </strong>
                   {t("{v} The enhancement preserves your structure and facts, but the live HTML is still overwritten. Original content is saved automatically and can be restored from each product's History tab.", { v: "" })}
                  </>
                ) : (
                  <>
                    <strong>{t("This will replace existing product descriptions entirely.")}</strong>
                   {t("{v} Original content is saved automatically and can be restored from each product's History tab. If a product has custom HTML, embedded videos, or widgets in its description, they will be removed.", { v: "" })}
                  </>
                )}
              </p>
            </Banner>
            <Text as="p">
             {t("The live product descriptions on your Shopify storefront will be overwritten for {scope}", { scope: confirmMode === "enhance" ? t("up to") : t("all") })}{" "}
              <strong>{confirmMode === "enhance" ? totalProducts : canOptimize}</strong> {t("products.")}
            </Text>
            <Text as="p" tone="subdued">
             {t("This cannot be undone from Navaal. You can revert individual products via the product editor after the job completes.")}
            </Text>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
