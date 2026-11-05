import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useT } from "../i18n/react.jsx";
import { tForRequest } from "../i18n/index.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Button,
  Box,
  Badge,
  Banner,
  IndexTable,
  Modal,
  Tabs,
  Tag,
} from "@shopify/polaris";
import { useState } from "react";
import { BlogIcon, EditIcon, GlobeIcon, DeleteIcon } from "@shopify/polaris-icons";
import { IconTile, MetricCard } from "../components/Kit.jsx";
import { BlogTabs, BlogEmpty } from "../components/BlogParts.jsx";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const posts = await prisma.blogPost.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      topic: true,
      keywords: true,
      wordCount: true,
      status: true,
      shopifyArticleId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return Response.json({
    posts: posts.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
};

export const action = async ({ request }) => {
  const t = tForRequest(request);
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "deletePost") {
    const id = formData.get("postId");
    if (!id) return Response.json({ error: t("Missing postId.") }, { status: 400 });
    await prisma.blogPost.deleteMany({ where: { id, shop } });
    return Response.json({ success: true });
  }

  return Response.json({ error: t("Unknown action.") }, { status: 400 });
};

/** "3d ago" in the merchant's language (the same keys Home's activity uses). */
function timeAgo(isoString, t) {
  const secs = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (secs < 60) return t("just now");
  if (secs < 3600) return t("{n}m ago", { n: Math.floor(secs / 60) });
  if (secs < 86400) return t("{n}h ago", { n: Math.floor(secs / 3600) });
  return t("{n}d ago", { n: Math.floor(secs / 86400) });
}

/** One post as a table row: title and topic, status chip, words, last change, actions. */
function PostRow({ post, index, onView, onDelete, deleting }) {
  const t = useT();
  const isDraft = post.status === "draft";
  const keywords = (post.keywords || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 3);
  return (
    <IndexTable.Row id={post.id} position={index}>
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <IconTile icon={isDraft ? EditIcon : GlobeIcon} tone={isDraft ? "neutral" : "success"} size="md" />
          <BlockStack gap="050">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {post.title || post.topic || t("Untitled")}
            </Text>
            {post.topic && post.title ? (
              <Text as="span" variant="bodySm" tone="subdued">
                {t("Topic: {topic}", { topic: post.topic })}
              </Text>
            ) : null}
            {keywords.length > 0 ? (
              <InlineStack gap="100" wrap>
                {keywords.map((kw) => (
                  <Tag key={kw}>{kw}</Tag>
                ))}
              </InlineStack>
            ) : null}
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={isDraft ? undefined : "success"}>{isDraft ? t("Draft") : t("Published")}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" numeric>
          {post.wordCount > 0 ? t("{wordCount} words", { wordCount: t.number(post.wordCount) }) : "–"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone="subdued">
          {timeAgo(post.updatedAt, t)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" align="end" wrap={false}>
          <Button size="slim" onClick={() => onView(post)}>
            {isDraft ? t("Edit / Publish") : t("View")}
          </Button>
          <Button size="slim" tone="critical" variant="plain" icon={DeleteIcon} loading={deleting} onClick={() => onDelete(post)} accessibilityLabel={t("Delete post")} />
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  );
}

export default function BlogPosts() {
  const t = useT();
  const { posts } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [tab, setTab] = useState(0);
  const [confirming, setConfirming] = useState(null);

  const loadingThisRoute = useRouteLoading();
  if (loadingThisRoute) {
    return <AppSkeleton title={t("Blog posts")} sections={2} layout="full" />;
  }

  const published = posts.filter((p) => p.status === "published");
  const drafts = posts.filter((p) => p.status === "draft");
  const views = [
    { id: "all", content: t("All"), badge: t.number(posts.length), rows: posts },
    { id: "drafts", content: t("Drafts"), badge: t.number(drafts.length), rows: drafts },
    { id: "published", content: t("Published"), badge: t.number(published.length), rows: published },
  ];
  const rows = views[tab].rows;
  const deletingId = fetcher.state !== "idle" ? fetcher.formData?.get("postId") : null;

  const handleView = (post) => navigate(`/app/blog?postId=${post.id}`);
  const doDelete = () => {
    if (!confirming) return;
    fetcher.submit({ actionType: "deletePost", postId: confirming.id }, { method: "post" });
    setConfirming(null);
  };

  return (
    <Page
      title={t("Blog posts")}
      subtitle={t("{n, plural, one {# post} other {# posts}} generated", { n: posts.length })}
      primaryAction={{ content: t("Write a post"), onAction: () => navigate("/app/blog") }}
      backAction={{ content: t("Blog"), onAction: () => navigate("/app/blog") }}
    >
      <BlockStack gap="500">
        <BlogTabs selected="posts" postCount={posts.length} navigate={navigate} />

        {fetcher.data?.error ? (
          <Banner tone="critical">
            <p>{fetcher.data.error}</p>
          </Banner>
        ) : null}

        {posts.length === 0 ? (
          <BlogEmpty
            heading={t("No blog posts yet")}
            body={t("Posts are written in your brand voice and saved as drafts. Nothing is published until you publish it.")}
            actionLabel={t("Write your first post")}
            onAction={() => navigate("/app/blog")}
          />
        ) : (
          <>
            {/* Counts straight from the saved posts, each with its scope. */}
            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
              <MetricCard icon={BlogIcon} label={t("Posts")} value={t.number(posts.length)} scope={t("Saved in Navaal")} />
              <MetricCard icon={GlobeIcon} tone="success" label={t("Published")} value={t.number(published.length)} scope={t("On your Shopify blog")} />
              <MetricCard icon={EditIcon} tone="neutral" label={t("Drafts")} value={t.number(drafts.length)} scope={t("Waiting for you")} />
            </InlineGrid>

            <Card padding="0">
              <Tabs tabs={views.map(({ id, content, badge }) => ({ id, content, badge, panelID: `posts-${id}` }))} selected={tab} onSelect={setTab} />
              {rows.length === 0 ? (
                <Box padding="400">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {tab === 1 ? t("No drafts. Every post you wrote is published.") : t("Nothing published yet. Open a draft to publish it.")}
                  </Text>
                </Box>
              ) : (
                <IndexTable
                  resourceName={{ singular: t("post"), plural: t("posts") }}
                  itemCount={rows.length}
                  selectable={false}
                  headings={[
                    { id: "post", title: t("Post") },
                    { id: "status", title: t("Status") },
                    { id: "words", title: t("Length") },
                    { id: "updated", title: t("Updated") },
                    { id: "actions", title: t("Actions"), hidden: true },
                  ]}
                >
                  {rows.map((post, i) => (
                    <PostRow key={post.id} post={post} index={i} onView={handleView} onDelete={setConfirming} deleting={deletingId === post.id} />
                  ))}
                </IndexTable>
              )}
            </Card>
          </>
        )}
      </BlockStack>

      {/* Deleting removes the saved post from Navaal; it never touched the
          Shopify blog, and it asks first because it cannot be undone. */}
      <Modal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={t("Delete this post?")}
        primaryAction={{ content: t("Delete post"), destructive: true, onAction: doDelete }}
        secondaryActions={[{ content: t("Cancel"), onAction: () => setConfirming(null) }]}
      >
        <Modal.Section>
          <Text as="p" variant="bodyMd">
            {t("{title} is removed from Navaal. A copy already published to your Shopify blog stays there.", { title: confirming?.title || confirming?.topic || t("Untitled") })}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
