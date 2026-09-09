# WORLD-CLASS BRIEF — Navaal: AI SEO, AEO & GEO
### The one brief that takes this app from "approved" to "#1 in the Shopify SEO category, and paid"

Repo: `C:\Users\PC4\contentclaude` · App id 368479600641 · Prod: `app.navaal.ai` (Fly app `contentclaude`, syd) · Listing: apps.shopify.com/navaal-ai-seo-geo-content
Written 2026-09-09 from a full read of the source at `main` = `bd1fabc` (= the SHA `/api/build-info` reports in production right now), the live server, the live listing, and the last two weeks of PROGRESS/HUMAN-NEEDED.

---

## 0. READ THIS FIRST — how to work this brief

**The goal, stated once so it is never forgotten:** #1 app in the Shopify App Store SEO category, with real paying merchants. Every line below exists to move installs → first value → reviews → paid → retained. If a task does not serve that, it is not in this brief.

**Truth law (unchanged, non-negotiable):** nothing shown to a merchant that is not real; nothing claimed to the owner that is not measured. `PASS (code)` is never presented as live. Every phase ends with live proof.

**Order is mandatory.** Phases are numbered for a reason: Phase 0 fixes things that are losing money and breaking compliance *today*; Phase 1 makes the platform safe to change; Phases 2–3 are the product; 4–5 are growth. Do not start Phase 2 UI work while a Phase 0 item is open. Each phase is its own deploy with its own proof, appended to `PROGRESS.md`.

**Standing guardrails (every phase, every deploy):**
- G1 Re-run the path behind four App Store rejections after every deploy: Products → click the app name in Shopify's LEFT sidebar → lands on `/app` embedded, never `/auth/login`; browser-back to admin home → click app name again. Record with the browser URL bar visible.
- G2 `curl -sI https://app.navaal.ai/` → `302 /reembed`; `curl -sI -H "Referer: https://admin.shopify.com/" https://app.navaal.ai/auth/login` → `302 /reembed`. Paste output.
- G3 No new route skips `authenticate.admin` except webhooks and app-proxy routes.
- G4 No new access scopes (`write_products`, `write_content` only). If you believe one is needed, stop and ask.
- G5 `/api/build-info` SHA == `main` HEAD after every deploy. Paste both.
- G6 CI green on `main` with typecheck **blocking** (Phase 1 makes it blocking; until then, fix TS errors you touch).
- G7 Append-only `PROGRESS.md`; `HUMAN-NEEDED.md` lists only things a human must do, with exact commands.

**Already done — do not touch:** app rename (config + listing), install-source tracking + `Shop` model, uninstall-webhook HMAC fix, GA4 on the listing (`G-8H3DS31YQ8`), `/ → /reembed`, `rel="home"`, `/auth/login` re-embed on admin referer, billing callback landing in-admin.

---

## PHASE 0 — STOP THE BLEEDING (ship today; one deploy per group; each has a test)

These were found by reading the code at `bd1fabc`. Each is either losing revenue, breaking a Shopify requirement, or stranding a merchant.

### 0.A Compliance & data (P0)
1. **Mandatory GDPR webhooks 500 on every delivery.** `webhooks.customers.redact.jsx:29` and `webhooks.customers.data_request.jsx:29` run `deleteMany({ where: { createdAt: … } })` but `GDPRRequest` only has `processedAt` (`schema.prisma`). Prisma throws after the audit row is inserted → Shopify retries forever, duplicate audit rows, compliance flag on a periodic audit. Fix: `processedAt`. Test: a route test that delivers a valid-HMAC payload and asserts 200 + one audit row.
2. **Webhook headers are trusted unsigned** (`webhookAuth.server.js`). HMAC covers the body only; shop/topic/triggered-at come from headers, and `app/uninstalled` deletes all data for the *header* shop. Fix: require `payload.myshopify_domain`/`shop_domain` == header shop; reject `triggeredAt` older than 24h; dedup `x-shopify-webhook-id` in Redis (as `products/create` already does). Move `products/create`, `scopes_update`, `subscriptions_update` to the same direct-HMAC verifier — `authenticate.webhook` refreshes the token first and 500s for expired tokens (the exact retry-storm bug fixed in 08690b9).
3. **`webhooks.app.scopes_update.jsx`** `payload.current.toString()` throws on a missing field → 500 → retries. Guard it.

### 0.B Revenue & quota correctness (P0)
4. **Bulk jobs generate first, check quota second.** `app.optimize.jsx` and `app.products.jsx` (Generate All) enqueue every target id (up to 20,000) even though the UI says "your quota covers N"; `quotaSkipped` exists in the schema but is never written; `bulkProcessor.server.js` calls Sonnet (up to 4 images, 4,000 max tokens) *before* `tryConsumeGeneration`. A Growth merchant with 5,000 products costs you 4,800 discarded generations and a 24-hour job that logs "limit reached" 4,800 times. Fix: slice `productIds` to `remaining` at job creation and write `quotaSkipped`; in the loop do a cheap count check before the AI call; when remaining hits 0 mark the rest skipped in one write and finish. Test both.
5. **Interactive paths charge a credit before the AI call and never refund on failure** (`app.products_.$id.jsx` ~194/272/689, `app.collections.jsx` ~101, `app.blog.jsx` ~88, `app.welcome.jsx` ~213). A 45s timeout, a 5xx, or an open circuit breaker eats the credit. `refundGeneration` already exists (`plans.server.js`) and is only used for the A/B second credit. Fix: refund on any failure or empty output, on every path. Test: mock a 503 → usage count unchanged.
6. **Empty AI output is charged in bulk** (`bulkProcessor.server.js` ~236-264): no tags extracted → nothing saved → credit consumed, `completedCount++`. Fix: require at least one generated type before consuming; otherwise `[NO CHARGE]` + counted as failed with a real reason.
7. **"Resume job" double-charges** (`app.jobs.jsx` ~92): slices at `completedProducts`, ignoring `failedProducts`. Fix: resume from rows in `GeneratedContent` newer than `startedAt`, not from a counter.
8. **A paying merchant can be shown Free.** (a) `webhooks.app.subscriptions_update.jsx` downgrades on *any* CANCELLED/EXPIRED; a Starter→Growth upgrade emits CANCELLED(old)+ACTIVE(new) unordered, so if CANCELLED lands second the plan is Free while Shopify bills Growth. (b) The payload uses `admin_graphql_api_id`, not `id`, so `shopifyChargeId` is never set and `currentPeriodEnd` is nulled on every ACTIVE. (c) `billing.callback.jsx` treats a GraphQL error/401 as "no subscriptions" and syncs to Free with a `declined=1` banner right after the merchant approved a charge. Fix: on CANCELLED compare the id to `plan.shopifyChargeId` and re-query via `getActiveSubscriptions`; in the callback use `getActiveSubscriptions` and skip sync on `ok:false`; read the right payload fields. `syncBillingToPlan` must also invalidate the `canGenerate:` cache (today "limit reached" persists up to 60s after an upgrade).
9. **Bulk auto-publish reports success when Shopify throttled or errored** (`bulkProcessor.server.js` ~421-433, ~533-546): reads `data` and checks `data?.errors`; top-level GraphQL `errors` (THROTTLED, field errors) are never seen → rows saved `published`, credit consumed, Shopify untouched. `app.review.jsx` already does this right (`publishProductWithRetry`, `readMutationResult`). Fix: route bulk through the same helper. Test: THROTTLED response → row stays draft, retry scheduled.
10. **Trial/quota abuse:** `trialDays: 7` on every subscribe → cancel + resubscribe = new trial + fresh credits; uninstall deletes `Plan` + `UsageRecord`, so reinstall resets the free 25. Fix: persist `trialEndsAt` (column exists) and pass `trialDays: 0` when a trial was already used; keep a per-month usage counter on the surviving `Shop` row (a number, not content — GDPR-safe) and seed `UsageRecord` from it on reinstall.
11. **Verify on Fly, paste the output:** `fly secrets list -a contentclaude` shows **no** `BILLING_TEST_OVERRIDE` (if present, every real merchant gets a $0 test subscription) and **does** show `SENTRY_DSN`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `DATABASE_URL`. Names only, never values.

### 0.C Jobs that never finish (P0)
12. **A deploy or crash mid-job strands it in "processing" forever.** `fly.toml` has no `kill_timeout` (Fly default 5s) while `startup.server.js` drains for up to 30s, so every deploy SIGKILLs a running job; BullMQ's stall retry fires after `lockDuration` (30 min) and then no-ops because `bulkProcessor.server.js:22` returns unless `status === "queued"`; `recoverStuckJobs` only runs at boot for rows older than 30 min. Stuck rows also count toward the in-flight cap → "You already have jobs running". Fix: make the processor **resumable** (accept `processing` when `attemptsMade > 0`, skip products with `GeneratedContent.updatedAt > startedAt`); write `status: "failed"` on the worker `failed` event; run `recoverStuckJobs` every 5 min keyed on `updatedAt` staleness; `kill_timeout = "60s"`; `lockDuration` 5 min (per-product heartbeat already exists). Test: kill mid-job → resumes without double charge.
13. **Redis outage hangs "Start job"** (`generationQueue.server.js`): ioredis default offline queue + infinite retry, so `queue.add` blocks until the proxy 502s and the inline fallback is unreachable. Fix: `enableOfflineQueue: false, maxRetriesPerRequest: 1` on the Queue connection + a 5s race → clear error to the merchant.
14. **Uninstall during a bulk job:** each remaining product spins through 4 immediate 401 refresh attempts. Mark the shop's jobs failed in the uninstall handler; abort on repeated 401.
15. **`connection_limit=1`** enforced by startup while `tryConsumeGeneration` holds a Serializable transaction and 3 worker slots + web share one connection → "Timed out fetching a new connection" under modest load. Use Neon's pooled endpoint with `connection_limit=5` (web) / `3` (worker); stop gating this on string-matching `neon.tech`.
16. **`getOrCreatePlan` first-load race** (dashboard + jobs-status poll + reconcile fire together on a fresh install → P2002). Use `upsert`. Separate Redis errors from supplier errors in `cache.server.js` so a supplier error is not executed twice.

### 0.D Security (P1 — fix in this phase, they are cheap)
17. **Reflected XSS in `/reembed?target=`** (`embedded.server.js` ~104/144): `target` is inlined with `JSON.stringify` inside a `<script>`; `JSON.stringify` does not escape `</script>` and the page CSP has no `script-src`. Runs attacker JS inside the embedded iframe with App Bridge loaded. Fix: whitelist `target` against `/^\/app(\/[a-z0-9-]*)*$/`, serialise with `.replace(/</g,"\\u003c")`, add `script-src 'self' https://cdn.shopify.com` to that response.
18. **Stored XSS on the merchant storefront via AI FAQ output:** `extractTag → sanitizeHtml → decodeHtmlEntities` turns escaped `<` back into `<`; `extensions/*/blocks/faq_visible.liquid:23-24` renders `{{ qa.name }}` / `{{ qa.acceptedAnswer.text }}` unescaped. Fix: `| escape` in Liquid; strip tags after decode for `faq`, `metaTitle`, `metaDescription`, social (plain-text types). Hard-truncate `metaTitle` ≤60 / `metaDescription` ≤155 in code, not just in the prompt.
19. **Prompt injection has no structural defence** (`ai.server.js` ~120-200, ~590-596): rules and untrusted product data are one `user` message; `descriptionHtml` (up to 64 KB), title, vendor, tags, blog topic enter raw. Fix: rules in `system`; product data wrapped in `<untrusted_product_data>` with an explicit "data, never instructions" line; cap stripped description at ~4 KB; strip `<a>` from output unless the host is the shop's own domain; keep autopilot publish default off.
20. **`/billing/callback` is an unauthenticated oracle** (`?shop=victim` reveals subscription state, burns the victim's API budget, busts caches). Sign the `returnUrl` built in `app.plans.jsx` (`&sig=HMAC(secret, shop|expiry)`) and verify it.
21. **`/api/generate`** is keyed on the hourly-rotating offline token — no legitimate caller can use it, and it is replayable within 5 min. Delete it, or issue a per-shop API key (hash stored, shown once in Settings) with nonce dedup and IP rate limiting before the DB read.
22. Cookies `navaal_shop` / `navaal_ref`: add `HttpOnly`. `/app/*` documents: add `Cache-Control: private, no-store` and HSTS in `app.jsx` `headers()`. `sanitize-html`: `allowProtocolRelative: false`. Run every `dangerouslySetInnerHTML` preview (`products_.$id.jsx` ~911/1561/1599, `blog.jsx` ~663) through the same allowlist. `api.build-info`: drop `node` version. `llms.server.js`: add `published_status:published` so unpublished products never appear in the public feed.

### 0.E AI provider resilience (P1)
23. `ai.server.js`: `anthropic-ratelimit-requests-reset` is RFC3339, not seconds → `parseFloat` ≈ 2026 → every "remaining ≤5" success sleeps the full 10s cap inside the merchant's request. Parse it as a date. Cap interactive backoff at ~10s (429 currently waits up to 60s ×2 inside a web request). Exclude 429 from the global circuit breaker (5 concurrent 429s black out every shop for 60s). Retry once on AbortError/network error. Interactive routes: return "taking longer than usual — we'll keep going in the background" and hand the work to the queue instead of holding the request.
24. `generateSocial` and blog have no rate limit/credit consistency — bring them under `tryConsumeGeneration` + `rateLimit` like every other AI path.

### 0.F Observability (P0 — you are blind today)
25. **Sentry is effectively unwired:** `captureException` is called in two places in `bulkProcessor`; `entry.server.jsx` exports no `handleError`; init is lazy so `unhandledRejection` capture never activates. Fix: eager `Sentry.init` at boot, `export function handleError(err, { request })`, `process.on("unhandledRejection")`, and a Sentry alert rule "new issue → email hello@navaal.ai" (HUMAN-NEEDED if it needs the dashboard).
26. **Health check depth:** `/api/health` says `ok` when Redis is dead (memory fallback) and never checks the worker or the queue. Add `?deep=1`: DB ping with 2s timeout, Redis ping 1s, `Queue.getJobCounts()`, `worker.isRunning()`, circuit-breaker state; 503 when the worker is dead or `failed` > 0 for > 10 min; `degraded` (200) otherwise.

**Phase 0 proof:** unit tests for every numbered item; live: kill a job mid-run and watch it resume; upgrade Starter→Growth on the dev store and confirm the plan never flickers to Free; deliver a `customers/redact` webhook and get 200; `fly secrets list` names pasted.

---

## PHASE 1 — A PLATFORM THAT RUNS FOR 100 YEARS (infra, CI, data, alerting)

1. **Migrations.** There is no `prisma/migrations` folder; `release_command = "prisma db push"` on every deploy is one `--accept-data-loss` away from dropping a column with no rollback. Baseline with `prisma migrate dev --name baseline` against a shadow DB, commit the folder, switch to `prisma migrate deploy`. Document rollback (`fly releases rollback` + the matching migration down-step).
2. **Topology.** Today: one `shared-cpu-1x` 512 MB in Sydney running SSR + BullMQ worker + Prisma + image-to-base64 AI calls. Measured from a US edge: `/api/health` TTFB 450–1000 ms before any real work — Built for Shopify measures admin LCP for real merchants, most of whom are US/EU. Target: `[processes] web / worker`; web ×2 in `iad` + `syd` (`min_machines_running=1` each), worker ×1 `shared-cpu-2x` 1 GB, `auto_stop=off` for the worker, `kill_timeout=60s`, `swap_size_mb=512`. Move Upstash to the worker's region. Neon: 7-day PITR. Expected ≈ $45–70/mo total. Write the exact `fly.toml` and a `worker.js` entry; prove the worker survives a web deploy.
3. **Docker:** `node:22-alpine` (Node 20 is EOL), `USER node`, keep the `.dockerignore` (verified present; `tests/` and `*.md` excluded — do not regress it).
4. **CI:** make typecheck blocking (fix the TS errors first — list them); keep `npm audit` informative; add a **post-deploy smoke job**: `/api/health?deep=1` 200, `/api/build-info.sha == $GITHUB_SHA`, `HEAD /app` returns 302/200, `GET /` → 302 `/reembed`; fail loudly. Add `cancel-in-progress: false` semantics for deploy (already queued) and document it.
5. **Alerting (the owner must be told, not have to look):** uptime monitor on `/api/health` from 2 regions every 60s (Better Stack / UptimeRobot — free tier; HUMAN-NEEDED for the account); Sentry alert rule; a scheduled deep-health call every 5 min that emails on 503; **the daily digest (old item 8)** — installs, uninstalls, first-drafts, first-publishes, review asks and outcomes, jobs failed, AI error rate, quota-hit count, upgrades — one email to hello@navaal.ai at 07:00 AEST from the worker process. Answer these four in PROGRESS.md with "alert / log line / nothing" **after** the work: Anthropic down 1h; Redis down; Neon down; deploy breaks `/app`. All four must read "alert".
6. **Polling load:** `JobProgressTicker` hits `/api/jobs-status` every 15s on every open admin tab forever (auth + Prisma each time); Jobs page double-polls. Poll only while the layout loader or an action reports an active job; stop after two idle responses; use `revalidator` on the Jobs page only.
7. **Backups & retention:** Neon PITR 7 days; nightly `pg_dump` to R2 (worker cron); document restore in the runbook and run one restore drill.
8. **Docs:** rewrite `DEPLOYMENT.md` (it describes Railway, a non-existent migrate flow, `BILLING_TEST=false in code`, and `write_metaobjects` that startup warns against). Add `docs/RUNBOOK.md` (what to do when: AI down, Redis down, Neon down, bad deploy, stuck jobs, billing dispute, GDPR request), `docs/SECRETS.md` (inventory by name, where set, rotation), `docs/ARCHITECTURE.md` (one page, one diagram).
9. **Repo hygiene:** move the six root `*_RESOLUTION/REPORT.md` files to `docs/history/`; `git worktree prune` the three stale agent worktrees at `ff52f34` (recover the uncommitted quick-start route/helper from them first — see Phase 3); delete `gauntlet-*`, `billing-*`, `repro-incognito`, `reviewer-proof-video`, `proof-items12` outputs and gitignore the patterns; move the ~30 Playwright proof harnesses in `scripts/` to `tools/proof/` (excluded from Docker) with a README saying which touch production; keep `test-seed-usage`, `fix-legacy-alttext-rows`, `backfill-faq-metafields` but make dry-run explicit in their names. **Delete `build/_to_delete/audit-src.tgz`** (a source snapshot made for this audit that includes the e2e auth folder).
10. **Tests that matter:** coverage `include` is `app/utils/**` only. Add route tests for: `/` and `/auth/login` re-embed; `_index` first-run routing; review publish (THROTTLED path); optimize action (quota slicing); products Generate All; jobs resume/cancel; `products/create` autopilot bound; `subscriptions_update` ordering; `api.jobs-status`. Replace regex-over-source "tests" (`no-dark-patterns`, half of `login-deadend`) with behaviour tests. Keep the Playwright e2e as a manual pre-release gate against `navaal-qa-fresh`, documented; never against a real merchant store.

---

## PHASE 2 — MAKE IT SIMPLE (Release 0 — the world-class UI)

Principle: a merchant who has never seen the app understands every screen in 5 seconds, never sees two different numbers for the same thing, and is never sold to inside the app. **Remove before you add.** Polaris only — Built for Shopify reviewers reject custom chrome.

### 2.1 One definition of product state (fixes the 5-vs-3 / 12-vs-14 bug)
There are four definitions of "optimised" today: `metrics.server.js getContentMetrics` (distinct products with any published row), `optimize.jsx` (description rows only), `products.jsx` tabs (per-page, description status only), `seo-audit.jsx` (Shopify-side empty description). Make `getContentMetrics` return **one status per product** — `needs_content` / `draft` / `published` / `rejected`, computed from the description row first, then meta — and make every screen, tab, subtitle, badge and the Optimise action consume it. Delete the local counts in `optimize.jsx`, `products.jsx`, `analytics.jsx`. Add a test that renders Home, Products and Optimise from one fixture and asserts identical counts. Never mix row counts and product counts on one screen.

### 2.2 Navigation: 12 items → 5
Today `app.jsx` renders Home(rel=home)+Dashboard+Products+Optimise+Review & Publish+SEO Audit+Blog+Collections+Results+Analytics+Jobs+Settings+Plans. Six overlap. New nav: **Home · Products · Review · Blog · Settings** (`rel="home"` on Home, first). Mapping:
- `_index` → Home (absorbs Results stats, SEO score card, usage card with "Manage plan" link).
- `products` → keep; absorbs "Optimise store" as the page primary action, SEO Audit as a "Needs attention" sort/filter and a score column; Collections becomes a tab.
- `products_.$id` → keep (single-product detail + generate).
- `review` → keep; becomes the **only** review UI (the product-page Content tab's review affordances redirect here).
- `optimize` → merge into Products primary action + one confirm modal (options: content types; auto-publish is NOT here — see 2.6).
- `seo-audit` → merge (score + issues on Home card; full table reachable from "View audit" on Home, no nav slot).
- `results`, `analytics` → merge into Home.
- `jobs` → keep the route, remove from nav; reachable from the progress banner and Home.
- `blog` + `blog.posts` → Blog.
- `settings` → keep; `plans` becomes a section inside Settings **and** the target of every quota banner/usage card (conversion paths stay one click).
- `setup`, `welcome`, `embed-status`, `review-request`, `upgrade-prompt`, `plans-reconcile` → no nav (and `welcome`/`setup` are retired in Phase 3).
If you disagree with a merge, say why in PROGRESS.md — but five max.

### 2.3 One bulk action, one name
"Generate All (17)", "Optimise N Products", "Fix All Missing Content", "Refresh Stale Content" (which routes to Optimise, which only targets *missing* content — the button does not do what it says), "Quick Generate", "Bulk Jobs →" are the same job with six names. Keep exactly one: **"Optimise store"** — always means: generate for every product in `needs_content`, save as drafts, take me to Review. Also fix: "Quick Generate" on Products submits a *bulk* job, so Free/Starter merchants get "Bulk generation requires Growth" from the most obvious button — route it to the product page.

### 2.4 Kill marketing inside the app
`GeoValueBanner` (5 pages), `ContentBenefits` (product page), `_index` "How Navaal works", `optimize.jsx` six-bullet pitch, `review.jsx` "Generated by premium AI…", Blog "Start driving organic traffic ✏️" — merchants already installed. Replace with ONE dismissible Polaris `Banner` (info) on Home only, two lines on GEO/AEO with a "Learn more" link. Delete the components.

### 2.5 Polaris only (Built for Shopify blocker)
Remove: the dark/gradient heroes (`_index.jsx` ~285-310, `welcome.jsx` ~529-542, `GeoValueBanner`), the `JobProgressTicker` animated gradient bar with emoji and `role="button"` div (`app.jsx` ~123-188) → a Polaris `Banner` with `ProgressBar` shown only while a job runs, the hand-rolled Plans cards and raw `<button style>` (`plans.jsx` ~301-449, and `mobile.css` ~692-702 that props them up), the Settings emoji tone picker (`settings.jsx` ~295-333), coloured borders in `UpgradePrompt`, the accent stripe in `review.jsx`, the CSS-grid div in `results.jsx`. Replace `lucide-react` (10 files, hard-coded hex colours) with `@shopify/polaris-icons` + `Icon tone`. Remove every emoji from UI strings (~400 occurrences: `🔒`, `🎉`, `⌘↵` in a primary button label, `→` on nearly every button). Remove `!important .Polaris-*` overrides in `mobile.css` (they break on Polaris upgrades). `grep` proof of zero references to the deleted components.

### 2.6 Auto-publish in one place, with a confirm, and fix the regenerate bug
Auto-publish is exposed in five places (product page checkbox, Products bulk panel, Generate All modal, Optimise ×2, Settings Autopilot). Products bulk panel submits with **no** confirm. **Bug:** per-section "Regenerate" and the Alt Text tab call `handleGenerate(overrideTypes)` which skips the confirm when `overrideTypes` is set — with auto-publish ticked, "Regenerate" publishes live with no confirmation. Fix: auto-publish lives in Settings only ("Publish without review"), off by default, with a destructive-tone confirm modal the first time it is switched on; every generate path reads it from Settings; the listing promise "nothing goes live until you approve it" stays literally true unless the merchant deliberately switched it off.

### 2.7 Primary actions
Exactly one primary per page, state-driven on Home: `drafts > 0` → "Review N drafts"; `needs_content > 0` → "Optimise N products"; else "Run audit" (secondary "Write a blog post"). Today Home has 5 primary-styled buttons; Products has 5 generate entry points; product page's "Publish to Store" is below four cards and Social in tab 1 (move to `Page primaryAction`); Review has two identical primaries plus per-card primary "✓ Approved" toggles. Never render a disabled primary.

### 2.8 The Review screen is the heart of the app
Today: no side-by-side, edits held in React state and lost on pagination/search, all drafts pre-approved so one click publishes content never opened, "Reject skipped" / "Skipped — tap to include" as buttons, contentType keys shown as badges (`metaTitle`), quality score with no explanation. New: one screen, **Current | Proposed** side by side per field (stacked at 375px), per-product Approve / Edit (inline, persisted as you go) / Skip, "Approve all on this page" explicit (not default), Enter approves, → next, App Bridge Toast "Published to Shopify" (keep), plain-language field names, the score explained in one line on hover. Every "Review drafts" button and every finished bulk job lands here.

### 2.9 Copy
One spelling: US English (`Optimize`) — 16× "Optimis-" vs 17× "Optimiz-" today — and mirror it on the listing (owner does the listing edit; put it in HUMAN-NEEDED). No jargon to merchants: "Bulk Jobs", "Enhance mode", "A/B Variants", "Autopilot", "GEO · Generative Engine Optimization", "llms.txt", "JSON-LD", "activation!", "Requires the products/create webhook", `Product #123456`, raw GIDs in job errors. No paragraph longer than 2 lines anywhere. Remove unverifiable claims ("world-class standard", "keeps your SEO rankings strong", "wins the click") and dark-pattern-adjacent copy (hero subtitle turning into an upsell when quota is low; "Only N left!" in red inside the generate panel). Quota is stated once, plainly, in the usage card.

### 2.10 States
Every screen: `SkeletonPage` (exists — keep `useRouteLoading`), `EmptyState` with one action (missing on SEO Audit, Analytics, Optimise, Collections-without-action, Blog uses a custom card), error `Banner` with Retry (missing on optimize/review actions; social error is plain red text; Jobs swallows retry/cancel errors). 0-product store: `EmptyState` "Add products in Shopify to get started" with a link to admin Products — never a spinner, never "0/100" in red. 5,000-product store: Review loads all draft ids into memory; Optimise/Generate All paginate 80×250 synchronously inside a form action (30s+ spinner) — move enumeration into the worker and stream progress.

### 2.11 Performance feel
SEO Audit does up to 25s of sequential GraphQL before first paint — paginate with backoff, `defer` the table, show the score first. Dashboard: `defer` recent activity and blog stats. Products/product page/review loaders have sequential awaits — parallelise. Measure LCP/CLS/INP from a **US** admin with Playwright + web-vitals on Home, Products, Review, product page at p75 over 10 loads; targets LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms (Built for Shopify). Report before/after numbers.

### 2.12 Mobile & accessibility
375px: ticker overflow (fixed 260px bar), Home hero `InlineStack`, Optimise 4-checkbox row, Plans grid; global `min-height:44px` on every button distorts `size="slim"` links. Fix per screen, screenshot every screen at 375px. A11y: no `role="button"` divs, no colour-only status (pills `✓`/`draft`, red/green numbers → Badge with text), real labels on `TextField`s (`review.jsx` ~602/782 use `label=""`), contrast ≥ 4.5:1 (custom palette fails), sanitise every `dangerouslySetInnerHTML`.

### 2.13 CC self-audit before coding 2.1–2.12
Install on a fresh dev store as a brand-new merchant. Record every screen, button, number and sentence. For each: keep / merge into X / delete, one line of reasoning. Table in PROGRESS.md. Then implement. Anything a first-time merchant would trip on that is not listed here: fix it and list it.

---

## PHASE 3 — FIRST VALUE, REVIEWS, CONVERSION (Releases 3–5, updated to the real state of `main`)

**State of play you must respect:** commit `ff52f34` ("growth 3-5 foundation") already added the `Shop` first-value columns (`productCountAtFirstLoad`, `quickStartStartedAt`, `firstDraftSeenAt`, `firstPublishAt`…), `ReviewRequestAttempt`, `UpgradePrompt`, `reviewAsk.server.js`, `upgradePrompts.server.js`, `ttvReport.server.js`, `catalogGaps.server.js`, `firstValue.server.js`, `UpgradePrompt.jsx`, `ReviewRequest.jsx`. The quick-start route and its helper exist **uncommitted** in one of the three agent worktrees at `ff52f34` — recover them before `worktree prune`. `tests/routes/no-dark-patterns.test.js` is untracked and currently fails against `main` (the `_index` redirects to `/app/welcome` and `/app/setup` are still there). `reviewAsk.server.js` is dead code — nothing calls `openReviewAsk`/`recordReviewOutcome`; the live ask path is `GrowthState.reviewRequestedAt`, and `app.jobs.jsx` fires `shopify.reviews.request()` on **page load** (derived from loader data), which a reviewer reads as a soft dark pattern. Reconcile all of this — one design, one code path, dead code deleted.

### 3.1 Retire `app.welcome.jsx` (magic moment) and `app.setup.jsx`; absorb the engine
Decision made with the owner: retire the route, keep the engine. Carry into the Home "Start" state: the store-wide GEO+SEO score reveal behind a skeleton as the headline ("Your store scores N/100 — these 3 products hurt most"), the weakest-product before/after, never-recharge-on-refresh idempotency (key by shop+product), the 55s watchdog → retry state. Delete `/app/welcome`, `/app/setup`, `FEATURE_MAGIC_MOMENT` and its Fly secret (HUMAN-NEEDED), `GrowthState.welcomeSeenAt`/`setupCompletedAt` in favour of the `Shop` first-value columns; `/app/welcome` and `/app/setup` become same-origin 302 → `/app`. No plan split (Free and paid both get the 3-product flow). No setup checklist; brand voice stays in Settings with inferred defaults. Commit `no-dark-patterns.test.js` once it passes. Recover `GROWTH_ENGINE_REPORT.md` from git; note in PROGRESS.md which ideas were absorbed and which dropped, one line each.

### 3.2 Time to first value < 2 minutes
While `Shop.firstDraftSeenAt` is null, Home renders the Start state on `/app` — **no redirect, no new top-level route** (the embedded chain stays exactly as proven). Start: no forms; pick the 3 weakest products via the existing scorer; generate immediately with inferred defaults; skeletons; render straight into the Phase 2.8 Review screen for those 3; stamp `firstDraftSeenAt` when the first proposal renders, `firstPublishAt` on first approve. Spend ≤ 3 free credits; show remaining quota inline. Then normal Home with the state-driven primary. Instrument first-load → `firstDraftSeenAt` in ms; report p50/p90 from ≥ 5 real fresh installs on dev stores (`ttvReport.server.js` exists — use it). Accept: fresh install, ≥ 10 products → first proposal < 120s wall-clock, recorded from the install grant screen with the URL bar visible; 0 products → the Phase 2.10 EmptyState.

### 3.3 Compliant review request — one code path
`shopify.reviews.request()` only. Trigger: after the merchant's 3rd successful Approve **in the action they just confirmed** (never on load, never on error, never in Start) or after an audit re-run scores higher than the previous — whichever first. Let Shopify enforce eligibility; store the result on `Shop` (`reviewLastAskedAt`, `reviewLastCode`, `reviewShownAt`, `reviewDoneAt` — columns exist) and never re-fire on a terminal code. Delete either `reviewAsk.server.js` or the `GrowthState` path — keep one. Remove the on-page-load ask in `app.jobs.jsx`. Proof: network/console trace at the trigger; Shop row updated; no fire on install landing or reload.

### 3.4 Quota-aware conversion — two surfaces, not six
Today a quota-hit merchant sees six upsell surfaces (Home hero + usage card + Products banner + bulk panel + product page ×2 + Optimise). Keep two: (a) at ≥ 80% used, one dismissible `Banner` on Home + Products ("20 of 25 free generations used — Growth includes 200/month" → Settings › Plan with `?from=quota80`; dismiss persists 7 days); (b) at 100%, the generate/optimise actions are replaced (not hidden) by a Polaris `Card` showing what Growth includes → `?from=quota100`; audit, review and approve of existing drafts keep working. Persist `from` into `UpgradePrompt`/`Shop.upgradePromptSource` when a subscription activates through the existing `/billing/callback` (do not touch its redirect logic). Honest copy: no countdowns, no fake social proof, no "limited time", no red "Only N left!". Plans page rebuilt in Polaris (Phase 2.5); downgrade must not say "Cancel current plan to switch" — Shopify replaces the subscription on approval, say so. Accept: drive a dev store 0 → 20 → 25 with URL bar visible; upgrade from the 100% card → Approve → back in-admin with the plan active and the source recorded.

---

## PHASE 4 — A SMART APP THAT DELIVERS (results that are real)

Merchants stay for results. Results must be measurable inside what the app can see — content quality and coverage, not traffic claims the app cannot verify.

1. **Quality gate before anything is saved:** every generated description/meta/FAQ passes `contentScorer` + hard rules (meta lengths, no competitor/external links, language == shop locale, no placeholder text, no repeated sentences across the catalogue — duplicate-content check against the shop's other generated descriptions). Below threshold → regenerate once → else save as draft flagged "needs a look" with the reason. Never publish a failing item via autopilot.
2. **Post-publish verification:** after every `productUpdate`/metafield write, re-read the product and confirm the field equals what we sent; mismatch → mark `published_unverified` and surface it in Review. This is the difference between "we think it's live" and "it's live".
3. **Before/after on every product and on the store:** the audit score per product before generation and after publish, stored, shown on the product row and summed on Home ("Store SEO score 61 → 84 since install"). This is the merchant's proof and the review-ask trigger.
4. **Brand voice inferred, not asked:** derive tone/keywords from the shop's existing top-selling product copy and store name on first run; Settings lets them override. No gate.
5. **Autopilot (products/create) is bounded and safe:** dedup already exists; add per-day cap, quality gate, draft-only unless the Settings switch is on, and a Home banner "3 new products were optimised — review".
6. **Large catalogues:** 5,000+ products — enumeration and scoring in the worker with progress, never in a form action; pagination with THROTTLED backoff everywhere `products(first:…)` is used (`products.jsx` currently dereferences `gqlData.data.products` with no `errors` check → 500 on THROTTLED).
7. **Content versions & restore** already exist — make "Restore original" one click on the product row and mention it in the confirm modal copy.

---

## PHASE 5 — GROWTH SURFACES (old items 6, 7, 9, 10)

6. **Install funnels on owned surfaces:** navaal.ai, Bilby report footer, every free tool page → `/go?ref=<surface>` (exists) → listing. Track in the digest by `installSource`.
7. **Listing assets:** after Phase 2 lands, capture 5 desktop 1600×900 + 3 mobile screenshots of the NEW screens (Home Start, Review, Products, Home with score, Settings › Plan) into `/listing-assets`; owner uploads. Current listing screenshots show the old name and old UI.
9. **Admin performance baseline for Built for Shopify:** the Phase 2.11 Web Vitals script run weekly from `iad` and `syd`, numbers in the digest; apply for the badge when installs/reviews thresholds are met (owner step).
10. **Sec-Fetch-Dest hardening** on the login re-embed and `rel="home"` tidy-up — last, as agreed.

---

## VERIFICATION & REPORT FORMAT (every phase)

For each numbered item: commit SHA(s), deployed SHA, **LIVE-verified** (with the measured number or the recording path) or **code-only** — say which, plainly. Guardrails G1–G7 output pasted per deploy. `HUMAN-NEEDED.md` gets only true human steps with exact commands/click paths (Fly secrets to remove, uptime-monitor account, Sentry alert rule, listing spelling, listing screenshots, BFS application).

## DEFINITION OF DONE — every line ticked, or explain which is not and why

**Phase 0**
- [ ] GDPR webhooks return 200 with one audit row (test + live delivery)
- [ ] Webhook shop/payload match, 24h window, webhook-id dedup; all 7 webhook routes on the direct verifier
- [ ] Bulk: quota sliced at creation, `quotaSkipped` written, no AI call past remaining=0; empty output not charged; resume from `GeneratedContent`
- [ ] Interactive: credit refunded on every failure/empty output (test with mocked 503)
- [ ] Billing: CANCELLED compares charge id; callback never syncs on error; payload fields right; `canGenerate` cache invalidated on sync (live Starter→Growth with no flicker to Free)
- [ ] Bulk publish uses `publishProductWithRetry`/`readMutationResult` (THROTTLED test)
- [ ] Trial once per shop; monthly usage survives uninstall as a number on `Shop`
- [ ] `fly secrets list` names pasted: no `BILLING_TEST_OVERRIDE`; `SENTRY_DSN` present
- [ ] Jobs resumable; `kill_timeout=60s`; `lockDuration` 5 min; `recoverStuckJobs` every 5 min; failed event → `failed`
- [ ] Redis queue `enableOfflineQueue:false` + 5s race → clear error
- [ ] `connection_limit` 5/3 via pooled endpoint; `getOrCreatePlan` upsert
- [ ] `/reembed` target whitelist + escaped serialisation + `script-src`
- [ ] Liquid `| escape`; plain-text types tag-stripped; meta lengths hard-truncated
- [ ] Prompts: system + `<untrusted_product_data>` + 4 KB cap + external-link strip
- [ ] `/billing/callback` signed; `/api/generate` deleted or re-keyed; `HttpOnly`, `no-store`, HSTS, `allowProtocolRelative:false`, previews sanitised, `published_status:published`
- [ ] Anthropic reset header parsed as date; backoff capped; 429 out of breaker; AbortError retried once
- [ ] Sentry eager init + `handleError` + unhandledRejection; alert rule (HUMAN-NEEDED if needed)
- [ ] `/api/health?deep=1` with queue + worker + breaker; 503 on dead worker

**Phase 1**
- [ ] `prisma/migrations` baselined; `migrate deploy` in release_command; rollback documented
- [ ] `[processes] web/worker`; web in `iad`+`syd`; worker `auto_stop=off`; `kill_timeout`, `swap`; proof the worker survives a web deploy
- [ ] `node:22-alpine`, `USER node`; `.dockerignore` unchanged
- [ ] Typecheck blocking; post-deploy smoke job; `main` green
- [ ] Uptime monitor (2 regions), Sentry alert, 5-min deep-health, daily digest at 07:00 AEST — the four "what does the owner see" answers all read "alert"
- [ ] Polling gated to active jobs; Jobs page single poll
- [ ] Neon PITR 7d; nightly dump to R2; restore drill run once
- [ ] `DEPLOYMENT.md` rewritten; `RUNBOOK.md`, `SECRETS.md`, `ARCHITECTURE.md` added
- [ ] Repo cleanup done; worktrees pruned after recovering quick-start; `build/_to_delete/audit-src.tgz` deleted
- [ ] Route tests listed in 1.10 added; regex-over-source tests replaced

**Phase 2**
- [ ] 2.13 self-audit table in PROGRESS.md
- [ ] One per-product status from `getContentMetrics`; identical counts across Home/Products/Optimise (test)
- [ ] Nav = Home · Products · Review · Blog · Settings; route mapping applied
- [ ] One bulk action "Optimize store"; Quick Generate routed to product page
- [ ] Marketing components deleted; one dismissible Banner on Home
- [ ] Polaris only: heroes, ticker, Plans cards, tone picker, lucide, emoji, `!important` overrides gone (grep proof)
- [ ] Auto-publish in Settings only, confirm modal, regenerate bug fixed
- [ ] One primary per page; state-driven Home primary; no disabled primary
- [ ] Review screen: side-by-side, persisted inline edits, explicit approve-all, keyboard, Toast
- [ ] US spelling everywhere; jargon list gone; claims list gone; ≤ 2-line paragraphs
- [ ] Skeleton/Empty/Error on every screen; 0-product and 5,000-product cases handled; enumeration in worker
- [ ] Web Vitals from US admin p75: LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms on Home/Products/Review/product page — before/after numbers
- [ ] 375px screenshots of every screen; a11y items fixed

**Phase 3**
- [ ] `welcome`/`setup` retired, engine absorbed, flag + secret removed, `no-dark-patterns` committed and passing, quick-start recovered from worktree
- [ ] Start state on `/app`, no redirect; p50/p90 from ≥ 5 fresh installs, all < 120s, recording with URL bar
- [ ] One review-ask code path; fires only in a confirmed action; dead code deleted; proof
- [ ] Two upsell surfaces; `from=` recorded on activation; live 0→20→25→upgrade recording

**Phase 4**
- [ ] Quality gate + duplicate check before save; post-publish verification; before/after score per product and store; inferred brand voice; bounded autopilot; THROTTLED handling everywhere; one-click restore

**Phase 5**
- [ ] `/go?ref=` on every owned surface; fresh listing assets in `/listing-assets`; weekly Web Vitals in the digest; Sec-Fetch-Dest + `rel="home"` tidy-up

**Every phase**
- [ ] G1 recording, G2 curl, G5 SHAs, PROGRESS.md appended, HUMAN-NEEDED.md current, no "PASS (code)" presented as live
