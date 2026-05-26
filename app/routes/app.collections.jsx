import { useLoaderData, useActionData, useNavigation, useNavigate, useFetcher } from "react-router";
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
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const response = await admin.graphql(`
    query {
      collections(first: 50, sortKey: TITLE) {
        edges {
          node {
            id title description
            seo { title description }
            image { url altText }
            productsCount { count }
          }
        }
      }
    }
  `);
  const { data } = await response.json();
  const collections = (data?.collections?.edges ?? []).map(({ node }) => ({
    id: node.id,
    title: node.title,
    description: node.description || "",
    seoTitle: node.seo?.title || "",
    seoDescription: node.seo?.description || "",
    imageUrl: node.image?.url || "",
    productsCount: node.productsCount?.count ?? 0,
  }));

  // Cross-reference with generated content
  const generated = await prisma.generatedContent.findMany({
    where: { shop, contentType: "description", productId: { in: collections.map((c) => c.id) } },
    select: { productId: true, status: true },
  });
  const statusMap = {};
  generated.forEach(({ productId, status }) => { statusMap[productId] = status; });

  return Response.json({ collections, statusMap });
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

    const [{ generateCollectionDescription }, { getCache }] = await Promise.all([
      import("../utils/ai.server.js"),
      import("../utils/cache.server.js"),
    ]);

    const brandVoice = await getCache(
      `bv:${shop}`,
      () => prisma.brandVoice.findUnique({ where: { shop } }),
      300
    );

    const generated = await generateCollectionDescription(
      { id: collectionId, title: collectionTitle, description: collectionDescription, productsCount },
      brandVoice
    );

    // Save to DB
    await Promise.all(
      Object.entries(generated)
        .filter(([, val]) => val)
        .map(([type, val]) =>
          prisma.generatedContent.upsert({
            where: { shop_productId_contentType: { shop, productId: collectionId, contentType: type } },
            update: { generatedContent: val, status: "draft", version: { increment: 1 } },
            create: { shop, productId: collectionId, productTitle: collectionTitle, contentType: type, originalContent: "", generatedContent: val, status: "draft" },
          })
        )
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
      { variables: { input } }
    );
    const { data } = await result.json();
    const errors = data?.collectionUpdate?.userErrors ?? [];
    if (errors.length > 0) {
      return Response.json({ error: errors.map((e) => e.message).join("; ") }, { status: 422 });
    }

    const publishedTypes = [];
    if (description) publishedTypes.push("description");
    if (metaTitle) publishedTypes.push("metaTitle");
    if (metaDescription) publishedTypes.push("metaDescription");
    if (publishedTypes.length > 0) {
      await prisma.generatedContent.updateMany({
        where: { shop, productId: collectionId, contentType: { in: publishedTypes }, status: "draft" },
        data: { status: "published" },
      });
    }

    return Response.json({ success: true, published: true, collectionId });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function CollectionsPage() {
  const { collections, statusMap } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [expandedId, setExpandedId] = useState(null);
  const [editedContent, setEditedContent] = useState({});

  const isGenerating = fetcher.state !== "idle" && fetcher.formData?.get("actionType") === "generate";
  const isPublishing = fetcher.state !== "idle" && fetcher.formData?.get("actionType") === "publish";
  const fetcherData = fetcher.data;

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
    [fetcher]
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
    [fetcher, editedContent, fetcherData]
  );

  const updateEdit = (collectionId, field, value) => {
    setEditedContent((prev) => ({
      ...prev,
      [collectionId]: { ...(prev[collectionId] || {}), [field]: value },
    }));
  };

  if (collections.length === 0) {
    return (
      <Page
        title="Collections"
        backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      >
        <EmptyState
          heading="No collections found"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>Create collections in your Shopify admin, then come back to generate descriptions.</p>
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page
      title="Collections"
      subtitle={`${collections.length} collection${collections.length !== 1 ? "s" : ""} · generate SEO descriptions for each`}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="400">
        {fetcherData?.error && (
          <Banner tone="critical"><p>{fetcherData.error}</p></Banner>
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
                      <Text as="h3" variant="headingMd">{collection.title}</Text>
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
                    ) : null}
                    <Button
                      size="slim"
                      onClick={() => handleGenerate(collection)}
                      loading={isGenerating && fetcher.formData?.get("collectionId") === collection.id}
                    >
                      {status ? "Regenerate" : "Generate"}
                    </Button>
                  </InlineStack>
                </InlineStack>

                {isActive && generated && (
                  <BlockStack gap="300">
                    <Layout>
                      <Layout.Section>
                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">Generated Description</Text>
                          <TextField
                            label=""
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
                        variant="primary"
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
                    <Text as="p" variant="bodySm" tone="subdued">Generating collection content…</Text>
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          );
        })}
      </BlockStack>
    </Page>
  );
}
