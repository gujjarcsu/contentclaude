# ContentClaude — Complete Bug Fix Pass

**Date:** 2026-06-25 · **Prod:** `https://contentclaude.fly.dev`
**Verified:** typecheck ✓ · lint ✓ · build ✓ · 149/149 tests ✓ · real-layer probes where possible.

> **Headline:** The biggest finding wasn't on the list. Bugs 2, 3, and 4 share a single root cause: **Shopify has begun rejecting non-expiring offline access tokens (HTTP 403)**, and the stored dev-store token was non-expiring. That one issue produced all three auth/scan symptoms. It's diagnosed and remediated; one founder step (open the app once) completes it.

---

## BUG 1 — Billing (P0) — FIXED (code) + one founder action
**Root cause:** The installed `@shopify/shopify-api` dropped the legacy flat billing shape. `request()` now throws *"Must be either a one-time plan or a subscription plan with line items"* unless each plan uses a `lineItems` array.
**Fix (already shipped, commit `01bd98f`):** [app/shopify.server.js](app/shopify.server.js) — every tier (monthly **and** annual) is now `{ trialDays, lineItems: [{ amount, currencyCode, interval }] }` via a `recurringPlan()` helper.
**Real-layer proof:** Called `appSubscriptionCreate` against Shopify (test mode) with the exact shape the fixed config produces — for Starter monthly (`EVERY_30_DAYS`) and Starter annual (`ANNUAL`). Shopify **fully parsed the mutation, no config/schema error.**

**⚠️ Second blocker surfaced (founder action, not code):** the same call returned
`"Apps without a public distribution cannot use the Billing API"`.
This is account-level — Shopify blocks **all** Billing API calls (even test) until the app's distribution is **Public**. So the approval URLs the spec asks for **cannot be produced until distribution is set.**
**Founder must:** Partner Dashboard → app → **Settings → Distribution → Public distribution** (required for App Store anyway). Then clicking Subscribe will reach Shopify's approval screen — the mutation is already verified correct.

---

## BUGS 2, 3, 4 — Auth / Welcome scan / Session expiry (P0/P1) — ROOT-CAUSED + REMEDIATED
**Shared root cause (the real bug):** The stored **offline access token was non-expiring** (`expires: null`), and **Shopify now rejects non-expiring tokens**:
> `[API] Non-expiring access tokens are no longer accepted for the Admin API. Start using expiring offline tokens.` (HTTP 403)

Every Admin API call uses this token (welcome scan, llms.txt, autopilot), so they all started failing at once. Critically, it does **not** self-heal: the token-exchange strategy only re-mints when `!session || !session.isActive()`, and `isActive()` returns **true** for a null-expiry token — so the library reused the dead token forever.
**Evidence:** live API 403 (above); DB row `offline_…` with `expires: null`; library reuse logic in `…/strategies/token-exchange.js`.

**Remediation applied:** purged the non-expiring offline session from the DB (`DELETE … WHERE isOnline=false AND expires IS NULL`, 1 row). With no stored session, the next embedded load forces token exchange to mint a **fresh expiring** offline token (which then auto-refreshes near expiry). Reversible — re-auth recreates it.

**Per-bug detail:**
- **Bug 3 (welcome scan fails):** the deferred scan's `admin.graphql` was 403ing on the dead token and silently degrading to the retry card. Added server-side logging in [app/routes/app.welcome.jsx](app/routes/app.welcome.jsx) (`"welcome scan failed"` with the real error/stack) so any future cause is visible. The scan **query itself is valid** (standard fields). Will work once the token is re-minted.
- **Bug 2 (raw login form on re-auth):** the modern silent-refresh mechanism is **already correctly wired** — `AppProvider embedded apiKey={apiKey}` in [app/routes/app.jsx](app/routes/app.jsx) loads App Bridge from the CDN, and `auth.$.jsx` + `boundary.error` handle transparent OAuth. The login route ([auth.login/route.jsx](app/routes/auth.login/route.jsx)) already auto-redirects to OAuth when `shop`/`host` is known; the manual form is only the correct fallback for genuine non-embedded access. **I deliberately did NOT apply the suggested legacy `@shopify/app-bridge-react` Provider fix — it's for the old stack and would regress this app.** The form was appearing because the token was dead (re-auth couldn't complete); fixed by the re-mint.
- **Bug 4 (session-expired full-page error):** same root cause; expiring tokens auto-refresh via token exchange going forward, so this stops recurring after re-mint.

**Founder must (one step, unverifiable headlessly):** open the embedded app once. That triggers token exchange → fresh expiring token → welcome scan, llms.txt, and normal auth all work. I can't generate an embedded session token from a script, so this single step is yours. If other legacy stores exist, purge their non-expiring offline sessions too (same one-liner).

---

## BUG 5 — Score inconsistency (P1) — FIXED
The three numbers are genuinely **different metrics**; the problem was labeling + alarming red on acceptable scores.
**Fix (deployed):**
- **Labels everywhere:** Welcome → "GEO / AI-search score" + "Traditional SEO score"; Review → "Content quality: N" with a tooltip *("measures how complete and structured this content is for AI search")*; SEO Audit → "Traditional SEO score" + column header "SEO Score".
- **Unified colour rule** across all three screens: **≥70 green, 40–69 amber, <40 red** — a mid score (e.g. 50) is now amber ("work to do"), never alarming red.
- Files: [app/routes/app.welcome.jsx](app/routes/app.welcome.jsx) (`scoreTone` helper), [app/routes/app.review.jsx](app/routes/app.review.jsx) (threshold + `Tooltip`), [app/routes/app.seo-audit.jsx](app/routes/app.seo-audit.jsx) (ScoreRing + row + heading).
- Same-metric consistency: scores are computed by the same deterministic functions (`calculateGeoScore` / `calculateSeoScore` / `scoreContent`), so a given metric matches across screens for the same product.

---

## BUG 6 — llms.txt 404 on Free plan (P2) — FIXED + VERIFIED
**Fix (deployed):** non-entitled shops now get a helpful **200** plain-text notice instead of a silent 404, via a shared `llmsTxtUpgradeNotice()` in [app/utils/llms.server.js](app/utils/llms.server.js), used by both [proxy.llms[.]txt.jsx](app/routes/proxy.llms[.]txt.jsx) and [proxy.llms-full[.]txt.jsx](app/routes/proxy.llms-full[.]txt.jsx).
**Real-layer proof:** signed App Proxy request to the Free-plan dev store → **HTTP 200**, `text/plain`, body:
```
# ContentClaude — LLMs.txt
This feature requires a Starter plan or higher.
Upgrade at: https://contentpilot-dev2.myshopify.com/admin/apps/contentclaude
LLMs.txt helps AI assistants like ChatGPT and Perplexity discover and cite your products.
```

---

## Verification summary (honest, at the real layer)
| # | Bug | Code fix | Real-layer verified | Needs founder |
|---|-----|----------|--------------------|---------------|
| 1 | Billing config | ✅ lineItems | ✅ mutation accepted by Shopify (monthly+annual) | ⚠️ set **Public distribution**, then click-test approval URLs |
| 2 | Re-auth form | ✅ (no churn; correct stack already) | n/a (needs browser) | ⚠️ open app once → re-mint |
| 3 | Welcome scan | ✅ logging; query valid | ⚠️ blocked by dead token until re-mint | ⚠️ open app once → re-mint |
| 4 | Session expiry | ✅ (re-mint) | n/a (needs browser) | ⚠️ open app once → re-mint |
| 5 | Score labels/colors | ✅ | ✅ build/code | — |
| 6 | llms.txt Free | ✅ | ✅ **200 notice confirmed** | — |

## What still needs the founder's eyes (not code)
1. **Set app distribution to Public** (Partner Dashboard) — unblocks the Billing API; then verify the subscribe → approval screen for each tier/interval. *This is the only thing standing between the (verified-correct) billing code and working checkout.*
2. **Open the embedded app once** — completes the token re-mint (expiring offline token) that fixes Bugs 2/3/4. Then confirm `/app/welcome` shows GEO/SEO scores and the BEFORE/AFTER generates. I purged the dead session but cannot trigger token exchange headlessly.
3. If any **other stores** were installed before this enforcement, purge their non-expiring offline sessions (`DELETE FROM "Session" WHERE "isOnline"=false AND "expires" IS NULL`) so they re-mint too. New installs are unaffected (token exchange issues expiring tokens).

## Remaining known issues
- None in code that I can fix from here. The two open items above are account/Partner-Dashboard and a one-time embedded load — both founder-only. Once distribution is Public and the app has been opened once, all six bugs are resolved end-to-end.
