# PROGRESS — Navaal SEO & GEO post-approval brief

Goal: #1 in the SEO category on the Shopify App Store, and paying merchants. Truth law: nothing shown that is not real, nothing claimed that is not measured.

Release plan from the brief: **1–2 today → 3–5 → 6–7 → 8–9 → 10.**

| # | Item | Status | Shipped in |
|---|------|--------|-----------|
| 1 | App name → `Navaal: AI SEO, AEO & GEO` | code deployed · **Shopify config deploy is a human step** (HUMAN-NEEDED #1) | a9422c1 |
| 2 | Install source tracking (surface_*, referer, ref) | deployed · proven live on a real App Store install cycle (see below) | b96b9e2 · 08690b9 |
| 3 | Time to first value < 2 min ("Write 3 descriptions now — free") | next release (design done, implementation in progress) | — |
| 4 | Compliant review request (once, at first batch publish) | next release | — |
| 5 | Paid conversion prompts (quota-aware, truthful) | next release | — |
| 6 | Install funnels on owned surfaces (navaal.ai, Bilby, tools) | release 3 | — |
| 7 | Listing assets (5 desktop + 3 mobile frames, demo store) | release 3 | — |
| 8 | Daily digest line | release 4 | — |
| 9 | Admin performance baseline (US + Sydney) | release 4 | — |
| 10 | Sec-Fetch-Dest iframe condition, rel="home" tidy-up | last | — |

---

## Item 1 — Name (2026-09-09)

**Shipped (code, commit a9422c1, live on Fly):**
- `shopify.app.toml`: `name = "Navaal: AI SEO, AEO & GEO"`.
- Every in-app rendering of the full name: document `<title>` and `og:title` (`app/root.jsx`), the brand line under the logo in the app nav (`app/components/ContentClaudeBrand.jsx`, was "Powered by premium AI"), the legacy listing SVG footers in `public/` (which also had an invalid raw `&`; fixed). Onboarding pages say "Welcome to Navaal" (brand, not the full name) — unchanged. The app sends no email.

**Not shipped by the agent:** the Shopify-side config deploy (`shopify app deploy`) that makes the **admin sidebar** show the new name. Reason and exact command in HUMAN-NEEDED #1.

**Deployed string (the listing must match it character for character):** `Navaal: AI SEO, AEO & GEO`

**Measured on production (contentpilot-dev2, build b96b9e2):** in-app `document.title` = `Navaal: AI SEO, AEO & GEO`; nav brand text = `Navaal · AI SEO, AEO & GEO`; admin sidebar label = `Navaal: AI SEO & GEO Content` (old — awaits the human config deploy). Screenshots: `proof-items12/dashboard-1440.png`, `proof-items12/dashboard-390.png`.

## Item 2 — Install source tracking (2026-09-09)

**Shipped (commits b96b9e2 + 08690b9, live on Fly):**
- New Prisma model `Shop` — one row per shop, created on the **first authenticated request** after install (under managed installation that request *is* the install; there is no OAuth callback). Runs inside the `authenticate.admin` wrapper in `app/shopify.server.js`; an `afterAuth` hook flags new sessions so reinstalls are detected.
- Captured when present: `surface_type`, `surface_detail`, `surface_intra_position`, `surface_inter_position`, our own `ref` (query or `navaal_ref` cookie), `utm_*`, HTTP referer (origin + path only — never a query string, which can carry a session token), landing path. One label per install: `installSource` ∈ `app_store:<surface_type>` · `ref:<handle>` · `utm:<source>` · `unknown` · `pre_tracking`.
- Truth rules, locked by 45 tests (`tests/utils/installTracking.test.js`, `tests/utils/webhookAuth.test.js`, `tests/routes/install-tracking.routes.test.js`): shops installed before this shipped are backfilled as `pre_tracking` with `installedAt` = earliest known activity, never as fresh installs; first-install attribution is immutable (no back-fill, never overwritten by a reinstall — reinstalls get `reinstallSource`/`reinstallReferer` and `installCount`); every write is idempotent under the two parallel document loaders and under duplicate webhook delivery (a late duplicate cannot mark a reinstalled shop as gone); `shop/redact` anonymises the row (domain → hash; referer, search query, landing path cleared).
- `/go?ref=<channel-handle>` — the attributed install link for surfaces we own (item 6 will use it): sets the `navaal_ref` cookie and forwards to the App Store listing. Verified live: `302 → https://apps.shopify.com/navaal-ai-seo-geo-content?ref=…` with `Set-Cookie: navaal_ref=…; Secure; SameSite=None; Max-Age=2592000`.
- **Bug found and fixed on the way (08690b9):** `POST /webhooks/app/uninstalled` returned a bare **500 on every delivery** for a store whose offline token had expired — the library authenticator refreshes the token before returning the context, and for a just-uninstalled store that refresh is rejected. The handler never ran: shop data was not deleted, the uninstall not recorded, Shopify retried into the wall. Pre-existing (earlier proofs uninstalled within minutes of install). The four token-free routes (app/uninstalled, shop/redact, customers/data_request, customers/redact) now verify the HMAC directly (`app/utils/webhookAuth.server.js`). Verified live: the same webhook now returns **200**, logs `All shop data deleted after uninstall` and `shop_uninstalled matched:1`.

**Measured (real App Store install cycle on the dev store navaal-qa-fresh, driven by `scripts/store-uninstall-app.mjs` + `scripts/store-install-from-appstore.mjs`, evidence in `proof-items12/`):**

| Step | Observed |
|---|---|
| App Store search "navaal" → listing link | listing URL carries `surface_type=search&surface_detail=navaal&surface_inter_position=1&surface_intra_position=1` |
| Listing "Install" | POST to `apps.shopify.com/navaal-ai-seo-geo-content/install?…surface_*…` → `admin.shopify.com/store/navaal-qa-fresh/app/grant` (consent) |
| App's first authenticated request | `app.navaal.ai/app?shop&host&embedded=1&hmac&id_token` — **no surface params** |
| Shop row after uninstall (08690b9) | `uninstalledAt` set, sessions/plan/content deleted |
| Shop row after reinstall | `installCount 2`, `reinstalledAt 2026-09-09T04:18:23Z`, `reinstallSource "unknown"`, `uninstalledAt null`; log `shop_reinstalled` exactly once |
| Existing shops on their next load | backfilled as `pre_tracking` with their real first-activity date (contentpilot-dev2 → 2026-07-07; navaal-qa-fresh → 2026-08-26) |

**What this means, plainly:** under managed installation Shopify does **not** forward `surface_*` to the app server, so App Store installs record as `unknown` server-side; the only Shopify-provided source split is the listing's GA4/Meta tracking (HUMAN-NEEDED #3). Our own channels are attributed through `/go?ref=` (cookie-based, so partial by browser — reported as measured, never inferred). The table is live and truthful today: installs, uninstalls, reinstalls, ref/utm attribution, and the pre-tracking backfill.

**Reading the numbers:** `fly ssh console -a contentclaude -C "node /app/scripts/shop-install-diag.cjs"` prints totals, counts by `installSource`, and the last 20 rows. The daily digest (item 8) will carry installs/uninstalls/sources.

---

## Verification log

- 2026-09-09 — build b96b9e2 then 08690b9 on Fly (`/api/build-info`). Unit suite 256/256, lint clean, build clean. Adversarial review before merge: 3 lenses × 2 skeptics per finding (23 agents), 10 findings confirmed and fixed. Live proofs as tabled above.

---

# PHASE 0 — STOP THE BLEEDING (docs/WORLD-CLASS-BRIEF.md)

Executed in the six groups the brief specifies, one deploy per group, a test per numbered item.
Every entry says plainly whether it is **LIVE-verified** or **code-only**.

## Group 0.A — Compliance & data (items 1-3)

**Item 1 — the mandatory GDPR webhooks 500 on every delivery.**
Confirmed by reading the schema against the code: `GDPRRequest` has `processedAt` and no
`createdAt`, and both customer handlers pruned their retention window with
`deleteMany({ where: { createdAt: ... } })`. Prisma raises `Unknown argument createdAt` — and it
raised it *after* the audit row was inserted, so every `customers/redact` and
`customers/data_request` delivery answered 500, Shopify retried for hours, and every retry left
another duplicate audit row. This is a mandatory-webhook failure on any periodic compliance audit.
Fixed by moving retention into one shared, correctly-named helper,
`pruneGdprAuditTrail` (`app/utils/gdpr.server.js`), which filters on `processedAt` and can never
throw: by the time it runs the request is already recorded, and a prune failure must not turn a
delivered request back into a retry.

**Item 2 — webhook headers were trusted unsigned.**
The HMAC covers the request BODY only; `shop`, `topic` and `triggered-at` arrive as unsigned
headers, and `app/uninstalled` deletes every row belonging to the *header* shop. Three defences
added to `verifyShopifyWebhook`:
- whenever the signed payload names a shop (`myshopify_domain` / `shop_domain`) it must equal the
  header, so a genuine body of ours replayed under another merchant's domain is a 401 (topics whose
  payload carries no shop field — `products/create`, `scopes_update`, `app_subscriptions/update` —
  are unaffected);
- a delivery whose `triggered-at` is older than `MAX_WEBHOOK_AGE_MS` (24 h), or implausibly far in
  the future, is rejected, closing the replay window;
- `x-shopify-webhook-id` is claimed once in Redis (`SET NX EX`, 48 h) and the context reports
  `duplicate`, so a redelivery short-circuits. A handler that then fails calls
  `releaseWebhookDelivery` so Shopify's genuine retry is still allowed to run — the claim never
  swallows work that did not happen.
All seven webhook routes now use this one verifier: `products/create`, `app/scopes_update` and
`app_subscriptions/update` were moved off `authenticate.webhook`, which refreshes the shop's
offline token before returning and therefore 500s for any shop whose token has expired — the exact
retry-storm fixed for `app/uninstalled` in 08690b9. `products/create` kept its own Redis dedup; it
now shares the verifier's.

**Trade-off, stated rather than hidden:** the 24 h replay window is shorter than Shopify's ~48 h
retry schedule. A genuine retry inside 24 h is never refused, but if the app were unreachable for
more than a day, a compliance retry arriving after that would be rejected rather than processed.
The alternative — no replay window — leaves `app/uninstalled` replayable indefinitely against any
shop. The window is a single named constant if that judgement is ever revisited.

**Item 3 — `app/scopes_update` 500s on a payload shape.**
`payload.current.toString()` throws a TypeError when `current` is absent → 500 → retries. Parsing
moved to the pure `scopesFromPayload`, which accepts the documented array, tolerates the
comma-string variant, and returns null when there is nothing to write (the route then answers 200
and writes nothing). The route also no longer depends on the library's `session`: without that
context there is no single session id, so it writes `session.updateMany({ where: { shop } })`,
which is what "this shop's granted scopes changed" actually means. The helper lives in
`app/utils/webhookAuth.server.js`, not the route — a route file may only export route members.

**Tests (all new, 50 assertions across two files):**
- `tests/routes/webhooks.compliance.test.js` — delivers a REAL correctly-signed body through the
  REAL verifier with only the database mocked. Per the brief: valid HMAC → **200 and exactly one
  audit row**. Also locks that the prune filter is `processedAt` and not `createdAt`; that a prune
  failure still returns 200 with the row intact (the old failure mode, made unrepeatable); that the
  stored digest contains no customer email or phone; that a forged HMAC is 401 and writes nothing;
  that a redelivery writes no second row; and that a failed write hands the delivery id back.
  For item 3: array, comma-string, empty and missing `current` — 200 in every case.
- `tests/utils/webhookAuth.test.js` — extended to cover the shop/payload mismatch, the replay
  window (older, future, just-inside, missing, unparseable), the dedup claim/release including
  Redis-down behaviour, and a source guard that all **seven** routes use the verifier and none
  imports the library authenticator. The guard strips comments first, so a route may still explain
  in prose why it avoids `authenticate.webhook`.

**Pre-deploy gate:** unit suite 332 passed / 5 failed — the 5 are `tests/routes/no-dark-patterns.test.js`,
which is untracked, targets Phase 3 work not yet done, and fails against `main` exactly as the brief
records; it is not committed, so CI does not see it. Lint clean. Typecheck **0 errors**. Build clean.
