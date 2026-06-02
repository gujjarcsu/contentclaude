import { useLoaderData, useNavigate, useSubmit, useNavigation, redirect } from "react-router";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Badge, ProgressBar, Banner, Checkbox, Box, Modal, TextContainer,
  SkeletonPage, SkeletonBodyText, SkeletonDisplayText,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueGenerationJob } from "../queues/generationQueue.server";
import { FREE_PLAN } from "../utils/billing-plans.js";
import { checkEntitlement } from "../utils/plans.server.js";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const productCountResp = await admin.graphql(`query { productsCount { count } }`);
  const { data } = await productCountResp.json();
  const totalProducts = data.productsCount.count;

  const [publishedCount, draftCount, plan, usageCount] = await Promise.all([
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

  const contentTypes = ["description", "metaTitle", "metaDescription", "faq"].filter(
    (t) => formData.get(t) === "true"
  );
  if (contentTypes.length === 0) return Response.json({ error: "Select at least one content type." });
  const autoPublish = formData.get("autoPublish") === "true";

  // Fetch IDs of products that have NO published or draft description
  const generatedProductIds = await prisma.generatedContent.findMany({
    where: { shop, contentType: "description" },
    select: { productId: true },
  });
  const existingIds = new Set(generatedProductIds.map((r) => r.productId));

  // Paginate all Shopify product IDs and filter to those missing content.
  // Hard-limit to 80 pages (80 × 250 = 20,000 products max) to prevent runaway loops.
  const missingIds = [];
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
            edges { node { id } }
          }
        }`,
        { variables: { cursor } }
      );
    } catch {
      if (missingIds.length > 0) break; // partial list — proceed with what we have
      return Response.json({ error: "Could not fetch your product list from Shopify. Please try again." }, { status: 503 });
    }

    const { data } = await resp.json();
    if (!data?.products) {
      if (missingIds.length > 0) break;
      return Response.json({ error: "Shopify returned an unexpected response. Please try again." }, { status: 503 });
    }

    const { edges, pageInfo } = data.products;
    for (const { node } of edges) {
      if (!existingIds.has(node.id)) missingIds.push(node.id);
    }
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  if (missingIds.length === 0) {
    return Response.json({ error: "All products already have AI content — nothing to optimise." });
  }

  const job = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: missingIds.length,
      productIds: JSON.stringify(missingIds),
      contentTypes: contentTypes.join(","),
      autoPublish,
    },
  });

  await enqueueGenerationJob(job.id);
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
  const isSubmitting = navigation.state === "submitting";

  // All hooks before any conditional return
  const coveragePct = totalProducts > 0 ? Math.round((publishedCount / totalProducts) * 100) : 0;

  const [genDesc, setGenDesc] = useState(true);
  const [genMeta, setGenMeta] = useState(true);
  const [genFaq, setGenFaq] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doSubmit = useCallback(() => {
    const fd = new FormData();
    fd.append("description", genDesc.toString());
    fd.append("metaTitle", genMeta.toString());
    fd.append("metaDescription", genMeta.toString());
    fd.append("faq", genFaq.toString());
    fd.append("autoPublish", autoPublish.toString());
    submit(fd, { method: "POST" });
  }, [genDesc, genMeta, genFaq, autoPublish, submit]);

  const handleOptimize = useCallback(() => {
    if (autoPublish) {
      setConfirmOpen(true);
    } else {
      doSubmit();
    }
  }, [autoPublish, doSubmit]);

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
      subtitle="Generate AI content for every product missing a description"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">

        {/* Coverage overview */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Content Coverage</Text>
                <Text as="p" variant="heading2xl" fontWeight="bold"
                  tone={coveragePct >= 50 ? "success" : "critical"}>{coveragePct}%</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {publishedCount} of {totalProducts} products have AI content
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
          onAction: () => { setConfirmOpen(false); doSubmit(); },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setConfirmOpen(false) }]}
      >
        <Modal.Section>
          <TextContainer>
            <Text as="p">
              Auto-publish will overwrite the live product descriptions on your Shopify storefront
              for all <strong>{canOptimize}</strong> products — without a review step.
            </Text>
            <Text as="p" tone="subdued">
              This cannot be undone from ContentClaude. You can revert individual products via
              the product editor after the job completes.
            </Text>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
