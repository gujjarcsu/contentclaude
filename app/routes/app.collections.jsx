import { useLoaderData, useNavigate, useFetcher } from "react-router";
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
  Banner,
  EmptyState,
  Box,
  Spinner,
  TextField,
  Select,
  Checkbox,
  Divider,
} from "@shopify/polaris";
import { useState, useCallback, useEffect, useRef } from "react";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { shopifyQuery } from "../utils/shopifyQuery.server.js";
import { getCollectionCandidateCounts } from "../utils/candidates.server.js";
import { hasRealContent } from "../utils/candidates.js";

/** One page of collections. Shopify's ceiling for this connection is 250. */
const COLLECTION_PAGE = 250;
import { useRouteLoading } from "../utils/useRouteLoading.js";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Group 2.1 — this was a bare `admin.graphql` reading ONE page of 250 and
  // presenting `collections.length` as the total. On a store with 395
  // collections the header said "250 collections", 145 were invisible, and
  // nothing signalled it: a cap presented as a total. That is the worst of the
  // three sampling defects, because nothing on the screen was wrong enough to
  // notice.
  //
  // It was also UNGUARDED. `data?.collections?.edges ?? []` means a THROTTLED
  // response — where `data` is null — rendered "0 collections" as fact. Group 4
  // item 6 fixed exactly this shape on three other screens and missed this one.
  const [page, counts] = await Promise.all([
    shopifyQuery(
      admin.graphql,
      `query collectionsPage($n: Int!) {
        collections(first: $n, sortKey: TITLE) {
          edges {
            node {
              id title description
              seo { title description }
              image { url altText }
              productsCount { count }
            }
          }
        }
      }`,
      { n: COLLECTION_PAGE },
      { shop, label: "collections page" },
    ),
    getCollectionCandidateCounts(admin, shop),
  ]);

  const catalogError = page.ok
    ? null
    : page.throttled
      ? "Shopify is rate-limiting your store right now, so this list may be incomplete. It will fill in shortly."
      : "We could not read your collections from Shopify just now. This list may be incomplete.";

  const collections = (page.data?.collections?.edges ?? []).map(({ node }) => ({
    id: node.id,
    title: node.title,
    description: node.description || "",
    seoTitle: node.seo?.title || "",
    seoDescription: node.seo?.description || "",
    imageUrl: node.image?.url || "",
    productsCount: node.productsCount?.count ?? 0,
    // Group 7.3 / 4.3 — the header told the merchant to "generate SEO
    // descriptions for each" on a page where most collections already carried
    // hand-written copy better than ours. Whether copy exists decides whether
    // the offer is Generate or Enhance, so the row needs to know.
    hasOwnContent: hasRealContent(node.description),
  }));

  // Cross-reference with generated content
  const generated = await prisma.generatedContent.findMany({
    where: { shop, contentType: "description", productId: { in: collections.map((c) => c.id) } },
    select: { productId: true, status: true },
  });
  const statusMap = {};
  generated.forEach(({ productId, status }) => {
    statusMap[productId] = status;
  });

  const voiceOverrides = await prisma.collectionVoice.findMany({ where: { shop } });
  const voiceMap = {};
  voiceOverrides.forEach((v) => {
    voiceMap[v.collectionId] = v;
  });

  // Group 2.1 — say what was shown, out of what. `total` is null rather than 0
  // when Shopify would not answer: "you have no collections" is a claim, and
  // "we could not count them" is a different one.
  const total = counts.total?.count ?? null;
  const totalExact = counts.total?.exact ?? true;
  const truncated = total !== null && total > collections.length;

  return Response.json({
    collections,
    statusMap,
    voiceMap,
    catalogError,
    total,
    totalExact,
    truncated,
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "generate") {
    const collectionId = formData.get("collectionId");
    const collectionTitle = formData.get("collectionTitle");
    const collectionDescription = formData.get("collectionDescription") || "";
    const productsCount = formData.get("productsCount") || "";

    const [{ generateCollectionDescription }, { getCache }, { withGenerationCredit }, { checkRateLimit }] =
      await Promise.all([
        import("../utils/ai.server.js"),
        import("../utils/cache.server.js"),
        import("../utils/plans.server.js"),
        import("../utils/rateLimit.server.js"),
      ]);

    // Collection generation is a normal AI generation: same rate limit and
    // monthly quota as products. It previously had NEITHER — unlimited free
    // AI calls on any plan.
    const rl = await checkRateLimit(shop, { maxPerMinute: 10 });
    if (!rl.allowed) {
      return Response.json({
        error: "You're generating too fast. Please wait a moment before trying again.",
      });
    }

    // Phase 0 item 5 — the credit comes back if the generation fails or returns
    // nothing usable.
    let outcome;
    try {
      outcome = await withGenerationCredit(
        shop,
        { contentType: "description", productId: collectionId },
        async () => {
          const brandVoice = await getCache(
            `bv:${shop}`,
            () => prisma.brandVoice.findUnique({ where: { shop } }),
            300,
          );
          return generateCollectionDescription(
            { id: collectionId, title: collectionTitle, description: collectionDescription, productsCount },
            brandVoice,
          );
        },
      );
    } catch (err) {
      return Response.json(
        { error: `We couldn't write this collection: ${err.message}. This did not use a generation.` },
        { status: 502 },
      );
    }
    if (!outcome.allowed) {
      return Response.json({
        error: "You've reached your monthly generation limit. Upgrade your plan to continue.",
        limitReached: true,
      });
    }
    if (outcome.refunded) {
      return Response.json(
        {
          error: "The AI returned nothing for this collection. Please retry — this did not use a generation.",
        },
        { status: 502 },
      );
    }
    const generated = outcome.result;

    // Save to DB
    await Promise.all(
      Object.entries(generated)
        .filter(([, val]) => val)
        .map(([type, val]) =>
          prisma.generatedContent.upsert({
            where: { shop_productId_contentType: { shop, productId: collectionId, contentType: type } },
            update: { generatedContent: val, status: "draft", version: { increment: 1 } },
            create: {
              shop,
              productId: collectionId,
              productTitle: collectionTitle,
              contentType: type,
              originalContent: "",
              generatedContent: val,
              status: "draft",
            },
          }),
        ),
    );

    return Response.json({ success: true, generated, collectionId });
  }

  if (actionType === "publish") {
    const collectionId = formData.get("collectionId");
    const description = formData.get("description");
    const metaTitle = formData.get("metaTitle");
    const metaDescription = formData.get("metaDescription");

    const input = { id: collectionId };
    if (description) input.descriptionHtml = description;
    if (metaTitle || metaDescription) {
      input.seo = {};
      if (metaTitle) input.seo.title = metaTitle;
      if (metaDescription) input.seo.description = metaDescription;
    }

    const result = await admin.graphql(
      `mutation updateCollection($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id }
          userErrors { field message }
        }
      }`,
      { variables: { input } },
    );
    const { data } = await result.json();
    const errors = data?.collectionUpdate?.userErrors ?? [];
    if (errors.length > 0) {
      return Response.json({ error: errors.map((e) => e.message).join(";") }, { status: 422 });
    }

    const typeContentMap = {
      ...(description ? { description } : {}),
      ...(metaTitle ? { metaTitle } : {}),
      ...(metaDescription ? { metaDescription } : {}),
    };
    await Promise.all(
      Object.entries(typeContentMap).map(([type, val]) =>
        prisma.generatedContent.updateMany({
          where: { shop, productId: collectionId, contentType: type, status: "draft" },
          data: { status: "published", generatedContent: val },
        }),
      ),
    );

    return Response.json({ success: true, published: true, collectionId });
  }

  if (actionType === "saveVoice") {
    const collectionId = formData.get("collectionId");
    const useDefaults = formData.get("useDefaults") === "true";
    if (useDefaults) {
      await prisma.collectionVoice.deleteMany({ where: { shop, collectionId } });
    } else {
      const brandTone = (formData.get("brandTone") || "").slice(0, 100);
      const targetAudience = (formData.get("targetAudience") || "").slice(0, 500);
      const keywords = (formData.get("keywords") || "").slice(0, 500);
      await prisma.collectionVoice.upsert({
        where: { shop_collectionId: { shop, collectionId } },
        update: { brandTone, targetAudience, keywords },
        create: { shop, collectionId, brandTone, targetAudience, keywords },
      });
    }
    return Response.json({ success: true, savedVoice: true, collectionId });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
};

// ─── Component ───────────────────────────────────────────────────────────────

const TONE_OPTIONS = [
  { label: "Store Default", value: "" },
  { label: "Professional & Trustworthy", value: "professional" },
  { label: "Friendly & Conversational", value: "friendly" },
  { label: "Premium & Luxurious", value: "premium" },
  { label: "Bold & Energetic", value: "bold" },
  { label: "Scientific & Technical", value: "scientific" },
  { label: "Warm & Nurturing", value: "warm" },
  { label: "Minimalist & Clean", value: "minimalist" },
  { label: "Fun & Playful", value: "playful" },
];

export default function CollectionsPage() {
  const { collections, statusMap, voiceMap, catalogError, total, totalExact, truncated } =
    useLoaderData();
  const navigate = useNavigate();
  const loadingThisRoute = useRouteLoading();
  const fetcher = useFetcher();
  const voiceFetcher = useFetcher();
  const [expandedId, setExpandedId] = useState(null);

  const [editedContent, setEditedContent] = useState({});
  const [voiceOpen, setVoiceOpen] = useState({});
  const [voiceForms, setVoiceForms] = useState(() => {
    const init = {};
    for (const col of collections) {
      const v = voiceMap[col.id];
      init[col.id] = {
        useDefaults: !v,
        brandTone: v?.brandTone || "",
        targetAudience: v?.targetAudience || "",
        keywords: v?.keywords || "",
      };
    }
    return init;
  });

  const isGenerating = fetcher.state !== "idle" && fetcher.formData?.get("actionType") === "generate";
  const isPublishing = fetcher.state !== "idle" && fetcher.formData?.get("actionType") === "publish";
  const fetcherData = fetcher.data;

  const prevFetcherData = useRef(null);

  useEffect(() => {
    if (fetcherData && fetcherData !== prevFetcherData.current) {
      prevFetcherData.current = fetcherData;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        if (fetcherData.published) {
          window.shopify.toast.show("Collection content published!", { duration: 4000 });
        } else if (fetcherData.error) {
          window.shopify.toast.show(fetcherData.error, { duration: 5000, isError: true });
        }
      }
    }
  }, [fetcherData]);

  // Voice saves go through voiceFetcher (not the main fetcher) and the action
  // returns `savedVoice` — the old toast watched the wrong fetcher for a
  // field (`saved`) that no action ever returned, so it never fired.
  const prevVoiceData = useRef(null);
  useEffect(() => {
    const data = voiceFetcher.data;
    if (data && data !== prevVoiceData.current) {
      prevVoiceData.current = data;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        if (data.savedVoice) {
          window.shopify.toast.show("Collection voice saved!", { duration: 3000 });
        } else if (data.error) {
          window.shopify.toast.show(data.error, { duration: 5000, isError: true });
        }
      }
    }
  }, [voiceFetcher.data]);

  const handleGenerate = useCallback(
    (collection) => {
      const fd = new FormData();
      fd.append("actionType", "generate");
      fd.append("collectionId", collection.id);
      fd.append("collectionTitle", collection.title);
      fd.append("collectionDescription", collection.description);
      fd.append("productsCount", String(collection.productsCount));
      fetcher.submit(fd, { method: "POST" });
      setExpandedId(collection.id);
    },
    [fetcher],
  );

  const handlePublish = useCallback(
    (collectionId) => {
      const content = editedContent[collectionId] || fetcherData?.generated || {};
      const fd = new FormData();
      fd.append("actionType", "publish");
      fd.append("collectionId", collectionId);
      if (content.description) fd.append("description", content.description);
      if (content.metaTitle) fd.append("metaTitle", content.metaTitle);
      if (content.metaDescription) fd.append("metaDescription", content.metaDescription);
      fetcher.submit(fd, { method: "POST" });
    },
    [fetcher, editedContent, fetcherData],
  );

  const updateEdit = (collectionId, field, value) => {
    setEditedContent((prev) => ({
      ...prev,
      [collectionId]: { ...(prev[collectionId] || {}), [field]: value },
    }));
  };

  /**
   * Group 2.1 — the old subtitle was
   *   `${collections.length} collections · generate SEO descriptions for each`
   * which on a 395-collection store read "250 collections" and instructed the
   * merchant to overwrite copy that was mostly better than ours.
   *
   * Two separate lies in one line: a cap presented as a total, and an
   * instruction to Generate over collections that already had descriptions.
   */
  const collectionsSubtitle = (() => {
    if (total === null) return "We could not read your collection totals from Shopify just now.";
    const shown = collections.length;
    const totalText = totalExact ? `${total}` : `${total}+`;
    const withCopy = collections.filter((c) => c.hasOwnContent).length;
    const scope = truncated ? `Showing the first ${shown} of ${totalText} collections` : `${totalText} collections`;
    return withCopy > 0
      ? `${scope} · ${withCopy} already have a description of your own`
      : `${scope} · none have a description yet`;
  })();

  const updateVoiceForm = (collectionId, field, value) => {
    setVoiceForms((prev) => ({
      ...prev,
      [collectionId]: { ...(prev[collectionId] || {}), [field]: value },
    }));
  };

  const handleSaveVoice = useCallback(
    (collectionId) => {
      const form = voiceForms[collectionId] || {};
      const fd = new FormData();
      fd.append("actionType", "saveVoice");
      fd.append("collectionId", collectionId);
      fd.append("useDefaults", String(!!form.useDefaults));
      if (!form.useDefaults) {
        fd.append("brandTone", form.brandTone || "");
        fd.append("targetAudience", form.targetAudience || "");
        fd.append("keywords", form.keywords || "");
      }
      voiceFetcher.submit(fd, { method: "POST" });
    },
    [voiceFetcher, voiceForms],
  );

  // Instant feedback during client-side navigation into this route — prevents
  // the blank-pane stall while the loader fetches collections from Shopify.
  if (loadingThisRoute) {
    return <AppSkeleton title="Collections" sections={3} layout="full" />;
  }

  if (collections.length === 0) {
    return (
      <Page title="Collections" backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}>
        <EmptyState heading="No collections found" image="/empty-collections.svg">
          <p>Create collections in your Shopify admin, then come back to generate descriptions.</p>
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page
      title="Collections"
      subtitle={collectionsSubtitle}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="400">
        {/* Group 2.1 — a throttled or failed read used to render an empty list
            silently, so "you have no collections" and "Shopify would not answer"
            looked identical. */}
        {catalogError && (
          <Banner tone="warning" title="This list may be incomplete">
            <p>{catalogError}</p>
          </Banner>
        )}
        {/* Group 2.1 — a cap must never be presented as a total. This says what
            is missing, how much, and what to do about it, instead of showing 250
            of 395 as though that were the whole store. */}
        {truncated && (
          <Banner tone="info" title="Showing part of your collections">
            <p>
              {`Your store has ${totalExact ? total : `more than ${total}`} collections and this page shows the first ${collections.length}, sorted by title. The rest are not listed here yet — you can reach any collection from Shopify admin, and the SEO Audit covers products across your whole catalog.`}
            </p>
          </Banner>
        )}
        {fetcherData?.error && (
          <Banner tone="critical">
            <p>{fetcherData.error}</p>
          </Banner>
        )}
        {fetcherData?.success && fetcherData?.published && (
          <Banner tone="success" title="Published!">
            <p>Collection content published to your Shopify store.</p>
          </Banner>
        )}

        {collections.map((collection) => {
          const status = statusMap[collection.id];
          const isActive = expandedId === collection.id;
          const generated = fetcherData?.collectionId === collection.id ? fetcherData?.generated : null;
          const edited = editedContent[collection.id] || {};

          return (
            <Card key={collection.id}>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    {collection.imageUrl ? (
                      <Thumbnail source={collection.imageUrl} alt={collection.title} size="small" />
                    ) : (
                      <Box width="40px" minHeight="40px" background="bg-fill-secondary" borderRadius="100" />
                    )}
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">
                        {collection.title}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {collection.productsCount} product{collection.productsCount !== 1 ? "s" : ""}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    {status === "published" ? (
                      <Badge tone="success">Content Published</Badge>
                    ) : status === "draft" ? (
                      <Badge tone="info">Draft Ready</Badge>
                    ) : collection.hasOwnContent ? (
                      /* Group 4.3 — 21 of 30 sampled collections carried
                         hand-written copy naming certifications, the trade
                         counter and 25 years of trading. Offering "Generate"
                         over that, with no indication it exists, is how an app
                         deletes a merchant's best writing. */
                      <Badge tone="info">Your description</Badge>
                    ) : null}
                    {/* Group 7.4 — several EMPTY collections legitimately carry
                        hand-written copy, because the merchant wrote for ranges
                        they can order in. So zero products is a WARNING, not a
                        block: the count is already shown, and this says why it
                        matters without deciding for them. */}
                    {collection.productsCount === 0 && (
                      <Badge tone="attention">No products</Badge>
                    )}
                    <Button
                      size="slim"
                      onClick={() => handleGenerate(collection)}
                      loading={isGenerating && fetcher.formData?.get("collectionId") === collection.id}
                      disabled={isGenerating}
                    >
                      {status ? "Regenerate" : collection.hasOwnContent ? "Enhance" : "Generate"}
                    </Button>
                  </InlineStack>
                </InlineStack>

                {isActive && generated && (
                  <BlockStack gap="300">
                    <Layout>
                      <Layout.Section>
                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Generated Description
                          </Text>
                          <TextField
                            label="Collection description"
                            labelHidden
                            value={edited.description ?? generated.description ?? ""}
                            onChange={(v) => updateEdit(collection.id, "description", v)}
                            multiline={4}
                            autoComplete="off"
                          />
                        </BlockStack>
                      </Layout.Section>
                      <Layout.Section variant="oneThird">
                        <BlockStack gap="200">
                          <TextField
                            label="Meta Title"
                            value={edited.metaTitle ?? generated.metaTitle ?? ""}
                            onChange={(v) => updateEdit(collection.id, "metaTitle", v)}
                            helpText={`${(edited.metaTitle ?? generated.metaTitle ?? "").length}/60`}
                            autoComplete="off"
                          />
                          <TextField
                            label="Meta Description"
                            value={edited.metaDescription ?? generated.metaDescription ?? ""}
                            onChange={(v) => updateEdit(collection.id, "metaDescription", v)}
                            multiline={2}
                            helpText={`${(edited.metaDescription ?? generated.metaDescription ?? "").length}/155`}
                            autoComplete="off"
                          />
                        </BlockStack>
                      </Layout.Section>
                    </Layout>
                    <InlineStack align="end">
                      <Button
                        onClick={() => handlePublish(collection.id)}
                        loading={isPublishing && fetcher.formData?.get("collectionId") === collection.id}
                      >
                        Publish to Shopify
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}

                {isActive && isGenerating && fetcher.formData?.get("collectionId") === collection.id && (
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner size="small" />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Generating collection content...
                    </Text>
                  </InlineStack>
                )}

                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Voice Override
                  </Text>
                  <Button
                    variant="plain"
                    size="slim"
                    onClick={() =>
                      setVoiceOpen((prev) => ({ ...prev, [collection.id]: !prev[collection.id] }))
                    }
                  >
                    {voiceOpen[collection.id]
                      ? "Hide"
                      : voiceMap[collection.id]
                        ? "Edit Override"
                        : "Set Override"}
                  </Button>
                </InlineStack>

                {voiceOpen[collection.id] && (
                  <BlockStack gap="300">
                    <Checkbox
                      label="Use store defaults (no override)"
                      checked={!!voiceForms[collection.id]?.useDefaults}
                      onChange={(v) => updateVoiceForm(collection.id, "useDefaults", v)}
                    />
                    {!voiceForms[collection.id]?.useDefaults && (
                      <BlockStack gap="200">
                        <Select
                          label="Brand Tone"
                          options={TONE_OPTIONS}
                          value={voiceForms[collection.id]?.brandTone || ""}
                          onChange={(v) => updateVoiceForm(collection.id, "brandTone", v)}
                          helpText="Overrides the store-level tone for this collection only"
                        />
                        <TextField
                          label="Target Audience"
                          value={voiceForms[collection.id]?.targetAudience || ""}
                          onChange={(v) => updateVoiceForm(collection.id, "targetAudience", v)}
                          multiline={2}
                          placeholder="e.g., Interior designers aged 30-50 seeking luxury finishes"
                          autoComplete="off"
                        />
                        <TextField
                          label="Keywords"
                          value={voiceForms[collection.id]?.keywords || ""}
                          onChange={(v) => updateVoiceForm(collection.id, "keywords", v)}
                          placeholder="e.g., luxury bathroom vanities, designer fittings"
                          helpText="Comma-separated. Overrides store keywords for this collection."
                          autoComplete="off"
                        />
                      </BlockStack>
                    )}
                    <InlineStack align="end">
                      <Button
                        size="slim"
                        onClick={() => handleSaveVoice(collection.id)}
                        loading={
                          voiceFetcher.state !== "idle" &&
                          voiceFetcher.formData?.get("collectionId") === collection.id
                        }
                      >
                        Save Voice Override
                      </Button>
                    </InlineStack>
                    {voiceFetcher.data?.savedVoice && voiceFetcher.data?.collectionId === collection.id && (
                      <Banner tone="success" title="Voice override saved" />
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          );
        })}
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
