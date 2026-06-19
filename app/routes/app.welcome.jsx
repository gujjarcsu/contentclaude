// Phase 1 — the 5-minute "magic moment" first-run flow.
//
// On first run (flag `magicMoment`, dev-only for now) this route:
//   1. auto-scans the store and computes GEO + SEO scores,
//   2. auto-picks the merchant's weakest real product as the demo target,
//   3. generates a REAL before→after on that product (one metered credit),
//   4. offers one-click "Optimize my store",
//   5. shows a first-run checklist to the activation win.
//
// Entirely additive: when the flag is OFF the loader redirects to /app, so the
// existing onboarding (app.setup) is untouched. No fabricated data — every score
// and the after-content come from the merchant's own catalog + a real generation.

import { useEffect, useRef } from "react";
import { useLoaderData, useFetcher, useNavigate, redirect } from "react-router";
import {
  Page, Card, Text, BlockStack, InlineStack, Button, Box, Badge,
  Banner, Divider, Spinner, Layout,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { isFeatureEnabled } from "../utils/featureFlags.server.js";
import { calculateSeoScore } from "../utils/seo.server.js";
import { calculateGeoScore } from "../utils/geo.server.js";
import { getEntitlements } from "../utils/billing-plans.js";
import { tryConsumeGeneration, getOrCreatePlan, getMonthlyUsageCount } from "../utils/plans.server.js";

const SCAN_LIMIT = 50;

function authParamString(request) {
  const url = new URL(request.url);
  const p = new URLSearchParams();
  for (const k of ["host", "shop", "id_token", "session", "embedded", "locale", "timestamp", "hmac"]) {
    const v = url.searchParams.get(k);
    if (v) p.set(k, v);
  }
  return p.toString();
}

async function scanProducts(admin) {
  const resp = await admin.graphql(
    `query welcomeScan($n: Int!) {
      products(first: $n, sortKey: UPDATED_AT) {
        edges { node {
          id title handle descriptionHtml description productType vendor tags
          seo { title description }
          featuredImage { url altText }
          images(first: 5) { edges { node { url altText } } }
          variants(first: 5) { edges { node { price } } }
        } }
      }
    }`,
    { variables: { n: SCAN_LIMIT } }
  );
  const { data } = await resp.json();
  return (data?.products?.edges ?? []).map(({ node }) => {
    const images = (node.images?.edges ?? []).map((e) => e.node);
    return {
      id: node.id,
      numericId: node.id.replace("gid://shopify/Product/", ""),
      title: node.title,
      description: node.description || "",
      descriptionHtml: node.descriptionHtml || "",
      seoTitle: node.seo?.title || "",
      seoDescription: node.seo?.description || "",
      productType: node.productType || "",
      vendor: node.vendor || "",
      tags: node.tags || [],
      images,
      imageUrl: node.featuredImage?.url || "",
      variants: (node.variants?.edges ?? []).map((e) => e.node),
    };
  });
}

/** Score a scanned product on both rubrics. */
function scoreProduct(p) {
  const seo = calculateSeoScore({
    description: p.description,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    images: p.images,
  });
  const geo = calculateGeoScore(p); // no faq yet → that's the gap the demo fills
  return { seo: seo.score, geo: geo.score };
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Inert unless the flag is on — keeps the app shippable / non-breaking.
  if (!isFeatureEnabled("magicMoment")) {
    throw redirect(`/app?${authParamString(request)}`);
  }

  const products = await scanProducts(admin);

  if (products.length === 0) {
    return Response.json({ empty: true });
  }

  const scored = products.map((p) => ({ ...p, scores: scoreProduct(p) }));
  // Demo target = the weakest product (biggest visible lift). Best = the strongest.
  const byCombined = [...scored].sort(
    (a, b) => a.scores.geo + a.scores.seo - (b.scores.geo + b.scores.seo)
  );
  const worst = byCombined[0];
  const best = byCombined[byCombined.length - 1];

  const storeGeo = Math.round(scored.reduce((s, p) => s + p.scores.geo, 0) / scored.length);
  const storeSeo = Math.round(scored.reduce((s, p) => s + p.scores.seo, 0) / scored.length);

  // Has the demo already been generated (so refresh doesn't re-charge)?
  const existing = await prisma.generatedContent.findFirst({
    where: { shop, productId: worst.id, contentType: "description" },
    select: { generatedContent: true, status: true },
  });

  // Checklist + activation state from data we already have.
  const [brandVoice, plan, usageCount, publishedCount] = await Promise.all([
    prisma.brandVoice.findUnique({ where: { shop } }),
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
    prisma.generatedContent.count({ where: { shop, status: "published" } }),
  ]);
  const draftCount = await prisma.generatedContent.count({ where: { shop, status: "draft" } });

  const ents = getEntitlements(plan.planName);

  let demoAfter = null;
  if (existing?.generatedContent) {
    const afterGeo = calculateGeoScore({ ...worst, description: existing.generatedContent, faq: "" }).geo ?? 0;
    demoAfter = {
      content: existing.generatedContent.slice(0, 600),
      geoAfter: calculateGeoScore({ ...worst, description: existing.generatedContent }).score,
    };
    void afterGeo;
  }

  return Response.json({
    empty: false,
    storeGeo,
    storeSeo,
    totalScanned: scored.length,
    demo: {
      productId: worst.id,
      numericId: worst.numericId,
      title: worst.title,
      geoBefore: worst.scores.geo,
      seoBefore: worst.scores.seo,
      beforeSnippet: (worst.description || "").replace(/<[^>]+>/g, " ").trim().slice(0, 280),
      alreadyGenerated: !!existing?.generatedContent,
      after: demoAfter,
    },
    best: { title: best.title, geo: best.scores.geo },
    checklist: {
      brandVoice: !!(brandVoice && (brandVoice.storeName?.trim() || brandVoice.targetAudience?.trim())),
      generated: draftCount + publishedCount > 0,
      published: publishedCount > 0,
    },
    plan: { planName: plan.planName, monthlyLimit: plan.monthlyLimit, usageCount },
    canBulk: !!ents.bulkJobs,
    remaining: Math.max(0, plan.monthlyLimit - usageCount),
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  if (!isFeatureEnabled("magicMoment")) {
    return Response.json({ error: "Not available." }, { status: 404 });
  }

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "generateDemo") {
    const productId = form.get("productId");
    if (!productId) return Response.json({ error: "Missing product." }, { status: 400 });

    // Don't re-charge if it already exists.
    const existing = await prisma.generatedContent.findFirst({
      where: { shop, productId, contentType: "description" },
      select: { generatedContent: true },
    });
    if (existing?.generatedContent) {
      const after = calculateGeoScore({ description: existing.generatedContent }).score;
      return Response.json({ demoDone: true, content: existing.generatedContent.slice(0, 600), geoAfter: after });
    }

    const gate = await tryConsumeGeneration(shop, "description", productId);
    if (!gate.allowed) {
      return Response.json({ limitReached: true, error: "You're out of free generations — upgrade to continue." });
    }

    // Fetch full product + brand voice, generate a real piece.
    const [{ generateProductContent }, brandVoice, resp] = await Promise.all([
      import("../utils/ai.server.js"),
      prisma.brandVoice.findUnique({ where: { shop } }),
      admin.graphql(
        `query($id: ID!){ product(id:$id){ id title productType vendor description descriptionHtml
          tags seo{title description} featuredImage{url} images(first:4){edges{node{url}}}
          variants(first:5){edges{node{title price}}} } }`,
        { variables: { id: productId } }
      ),
    ]);
    const { data } = await resp.json();
    const node = data?.product;
    if (!node) return Response.json({ error: "Product not found." }, { status: 404 });

    const product = {
      title: node.title,
      productType: node.productType,
      vendor: node.vendor,
      description: node.description,
      descriptionHtml: node.descriptionHtml,
      images: (node.images?.edges ?? []).map((e) => e.node),
      imageUrl: node.featuredImage?.url || "",
      variants: (node.variants?.edges ?? []).map((e) => e.node),
      tags: node.tags || [],
      seoTitle: node.seo?.title || "",
      seoDescription: node.seo?.description || "",
    };

    let generated;
    try {
      generated = await generateProductContent(product, brandVoice || {}, ["description", "metaTitle", "metaDescription", "faq"]);
    } catch (err) {
      return Response.json({ error: `Generation failed: ${err.message}` }, { status: 502 });
    }

    if (generated.description) {
      await prisma.generatedContent.upsert({
        where: { shop_productId_contentType: { shop, productId, contentType: "description" } },
        update: { generatedContent: generated.description, status: "draft", version: { increment: 1 } },
        create: { shop, productId, productTitle: node.title, contentType: "description", originalContent: node.descriptionHtml || "", generatedContent: generated.description, status: "draft" },
      });
    }

    const geoAfter = calculateGeoScore({
      ...product,
      description: generated.description || product.description,
      seoTitle: generated.metaTitle || product.seoTitle,
      seoDescription: generated.metaDescription || product.seoDescription,
      faq: generated.faq || "",
    }).score;

    return Response.json({
      demoDone: true,
      content: (generated.description || "").replace(/<[^>]+>/g, " ").trim().slice(0, 600),
      geoAfter,
    });
  }

  if (intent === "optimizeStore") {
    // Entitled (Growth+) → kick off a real bulk job; otherwise route to Products.
    const ents = getEntitlements((await getOrCreatePlan(shop)).planName);
    if (!ents.bulkJobs) {
      return redirect(`/app/products?${authParamString(request)}`);
    }
    const { enqueueGenerationJob } = await import("../queues/generationQueue.server");
    const ids = [];
    let cursor = null, hasNext = true, pages = 0;
    while (hasNext && pages < 20) {
      pages++;
      const r = await admin.graphql(
        `query($c:String){ products(first:250, after:$c){ pageInfo{hasNextPage endCursor} edges{node{id}} } }`,
        { variables: { c: cursor } }
      );
      const { data } = await r.json();
      const pg = data?.products;
      if (!pg) break;
      ids.push(...pg.edges.map((e) => e.node.id));
      hasNext = pg.pageInfo.hasNextPage;
      cursor = pg.pageInfo.endCursor;
    }
    if (ids.length === 0) return redirect(`/app/products?${authParamString(request)}`);
    const job = await prisma.generationJob.create({
      data: { shop, status: "queued", totalProducts: ids.length, productIds: JSON.stringify(ids), contentTypes: "description,metaTitle,metaDescription", autoPublish: false },
    });
    await enqueueGenerationJob(job.id);
    return redirect(`/app/jobs?${authParamString(request)}`);
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
};

// ─── Component ─────────────────────────────────────────────────────────────────

function ScoreStat({ label, value, tone }) {
  return (
    <BlockStack gap="100" inlineAlign="center">
      <Text as="p" variant="heading2xl" fontWeight="bold" tone={tone}>{value}</Text>
      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
    </BlockStack>
  );
}

export default function WelcomePage() {
  const data = useLoaderData();
  const navigate = useNavigate();
  const demoFetcher = useFetcher();
  const optimizeFetcher = useFetcher();
  const autoFired = useRef(false);

  // Auto-generate the demo once on first view (guarded so refresh never re-charges).
  useEffect(() => {
    if (data.empty) return;
    if (autoFired.current) return;
    if (data.demo?.alreadyGenerated) return;
    if (data.remaining <= 0) return;
    autoFired.current = true;
    const fd = new FormData();
    fd.append("intent", "generateDemo");
    fd.append("productId", data.demo.productId);
    demoFetcher.submit(fd, { method: "post" });
  }, [data, demoFetcher]);

  if (data.empty) {
    return (
      <Page title="Welcome to ContentClaude">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">Add a product to see the magic</Text>
            <Text as="p" tone="subdued">Once your store has products, ContentClaude will scan them and show your AI-search readiness instantly.</Text>
            <Button variant="primary" onClick={() => navigate("/app")}>Go to Dashboard</Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const result = demoFetcher.data;
  const generating = demoFetcher.state !== "idle";
  const geoAfter = result?.geoAfter ?? data.demo.after?.geoAfter ?? null;
  const afterContent = result?.content ?? data.demo.after?.content ?? null;
  const lift = geoAfter != null ? geoAfter - data.demo.geoBefore : null;
  const optimizing = optimizeFetcher.state !== "idle";

  return (
    <Page title="Welcome to ContentClaude" subtitle="Here's your store's AI-search readiness — scanned just now.">
      <BlockStack gap="500">

        {/* Scan result */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">We scanned {data.totalScanned} of your products</Text>
            <InlineStack gap="800" align="center" wrap>
              <ScoreStat label="GEO / AI-search score" value={`${data.storeGeo}`} tone={data.storeGeo >= 60 ? "success" : "critical"} />
              <ScoreStat label="Traditional SEO score" value={`${data.storeSeo}`} tone={data.storeSeo >= 60 ? "success" : "critical"} />
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              GEO measures how ready your products are to be cited by ChatGPT, Perplexity, Gemini, and Google AI Overviews.
            </Text>
          </BlockStack>
        </Card>

        {/* Live before → after on the merchant's weakest product */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Live demo: “{data.demo.title}”</Text>
              {lift != null && lift > 0 && <Badge tone="success">{`GEO +${lift} points`}</Badge>}
            </InlineStack>

            <Layout>
              <Layout.Section variant="oneHalf">
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack align="space-between"><Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">BEFORE</Text><Badge tone="critical">{`GEO ${data.demo.geoBefore}`}</Badge></InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">{data.demo.beforeSnippet || "No real description — invisible to AI answer engines."}</Text>
                  </BlockStack>
                </Box>
              </Layout.Section>
              <Layout.Section variant="oneHalf">
                <Box padding="400" background="bg-surface-success-subdued" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack align="space-between"><Text as="p" variant="bodySm" fontWeight="semibold" tone="success">AFTER (AI-optimized)</Text>{geoAfter != null && <Badge tone="success">{`GEO ${geoAfter}`}</Badge>}</InlineStack>
                    {generating ? (
                      <InlineStack gap="200" blockAlign="center"><Spinner size="small" /><Text as="p" variant="bodySm" tone="subdued">Generating a real sample from your product…</Text></InlineStack>
                    ) : result?.limitReached ? (
                      <Banner tone="warning"><p>{result.error}</p></Banner>
                    ) : afterContent ? (
                      <Text as="p" variant="bodySm">{afterContent}…</Text>
                    ) : (
                      <Text as="p" variant="bodySm" tone="subdued">Preparing your sample…</Text>
                    )}
                  </BlockStack>
                </Box>
              </Layout.Section>
            </Layout>
            {afterContent && (
              <InlineStack gap="300">
                <Button onClick={() => navigate(`/app/products/${data.demo.numericId}`)}>Review &amp; edit this draft →</Button>
              </InlineStack>
            )}
          </BlockStack>
        </Card>

        {/* One-click optimize */}
        <Box padding="500" background="bg-fill-brand" borderRadius="300">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg"><span style={{ color: "#fff" }}>Optimize your whole store</span></Text>
              <Text as="p" variant="bodyMd"><span style={{ color: "rgba(255,255,255,0.85)" }}>Generate AI-search-ready content for every product — runs in the background.</span></Text>
            </BlockStack>
            <optimizeFetcher.Form method="post">
              <input type="hidden" name="intent" value="optimizeStore" />
              <Button variant="primary" tone="success" size="large" submit loading={optimizing}>
                {data.canBulk ? "Optimize my store →" : "See plans to optimize all →"}
              </Button>
            </optimizeFetcher.Form>
          </InlineStack>
        </Box>

        {/* First-run checklist */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Your setup checklist</Text>
            {[
              { done: data.checklist.brandVoice, label: "Configure your brand voice", to: "/app/settings" },
              { done: data.checklist.generated, label: "Generate your first product content", to: `/app/products/${data.demo.numericId}` },
              { done: data.checklist.published, label: "Publish your first AI content (activation!)", to: "/app/review" },
            ].map((step) => (
              <InlineStack key={step.label} align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={step.done ? "success" : undefined}>{step.done ? "✓ Done" : "To do"}</Badge>
                  <Text as="p" variant="bodyMd">{step.label}</Text>
                </InlineStack>
                {!step.done && <Button variant="plain" onClick={() => navigate(step.to)}>Start →</Button>}
              </InlineStack>
            ))}
            <Divider />
            <InlineStack align="end">
              <Button variant="plain" onClick={() => navigate("/app")}>Skip to dashboard</Button>
            </InlineStack>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
