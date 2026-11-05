import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData, redirect } from "react-router";
import { useT } from "../i18n/react.jsx";
import { tForRequest } from "../i18n/index.js";
import {
  EmptyState,
  Page,
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
  InlineGrid,
} from "@shopify/polaris";
import { CheckCircleIcon, ProductIcon, CreditCardIcon, MagicIcon, EditIcon, AlertTriangleIcon } from "@shopify/polaris-icons";
import { IconTile, AiButton, LockedPreview } from "../components/Kit.jsx";
import { IlluAllGood } from "../components/Illustrations.jsx";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { publishesWithoutReview } from "../utils/publishSetting.server.js";
import { enqueueGenerationJob } from "../queues/generationQueue.server.js";
import { FREE_PLAN, bulkRefusal, getEntitlements, cheapestPlanLabelWith } from "../utils/billing-plans.js";
import { checkEntitlement, remainingGenerations, sliceToQuota, getMonthlyUsageCount } from "../utils/plans.server.js";
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
    // The same credit sum Home and Plans read (L5): counting usage ROWS disagreed
    // with them whenever a row carries 0 credits (alt text) or more than one.
    getMonthlyUsageCount(shop),
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
  // The action refuses a bulk run on a plan without bulk jobs, so on such a
  // plan the run cards show as the real thing under a lock card, never as an
  // enabled button that then says no.
  const bulkAllowed = !!getEntitlements(planName).bulkJobs;
  const BulkGate = ({ children }) =>
    bulkAllowed ? (
      children
    ) : (
      <LockedPreview
        sentence={t("Fixing many products at once is on {plan} and above. Everything listed here stays visible on every plan, and you can still write for one product at a time from its own page.", { plan: cheapestPlanLabelWith("bulkJobs") })}
      >
        {children}
      </LockedPreview>
    );

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

  const planLabels = { free: t("Free"), starter: t("Starter"), growth: t("Growth"), pro: t("Professional") };  const noneChosen = !genDesc && !genMeta && !genFaq;

  if (loadingThisRoute) {
    return (
      <SkeletonPage title={t("Optimize store")} primaryAction>
        <BlockStack gap="400">
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <BlockStack gap="300">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={2} />
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
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

  // Redesign v2 — the facts, not how to use the screen.
  const subtitle =
    totalProducts > 0
      ? t("{n, plural, one {# product} other {# products}} not yet optimized · {remaining} credits left this month", { n: needsContent, remaining: t.number(remaining) })
      : undefined;

  /* Where the drafts go, in three steps (SEOWILL 128, Smart SEO 105). Honest
     about the merchant's own setting: with publish without review on, step two
     is the storefront, not Review. */
  const steps = publishWithoutReview
    ? [
        { icon: MagicIcon, title: t("Written in the background"), body: t("One product at a time, in your brand voice.") },
        { icon: AlertTriangleIcon, title: t("Published straight to your store"), body: t("Publish without review is on in Settings.") },
        { icon: CheckCircleIcon, title: t("Originals kept"), body: t("Each product's earlier text can be restored.") },
      ]
    : [
        { icon: MagicIcon, title: t("Written in the background"), body: t("One product at a time, in your brand voice.") },
        { icon: EditIcon, title: t("Saved as drafts"), body: t("Nothing changes on your store yet.") },
        { icon: CheckCircleIcon, title: t("You review and publish"), body: t("Only what you approve goes live.") },
      ];

  return (
    <Page title={t("Optimize store")} subtitle={subtitle} backAction={{ content: t("Home"), onAction: () => navigate("/app") }}>
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner
            tone={actionData?.limitReached ? "warning" : "critical"}
            title={actionData?.limitReached ? t("Plan upgrade required") : t("Error")}
            action={actionData?.limitReached ? { content: t("View Plans"), onAction: () => navigate("/app/plans") } : undefined}
          >
            <p>{actionData.error}</p>
          </Banner>
        )}

        {/* The category's metric cards: an icon tile, the figure, its scope. */}
        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <IconTile icon={CheckCircleIcon} tone="success" />
              <BlockStack gap="100">
                <Text as="h2" variant="bodySm" tone="subdued">
                  {t("Content Coverage")}
                </Text>
                <Text as="p" variant="headingXl" numeric>
                  {coveragePct}%
                </Text>
                <Text id="optimize-coverage" as="p" variant="bodySm" tone="subdued">
                  {t("{publishedCount} of {totalProducts} products have a published description", { publishedCount, totalProducts })}
                </Text>
                <ProgressBar progress={coveragePct} tone={coveragePct >= 50 ? "success" : "highlight"} size="small" ariaLabelledBy="optimize-coverage" />
              </BlockStack>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <IconTile icon={ProductIcon} tone="brand" />
              <BlockStack gap="100">
                <Text as="h2" variant="bodySm" tone="subdued">
                  {t("Not yet optimized")}
                </Text>
                <Text as="p" variant="headingXl" numeric>
                  {t.number(needsContent)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {candidateLabel ? t("Of your {candidateLabel}", { candidateLabel }) : t("Products we have not written for yet")}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="start" gap="200">
                <IconTile icon={CreditCardIcon} tone="neutral" />
                <Badge>{t("{plan} plan", { plan: planLabels[planName] ?? planName })}</Badge>
              </InlineStack>
              <BlockStack gap="100">
                <Text as="h2" variant="bodySm" tone="subdued">
                  {t("Credits left this month")}
                </Text>
                <Text as="p" variant="headingXl" numeric>
                  {t.number(remaining)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("of {monthlyCredits} this month", { monthlyCredits: t.number(monthlyCredits) })}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </InlineGrid>

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
          <Card>
            <EmptyState heading={t("No products yet")} image="/empty-products.svg">
              <p>{t("Add products to your store, and this is where you generate content for them.")}</p>
            </EmptyState>
          </Card>
        ) : needsContent === 0 ? (
          <Card>
            <InlineStack gap="400" blockAlign="center" wrap={false}>
              <Box minWidth="160px">
                <IlluAllGood width={160} />
              </Box>
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  {t("Every product has content")}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  {t("All {totalProducts} products have AI content. New products will appear here.", { totalProducts })}
                </Text>
              </BlockStack>
            </InlineStack>
          </Card>
        ) : remaining === 0 ? (
          /* Phase 3 item 3.4, surface (b) — the optimise action is REPLACED by
             this card rather than hidden. A button that vanishes reads as a
             bug; a card in its place says why it cannot run and what would
             make it run. Auditing, reviewing and publishing existing drafts
             all keep working. */
          <QuotaReachedCard upsell={upsell} surface="optimize" />
        ) : (
          <BulkGate>
          <Card>
            <BlockStack gap="500">
              <InlineStack gap="400" blockAlign="center" wrap={false}>
                <IconTile icon={MagicIcon} tone="brand" size="lg" />
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">
                    {t("Optimize {n, plural, one {# product} other {# products}}", { n: canOptimize })}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {t("This will create a background bulk job for all {needsContent} products missing AI content.", { needsContent })}
                    {canOptimize < needsContent && t(" Your quota covers {canOptimize} of them this month.", { canOptimize })}                  </Text>
                </BlockStack>
              </InlineStack>

              {/* What happens to the drafts, as three steps with tiles. */}
              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                {steps.map((s) => (
                  <Box key={s.title} padding="300" background="bg-surface-secondary" borderRadius="300">
                    <InlineStack gap="300" blockAlign="start" wrap={false}>
                      <IconTile icon={s.icon} tone="brand" size="sm" />
                      <BlockStack gap="050">
                        <Text as="p" variant="headingSm">
                          {s.title}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {s.body}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </Box>
                ))}
              </InlineGrid>

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

              {/* What it costs, beside the button that spends it. One credit per
                  product: the bundle is one call (credits.js creditsFor). */}
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <BlockStack gap="050">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {t("Uses up to {n, plural, one {# credit} other {# credits}}, one per product", { n: canOptimize })}
                  </Text>
                  <Text as="p" variant="bodySm" tone={noneChosen ? "critical" : "subdued"}>
                    {noneChosen ? t("Choose at least one kind of content.") : t("{remaining} of {monthly} credits left this month", { remaining: t.number(remaining), monthly: t.number(monthlyCredits) })}
                  </Text>
                </BlockStack>
                <AiButton solid size="large" onClick={handleOptimize} loading={isSubmitting} disabled={isSubmitting || noneChosen}>
                  {isSubmitting ? t("Starting job...") : t("Optimize store ({canOptimize})", { canOptimize })}
                </AiButton>
              </InlineStack>
            </BlockStack>
          </Card>
          </BulkGate>
        )}

        {/* Enhance existing panel — improves live descriptions instead of
            generating from scratch. Hidden when there's nothing it could run on
            or the quota banner above already explains why nothing can run. */}
        {bulkAllowed && totalProducts > 0 && remaining > 0 && (
          <BulkGate>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" blockAlign="center" wrap={false}>
                <IconTile icon={EditIcon} tone="brand" size="lg" />
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">
                    {t("Improve existing descriptions")}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {t("Rewrites descriptions you already have. Your facts, claims and voice stay as they are. Saved as drafts for your review unless publish without review is turned on in Settings.")}
                  </Text>
                </BlockStack>
              </InlineStack>

              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">
                  {t("Content to enhance:")}
                </Text>
                <InlineStack gap="500" wrap>
                  <Checkbox label={t("Description")} checked={enhDesc} onChange={setEnhDesc} />
                  <Checkbox label={t("Meta Title & Description")} checked={enhMeta} onChange={setEnhMeta} />
                </InlineStack>
              </BlockStack>

              <InlineStack align="end">
                <AiButton size="large" onClick={handleEnhance} loading={isSubmitting} disabled={isSubmitting || (!enhDesc && !enhMeta)}>
                  {isSubmitting ? t("Starting job...") : t("Improve existing descriptions")}
                </AiButton>
              </InlineStack>
            </BlockStack>
          </Card>
          </BulkGate>
        )}

        {/* Drafts already waiting: a row with its action, not a second notice. */}
        {draftCount > 0 && (
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="300">
              <InlineStack gap="300" blockAlign="center" wrap={false}>
                <IconTile icon={EditIcon} tone="caution" />
                <Text as="p" variant="headingSm">
                  {t("{n, plural, one {# draft} other {# drafts}} waiting for review", { n: draftCount })}
                </Text>
              </InlineStack>
              <Button onClick={() => navigate("/app/review")}>{t("Review drafts")}</Button>
            </InlineStack>
          </Card>
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
