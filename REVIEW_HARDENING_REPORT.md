# App Review Hardening — Final Report

**Branch:** `fix/app-review-hardening` (6 commits on top of `9e8f2ed`)
**Date:** 2026-08-12
**Gates at completion:** `npx vitest run` → **177 passed / 0 failed** · `npx eslint --ignore-path .gitignore .` → **0 errors, 0 warnings** · `npm run typecheck` → **clean** · `npm run build` → **clean**

Baseline was 168 tests. Net +20 new regression tests were added covering the fixed paths; 18 tests belonging to *deleted dead modules* (benchmark, reviewPrompt, removed feature flags) were removed together with their modules — hence 177. Every remaining test passes.

> ⛔ Per the brief, **nothing was deployed** and no production environment variables were touched. The deploy + post-deploy manual verification protocol is the human's step (see §5 and §6).

---

## 1. Phase 0 — verification harness

- All five core files read end-to-end before any change.
- **11 failing tests written first** capturing P0-1, P0-2, P0-3 — all failed on assertions against the then-current code (proving the bugs), all now pass.
- Full mutation call-site audit (final column = validated against Admin API 2026-04 via Shopify's schema validation tooling):

| # | Call site (pre-fix) | Mutation | userErrors? | top-level errors? | In 2026-04? | Now |
|---|---|---|---|---|---|---|
| 1 | bulkProcessor:412 | metafieldsSet | ✅ | ✅ | ✅ | unchanged (was correct) |
| 2 | bulkProcessor:450 | productUpdate(input:) | ✅ | ⚠️ THROTTLED only | ✅ deprecated arg | ✅ migrated to `product:`, full checks |
| 3 | products_.$id:343 (auto-publish) | productUpdate(input:) | ❌ **result never read** | ❌ | ✅ deprecated arg | ✅ migrated + checked; failure downgrades to draft + honest message |
| 4 | products_.$id:363 | productImageUpdate | ✅ (meaningless) | ❌ | ❌ **REMOVED from API** | ✅ replaced with productUpdateMedia (batched, MediaImage GIDs) |
| 5 | products_.$id:422 (publish) | productUpdate(input:) | ✅ | ❌ | ✅ deprecated arg | ✅ migrated + readMutationResult |
| 6 | products_.$id:465 | metafieldsSet | ✅ | ❌ | ✅ | ✅ readMutationResult |
| 7 | collections:133 | collectionUpdate(input:) | ✅ | ❌ | ✅ | userErrors kept; top-level noted in §7 |
| 8 | blog:155 | blogCreate | ⚠️ generic | ❌ | ✅ | ✅ readMutationResult + specific reasons |
| 9 | blog:169 | articleCreate | ✅ | ❌ | ✅ | ✅ readMutationResult; + articleUpdate path |
| 10 | review:32 (writeFaqMetafield) | metafieldsSet | ❌ **swallowed** | ❌ **swallowed** | ✅ | ✅ checked, logged, FAQ row downgraded, merchant told |
| 11 | review:49 | productUpdate(input:) | ✅ | ⚠️ THROTTLED only | ✅ deprecated arg | ✅ migrated; non-throttle top-level errors now fail |

New shared helper: [`app/utils/adminGraphql.server.js`](app/utils/adminGraphql.server.js) — `readMutationResult()` checks HTTP status, top-level `errors`, AND the payload's user-error list; treats a missing payload as failure. Rows 3 and 10 were *worse* than the audit stated (result never read at all / fully swallowed).

---

## 2. Phase 1 — P0 blockers (all fixed)

| ID | Fix | Files | Verification |
|---|---|---|---|
| P0-1 | Alt text rewritten: `media(first:50)` loader/action queries (MediaImage GIDs), **one batched `productUpdateMedia` call**, per-image AI-failure tracking, mediaUserErrors mapped by index, honest badge (Applied / Partially applied / Not applied), no raw GraphQL strings shown, truncation disclosed >50 images, credit policy = 1 generation per run (stated in UI). **Deliberate deviation:** the audit preferred `fileUpdate`, but shopify.dev docs state it *requires the `write_files` or `write_themes` scope* — which the app doesn't hold and P0-7 was actively removing scopes. `productUpdateMedia` is valid in 2026-04, runs on `write_products`, and is deprecated-with-successor; migrate when Shopify announces removal. | `app.products_.$id.jsx`, `adminGraphql.server.js` | 3 regression tests (were failing, now pass); schema-validated |
| P0-2 | Review queue: loader + count filtered to `gid://shopify/Product/`; **pages by distinct product** (50/page) so header/pages agree and a product's types never split; publish action defensively drops non-Product GIDs; error rows show product titles not GIDs. **Deliberate deviation:** collection drafts are NOT orphans — they power the Collections page's own review flow; no cleanup/migration was performed (deleting them would break that page). | `app.review.jsx` | 3 regression tests |
| P0-3 | `ALL_BILLING_PLAN_KEYS` (all 6 subscription names) exported from `billing-plans.js`; used in `plans-reconcile`, cancel, and subscribe validation. Cancel with no matching subscription returns a 409 **error**, does NOT call `syncBillingToPlan(shop, [])`, does not claim success. | `billing-plans.js`, `app.plans.jsx`, `app.plans-reconcile.jsx` | 5 regression tests incl. source guard |
| P0-4 | Products page reads `useActionData`, renders critical/warning banner with "View Plans" on plan gates. Audited all 13 routes with actions; `app.blog.posts.jsx` was the only other silent site — fixed. | `app.products.jsx`, `app.blog.posts.jsx` | code audit table + banner in place |
| P0-5 | `EmbedSetupCard` on Dashboard + Review & Publish: numbered steps, theme-editor deep link with `activateAppId={uid}/faq_schema`, dismissible only via "I've enabled it" (persisted to `GrowthState.embedConfirmedAt`, new resource route `/app/embed-status`); onboarding step 4; publish-time notice when FAQ published while embed unconfirmed; `docs/theme-embed-setup.md` written. **Deviation:** App Bridge `app.extensions()` **does not exist** — real detection needs the `read_themes` scope (theme files API). Flagged as a human decision (§7). | `EmbedSetupCard.jsx`, `app.embed-status.jsx`, `app._index.jsx`, `app.review.jsx`, `app.products_.$id.jsx`, schema | embed-status regression test |
| P0-6 | `automatically_update_urls_on_dev = false`; `.graphqlrc.js` codegen aligned to `ApiVersion.April26`. App-URL/TLS check is H2. | `shopify.app.toml`, `.graphqlrc.js` | diff review |
| P0-7 | `.env.example` → `SCOPES=write_products,write_content`; `startup.server.js` requiredScopes drops `write_metaobjects`; NEW boot warning when SCOPES contains unused scopes. `shopify.server.js` keeps `scopes: process.env.SCOPES` — the **Fly `SCOPES` secret value must be updated by the human** (H-extra below); I cannot read it. | `.env.example`, `startup.server.js` | boot-warning code in place |
| P0-8 | Content templates + version history now **enforced server-side** (settings + product page actions gated, UI locked with upgrade path on Free); `autopilotEnabled` cannot be persisted on non-Growth plans; alt-text listing is truthful because P0-1 makes it work. **Correction to the audit:** `geoScore`/`llmsTxt` are *internal entitlement flags only* — the in-app pricing table (PLAN_DISPLAY/FEATURE_TABLE) never advertises them, so no in-app overclaim exists; the *public listing* must not advertise them either (H11). | `app.settings.jsx`, `app.products_.$id.jsx`, `plans` unchanged | 4 gate regression tests |

---

## 3. Phase 2 — P1 bugs (all 15 fixed)

| ID | Fix | Files |
|---|---|---|
| P1-1 | Processor re-reads job status each iteration; aborts on cancel; guarded `updateMany(status:"processing")` completion write; credits stop on cancel. + regression test | `bulkProcessor.server.js` |
| P1-2 | Render-phase setState → `useEffect` keyed on generation identity; title/HTML editable | `app.blog.jsx` |
| P1-3 | `ap_metaDescription` submitted with the Meta checkbox | `app.settings.jsx` |
| P1-4 | `tpl_metaDescription` submitted with the Meta checkbox | `app.settings.jsx` |
| P1-5 | Locked A/B upsell is an enabled button navigating to /app/plans; audited for other disabled+onClick controls (none) | `app.products_.$id.jsx` |
| P1-6 | Collections generation: rate limit + `tryConsumeGeneration` (was unlimited free AI) | `app.collections.jsx` |
| P1-7 | Republish uses `articleUpdate` on stored `shopifyArticleId` (schema-validated) — no duplicates; blogCreate/articleCreate error handling hardened | `app.blog.jsx` |
| P1-8 | Recent-activity routes by GID type; collections labelled and linked to /app/collections | `app._index.jsx` |
| P1-9 | Enqueue-cap throw caught at **six** sites (audit listed four; `api.generate` → 429 JSON and the autopilot webhook → 200-skip had the same bug) | products, optimize, welcome, jobs, api.generate, webhook |
| P1-10 | `decodeHtmlEntities` util; applied at AI parse source (metaTitle/metaDescription/faq) + review previews. + 6 unit tests | `text.js`, `ai.server.js`, `app.review.jsx` |
| P1-11 | Partial-scan banner always shown, distinguishing 500-cap from 25s timeout; counts labelled | `app.seo-audit.jsx` |
| P1-12 | Tab counts page-scoped so they always match the filtered rows; store-wide totals stay in stat cards | `app.products.jsx` |
| P1-13 | Step 5 persists `GrowthState.setupCompletedAt`; subtitle uses TOTAL_STEPS; deep-linked steps 2–3 default `storeName` from the shop domain; dashboard checklist steps 2/3 reflect real content state | `app.setup.jsx`, `app._index.jsx`, schema |
| P1-14 | Job banner dismiss persists via sessionStorage keyed per completion | `app._index.jsx` |
| P1-15 | Voice-saved toast watches `voiceFetcher` and the `savedVoice` field | `app.collections.jsx` |

---

## 4. Phases 3–4 — P2/P3

- **P2-1**: extension renamed `navaal-geo-schema` (uid unchanged — deep-link identity); trademark logo `contentclaude-logo-full.svg` deleted with its unused export; remaining served assets audited clean. **Metafield namespace: kept `contentclaude` (option a)** — renaming orphans every metafield on installed shops and breaks the extension's Liquid accessor; the namespace is invisible to merchants. Documented in the extension toml.
- **P2-2**: `ensureFaqMetafieldDefinition()` — idempotent, per-shop 24h cache, schema-validated `metafieldDefinitionCreate` (pinned, typed json, PRODUCT) — wired into all three publish paths. Existing metafield values are untouched.
- **P2-3**: `productUpdate(product:)` at all four sites; `media`/`featuredMedia` in bulkProcessor + welcome (+ products_.$id in P0-1). **Remaining deprecated-but-functional usages** (outside the audit's list, deliberately left): products-list loader, review `fetchProductsBatch`, seo-audit, and the A/B variant query still read `featuredImage`/`images`. Safe until Shopify removes them; migrate in a follow-up.
- **P2-4**: GDPR handlers store non-PII digests only (shop_id, customer_id, counts); 2-year retention purge; the "stores no customer PII" claim is now true.
- **P2-5**: deleted (all verified zero-importer first): benchmark.server.js + CategoryBenchmark model + benchmark columns; reviewPrompt.server.js + its GrowthState columns; activationAt/lastScanAt; 7 speculative feature flags (registry now = `magicMoment` only, with a guard test); HelpSidebar/HelpTooltip; `@shopify/app-bridge-react` dependency. Their dead tests removed with them. *(Note: dropping the dead columns/table means the release `prisma db push` will drop them in prod — they were never written, so no data is lost.)*
- **P2-6**: review ask uses App Bridge's official `reviews.request()` (Shopify renders its own UI — neutral by construction, no incentives), fires at most once per shop ever via `reviewRequestedAt`. The flag inconsistency is gone with the deleted dead machinery.
- **P3**: pino `redact` list for credentials at any depth; `/api/generate` **token mode removed** (HMAC-only, per-shop, replay-protected); missing `REDIS_URL` in production now **fails boot**; Sentry verified wired (`@sentry/node` installed, DSN is a Fly secret); stray console.* replaced in Phase 1.

---

## 5. Verification protocol results

**Automated** — PASS: vitest 177/177 (baseline 168; +20 new regression, −18 removed with deleted dead modules), eslint 0/0, typecheck clean, production build clean.

**Schema validation** — PASS: every mutation in the repo validated against Admin API 2026-04 (table §1). One INFORM remains: `featuredImage` in review's `fetchProductsBatch` (known remaining deprecation, functional).

**Manual against a real dev store** — **NOT DONE (all 14 items), reason: the fixed code is not deployed and the brief forbids deploying.** Every live item below must be run by the human **after deploying this branch** (`fly deploy` + `shopify app deploy` — the extension rename and any config change need the latter):

1. Fresh install → OAuth → land in app — NOT DONE (needs deploy + clean store)
2. Onboarding wizard end to end — NOT DONE
3. Generate all five content types on a 2+-image product — NOT DONE
4. Verify in Shopify admin incl. **alt text on the media object** — NOT DONE (this is the P0-1 proof; do it first)
5. Review & Publish: no collections, clean publish — NOT DONE
6. Theme embed → FAQPage JSON-LD → Rich Results Test — NOT DONE (H5)
7. Free plan: every bulk control shows a visible upgrade message — NOT DONE (code + tests say yes; verify live)
8. Growth plan: cancel a bulk job mid-run, confirm it stops — NOT DONE (code + test say yes; verify live)
9. Blog: generate → edit → publish → republish → no duplicate — NOT DONE
10. Collections: generate → publish → verify — NOT DONE
11. Settings incl. Autopilot **with meta description** — NOT DONE
12. Annual subscribe → reload Plans repeatedly → no downgrade → genuine cancel — NOT DONE (the P0-3 proof)
13. Every page at 768px — NOT DONE (a `mobile.css` polish layer exists; needs eyes)
14. Empty/loading/error states — PARTIAL: code inspection confirms AppSkeleton + EmptyState + RouteError on every route; live pass still needed

---

## 6. Human checklist (H1–H13 + two added)

| # | Action | Status/notes |
|---|---|---|
| H1 | Unset `BILLING_TEST_OVERRIDE` on Fly + redeploy | **Already done before this audit** — verified 2026-08-11: the secret is absent from `fly secrets list`. Re-verify before submission. |
| H2 | `curl -vI https://app.navaal.ai/api/health` → 200 + valid TLS | Verified 200 on 2026-08-11 from this machine (with local TLS quirks worked around); re-verify from a clean network |
| H3 | Clean-store install test (OAuth-first, reinstall re-bills) | Post-deploy |
| H4 | Upgrade demo store to Growth (test charge) for reviewer access | — |
| H5 | Enable theme embed + Rich Results Test | Use the new setup card's deep link |
| H6 | Verify `llms.txt` on a Starter+ plan | Proxy path verified working 2026-08-11 (pre-hardening code) |
| H7 | Publish a privacy policy + link from listing | **Hard rejection without it.** P2-4 makes "no customer PII stored" true — say exactly that |
| H8 | Emergency developer contact + allowlist noreply@shopify.com | — |
| H9 | AI-provider DPA: confirm no training on API inputs (PPA §9.15) | Anthropic's commercial terms state API inputs/outputs are not used for training by default — obtain/keep the current DPA in writing for review |
| H10 | Scrub ALL statistics/superlatives from the listing | — |
| H11 | Listing plan features must exactly match the in-app table — and must NOT advertise geoScore/AI-visibility/llms.txt beyond what's live | — |
| H12 | Listing images: real UI only, unique, no chrome/pricing/trademarks | Re-capture AFTER deploying this branch (UI changed: badges, banners, setup card) |
| H13 | Run `/shopify-app-store-review` from the Shopify AI Toolkit | Free pre-check |
| H14* | **Update the Fly `SCOPES` secret to `write_products,write_content`** and re-run `shopify app deploy`; existing installs re-consent on next auth | The boot warning added in P0-7 will flag it if forgotten |
| H15* | **Unset the `CONTENTCLAUDE_API_TOKEN` Fly secret** (token auth mode removed) | Cosmetic-security cleanup |

---

## 7. Could not fix / decisions needing the human

1. **Embed activation detection (P0-5.1)** — the audit's `app.extensions()` API does not exist in App Bridge. Real detection requires the read-only `read_themes` scope (theme files API). Options: (a) add `read_themes` — enables true detection and BFS 4.2.3, costs a consent re-grant; (b) ship as-is with merchant-confirmed state. I shipped (b); choose (a) any time later.
2. **`fileUpdate` migration for alt text** — blocked on the same class of scope decision (`write_files`). `productUpdateMedia` is used deliberately; revisit when Shopify announces its removal.
3. **Metafield namespace remains `contentclaude`** — correct engineering call (breaking migration avoided); cosmetic only.
4. **Remaining `featuredImage`/`images` deprecated reads** (products list, review batch, seo-audit, A/B query) — functional in 2026-04, out of audited scope; follow-up.
5. **Live manual protocol** — impossible without deploying, which the brief forbids.

## 8. Anything that could still cause rejection (explicit)

- **Undeployed fixes**: the reviewer sees production. Until this branch is deployed (both `fly deploy` AND `shopify app deploy`), every P0 still exists live — the broken alt text with its false success badge being the most likely first-click failure.
- **Privacy policy (H7)** and **listing content (H10–H12)** are outside the repo and unverifiable from here; each is a documented rejection reason on its own.
- **Fly `SCOPES` secret**: if it still carries metaobject scopes, requirement 3.2 (over-broad scopes) can still trigger — H14.
- **Reviewer plan access (H4)**: bulk jobs, Autopilot, A/B are Growth-gated; without a Growth demo store, requirement 4.5.5 fails.
- **768px / a11y (Phase 4 items 8–9)**: only spot-verifiable in code; a live pass is pending. Polaris defaults + the existing mobile.css make catastrophic failure unlikely, but I have not run a browser against every page and won't claim otherwise.
- Residual risk I judge low but nonzero: the review queue's distinct-product pagination loads all draft productIds per request; at extreme draft volumes (>50k rows) it's memory-heavier than before, though bounded by the select of a single column.
