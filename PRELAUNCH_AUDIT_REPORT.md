# Navaal — Pre-Launch Completion & Audit Report

**Date:** 2026-07-08 · **App:** Navaal (Fly slug `contentclaude`, live at `https://app.navaal.ai`)
**Scope:** 3 known bugs + full pre-launch completeness audit.
**Verification baseline:** `npm run lint` → clean · `npm test` → **165 passed (19 files)** · every edited file eslint-checked individually.

> ⛔ **Nothing here has been deployed.** All changes are local commits only. `fly deploy` / `shopify app deploy` were intentionally NOT run — that's the review gate. Items needing a production push or a business decision are in **§2** and **§3**.

---

## 1. Fixed automatically

### Bug 1 — App Proxy 404: made the failure observable (logging)
**Files:** `app/routes/proxy.llms[.]txt.jsx`, `app/routes/proxy.llms-full[.]txt.jsx`

The handlers collapsed three *different* failure modes into one silent `return 404`. I replaced the silent `catch {}` with logging that distinguishes them, and added a log line to the previously-silent "no session" branch:
- `kind: "appProxy-hmac"` + `status: 400` → Shopify's signature was rejected (secret/config).
- `kind: "appProxy-error"` → the offline-token refresh (or other) threw.
- `"valid signature but no offline session"` → HMAC passed but no stored token for the shop.

**Why this is the right first step (not a blind fix):** I proved the pieces around the failure are healthy, so the fix must be evidence-driven, not guessed:
- Dev store's stored offline token → **Admin API returns 200** (install + token valid).
- Local `SHOPIFY_API_KEY` **matches** the toml `client_id` (`1279…70b77`).
- The `/proxy/llms.txt` route is reachable (returns the handler's controlled 404).
- Webhooks all validate HMAC with the **same** `SHOPIFY_API_SECRET` and are wired correctly (see §4) → a secret mismatch is *unlikely*.

I could not reach the *signed* proxy from here because the dev store's **storefront is password-protected** (every `/apps/...` request 302-redirects to `/password`; the owner's in-admin test bypasses that wall). Confirming the exact root cause needs one of the two steps in **§2, Bug 1**. Verified: both files eslint-clean.

### Bug 2 — the *actual* live "false FAQ ✓", found and fixed
**File:** `app/routes/app.products.jsx` (`getContentTypePills`)

The Products list rendered **"FAQ ✓" for *any* FAQ row that existed, regardless of status** — so all 17 of the dev store's `rejected` FAQ rows showed a green-ish "✓" even though 15 have no metafield on Shopify. A checkmark now means **published/live only**:
- `published` → green "FAQ ✓" (this is exactly when the `faq_schema` metafield is written)
- `draft` → info "FAQ · draft" (generated, not live — no ✓)
- `rejected` / none → muted "FAQ" (no ✓)

This is the honest manifestation of the symptom the brief described. Verified: eslint-clean, 165 tests pass.

### Bug 2 — backfill written, verified, and run (dry-run)
**File (new):** `scripts/backfill-faq-metafields.mjs`

Idempotent, throttled (`BULK_THROTTLE_MS`, 2s), **all-shops** backfill that reuses the app's own helpers (`getFreshOfflineSession`, `buildFaqSchemaMetafield`) and the exact `metafieldsSet` + `userErrors` check from `bulkProcessor.setFaqMetafield`. **Dry-run is the default; `--apply` is required to write.** No AI generation (reuses stored FAQ text → zero Anthropic cost). Safe to stop/resume.

**Dry-run result (all shops): 0 rows to repair.** See **§ Backfill results** below for the ground-truth data and why.

### Data hygiene / GDPR — shop state now cleared on uninstall
**File:** `app/utils/gdpr.server.js`

`GrowthState` (onboarding + review-ask flags) was **missing** from `GDPR_SHOP_MODELS`, so it survived uninstall and `shop/redact`. Added `"growthState"` (model has an `id`, so `chunkDelete` works; no FK relations). Effect: a reinstalling merchant now gets a clean first-run again, and `shop/redact` deletes *all* per-shop rows. Verified: 165 tests pass (incl. GDPR tests).

---

## 2. Needs manual action from you

> These require a production push or dashboard access I intentionally don't do unsupervised.

### 🔴 Bug 3 (MUST do before real merchants) — turn off billing test mode
**What it does:** `BILLING_TEST_OVERRIDE=on` makes `BILLING_TEST` true, which is passed as `isTest: true` to **every** `billing.request` / `billing.check` / `billing.cancel`. That means every subscription is a **Shopify TEST charge — the merchant approves a plan and is never charged real money.** It is a **global** flag (all shops), not scoped to test stores. Leaving it on at launch = **$0 revenue and everyone on "paid" plans for free.**
**Why it exists:** development stores can only ever approve *test* charges, so it was needed to test the upgrade flow on the dev store while running in production mode.
**Exact command (run yourself — it restarts the app):**
```
fly secrets unset BILLING_TEST_OVERRIDE --app contentclaude
```
After unset, production `BILLING_TEST` becomes `false` → real charges. (A built-in guard in `shopify.server.js` will hard-fail boot if test mode is ever true in production without this override, so you can't ship it half-on.)

### 🔴 Bug 1 — get the real root cause (pick ONE)

> **✅ RESOLVED — verified 2026-08-11.** Option A was executed: with the owner logged into the dev store admin, both `https://contentpilot-dev2.myshopify.com/apps/navaal/llms.txt` and `.../llms-full.txt` were opened while `fly logs` was tailed live. Both requests arrived through Shopify's signed proxy and returned **200** (`GET /proxy/llms.txt … 200 in 28.5 ms`, `GET /proxy/llms-full.txt … 200 in 12.8 ms`) with **no** `App Proxy auth rejected` line. The original 404 no longer reproduces — the post-rename `shopify app deploy` proxy re-registration appears to have fixed it. The instructions below are kept for historical reference only.

The logging is committed but must be **deployed** to help. Then, either:

**Option A — read the live log (most direct):**
1. Deploy (`fly deploy`), then from the dev store admin open `https://contentpilot-dev2.myshopify.com/apps/navaal/llms.txt`.
2. Run `fly logs --app contentclaude` and look for `App Proxy auth rejected for llms.txt`.
   - **A log line appears** with `kind:"appProxy-hmac"` → signature rejected → reset the secret: in Partner Dashboard (app `1279…70b77`) copy the API secret and `fly secrets set SHOPIFY_API_SECRET=<value> --app contentclaude`.
   - **A log line appears** with `kind:"appProxy-error"` → token-refresh path; share the `err` text.
   - **"valid signature but no offline session"** → the offline token isn't being found for that shop.
   - **NO log line at all** → the request never reached the app → Shopify isn't routing the proxy → **re-check the App Proxy registration**: Partner Dashboard → your app → **App setup → App proxy** must show **Subpath prefix `apps`, Subpath `navaal`, URL `https://app.navaal.ai/proxy`**. Re-run `shopify app deploy` if it's wrong/blank. *(This "no log line" case is my leading hypothesis, since the token/secret/route are all proven healthy.)*

**Option B — let me test it from here:** temporarily turn OFF the dev store's storefront password (Online Store → **Preferences** → uncheck *Password protection*). Tell me when it's off and I'll curl the signed proxy URL directly and read the real response (our "Not found" vs a 200 vs the theme's own 404), which pins the cause without a deploy.

### 🟠 App Store scopes — remove two unused scopes (rejection risk)
`shopify.app.toml` declares `write_metaobjects,write_metaobject_definitions`, but the code **never calls any metaobject API** (the only mention is a string in a startup self-check). FAQ schema uses product **metafields** (`metafieldsSet`, covered by `write_products`). Over-broad scopes are a common review rejection. **Recommended edit** (only if you have no near-term metaobject plans):
```
scopes = "write_products,write_content"
```
I did **not** change this because reducing scopes changes the OAuth consent screen and forces already-installed shops to re-grant — your call. (Also update the `requiredScopes` list in `app/utils/startup.server.js:79` if you do.)

### 🟠 Confirm `SHOPIFY_APP_URL` = `https://app.navaal.ai`
OAuth uses this env var as the app URL. The app serves correctly at `app.navaal.ai`, but confirm the secret value (I can't read secret values):
```
fly secrets list --app contentclaude   # confirms it EXISTS; to be safe, re-set it:
fly secrets set SHOPIFY_APP_URL=https://app.navaal.ai --app contentclaude
```

### 🟡 App Store listing fields (Partner Dashboard, manual)
Confirm these show **Navaal** (not ContentClaude) and are reachable: app name/handle, privacy-policy URL, support email, screenshots. The screenshot **source SVGs** in `public/` are correctly rebranded (verified: "Navaal" ×6, "ContentClaude" ×0), but re-upload them (or fresh captures) in the listing.

---

## 3. Flagged but not changed (business / risk decisions)

- **Deploy pipeline uses `prisma db push`** (`fly.toml` release_command). `db push` is the prototyping tool — it syncs schema with **no migration history and can drop columns/data** on some changes. For production with live merchant data, `prisma migrate deploy` (tracked, reviewable migration files) is safer. At today's stage (pre-launch, 2 test shops) `db push` is workable, but I recommend adopting migrations **before** real data accumulates. Not changed — altering the deploy pipeline is a decision, and switching requires baselining the current schema as an initial migration.
- **2 orphaned FAQ metafields on the dev store.** 2 of the 17 `rejected` FAQ products still have a live `faq_schema` metafield (published earlier, then the draft was rejected). Harmless (the JSON-LD is still valid Q&A) and *not* an overclaim (the UI counts only `published`). Cleaning them up means deleting live metafields, so I didn't. Optional.
- **`.env.example` drift (docs only).** `CONTENTCLAUDE_AUTH_MODE` is documented but not a Fly secret (fine — it defaults to `"hmac"`). `NODE_ENV`, `FEATURE_MAGIC_MOMENT`, `BILLING_TEST_OVERRIDE` are Fly secrets not in the example. Cosmetic; no code impact.
- **`blogCreate` doesn't surface its specific `userErrors`.** If blog creation is rejected, the code falls through to a generic `"Could not find or create a blog"` 500 — so it does **not** report false success (acceptable), but the merchant doesn't see the precise reason. Minor UX polish, not a correctness bug.

---

## 4. Confirmed working / nothing to do

- **Webhook HMAC:** all 7 webhook routes call `authenticate.webhook` (signature-validated). ✅
- **GDPR mandatory webhooks:** `customers/data_request`, `customers/redact`, `shop/redact` all persist to the `GDPRRequest` model; `shop/redact` also chunk-deletes all per-shop tables. ✅
- **Uninstall cleanup:** deletes all per-shop data incl. `session` (clean reinstall) — and now `growthState` (fixed above). ✅
- **Billing state machine:** `app_subscriptions/update` correctly maps ACTIVE→plan, CANCELLED/DECLINED/EXPIRED→free, FROZEN→frozen, and busts the plan/quota caches. ✅
- **Advertised == enforced limits:** `plans.jsx` and the server-side entitlement checks both import the single source `app/utils/billing-plans.js` (Free 25 / Starter 50 / Growth 200 / Pro 1000). ✅
- **GraphQL mutation error handling:** `metafieldsSet` (bulk + manual), `productUpdate`, `collectionUpdate`, `productImageUpdate`, `articleCreate` all check `userErrors` and surface failures. The one prior silent-success bug (FAQ) is fixed & deployed (commit `1942870`). ✅
- **No hardcoded secrets** in the repo (scanned for `sk-`, `shpat_`, `AKIA…`, PEM keys, literal bearers). ✅
- **Observability:** Sentry initializes when `SENTRY_DSN` is set (it's a Fly secret) with a structured-log fallback; `captureException` wraps the background job paths. Logger level defaults to `info` in production → my new Bug 1 `warn` logs will show. ✅
- **Abuse protection:** `/api/generate` has a per-shop rate limiter (`rateLimit.server.js`); Anthropic + Shopify calls have 429/backoff retry; proxy routes are HMAC-gated and 1-hour cached. ✅
- **No transactional emails** are sent (the only `email` reference is an unwired `weeklyDigest` feature flag) → no email branding to fix. ✅
- **Error boundary** uses the Shopify library's `boundary.error()` — no stale brand text. ✅
- **Screenshots** (`public/screenshot-*.svg`) render "Navaal" only. ✅

---

## Backfill results (Bug 2 ground truth)

**Targeted set — `contentType="faq"` AND `status="published"`, all shops: 0 rows.** The backfill correctly has nothing to repair.

**Why (reality check against Shopify, dev store):** all **17** FAQ rows are `status="rejected"` (genuinely merchant-rejected drafts — the fixed publish paths only ever set `published` or downgrade to `draft`, never `rejected`). Of those 17: **2** have a live metafield on Shopify (orphaned, see §3), **15** don't. This *exactly matches* the brief's "15 of 17 had no metafield" — but because they're `rejected`, not `published`, the Results page honestly reports **0** FAQ-schema-live (an under-count, not an over-claim). The only place that *did* over-claim was the Products-list pill, now fixed (§1).

**Net:** there is no published-but-missing FAQ data drift in the current database. The backfill remains as the safety net for future publishes (which the deployed `userErrors` fix already handles correctly). To run it if that ever changes:
```
node scripts/backfill-faq-metafields.mjs              # dry-run (safe)
node scripts/backfill-faq-metafields.mjs --apply      # perform repairs
```
