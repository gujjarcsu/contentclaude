import { useLoaderData, useActionData, useNavigation, useNavigate, Form } from "react-router";
import { AppSkeleton } from "../components/AppSkeleton.jsx";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  TextField,
  Select,
  Banner,
  Box,
  Spinner,
  Badge,
  ProgressBar,
} from "@shopify/polaris";
import { useState, useEffect, useRef } from "react";
import { BookOpen, FileText, CheckCircle2 } from "lucide-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { tryConsumeGeneration, getOrCreatePlan, getMonthlyUsageCount } from "../utils/plans.server.js";
import { UpgradePrompt } from "../components/UpgradePrompt";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const resumePostId = url.searchParams.get("postId");

  const [brandVoice, plan, usageCount, recentPosts] = await Promise.all([
    prisma.brandVoice.findUnique({ where: { shop } }),
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
    prisma.blogPost.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, status: true, wordCount: true, createdAt: true },
    }),
  ]);

  // If ?postId= is provided, load that draft so the component can pre-fill the editor
  let resumePost = null;
  if (resumePostId) {
    resumePost = await prisma.blogPost.findFirst({
      where: { id: resumePostId, shop },
      select: { id: true, title: true, topic: true, keywords: true, content: true, status: true },
    });
  }

  const usageRemaining = Math.max(0, plan.monthlyLimit - usageCount);

  return Response.json({
    brandVoice,
    usageRemaining,
    usageCount,
    monthlyLimit: plan.monthlyLimit,
    planName: plan.planName,
    recentPosts: recentPosts.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    resumePost,
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "generate") {
    const topic = (formData.get("topic") || "").slice(0, 500).trim();
    const keywords = (formData.get("keywords") || "").slice(0, 500).trim();
    const length = formData.get("length") || "medium";

    if (!topic) return Response.json({ error: "Topic is required." }, { status: 400 });

    // Check and consume a generation credit (contentType "blog")
    const gate = await tryConsumeGeneration(shop, "blog", null);
    if (!gate.allowed) {
      return Response.json({
        error: "You've reached your monthly generation limit. Upgrade your plan to continue.",
        limitReached: true,
      }, { status: 429 });
    }

    const [{ generateBlogPost }, { getCache }] = await Promise.all([
      import("../utils/ai.server.js"),
      import("../utils/cache.server.js"),
    ]);

    const brandVoice = await getCache(
      `bv:${shop}`,
      () => prisma.brandVoice.findUnique({ where: { shop } }),
      300
    );

    const generated = await generateBlogPost(topic, brandVoice, { keywords, length });

    // Save to BlogPost table
    const wordCount = (generated.content || "").split(/\s+/).filter(Boolean).length;
    const savedPost = await prisma.blogPost.create({
      data: {
        shop,
        title: generated.title || topic,
        content: generated.content || "",
        wordCount,
        topic,
        keywords,
        status: "draft",
      },
    });

    return Response.json({
      success: true,
      generated,
      topic,
      savedPostId: savedPost.id,
      remaining: gate.remaining,
    });
  }

  if (actionType === "publish") {
    const title = formData.get("title") || "";
    const content = formData.get("content") || "";
    const savedPostId = formData.get("savedPostId") || null;

    if (!title || !content) {
      return Response.json({ error: "Title and content are required to publish." }, { status: 400 });
    }

    // Find or create the default Shopify blog
    const blogsResponse = await admin.graphql(`
      query { blogs(first: 1) { edges { node { id title } } } }
    `);
    const { data: blogsData } = await blogsResponse.json();
    let blogId = blogsData?.blogs?.edges?.[0]?.node?.id;

    if (!blogId) {
      const createBlogResult = await admin.graphql(
        `mutation createBlog($blog: BlogCreateInput!) {
          blogCreate(blog: $blog) { blog { id } userErrors { message } }
        }`,
        { variables: { blog: { title: "News" } } }
      );
      const { data: createData } = await createBlogResult.json();
      blogId = createData?.blogCreate?.blog?.id;
    }

    if (!blogId) {
      return Response.json({ error: "Could not find or create a blog to publish to." }, { status: 500 });
    }

    const articleResult = await admin.graphql(
      `mutation createArticle($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article { id handle }
          userErrors { field message }
        }
      }`,
      { variables: { article: { blogId, title, body: content, isPublished: true } } }
    );
    const { data: articleData } = await articleResult.json();
    const errors = articleData?.articleCreate?.userErrors ?? [];
    if (errors.length > 0) {
      return Response.json({ error: errors.map((e) => e.message).join("; ") }, { status: 422 });
    }

    const shopifyArticleId = articleData?.articleCreate?.article?.id ?? null;

    // Update saved BlogPost record to "published"
    if (savedPostId) {
      await prisma.blogPost.update({
        where: { id: savedPostId },
        data: { status: "published", shopifyArticleId, title, content },
      });
    }

    return Response.json({
      success: true,
      published: true,
      handle: articleData?.articleCreate?.article?.handle,
    });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
};

const LOADING_MESSAGES = [
  "Researching the topic...",
  "Structuring the outline...",
  "Writing your blog post...",
  "Optimising for SEO...",
  "Adding your brand voice...",
];

export default function BlogPage() {
  const { brandVoice, usageRemaining, usageCount, monthlyLimit, planName, recentPosts, resumePost } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();

  const isGenerating = navigation.state === "submitting" && navigation.formData?.get("actionType") === "generate";

  const isPublishing = navigation.state === "submitting" && navigation.formData?.get("actionType") === "publish";

  const [topic, setTopic] = useState(resumePost?.topic || "");
  const [keywords, setKeywords] = useState(resumePost?.keywords || brandVoice?.targetKeywords || "");
  const [length, setLength] = useState("medium");
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  useEffect(() => {
    if (!isGenerating) { setLoadingMsgIdx(0); return; }
    const t = setInterval(() => setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length), 4000);
    return () => clearInterval(t);
  }, [isGenerating]);

  const prevActionData = useRef(null);
  useEffect(() => {
    if (actionData && actionData !== prevActionData.current) {
      prevActionData.current = actionData;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        if (actionData.published) {
          window.shopify.toast.show("Blog post published to Shopify!", { duration: 4000 });
        } else if (actionData.error && !actionData.limitReached) {
          window.shopify.toast.show(actionData.error, { duration: 5000, isError: true });
        }
      }
    }
  }, [actionData]);

  const generated = actionData?.generated;
  const [editedTitle, setEditedTitle] = useState(generated?.title || resumePost?.title || "");
  const [editedContent, setEditedContent] = useState(generated?.content || resumePost?.content || "");


  if (generated?.title && editedTitle !== generated.title && !isGenerating) {
    setEditedTitle(generated.title);
  }
  if (generated?.content && editedContent !== generated.content && !isGenerating) {
    setEditedContent(generated.content);
  }

  const usagePct = monthlyLimit > 0 ? Math.min(100, Math.round((usageCount / monthlyLimit) * 100)) : 0;
  const isOutOfUsage = usageRemaining === 0;

  const lengthOptions = [
    { label: "Short (~500 words)", value: "short" },
    { label: "Medium (~1000 words)", value: "medium" },
    { label: "Long (~2000 words)", value: "long" },
  ];


  return navigation.state === "loading" ? (
    <AppSkeleton title="Blog Generator" sections={2} layout="twoThird" />
  ) : (
    <Page
      title="Blog Post Generator"
      subtitle="Generate SEO-friendly blog posts in your brand voice"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      secondaryActions={[
        {
          content: `My Blog Posts (${recentPosts.length})`,
          onAction: () => navigate("/app/blog/posts"),
        },
      ]}
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner tone="critical"><p>{actionData.error}</p></Banner>
        )}
        {actionData?.published && (
          <Banner tone="success" title="Blog Post Published!">
            <p>Your blog post has been published to your Shopify store.</p>
          </Banner>
        )}
        {actionData?.success && !actionData?.published && (
          <Banner tone="success" title="Blog post generated!">
            <p>
              Saved as a draft. Review and edit below, then publish when ready.
              {actionData.remaining !== undefined && ` · ${actionData.remaining} generations remaining this month.`}
            </p>
          </Banner>
        )}

        <Layout>
          {/* Left panel — controls */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Generate a Blog Post</Text>
                    <BookOpen aria-hidden="true" size={18} color="#1656AC" />
                  </InlineStack>

                  {isOutOfUsage ? (
                    <UpgradePrompt
                      tone="warning"
                      title="Monthly limit reached"
                      message="Upgrade your plan to generate more blog posts"
                      onUpgrade={() => navigate("/app/plans")}
                    />
                  ) : (
                    <Form method="post">
                      <input type="hidden" name="actionType" value="generate" />
                      <BlockStack gap="300">
                        <TextField
                          name="topic"
                          label="Blog Topic"
                          value={topic}
                          onChange={setTopic}
                          placeholder="e.g., The benefits of Vitamin C for recovery"
                          helpText="Be specific — a focused topic generates better content"
                          autoComplete="off"
                        />
                        <TextField
                          name="keywords"
                          label="Target Keywords"
                          value={keywords}
                          onChange={setKeywords}
                          placeholder="e.g., skincare, beauty, wellness"
                          helpText="Keywords to weave naturally into the post"
                          autoComplete="off"
                        />
                        <Select
                          name="length"
                          label="Post Length"
                          options={lengthOptions}
                          value={length}
                          onChange={setLength}
                        />

                        {/* Animated progress during generation */}
                        {isGenerating && (
                          <Box padding="300" background="bg-surface-info" borderRadius="200">
                            <BlockStack gap="200">
                              <InlineStack gap="200" blockAlign="center">
                                <Spinner size="small" />
                                <Text as="p" variant="bodySm" fontWeight="semibold">
                                  {LOADING_MESSAGES[loadingMsgIdx]}
                                </Text>
                              </InlineStack>
                              <ProgressBar
                                progress={((loadingMsgIdx + 1) / LOADING_MESSAGES.length) * 80}
                                tone="highlight"
                                size="small"
                                animated
                              />
                              <Text as="p" variant="bodySm" tone="subdued">
                                Takes 20–40 seconds
                              </Text>
                            </BlockStack>
                          </Box>
                        )}

                        <Button
                          variant="primary"
                          submit
                          loading={isGenerating}
                          disabled={!topic.trim() || isGenerating}
                          fullWidth
                        >
                          {isGenerating ? "Generating..." : "Generate Blog Post"}
                        </Button>

                        {actionData?.limitReached && (
                          <UpgradePrompt
                            tone="warning"
                            title="Monthly limit reached"
                            message="Upgrade your plan to generate more content"
                            onUpgrade={() => navigate("/app/plans")}
                          />
                        )}
                      </BlockStack>
                    </Form>
                  )}
                </BlockStack>
              </Card>

              {/* Usage mini-bar */}
              {(planName === "free" || usagePct >= 50) && (
                <Card>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" fontWeight="semibold">Monthly Generations</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{usageCount}/{monthlyLimit}</Text>
                    </InlineStack>
                    <ProgressBar
                      progress={usagePct}
                      tone={usagePct >= 90 ? "critical" : usagePct >= 60 ? "highlight" : "success"}
                      size="small"
                    />
                  </BlockStack>
                </Card>
              )}

              {/* Recent blog posts */}
              {recentPosts.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">Recent Posts</Text>
                      <Button size="slim" variant="plain" onClick={() => navigate("/app/blog/posts")}>
                        View all →
                      </Button>
                    </InlineStack>
                    {recentPosts.map((post) => (
                      <Box
                        key={post.id}
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="100"
                        onClick={() => navigate(`/app/blog?postId=${post.id}`)}
                        style={{ cursor: "pointer" }}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text as="p" variant="bodySm" fontWeight="semibold" truncate>
                              {post.title || "(untitled)"}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {post.wordCount} words
                            </Text>
                          </BlockStack>
                          <Badge tone={post.status === "published" ? "success" : "info"}>
                            {post.status === "published" ? "Published" : "Draft"}
                          </Badge>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>

          {/* Right panel — output */}
          <Layout.Section>
            {isGenerating && (
              <Card>
                <Box padding="600">
                  <InlineStack align="center" gap="300">
                    <Spinner size="large" />
                    <Text as="p" variant="bodyLg">{LOADING_MESSAGES[loadingMsgIdx]}</Text>
                  </InlineStack>
                </Box>
              </Card>
            )}

            {!generated && !resumePost && !isGenerating && (
              <>
                <Card>
                  <Box padding="800">
                    <BlockStack gap="300" inlineAlign="center">
                      <FileText aria-hidden="true" size={40} color="#8C9196" />
                      <Text as="p" variant="headingMd" alignment="center" tone="subdued">
                        No blog post yet
                      </Text>
                      <Text as="p" variant="bodySm" alignment="center" tone="subdued">
                        Enter a topic on the left and click Generate Blog Post to create SEO-friendly content in your brand voice.
                      </Text>
                    </BlockStack>
                  </Box>
                </Card>
                <Box paddingBlockStart="400">
                  <Card>
                    <Box padding="600">
                      <BlockStack gap="300" inlineAlign="center">
                        <Text as="h2" variant="headingMd" alignment="center">Start driving organic traffic ✏️</Text>
                        <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                          Write your first AI-powered blog post in under 60 seconds.
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                          Blog posts are written in your brand voice and optimised for the keywords in your Settings.
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>
                </Box>
              </>
            )}

            {(generated || resumePost) && !isGenerating && (
              <BlockStack gap="400">
                {/* Success / resume indicator */}
                <Box padding="300" background="bg-surface-success" borderRadius="200">
                  <InlineStack gap="200" blockAlign="center">
                    <CheckCircle2 aria-hidden="true" size={18} color="#00A047" />
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {generated
                        ? "Blog post generated and saved as draft — review and edit below"
                        : `Editing draft: ${resumePost?.title || resumePost?.topic || "Untitled"}`}
                    </Text>
                  </InlineStack>
                </Box>

                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">{generated ? "Generated Blog Post" : "Edit Draft"}</Text>
                    <TextField
                      label="Title"
                      value={editedTitle}
                      onChange={setEditedTitle}
                      autoComplete="off"
                    />
                    <TextField
                      label="Content (HTML)"
                      value={editedContent}
                      onChange={setEditedContent}
                      multiline={16}
                      helpText="Edit the HTML content before publishing"
                      autoComplete="off"
                    />
                  </BlockStack>
                </Card>

                {editedContent && (
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h2" variant="headingMd">Preview</Text>
                      <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                        <div dangerouslySetInnerHTML={{ __html: editedContent }} />
                      </Box>
                    </BlockStack>
                  </Card>
                )}

                <Card>
                  <Form method="post">
                    <input type="hidden" name="actionType" value="publish" />
                    <input type="hidden" name="title" value={editedTitle} />
                    <input type="hidden" name="content" value={editedContent} />
                    <input type="hidden" name="savedPostId" value={actionData?.savedPostId || resumePost?.id || ""} />
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        This will publish the post directly to your Shopify blog.
                      </Text>
                      <Button
                        variant="primary"
                        size="large"
                        submit
                        loading={isPublishing}
                        disabled={isPublishing || !editedTitle || !editedContent}
                        fullWidth
                      >
                        {isPublishing ? "Publishing..." : "Publish to Shopify Blog"}
                      </Button>
                    </BlockStack>
                  </Form>
                </Card>
              </BlockStack>
            )}
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError";
