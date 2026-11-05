import { useLoaderData, useActionData, useNavigation, useNavigate, Form } from "react-router";
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
  TextField,
  Select,
  Banner,
  Box,
  Spinner,
  Badge,
  ProgressBar,
  Checkbox,
  ButtonGroup,
  Collapsible,
  Divider,
  Link,
  InlineGrid,
} from "@shopify/polaris";
import { useState, useEffect, useRef } from "react";
import { ChevronDownIcon, ChevronUpIcon, BlogIcon, GlobeIcon, EditIcon } from "@shopify/polaris-icons";
import { AiButton, IconTile, LockedPreview } from "../components/Kit.jsx";
import { IlluBlog } from "../components/Illustrations.jsx";
import { BlogTabs, BlogEmpty } from "../components/BlogParts.jsx";
import { authenticate } from "../shopify.server.js";
import { getLiveShopName } from "../utils/shopName.server.js";
import { authorName as resolveAuthorName } from "../utils/shopName.js";
import prisma from "../db.server.js";
import { withGenerationCredit, getOrCreatePlan, getMonthlyUsageCount, checkEntitlement } from "../utils/plans.server.js";
import { blogRefusal, cheapestPlanWith, cheapestPlanLabelWith } from "../utils/billing-plans.js";
import { formatPrice } from "../utils/billing-config.js";
import { CREDIT_WEIGHTS } from "../utils/credits.js";
import { quotaPct } from "../utils/quota.js";
import { QuotaReachedCard } from "../components/UpgradePrompt.jsx";
import { getUpsell } from "../utils/upgradePrompts.server.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";

import blogPreviewStyles from "../blog-preview.css?url";

export const links = () => [{ rel: "stylesheet", href: blogPreviewStyles }];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const resumePostId = url.searchParams.get("postId");

  const [brandVoice, plan, usageCount, recentPosts, blogEnt, postCount] = await Promise.all([
    prisma.brandVoice.findUnique({ where: { shop } }),
    getOrCreatePlan(shop),
    getMonthlyUsageCount(shop),
    prisma.blogPost.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, status: true, wordCount: true, createdAt: true },
    }),
    // Phase 15 — blog is a Growth feature in the locked table and was ungated
    // in the code. The loader carries the answer so the screen can say so
    // BEFORE a merchant types a topic, rather than after they press the button.
    checkEntitlement(shop, "blogPosts"),
    // Redesign v2 — the Posts tab carries every saved post, not the five
    // recent ones (the old "Posts (5)" read 5 on a store with twelve).
    prisma.blogPost.count({ where: { shop } }),
  ]);

  // If ?postId= is provided, load that draft so the component can pre-fill the editor
  let resumePost = null;
  if (resumePostId) {
    resumePost = await prisma.blogPost.findFirst({
      where: { id: resumePostId, shop },
      select: { id: true, title: true, topic: true, keywords: true, content: true, status: true },
    });
  }

  const usageRemaining = Math.max(0, plan.monthlyCredits - usageCount);

  // Phase 3 item 3.4 — null unless the quota is exhausted, in which case the
  // blog generate form is replaced by a card. Never throws.
  // n: 0 deliberately — "N products still need content" is not a true or
  // relevant claim on the blog screen, so this resolves to a neutral card
  // that states the quota and the reset date and sells nothing.
  const upsell = await getUpsell({ shop, plan, usageCount, surface: "blog", n: 0 });

  return Response.json({
    brandVoice,
    usageRemaining,
    usageCount,
    upsell,
    monthlyCredits: plan.monthlyCredits,
    planName: plan.planName,
    // A loader ships data, never a sentence: the screen builds the words.
    blogEntitled: !!blogEnt.allowed,
    blogCredits: CREDIT_WEIGHTS.blog,
    postCount,
    recentPosts: recentPosts.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    resumePost,
  });
};

export const action = async ({ request }) => {
  const t = tForRequest(request);
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "generate") {
    const topic = (formData.get("topic") || "").slice(0, 500).trim();
    const keywords = (formData.get("keywords") || "").slice(0, 500).trim();
    const length = formData.get("length") || "medium";
    const instructions = (formData.get("instructions") || "").slice(0, 1000).trim();

    if (!topic) return Response.json({ error: t("Topic is required.") }, { status: 400 });

    // Phase 15 — THE PLAN GATE, and it is here rather than only in the UI.
    // 14-PRICING.md §4 sells blog posts from Growth at 3 credits each and the
    // plans page repeats it; the code had no blogPosts entitlement at all, so
    // any shop could generate one and was charged 3 credits without ever being
    // told the price. The screen now says both before the button, and this
    // refuses the submit for anything that reaches the action anyway.
    const blogEnt = await checkEntitlement(shop, "blogPosts");
    if (!blogEnt.allowed) {
      return Response.json({ error: blogRefusal(CREDIT_WEIGHTS.blog), limitReached: true }, { status: 403 });
    }

    // Phase 0 item 24 — blog generation is the most expensive single call in the
    // app and had no rate limit at all; the same 10/minute ceiling as every
    // other generation now applies.
    const { checkRateLimit } = await import("../utils/rateLimit.server.js");
    const rl = await checkRateLimit(shop, { maxPerMinute: 10 });
    if (!rl.allowed) {
      return Response.json(
        { error: t("You're generating too fast. Please wait a moment before trying again.") },
        { status: 429 },
      );
    }

    // Phase 0 item 5 — take the credit, but give it back if the post never
    // arrives. A 45 s timeout or an open circuit breaker used to cost the
    // merchant a generation and produce nothing at all.
    let outcome;
    try {
      outcome = await withGenerationCredit(
        shop,
        { contentType: "blog", productId: null },
        async () => {
          const [{ generateBlogPost }, { getCache }] = await Promise.all([
            import("../utils/ai.server.js"),
            import("../utils/cache.server.js"),
          ]);
          const brandVoice = await getCache(
            `bv:${shop}`,
            () => prisma.brandVoice.findUnique({ where: { shop } }),
            300,
          );
          return generateBlogPost(topic, brandVoice, { keywords, length, instructions });
        },
        { isEmpty: (r) => !r?.content?.trim() },
      );
    } catch (err) {
      return Response.json(
        { error: t("We couldn't write this post: {message}. No credit was used.", { message: err.message }) },
        { status: 502 },
      );
    }

    if (!outcome.allowed) {
      return Response.json(
        {
          error: t("You've used all your credits for this month. Upgrade your plan to continue."),
          limitReached: true,
        },
        { status: 429 },
      );
    }
    if (outcome.refunded) {
      return Response.json(
        { error: t("The AI returned an empty post. Please retry — no credit was used.") },
        { status: 502 },
      );
    }
    const gate = outcome.gate;
    const generated = outcome.result;

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
      return Response.json({ error: t("Title and content are required to publish.") }, { status: 400 });
    }

    // Publishing the same post twice must UPDATE the existing Shopify
    // article, not create a duplicate. The saved post carries the article id
    // from the first publish.
    const existingPost = savedPostId
      ? await prisma.blogPost.findFirst({
          where: { id: savedPostId, shop },
          select: { shopifyArticleId: true },
        })
      : null;
    if (existingPost?.shopifyArticleId) {
      const { readMutationResult } = await import("../utils/adminGraphql.server.js");
      const updateResult = await admin.graphql(
        `mutation updateArticle($id: ID!, $article: ArticleUpdateInput!) {
          articleUpdate(id: $id, article: $article) {
            article { id handle }
            userErrors { field message }
          }
        }`,
        { variables: { id: existingPost.shopifyArticleId, article: { title, body: content } } },
      );
      const updated = await readMutationResult(updateResult, "articleUpdate");
      if (!updated.ok) {
        return Response.json(
          { error: t("Could not update the published article: {v}", { v: updated.errorMessages.join(";") }) },
          { status: 422 },
        );
      }
      await prisma.blogPost.updateMany({
        where: { id: savedPostId, shop },
        data: { status: "published", title, content },
      });
      return Response.json({
        success: true,
        published: true,
        updatedExisting: true,
        handle: updated.payload?.article?.handle,
      });
    }

    // ArticleCreateInput requires a non-null author — use the merchant's brand/
    // store name when set, else a name derived from the shop. (Missing author was
    // causing a hard GraphQL error and a 500 on publish.)
    // The fallback used to be the shop handle, so a store whose name was
    // unreadable at install published every article authored "navaal-ttv-03" —
    // on the merchant's own storefront, permanently. Authorship is a branding
    // decision, so a name the merchant typed into Settings still wins; the live
    // shop name is the fallback and the handle is the last resort, kept because
    // ArticleCreateInput.author is non-null and a missing author was a 500.
    const authorVoice = await prisma.brandVoice.findUnique({ where: { shop }, select: { storeName: true } });
    const liveShopName = await getLiveShopName(admin, shop);
    const authorName = resolveAuthorName(liveShopName, authorVoice?.storeName, shop);

    // Find or create the default Shopify blog
    const blogsResponse = await admin.graphql(`
      query { blogs(first: 1) { edges { node { id title } } } }
    `);
    const { data: blogsData } = await blogsResponse.json();
    let blogId = blogsData?.blogs?.edges?.[0]?.node?.id;

    const { readMutationResult: readResult } = await import("../utils/adminGraphql.server.js");

    if (!blogId) {
      const createBlogResult = await admin.graphql(
        `mutation createBlog($blog: BlogCreateInput!) {
          blogCreate(blog: $blog) { blog { id } userErrors { message } }
        }`,
        { variables: { blog: { title: t("News") } } },
      );
      const created = await readResult(createBlogResult, "blogCreate");
      blogId = created.payload?.blog?.id;
      if (!blogId) {
        // Surface the specific reason instead of a generic 500.
        const reason = created.errorMessages.length > 0 ? ` (${created.errorMessages.join(";")})` : "";
        return Response.json(
          { error: t("Could not find or create a blog to publish to{reason}.", { reason }) },
          { status: 500 },
        );
      }
    }

    const articleResult = await admin.graphql(
      `mutation createArticle($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article { id handle }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          article: { blogId, title, body: content, isPublished: true, author: { name: authorName } },
        },
      },
    );
    const createdArticle = await readResult(articleResult, "articleCreate");
    if (!createdArticle.ok) {
      return Response.json({ error: createdArticle.errorMessages.join(";") }, { status: 422 });
    }

    const articleData = { articleCreate: createdArticle.payload };
    const shopifyArticleId = articleData?.articleCreate?.article?.id ?? null;

    // Update saved BlogPost record to "published" — scope to shop so one tenant
    // can never publish/overwrite another tenant's post by guessing an id.
    if (savedPostId) {
      const updated = await prisma.blogPost.updateMany({
        where: { id: savedPostId, shop },
        data: { status: "published", shopifyArticleId, title, content },
      });
      if (updated.count === 0) {
        return Response.json({ error: t("Post not found.") }, { status: 404 });
      }
    }

    return Response.json({
      success: true,
      published: true,
      handle: articleData?.articleCreate?.article?.handle,
    });
  }

  return Response.json({ error: t("Unknown action.") }, { status: 400 });
};

export default function BlogPage() {
  const t = useT();
  const { brandVoice, usageRemaining, usageCount, monthlyCredits, planName, recentPosts, resumePost, upsell, blogEntitled, blogCredits, postCount } =
    useLoaderData();
  // Phase 15 — the plan and the price this screen names are DERIVED from the
  // same table the plans page reads, never typed here. A marker naming a plan
  // the table does not sell blog on is the defect this is fixing.
  const blogPlan = cheapestPlanWith("blogPosts");
  const blogPlanLabel = cheapestPlanLabelWith("blogPosts");
  const actionData = useActionData();
  const navigation = useNavigation();
  const loadingThisRoute = useRouteLoading();
  const navigate = useNavigate();

  const isGenerating =
    navigation.state === "submitting" && navigation.formData?.get("actionType") === "generate";

  const isPublishing =
    navigation.state === "submitting" && navigation.formData?.get("actionType") === "publish";

  const [topic, setTopic] = useState(resumePost?.topic || "");
  const [keywords, setKeywords] = useState(resumePost?.keywords || brandVoice?.targetKeywords || "");
  const [length, setLength] = useState("medium");
  const [instructions, setInstructions] = useState("");
  const [suggestVisuals, setSuggestVisuals] = useState(false);
  const [addFaq, setAddFaq] = useState(false);
  const [blogView, setBlogView] = useState("preview"); // "preview" | "html"
  const [tipsOpen, setTipsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Combine the free-text instructions with the optional toggles into one field.
  const combinedInstructions = [
    instructions.trim(),
    suggestVisuals
      ? "Where a visual would strengthen a point, insert an italic placeholder on its own line like: <p><em>[Suggested image: a short description of the ideal image]</em></p>."
      : "",
    addFaq
      ? "Add a short <h2>FAQ</h2> section near the end with 3-4 question/answer pairs relevant to the topic."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prevActionData = useRef(null);
  useEffect(() => {
    if (actionData && actionData !== prevActionData.current) {
      prevActionData.current = actionData;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        if (actionData.published) {
          window.shopify.toast.show(t("Blog post published"), { duration: 4000 });
        } else if (actionData.error && !actionData.limitReached) {
          window.shopify.toast.show(actionData.error, { duration: 5000, isError: true });
        }
      }
    }
  }, [actionData, t]);

  const generated = actionData?.generated;
  const postOpen = !!(generated || resumePost);
  const [editedTitle, setEditedTitle] = useState(generated?.title || resumePost?.title || "");
  const [editedContent, setEditedContent] = useState(generated?.content || resumePost?.content || "");

  // Adopt a NEW generation's title/content exactly once (keyed on the
  // generated object's identity). The previous render-phase resets fired on
  // every keystroke — the moment the merchant's edit differed from the AI
  // output it was thrown away, making both fields effectively read-only.
  const lastAdoptedGeneration = useRef(null);
  useEffect(() => {
    if (generated && generated !== lastAdoptedGeneration.current) {
      lastAdoptedGeneration.current = generated;
      if (generated.title) setEditedTitle(generated.title);
      if (generated.content) setEditedContent(generated.content);
    }
  }, [generated]);

  const usagePct = quotaPct(usageCount, monthlyCredits);
  const isOutOfUsage = usageRemaining === 0;

  const lengthOptions = [
    { label: t("Short (~500 words)"), value: "short" },
    { label: t("Medium (~1000 words)"), value: "medium" },
    { label: t("Long (~2000 words)"), value: "long" },
  ];

  const lockSentence = t("Blog posts are on {plan} and above: {price} a month with {planCredits} credits, {credits} credits a post.", {
    plan: blogPlanLabel,
    price: formatPrice(blogPlan?.amount ?? 0),
    planCredits: blogPlan?.monthlyCredits ?? 0,
    credits: blogCredits,
  });

  const wordCount = editedContent.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

  /* The composer. The header panel of the category's blog writers (SEOWILL
     128/132): the topic and the brand-coloured Generate on one line, the price
     beside the button that spends it, the rest behind "More options". */
  const composer = (
    <Form method="post">
      <input type="hidden" name="actionType" value="generate" />
      <input type="hidden" name="instructions" value={combinedInstructions} />
      <input type="hidden" name="keywords" value={keywords} />
      <input type="hidden" name="length" value={length} />
      <BlockStack gap="300">
        <InlineGrid columns={{ xs: 1, md: "1fr auto" }} gap="300" alignItems="end">
          <TextField
            name="topic"
            label={t("Topic")}
            value={topic}
            onChange={setTopic}
            placeholder={t("e.g., a how-to guide, buying tips, or a seasonal topic for your store")}
            autoComplete="off"
          />
          {/* Phase 15 — the price, on the button that spends it. A8 says money
              is exact; a merchant should never discover the cost from the
              balance afterwards. */}
          <AiButton type="submit" solid size="large" loading={isGenerating} disabled={isGenerating}>
            {isGenerating ? t("Generating...") : t("Generate post")}
          </AiButton>
        </InlineGrid>
        <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
          <Button
            variant="plain"
            size="slim"
            icon={optionsOpen ? ChevronUpIcon : ChevronDownIcon}
            onClick={() => setOptionsOpen((v) => !v)}
            ariaExpanded={optionsOpen}
            ariaControls="blog-options"
          >
            {t("More options")}
          </Button>
          <Text as="p" variant="bodySm" tone="subdued">
            {t("Costs {credits} credits", { credits: blogCredits })}
          </Text>
        </InlineStack>
        <Collapsible open={optionsOpen} id="blog-options">
          <BlockStack gap="300">
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <TextField
                label={t("Keywords")}
                value={keywords}
                onChange={setKeywords}
                placeholder={t("e.g., your main product keywords, comma-separated")}
                helpText={t("Keywords to weave naturally into the post")}
                autoComplete="off"
              />
              <Select label={t("Length")} options={lengthOptions} value={length} onChange={setLength} />
            </InlineGrid>
            <TextField
              label={t("Special instructions (optional)")}
              value={instructions}
              onChange={setInstructions}
              multiline={3}
              maxLength={1000}
              placeholder={t("e.g., mention our spring sale, compare our top 3 products, keep it beginner-friendly…")}
              helpText={t("Anything you want included — promotions, angle, examples, structure.")}
              autoComplete="off"
            />
            <InlineStack gap="400" wrap>
              <Checkbox label={t("Suggest where to add images & visuals")} checked={suggestVisuals} onChange={setSuggestVisuals} />
              <Checkbox label={t("Add an FAQ section")} checked={addFaq} onChange={setAddFaq} />
            </InlineStack>
          </BlockStack>
        </Collapsible>
        {actionData?.limitReached && <QuotaReachedCard upsell={upsell} surface="blog" />}
      </BlockStack>
    </Form>
  );

  /* A still picture of the composer for the locked state: the real fields,
     inert, under the lock card (Tapita 074, Smart SEO 102). */
  const composerPreview = (
    <BlockStack gap="300">
      <InlineGrid columns={{ xs: 1, md: "1fr auto" }} gap="300" alignItems="end">
        <TextField label={t("Topic")} value="" onChange={() => {}} disabled autoComplete="off" placeholder={t("e.g., a how-to guide, buying tips, or a seasonal topic for your store")} />
        <AiButton solid size="large" disabled>
          {t("Generate post")}
        </AiButton>
      </InlineGrid>
      <Text as="p" variant="bodySm" tone="subdued">
        {t("Costs {credits} credits", { credits: blogCredits })}
      </Text>
    </BlockStack>
  );

  return loadingThisRoute ? (
    <AppSkeleton title={t("Blog")} sections={2} layout="twoThird" />
  ) : (
    <Page title={t("Blog")} backAction={{ content: t("Home"), onAction: () => navigate("/app") }}>
      <BlockStack gap="500">
        <BlogTabs selected="write" postCount={postCount} navigate={navigate} />

        {/* One notice at most: the failure, then the publish, then the save. */}
        {actionData?.error ? (
          <Banner tone="critical">
            <p>{actionData.error}</p>
          </Banner>
        ) : actionData?.published ? (
          <Banner tone="success" title={t("Blog post published")}>
            <p>{t("Your blog post has been published to your Shopify store.")}</p>
          </Banner>
        ) : actionData?.success ? (
          <Banner tone="success" title={t("Draft saved")}>
            {actionData.remaining !== undefined ? <p>{t("{remaining} credits left this month.", { remaining: actionData.remaining })}</p> : null}
          </Banner>
        ) : null}

        {/* The header panel: what this screen is for, and the one control that does it. */}
        <Card>
          <InlineGrid columns={{ xs: 1, md: "1fr auto" }} gap="600" alignItems="center">
            <BlockStack gap="400">
              <InlineStack gap="300" blockAlign="center" wrap={false}>
                <IconTile icon={BlogIcon} tone="brand" size="md" />
                <BlockStack gap="050">
                  <Text as="h2" variant="headingLg">
                    {t("Write a post")}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Written in your brand voice and saved as a draft. Nothing is published until you publish it.")}
                  </Text>
                </BlockStack>
              </InlineStack>

              {!blogEntitled ? (
                /* Phase 15 — the gate, stated BEFORE the topic is typed. It says
                   the price, the plan and what happens to the posts already
                   written. Redesign v2: the real composer, blurred under the lock. */
                <BlockStack gap="300">
                  <LockedPreview title={t("Blog posts")} sentence={lockSentence} onSeePlans={() => navigate("/app/plans")}>
                    {composerPreview}
                  </LockedPreview>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Posts you have already written stay here, and you can still publish them.")}
                  </Text>
                </BlockStack>
              ) : isOutOfUsage ? (
                <QuotaReachedCard upsell={upsell} surface="blog" />
              ) : (
                composer
              )}
            </BlockStack>
            <Box>
              <IlluBlog width={200} />
            </Box>
          </InlineGrid>
        </Card>

        <Layout>
          {/* Main — the post */}
          <Layout.Section>
            {isGenerating && (
              <Card>
                <Box padding="600">
                  <BlockStack gap="300" inlineAlign="center">
                    <Spinner size="large" accessibilityLabel={t("Writing your post")} />
                    <Text as="p" variant="headingSm">
                      {t("Writing your post…")}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t("It opens here as a draft when it is ready.")}
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
            )}

            {/* Nothing open: the empty state, in the frame the post will fill. */}
            {!postOpen && !isGenerating && (
              <BlogEmpty heading={t("No post open")} body={t("Write one above, or open a draft from your posts.")} />
            )}

            {postOpen && !isGenerating && (
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center" gap="200">
                      <Text as="h2" variant="headingMd">
                        {t("Draft")}
                      </Text>
                      <Badge>{t("Not published")}</Badge>
                    </InlineStack>
                    <TextField label={t("Title")} value={editedTitle} onChange={setEditedTitle} autoComplete="off" />

                    {/* Preview-first: read the post as it'll look; switch to Edit
                        HTML only when you want to change the markup. */}
                    <InlineStack align="space-between" blockAlign="center" wrap>
                      <ButtonGroup variant="segmented">
                        <Button pressed={blogView === "preview"} onClick={() => setBlogView("preview")}>
                          {t("Preview")}
                        </Button>
                        <Button pressed={blogView === "html"} onClick={() => setBlogView("html")}>
                          {t("Edit HTML")}
                        </Button>
                      </ButtonGroup>
                      <Text as="span" variant="bodySm" tone="subdued" numeric>
                        {t("{length}{v} words", { length: wordCount, v: " " })}
                      </Text>
                    </InlineStack>

                    {blogView === "preview" ? (
                      <Box padding="500" background="bg-surface" borderRadius="300" borderColor="border" borderWidth="025">
                        <div className="cc-blog-preview">
                          <h1 style={{ marginTop: 0 }}>{editedTitle}</h1>
                          <div dangerouslySetInnerHTML={{ __html: editedContent }} />
                        </div>
                      </Box>
                    ) : (
                      <TextField
                        label={t("Content (HTML)")}
                        labelHidden
                        value={editedContent}
                        onChange={setEditedContent}
                        multiline={18}
                        autoComplete="off"
                      />
                    )}
                  </BlockStack>
                </Card>

                <Card>
                  <Form method="post">
                    <input type="hidden" name="actionType" value="publish" />
                    <input type="hidden" name="title" value={editedTitle} />
                    <input type="hidden" name="content" value={editedContent} />
                    <input type="hidden" name="savedPostId" value={actionData?.savedPostId || resumePost?.id || ""} />
                    <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t("Publishes to your Shopify blog.")}
                      </Text>
                      <Button variant="primary" submit loading={isPublishing} disabled={isPublishing}>
                        {isPublishing ? t("Publishing...") : t("Publish to Shopify Blog")}
                      </Button>
                    </InlineStack>
                  </Form>
                </Card>
              </BlockStack>
            )}
          </Layout.Section>

          {/* Side — recent posts, tips, credits */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      {t("Recent posts")}
                    </Text>
                    {recentPosts.length > 0 && (
                      <Button size="slim" variant="plain" onClick={() => navigate("/app/blog/posts")}>
                        {t("View all")}
                      </Button>
                    )}
                  </InlineStack>
                  {recentPosts.length === 0 ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t("Posts you write are listed here.")}
                    </Text>
                  ) : (
                    <BlockStack gap="0">
                      {recentPosts.map((post, i) => (
                        <Box key={post.id}>
                          {i > 0 ? <Divider /> : null}
                          <Box paddingBlock="200">
                            <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
                              <InlineStack gap="200" blockAlign="center" wrap={false}>
                                <IconTile icon={post.status === "published" ? GlobeIcon : EditIcon} tone={post.status === "published" ? "success" : "neutral"} size="sm" />
                                <BlockStack gap="050">
                                  <Link onClick={() => navigate(`/app/blog?postId=${post.id}`)} removeUnderline monochrome>
                                    <Text as="span" variant="bodySm" fontWeight="semibold" truncate>
                                      {post.title || t("Untitled")}
                                    </Text>
                                  </Link>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {t("{wordCount} words", { wordCount: t.number(post.wordCount ?? 0) })}
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                              <Badge tone={post.status === "published" ? "success" : undefined}>
                                {post.status === "published" ? t("Published") : t("Draft")}
                              </Badge>
                            </InlineStack>
                          </Box>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Tips, behind a plain disclosure — the advice is there when wanted,
                  not a blue box on every visit. */}
              <Card>
                <BlockStack gap="200">
                  <Button variant="plain" size="slim" icon={tipsOpen ? ChevronUpIcon : ChevronDownIcon} onClick={() => setTipsOpen((v) => !v)} ariaExpanded={tipsOpen} ariaControls="blog-tips">
                    {t("Tips for great posts")}
                  </Button>
                  <Collapsible open={tipsOpen} id="blog-tips">
                    <BlockStack gap="100">
                      {/* Group 7.6 — the rule, without naming anybody's products. */}
                      <Text as="p" variant="bodySm">
                        • <strong>{t("Be specific")}</strong> {t("— a post answering one question a customer actually asks beats a post named after a product category.")}
                      </Text>
                      <Text as="p" variant="bodySm">
                        {t("• Add")} <strong>{t("target keywords")}</strong> {t("your customers actually search.")}
                      </Text>
                      <Text as="p" variant="bodySm">
                        {t("• Use")} <strong>{t("special instructions")}</strong> {t("to mention promos, comparisons, or your angle.")}
                      </Text>
                      <Text as="p" variant="bodySm">
                        • <strong>{t("Longer posts")}</strong> {t("give the model more to work with.")}
                      </Text>
                      <Text as="p" variant="bodySm">
                        {t("• Turn on")} <strong>FAQ</strong> {t("to add a question-and-answer section.")}
                      </Text>
                    </BlockStack>
                  </Collapsible>
                </BlockStack>
              </Card>

              {/* Usage mini-bar */}
              {(planName === "free" || usagePct >= 50) && (
                <Card>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        {t("Monthly credits")}
                      </Text>
                      <Text id="blog-credit-usage" as="p" variant="bodySm" tone="subdued">
                        {t("{usageCount} / {monthlyCredits} used", { usageCount: t.number(usageCount), monthlyCredits: t.number(monthlyCredits) })}
                      </Text>
                    </InlineStack>
                    {/* FR14 — labelled by the count, never by the rounded percent alone. */}
                    <ProgressBar progress={usagePct} tone={usagePct >= 90 ? "critical" : "success"} size="small" ariaLabelledBy="blog-credit-usage" />
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
