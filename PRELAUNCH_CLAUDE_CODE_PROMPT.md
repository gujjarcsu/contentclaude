# Pre-Launch Completion & Audit — Navaal (Shopify App)

You are working in the local repo at `C:\Users\PC4\contentclaude` (Fly app slug: `contentclaude`, live at `https://app.navaal.ai`, formerly branded "ContentClaude"). This app was just renamed to "Navaal" and the rename has been deployed and verified live. Your job now is twofold:

1. **Fix three specific, already-diagnosed bugs** (full details below — don't re-diagnose from scratch, the root causes are known).
2. **Run a full pre-launch completeness audit** of the whole app and fix anything else you find that's broken, missing, or risky before this goes live to real merchants.

Read this entire document before starting. Work through it in order. **Do not run `fly deploy` or `shopify app deploy` at the end — stop before deploying and present your findings/diff for review first.** Everything up to and including local commits is fine to do without asking; the actual production push is not.

---

## Ground rules — read this first

- **Verify every edit.** After any file change, run a syntax/parse check immediately (`node --check` for `.js`, `npx eslint <file>` for `.jsx` — the project's own eslint config works fine for this) before moving to the next change. Do not batch multiple edits and check at the end — check after each one.
- **Run the existing test suite** (`npm test` — this project uses Vitest, config at `vitest.config.js`, tests live in `tests/`) after your changes and confirm it's green. If tests fail because of something you changed, fix it. If tests were already failing before you touched anything, note that separately — don't silently "fix" it into passing in a way that just hides the problem.
- **Run `npm run lint`** across the whole repo at the end, not just the files you touched, and make sure nothing new broke.
- **Never silently swallow an error.** This exact pattern (`.catch(() => {})` around a Shopify GraphQL mutation, with the caller then reporting false success to the merchant) is the root cause of Bug 2 below. Before writing any new error handling, ask: "if this fails, will anyone ever find out?" If the answer is no, that's a bug.
- **Multi-tenant awareness:** this app has real, currently-installed merchant shops beyond the dev store (`contentpilot-dev2.myshopify.com`) used for testing. Any backfill, data migration, or bulk operation must run across **all shops in the database**, not just the dev store. Read from the `shop` column, don't hardcode a single shop.
- Where a fix requires a decision only the business owner can make (pricing, which env var to trust, whether to remove a feature flag, anything touching money or legal), **do not silently pick one** — implement it in a way you're confident is correct, but flag it clearly in the final summary so I can confirm before it goes live.
- At the end, write a single report file: `PRELAUNCH_AUDIT_REPORT.md` in the repo root. Structure required:
  - **Fixed automatically** — exact files/lines changed, why, and how you verified it (test run, lint, manual trace).
  - **Needs manual action from me** — step-by-step, in plain language, assuming I am not a developer. Include exact URLs/screens to click through (Shopify Partner Dashboard, Fly dashboard, etc.) where relevant.
  - **Flagged but not changed** — anything you found suspicious/risky but didn't touch because it needs a business decision, explain why and what the options are.
  - **Confirmed working / nothing to do** — brief list, so I know what was checked and is fine, not just what was broken.

---

## Priority 1 — Three known, already-diagnosed bugs

### Bug 1: Shopify App Proxy returns 404 for `/apps/navaal/llms.txt` and `/apps/navaal/llms-full.txt`

**Symptom:** On the live storefront of an installed shop (e.g. `https://contentpilot-dev2.myshopify.com/apps/navaal/llms.txt`), this returns a hard 404. Confirmed via direct in-page `fetch()` from the shop's own origin — so it's not a browser/network artifact, it's a real HTTP 404.

**What's already been ruled out:**
- TLS cert for `app.navaal.ai` — confirmed issued and active (`fly certs show app.navaal.ai --app contentclaude`).
- `shopify app deploy` — has been run successfully since the rename (confirms App Proxy subpath `navaal` under prefix `apps` is registered per `shopify.app.toml`'s `[app_proxy]` block).
- The Fly app itself is reachable and serving the correct (post-rename) build — confirmed via `/api/health` and the homepage title.
- Direct unsigned requests to `https://app.navaal.ai/proxy/llms.txt` correctly return a controlled "Not found" (expected — that route requires Shopify's signed proxy request via `authenticate.public.appProxy`).

**The actual bug:** the route handler in `app/routes/proxy.llms[.]txt.jsx` (and the mirrored `proxy.llms-full[.]txt.jsx`) does this:
```js
let shop;
try {
  const { session } = await authenticate.public.appProxy(request);
  shop = session?.shop;
} catch {
  return new Response("Not found", { status: 404 });
}
```
The catch block is silent — no logging at all. So even the request that's genuinely coming through Shopify's signed proxy is being rejected by `authenticate.public.appProxy`, and there is currently **no way to know why** from the logs, because nothing is logged.

**What to do:**
1. First, add logging to the catch block (log the error message/stack, not just swallow it) in both `proxy.llms[.]txt.jsx` and `proxy.llms-full[.]txt.jsx`. Deploy this logging-only change to a scratch/test path if possible, or reason carefully about whether it's safe to ship straight to `contentclaude` — either way, get this logging in place before attempting a blind fix.
2. Reproduce the 404 (navigate to `https://contentpilot-dev2.myshopify.com/apps/navaal/llms.txt` while logged into that store's admin, or curl it) and immediately check `fly logs --app contentclaude` for the newly-logged error.
3. Common causes for `authenticate.public.appProxy` throwing: API secret mismatch between Fly's `SHOPIFY_API_SECRET` and what's registered in the Partner Dashboard for this app (client_id `1279a14cca41d4a6f8e6e3c485870b77`); shop domain resolution issue; a Shopify-Remix package version mismatch; or the app proxy signature validation genuinely failing for a config reason. Check `fly secrets list --app contentclaude` for which secrets exist (you won't see values, but confirm `SHOPIFY_API_SECRET` / `SHOPIFY_API_KEY` are present) and cross-check against `.env.example` for what's expected.
4. Fix based on the actual logged reason — don't guess further once you have real evidence.
5. Re-test on the live storefront proxy path (not just the bare `/proxy/llms.txt`) to confirm the fix actually resolves the 404 end-to-end.
6. This is a core feature of the app's value proposition (AI-search/GEO catalog feed) — treat it as high priority, not a nice-to-have.

### Bug 2: FAQ metafield write failures were silently reported as success (code fix already deployed — this is the backfill)

**Root cause (already fixed and deployed, for your context):** `app/utils/bulkProcessor.server.js`'s `setFaqMetafield()` and the manual-publish path in `app/routes/app.products_.$id.jsx` were writing the FAQ JSON-LD metafield via Shopify's `metafieldsSet` GraphQL mutation but never checking the `userErrors` array in the response body — a rejected mutation returns HTTP 200, so `res.ok` alone can't detect failure. The bulk path additionally marked the local `generatedContent` DB row as `"published"` *before* attempting the metafield write, then swallowed any failure with `.catch(() => {})`. Net effect: merchants' Products lists showed a false "FAQ ✓" for products where the FAQ schema was never actually written to Shopify. This has been fixed (userErrors are now checked, failures now downgrade the row back to `"draft"` and log via the job logger) and the fix is live on `contentclaude`.

**What's NOT done yet — this is your task:** the fix only affects *future* publishes. Every shop's existing data may have `generatedContent` rows with `contentType = "faq"` and `status = "published"` where the corresponding Shopify metafield (`namespace: "contentclaude", key: "faq_schema"`) is actually missing or empty. On the dev store alone, 15 of 17 products had no metafield despite several showing "FAQ ✓" in the UI.

Write and run a backfill that, **across every shop in the database**:
1. Finds all `GeneratedContent` rows where `contentType = "faq"` and `status = "published"`.
2. For each, fetches the live product's metafield from Shopify (`contentclaude.faq_schema`) using that shop's stored offline access token.
3. If the metafield is missing/empty on Shopify but the DB says "published": either (a) re-attempt the write using the already-stored `generatedContent` (the FAQ text is already in the DB — no new AI generation/cost needed, just re-run the metafield write with the now-fixed error-checking) and confirm it lands, or (b) if the write fails again, downgrade the DB row to `"draft"` so the merchant's UI stops lying, and log which shop/product needs the merchant's attention.
4. Produce a report (as part of your final `PRELAUNCH_AUDIT_REPORT.md`, or a separate `FAQ_BACKFILL_REPORT.md` if cleaner): per shop, how many products were checked, how many were successfully repaired, how many still need attention and why (e.g. AI token/API cost consideration — repairing many products across many live merchant shops in one run has a real time/API-rate cost; batch and throttle sensibly, reuse the existing throttle/retry patterns already in `bulkProcessor.server.js` rather than writing new ones).
5. Be careful with Shopify API rate limits across multiple shops running back-to-back — reuse the existing backoff/retry logic already in the file rather than hammering the API.
6. This must be safe to re-run (idempotent) in case it needs to be stopped and resumed.

### Bug 3: `BILLING_TEST_OVERRIDE` is still set on Fly

This was flagged during the rename work but never investigated. Before touching it:
1. Search the codebase for every place `BILLING_TEST_OVERRIDE` is read (likely in `plans.server.js` or billing-related code) and understand exactly what it does when set vs unset.
2. Check `fly secrets list --app contentclaude` to confirm it's currently set (you won't see the value).
3. Determine: is this bypassing real Shopify billing charges entirely for all shops, or scoped to specific test shops only? This materially affects whether real merchants are currently being charged correctly.
4. **Do not remove or change this secret yourself.** Billing changes have direct financial impact. Instead, explain clearly in the report exactly what it does, what you believe the correct production value is, and the exact command to change it — and let me run that command myself (or explicitly confirm before you do).

---

## Priority 2 — Full pre-launch completeness audit

Go through each of these areas. For each, either confirm it's fine (briefly, in the report) or fix it (if it's a code fix you're confident about) or flag it (if it needs a decision or external/manual action).

**Security & secrets**
- Diff `.env.example` against `fly secrets list --app contentclaude` (presence only, not values) — flag anything referenced in code but missing as a secret, and anything set as a secret but no longer referenced in code (dead secrets, safe to eventually remove but flag, don't remove).
- Scan the repo (not just `git log`, the actual current files) for any hardcoded API keys, tokens, or credentials that should be env vars instead.
- Confirm webhook routes validate Shopify's HMAC signature (should be handled by the Shopify Remix library's `authenticate.webhook`, but confirm every webhook route actually calls it and isn't accidentally using a different/no-auth path).
- Confirm the App Proxy routes and any other public (non-embedded-admin) routes have basic abuse protection (rate limiting, or at least won't crash/leak data under a malformed or high-volume request).

**Billing & plans**
- Confirm the plans/pricing shown in the app's own Plans & Billing UI (`app/routes/app.plans...` or similar) match what's actually enforced server-side (`plans.server.js` / entitlement checks) — no mismatch between advertised limits and enforced limits.
- Confirm Shopify subscription webhook (`app_subscriptions/update`) correctly updates the local plan/entitlement state.
- Related to Bug 3 above — don't duplicate work, just make sure the billing flow as a whole (trial, upgrade, downgrade, cancel) is sane.

**GDPR / compliance webhooks (required for Shopify App Store)**
- Verify all three mandatory webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) are correctly wired, return proper responses, and actually do something meaningful (even if the app's stance is "we store no PII," confirm the handler correctly reflects that and logs the request per Shopify's requirement — `GDPRRequest` model exists in the Prisma schema, confirm it's actually being written to).
- Confirm `app/uninstalled` webhook cleans up appropriately (session data, any scheduled jobs, etc.) so a reinstall works cleanly.

**Branding sweep (final pass)**
- We already did a careful rename audit and intentionally left some things as "ContentClaude" (internal identifiers, the `contentclaude.faq_schema` metafield namespace, the Fly app slug, internal-only comments, the `X-ContentClaude-Token` API header family). Do NOT touch any of those intentionally-kept items.
- But do check for anything we might have missed that IS merchant- or customer-visible: any transactional emails the app sends (if any), any error pages / 404 pages shown to merchants or storefront visitors, any text in webhook payloads or support-facing tooling that a real person (not just code) would read and be confused by seeing "ContentClaude" in a "Navaal" app.
- Open `public/screenshot-*.svg` (the App Store listing screenshot assets) and visually confirm they actually render "Navaal" branding, not leftover "ContentClaude" text baked into the SVG as static content (these were touched in the rename diff, but I haven't visually opened them to confirm — do that now).

**Data integrity / error handling patterns**
- The FAQ metafield bug (Bug 2) was caused by a broader anti-pattern: a `.catch(() => {})` or unchecked-`userErrors` swallow around a Shopify write, combined with a DB status update that assumes success. Do a full sweep of the codebase for this same anti-pattern anywhere else a Shopify GraphQL mutation is called (not just metafields — product updates, image uploads, blog post publishing, etc.). For each one found, confirm `userErrors` is actually checked and failures are surfaced (logged at minimum, ideally reflected in whatever status the merchant sees). Fix any you find with high confidence; flag anything ambiguous.
- Confirm `fly.toml`'s release command (`npx prisma db push --skip-generate`) is the right choice for a production app with live merchant data. `prisma db push` is a schema-sync tool typically recommended for prototyping; `prisma migrate deploy` (with tracked migration files) is generally the safer, more standard choice for production because it's versioned and reviewable. Assess whether this matters given the app's current maturity/stage, and flag your recommendation either way — don't silently change the deploy pipeline without flagging it, since this could affect how schema changes roll out.

**Observability**
- Confirm error monitoring (`captureException` calls exist in the code, e.g. Sentry) has a working DSN configured in production (`fly secrets list` for the relevant key) — errors that aren't being captured anywhere are errors nobody will ever see.
- Confirm the logger (`logger.server.js`) is actually emitting logs at a level that shows up in `fly logs` in production (not accidentally set to a level that suppresses warnings/errors).

**Fresh install / OAuth**
- We have only tested this app on an already-installed dev store. Test — if you have a way to (a spare dev store, or Shopify CLI's local testing flow) — a genuinely fresh install end-to-end: install → OAuth redirect through `app.navaal.ai` → land in the embedded admin correctly → welcome/onboarding flow triggers correctly (there's a `welcomeSeenAt` flag in `GrowthState` suggesting a first-run flow — confirm it actually fires for a brand-new shop and doesn't error).

**App Store listing readiness** (only relevant if this is going to public App Store review, not just merchant-direct install — confirm with me if unsure)
- Privacy policy URL, support email, and any other Partner Dashboard listing fields — confirm they're set, reachable, and reference the correct (Navaal) brand, not leftover ContentClaude references.
- Required scopes in `shopify.app.toml` (`write_products,write_content,write_metaobjects,write_metaobject_definitions`) — confirm every scope listed is actually used somewhere in the code, and nothing the app uses is missing from this list. Over-broad or under-declared scopes are a common App Store review rejection reason.

---

## What "done" looks like

By the end, I should be able to read `PRELAUNCH_AUDIT_REPORT.md` and know exactly: what you fixed and how you verified each fix, what I need to personally click through or decide (with exact steps), and what's confirmed solid. Then — separately, only once I've reviewed that report — we deploy.
