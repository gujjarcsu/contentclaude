# ContentClaude — GEO/AEO Features Report

**Date:** 2026-06-19
**Goal:** reposition ContentClaude around GEO/AEO (Generative/Answer-Engine Optimization) — getting merchant products surfaced and cited by ChatGPT, Perplexity, Gemini, and Google AI Overviews — plus the conversion/retention mechanics that make the business work.
**Verification this increment:** typecheck ✓ · lint ✓ · build ✓ · tests **126 pass** (108 prior + 18 new GEO). No regressions to metering, metrics, gating, billing, or the mojibake fix.

> **Honest scope note.** This increment ships the **wedge engine** (the hard, must-be-correct part) end-to-end and one complete user-facing feature (**llms.txt via App Proxy**). It is built on the existing SEO scorer, FAQ-JSON-LD primitive, entitlements registry, and webhook path — nothing was rebuilt. Remaining P0 **surfaces** (GEO score UI, generation-prompt AEO upgrade, ROI display, review loop, annual billing, Scale tier) are specified below with concrete designs and status — each is additive and behind the plan gates already wired. P1 (H–J) is not started and is entitlement/flag-gated off so it can never block launch.

---

## Status legend
**SHIPPED** = built, tested, green · **ENGINE SHIPPED** = core logic built+tested, UI surface pending · **NEXT** = designed, not yet built · **P1/FLAGGED** = off by default, non-blocking.

---

## A. GEO/AEO content engine — **ENGINE SHIPPED** (generation-prompt upgrade: NEXT)

**Shipped (`app/utils/geo.server.js`, tested in `tests/utils/geo.test.js`):**
- `buildProductJsonLd()` — emits a valid schema.org **@graph** with **Product + Offer/AggregateOffer + AggregateRating + FAQPage**, including only nodes/fields for which real data exists. Reuses the existing `faqToJsonLd()`. **Never emits malformed schema and never fabricates** (e.g. `AggregateRating` is included only with a real rating value 1–5 and review count > 0 — verified by tests).
- `jsonLdScriptTag()` — safe `<script type="application/ld+json">` serialization (escapes `</`).
- Answer-first / entity-completeness heuristics power the GEO score (feature C).

**How to test:** `npx vitest run tests/utils/geo.test.js` (schema breadth, single vs. multi-variant Offer, rating rejection, no-fabrication).

**NEXT (designed):** upgrade `ai.server.js` `buildPrompt()` to (1) lead with a concise self-contained answer/summary, (2) emit a scannable Q&A block by default for GEO runs, (3) complete key entities (material/dimensions/use-case/who-for); and add an **"AI-search ready (AEO)" toggle** in the generation UI. The schema builder above is the output target for that content.

**Plan gate:** GEO generation runs on the normal metered quota; `geoScore` entitlement = all plans (free hook).

---

## B. LLMs.txt generator + serving — **SHIPPED (end-to-end)**

**Shipped:**
- `generateLlmsTxt(store, items, opts)` (`geo.server.js`) — Markdown index per the llms.txt convention (H1, blockquote summary, Collections + Products sections, `full` mode adds per-product attributes).
- `app/utils/llms.server.js` — `renderLlmsTxt(shop, {full})`: pulls real catalog data (`unauthenticated.admin`), builds the doc, **caches 1h** per shop, **plan-gated (Starter+)**.
- **App Proxy routes:** `app/routes/proxy.llms[.]txt.jsx` and `proxy.llms-full[.]txt.jsx` — signature-verified via `authenticate.public.appProxy`, serve `text/plain`.
- **Proxy config:** `[app_proxy]` in `shopify.app.toml` (`prefix=apps`, `subpath=contentclaude`).
- **Stays current:** `webhooks.products.create.jsx` calls `invalidateLlmsTxt(shop)` on catalog change.

**Served URLs (after the App Proxy is registered):**
- `https://<shop-domain>/apps/contentclaude/llms.txt`
- `https://<shop-domain>/apps/contentclaude/llms-full.txt`

**How to test:** deploy + `shopify app deploy` (registers the proxy), then load the storefront URL above as the merchant. Locally, `generateLlmsTxt` is unit-tested.

**Owner/external setup & honest limitation:**
- Registering the App Proxy requires **`shopify app deploy`** (Partner Dashboard app config update).
- **Root-placement caveat (do not over-claim):** Shopify App Proxy serves under `/apps/contentclaude/llms.txt`, **not** the true domain root `/llms.txt`. A real `/llms.txt` at the root requires a **merchant-side redirect/theme step** (a theme `redirect` or a reverse-proxy rule). The app provides the always-current proxy URL automatically; root placement is a documented manual step.

**Plan gate:** `llmsTxt` entitlement = Starter+ (Free gets 404, i.e. feature disabled).

---

## C. GEO Readiness Score — **ENGINE SHIPPED** (Dashboard/product UI: NEXT)

**Shipped (`geo.server.js`, tested):**
- `calculateGeoScore(input)` → `{ score 0–100, checks, breakdown }` across **six GEO dimensions**, computed **only from the store's own data — no external API**:
  1. Answer-first structure (15) 2. Q&A/FAQ block (20) 3. Structured data breadth & validity (25) 4. Entity/attribute completeness (20) 5. Meta quality (10) 6. Image alt text (10).
- `aggregateGeoScore()` → store-level average. Kept **separate and clearly labelled** vs. the traditional `calculateSeoScore` (SEO) so the two are never conflated.

**How to test:** `npx vitest run tests/utils/geo.test.js` (high score for a complete product, near-zero for a bare one, FAQ raises score, breakdown sums to score, clamped 0–100).

**NEXT (designed):** surface the score prominently with a breakdown + **"Fix it" CTA** that triggers GEO generation for the gaps:
- **SEO Audit page** (`app.seo-audit.jsx`) — already loops the catalog and calls `calculateSeoScore`; extend its GraphQL query (add `productType vendor tags variants` + join FAQ from `GeneratedContent`) and render a **GEO column + store GEO score** next to SEO. Lowest-risk surface.
- **Dashboard** — a GEO Readiness card (store score + “X products AI-search ready”).
- **Product view** (`app.products_.$id.jsx`) — per-product GEO breakdown + Fix-it.

**Plan gate:** `geoScore` = all plans (read-only on Free — the conversion hook).

---

## D. ROI / lift display — **NEXT (designed)**
Reuse `metrics.server.js` + the new scores. Show before→after: SEO Δ, **GEO Δ**, coverage %, schema types added, content pieces, and **time saved** via a transparent formula (e.g. `pieces × avg-minutes-per-manual-piece`). Any forward-looking “potential lift” is **labelled an estimate with its basis** — no fabricated traffic/revenue. Surface on Dashboard + after bulk jobs.

---

## E. Review-generation loop (Shopify-compliant) — **NEXT (designed)**
Neutral, **dismissible** App-Store-review prompt after a genuine success moment (bulk batch published, or crossing a GEO/SEO milestone). **Frequency-capped** (stored dismissal timestamp; long re-ask interval; **never after an error**). **No incentive of any kind** (Shopify prohibits incentivized reviews). Configurable success trigger. Links to the listing review URL (owner-provided).

---

## F. Annual billing + activation nudges — **NEXT (designed)**
- **Annual plans (2 months free)** added to the `billing` config in `shopify.server.js` alongside monthly keys (Shopify App Pricing only — no off-platform payment); Plans page gets a **monthly/annual toggle** with savings + ROI framing.
- **Activation nudges** at high-intent moments (approaching/at quota cap, low GEO score, bulk needed on Free/Starter, first published win) — reuse existing usage/entitlement state; contextual, not spammy.

---

## G. Pricing value-metric for high-volume merchants — **NEXT (designed)**
Add a high-volume path (highest-LTV segment; current top tier caps them): a **"Scale" tier** (structure + metering + entitlements). **Recommended price ~$149–$199/mo or metered overage — OWNER DECISION, not hard-committed.** Implementation reuses the entitlements registry and the atomic metering; `monthlyLimit` becomes effectively-unlimited or per-catalog-size for Scale.

---

## H. Live AI-visibility tracker — **P1 / FLAGGED (not started)**
Query ChatGPT/Perplexity/Gemini to check whether products are surfaced/cited; visibility score over time. **Entitlement `aiVisibility` added (Pro only); off by default.** Requires **API keys + per-merchant cost controls/rate limiting**. Will ship behind a feature flag (env), MVP-first. **External: provider API keys + budget.**

## I. Google Search Console integration — **P1 / FLAGGED (not started)**
OAuth + GSC API for real impressions/clicks/position. Behind a flag. **External: Google Cloud project, OAuth credentials, verified-site scope.**

## J. Multi-language SEO/GEO — **P1 / FLAGGED (not started)**
Per-language meta/content/schema tied to the merchant's translation setup. Large effort; behind a flag; phased.

---

## Plan gating (entitlements registry — `app/utils/billing-plans.js`)
| Entitlement | Free | Starter | Growth | Professional |
|---|---|---|---|---|
| `geoScore` (Readiness Score, read-only hook) | ✓ | ✓ | ✓ | ✓ |
| `llmsTxt` (generate + serve) | — | ✓ | ✓ | ✓ |
| GEO generation (metered) | limited | ✓ | ✓ | ✓ |
| bulk GEO / Autopilot GEO refresh | — | — | ✓ | ✓ |
| `aiVisibility` (P1, flag-gated) | — | — | — | ✓ |
UI gating and server entitlements stay in sync via `getEntitlements()` / `checkEntitlement()`, as already established.

---

## External setup / owner decisions (flagged — not faked)
1. **App Proxy registration** — `shopify app deploy` to apply `[app_proxy]`; then the llms.txt URLs go live. Root `/llms.txt` placement is a documented merchant-side redirect (see B).
2. **Final pricing** — Scale tier number and annual prices are **owner decisions**.
3. **AI-visibility tracker API keys** + budget (P1).
4. **Google OAuth / GSC credentials** (P1).
5. **App Store review-listing URL** for the review loop (E).
6. **Built-for-Shopify** application — separate Shopify process.
7. **Trademark:** user-facing/marketing copy should avoid leaning on the "Claude" trademark — use "premium AI" / brand-voice framing.

---

## How to demo the GEO wedge (for the App Store listing)
1. **Before → after GEO score.** Open a thin product (GEO score low). Generate GEO content (answer-first + FAQ). Re-score → score jumps, with the breakdown showing schema + Q&A + entities now present. This is the gamified, visible "amazing" moment.
2. **Valid rich structured data.** Show `buildProductJsonLd` output passing Google's Rich Results / schema validation — Product + Offer + FAQPage (+ AggregateRating when the merchant has reviews).
3. **llms.txt is live and current.** Load `https://<shop>/apps/contentclaude/llms.txt` — a clean, AI-readable index of the catalog that updates as the catalog changes. Few competitors have this.
4. **The story:** "Don't just write descriptions — make your products show up and get cited in AI search." That's the category-defining positioning.

---

## Files added/changed this increment
- **Added:** `app/utils/geo.server.js`, `app/utils/llms.server.js`, `app/routes/proxy.llms[.]txt.jsx`, `app/routes/proxy.llms-full[.]txt.jsx`, `tests/utils/geo.test.js`, `GEO_FEATURES_REPORT.md`.
- **Changed:** `app/utils/billing-plans.js` (GEO entitlements), `shopify.app.toml` (`[app_proxy]`), `app/routes/webhooks.products.create.jsx` (llms.txt cache invalidation).
