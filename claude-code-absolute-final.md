# CONTENTPILOT AI — THE FINAL 100/100 PROMPT

## READ THIS FIRST

You are working on ContentPilot AI, a Shopify embedded app. The app currently scores 88-90/100 across three expert evaluations. This prompt closes every remaining gap to reach 100/100 AND ensures the entire codebase is production-ready for 20,000 merchants.

**Rules:**
1. After EVERY numbered task, run `npx react-router build`. Fix any failures before moving on.
2. After every 3 tasks, run `npx vitest run`. Fix any test failures.
3. Server-only imports ONLY inside `loader`/`action` — NEVER at module level in route components.
4. Every new database model needs `npx prisma migrate dev --name "description"`.
5. Do NOT create stubs or TODOs. Every feature must be complete and working.
6. When done with ALL tasks, run the full verification checklist at the bottom.

---

## PART A — CLOSE EVERY SCORING GAP (14 tasks)

### A1. Split Product Detail Page Into Tabs

The product detail page is 1,250 lines (a "God Component"). Split it into Polaris `Tabs`.

**File: `app/routes/app.products_.$id.jsx`**

Add `Tabs` import from `@shopify/polaris`. Create 4 tabs:

```jsx
const tabs = [
  { id: "generate", content: "Generate", panelID: "generate-panel" },
  { id: "content", content: "Content & Edit", panelID: "content-panel" },
  { id: "history", content: "Version History", panelID: "history-panel" },
  { id: "images", content: "Images & Alt Text", panelID: "images-panel" },
];
```

Move the relevant sections into each tab panel:
- **Generate tab:** Content type checkboxes, keywords field, content length select, auto-publish toggle, Generate button, Enhance button, progressive loading animation
- **Content tab:** Generated content preview with inline editing TextFields, quality score badge, Publish button, Revert button
- **History tab:** Version history list with restore buttons
- **Images tab:** Alt text generation controls and results

When content is generated successfully, auto-switch to the "Content & Edit" tab.

Also extract the large sections into sub-components in the SAME file (using function declarations above the default export):
- `function GeneratePanel({ ... })` 
- `function ContentPanel({ ... })`
- `function HistoryPanel({ ... })`
- `function ImagesPanel({ ... })`

This keeps the file organized without creating new route files.

### A2. Per-Collection Brand Voice Overrides

**File: `prisma/schema.prisma`** — Add:

```prisma
model CollectionVoice {
  id              String @id @default(cuid())
  shop            String
  collectionId    String
  brandTone       String @default("")
  targetAudience  String @default("")
  keywords        String @default("")
  customNotes     String @default("")
  
  @@unique([shop, collectionId])
  @@index([shop])
}
```

Run: `npx prisma migrate dev --name "add_collection_voice"`

**File: `app/routes/app.collections.jsx`** — For each collection card, add an expandable "Voice Override" section with:
- Brand Tone dropdown (same 9 options + "Use store default")
- Target Audience text field
- Keywords text field
- Save button per collection

**File: `app/utils/bulkProcessor.server.js`** — When processing a product in bulk:
1. Look up which collections the product belongs to (via Shopify GraphQL `product.collections`)
2. Check if any of those collections have a `CollectionVoice` record
3. If yes, merge the collection voice fields into the brand voice before generating (collection overrides store defaults)

**File: `app/utils/ai.server.js`** — In `generateProductContent()`, accept an optional `collectionVoice` object. In `buildPrompt()`, if collectionVoice has a non-empty `brandTone`, use it instead of the store-wide brandVoice tone. Same for targetAudience and keywords.

### A3. Circuit Breaker for Anthropic API

**File: `app/utils/ai.server.js`**

Add a simple circuit breaker above the `callClaude` function:

```javascript
// Circuit breaker: stop calling Claude if it's been failing consistently
const circuitState = { failures: 0, lastFailure: 0, isOpen: false };
const CIRCUIT_THRESHOLD = 5; // failures before opening
const CIRCUIT_COOLDOWN_MS = 60_000; // 1 minute cooldown

function checkCircuit() {
  if (!circuitState.isOpen) return true;
  // Check if cooldown has passed
  if (Date.now() - circuitState.lastFailure > CIRCUIT_COOLDOWN_MS) {
    circuitState.isOpen = false;
    circuitState.failures = 0;
    logger.info("Circuit breaker CLOSED — resuming API calls");
    return true;
  }
  return false;
}

function recordSuccess() {
  circuitState.failures = 0;
  circuitState.isOpen = false;
}

function recordFailure() {
  circuitState.failures++;
  circuitState.lastFailure = Date.now();
  if (circuitState.failures >= CIRCUIT_THRESHOLD) {
    circuitState.isOpen = true;
    logger.warn({ failures: circuitState.failures }, "Circuit breaker OPEN — pausing API calls for 60s");
  }
}
```

In `callClaude()`, before making the fetch:
```javascript
if (!checkCircuit()) {
  throw new Error("AI service temporarily unavailable. The system will retry automatically in about a minute.");
}
```

After a successful response, call `recordSuccess()`. After a failure (5xx or timeout), call `recordFailure()`.

### A4. Dead Letter Queue for BullMQ

**File: `app/queues/generationQueue.server.js`**

When creating the BullMQ Worker, add job options for maximum attempts and a removal policy:

```javascript
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10000 },
  removeOnComplete: { age: 86400, count: 1000 }, // Keep last 1000 completed for 24h
  removeOnFail: { age: 604800, count: 5000 },     // Keep failed for 7 days
};
```

Also add a `failed` event listener to the queue:
```javascript
queue.on("failed", (job, err) => {
  logger.error({ jobId: job.id, err: err.message, attemptsMade: job.attemptsMade }, "Job permanently failed — moved to DLQ");
});
```

This prevents Redis memory bloat from accumulating failed/completed jobs.

### A5. AI Disclosure

**File: `app/routes/app.products_.$id.jsx`**

In the Content tab (after generated content display), add:
```jsx
<Text variant="bodySm" tone="subdued">
  ✨ Content generated by AI — review before publishing to your store
</Text>
```

**File: `app/routes/app.review.jsx`**

At the top of the page, after the title:
```jsx
<Banner tone="info" title="AI-Generated Content">
  All content below was generated by AI. Review and edit each item before publishing.
</Banner>
```

### A6. Increase Free Plan to 25 Generations

**File: `app/utils/billing-plans.js`**

Change the FREE_PLAN:
```javascript
export const FREE_PLAN = {
  key: null,
  planName: "free",
  amount: 0,
  monthlyLimit: 25, // was 10
};
```

This costs $0.375/month in API costs per free user but dramatically improves the evaluation experience and conversion to paid plans.

### A7. Free Re-Generations Within 24 Hours

When a merchant regenerates content for a product that was ALREADY generated within the last 24 hours, don't count it against their monthly limit.

**File: `app/utils/plans.server.js`**

In `tryConsumeGeneration()`, before the atomic check, look up whether a UsageRecord already exists for this shop + productId within the last 24 hours:

```javascript
const recentGeneration = await prisma.usageRecord.findFirst({
  where: {
    shop,
    productId,
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  },
});

if (recentGeneration) {
  // This is a re-generation within 24h — don't count it
  return { allowed: true, isFreeRegeneration: true };
}
```

This encourages merchants to iterate on quality without worrying about credits.

### A8. Truncate Sample Content in Prompt

**File: `app/utils/ai.server.js`**

In `buildPrompt()`, when including `brandVoice.sampleContent`, truncate to 500 characters:

```javascript
const sampleContent = brandVoice?.sampleContent
  ? brandVoice.sampleContent.slice(0, 500) + (brandVoice.sampleContent.length > 500 ? "..." : "")
  : "";
```

This saves ~$0.003/call for merchants with long sample content, which adds up at scale.

### A9. Blog Empty State + Dashboard Links

**File: `app/routes/app.blog.jsx`** — If no blog posts exist, show:
```jsx
<EmptyState
  heading="Start driving organic traffic ✍️"
  action={{ content: "Write Your First Blog Post", onAction: () => setShowForm(true) }}
>
  <p>AI-powered blog posts help your store rank higher on Google and bring in new customers.</p>
</EmptyState>
```

**File: `app/routes/app._index.jsx`** — Add cards in the dashboard linking to pages that were removed from nav:
- "Write a Blog Post →" card linking to `/app/blog`
- "View Analytics →" card linking to `/app/analytics` 
- "Bulk Jobs →" card linking to `/app/jobs`

These should appear as small action cards below the main dashboard stats.

### A10. Graceful Redis Degradation

**File: `app/utils/bulkProcessor.server.js`**

If Redis is unavailable when trying to enqueue a job, fall back to processing inline (synchronously) with a warning:

```javascript
try {
  await enqueueGenerationJob(job.id);
} catch (redisError) {
  logger.warn({ err: redisError.message }, "Redis unavailable — processing job inline");
  // Process synchronously as fallback
  await processGenerationJob(job.id);
}
```

Also in `app/queues/generationQueue.server.js`, wrap the Redis connection in a try/catch:
```javascript
let queue;
try {
  queue = new Queue("generation", { connection: redisConnection });
} catch (err) {
  logger.warn("Redis not available — queue disabled, using inline processing");
  queue = null;
}
```

Export a `isQueueAvailable()` function that returns `!!queue`.

### A11. Live Preview in Onboarding Wizard

**File: `app/routes/app.setup.jsx`**

Add a "Preview" step between filling in settings and saving. When the merchant clicks "See a Preview":

In the action, handle `actionType: "preview"`:
1. Take the brand voice fields from the form
2. Find the first product with an image from the store
3. Call `generateProductContent()` with those settings (use content length "short" to keep it fast)
4. Return the generated description

In the component, show the preview in a Card with the product thumbnail on the left and the generated description on the right. Below it, show "This is what ContentPilot will generate for all your products." with a "Looks great — Save & Continue" button.

If calling the AI is too slow for the wizard flow, show a static high-quality example instead:
```jsx
<Card>
  <Text variant="headingSm">Here's what your content will look like:</Text>
  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
    <p><strong>[Your Product Name]</strong> — AI-generated description using your brand voice settings will appear here. The description will reference actual product details, include your keywords naturally, and match your selected tone.</p>
  </Box>
  <Text variant="bodySm" tone="subdued">Actual results will vary based on your product data and images.</Text>
</Card>
```

### A12. Connection Pooling Documentation

**File: `DEPLOYMENT.md`** (create if it doesn't exist, or update the existing one)

Add a section:

```markdown
## PostgreSQL Connection Pooling

When deploying to serverless or edge platforms (Vercel, Cloudflare Workers, Railway):

1. Use a connection pooler like PgBouncer (built into Neon, Supabase, Railway)
2. Append `?pgbouncer=true&connection_limit=1` to your DATABASE_URL
3. Example: `DATABASE_URL=postgresql://user:pass@host:5432/contentpilot?pgbouncer=true&connection_limit=1`

For traditional server deployments (VPS, Docker):
- Standard PostgreSQL connection without pooler suffix is fine
- Prisma manages its own connection pool (default: 5 connections)
```

### A13. Basic A/B Variant Generation

On the product detail page, add a "Generate 2 Options" button alongside the standard "Generate Content" button.

**File: `app/routes/app.products_.$id.jsx`**

When `actionType === "generateVariants"`:
1. Call `generateProductContent()` TWICE with slightly different instructions
2. For the second call, add to the prompt: "Write a COMPLETELY DIFFERENT version. Use a different opening hook, different structure, and different feature emphasis."
3. Store both variants in state (not in DB until the merchant picks one)
4. Show both in a side-by-side Card layout with "Use This One" buttons

When the merchant picks one, save it to GeneratedContent as usual.

This uses 2 generation credits (fair — it's 2 API calls) but gives merchants the choice they've been asking for.

### A14. Startup Production Checks

**File: `app/utils/startup.server.js`**

Add production-readiness checks that log warnings on startup:

```javascript
export function runStartupChecks() {
  const warnings = [];
  
  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.push("ANTHROPIC_API_KEY not set — AI generation will fail");
  }
  if (process.env.NODE_ENV === "production" && (process.env.DATABASE_URL || "").includes("sqlite")) {
    warnings.push("SQLite detected in production — migrate to PostgreSQL for multi-tenant reliability");
  }
  if (!process.env.REDIS_URL && process.env.NODE_ENV === "production") {
    warnings.push("REDIS_URL not set in production — bulk jobs will run inline (slower)");
  }
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
    warnings.push("Shopify API credentials not configured");
  }
  
  warnings.forEach(w => logger.warn(`⚠️ STARTUP: ${w}`));
  if (warnings.length === 0) {
    logger.info("✅ All startup checks passed");
  }
  
  return warnings;
}
```

Call this from the app's entry point or server startup.

---

## PART B — FULL CODE QUALITY REVIEW (7 tasks)

### B1. Verify Every Route File for Server Import Safety

Run this check on EVERY file in `app/routes/`:

For each `.jsx` file, ensure that ALL imports from `.server.js` files, `prisma`, `@prisma/client`, and `db.server` are ONLY used inside `loader`, `action`, `middleware`, or `headers` exports. If any are at module level or used in the React component, the build WILL break in production.

Fix any violations by moving imports to dynamic `import()` inside the function that needs them.

### B2. Verify Error Handling in Every Action

Check every `action` function in every route. Each must:
1. Wrap database operations in try/catch
2. Return user-friendly error messages (not raw Error objects or stack traces)
3. Handle Shopify GraphQL `userErrors` arrays
4. Handle the case where Shopify API is unreachable

If any action is missing proper error handling, add it.

### B3. Verify Form Validation

Check every form submission across all routes. Ensure:
1. Required fields are validated before submission
2. Character limits are enforced (meta title ≤60, meta description ≤155)
3. Empty state submissions are handled (e.g., no content types selected)
4. Loading states prevent double-submission

### B4. Verify Loading States

Every page that fetches data in its loader should show a loading skeleton or Spinner during navigation. Check:
- Dashboard
- Products list
- Product detail
- Review page
- Collections
- SEO Audit
- Analytics
- Blog

If any page shows a blank screen during navigation, add a `<Spinner>` or `<SkeletonPage>`.

### B5. Verify All Empty States

Pages that can be empty should show helpful EmptyState components:
- Review page (no drafts) ✓ (already has it)
- Jobs page (no jobs) ✓ (already has it)  
- Blog page (no posts) — ADD if missing
- Analytics (no data yet) — ADD if missing
- Collections (no collections) — ADD if missing

### B6. Add Missing Tests

Write tests for any new utility functions that don't have tests:
- `contentScorer.server.js` ✓ (12 tests exist)
- `sanitizePromptInput` ✓ (9 tests exist)
- `seo.server.js` ✓ (14 tests exist)
- Circuit breaker logic — ADD tests
- Free re-generation logic — ADD tests

### B7. Run Full Lint and Fix

```bash
# Fix any obvious code issues
npx react-router build 2>&1
npx vitest run 2>&1
```

Review the build output for warnings. Fix any deprecation warnings, unused imports, or variable shadowing.

---

## PART C — SCALABILITY HARDENING (3 tasks)

### C1. Database Index Review

**File: `prisma/schema.prisma`**

Ensure these indexes exist for query performance at 20,000 merchants:

```prisma
// On GeneratedContent (most-queried table):
@@index([shop, status])           // for Review page filtering
@@index([shop, productId])        // for product detail lookups
@@index([shop, contentType])      // for type-specific queries

// On UsageRecord:
@@index([shop, createdAt])        // for monthly usage counting
@@index([shop, productId])        // for free re-generation checks

// On GenerationJob:
@@index([shop, status])           // for Jobs page listing
@@index([shop, createdAt])        // for Analytics time-range queries

// On ContentVersion:
@@index([shop, productId, contentType]) // already has this
```

Add any missing indexes. Run: `npx prisma migrate dev --name "add_performance_indexes"`

### C2. GraphQL Query Optimization

Review all GraphQL queries in route loaders. Ensure:
1. Only requested fields are in the query (no `SELECT *` equivalent)
2. Pagination uses cursor-based approach (not offset)
3. Bulk product fetches use `first: 250` (Shopify's max per page)
4. No N+1 query patterns (don't fetch products one by one inside a loop)

### C3. Memory-Safe Bulk Processing

In `bulkProcessor.server.js`, ensure that processing 2,000+ products doesn't exhaust memory:
1. Products should be processed in batches (already done via throttle)
2. Generated content should be written to DB immediately, not accumulated in memory
3. Error logs should be appended, not rebuilt as a growing string
4. GC-friendly patterns (don't hold references to processed products)

---

## FINAL VERIFICATION CHECKLIST

After ALL tasks are complete, run these commands:

```bash
npx prisma generate
npx prisma migrate dev
npx react-router build
npx vitest run
```

ALL must succeed.

Then verify:
- [ ] Product detail page uses Polaris Tabs (4 tabs)
- [ ] Collections page has per-collection voice override fields
- [ ] Circuit breaker exists in ai.server.js
- [ ] BullMQ has job retention/cleanup config
- [ ] AI disclosure text appears on product detail and review pages
- [ ] Free plan is 25 generations (not 10)
- [ ] Re-generation within 24h doesn't count against limits
- [ ] Blog page has an EmptyState
- [ ] Dashboard has cards linking to Blog, Analytics, Jobs
- [ ] Onboarding wizard has a preview/example step
- [ ] DEPLOYMENT.md has PostgreSQL + connection pooling section
- [ ] "Generate 2 Options" button exists on product detail
- [ ] Startup checks log production warnings
- [ ] Every route's action has try/catch error handling
- [ ] Every page has a loading state during navigation
- [ ] All empty states have helpful messages
- [ ] `grep -rn "hasApiKey" app/routes/` returns 0 results
- [ ] Navigation has exactly 7 `<s-link>` items
- [ ] All tests pass (should be 60+)
- [ ] Build succeeds with zero warnings
- [ ] Database has proper indexes for 20K merchant scale
