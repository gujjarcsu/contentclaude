# Built for Shopify — the code-side audit (B4.2)

**Read this before pressing Apply.** Failing the same criterion three times suspends applications
for three months. The dashboard reports *state*; this file says *why* each criterion holds and names
the test that turns red if it stops holding. Written 2026-09-14 (Phase 9 Part C). The regression tests
for criteria 1–6 live in `tests/docs/bfsAudit.test.js`; the tests it cites for 5 and 6 predate it and
are at `e40aee6` or earlier.

**What the dashboard read on 2026-09-14 (CW, H8, window Sep 7–14):** LCP p75 **877 ms** over 76
loads, INP p75 **40 ms** over 26 loads, CLS **0.02** over 76 loads — all Good. **The number that
decides is 26 of the 100 calls required**, and it moves only when real merchants use the app.

---

## 1. App Bridge — loaded from the script tag, first in the head, on every document

**Evidence.** `app/root.jsx` renders `<meta name="shopify-api-key">` then
`<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />` inside `<head>`, before any
other script. P0.4 measured this from the rendered document on both sides of the change (PROGRESS.md
"P0.4 — measured from the rendered document"): before, the only copy sat in the body, emitted by
`<AppProvider embedded>`, and the head held no scripts; after, the head copy is first. React 18.3.1
does not hoist scripts into the head, so the tag is written by hand, not left to the framework. The
recovery page (`app/utils/embedded.server.js`) carries its own copy for the one bounce it serves.
INP is only collected for apps loading App Bridge this way; the 26 INP samples above are the proof it
is being collected.

**Test.** `tests/docs/bfsAudit.test.js` › *1. App Bridge* — the tag is inside `<head>`, is the first
`<script` there, follows the api-key meta, and no other file under `app/` loads App Bridge.

## 2. Admin performance — p75 LCP / CLS / INP, and the code-side budget that keeps them there

**Evidence.** The readings above pass. What keeps them passing at ≥100 calls is not a reading, it is
what the heaviest route ships: on the 2026-09-14 build the largest per-route chunk is
`app.products` at **50.2 KB**, the largest shared chunk is the error boundary at **196.6 KB**, and
total client JavaScript is **850.7 KB** raw (89 files). The dashboard and Home stream their below-the-fold
queries (`<Await>`), the first paint waits on one parallel batch, and every route beyond Home is a
separate chunk.

**Budget.** `scripts/check-bundle-budget.mjs` — route chunk ≤ 64 KB, shared chunk ≤ 256 KB, total
≤ 1 MB, raw bytes — runs in CI as the step after `npm run build` (`.github/workflows/ci.yml`). A
route that grows past its budget turns the build red before a merchant's session does.

**Test.** `tests/docs/bfsAudit.test.js` › *2. Admin performance* — the budget script exists with
those three numbers and CI runs it after the build; a local build, when present, is inside the total.

## 3. Storefront — the Lighthouse impact of `navaal-geo-schema`, as a number

**Evidence.** The extension is two theme app blocks, `faq_visible.liquid` and `faq_schema.liquid`,
both pure Liquid: the only `<script>` either emits is `type="application/ld+json"` (data, not a
running script), no stylesheet, no external request. That is why the expected impact is near zero.

**The number is not yet measured, and this file says so rather than assuming it.** The harness is
`tools/proof/lighthouse-embed.mjs` (Lighthouse 13, mobile, performance category, weighted home 17% ·
product 40% · collection 43%, target under 10 points, two runs — blocks on, blocks off — and a
compare). Every dev store is password-protected today and Lighthouse on a password page measures the
password page; the harness detects that and refuses to compare. It runs the moment one `navaal-ttv-*`
storefront is public (the owner's F10 step) or a `storefront_digest` cookie is supplied. Record the
result here, both runs and the delta.

**Test.** `tests/docs/bfsAudit.test.js` › *3. Storefront impact* — every block is pure Liquid (no
non-JSON-LD script, no stylesheet, no external URL) and the harness carries the 17/40/43 weights.

## 4. Asset API — not used

**Evidence.** The app writes products and content through the Admin GraphQL API and reaches the
storefront only through the theme app extension and the app proxy. No `themeFilesUpsert`, no
`themeFilesDelete`, no `assetUpdate`, no REST `/assets.json`, no `themes/` REST path anywhere under
`app/`. `shopify.app.toml` requests `write_products,write_content` and nothing else — no
`write_themes`, so the Asset API exemption is neither needed nor claimed.

**Test.** `tests/docs/bfsAudit.test.js` › *4. Asset API* — greps `app/` for every Asset API form and
asserts `write_themes` is absent from the manifest.

## 5. Polaris and the design guidelines

**Evidence.** Every admin screen is Polaris (`tests/routes/polaris-only.test.js`). The navigation is
exactly five items, one word each, Home first (`tests/routes/navigation.test.js` › *has exactly
five*). Each page has one primary action, chosen by state, never disabled, and not rendered when there
is nothing to do (*Products has exactly one page primary action*; the no-crowd-of-primaries guard).
No dark patterns: the review ask opens only from the two surfaces where a merchant confirms a
publish, after three approves, never from a loader or a job, and never beside an incentive
(`tests/utils/reviewAskRules.test.js` › *no route or component pairs a review with an incentive*).
Upgrades are offered where a limit is hit, with the reason, and the Free primary does what Free can
do (Phase 8 A5). Contextual save bars: the app's forms are single-purpose Polaris `<Form>`s that save
on submit; there is no multi-field page that would need a contextual save bar, so none is rendered.

**Test.** `tests/docs/bfsAudit.test.js` › *5. Polaris* — the five cited tests exist under their
names; they are the enforcement.

## 6. Clean uninstall

**Evidence.** Phase 6 traced uninstall → reinstall on production (PROGRESS.md "The two things tracing
uninstall → reinstall found"). `app/uninstalled` and `shop/redact` delete every content table, the
per-product scoreboard, sessions (so the access token does not linger) and the plan; the Shop row
survives with counters only, so a reinstall cannot reset the trial or the allowance; usage is
captured before the delete. The GDPR guard fails the build when a model exists that is neither deleted
nor exempted with a stated reason. CW's webhook read (H10): `shop/redact` 12 successful deliveries
and 0 failures since 2026-09-10.

**Test.** `tests/utils/uninstallReinstall.test.js` (*every content table is on the deletion list*,
*sessions go, so the access token does not linger*) and `tests/utils/gdprCoverage.test.js` (*the
deletion list names only models that exist*), both cited and asserted present by
`tests/docs/bfsAudit.test.js` › *6. Clean uninstall*.

---

## What is not in this file's power

- **The 100 calls.** Criterion 2's gate is merchant traffic. 26 of 100 on 2026-09-14.
- **The storefront number** (criterion 3) — measured the day a dev storefront is public. The harness
  is ready and refuses to lie about a password page.
- **The Apply button** — the owner's, after counsel has read `/privacy` and `/terms`
  (`OWNER-CHECKLIST.md`).
