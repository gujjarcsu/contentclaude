# FIXES.md — ContentClaude QA Audit Remediation

## P0-1 · Billing upgrade flow → "Unexpected Server Error"

**Root cause:** `billing.request()` in `app/routes/app.plans.jsx` throws a redirect `Response` on success (which React Router must re-throw) and throws a plain JS `Error` on failure (Shopify API errors, bad `returnUrl`, dev-store billing issues). The action had no try/catch, so any failure propagated to the ErrorBoundary — producing the "Unexpected Server Error" page.

**Files changed:** `app/routes/app.plans.jsx`

**Change:** Wrapped `billing.request()` and `billing.cancel()` in try/catch. Re-throw `Response` instances (so React Router can follow the redirect to Shopify's approval screen). Any other `Error` is caught and returned as a JSON `{ error: "..." }` that the existing error `Banner` in the UI displays as a user-friendly message.

**Re-test:**
1. Go to Plans & Billing on any paid plan tier.
2. Click "Upgrade to Starter" (or Growth/Professional).
3. Expected: redirect to Shopify's billing approval screen with no 500 error.
4. Approve: plan + monthly limit updates in the app.
5. Decline/cancel: graceful return with a visible error message (not a crash).
6. Run with an intentionally bad `SHOPIFY_APP_URL` — confirm the action returns a structured error banner instead of an unhandled 500.

---

## P0-2 · Free-tier quota not counting regenerations

**Root cause:** `tryConsumeGeneration()` in `app/utils/plans.server.js` contained a "free regen" bypass: if a product had been generated in the last 24 h, the first 3 regenerations were returned as `{ allowed: true, isFreeRegeneration: true }` without writing a `UsageRecord` or going through the serializable transaction. Every generation path (product page generate, enhance, A/B, bulk, autopilot) called this function, so all regenerations on existing products were unmetered.

**Files changed:** `app/utils/plans.server.js`, `tests/utils/plans.test.js`

**Change:** Removed the free-regen bypass entirely. Every call — first generation, regeneration, enhance, A/B variant — now goes through the serializable transaction that atomically checks the quota and writes a `UsageRecord`. Two previously-passing tests that asserted the old bypass behaviour were replaced with two correct tests asserting credits are always consumed.

**A/B specifically:** A/B variant makes 2 parallel AI calls — the action (`app/routes/app.products_.$id.jsx`) now calls `tryConsumeGeneration` twice (once per call). If only 1 credit remains, the second call returns `allowed: false` and a clear upgrade prompt is shown.

**Re-test:**
1. On a Free plan with 17/25 used, regenerate a product description.
2. Expected: counter moves to 18/25.
3. Generate A/B variants: counter moves to 19/25 (2 credits consumed).
4. Reach the limit (25/25): next generation is blocked server-side with an upgrade prompt.
5. Run `npm test` — 60/60 pass.

---

## P1-1 · Metrics math: coverage shows >100% ("282%")

**Root cause:** Dashboard, Analytics, and Optimise Store each independently computed `published` and `draft` counts by calling `prisma.generatedContent.groupBy(by: ["status"])`. This counts every content *row* (description, metaTitle, metaDescription, FAQ, altText) — for 17 products × 3 fields = 51 rows. All three routes then divided these field counts by `totalProducts` → 51/17 = 300% coverage, "51 of 17 products optimised."

**Files changed:**
- `app/utils/metrics.server.js` (new — shared single-source-of-truth helper)
- `app/routes/app._index.jsx` (dashboard)
- `app/routes/app.analytics.jsx` (analytics)

**Change:**
- Created `getContentMetrics(shop)` which queries `distinct: ["productId"]` — counting the number of *distinct products* with ≥1 published field (never > `totalProducts`).
- `coveragePct()` helper clamps the result to 0–100.
- Dashboard `generatedCount` and Analytics `published`/`draft` now use distinct-product counts.
- Analytics shows a separate "content pieces generated" figure for the raw row count.
- Optimise Store was already correct (it counted `contentType: "description"` only = distinct products) — left unchanged.

**Re-test:**
1. With 17 products and 51 content pieces: Dashboard shows "X of 17 products optimised" where X ≤ 17.
2. Analytics shows coverage ≤ 100%.
3. "Content pieces generated" shows the raw 51 figure with a distinct label.

---

## P2-1 · Mojibake on key UI strings

**Root cause:** Specific string literals in source files were stored with double-encoded UTF-8 bytes (mojibake). Affected: `Generate Content âŒ˜↵` (should be `Generate Content ⌘↵`), `Start driving organic traffic âœï¸` (should be `✏️`), and emoji in the Settings tone cards (Friendly `😊`, Minimalist `□`, Custom `✏️`).

**Files changed:** `app/routes/app.products_.$id.jsx`, `app/routes/app.blog.jsx`, `app/routes/app.settings.jsx` (emoji fix from previous session)

**Change:** Replaced garbled byte sequences with correct Unicode codepoints using a Node script for precision.

**Re-test:** "Generate Content ⌘↵" button renders the ⌘ glyph; Blog empty state shows `✏️`; Settings tone cards all show correct emoji.

---

## P2-2 · Paid features accessible on Free plan

**Root cause:** No server-side entitlement check on A/B variants (`generateVariants` action), Bulk generation jobs (products and optimize actions), or Autopilot (products/create webhook). The UI had visual hints but the server never enforced plan requirements.

**Files changed:**
- `app/utils/billing-plans.js` — added `entitlements` object per plan and `getEntitlements(planName)` helper
- `app/utils/plans.server.js` — added `checkEntitlement(shop, feature)` async function
- `app/routes/app.products_.$id.jsx` — A/B variants check `abVariants` entitlement
- `app/routes/app.products.jsx` — bulk generate checks `bulkJobs` entitlement
- `app/routes/app.optimize.jsx` — optimize checks `bulkJobs` entitlement
- `app/routes/webhooks.products.create.jsx` — autopilot webhook checks `autopilot` entitlement

**Entitlement registry (matches pricing table exactly):**
| Feature | Free | Starter | Growth | Pro |
|---|---|---|---|---|
| Bulk jobs | ✗ | ✗ | ✓ | ✓ |
| A/B variants | ✗ | ✗ | ✓ | ✓ |
| Autopilot | ✗ | ✗ | ✓ | ✓ |
| Content templates | ✗ | ✓ | ✓ | ✓ |
| Version history | ✗ | ✓ | ✓ | ✓ |

**Re-test:**
1. On a Free plan: click "Generate 2 Options (A/B)" → server returns "A/B Variants require the Growth plan."
2. On a Free plan: click "Generate All" or "Optimise Store" → server returns upgrade prompt.
3. On a Growth plan: all features work.
4. Autopilot webhook: silently skips if plan is below Growth.

---

## P2-3 · Over-broad OAuth scopes

**Root cause:** `shopify.app.toml` requested `write_metaobjects` and `write_metaobject_definitions`. Code audit confirmed zero usage of metaobject mutations anywhere in the app. FAQ JSON-LD is written using `metafieldsSet` which only requires `write_products` (already present).

**Files changed:** `shopify.app.toml`

**Change:** Removed `write_metaobjects,write_metaobject_definitions` from scopes. Remaining: `write_products,write_content` (blog publish requires `write_content` for `blogCreate`/`articleCreate`).

**Re-test:** OAuth consent screen shows only 2 scopes. App functions fully end-to-end (products, blog publish, metafields).

---

## P2-4 · Blank screens on slow route navigation

**Root cause:** Jobs and Optimize Store routes had no loading skeleton — navigating to either page showed a blank white void for several seconds while the loader ran.

**Files changed:** `app/routes/app.jobs.jsx`, `app/routes/app.optimize.jsx`

**Change:** Added `useNavigation()` check at the top of each component. When `navigation.state === "loading"`, renders a `SkeletonPage` with `SkeletonDisplayText` and `SkeletonBodyText` placeholders (placed after all hooks to satisfy Rules of Hooks). Gives instant visual feedback on navigation.

**Re-test:** Navigate to Jobs or Optimise Store from another page — a skeleton card appears immediately instead of a blank screen.

---

## P3-3 · Template residue (peptide/medical placeholders)

**Root cause:** Placeholder text in forms throughout the app (`app.blog.jsx`, `app.products_.$id.jsx`, `app.settings.jsx`, `app.setup.jsx`) contained product-specific examples from what appears to be the developer's own store ("BPC-157", "peptides Australia", "Elite Peps Australia", "Never make medical claims", "ship from Sydney").

**Files changed:** All four routes listed above.

**Change:** Replaced all niche examples with neutral, store-agnostic alternatives (e.g. "organic skincare Australia", "wellness and fitness", "Elite Botanics Australia", "free shipping").

**Re-test:** Grep for `BPC-157`, `peptide`, `Elite Peps`, `medical claims`, `Sydney` — returns zero results in app/routes.

---

## P3-4 · SEO audit scoring label inconsistency

**Root cause:** `calculateSeoScore()` in `app/utils/seo.server.js` set `hasAltText = false` when a product had no images at all. The "Issues Found" section then showed two separate issues: "No product images" AND "Images without alt text" — but a product with no images can't have alt text, so it was double-counting a single root cause.

**Files changed:** `app/utils/seo.server.js`, `app/routes/app.seo-audit.jsx`

**Change:**
- `calculateSeoScore` now distinguishes `noImages` (no images at all) from `missingAltText` (has images but none with alt text).
- `hasAltText` is only `false`-meaningful when images exist; when no images exist, alt text is "not applicable."
- SEO audit "Issues Found" panel now shows two distinct counters: "No product images" and "Images missing alt text."
- Per-row alt-text cell shows a "No images" badge when the product has no images, instead of a fail ✗.

**Re-test:** A product with no images scores 80 (loses 10pts Has-Images + 10pts Alt-Text). "Issues Found" shows it under "No product images" only, not also under "Images missing alt text."

---

## §5 — Security audit results

**All already correct — no changes made:**

- **Webhook HMAC:** All 7 webhook routes call `authenticate.webhook(request)` which performs Shopify HMAC validation before any handler logic runs. Any invalid signature returns 401.
- **Session validation:** All embedded routes call `authenticate.admin(request)` in their loader/action. Unauthenticated requests are redirected to OAuth by the framework.
- **Input sanitization:** `sanitizePromptInput()` is applied to all brand-voice fields (storeName, tone, audience, differentiators, keywords, avoidPhrases, additionalNotes, sampleContent) in every AI generation path in `ai.server.js`.
- **Secret handling:** `SHOPIFY_API_SECRET` and `ANTHROPIC_API_KEY` never appear in any route return value or client-side code. `SHOPIFY_API_KEY` (the public client ID) is sent to App Bridge — correct by design.
- **Flow endpoint auth:** `api.generate.jsx` uses HMAC-SHA256 with `crypto.timingSafeEqual` in HMAC mode, and a constant-time token comparison in token mode. Replay prevention via 5-minute timestamp window.
- **Quota hard block:** `tryConsumeGeneration` is called server-side before every AI call. At the limit, `allowed: false` is returned and the caller returns an upgrade prompt without calling the AI.

---

## Already-correct items (not changed)

- **P3-2 Brand consistency:** No stray "ContentPilot" strings found in user-facing routes (the string appears only in internal handles/URLs, which were intentionally not renamed to avoid breaking installs).
- **P3-1 App icon:** Configured in Shopify Partner Dashboard — not stored in the repo.
- **P3-5 A11y:** Polaris console warnings were not reproducible in code inspection; existing `accessibilityLabel` usage appears on interactive elements. Skipped to avoid speculative changes to working UI.
- **Optimize Store metrics:** Already used `contentType: "description"` for its coverage count (= distinct products). Correct — not changed.
- **Bulk processor idempotency:** `processBulkJob` checks `job.status !== "queued"` before processing — already idempotent.
