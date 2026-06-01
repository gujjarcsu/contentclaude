# CONTENTPILOT AI — FIX EVERYTHING. NO EXCUSES.

You are working on ContentPilot AI, a Shopify embedded app at `/home/user/contentpilot-ai` (or wherever the project root is). 

CRITICAL: After EVERY numbered item below, run `npx react-router build`. If it fails, FIX IT before moving on. After every 5 items, run `npx vitest run`. If tests fail, FIX THEM before moving on.

CRITICAL: Server-only imports (anything from `.server.js` files, `prisma`, `@prisma/client`) MUST ONLY appear inside `loader`, `action`, `middleware`, or `headers` exports in route files. NEVER at module level. Use dynamic `import()` inside those functions if needed.

CRITICAL: Do NOT create placeholder files. Every file you create must have COMPLETE, WORKING implementation. If I open the app after you're done, every button must work, every page must load, every feature must function.

---

## 1. REMOVE API KEY WARNING FROM MERCHANT UI

The dashboard currently shows a warning banner if `ANTHROPIC_API_KEY` is not set. Merchants should NEVER see this — the developer sets it on the server. Remove the API key check from the merchant-facing UI.

**File: `app/routes/app._index.jsx`**

- Remove `hasApiKey` from the loader return object
- Remove the `{!hasApiKey && (<Banner...>)}` conditional in the component
- Remove any onboarding step that references "API Key Configured"
- The onboarding should start at "Configure Brand Voice" as step 1

**Verification:** Build succeeds. Dashboard loads without any API key mention.

---

## 2. BUILD THE ONBOARDING WIZARD

Create `app/routes/app.setup.jsx` — a guided setup shown when a merchant has no BrandVoice configured.

**Loader:**
```javascript
export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  
  // Check if brand voice exists
  const { default: prisma } = await import("../db.server.js");
  const existing = await prisma.brandVoice.findUnique({ where: { shop } });
  if (existing) {
    // Already set up — redirect to dashboard
    return redirect("/app");
  }
  
  // Get store info for pre-filling
  const shopResponse = await admin.graphql(`{ shop { name } }`);
  const { data } = await shopResponse.json();
  
  // Get first product with an image for preview
  const productResponse = await admin.graphql(
    `{ products(first: 1, query: "status:active", sortKey: BEST_SELLING) {
      edges { node { id title featuredImage { url } } }
    }}`
  );
  const { data: pData } = await productResponse.json();
  const previewProduct = pData.products.edges[0]?.node || null;
  
  return { shopName: data.shop.name, previewProduct };
}
```

**Component:** A multi-step form (use React state to track current step, NOT separate routes):

- Step 1: "Welcome! Let's set up your brand voice" — Store name pre-filled from Shopify shop name. Brand tone selector showing 9 visual cards (not a dropdown — each card has the tone name and a one-line example).
- Step 2: "Who are your customers?" — Target audience TextField. Paste sample content TextArea with helper text: "Paste your best product description here and we'll match your writing style."
- Step 3: "What makes you different?" — Key differentiators, Avoid phrases, optional keywords.
- Step 4: "You're ready!" — Summary of settings. Big "Save & Start Generating" button.

**Action:** Saves all fields to BrandVoice via `prisma.brandVoice.create()`. Redirects to `/app` on success.

**In `app/routes/app._index.jsx` loader:** Add a check: if no BrandVoice exists for this shop, `return redirect("/app/setup")`.

**In `app/routes/app.jsx`:** Do NOT add Setup to the navigation — it's a one-time flow.

**Verification:** New merchant sees the wizard. After completing it, they're redirected to the dashboard and never see the wizard again.

---

## 3. BUILD AUTOPILOT MODE

This is the headline feature. When a merchant adds a new product to Shopify, ContentPilot automatically generates content.

### 3A. Add autopilot fields to BrandVoice schema

**File: `prisma/schema.prisma`**

Add to BrandVoice model:
```
autopilotEnabled     Boolean @default(false)
autopilotAutoPublish Boolean @default(false)
```

Run: `npx prisma migrate dev --name "add_autopilot_fields"`

### 3B. Create the webhook handler

**Create: `app/routes/webhooks.products.create.jsx`**

```javascript
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);
  
  const { default: prisma } = await import("../db.server.js");
  
  // Check if autopilot is enabled
  const brandVoice = await prisma.brandVoice.findUnique({ where: { shop } });
  if (!brandVoice?.autopilotEnabled) {
    return new Response(null, { status: 200 });
  }
  
  const productId = `gid://shopify/Product/${payload.id}`;
  
  // Check if we have generation credits
  const { canGenerate } = await import("../utils/plans.server.js");
  const gate = await canGenerate(shop);
  if (!gate.allowed) {
    const logger = (await import("../utils/logger.server.js")).default;
    logger.warn({ shop, productId }, "Autopilot: monthly limit reached, skipping");
    return new Response(null, { status: 200 });
  }
  
  // Create a generation job for this single product
  const job = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: 1,
      completedProducts: 0,
      failedProducts: 0,
      productIds: JSON.stringify([productId]),
      contentTypes: "description,metaTitle,metaDescription",
      autoPublish: brandVoice.autopilotAutoPublish,
      errorLog: "",
    },
  });
  
  try {
    const { enqueueGenerationJob } = await import("../queues/generationQueue.server.js");
    await enqueueGenerationJob(job.id);
  } catch (err) {
    // Fallback: process inline if queue is unavailable
    const { processGenerationJob } = await import("../utils/bulkProcessor.server.js");
    await processGenerationJob(job.id);
  }
  
  return new Response(null, { status: 200 });
};
```

### 3C. Add autoPublish to GenerationJob schema

**File: `prisma/schema.prisma`**

Add to GenerationJob model:
```
autoPublish      Boolean @default(false)
```

Run: `npx prisma migrate dev --name "add_auto_publish_to_jobs"`

### 3D. Wire autoPublish into bulkProcessor

**File: `app/utils/bulkProcessor.server.js`**

After generating content for each product successfully, check if `job.autoPublish` is true. If so, immediately apply the content to Shopify via a `productUpdate` GraphQL mutation and set the GeneratedContent status to "published" instead of "draft".

You'll need to pass the admin API session into the processor. In the queue worker or processGenerationJob function, after generating content:

```javascript
if (job.autoPublish) {
  // Get a fresh admin session for this shop
  const { shopifyApp } = await import("../shopify.server.js");
  // Use offline session to make admin API calls
  const session = await prisma.session.findFirst({ where: { shop: job.shop } });
  if (session) {
    const { admin } = await shopifyApp.authenticate.admin(/* construct request with session */);
    // Apply to Shopify
    const input = { id: productId };
    if (generated.description) input.descriptionHtml = generated.description;
    if (generated.metaTitle || generated.metaDescription) {
      input.seo = {};
      if (generated.metaTitle) input.seo.title = generated.metaTitle;
      if (generated.metaDescription) input.seo.description = generated.metaDescription;
    }
    // Execute mutation...
  }
  // Set status to "published"
}
```

NOTE: If getting the admin session in the background worker is complex with your Shopify library, an alternative approach is: after the bulk job completes, if autoPublish was true, create a server-side task that uses the stored session token to apply all draft content. The key requirement is: when autoPublish is on, content MUST end up published in Shopify without merchant interaction.

### 3E. Add autopilot toggle to Settings page

**File: `app/routes/app.settings.jsx`**

Add a prominent Card at the TOP of the settings page (before brand voice fields):

```jsx
<Card>
  <BlockStack gap="400">
    <Text as="h2" variant="headingMd">⚡ Autopilot Mode</Text>
    <Text color="subdued">When enabled, ContentPilot automatically generates content whenever you add a new product to your Shopify store.</Text>
    <Checkbox
      label="Enable Autopilot — auto-generate content for new products"
      checked={autopilotEnabled}
      onChange={setAutopilotEnabled}
    />
    {autopilotEnabled && (
      <Checkbox
        label="Also auto-publish (content goes live immediately without review)"
        checked={autopilotAutoPublish}
        onChange={setAutopilotAutoPublish}
      />
    )}
  </BlockStack>
</Card>
```

Save autopilot fields in the existing save action.

### 3F. Register the webhook

**File: `shopify.app.toml`**

Add under webhooks:
```toml
[[webhooks.subscriptions]]
topics = ["products/create"]
uri = "/webhooks/products/create"
```

**Verification:** Build succeeds. Settings page shows autopilot toggle. When a new product is created in a dev store, the webhook fires and content is generated.

---

## 4. WIRE FAQ JSON-LD INTO PUBLISH FLOW

**File: `app/routes/app.products_.$id.jsx`**

In the `actionType === "publish"` section, AFTER the productUpdate mutation succeeds, add:

```javascript
// Auto-save FAQ as JSON-LD metafield if FAQ content exists
const { default: prismaDb } = await import("../db.server.js");
const faqRecord = await prismaDb.generatedContent.findUnique({
  where: { shop_productId_contentType: { shop, productId, contentType: "faq" } },
});

if (faqRecord?.generatedContent) {
  const { faqToJsonLd } = await import("../utils/seo.server.js");
  const jsonLd = faqToJsonLd(faqRecord.generatedContent);
  
  if (jsonLd) {
    await admin.graphql(
      `mutation setFaqSchema($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [{
            ownerId: productId,
            namespace: "contentpilot",
            key: "faq_schema",
            type: "json",
            value: JSON.stringify(jsonLd),
          }],
        },
      }
    );
  }
}
```

Also add the same logic in the auto-publish section of the "generate" action (when `autoPublish` is true and FAQ was generated).

**Verification:** After publishing a product with FAQ content, check Shopify admin → product → metafields → contentpilot.faq_schema exists with valid JSON-LD.

---

## 5. ADD INLINE EDITING TO THE REVIEW PAGE

**File: `app/routes/app.review.jsx`**

The Review page currently shows content as read-only text. Replace the read-only content display with editable TextFields:

For each product's content sections (description, metaTitle, metaDescription, faq), render a `TextField` component with the generated content as the default value. Store edited values in a state object like:

```javascript
const [edits, setEdits] = useState({}); // keyed by `${productId}:${contentType}`

function handleEdit(productId, contentType, value) {
  setEdits(prev => ({ ...prev, [`${productId}:${contentType}`]: value }));
}
```

For metaTitle: show character count with error state if > 60.
For metaDescription: show character count with error state if > 155.
For description: use `multiline={4}`.
For faq: use `multiline={4}`.

In the publish action, send the edited values (not the original DB values). Update the GeneratedContent records with any edits before pushing to Shopify.

**Verification:** On the Review page, each product's content sections are editable TextFields. Changes are preserved when "Publish All Approved" is clicked.

---

## 6. ADD "GENERATE ALL" BUTTON TO PRODUCTS PAGE

**File: `app/routes/app.products.jsx`**

Add a prominent Button above the product table that says:
- When "Needs Content" tab is active: "Generate All {count} Products Needing Content"
- When "All" tab is active: "Generate Content for All {count} Products"

When clicked, the action should:
1. Fetch ALL product IDs matching the current filter using cursor-based pagination (not just the current page of 50)
2. Create a single GenerationJob with ALL product IDs
3. Redirect to the Jobs page

```javascript
// In the action, when actionType === "generateAll":
async function fetchAllProductIds(admin) {
  const allIds = [];
  let cursor = null;
  let hasNext = true;
  while (hasNext) {
    const response = await admin.graphql(
      `query($cursor: String) {
        products(first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges { node { id } }
        }
      }`,
      { variables: { cursor } }
    );
    const { data } = await response.json();
    allIds.push(...data.products.edges.map(e => e.node.id));
    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }
  return allIds;
}
```

Include the autoPublish checkbox and contentTypes selection in the Generate All panel too.

**Verification:** "Generate All" button appears. Clicking it creates ONE job with ALL product IDs.

---

## 7. SEND MULTIPLE IMAGES TO DESCRIPTION PROMPT

**File: `app/utils/ai.server.js`**

In `generateProductContent()`, accept multiple image URLs:

```javascript
// Replace the single-image logic:
const imageUrls = [product.imageUrl, ...(product.additionalImages || [])].filter(Boolean).slice(0, 4);

const messageContent = imageUrls.length > 0
  ? [
      ...imageUrls.map(url => ({ type: "image", source: { type: "url", url } })),
      { type: "text", text: prompt },
    ]
  : prompt;
```

**In `app/routes/app.products_.$id.jsx` action (generate section):** When building the product object to pass to `generateProductContent`, include additional images:

```javascript
additionalImages: product.images.edges.slice(1, 4).map(e => e.node.url),
```

Update the prompt's image instruction to mention multiple images:
```
PRODUCT IMAGES: ${imageUrls.length} image(s) provided above. Examine ALL images carefully. Use visual details from EVERY image — colors, materials, textures, finishes, angles, context, packaging, accessories shown — to create a comprehensive, visually-rich description. Only describe what is visibly present.
```

**Verification:** Product with 4+ images sends up to 4 images to Claude. Description references details from multiple angles.

---

## 8. ADD CROSS-PRODUCT DIFFERENTIATION

**File: `app/utils/ai.server.js`**

Add a new parameter `recentSimilarTitles` to `generateProductContent()`. In `buildPrompt()`, if this array is non-empty, add:

```
=== DIFFERENTIATION CONTEXT ===
You have already written descriptions for these similar products: ${recentSimilarTitles.join(", ")}
Make THIS product's description clearly DISTINCT. Use a different opening hook, different structure, and highlight what makes this specific product unique compared to the others listed above.
```

**In `app/utils/bulkProcessor.server.js`:** Before generating each product, query the last 10 GeneratedContent records for the same shop with the same productType. Pass their titles as `recentSimilarTitles`.

**Verification:** Build succeeds. Two similar products in the same bulk job get observably different descriptions.

---

## 9. SIMPLIFY NAVIGATION (10 → 7 ITEMS)

**File: `app/routes/app.jsx`**

Reduce nav items from 10 to 7 by:
- Remove "Bulk Jobs" from nav (merge into the Products page as a tab or section)
- Remove "Analytics" from nav (merge into the Dashboard page as a section)
- Keep: Dashboard, Products, Review, Collections, SEO Audit, Settings, Plans

If you merge Analytics into Dashboard, move the analytics stats/charts into `app/routes/app._index.jsx` as a section below the main dashboard content. If you merge Jobs into Products, add a "Jobs" tab alongside the existing status tabs on the Products page.

**Verification:** Navigation has 7 items maximum. All functionality is still accessible.

---

## 10. ADD PROGRESSIVE LOADING MESSAGES

**File: `app/routes/app.products_.$id.jsx`**

Replace the simple `<Spinner>` during generation with an animated stepper that shows progress:

```jsx
const LOADING_MESSAGES = [
  "Reading product data…",
  "Analysing product images…",
  "Crafting your brand voice…",
  "Writing the description…",
  "Optimising for SEO…",
  "Polishing the copy…",
  "Almost done…",
];

// In the component, when generation is in progress:
const [loadingStep, setLoadingStep] = useState(0);

useEffect(() => {
  if (fetcher.state === "submitting" || fetcher.state === "loading") {
    const interval = setInterval(() => {
      setLoadingStep(prev => Math.min(prev + 1, LOADING_MESSAGES.length - 1));
    }, 2500);
    return () => { clearInterval(interval); setLoadingStep(0); };
  }
}, [fetcher.state]);

// Render:
{isGenerating && (
  <Card>
    <BlockStack gap="300" alignment="center">
      <Spinner size="large" />
      <Text variant="headingSm">{LOADING_MESSAGES[loadingStep]}</Text>
      <ProgressBar progress={Math.round(((loadingStep + 1) / LOADING_MESSAGES.length) * 100)} size="small" />
    </BlockStack>
  </Card>
)}
```

**Verification:** During generation, the user sees "Reading product data…" → "Analysing product images…" → etc. with a progress bar.

---

## 11. BUILD ONE-CLICK STORE OPTIMIZE PAGE

Create `app/routes/app.optimize.jsx` — the "magic button" page.

**Loader:** Fetch ALL products (paginated). Cross-reference with GeneratedContent. Count: missing descriptions, missing metas, missing alt text. Calculate overall store SEO score. Estimate time and credits needed.

**Component:**
- Big hero number: "Your store is X% optimised"
- Breakdown: "120 products need descriptions, 180 need meta tags, 95 need alt text"
- Estimated time: "~25 minutes"
- Credits needed: "230 generations"
- Content type checkboxes (pre-checked: description, metaTitle, metaDescription)
- Auto-publish toggle
- Content length selector
- BIG button: "✨ Optimise My Entire Store"

**Action:** Creates a GenerationJob with ALL product IDs that need content. Redirects to Jobs page or shows inline progress.

Add "Optimise" to the navigation in `app/routes/app.jsx` — or better, add a prominent "Optimise Store" button on the Dashboard page that links to this route.

**Verification:** Page loads with accurate counts. Clicking the button creates a job with all underserved product IDs.

---

## 12. ADD CONTENT QUALITY SCORING

Create `app/utils/contentScorer.server.js`:

```javascript
export function scoreContent(content, product) {
  let score = 0;
  const issues = [];
  
  if (content.description) {
    const text = content.description.replace(/<[^>]+>/g, "");
    const words = text.split(/\s+/).length;
    if (words >= 80) score += 20; else issues.push(`Description only ${words} words`);
    if (/<(strong|ul|li)/.test(content.description)) score += 10; else issues.push("No formatting");
    const cliches = ["revolutionize","elevate your","game-changer","whether you're looking","say goodbye"];
    if (!cliches.some(c => text.toLowerCase().includes(c))) score += 15; else issues.push("Contains AI cliché");
    if (/order|shop|buy|add to cart|get yours|browse|discover/i.test(text)) score += 10; else issues.push("Missing CTA");
    score += 5; // base points for having a description
  }
  
  if (content.metaTitle) {
    if (content.metaTitle.length <= 60 && content.metaTitle.length >= 25) score += 15;
    else issues.push(`Meta title ${content.metaTitle.length} chars`);
  }
  
  if (content.metaDescription) {
    if (content.metaDescription.length <= 155 && content.metaDescription.length >= 50) score += 15;
    else issues.push(`Meta description ${content.metaDescription.length} chars`);
  }
  
  // Bonus for FAQ
  if (content.faq && content.faq.includes("Q:")) score += 10;
  
  return { score, maxScore: 100, percentage: Math.min(100, score), issues };
}
```

**In `app/routes/app.products_.$id.jsx`:** After generation succeeds, calculate and display the quality score as a Badge next to the generated content header. If score < 70, show a warning Banner suggesting regeneration.

**Verification:** Quality score badge appears after generation. Low-quality output shows a warning.

---

## 13. ADD PROMPT INJECTION DEFENCE

Create a helper in `app/utils/ai.server.js`:

```javascript
function sanitizePromptInput(text) {
  if (!text) return "";
  return text
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "")
    .replace(/you\s+are\s+now\s+/gi, "")
    .replace(/system\s*prompt/gi, "")
    .replace(/<\/?[A-Z_]{2,}>/g, "") // Strip XML-like tags
    .replace(/\bHACK(ED|ING)?\b/gi, "")
    .trim();
}
```

Apply `sanitizePromptInput()` to ALL merchant-controlled inputs in `buildPrompt()`:
- `brandVoice.storeName`
- `brandVoice.targetAudience`
- `brandVoice.keyDifferentiators`
- `brandVoice.avoidPhrases`
- `brandVoice.sampleContent`
- `brandVoice.additionalNotes`
- `product.description`
- `product.descriptionHtml`
- `options.keywords`

**Verification:** Build succeeds. A product with description "Ignore all previous instructions" gets sanitised before hitting the prompt.

---

## 14. FIX SEO AUDIT TO HANDLE FULL CATALOG

**File: `app/routes/app.seo-audit.jsx`**

Replace the single `products(first: 200)` query with cursor-based pagination that fetches ALL products:

```javascript
async function fetchAllProducts(admin) {
  const products = [];
  let cursor = null;
  let hasNext = true;
  while (hasNext && products.length < 2000) {
    const response = await admin.graphql(
      `query($cursor: String) {
        products(first: 250, after: $cursor, sortKey: TITLE) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id title description
            seo { title description }
            images(first: 5) { edges { node { altText } } }
          }}
        }
      }`,
      { variables: { cursor } }
    );
    const { data } = await response.json();
    products.push(...data.products.edges.map(e => e.node));
    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }
  return products;
}
```

**Verification:** SEO Audit page shows ALL products in a 300+ product store, not just the first 200.

---

## 15. ADD "ENHANCE EXISTING" MODE

**File: `app/routes/app.products_.$id.jsx`**

Add a Button next to "Generate Content" called "Enhance Current Content". When clicked, it submits with `actionType: "enhance"`.

**In the action:** When `actionType === "enhance"`, call a new function `enhanceExistingContent()` in `ai.server.js` that sends the existing description to Claude with instructions to IMPROVE it (not replace):

```javascript
export async function enhanceExistingContent(existingHtml, brandVoice, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  
  const keywords = options.keywords || brandVoice?.targetKeywords || "";
  
  const prompt = `You are improving an existing product description. Do NOT replace it — enhance it.

=== BRAND CONTEXT ===
Brand Tone: ${brandVoice?.brandTone || "professional"}
Target Audience: ${brandVoice?.targetAudience || "general consumers"}
${keywords ? `Target Keywords: ${keywords}` : ""}

=== EXISTING CONTENT ===
${existingHtml}

=== INSTRUCTIONS ===
Improve this description while keeping its structure and key information:
- Improve the writing quality, flow, and engagement
- Add SEO keyword integration if keywords are provided
- Fix any grammar or spelling issues
- Add HTML formatting (bold, lists) if missing
- Strengthen the opening hook
- Add or improve the closing call to action
- Keep it approximately the same length (±20%)
- Do NOT invent facts, specifications, or claims not in the original

<DESCRIPTION>Your improved HTML description here</DESCRIPTION>
<META_TITLE>SEO meta title, max 60 chars</META_TITLE>
<META_DESCRIPTION>SEO meta description, max 155 chars</META_DESCRIPTION>`;

  const rawText = await callClaude(apiKey, {
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  
  return parseGeneratedContent(rawText);
}
```

**Verification:** "Enhance Current Content" button appears on the product detail page. Clicking it sends the existing description to Claude for improvement rather than replacement.

---

## 16. ADD VERSION HISTORY

**File: `prisma/schema.prisma`**

Add a new model:
```prisma
model ContentVersion {
  id            String   @id @default(cuid())
  shop          String
  productId     String
  contentType   String
  content       String
  version       Int
  createdAt     DateTime @default(now())
  
  @@index([shop, productId, contentType])
}
```

Run: `npx prisma migrate dev --name "add_content_version_history"`

**In `app/routes/app.products_.$id.jsx` action:** Before upserting GeneratedContent during generation, save the CURRENT content (if any) to ContentVersion:

```javascript
const existing = await prisma.generatedContent.findUnique({
  where: { shop_productId_contentType: { shop, productId, contentType: type } },
});
if (existing?.generatedContent) {
  await prisma.contentVersion.create({
    data: {
      shop, productId, contentType: type,
      content: existing.generatedContent,
      version: existing.version || 1,
    },
  });
}
```

In the component, add an expandable "Version History" section below each content type that shows previous versions with timestamps and a "Restore" button.

**Verification:** After regenerating content for a product, the "Version History" section shows the previous version. Clicking "Restore" brings it back.

---

## 17. WRITE COMPREHENSIVE TESTS

Create tests for all new utilities:

**File: `tests/utils/seo.test.js`**
- Test `faqToJsonLd()` with valid Q&A pairs → returns valid FAQPage schema
- Test `faqToJsonLd()` with empty string → returns null
- Test `calculateSeoScore()` with fully optimised product → returns 100
- Test `calculateSeoScore()` with empty product → returns 0
- Test `getProductTypeInstructions()` detects "gift card"
- Test `getProductTypeInstructions()` returns empty for "Tap"

**File: `tests/utils/contentScorer.test.js`**
- Test `scoreContent()` penalises AI clichés
- Test `scoreContent()` rewards HTML formatting
- Test `scoreContent()` catches over-length meta titles

**Verification:** `npx vitest run` — all tests pass (old + new).

---

## 18. FINAL BUILD VERIFICATION

After ALL changes are complete, run these commands and verify they ALL succeed:

```bash
npx prisma generate
npx prisma migrate dev
npx react-router build
npx vitest run
```

If ANY of these fail, fix the issue before declaring done.

Then manually verify:
- Dashboard loads without API key warning
- New merchant is redirected to setup wizard
- Setup wizard saves brand voice and redirects to dashboard
- Settings page shows Autopilot toggle
- Products page has "Generate All" button
- Product detail has "Enhance Current Content" button
- Product detail shows progressive loading messages during generation
- Product detail shows quality score after generation
- FAQ publish writes JSON-LD to Shopify metafield
- Review page has inline editing for all content fields
- SEO Audit shows all products (not capped at 200)
- Optimize page loads with correct counts
- Navigation has 7 or fewer items
- Version history shows after regenerating content
- All tests pass

---

## WHAT NOT TO DO

- Do NOT create empty stub files with TODO comments
- Do NOT skip the build verification after each item
- Do NOT use top-level server imports in route components
- Do NOT leave broken code and move to the next item
- Do NOT create new features without testing the build
- Do NOT add nav items beyond 7 total
- Do NOT show API key configuration to merchants
- Do NOT half-implement autopilot (the webhook MUST generate content)
