import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData, redirect } from "react-router";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Badge, ProgressBar, Banner, Checkbox, Box, Modal, TextContainer,
  SkeletonPage, SkeletonBodyText, SkeletonDisplayText, List,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueGenerationJob } from "../queues/generationQueue.server";
import { FREE_PLAN } from "../utils/billing-plans.js";
import { checkEntitlement } from "../utils/plans.server.js";
import { getCache } from "../utils/cache.server.js";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // productsCount shares the dashboard/analytics 5-min cache and runs in parallel
  // with the DB queries, so the loader isn't blocked on a serial Admin API call.
  const [totalProducts, publishedCount, draftCount, plan, usageCount] = await Promise.all([
    getCache(
      `productCount:${shop}`,
      async () => {
        const r = await admin.graphql(`query { productsCount { count } }`);
        const d = await r.json();
        return d.data.productsCount.count;
      },
      300
    ),
    prisma.generatedContent.count({ where: { shop, contentType: "description", status: "published" } }),
    prisma.generatedContent.count({ where: { shop, contentType: "description", status: "draft" } }),
    prisma.plan.findUnique({ where: { shop } }),
    prisma.usageRecord.count({ where: { shop, month: new Date().toISOString().slice(0, 7) } }),
  ]);

  const needsContent = Math.max(0, totalProducts - publishedCount - draftCount);
  const remaining = Math.max(0, (plan?.monthlyLimit ?? FREE_PLAN.monthlyLimit) - usageCount);
  const canOptimize = Math.min(needsContent, remaining);

  return Response.json({
    totalProducts,
    publishedCount,
    draftCount,
    needsContent,
    remaining,
    canOptimize,
    planName: plan?.planName ?? "free",
    monthlyLimit: plan?.monthlyLimit ?? FREE_PLAN.monthlyLimit,
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  // Optimise Store uses bulk jobs — Growth+ feature
  const bulkEnt = await checkEntitlement(shop, "bulkJobs");
  if (!bulkEnt.allowed) {
    return Response.json({
      error: `Bulk optimisation requires the ${bulkEnt.requiredPlan ?? "Growth"} plan. Upgrade to unlock.`,
      limitReached: true,
    });
  }

  // "generate" (default) fills products missing AI content; "enhance" improves
  // the live content of products that already have a description. FAQ is a
  // generate-only type — enhance mode preserves existing content and the
  // enhance prompt doesn't support FAQ.
  const mode = formData.get("mode") === "enhance" ? "enhance" : "generate";
  const allowedTypes = mode === "enhance"
    ? ["description", "metaTitle", "metaDescription"]
    : ["description", "metaTitle", "metaDescription", "faq"];
  const contentTypes = allowedTypes.filter((t) => formData.get(t) === "true");
  if (contentTypes.length === 0) return Response.json({ error: "Select at least one content type." });
  const autoPublish = formData.get("autoPublish") === "true";

  // Use $queryRaw for O(1) ID lookup — findMany would load all rows into memory
  // which is prohibitive at 100k+ products per merchant.
  // Enhance mode doesn't exclude products with prior AI content (its whole point
  // is re-optimising what's already live), so the lookup is generate-only.
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
  const targetIds = [];
  let cursor = null;
  let hasNextPage = true;
  let pageCount = 0;
  const MAX_PAGES = 80;

  while (hasNextPage && pageCount < MAX_PAGES) {
    pageCount++;
    let resp;
    try {
      resp = await admin.graphql(
        `query($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges { node { id description(truncateAt: 20) } }
          }
        }`,
        { variables: { cursor } }
      );
    } catch {
      if (targetIds.length > 0) break; // partial list — proceed with what we have
      return Response.json({ error: "Could not fetch your product list from Shopify. Please try again." }, { status: 503 });
    }

    const { data } = await resp.json();
    if (!data?.products) {
      if (targetIds.length > 0) break;
      return Response.json({ error: "Shopify returned an unexpected response. Please try again." }, { status: 503 });
    }

    const { edges, pageInfo } = data.products;
    for (const { node } of edges) {
      if (mode === "enhance") {
        if (node.description && node.description.trim()) targetIds.push(node.id);
      } else if (!existingIds.has(node.id)) {
        targetIds.push(node.id);
      }
    }
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  if (targetIds.length === 0) {
    return Response.json({
      error: mode === "enhance"
        ? "No products with an existing description were found — use the optimise flow above to generate fresh content first."
        : "All products already have AI content — nothing to optimise.",
    });
  }

  const job = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: targetIds.length,
      productIds: JSON.stringify(targetIds),
      contentTypes: contentTypes.join(","),
      mode,
      autoPublish,
    },
  });

  try {
    await enqueueGenerationJob(job.id);
  } catch (err) {
    // Concurrent-job cap or enqueue failure — banner, not the error boundary.
    return Response.json({
      error: err.message?.startsWith("You already have jobs") ? err.message : "Could not start the bulk job. Please try again.",
    });
  }
  return redirect("/app/jobs");
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function OptimizePage() {
  const {
    totalProducts, publishedCount, draftCount, needsContent,
    remaining, canOptimize, planName, monthlyLimit,
  } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData();
  const isSubmitting = navigation.state === "submitting";

  // All hooks before any conditional return
  const coveragePct = totalProducts > 0 ? Math.round((publishedCount / totalProducts) * 100) : 0;

  const [genDesc, setGenDesc] = useState(true);
  const [genMeta, setGenMeta] = useState(true);
  const [genFaq, setGenFaq] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Enhance panel (improve existing descriptions) — mirrors the generate panel
  const [enhDesc, setEnhDesc] = useState(true);
  const [enhMeta, setEnhMeta] = useState(true);
  const [enhAutoPublish, setEnhAutoPublish] = useState(false);
  // Which panel the auto-publish confirm modal belongs to
  const [confirmMode, setConfirmMode] = useState("generate");

  const doSubmit = useCallback(() => {
    const fd = new FormData();
    fd.append("description", genDesc.toString());
    fd.append("metaTitle", genMeta.toString());
    fd.append("metaDescription", genMeta.toString());
    fd.append("faq", genFaq.toString());
    fd.append("autoPublish", autoPublish.toString());
    submit(fd, { method: "POST" });
  }, [genDesc, genMeta, genFaq, autoPublish, submit]);

  const doSubmitEnhance = useCallback(() => {
    const fd = new FormData();
    fd.append("mode", "enhance");
    fd.append("description", enhDesc.toString());
    fd.append("metaTitle", enhMeta.toString());
    fd.append("metaDescription", enhMeta.toString());
    fd.append("autoPublish", enhAutoPublish.toString());
    submit(fd, { method: "POST" });
  }, [enhDesc, enhMeta, enhAutoPublish, submit]);

  const handleOptimize = useCallback(() => {
    if (autoPublish) {
      setConfirmMode("generate");
      setConfirmOpen(true);
    } else {
      doSubmit();
    }
  }, [autoPublish, doSubmit]);

  const handleEnhance = useCallback(() => {
    if (enhAutoPublish) {
      setConfirmMode("enhance");
      setConfirmOpen(true);
    } else {
      doSubmitEnhance();
    }
  }, [enhAutoPublish, doSubmitEnhance]);

  const planLabels = { free: "Free", starter: "Starter", growth: "Growth", pro: "Professional" };
  const estMinutes = Math.ceil(canOptimize * 3.5 / 60);

  if (navigation.state === "loading") {
    return (
      <SkeletonPage title="Optimise Store" primaryAction>
        <BlockStack gap="400">
          <Card><SkeletonDisplayText size="small" /><Box paddingBlockStart="400"><SkeletonBodyText lines={4} /></Box></Card>
          <Card><SkeletonDisplayText size="small" /><Box paddingBlockStart="400"><SkeletonBodyText lines={6} /></Box></Card>
        </BlockStack>
      </SkeletonPage>
    );
  }

  return (
    <Page
      title="One-Click Store Optimisation"
      subtitle="Generate AI content for products missing a description — or improve the descriptions you already have"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">

        {actionData?.error && (
          <Banner
            tone={actionData?.limitReached ? "warning" : "critical"}
            title={actionData?.limitReached ? "Plan upgrade required" : "Error"}
            action={actionData?.limitReached ? { content: "View Plans", onAction: () => navigate("/app/plans") } : undefined}
          >
            <p>{actionData.error}</p>
          </Banner>
        )}

        {/* Coverage overview */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Content Coverage</Text>
                <Text as="p" variant="heading2xl" fontWeight="bold"
                  tone={coveragePct >= 50 ? "success" : "critical"}>{coveragePct}%</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {publishedCount} of {totalProducts} products have a published description
                </Text>
                <ProgressBar progress={coveragePct}
                  tone={coveragePct >= 50 ? "success" : "critical"} size="small" />
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Needs Content</Text>
                <Text as="p" variant="heading2xl" fontWeight="bold" tone="critical">{needsContent}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Products with no AI description</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Quota Available</Text>
                <Text as="p" variant="heading2xl" fontWeight="bold"
                  tone={remaining > 0 ? "success" : "critical"}>{remaining}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Generations left this month
                  <br />
                  <Badge tone={planName === "free" ? "attention" : "success"}>
                    {planLabels[planName] ?? planName} — {monthlyLimit}/mo
                  </Badge>
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Optimise panel */}
        {needsContent === 0 ? (
          <Banner tone="success" title="Your store is fully optimised!">
            <p>All {totalProducts} products have AI-generated content.</p>
          </Banner>
        ) : remaining === 0 ? (
          <Banner tone="warning" title="Monthly quota reached">
            <p>Upgrade your plan to generate more content this month.</p>
            <Box paddingBlockStart="200">
              <Button onClick={() => navigate("/app/plans")}>View Plans →</Button>
            </Box>
          </Banner>
        ) : (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                Optimise {canOptimize} product{canOptimize !== 1 ? "s" : ""}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                This will create a background bulk job for all {needsContent} products missing AI content.
                {canOptimize < needsContent && ` Your quota covers ${canOptimize} of them this month.`}
                {estMinutes > 0 && ` Estimated time: ~${estMinutes} minute${estMinutes !== 1 ? "s" : ""}.`}
              </Text>

              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">Content to generate:</Text>
                <InlineStack gap="500" wrap>
                  <Checkbox label="Description" checked={genDesc} onChange={setGenDesc} />
                  <Checkbox label="Meta Title & Description" checked={genMeta} onChange={setGenMeta} />
                  <Checkbox label="FAQ" checked={genFaq} onChange={setGenFaq} />
                  <Checkbox
                    label="Auto-publish (skip review)"
                    checked={autoPublish}
                    onChange={setAutoPublish}
                    helpText="Publishes directly to Shopify"
                  />
                </InlineStack>
              </BlockStack>

              <Button
                variant="primary"
                size="large"
                onClick={handleOptimize}
                loading={isSubmitting}
                disabled={isSubmitting || (!genDesc && !genMeta && !genFaq)}
              >
                {isSubmitting ? "Starting job..." : `Optimise ${canOptimize} Products →`}
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
              <Text as="h2" variant="headingLg">Improve Existing Descriptions</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Already have descriptions? This takes each one and raises it to a world-class
                standard — your facts, claims, and voice stay exactly as they are; the clarity,
                formatting, and search performance get better. Runs on every product that has a
                description (up to {totalProducts}), including ones optimised before, and saves
                the results as drafts for your review unless auto-publish is on. Every enhanced
                description delivers:
              </Text>
              <List type="bullet">
                <List.Item>
                  <strong>Search-friendly structure</strong> — clear headings, scannable
                  paragraphs, and semantic relevance
                </List.Item>
                <List.Item>
                  <strong>Entity-rich content</strong> — product, brand, category, materials,
                  features, and use cases explicitly named so search engines and AI assistants
                  identify them instantly
                </List.Item>
                <List.Item>
                  <strong>Natural keyword coverage</strong> — primary, secondary, and long-tail
                  search intent, without keyword stuffing
                </List.Item>
                <List.Item>
                  <strong>Answer-ready information</strong> — concise, factual statements that
                  AI engines like ChatGPT, Perplexity, and Google AI can quote directly
                </List.Item>
                <List.Item>
                  <strong>Complete context &amp; trust signals</strong> — what it is, who
                  it&apos;s for, benefits, and specs; accurate and verifiable, never invented
                </List.Item>
                <List.Item>
                  <strong>Human-first writing</strong> — easy to read and genuinely persuasive
                  for real shoppers, not just algorithms
                </List.Item>
              </List>

              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">Content to enhance:</Text>
                <InlineStack gap="500" wrap>
                  <Checkbox label="Description" checked={enhDesc} onChange={setEnhDesc} />
                  <Checkbox label="Meta Title & Description" checked={enhMeta} onChange={setEnhMeta} />
                  <Checkbox
                    label="Auto-publish (skip review)"
                    checked={enhAutoPublish}
                    onChange={setEnhAutoPublish}
                    helpText="Publishes directly to Shopify"
                  />
                </InlineStack>
              </BlockStack>

              <Button
                size="large"
                onClick={handleEnhance}
                loading={isSubmitting}
                disabled={isSubmitting || (!enhDesc && !enhMeta)}
              >
                {isSubmitting ? "Starting job..." : "Enhance Existing Descriptions →"}
              </Button>
            </BlockStack>
          </Card>
        )}

        {draftCount > 0 && (
          <Banner tone="info" title={`${draftCount} draft${draftCount !== 1 ? "s" : ""} waiting for review`}>
            <Box paddingBlockStart="200">
              <Button onClick={() => navigate("/app/review")}>Review & Publish →</Button>
            </Box>
          </Banner>
        )}
      </BlockStack>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Publish directly to your live storefront?"
        primaryAction={{
          content: "Yes, auto-publish",
          destructive: true,
          onAction: () => {
            setConfirmOpen(false);
            if (confirmMode === "enhance") doSubmitEnhance();
            else doSubmit();
          },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setConfirmOpen(false) }]}
      >
        <Modal.Section>
          <TextContainer>
            <Banner tone="warning">
              <p>
                {confirmMode === "enhance" ? (
                  <>
                    <strong>This will replace existing product descriptions with the enhanced versions.</strong>{" "}
                    The enhancement preserves your structure and facts, but the live HTML is still overwritten.
                    Original content is saved automatically and can be restored from each product&apos;s History tab.
                  </>
                ) : (
                  <>
                    <strong>This will replace existing product descriptions entirely.</strong>{" "}
                    Original content is saved automatically and can be restored from each product&apos;s History tab.
                    If a product has custom HTML, embedded videos, or widgets in its description, they will be removed.
                  </>
                )}
              </p>
            </Banner>
            <Text as="p">
              Auto-publish will overwrite the live product descriptions on your Shopify storefront
              for {confirmMode === "enhance" ? "up to" : "all"}{" "}
              <strong>{confirmMode === "enhance" ? totalProducts : canOptimize}</strong> products — without a review step.
            </Text>
            <Text as="p" tone="subdued">
              This cannot be undone from Navaal. You can revert individual products via
              the product editor after the job completes.
            </Text>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
