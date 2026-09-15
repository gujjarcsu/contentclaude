import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useT } from "../i18n/react.jsx";
import { tForRequest } from "../i18n/index.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Box,
  Badge,
  EmptyState,
  Divider,
  Icon,
} from "@shopify/polaris";
import { BlogIcon, EditIcon, GlobeIcon, ClockIcon, TextIcon, DeleteIcon } from "@shopify/polaris-icons";
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

function timeAgo(isoString) {
  const secs = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function PostCard({ post, onView }) {
  const t = useT();
  const fetcher = useFetcher();
  const isDraft = post.status === "draft";
  const isDeleting = fetcher.state !== "idle";

  return (
    <Box padding="400" background="bg-surface" borderRadius="200" borderWidth="025" borderColor="border">
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
          <InlineStack gap="300" blockAlign="start" wrap={false}>
            <Box
              padding="200"
              background={isDraft ? "bg-surface-secondary" : "bg-surface-success-subdued"}
              borderRadius="200"
            >
              {isDraft ? (
                <Icon source={EditIcon} tone="subdued" />
              ) : (
                <Icon source={GlobeIcon} tone="success" />
              )}
            </Box>
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {post.title || post.topic || "Untitled Post"}
              </Text>
              <InlineStack gap="300" blockAlign="center">
                {post.topic && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Topic: {topic}", { topic: post.topic })}
                  </Text>
                )}
                {post.wordCount > 0 && (
                  <InlineStack gap="100" blockAlign="center">
                    <Icon source={TextIcon} tone="subdued" />
                    <Text as="p" variant="bodySm" tone="subdued">
                      {post.wordCount.toLocaleString()} words
                    </Text>
                  </InlineStack>
                )}
                <InlineStack gap="100" blockAlign="center">
                  <Icon source={ClockIcon} tone="subdued" />
                  <Text as="p" variant="bodySm" tone="subdued">
                    {timeAgo(post.updatedAt)}
                  </Text>
                </InlineStack>
              </InlineStack>
              {post.keywords && (
                <InlineStack gap="100" wrap>
                  {post.keywords
                    .split(",")
                    .slice(0, 4)
                    .map((kw) => (
                      <Box
                        key={kw}
                        padding="050"
                        paddingInlineStart="150"
                        paddingInlineEnd="150"
                        background="bg-surface-secondary"
                        borderRadius="full"
                      >
                        <Text as="span" variant="bodySm" tone="subdued">
                          {kw.trim()}
                        </Text>
                      </Box>
                    ))}
                </InlineStack>
              )}
            </BlockStack>
          </InlineStack>
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={isDraft ? "info" : "success"}>{isDraft ? t("Draft") : t("Published")}</Badge>
            <Button size="slim" onClick={() => onView(post)}>
              {isDraft ? t("Edit / Publish") : t("View")}
            </Button>
            <fetcher.Form method="post">
              <input type="hidden" name="actionType" value="deletePost" />
              <input type="hidden" name="postId" value={post.id} />
              <Button
                size="slim"
                tone="critical"
                variant="plain"
                icon={DeleteIcon}
                loading={isDeleting}
                submit
                accessibilityLabel={t("Delete post")}
              />
            </fetcher.Form>
          </InlineStack>
        </InlineStack>
        {fetcher.data?.error && (
          <Text as="p" variant="bodySm" tone="critical">
            {fetcher.data.error}
          </Text>
        )}
      </BlockStack>
    </Box>
  );
}

export default function BlogPosts() {
  const t = useT();
  const { posts } = useLoaderData();
  const navigate = useNavigate();

  const published = posts.filter((p) => p.status === "published");

  const loadingThisRoute = useRouteLoading();
  if (loadingThisRoute) {
    return <AppSkeleton title={t("Blog Posts")} sections={2} layout="twoThird" />;
  }
  const drafts = posts.filter((p) => p.status === "draft");

  const handleView = (post) => {
    navigate(`/app/blog?postId=${post.id}`);
  };

  return (
    <Page
      title={t("Blog Posts")}
      subtitle={t("{n, plural, one {# post} other {# posts}} generated", { n: posts.length })}
      primaryAction={{
        content: t("Write New Post"),
        onAction: () => navigate("/app/blog"),
      }}
      backAction={{ content: t("Blog"), onAction: () => navigate("/app/blog") }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {posts.length === 0 ? (
              <Card>
                <EmptyState
                  heading={t("No blog posts yet")}
                  action={{ content: t("Write Your First Post"), onAction: () => navigate("/app/blog") }}
                  image="/empty-blog.svg"
                >
                  <p>{t("Generate SEO-optimized blog posts in your brand voice in under 60 seconds.")}</p>
                </EmptyState>
              </Card>
            ) : (
              <>
                {drafts.length > 0 && (
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={EditIcon} tone="subdued" />
                        <Text as="h2" variant="headingMd">
                          {t("Drafts")}
                        </Text>
                        <Badge tone="info">{drafts.length}</Badge>
                      </InlineStack>
                      <BlockStack gap="200">
                        {drafts.map((post) => (
                          <PostCard key={post.id} post={post} onView={handleView} />
                        ))}
                      </BlockStack>
                    </BlockStack>
                  </Card>
                )}

                {published.length > 0 && (
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={GlobeIcon} tone="success" />
                        <Text as="h2" variant="headingMd">
                          {t("Published")}
                        </Text>
                        <Badge tone="success">{published.length}</Badge>
                      </InlineStack>
                      <BlockStack gap="200">
                        {published.map((post) => (
                          <PostCard key={post.id} post={post} onView={handleView} />
                        ))}
                      </BlockStack>
                    </BlockStack>
                  </Card>
                )}
              </>
            )}
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={BlogIcon} tone="info" />
                  <Text as="h2" variant="headingMd">
                    {t("Blog Stats")}
                  </Text>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {t("Total posts")}
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {posts.length}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {t("Published")}
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="semibold" tone="success">
                    {published.length}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {t("Drafts")}
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {drafts.length}
                  </Text>
                </InlineStack>
                {posts.length > 0 && (
                  <>
                    <Divider />
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        {t("Total words")}
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {posts.reduce((sum, p) => sum + p.wordCount, 0).toLocaleString()}
                      </Text>
                    </InlineStack>
                  </>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  {t("Tips")}
                </Text>
                <Divider />
                <BlockStack gap="200">
                  {[
                    t("Publish drafts to your Shopify blog to drive organic traffic."),
                    t("Add 3–5 keywords per post for better SEO targeting."),
                    t("Longer posts give the model more to work with."),
                    t("Publish drafts to your Shopify blog when you are happy with them."),
                  ].map((tip) => (
                    <InlineStack key={tip} gap="200" blockAlign="start">
                      <Text as="span" variant="bodySm" tone="success">
                        ✓
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {tip}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
