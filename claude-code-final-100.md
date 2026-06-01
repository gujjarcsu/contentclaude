# CONTENTPILOT AI — FROM 89 TO 100. THE FINAL PUSH.

The app scores 89/100. There are 11 specific deductions remaining. Each one is listed below with the exact file, the exact issue, and the exact fix. No ambiguity. No interpretation.

After EVERY numbered item, run `npx react-router build`. If it fails, fix it. After all items are done, run `npx vitest run` to confirm all tests still pass.

---

## 1. REMOVE ALL API KEY WARNINGS FROM MERCHANT UI (-7 points)

The app shows "Add your Anthropic API key to .env" to merchants in THREE places. Merchants should NEVER see this. The developer configures it on the server. Remove every trace.

**File: `app/routes/app._index.jsx`**
- Remove the `hasApiKey` variable (line ~56)
- Remove `hasApiKey` from the loader return object (line ~70)
- Remove `hasApiKey` from the component destructuring (line ~114)
- Remove the ENTIRE `{!hasApiKey && (<Banner...>)}` block (lines ~129-140)
- Remove any conditional that checks `hasApiKey` for the onboarding steps
- The onboarding checklist should start at "Configure Brand Voice" — no API key step

**File: `app/routes/app.settings.jsx`**
- Remove `hasApiKey` from the loader return object (line ~30)
- Remove the ENTIRE `<Banner tone="critical" title="API Key Required">` block (lines ~186-188)
- Keep the API endpoint / Flow integration info (lines ~319-326) but change the wording from "Set CONTENTPILOT_API_TOKEN in your .env" to "Contact support to enable the API endpoint"

**File: `app/routes/app.products_.$id.jsx`**
- Remove `hasApiKey` from the loader return object (line ~114)
- Remove `hasApiKey` from the component destructuring (line ~599)
- Remove the `{!hasApiKey && (<Banner...>)}` block (line ~793+)
- In the keyboard shortcut handler (line ~757), remove the `hasApiKey` condition — replace with `true` or just remove it from the && chain
- The generate button should work without checking hasApiKey on the frontend (the server will error if the key is actually missing, which is the developer's problem, not the merchant's)

**Verification:** Search the entire codebase: `grep -rn "hasApiKey\|API.key.*\.env\|ANTHROPIC_API_KEY" app/routes/` should return ZERO results in any merchant-facing route file. Only `app/utils/ai.server.js` should reference the env var.

---

## 2. REDUCE NAVIGATION FROM 12 TO 7 ITEMS (-5 points)

**File: `app/routes/app.jsx`**

Replace the current 12 `<s-link>` elements with exactly these 7:

```jsx
<s-app-nav>
  <s-link href="/app">Dashboard</s-link>
  <s-link href="/app/products">Products</s-link>
  <s-link href="/app/optimize">Optimise Store</s-link>
  <s-link href="/app/review">Review & Publish</s-link>
  <s-link href="/app/collections">Collections</s-link>
  <s-link href="/app/settings">Settings</s-link>
  <s-link href="/app/plans">Plans & Billing</s-link>
</s-app-nav>
```

Items removed: Blog, SEO Audit, Bulk Jobs, Analytics, Onboarding.

Now make those pages accessible from WITHIN other pages:

**Dashboard (`app._index.jsx`):** Add a section at the bottom with cards linking to:
- "SEO Audit" — card showing store SEO score with a "View Full Audit →" link to `/app/seo-audit`
- "Analytics" — card showing this month's usage stats with "View Analytics →" link to `/app/analytics`
- "Blog" — card with "Write a Blog Post →" link to `/app/blog`

**Products page (`app.products.jsx`):** Add a "Bulk Jobs" tab alongside the existing status tabs (All / Needs Content / Draft / Published / Bulk Jobs). When the "Bulk Jobs" tab is selected, show the jobs list (import the jobs logic or link to `/app/jobs`). Alternatively, add a "View Bulk Jobs →" link/button at the top of the products page near the "Generate All" button.

**Settings page (`app.settings.jsx`):** The onboarding wizard is auto-triggered for new merchants via redirect. For existing merchants who want to re-run it, add a small link at the bottom of Settings: "Re-run onboarding wizard →" that links to `/app/setup`.

**Verification:** Count the `<s-link>` elements in `app.jsx` — must be exactly 7.

---

## 3. POSTGRESQL MIGRATION (-5 points)

**File: `prisma/schema.prisma`**

Change the datasource block to:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**File: `.env` (or `.env.example`)**

Add or update:
```
DATABASE_URL="file:dev.sqlite"
```

Note: For local development, developers can still use SQLite by setting `DATABASE_URL=file:dev.sqlite`. But the schema provider must be `postgresql` for production readiness.

WAIT — actually, Prisma doesn't support SQLite URLs with a postgresql provider. The correct approach:

**Option A (recommended):** Keep `provider = "sqlite"` for local dev but add a clear `DEPLOYMENT.md` section explaining the one-line change needed for production. This is what Shopify's own templates do.

**Option B:** Use an environment variable to switch:
```prisma
datasource db {
  provider = env("DATABASE_PROVIDER")  
  url      = env("DATABASE_URL")
}
```

And set `DATABASE_PROVIDER=sqlite` locally, `DATABASE_PROVIDER=postgresql` in production.

ACTUALLY — Prisma doesn't support `env()` in the provider field. So Option A is the only viable approach.

**The fix:** Leave the provider as `sqlite` for now BUT add a comprehensive deployment section to the README or DEPLOYMENT.md that explains:
1. Change `provider = "sqlite"` to `provider = "postgresql"` 
2. Set `DATABASE_URL` to your PostgreSQL connection string
3. Run `npx prisma migrate dev --name postgres_migration`
4. Deploy

Also add a startup check: in `app/utils/startup.server.js`, log a warning if `NODE_ENV === "production"` and the DATABASE_URL contains "sqlite":

```javascript
if (process.env.NODE_ENV === "production" && (process.env.DATABASE_URL || "").includes("sqlite")) {
  logger.warn("⚠️ SQLite detected in production. Migrate to PostgreSQL for multi-tenant reliability.");
}
```

**Verification:** The startup check exists and logs the warning.

---

## 4. ADD AI DISCLOSURE (-4 points)

Shopify's AI policies are evolving. Adding a small, transparent disclosure protects the app from future rejection.

**File: `app/routes/app.products_.$id.jsx`**

Below every generated content section, add a subtle disclosure line:

```jsx
<Text variant="bodySm" tone="subdued">
  Content generated by AI • Review before publishing
</Text>
```

**File: `app/routes/app.review.jsx`**

At the top of the review page, add:

```jsx
<Banner tone="info">
  All content below was generated by AI. Review each item carefully before publishing to your store.
</Banner>
```

**Verification:** The disclosure text appears on product detail and review pages.

---

## 5. ADD SAMPLE GENERATION PREVIEW TO ONBOARDING WIZARD (-3 points)

**File: `app/routes/app.setup.jsx`**

In the final step of the wizard (before "Save & Start"), add a "Preview" step:

After the merchant fills in brand voice settings but before saving, show a card:

```
"Let's see how ContentPilot writes for your store!"
[Generate Preview] button
```

When clicked, use the brand voice settings from the form (NOT saved to DB yet) to generate a short preview description for the `previewProduct` from the loader. Call the AI endpoint server-side (in a fetcher action), display the result in a Card with the product thumbnail.

This creates the "wow" moment that drives 5-star reviews.

The action should:
1. Accept `actionType: "preview"` 
2. Take the brand voice fields from the form data
3. Call `generateProductContent()` with those settings and the preview product
4. Return the generated description
5. Display it in the wizard

If this is too complex to implement cleanly, at minimum show a static example:
```
"Here's an example of what ContentPilot generates:"
[Show a pre-written high-quality product description example in a styled Card]
"Your content will be customised to match your brand voice settings above."
```

**Verification:** The wizard has a preview/example step before saving.

---

## 6. SPLIT PRODUCT DETAIL PAGE INTO TABS (-4 points)

The product detail page is 1,257 lines and very long to scroll. Add Polaris `Tabs` to organise it.

**File: `app/routes/app.products_.$id.jsx`**

In the component, wrap the main content area in Polaris `Tabs` with these tabs:

- **Generate** — The generate controls (content type checkboxes, keywords, length, auto-publish, generate/enhance buttons)
- **Content** — The generated content preview with inline editing, quality score badge, publish button
- **History** — Version history with restore
- **Alt Text** — Image alt text generation section
- **FAQ** — FAQ content with JSON-LD info

This reduces cognitive overload — merchants see one focused section at a time instead of scrolling through everything.

```jsx
import { Tabs } from "@shopify/polaris";

const [selectedTab, setSelectedTab] = useState(0);
const tabs = [
  { id: "generate", content: "Generate" },
  { id: "content", content: "Content" },
  { id: "history", content: "History" },
  { id: "images", content: "Alt Text" },
];

// In the render:
<Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
  {selectedTab === 0 && <GenerateSection ... />}
  {selectedTab === 1 && <ContentSection ... />}
  {selectedTab === 2 && <HistorySection ... />}
  {selectedTab === 3 && <AltTextSection ... />}
</Tabs>
```

When content is generated, auto-switch to the "Content" tab so the merchant immediately sees the result.

**Verification:** Product detail page uses Tabs. Each tab shows a focused section.

---

## 7. ADD PER-COLLECTION VOICE OVERRIDES (-3 points)

This solves the "luxury vanities vs technical PEX fittings" problem for merchants with mixed catalogs.

**File: `prisma/schema.prisma`**

Add a new model:
```prisma
model CollectionVoice {
  id            String @id @default(cuid())
  shop          String
  collectionId  String
  brandTone     String @default("")
  targetAudience String @default("")
  keywords      String @default("")
  
  @@unique([shop, collectionId])
  @@index([shop])
}
```

Run: `npx prisma migrate dev --name "add_collection_voice"`

**File: `app/routes/app.collections.jsx`**

For each collection, add an expandable "Collection Voice Override" section with:
- Brand Tone selector (same 9 options as Settings)
- Target Audience field  
- Keywords field
- "Use store defaults" checkbox (when checked, these fields are hidden)

Save to CollectionVoice model.

**File: `app/utils/ai.server.js`**

In `generateProductContent()`, accept an optional `collectionVoice` parameter. If provided, override the relevant brandVoice fields (brandTone, targetAudience, keywords) with the collection-specific values.

**File: `app/utils/bulkProcessor.server.js`**

When processing a product, look up which collection(s) it belongs to. If any have a CollectionVoice override, use it. If multiple collections have overrides, use the first one found.

**Verification:** Collections page shows voice override fields. A product in a collection with an override uses that override's tone during generation.

---

## 8. ADD JOB RESUME/RETRY UI (-3 points)

**File: `app/routes/app.jobs.jsx`**

For completed jobs that have failed products:
- Show a "Retry Failed (X products)" button
- When clicked, create a NEW GenerationJob with only the failed product IDs from the error log
- Parse the error log to extract failed product IDs

For jobs with status "failed" (entire job crashed):
- Show a "Resume" button
- When clicked, calculate which products haven't been processed yet (totalProducts - completedProducts)
- Create a new job with the unprocessed product IDs

**Verification:** A job with 3 failed products shows "Retry Failed (3)" button. Clicking it creates a new job.

---

## 9. ADD SEO AUDIT LOADING OPTIMISATION (-2 points)

**File: `app/routes/app.seo-audit.jsx`**

For stores with 500+ products, the initial load could be slow because the loader fetches ALL products via paginated GraphQL. Add a loading state:

- In the component, check if data is still loading (use `useNavigation()` or `useLoaderData()` with a loading indicator)
- Show a `<SkeletonPage>` or `<Spinner>` with text: "Scanning your catalog... This may take a moment for large stores."
- Consider limiting the initial audit to 500 products and showing "Showing first 500 products. Full audit available for Pro plan." for very large stores

Also, add a "Refresh Audit" button that re-runs the loader instead of relying on page reload.

**Verification:** SEO Audit page shows a loading state during initial fetch.

---

## 10. ADD SMART EMPTY STATES WITH PERSONALITY (-1 point)

**File: `app/routes/app.review.jsx`**
Replace the default EmptyState with:
```
heading: "Nothing to review — you're all caught up! 🎉"
body: "Generate content from the Products page, then come back here to review and publish."
action: { content: "Go to Products", url: "/app/products" }
```

**File: `app/routes/app.jobs.jsx`**
```
heading: "No bulk jobs yet"
body: "Select products and hit 'Generate All' to start your first bulk generation."
action: { content: "Go to Products", url: "/app/products" }
```

**File: `app/routes/app.blog.jsx`**
```
heading: "Start driving organic traffic ✍️"
body: "Write your first AI-powered blog post in under 60 seconds."
```

**Verification:** Empty states show helpful, personality-driven messages with action buttons.

---

## 11. FINAL VERIFICATION CHECKLIST

After ALL changes, run:

```bash
npx react-router build
npx vitest run
```

Both must succeed with zero failures.

Then manually verify:
- [ ] Dashboard loads with NO API key warning anywhere
- [ ] Navigation has exactly 7 items
- [ ] Dashboard has SEO Audit, Analytics, and Blog cards with links
- [ ] Products page has a link/button to access Bulk Jobs
- [ ] Settings has a "Re-run onboarding wizard" link at the bottom
- [ ] Product detail page uses Tabs (Generate / Content / History / Alt Text)
- [ ] AI disclosure text appears below generated content
- [ ] Review page has AI disclosure Banner
- [ ] Onboarding wizard has a preview/example step
- [ ] Collections page has voice override fields per collection
- [ ] Jobs page has "Retry Failed" button for jobs with errors
- [ ] SEO Audit shows loading state during fetch
- [ ] Empty states have helpful messages with action buttons
- [ ] Startup.server.js logs SQLite warning in production mode
- [ ] `grep -rn "hasApiKey" app/routes/` returns ZERO results
- [ ] Count `<s-link>` in app.jsx = exactly 7
- [ ] All tests pass
- [ ] Build succeeds
