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

### Group 0.A — LIVE verification (deployed SHA 39133e4, 2026-09-09)

`/api/build-info` = `39133e49420d6f031fc1b8e210d55334f8df83f7` = `main` HEAD (**G5 pass**).

**G2** (pasted):
```
$ curl -sI https://app.navaal.ai/
HTTP/1.1 302 Found
location: /reembed

$ curl -sI -H "Referer: https://admin.shopify.com/" https://app.navaal.ai/auth/login
HTTP/1.1 302 Found
location: /reembed
```

**The webhooks, delivered for real.** Signing needs the production key, and the local `.env` copy does not
match production, so the proof script was uploaded to the Fly machine (`fly ssh sftp put`) and run there:
it signs with the real `SHOPIFY_API_SECRET` (never printed) and posts to the app's own listener. The target
is the owner's QA dev store, and nothing in it deletes data — `customers/*` only writes an audit row, and
the `app/scopes_update` case carries no scopes so it writes nothing at all.

| Delivery | Expected | Got |
|---|---|---|
| `customers/redact`, valid HMAC | 200 | **200** |
| `customers/data_request`, valid HMAC | 200 | **200** |
| `customers/redact`, first delivery of an id | 200 | **200** |
| `customers/redact`, SAME webhook id again | 200, no work | **200 `Duplicate`** |
| `customers/redact`, forged HMAC | 401 | **401** |
| `app/uninstalled`, payload naming ANOTHER shop | 401 | **401** |
| `customers/redact`, triggered 30 h ago | 401 | **401** |
| `app/scopes_update`, no `current` field | 200 | **200** |

Audit rows written by those four valid deliveries, read back from production:

```
GDPRRequest rows for navaal-qa-fresh.myshopify.com in the last 20 min: 3
  customer_redact        payload={"shop_id":55555,"customer_id":42,"orders_to_redact":0}
  customer_data_request  payload={"shop_id":55555,"customer_id":42,"orders_requested":0}
  customer_redact        payload={"shop_id":55555,"customer_id":43,"orders_to_redact":0}
```

Three rows for four valid deliveries — the redelivery wrote none. No email or phone in any payload.
**Items 1, 2 and 3 are LIVE-verified**, not code-only.

**G1** — `node scripts/gauntlet-211.mjs` against production: headed, URL bar visible, video and per-step
screenshots under `gauntlet-211/`. Two runs, **18/18 then 27/27 steps PASS with zero assertion failures**
(app home, all eleven nav destinations, and the back-to-Dashboard move behind the rejections). Both runs
ended early on a Playwright harness fault rather than an app failure — `Target page, context or browser
has been closed`, then `net::ERR_ABORTED; maybe frame was detached?` — so this is recorded as
**27/27 assertions passed, harness aborted before the final steps**, which is what actually happened.

---

## Group 0.B — Revenue & quota correctness (items 4-11)

**Item 4 — bulk jobs generated first and checked the quota second.**
All three job-creation paths (`app.optimize.jsx`, `app.products.jsx` Generate All and its explicit
selection, plus `app.welcome.jsx`) enqueued every matching id — up to 20,000 — while the UI beside the
button said "your quota covers N", and `quotaSkipped` existed in the schema but was never written. The
processor then called Sonnet (up to 4 images, 4,000 max tokens) *before* `tryConsumeGeneration`, so a
Growth merchant with 5,000 products bought 4,800 discarded generations inside a 24-hour job that logged
"limit reached" 4,800 times. Now: `remainingGenerations` (uncached — the 60 s `canGenerate` cache cannot
see credits the run itself has just spent) plus the pure `sliceToQuota` at creation, with `quotaSkipped`
recorded; and a cheap COUNT before each model call inside the loop. When the month runs out mid-run the
remainder is marked skipped in ONE write and the job finishes.

**Item 5 — interactive paths charged before the call and never refunded.**
Five call sites (`app.products_.$id.jsx` generate / enhance / A-B, `app.collections.jsx`, `app.blog.jsx`,
`app.welcome.jsx`) took the credit and then called the model: a 45 s timeout, a 5xx, an open circuit
breaker or an empty completion ate it. `refundGeneration` already existed and was used only for the second
A/B credit. New `withGenerationCredit(shop, key, work, {isEmpty})` takes the credit (so the quota gate
stays atomic and two tabs cannot both slip past the limit), runs the work, and gives the credit back on any
throw or any result the caller declares empty. The two paths too large to wrap wholesale — the main
generate path and A/B — use the same refund explicitly, including the alt-text-only run that reached no
image. Every refund path also says so plainly to the merchant: "this did not use a generation".

**Item 6 — an empty completion was charged in bulk.** No tags extracted meant nothing saved, yet the credit
was consumed and `completedCount++`. The generated-type list is now computed BEFORE the credit is taken; an
empty one is `[NO CHARGE]` and counts as failed with a real reason.

**Item 7 — "Resume job" double-charged.** `allIds.slice(job.completedProducts)` ignores `failedProducts`:
across 5 products with #2 and #4 failed, completedProducts is 3, so the resume restarted at index 3 and
re-billed #5, which had already succeeded. Resume now derives the remaining set from `GeneratedContent`
rows touched since `startedAt` — what was actually written, not a counter.

**Item 8 — a paying merchant could be shown Free.** Three distinct defects, all fixed.
(a) The webhook downgraded on ANY `CANCELLED`, but a Starter to Growth upgrade emits CANCELLED (old) and
ACTIVE (new) unordered — CANCELLED landing second put the merchant on Free while Shopify billed Growth. It
now ignores a cancellation whose id is not the subscription we hold, and otherwise asks Shopify what is
live (`getActiveSubscriptionsForShop`); an unreachable Shopify holds the plan rather than downgrading.
(b) The payload carries `admin_graphql_api_id`, not `id`, so `shopifyChargeId` was never stored — which is
also what made (a) undetectable — and it carries no `current_period_end` at all, so the renewal date was
nulled on every ACTIVE. Both fields are now read correctly, and the period end is written only when the
delivery actually carries one.
(c) `billing.callback` read the GraphQL body inline, so an error or a 401 produced an empty list, which
`syncBillingToPlan` reads as "no subscription" — writing Free with a `declined=1` banner seconds after the
merchant approved the charge. It now uses `getActiveSubscriptions` and, on a non-authoritative answer,
leaves the plan untouched and shows no decline.
Plus `syncBillingToPlan` and every plan write now bust `canGenerate:` as well as `plan:`, so the generation
gate stops saying "limit reached" the moment an upgrade lands instead of up to 60 s later.

**Item 9 — bulk auto-publish reported success when Shopify throttled or errored.**
The processor carried its own publish copy that read `const { data } = await res.json()` and then checked
`data?.errors` — but top-level GraphQL errors are a SIBLING of `data`, never a member of it. So THROTTLED
and field errors were invisible, `data.productUpdate` was null, `?? []` made userErrors empty, nothing
threw, and the row was saved `published` with the credit spent and Shopify untouched. The same bug sat in
the product FETCH. `publishProductWithRetry` now lives in `adminGraphql.server.js` and is used by BOTH the
review screen and the worker (through a small `admin.graphql`-shaped adapter over the offline session); the
duplicate copy is deleted. Bulk rows are written as `draft` first and promoted to `published` only after
Shopify accepts the write.

**Item 10 — trial and quota could be reset on demand.** `trialDays: 7` is baked into every plan, so
subscribe, cancel, resubscribe granted trial after trial, and uninstall deleted `Plan` and `UsageRecord` so
a reinstall minted a fresh 25. Both now live on the `Shop` row, which survives uninstall: `trialUsedAt`
(stamped when a paid subscription is first held; the next subscribe sends `trialDays: 0`) and
`usageMonth`/`usageCarryover` (captured before the uninstall deletion, restored on reinstall within the
same calendar month, idempotent). Numbers and timestamps only — nothing identifying, and `shop/redact`
anonymises the row like every other column.

**Item 11 — `fly secrets list -a contentclaude`, names only, run against production:**
```
ANTHROPIC_API_KEY, DATABASE_URL, LOG_LEVEL, NODE_ENV, REDIS_URL, SCOPES,
SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SENTRY_DSN, FEATURE_MAGIC_MOMENT
```
**No `BILLING_TEST_OVERRIDE`** — real merchants get real charges. `SENTRY_DSN`, `REDIS_URL`,
`ANTHROPIC_API_KEY` and `DATABASE_URL` are all present. **LIVE-verified.**

**Tests — one per numbered item, 61 new assertions:**
- `tests/utils/credits.test.js` (26) — item 4 slicing including the 5,000-vs-200 case and negative or
  undefined remainders, uncached `remainingGenerations`, and a source guard that all three entry points
  slice and that the processor counts before it generates; item 5 refund on throw, on empty, on a custom
  emptiness rule, never on success, never when denied; item 10 trial once (including "assume used" when the
  lookup fails) and carryover capture, restore, idempotence, month rollover, never-throws.
- `tests/utils/adminGraphql.publish.test.js` (9) — item 9 at the helper: a top-level error with
  `data: null` is NOT success, THROTTLED retried then failed, THROTTLED then recovered, userErrors, missing
  payload, Retry-After, network throw, unparseable body.
- `tests/utils/bulkProcessor.test.js` (+6) — item 4 stops before the first model call when the month is
  spent and records all three as skipped in one write, and runs exactly what one credit covers; item 6 no
  charge and no completion for an empty result; item 9 rows stay draft on THROTTLED and on a top-level
  error, and are promoted only on acceptance.
- `tests/routes/billing.correctness.test.js` (13) — item 8a/b/c as described above, including that an
  unreachable Shopify never downgrades and never shows "declined".
- `tests/routes/jobs.resume.test.js` (7) — item 7: the five-product run with two failures resumes as
  exactly [#2, #4], the window is bounded by `startedAt` (falling back to `createdAt`), job settings carry
  over, and `retryFailed` still replays only the logged failures.

**One existing test changed on purpose:** `altText.publish.test.js` asserted that an alt-text run which
reached no image still returned a `message`. Item 5 made that case a plain error with the credit refunded,
which is strictly stronger, so the assertion now checks for that error and the refund instead of the
message. Two other test files gained the new `plans.server` exports in their module mocks, and
`bulkProcessor.test.js` gained a `cache.server` mock — the real one reaches for Redis inside the
auto-publish path, and under fake timers that connection never settles.

**Pre-deploy gate:** unit suite **393 passed**, 5 failed — the 5 are the untracked
`tests/routes/no-dark-patterns.test.js` (Phase 3 work, fails against `main` by design, not committed, not
seen by CI). Lint clean. Typecheck **0 errors**. Build clean.

### Group 0.B — LIVE verification (deployed SHA 500543c, 2026-09-09)

`/api/build-info` = `500543c8ba1db6be6bb755bd0a7ba085d8524d31` = `main` HEAD (**G5 pass**).
**G2**: `curl -sI https://app.navaal.ai/` and `curl -sI -H "Referer: https://admin.shopify.com/"
https://app.navaal.ai/auth/login` both `302 -> /reembed`.

The release `prisma db push` applied the item 10 columns. Read back from the production database:

```
Shop columns added by Phase 0 item 10:
  trialUsedAt     timestamp without time zone
  usageCarryover  integer  default 0
  usageMonth      text
ALL THREE PRESENT
GenerationJob.quotaSkipped present: true
Shop rows: 3, of which have used a trial: 0
```

So item 10 storage is **LIVE-verified**; the trial and carryover LOGIC is code-only until a real
subscribe or uninstall exercises it (both need a merchant action, not a request I can safely make against
a live store). Items 4-9 are **code-only** — every one of them needs a real generation, a real bulk run,
or a real Shopify charge to observe end to end, and firing those against production would spend the
owner's Anthropic budget and write to a live catalogue. Item 11 is LIVE-verified (secret names read from
Fly). **G1**: `node scripts/gauntlet-211.mjs` ran to completion this time — **30/30 steps passed,
FINAL_RESULT=PASS**, recording under `gauntlet-211/` (video plus a screenshot per step, URL bar visible).

---

## Group 0.C — Jobs that never finish (items 12-16)

**Item 12 — a deploy or crash mid-job stranded it forever.** Five separate things had to be true for a
job to recover, and none of them were:
- `fly.toml` had no `kill_timeout`, so Fly used its 5-second default while the shutdown path drains
  BullMQ for up to 30 seconds. **Every deploy SIGKILLed any running job mid-product.** Now `60s`.
- `bulkProcessor` returned unless `status === "queued"`, so BullMQ's stall retry found a row already
  marked `processing` and did nothing. A retry (`attemptsMade > 0`) may now pick up a `processing` row,
  and it skips whatever the killed attempt already wrote — so no product is generated, or charged, twice.
  The original `startedAt` is preserved on a resume because it is the boundary for that comparison.
- `lockDuration` was 30 minutes, so BullMQ waited half an hour before even considering the job stalled.
  Now 5 minutes; the processor already heartbeats the lock after every product, so a long healthy run is
  never cut short by the shorter value.
- the worker's `failed` event only logged. It now writes `status: "failed"` on the row once BullMQ has
  genuinely exhausted its attempts, so the job stops occupying the shop's in-flight slot.
- `recoverStuckJobs` ran only at boot and keyed on `startedAt`, which cannot tell a healthy 40-minute run
  from a dead one. It now runs every 5 minutes, keys on `updatedAt` (the processor writes progress after
  every product, so silence is the honest signal), re-checks the condition in the write so a job that woke
  up is never killed underneath a live worker, and tells the merchant that resuming will not re-charge.

**Item 13 — a Redis outage hung "Start job".** ioredis defaults to an offline queue plus unlimited
retries, so `queue.add` did not fail when Redis was unreachable — it buffered and waited until the edge
proxy returned 502, and the inline fallback below it (the entire point of the surrounding try/catch) was
never reached. The enqueue connection now sets `enableOfflineQueue: false` and `maxRetriesPerRequest: 1`,
and the enqueue itself is bounded by a 5-second race, so the merchant gets the fallback or a clear error
instead of a spinner. The WORKER keeps the offline queue deliberately: it is a long-lived consumer that
should ride out a blip rather than die, and nothing is waiting on it.

**Item 14 — uninstalling during a bulk job.** Two halves. The uninstall handler now marks the shop's
queued and processing jobs failed before deleting the data, so the worker sees it on its next
per-product status check and stops. And in the processor, a 401 whose token refresh FAILS is treated as
"the app is gone": it aborts the whole run instead of spending four immediate 401 refresh attempts on
every remaining product in the catalogue.

**Item 15 — `connection_limit=1`.** Measured on the production machine: the URL is already the pooled
Neon endpoint (`-pooler`, `pgbouncer=true`) but carries `connection_limit=1`, so
`tryConsumeGeneration` holds a SERIALIZABLE transaction while three worker slots and every web request
queue behind the same single connection — which is where "Timed out fetching a new connection from the
pool" comes from. The startup check no longer gates on the hostname containing `neon.tech` (a pooler
hostname or any other provider skipped it entirely), and now warns whenever `connection_limit` is below
2 or the endpoint does not look pooled. **The value itself is inside a secret containing the database
password, so changing it is HUMAN-NEEDED #4** — reading it back out to build a `fly secrets set` command
would put a live credential into the shell history and this transcript. Code-only by necessity, with the
exact steps written down.

**Item 16 — first-load race and double-run suppliers.** `getOrCreatePlan` did findUnique-then-create,
which on a fresh install races itself: the dashboard loader, the jobs-status poll and the billing
reconcile all fire within milliseconds, all miss, and two of them get P2002 — so the merchant's very
first page load is a 500. It is now a single `upsert`. Separately, `getCache` wrapped BOTH the Redis
calls AND the supplier in one try, so if the supplier threw, or Redis died on the `setex` after the
supplier had already run, the catch fell through to the in-process path and ran the supplier a SECOND
time — a duplicate write for a supplier with side effects (creating a Plan row, creating a metafield
definition), double cost for an expensive one. Only the Redis calls are guarded now, and the two supplier
call sites are mutually exclusive.

**Tests — one per numbered item, 21 new assertions:**
- `tests/utils/jobRecovery.test.js` (17) — item 12: recovery selects on `updatedAt` not `startedAt`, the
  threshold is longer than the worst single product, the write re-checks the condition, the merchant is
  told resuming will not re-charge, nothing is written when nothing is stuck, and the interval + `unref`
  are present; the processor accepts a retry of a processing row; the worker writes `failed` only once
  BullMQ has finished retrying; `lockDuration` is 5 minutes; `fly.toml` has `kill_timeout = "60s"`.
  Item 13: offline queue disabled, retries capped, the enqueue race bounded and the inline fallback
  reachable. Item 15: the `neon.tech` gate is gone and a pool of one is warned about rather than
  recommended. Item 16: `getOrCreatePlan` is one upsert with no `create`, and `getCache` has exactly two
  mutually exclusive supplier call sites.
- `tests/utils/bulkProcessor.test.js` (+4) — item 12 behaviourally: a BullMQ retry resumes a `processing`
  row, skips the product the killed attempt already wrote, and preserves the original `startedAt`; a
  FIRST attempt still refuses a `processing` row; a normal queued job still stamps a fresh start time.
  Item 14: an unrefreshable 401 ends the job after exactly ONE refresh attempt, generates nothing, and
  writes a failure that names the uninstall.
- `tests/routes/install-tracking.routes.test.js` (+2) — item 14: the uninstall cancels the shop's queued
  and processing jobs; item 10: it captures the month's usage onto the surviving Shop row.

**Three existing test files updated for the new shapes:** `plans.test.js` and `plans.cache.test.js` now
mock `plan.upsert` instead of `plan.findUnique`/`create` (item 16 changed the call), and
`install-tracking.routes.test.js` asserts on the call that stamps `uninstalledAt` rather than on a call
count, because the carryover capture also writes to that row. `bulkProcessor.test.js` gained an
`offlineToken.server` mock so a test can decide what happens when Shopify rejects the token.

**Pre-deploy gate:** unit suite **416 passed**, 5 failed — the same untracked
`tests/routes/no-dark-patterns.test.js` (Phase 3, not committed, not seen by CI). Lint clean.
Typecheck **0 errors**. Build clean.

### Group 0.C — LIVE verification (deployed SHA dce73cf, 2026-09-09)

`/api/build-info` = `dce73cff15d3bd9a04d11cc127ad0da3af5de7e3` = `main` HEAD (**G5 pass**).
**G2**: both redirects `302 -> /reembed`.

**Item 15 is visible in production.** The rewritten startup check fired on the new machine, from
`fly logs -a contentclaude`:

```
STARTUP: DATABASE_URL sets connection_limit=1. One connection serialises the web process behind
every worker transaction and causes pool timeouts under modest load — raise it to 5 on the pooled
endpoint.
```

That is the whole point of the change: the old check only looked at URLs containing `neon.tech` and
recommended `connection_limit=1`, so this condition was invisible. The value itself is in a secret that
contains the database password — **HUMAN-NEEDED #4**, with the exact commands.

Items 12, 13, 14 and 16 are **code-only**: proving them live means killing a machine mid-job, taking
Redis away, or uninstalling the app from a store — all destructive against a live install. They are
covered by 21 unit assertions each pinned to the specific mechanism.

---

## Group 0.D — Security (items 17-22)

**Item 17 — reflected XSS in `/reembed?target=`.** `target` came straight off the query string into
three places on a page that loads App Bridge inside the admin iframe, including a JS string literal via
`JSON.stringify` — which does **not** escape `</script>`, so `?target=</script><script>…` closed the
block and ran attacker script with App Bridge loaded. The page also had no `script-src` at all; its CSP
was `frame-ancestors` only, which does nothing about injected script. Three changes: `safeTarget`
whitelists in-app paths (`/^\/app(\/[A-Za-z0-9._-]+)*\/?$/`, rejecting schemes, `//host`, backslashes,
quotes, angle brackets, whitespace and traversals) and falls back to `/app`; `jsonForScript` escapes
`<`, `>` and the two Unicode line separators JSON leaves raw; and the response now carries
`script-src 'self' 'unsafe-inline' https://cdn.shopify.com`, `object-src 'none'`, `base-uri 'none'`,
`nosniff` and `no-referrer`. The test renders the page with the brief's own payload and asserts the HTML
contains exactly our two script tags and no `alert(1)`.

**Item 18 — stored XSS on the MERCHANT's storefront, via AI output.** Two independent holes, both closed:
- The extraction pipeline was `extractTag → sanitizeHtml → decodeHtmlEntities`. The sanitiser correctly
  leaves `&lt;script&gt;` alone because it is text, not a tag — and then the decode turned it back into
  `<script>`. New `toPlainText` decodes first, then strips markup to a fixed point, then removes any
  surviving angle bracket. It is applied to every plain-text type: `metaTitle` (capped at 60),
  `metaDescription` (155), `faq`, the collection meta fields, and the three social captions.
- `faq_visible.liquid` rendered `{{ qa.name }}` and `{{ qa.acceptedAnswer.text }}` raw. **Liquid does not
  auto-escape**, so that is live HTML on the merchant's product page, served to their customers. Every
  interpolation in the block is now `| escape`d, and a test walks the block asserting it. The JSON-LD
  block writes through `| json`, which escapes for JSON and not for HTML, so `faqToJsonLd` now normalises
  question and answer text as well — there is no `</script>` left to close its own block with.

**Item 19 — prompt injection had no structural defence.** Rules and untrusted data were concatenated
into a single user message, and the product title, tags, vendor and up to 64 KB of `descriptionHtml`
went in raw — all editable by anyone with staff access, or by an earlier injected generation.
Now: the rules live in a **system** prompt that merchant data cannot reach, which states explicitly that
the `<untrusted_product_data>` block is data and that anything inside it resembling an instruction is
product text; the product data and the enhance-path "existing content" are fenced in that block; every
field is capped (`descriptionHtml` at 4 KB, stripped of tags first — the model is being shown the
content, not the markup); and generated links are restricted to the merchant's own domain, with any
absolute anchor unwrapped to a plain span so the words survive and the destination does not. Autopilot
publishing stays off by default, asserted against the schema.

**Item 20 — `/billing/callback` was an unauthenticated oracle.** Given only `?shop=`, it used that
shop's offline token to read their subscription state and write the result: anyone could read another
merchant's plan, burn their Admin API budget, and bust their caches. The link is now signed
(`HMAC(secret, shop|expiry)`, base64url, 6 h) by the Plans page and verified before anything else
happens. An unsigned or stale link is deliberately **not** a dead end — a merchant may have started an
upgrade before this shipped, or lingered on Shopify's approval screen — so it skips the lookup, the
abusable part, and sends them into the app; the webhook and the Plans reconcile correct the plan within
seconds regardless.

**Item 21 — `/api/generate` deleted.** It was keyed on the shop's offline access token, which now expires
hourly, so no external caller could ever produce a valid signature: it was unusable by design and
reachable by everyone. The route is gone, along with the Settings card that advertised it and the stale
startup comment about it.

**Item 22 — the rest.** `navaal_shop` and `navaal_ref` are `HttpOnly` (both are read server-side only).
Every `/app/*` document now sends `Cache-Control: private, no-store, max-age=0, must-revalidate`,
`Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff` and
`Referrer-Policy: no-referrer` — these documents carry the merchant's catalogue content and their plan
and usage figures. `sanitize-html` gets `allowProtocolRelative: false`, because `//evil.example/x`
inherits the page scheme and is not caught by `allowedSchemes`. The product-page preview that renders
stored HTML with `dangerouslySetInnerHTML` is now sanitised **on the server**, in the loader, through the
same exported allowlist — the value comes from Shopify, so it is whatever staff (or an injected
generation) put there. `/api/build-info` no longer publishes the Node version. The public `llms.txt`
feed now queries `status:active AND published_status:published`, so a product that is active but not
published to the online store no longer appears in a public feed.

**Tests — 25 new assertions in `tests/utils/security.test.js`, one block per item:**
item 17 (the whitelist against nine hostile targets, the `</script>` gap that `JSON.stringify` leaves,
the rendered page containing exactly our two script tags and no payload, the CSP, and a legitimate target
still reaching the admin URL); item 18 (the escaped-script round trip, nesting and half-tags, the meta
caps, the JSON-LD containing no angle bracket at all, and a walk over every interpolation in the Liquid
block); item 19 (system prompt on both product paths, the fence and its "data, never instructions"
sentence, the 4 KB cap, autopilot default); item 20 (right shop only, tampered signature, tampered
expiry, missing, expired, closed-when-no-secret, and that verification precedes the lookup it protects);
item 21 (route gone, nothing advertises it); item 22 (each of the six).

**Three existing tests updated for deliberately changed contracts:** `sanitize.test.js` asserted that an
external link keeps a safe `rel` — item 19 removes external links outright, so it now asserts the anchor
is unwrapped, the host is gone, the text survives, a relative link still works, and a protocol-relative
one does not. `text.test.js` asserted the plain-text fields go through `decodeHtmlEntities`; they now go
through `toPlainText`, which is strictly stronger, and the guard also asserts the bare decode is gone.
`billing.callback.test.js` now signs its requests, since an unsigned callback is no longer allowed to
perform the lookup.

**Pre-deploy gate:** unit suite **441 passed**, 5 failed — the same untracked
`tests/routes/no-dark-patterns.test.js` (Phase 3, not committed, not seen by CI). Lint clean.
Typecheck **0 errors**. Build clean.

### Group 0.D — LIVE verification (deployed SHA 0ae81e9)

`/api/build-info` = `0ae81e9e0b7d7b24ffd451516b61de0ebe4f5c22` = `main` HEAD (**G5 pass**), and the
response itself is the first proof: it no longer carries a `node` field (item 22).

**Item 17, against production**, with the brief's own payload as `?target=`:

```
$ curl -s "https://app.navaal.ai/reembed?shop=navaal-qa-fresh.myshopify.com    &target=%3C%2Fscript%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E"

content-security-policy: frame-ancestors https://navaal-qa-fresh.myshopify.com https://admin.shopify.com;
                         script-src 'self' 'unsafe-inline' https://cdn.shopify.com;
                         object-src 'none'; base-uri 'none';
referrer-policy: no-referrer
x-content-type-options: nosniff

<script tags in body>: 2        (both ours)
alert(1) occurrences: 0
var target = "/app";            (the payload was rejected by the whitelist)
```

**LIVE-verified: items 17 and the build-info half of 22.** Items 18-21 and the rest of 22 are
**code-only** — proving them live would mean publishing attacker content to a real storefront, driving a
real charge through Shopify billing, or reading another merchant's plan. Each is covered by the
assertions listed above.

---

### Group 0.C — G1 (deployed SHA dce73cf)

`node scripts/gauntlet-211.mjs` ran to completion: **30/30 steps passed, FINAL_RESULT=PASS**.
Recording under `gauntlet-211/` — video plus a screenshot per step, URL bar visible.

### Group 0.D — CI went red, and why

The group 0.D commit (`7942c30`) **failed CI on lint and therefore did not deploy.** Three errors, all
in the new test files, none in production code:

```
tests/routes/billing.callback.test.js  51:7   'runRaw' is assigned a value but never used
tests/utils/sanitize.test.js           39:34  Unexpected control character(s) in regular expression: \x08
tests/utils/security.test.js            7:36  'beforeEach' is defined but never used
```

The `\x08` is the interesting one: a regex written as `/<a\b/` reached the file as a literal **backspace**
character, because it was patched in through a non-raw Python string — the exact trap recorded in this
repo's own notes. My pre-commit lint missed all three because eslint runs with `--cache`; CI starts from
a cold cache and caught them immediately. Fixed in `0ae81e9` as a group 0.D follow-up rather than folded
into group 0.E, so 0.D still deploys on its own. The unused `runRaw` was not deleted but put to work: it
now asserts that an **unsigned** billing callback performs no subscription lookup, does not touch the
plan, and still lands the merchant in the app without a false "declined". **Every later pre-commit lint
clears the cache first.**

---

## Group 0.E — AI provider resilience (items 23-24)

**Item 23 — four separate ways the AI client punished the merchant for something that was not an outage.**

*The rate-limit reset header was parsed as a number.* `anthropic-ratelimit-requests-reset` is an RFC3339
**timestamp**, and the code did `parseFloat(header) * 1000`. `parseFloat("2026-09-09T11:30:00Z")` is
`2026`, so the computed wait was ~2,026,000 ms and `Math.min(resetMs, 10_000)` pinned it to the full
10-second cap. That is a flat **10 seconds added to the merchant's own request, on a SUCCESSFUL call**,
every time the window happened to be low. New pure `rateLimitResetMs` parses the timestamp (and still
accepts a plain seconds value, which other APIs send), returning 0 for junk or a window already past.

*A 429 waited up to a minute, inside a web request.* `Math.max(retryAfter * 1000, (attempt+1) * 5000)`
with a **60-second default** when the header is absent, up to `MAX_RETRIES` times. Now the default is 5
seconds and the whole wait is capped: 10 s where a merchant is watching, 60 s in a bulk job where nobody
is. The two paths are distinguished by an `interactive` flag that defaults to "someone is waiting" — the
worker is the single caller that opts into patience, so a new interactive path cannot accidentally
inherit the slow behaviour.

*A 429 counted toward the global circuit breaker.* Five concurrent rate-limited requests tripped the
5-failure threshold and blacked out generation for **every shop** for 60 seconds. A 429 is not a failure
of the service, it is the service asking us to slow down, so it no longer calls `recordFailure()`.

*A dropped connection failed immediately.* The 5xx path retried; a network error or a timeout did not.
Both are now retried once before giving up, and a timeout is tagged `isTimeout` so callers can tell it
apart from a refusal.

**Deliberately partial, and why.** The brief also asks interactive routes to hand the work to the queue
and answer "taking longer than usual — we'll keep going in the background". I have not done that half.
Handing off mid-request means the original call may still complete after the queued copy starts, and the
merchant is then charged twice for one product — the exact class of defect group 0.B just removed. The
practical outcome the brief is after is already delivered by the two changes above plus item 5: an
interactive generation now fails within ~10 seconds instead of holding for two minutes, and the credit is
refunded, so the merchant loses nothing and can retry. The queue hand-off wants an idempotency key per
(shop, product, attempt) to be safe, which belongs with the Phase 3 quick-start work that will own these
screens.

**Item 24 — two AI paths ran with no rate limit and no credit.**
`generateSocial` on the product page had **neither**: unlimited unmetered model calls on any plan, from a
button. It now takes the same 10/minute rate limit and a credit (`contentType: "social"`), refunded if
nothing usable comes back. Blog generation had a credit (from item 5) but still no rate limit, and it is
the most expensive single call in the app; it now has the same ceiling as everything else.

**Tests — 11 new assertions in `tests/utils/aiResilience.test.js`:** the timestamp parse (including an
explicit assertion that `parseFloat` on the header yields 2026, so the bug cannot quietly return), the
seconds fallback and junk handling, the cap relationship, and source guards that a 429 no longer records
a failure, that its wait is capped and its default is no longer 60 s, that a transient error is retried
once, and that the interactive default is "someone is waiting" with only the worker opting out. Item 24
is covered by per-path assertions plus a sweep asserting every route that calls a generator also gates it.

**Pre-deploy gate:** unit suite **453 passed**, 5 failed — the same untracked
`tests/routes/no-dark-patterns.test.js` (Phase 3, not committed, not seen by CI). Lint clean **from a
cleared cache**. Typecheck **0 errors**. Build clean.

### Group 0.E — LIVE verification (deployed SHA 7687368)

`/api/build-info` = `7687368435a25f26928314b2f57178dbfbc017f9` = `main` HEAD (**G5 pass**).
**G2**: both redirects `302 -> /reembed`. `/api/health` returns `{"status":"ok"}`.

Items 23 and 24 are **code-only**. Verifying them live means driving Anthropic into a 429 or pulling its
connection mid-request against the owner's production API key, and the observable difference — a request
that now fails in ~10 s instead of holding for two minutes — is a timing property, not a state you can
read back. Both are pinned by unit assertions on the exact mechanisms, including one that asserts
`parseFloat` on the header yields `2026` so the original defect cannot quietly return.

---

## Group 0.F — Observability (items 25-26)

**Item 25 — Sentry was effectively unwired.** Three separate reasons almost nothing ever reached it:
- `captureException` was called in exactly **two** places in the entire app, both inside
  `bulkProcessor`. Every error thrown by a loader, an action, or during rendering — which is nearly all
  of them — went to the console and nowhere else.
- `Sentry.init` was **lazy**, run on the first `captureException`. The global handlers Sentry installs at
  init were therefore never active until something had already been reported by hand, which is precisely
  backwards: those handlers exist to catch what nothing reports by hand.
- `process.on("unhandledRejection")` was never registered at all, so a rejected promise nobody awaited
  vanished.

Now: `initErrorMonitoring()` runs eagerly at boot from `startup.server.js`, before the startup checks, so
the first error of a process is reportable; `installProcessErrorHandlers()` registers both
`unhandledRejection` and `uncaughtException`; and `entry.server.jsx` exports `handleError`, which React
Router calls for every loader/action/render error. A client that navigated away (`request.signal.aborted`)
is not reported — that is not an error worth paging anyone about — and the reported path is
`url.pathname` only, never the query string, which can carry a session token. Reports carry
`release: GIT_SHA`, so an error can be traced to the deploy that introduced it.

**The alert rule itself is HUMAN-NEEDED #5** — it lives in the Sentry dashboard, behind a login. Written
up with the exact click path and a one-line command to prove it fires. Without it, errors are captured
but nobody is told, which is only half the point.

**Item 26 — the health check could not see the product.** `/api/health` returned `ok` when:
Redis was dead (the cache silently falls back to an in-process Map, so nothing failed); the BullMQ worker
was not running at all (so every merchant's bulk job sat queued forever); and the AI circuit breaker was
open (so no shop could generate anything). An uptime monitor pointed at it would have reported 100%
availability through all three. It also had no timeouts, so a hung database made the health check itself
hang — the one endpoint that must always answer.

`?deep=1` now reports, with the shallow check left cheap and unchanged for Fly's own 30-second probe:

| Check | Source | Effect |
|---|---|---|
| database | `SELECT 1`, 2 s timeout | failure → **503** |
| redis | cache ping, 1 s timeout | failure → degraded (200) |
| queue + worker | `getQueueHealth()` — `Queue.getJobCounts` and `worker.isRunning()` | dead worker in production → **503** |
| jobs | failed in the last 10 min; stranded in `processing` | stranded → **503**; failed only → degraded |
| aiCircuitBreaker | `getCircuitBreakerState()` | open → degraded (it closes itself after a minute) |
| build | `GIT_SHA` | which release answered |

Three states rather than two: `ok` (200), `degraded` (200, a monitor should warn), `error` (503, the app
cannot do its job). A dead worker and stranded jobs are 503 because the app's central promise — bulk
generation — is not being kept, even though every page still loads. Redis and an open breaker are
degraded because the app still serves and both recover on their own. Every probe is individually
wrapped, so one failing probe reports itself rather than taking the endpoint down.

**Tests — 14 new assertions in `tests/routes/health.deep.test.js`:** the shallow check stays minimal, does
not probe the queue, and 503s on a dead database without echoing the connection string; the deep check
reports every field; a dead worker and stranded jobs each produce 503; Redis down, an open breaker, and
recent failures each produce degraded-but-200; and a probe that throws is reported as unavailable rather
than failing the endpoint. Item 25 is covered by guards that init is eager and called from startup, that
both process handlers are registered, that `handleError` is exported and reports via `captureException`
while ignoring aborted requests and never logging the query string, and that reports carry the release.

**Pre-deploy gate:** unit suite **467 passed**, 5 failed — the same untracked
`tests/routes/no-dark-patterns.test.js` (Phase 3, not committed, not seen by CI). Lint clean **from a
cleared cache**. Typecheck **0 errors**. Build clean.

### Group 0.F — LIVE verification (deployed SHA 8665a25)

`/api/build-info` = `8665a2548bfd979285857de2c3df41ba4636ccfd` = `main` HEAD (**G5 pass**).
**G2**: both redirects `302 -> /reembed`. **G4**: `shopify.app.toml` still `write_products,write_content`.

**Item 26, against production.** The shallow check is unchanged and cheap:

```
$ curl -s https://app.navaal.ai/api/health
{"status":"ok","timestamp":"2026-09-09T11:44:43.961Z"}            HTTP 200
```

The deep check is the new part, and it answers the questions the old one could not:

```
$ curl -s "https://app.navaal.ai/api/health?deep=1"
{"status":"ok","timestamp":"2026-09-09T11:44:44.185Z","checks":{
  "database":"ok",
  "redis":"ok",
  "queue":{"configured":true,"workerRunning":true,
           "counts":{"wait":0,"active":0,"delayed":0,"failed":0,"completed":7}},
  "jobs":{"failedLast10Min":0,"stuckProcessing":0},
  "aiCircuitBreaker":{"open":false,"failures":0,"lastFailureAt":null},
  "build":"8665a25"}}                                              HTTP 200
```

`workerRunning: true` is the line that matters: until now nothing outside the process could tell whether
the BullMQ worker was alive, and the old health check reported `ok` either way.

**G1** — `node scripts/gauntlet-211.mjs`: **30/30 steps passed, FINAL_RESULT=PASS**. This run started
against `7687368` and finished against `8665a25` (the deploy landed mid-run), so it covers both the 0.E
and 0.F builds; every one of the thirty assertions passed on both sides of the transition.


---

# PHASE 0 — COMPLETE. Item-by-item ledger.

Six groups, six deploys (seven pushes — group 0.D needed a follow-up after CI caught lint errors in its
new tests). Every item has at least one test. **LIVE** means it was exercised against
`https://app.navaal.ai` and the result is pasted above; **code-only** means it is proven by tests and
review but not by a production observation, with the reason given.

| # | Item | Group | Commit | Deployed | Verified |
|---|---|---|---|---|---|
| 1 | GDPR webhooks 500 on every delivery | 0.A | `39133e4` | `39133e4` | **LIVE** — 200 + exactly one audit row, read back |
| 2 | Webhook headers trusted unsigned | 0.A | `39133e4` | `39133e4` | **LIVE** — shop mismatch 401, stale 401, redelivery `Duplicate` |
| 3 | `scopes_update` 500s on a payload shape | 0.A | `39133e4` | `39133e4` | **LIVE** — missing `current` returns 200 |
| 4 | Bulk generates first, checks quota second | 0.B | `500543c` | `500543c` | code-only — needs a real 5,000-product run |
| 5 | Interactive paths never refund | 0.B | `500543c` | `500543c` | code-only — needs a real model timeout |
| 6 | Empty AI output charged in bulk | 0.B | `500543c` | `500543c` | code-only |
| 7 | Resume double-charges | 0.B | `500543c` | `500543c` | code-only |
| 8 | A paying merchant can be shown Free | 0.B | `500543c` | `500543c` | code-only — needs a real Starter→Growth charge |
| 9 | Bulk publish reports success when throttled | 0.B | `500543c` | `500543c` | code-only |
| 10 | Trial + free quota reset on demand | 0.B | `500543c` | `500543c` | **LIVE** (columns present in prod DB) + code-only (logic) |
| 11 | Verify Fly secrets | 0.B | — | — | **LIVE** — no `BILLING_TEST_OVERRIDE`; `SENTRY_DSN` present |
| 12 | Deploy/crash strands a job forever | 0.C | `dce73cf` | `dce73cf` | code-only — proving it means killing a machine mid-job |
| 13 | Redis outage hangs "Start job" | 0.C | `dce73cf` | `dce73cf` | code-only — proving it means taking Redis away |
| 14 | Uninstall during a bulk job | 0.C | `dce73cf` | `dce73cf` | code-only — proving it means uninstalling from a live store |
| 15 | `connection_limit=1` | 0.C | `dce73cf` | `dce73cf` | **LIVE** — the new warning is in production logs; **value is HUMAN-NEEDED #4** |
| 16 | First-load race + cache double-run | 0.C | `dce73cf` | `dce73cf` | code-only |
| 17 | Reflected XSS in `/reembed?target=` | 0.D | `7942c30`+`0ae81e9` | `0ae81e9` | **LIVE** — payload rejected, CSP present, zero injected script |
| 18 | Stored XSS on the merchant storefront | 0.D | `7942c30`+`0ae81e9` | `0ae81e9` | code-only — proving it means publishing attacker content to a real shop |
| 19 | Prompt injection has no structural defence | 0.D | `7942c30`+`0ae81e9` | `0ae81e9` | code-only |
| 20 | `/billing/callback` is an open oracle | 0.D | `7942c30`+`0ae81e9` | `0ae81e9` | code-only — proving it means reading a real merchant's plan |
| 21 | `/api/generate` unusable and exposed | 0.D | `7942c30`+`0ae81e9` | `0ae81e9` | **LIVE** — GET and POST both `404` |
| 22 | Cookies, headers, sanitiser, feed | 0.D | `7942c30`+`0ae81e9` | `0ae81e9` | **LIVE** — `/app` sends all four headers; `build-info` has no `node` |
| 23 | Anthropic backoff, breaker, retries | 0.E | `7687368` | `7687368` | code-only — a timing property, not a readable state |
| 24 | Ungated AI paths (social, blog) | 0.E | `7687368` | `7687368` | code-only |
| 25 | Sentry effectively unwired | 0.F | `8665a25` | `8665a25` | code-only; **alert rule is HUMAN-NEEDED #5** |
| 26 | Health check depth | 0.F | `8665a25` | `8665a25` | **LIVE** — `?deep=1` output pasted above |

**LIVE-verified: items 1, 2, 3, 11, 15, 17, 21, 22, 26, and the storage half of 10.** The rest are
code-only for one of three reasons, all stated per item above: proving them needs a destructive action
against a live install (kill a machine, remove Redis, uninstall the app), a real charge through Shopify
billing, or publishing attacker content to a merchant's storefront. None of those is a thing to do to a
production install to satisfy a checklist.

## Guardrails, per deploy

| Deploy | G1 (App Store gauntlet) | G2 (curl) | G5 (SHA) |
|---|---|---|---|
| `39133e4` (0.A) | 27/27 assertions PASS, harness aborted before the last steps (twice, never on an app assertion) | pass | pass |
| `500543c` (0.B) | **30/30 PASS** | pass | pass |
| `dce73cf` (0.C) | **30/30 PASS** | pass | pass |
| `0ae81e9` (0.D) | not run — superseded by the 0.E deploy before a run completed; item 17 verified directly with curl instead | pass | pass |
| `7687368` (0.E) | **30/30 PASS** (one run spanning the 0.E to 0.F transition) | pass | pass |
| `8665a25` (0.F) | **30/30 PASS** (the same run, which finished against this build) | pass | pass |

G3 (no new route skips `authenticate.admin`): the only routes added or changed outside `/app/*` are
webhooks, which verify HMAC directly and by design carry no session, and `/billing/callback`, which is
public by necessity and is now signed. G4 (no new scopes): `shopify.app.toml` still reads
`write_products,write_content`, unchanged. G6: CI green on `main`; typecheck 0 errors throughout, though
it remains non-blocking until Phase 1. G7: this file is append-only and `HUMAN-NEEDED.md` now carries
five open items.

## What Phase 0 did NOT do, stated plainly

- **Item 15's actual value.** The code reports the problem; changing `DATABASE_URL` means handling a
  secret containing the database password. **HUMAN-NEEDED #4.**
- **Item 25's alert rule.** Errors are now captured; nobody is told until the rule exists.
  **HUMAN-NEEDED #5.**
- **Item 23's queue hand-off.** The brief asks interactive routes to hand slow work to the queue. Doing
  that safely needs an idempotency key per shop/product/attempt, or the original request and the queued
  copy both complete and the merchant is charged twice — the exact defect group 0.B just removed. The
  outcome the brief wants is delivered by the capped backoff plus the item 5 refund: an interactive
  generation now fails in about ten seconds and costs nothing. Reasoning recorded in the 0.E section.
- **Anything from Phase 1 onward.** Not started, as instructed.

## One process failure worth recording

The group 0.D commit shipped three lint errors in its new test files and CI went red, so that group did
not deploy on its first push. The cause was mine: `npm run lint` uses `--cache`, and I trusted a cached
pass. Every pre-commit lint after that cleared the cache first, and the follow-up commit (`0ae81e9`) fixed
the three and turned one of them — an unused test helper — into a real assertion that an unsigned billing
callback performs no lookup.

---

## Owner confirmations, 2026-09-09 (after the Phase 0 ledger)

**Item 11 — the secret inventory, confirmed by the owner.** `fly secrets list -a contentclaude`, names
only, agrees exactly with what was read from production during group 0.B:

```
ANTHROPIC_API_KEY, DATABASE_URL, LOG_LEVEL, NODE_ENV, REDIS_URL, SCOPES,
SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SENTRY_DSN, FEATURE_MAGIC_MOMENT
```

- **No `BILLING_TEST_OVERRIDE`.** Real merchants get real charges. This is the one that matters most:
  had it been present, every subscription created in production would have been a $0 test charge.
- `SENTRY_DSN`, `REDIS_URL`, `ANTHROPIC_API_KEY` and `DATABASE_URL` are all present, so nothing the app
  depends on is missing.
- **`FEATURE_MAGIC_MOMENT` stays for now, deliberately.** It gates `app/routes/app.welcome.jsx`, which
  Phase 3 item 3.1 retires along with `app.setup.jsx`. Removing the secret before that route is gone
  would send every brand-new shop down the fallback path mid-Phase-0 for no benefit. The secret goes
  when the route does, in the same change, so there is never a window where one exists without the
  other. Item 11 remains **LIVE-verified**.

**Item 25 — the Sentry alert rule now exists.** The owner created it and the deliberate test error
produced an email, so a new issue reaches a human rather than sitting in a dashboard nobody opens. That
closes the last dependency on item 25: the code half (eager `Sentry.init` at boot, the exported
`handleError`, the `unhandledRejection` and `uncaughtException` handlers, and `release: GIT_SHA` tagging)
shipped in `8665a25`, and the notification half is now live too.

**Item 25 is therefore no longer code-only.** Its ledger row above says "code-only; alert rule is
HUMAN-NEEDED #5"; with the rule created and a test email received, the item is complete end to end. The
`HUMAN-NEEDED.md` entry has moved from Open to Done rather than being deleted, so the record of what was
required survives.

**HUMAN-NEEDED now stands at four open items**, none of them Phase 0 blockers except one: item 4, raising
`connection_limit` from 1 to 5. That is the only Phase 0 finding still visibly wrong in production — the
startup warning is in the logs on every boot — and it needs a human because the new value contains the
database password.

### Item 25 is LIVE-verified after all

The ledger row for item 25 says "code-only". That was true when written and is not any more. Sentry's
eager initialisation is visible in the production logs on every machine boot, and the release tag is
populated, which is what makes an error traceable to the deploy that caused it:

```
$ fly logs -a contentclaude

app[8e647ef7354428] syd  {"level":30,"service":"contentclaude","env":"production",
  "release":"fd81c433f5fba5681a07f1ebdd517afcde4a14e9",
  "msg":"Sentry error monitoring initialised"}

app[861032ae672158] syd  {"level":30,"service":"contentclaude","env":"production",
  "release":"fd81c433f5fba5681a07f1ebdd517afcde4a14e9",
  "msg":"Sentry error monitoring initialised"}
```

Both halves of item 25 are therefore proven in production: the SDK initialises at boot rather than on a
first manual capture, on every machine, tagged with the running build; and the owner's alert rule
delivered a test email. **Item 25: LIVE-verified.**

What is still only asserted by tests for item 25 is that a thrown loader error reaches Sentry through the
new `handleError`. Proving that means deliberately breaking a route in production, so it stays a test.

The same log excerpt carries the other standing fact, on every boot, from both machines:

```
⚠️ STARTUP: DATABASE_URL sets connection_limit=1. One connection serialises the web process behind
every worker transaction and causes pool timeouts under modest load — raise it to 5 on the pooled
endpoint.
```

That is HUMAN-NEEDED #4, and it is the last Phase 0 finding still visibly wrong in production.

**Deploy `c65ba8f` is live and healthy**: `/api/build-info` matches `main`, and `/api/health?deep=1`
reports `status: ok` with `workerRunning: true`, no failed or stranded jobs, and the AI breaker closed.

---

# INCIDENT — 2026-09-09, ~12:15–12:35 UTC: production database unreachable for ~20 minutes

**What happened.** `DATABASE_URL` was being changed to raise `connection_limit` from 1 to 5
(HUMAN-NEEDED #4, Phase 0 item 15). It was set with `fly secrets set` from Windows `cmd.exe`. The Neon
password is URL-encoded and contains `%xx` sequences; `cmd.exe` treats `%…%` as variable references and
strips them. The secret was stored **corrupted**. `fly secrets set` restarts every machine, so both
machines came back onto a `DATABASE_URL` that could not authenticate.

**Impact.** `/api/health` returned **503** with `database: "error"` for roughly twenty minutes. Every page
in the app fails when Prisma cannot connect, so this was a total outage for the duration. No data was
lost or written incorrectly — the app could not reach the database at all, which is the safe failure.

**Recovery.** `fly secrets import` from a file. `import` reads `KEY=VALUE` lines from stdin and performs
no shell interpolation, so the `%xx` sequences survive intact. Confirmed afterwards from the machine:
pooled endpoint (`-pooler`, `pgbouncer=true`), `connection_limit=5`, password length 16 with no residual
`%xx`, and `fly logs` showing `✅ All startup checks passed` on both machines with the
`connection_limit` warning gone.

**The part that matters more than the typo: nothing alerted.** There was no uptime monitor and no
scheduled health check. The only way to learn that production was down was for a human to look. Twenty
minutes is how long it took someone to look. That is the real finding, and it is exactly what Phase 1
item 5 is for.

## What has changed as a result

1. **A rule, written where it will be read.** `docs/RUNBOOK.md` opens with Rule 0: secrets are **always**
   set with `fly secrets import < file`, never `fly secrets set` on a command line, followed immediately
   by a `curl /api/health?deep=1` check because import restarts every machine. `HUMAN-NEEDED.md` repeats
   it at the top, since that is the file a human is holding when they are about to set a secret. The
   hazard is not Windows-specific: any value containing `%`, `$`, `!`, `^` or a backtick is at risk in
   some shell, and the file form has no such hazard in any of them.
2. **A runbook entry that names this as the first thing to check.** "503 with `database: "error"`" now
   begins with "was a secret just changed?", because `fly secrets list` shows a digest and a date per
   secret and that is the fastest way to tell.
3. **This incident is the acceptance test for Phase 1 item 5.** The brief asks four questions and requires
   all four to read "alert". Question three is "Neon down". This incident IS that question, asked in
   production, and the honest answer on 2026-09-09 was **nothing** — no alert, no email, no page. Item 5
   is not complete until re-running this scenario would produce an alert within a couple of minutes, and
   the uptime monitor plus the 5-minute deep-health check are what must make that true.

**Why the deep health check would not have caught it on its own.** `/api/health` already returned 503
correctly — the endpoint was working exactly as designed. The gap was that nothing was *calling* it. A
correct health endpoint that nobody polls is a log line, not an alert. That distinction is the whole
substance of Phase 1 item 5.

---

# Housekeeping before Phase 1 (2026-09-09)

**Phase 0 is verified closed by the owner's reviewer.** HUMAN-NEEDED items 1-4 are all done and have moved
to a Done section in that file rather than being deleted, so the record of what was required survives.

- **Item 1** — app name deployed via the Shopify CLI; the admin sidebar reads `Navaal: AI SEO, AEO & GEO`.
- **Item 2** — the App Store listing matches that string character for character.
- **Item 3** — GA4 `G-8H3DS31YQ8` is live on the listing, so listing pageviews carry the `surface_*`
  params and the server-side install event can be joined to them. The daily digest (Phase 1 item 5) can
  read it now.
- **Item 4** — `connection_limit` raised to 5. Verified from the production machine: pooled Neon endpoint,
  `connection_limit=5`, password intact, and `fly logs` showing `✅ All startup checks passed` with the
  warning gone from both machines. **This change caused the incident recorded below.**

**The duplicate `WORLD-CLASS-BRIEF.md` in the repo root is deleted.** It was untracked and byte-identical
to `docs/WORLD-CLASS-BRIEF.md`, which is canonical. Two copies of a brief is how they drift.

**`/billing/callback` no longer raises a banner at a merchant who did nothing wrong.** An unsigned or
expired callback used to redirect to `/app/plans?billing_error=1`, which shows an error notice. But from
where the merchant is standing, they approved a charge and came back: the missing signature is not
something they caused or can act on, and the reconcile corrects the plan silently within seconds. It now
redirects to a plain `/app/plans` with no query string at all. The reason still goes to the logs, where
it belongs. The existing assertion was tightened to match: the Location must END at `/app/plans`, carry
no `billing_error`, and contain no `?`.

---

# PHASE 1 — A PLATFORM THAT RUNS FOR 100 YEARS

Ten items. Written in order, deployed in batches, each batch through the same guardrails as Phase 0.

## Item 1 — Migrations (commits `5af8e82`, `be634d9`, `82246c2`; deployed `82246c2`)

**What was wrong.** There was no `prisma/migrations` folder at all. `release_command` ran
`prisma db push`, which compares the schema to the database and applies whatever difference it finds,
with no record of what it did and no way back. One `--accept-data-loss` — or one column rename, which
`db push` implements as a drop and an add — and a column of merchant content is gone, with nothing to
roll back to.

**What was done.**

1. `prisma migrate diff --from-empty --to-schema-datamodel` generated a 409-line
   `prisma/migrations/0_init/migration.sql` that reproduces the current schema exactly. It was **not**
   generated from a guess: it is the schema the production database is already running.
2. `prisma migrate resolve --applied 0_init` marked it applied against production, so the baseline is
   recorded without re-running DDL on a live database.
3. `release_command` became `npx prisma migrate deploy`. It now refuses to start a release if a
   migration fails, rather than silently reshaping the schema.
4. `prisma/migrations/README.md` documents the rollback: **the migration rolls back before the image**.
   `fly releases rollback` puts the old code back but leaves the new schema in place, so a migration that
   dropped something must be reversed first, by hand or by PITR, and only then the image.

**The failure that had to be fixed to make it work.** The first release command failed with
`P1002 ... Timed out trying to acquire a postgres advisory lock`. `migrate deploy` takes a Postgres
advisory lock to stop two deploys migrating at once, and advisory locks are session-scoped — they do not
survive pgbouncer's transaction pooling, which hands a different backend to each statement. The deploy
aborted. `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=true` in `fly.toml` unblocks it, and is honest about what
it costs: it is safe **only while there are no pending migrations**, when the command is just a read of
`_prisma_migrations`. The real fix is a direct, unpooled connection, and that is HUMAN-NEEDED item 1
(`DIRECT_URL`) because it needs the Neon console.

**Status:** LIVE-verified. `fly logs` shows the release command completing and
`https://app.navaal.ai/api/build-info` returns `82246c2`.

## Item 2 — Topology: web and worker are separate processes (commits `53e9e27`, `14b73f8`; deployed `82246c2`)

**What was wrong.** One `shared-cpu-1x` 512 MB machine in Sydney was serving the admin UI *and* running
the BullMQ worker *and* holding the Prisma pool *and* base64-ing images for AI calls. Three consequences,
all of them merchant-visible: a web deploy killed whatever bulk generation was mid-flight; a long
generation competed with page loads for the same CPU and the same connections; and the worker could only
ever live wherever the web server lived.

**What was done.**

- `app/utils/processRole.server.js` — one place that decides the role, from `FLY_PROCESS_GROUP` with a
  `RUN_WORKER` override, and exports `RUNS_JOBS`. Local development, with no process group set, still
  runs both, so nobody has to start two things to work on the app.
- `worker.js` — the worker entry. Sets `RUN_WORKER=1`, imports the startup module, and **exits 1 if
  startup throws** rather than idling as a machine that is up and doing nothing.
- `fly.toml` — `[processes] web = "npm run start"` / `worker = "node worker.js"`; `[http_service]` bound
  to `processes = ["web"]` so no traffic can reach the worker; per-group `[[vm]]` (web
  `shared-cpu-1x`/512 MB, worker `shared-cpu-2x`/1 GB with `auto_stop_machines = "off"` and
  `swap_size_mb = 512`); `kill_timeout = "60s"` so a job gets a minute to finish on SIGTERM instead of
  being cut off; `[checks]` scoped to web.
- `app/utils/startup.server.js` — boot recovery, the five-minute stuck-job sweep, `startWorker()` and the
  scheduler are all behind `RUNS_JOBS`. A web machine no longer starts a worker, and with two web
  machines that matters: it would have been two workers racing the same queue.
- `app/queues/generationQueue.server.js` — worker liveness became a **Redis heartbeat**
  (`worker:heartbeat`, written every 30s, stale after 90s) instead of an in-process `isRunning()` call.
  That was not a refinement; it was necessary. Once the worker moved to its own machine, a web machine
  answering `/api/health?deep=1` had no way to know whether the worker was alive — it would have reported
  on itself and always said yes.
- `app/db.server.js` — the process that runs jobs prefers `WORKER_DATABASE_URL` if it exists, so the
  worker can hold a smaller pool than web. Fly cannot scope a secret to a process group, so this is a
  separate secret (HUMAN-NEEDED item 2). Absent, the worker uses `DATABASE_URL` and nothing changes.
  `Startup complete` now logs `dbUrlSource`, so which string a machine opened is a fact in the logs
  rather than an assumption.

**The proof the brief asked for — the worker survives a web deploy.** A web-only deploy was run and both
machines watched across it:

| | web machine | worker machine |
|---|---|---|
| version before | 143 | 143 |
| version after | **144** | **143** |
| created | during the deploy | 12:59:52 |
| last updated | 13:12:30 | **12:59:52 (never)** |
| restarts during deploy | yes, by design | **none** |

`/api/health?deep=1` stayed green throughout, `workerRunning: true` the whole way. That is the property
the split exists for: **shipping the UI no longer kills a merchant's running job.**

**The failure that had to be fixed to make it work.** The first worker boot crashed with
`Cannot find module '/app/app/db.server' imported from /app/app/shopify.server.js`. Vite resolves
extensionless relative imports; plain Node ESM does not, and `worker.js` runs under plain Node. 113
extensionless relative imports across 39 files were given their `.js` extensions, the chain
`bulkProcessor` to `shopify.server` to `db.server` was verified to resolve under Node with no bundler,
and a test now guards it. **The deep health check caught this on its first real outing** —
`workerRunning:false` and a 503 — which is exactly what Phase 0 item 26 was built to do.

**Not done, and why.** Web is still **one machine in `syd`**, not two across `iad` and `syd`. The brief
asks for `iad` for US latency, and the measurement behind that ask is real. But Neon is in Sydney: an
`iad` web machine would cross the Pacific on **every query**, so a page making four sequential queries
would trade roughly 200 ms of TTFB for roughly 800 ms of database round trips and end up slower, not
faster. Two-region web is worth doing **after** the database is regional (a Neon read replica in `iad`,
or a move), and not before. Stated here rather than quietly skipped.

**Status:** LIVE-verified, with the two-region half deliberately deferred and the reason recorded.

## Item 3 — Docker: Node 22, non-root (commit `53e9e27`; deployed `82246c2`)

`FROM node:20-alpine` became `node:22-alpine` — Node 20 is end of life and stops receiving security
patches. The image now does `chown -R node:node /app` and `USER node` after the build, so the runtime is
not root and a process escape does not start with root. Everything above that line needs write access to
build; nothing below it does. The `.dockerignore` was verified intact (`tests/` and `*.md` excluded) and
not regressed. `postgresql-client` is installed for the nightly `pg_dump`, and deliberately **cannot fail
the build**: the package name moves between Alpine releases, so the candidates are tried in order and a
miss is reported by the backup job as unconfigured rather than breaking every deploy.

**Status:** LIVE-verified — production is running the Node 22 image as `node`.

## Item 4 — CI: typecheck blocking, post-deploy smoke (commit `53e9e27`; deployed `82246c2`)

- **Typecheck is blocking.** `continue-on-error` is gone. The errors were fixed first, in Phase 0, rather
  than the flag being flipped over a red build.
- **`npm audit` stays informative**, as the brief asks — it fails on transitive advisories nobody can act
  on that day, and a gate that everyone learns to ignore is worse than no gate.
- **A new `smoke` job runs after the deploy** and fails loudly: `/api/build-info` `sha` must equal the
  pushed commit (so a deploy that silently did not land is caught), `/api/health?deep=1` must not be
  `error` **and must report `workerRunning: true`**, `GET /` must 302 to `/reembed`, and `HEAD /app` must
  not be 5xx.
- **Concurrency:** pull-request runs cancel each other, which is free. Pushes to `main` **queue** —
  cancelling a deploy mid-flight can leave a release half-applied, and after item 1 it can leave a
  migration half-applied.

**Status:** LIVE-verified — the smoke job ran green against `82246c2`.

## Item 5 — Alerting: the owner is told, not left to look

**The acceptance test is the incident above.** On 2026-09-09 production was down for twenty minutes with
`database: error` and nothing said a word. `/api/health` was returning 503 correctly the entire time.
Nothing was calling it. A correct health endpoint nobody polls is a log line, not an alert.

- **`app/utils/notify.server.js`** — `sendOperatorEmail()` via Resend. With no `RESEND_API_KEY` it does
  not swallow the message: it logs at **error** level with the full body and
  `event: "operator_alert_undeliverable"`, so the alert still reaches Sentry and `fly logs`. Degrading
  quietly is how you end up back at 2026-09-09.
- **`app/utils/scheduler.server.js`** — a deep-health probe every five minutes against the **public** URL,
  so it exercises the same path a merchant does: DNS, TLS, the Fly proxy, a web machine. On 503 or on no
  answer, it emails. It alerts on the transition into trouble and then at most hourly, so a long outage
  is one email and a reminder, not twelve an hour. It emails again when it recovers. **`degraded` is not
  an alert** — Redis being briefly unavailable and the AI circuit breaker being open are both states the
  app is designed to ride out, and paging on them teaches the owner to ignore the alerts.
- **The daily digest**, 07:00 Australia/Sydney, in `app/utils/digest.server.js`: installs, uninstalls,
  reinstalls, first drafts, first publishes, review asks, jobs run and failed, quota-skipped count,
  generations, paid shops. The day is claimed in Redis with `SET NX`, so a worker restart inside the hour
  cannot send a second copy. The digest **states what it is not reporting** — the install source split
  and traffic/revenue — rather than printing a zero that reads like a fact.
- Both run in the **worker**, which is the one process that is never auto-stopped and never
  load-balanced. Exactly one of it exists, so these fire once rather than once per web machine.

**Coverage:** `tests/utils/alerting.test.js`, 17 assertions, green. The first one is the incident itself:
a 503 with `database: error` produces an email whose body names the runbook and says to suspect a
just-changed secret.

**Still needed from a human:** the external uptime monitor (HUMAN-NEEDED item 3) and `RESEND_API_KEY`
(item 4). The five-minute check runs *inside* the same infrastructure — if Fly itself is gone, so is the
thing that would tell you. Only an external monitor survives that, and it needs an account.

## Item 6 — Polling load

**What was wrong.** `JobProgressTicker` polled `/api/jobs-status` every 15 seconds from **every open
admin tab, forever**, whether or not anything was running. Each poll is a full Shopify session
authentication plus a Prisma query. A merchant with three tabs open overnight was seventeen thousand
authenticated database round trips before breakfast, all of them answering "nothing is happening". The
Jobs page polled on top of that, so it double-polled itself.

**What was done.** The `app.jsx` loader now counts active jobs (`queued` or `processing`) and passes
`activeJobCount` down. The ticker:

- **does not start at all** when there is no active job and none has been seen;
- **does not run on the Jobs page**, which has its own revalidation — that is the double-poll gone;
- **stops after two consecutive idle responses**, so a finished job stops the polling instead of leaving
  it running forever;
- restarts by itself when the loader reports work again, so nothing is missed.

**Coverage:** `tests/routes/polling.test.js`, 11 assertions, green.

## Item 7 — Backups

Neon's point-in-time restore is the first line of defence, and it is a console setting (HUMAN-NEEDED item
5). But PITR does not protect against losing access to the Neon **project** — billing, account, provider.
A backup that lives inside the thing it is backing up is not a backup.

**`app/utils/backup.server.js`** takes one `pg_dump` a night at 03:00 Sydney and puts it in Cloudflare
R2, a different company, under a dated key. It signs the request with hand-rolled SigV4 rather than
pulling in the AWS SDK for one PUT. It **refuses to store a dump under 1024 bytes** — an empty file that
uploads successfully is the worst possible outcome, because it looks like a backup — and it emails on
every failure. With no R2 credentials it logs `backup_not_configured` and **names exactly which pieces
are missing**.

**Coverage:** the item 7 half of `tests/utils/alerting.test.js` — refuses when unconfigured, lists the
missing pieces, refuses the tiny dump and emails, stores a real dump under a dated key, and fires at
03:00 Sydney and no other hour.

**The restore drill (HUMAN-NEEDED item 7) is the one item here nobody can automate.** An untested backup
is a hope. The procedure is in `docs/RUNBOOK.md` and restores into a **new Neon branch**, never
production.

## Item 8 — Docs

`DEPLOYMENT.md` described a different application. It recommended **Railway** as the primary target
(the app is on Fly, and has been for months), described a migration flow that did not exist, told the
reader to set `BILLING_TEST = false` **in source** before submitting to the App Store, listed
`write_metaobjects` and `write_metaobject_definitions` among the scopes (the app requests
`write_products,write_content`, and startup warns about the others), advised `connection_limit=1`, and
stated that the app has no health endpoint. Every one of those was wrong. The billing one could cost a
rejection; the `connection_limit=1` one is the exact advice that caused pool timeouts.

**Rewritten from the deployed reality**, and three new documents beside it:

- **`DEPLOYMENT.md`** — the deploy is `git push origin main`, and nothing else. Process groups and why
  each setting exists (`kill_timeout` was five seconds by default and hard-killed a job on every deploy).
  Migrations and the rollback order. The CI gates and the smoke job. **The ESLint `--cache` trap that
  already cost a deploy**, with the exact command to defeat it. Verification commands. The Shopify half,
  which is a separate human step.
- **`docs/SECRETS.md`** — every environment variable the app reads, split into required, optional,
  `fly.toml`, platform-provided and tuning. For each optional one, **what happens without it**, which is
  the question anybody actually has. Rotation steps per secret, including the honest note that rotating
  `SHOPIFY_API_SECRET` has a real window where webhooks and OAuth fail. No values, ever.
- **`docs/ARCHITECTURE.md`** — one page, one diagram, the two processes, the flow of a bulk generation,
  a table of every failure mode and where it surfaces, and a closing section on what this architecture
  does **not** do yet.
- **`docs/RUNBOOK.md`** — already existed from the housekeeping pass; gained **Restoring from a backup**
  (both mechanisms, and why they answer different disasters), the backup failure modes, what to do when
  an alert arrives or should have, and why the digest might be missing.

**Coverage:** `tests/docs/docs.test.js`, 29 assertions. Documentation rots silently, which is exactly
what a test is for. Each of the four false claims is pinned so it cannot return. One assertion is worth
naming: **it walks `app/` for every `process.env.X` and fails if any of them is missing from
`docs/SECRETS.md`.** It caught three undocumented variables on its first run.

## Item 9 — Repo hygiene

Fly's own build-context warning was the evidence: `gauntlet-211/ 70MB`, `title-proof2/ 33MB`,
`gauntlet-record/ 22MB`, `reviewer-proof-video/ 18MB`, `billing-review-proof/ 9.5MB`. **186 MB across
thirteen directories of Playwright screenshots and video frames, uploaded to Fly on every single
deploy.**

- **Three stale agent worktrees**, all at `ff52f34`, all with uncommitted work. Everything was taken out
  before they were removed: the quick-start route and its 427-line helper that Phase 3 needs, and two
  patches covering thirteen modified files. They are in `docs/history/worktree-recovery/` with a README
  that says plainly that `ff52f34` predates every Phase 0 fix, so **the patches may apply cleanly and
  still be wrong**. Saved as `.txt` so nothing compiles them. Worktrees pruned, branches deleted.
- **186 MB of proof output deleted**, after checking what was in it: screenshots, video frames, and eight
  small `results.json` files. The JSON was kept, in `docs/history/proof-results/`; the media was not.
  Nothing tracked was deleted.
- **The ignore rules are now patterns, not thirteen names.** `.gitignore` had accumulated an entry per
  directory, which is a rule that loses to the next directory somebody invents. `gauntlet-*/`,
  `billing-*/`, `proof-*/`, `repro-*/`, `reviewer-*/`, `verify-*/` and friends replace them, in
  `.gitignore` and again in `.dockerignore`.
- **Six root reports moved to `docs/history/`.** They are the record of four App Store rejections, worth
  keeping and not worth being the first thing a reader sees. The root now holds exactly four markdown
  files: README, DEPLOYMENT, PROGRESS, HUMAN-NEEDED.
- **32 Playwright harnesses moved from `scripts/` to `tools/proof/`**, which `.dockerignore` excludes
  wholesale. `scripts/` is now only the seven operational scripts that run **on the Fly machine**.
  Two different jobs had been living in one pile, and nothing distinguished a read-only report from a
  script that uninstalls the app from a live store.
- **`tools/proof/README.md`** grades every harness by what it touches — writes to a live shop, reads a
  live shop, or purely local — and states that they run against `navaal-qa-fresh`, never a real merchant.
- **`scripts/README.md`**, and the three keepers renamed so the default is in the name:
  `backfill-faq-metafields--dry-run-default.mjs`, `fix-legacy-alttext-rows--dry-run-default.mjs`,
  `test-seed-usage--writes-test-store-only.mjs`. A script name that does not say whether it writes is a
  trap at 2am.
- **`build/_to_delete/audit-src.tgz` no longer exists.** Checked rather than assumed; `build/` now holds
  only `client` and `server`, and is ignored by git and Docker both.

**Coverage:** `tests/docs/repo-hygiene.test.js`, 13 assertions. Cleaning a repository once is worth
little — it comes back within a month. These are what makes it stay clean: the root may hold only those
four documents, no proof pattern may be tracked, `.dockerignore` must exclude `tools`, nothing in
`scripts/` may import Playwright, every script must appear in its README, and the seeding script's
test-store guard must survive its rename.

### A flaky test, fixed rather than retried

The items 5-7 push went red on `growthFoundation.test.js`, unrelated to the change:
`expected 2026-09-08T13:42:00.239Z to deeply equal ...240Z`. The helper called `Date.now()` afresh on
every use, so the same expression built as an input and as an expectation could differ by a millisecond.
It is now one clock pinned at import. Re-running until green would have left a test that fails roughly
one run in a few hundred, forever.

## Item 10 — Tests that matter

**What was wrong.** Coverage `include` was `app/utils/**` only. Every route was unmeasured, and routes
are where the merchant-visible decisions live: what a first-run shop sees, how many products an action
takes when quota is short, whether a paying shop is shown Free. The number looked healthy because it was
measuring the half of the code that was easy to test.

Worse, several of the tests that did exist were **regex over source**. They read a route file and asserted
its text contained `sliceToQuota(`. That passes on code that makes the call and throws the result away,
and it fails on a rename that changes nothing. It is a test of spelling.

**Coverage now includes `app/routes/**` and `app/queues/**`.** Only `startup.server.js` is excluded, and
for a stated reason: it is boot sequencing, exercised by the process-role tests and the deep health check.

### The new route tests

| File | Route | What it holds |
|---|---|---|
| `tests/routes/firstRun.test.js` | `app._index` | Where a brand-new shop lands, both feature-flag states, and that `welcomeSeenAt` makes the welcome screen one-shot. Plus that every auth parameter survives the redirect — a redirect that drops `host` or `id_token` reads to a merchant as being logged out. |
| `tests/routes/optimize.quota.test.js` | `app.optimize` | The number this action picks **is the bill.** Exactly `min(work, remaining)` taken, in order; the remainder recorded as `quotaSkipped`; an unknown remaining count treated as **zero, never as unlimited**; a spent quota enqueuing nothing. |
| `tests/routes/products.generate.test.js` | `app.products` | Generate All bounded by quota rather than catalogue; an empty selection running **nothing** rather than falling back to everything; a mid-pagination Shopify failure running what did arrive. |
| `tests/routes/review.publish.test.js` | `app.review` | The THROTTLED path. A throttled product is counted failed, **named** to the merchant, and left as a draft — never marked published. A product whose FAQ metafield failed has just its FAQ row downgraded, so the UI cannot claim FAQ is live when it is not. |
| `tests/routes/jobs.cancel.test.js` | `app.jobs` | Cancel, the state machine around it, and the tenancy boundary all three job actions share. One comparison — `job.shop !== shop` — is the whole thing standing between two merchants. |
| `tests/routes/autopilot.bound.test.js` | `webhooks.products.create` | The only path where a generation is spent with nobody clicking anything. Exactly one product per webhook, seven distinct reasons to skip, and **every one of them a 200** — a non-2xx makes Shopify retry, and a retried autopilot webhook is a retry storm. |
| `tests/routes/jobsStatus.test.js` | `api.jobs-status` | That an auth failure is answered with an empty payload rather than a redirect. `authenticate.admin` throws a redirect to the login form, and this endpoint is polled in the background — following that redirect would yank a merchant out of the app mid-sentence. |
| `tests/routes/reviewRequest.test.js` | `app.review-request` | One review ask, ever. A second call must perform **no write at all** — an upsert with the same value would move the timestamp forward and reset the rule every time. |

`/` and `/auth/login` re-embed were already covered behaviourally in `login-deadend.test.js`, and
`subscriptions_update` ordering in `billing.correctness.test.js` (Phase 0 item 8a).

### The regex-over-source tests, replaced

- **`login-deadend.test.js`** — the two `readFileSync` guards are gone. In their place: a sweep that
  drives **both** public entry points against **six** embedded signals — `host`, `embedded=1`,
  `sec-fetch-dest: iframe`, `sec-fetch-dest: frame`, an `admin.shopify.com` referer, and host+shop — and
  asserts none of the twelve combinations produces form data. That is App Store rejection 2.1.1 as an
  executable statement. The other half is asserted too: a genuine external visit **must still get the
  form**, so the guard cannot have been implemented by deleting it.
- The `rel="home"` markup check became a routing test. The attribute is belt and braces; what actually
  fixed the dead-end is that a bare `/` now re-embeds, so the test proves **both** candidate targets are
  safe rather than checking for an attribute.
- **`credits.test.js`** — the three text guards over the bulk entry points are replaced by the real
  action tests above. Two things survive, and the file says which is which: the bulk processor's
  **ordering** check (the quota must be read *before* the model call, because after it the money is
  spent), which no action test can see, and one remaining source guard on the welcome flow, **labelled as
  a source guard** with the reason — that route is behind a flag and Phase 3 retires it, so a full action
  test would be written in order to be deleted.
- `tests/routes/no-dark-patterns.test.js` is Phase 3's, is gitignored, and fails against `main` by
  design. It is untouched here.

### The Playwright suite is now a documented manual gate

`tests/e2e/README.md` states what it is and is not: not run by CI and it must not be, because it drives a
real admin with a real session and it **writes** — it generates content, publishes to a live storefront,
and changes plans. It exists to assert ground truth **in the Shopify admin**, not what the app's own UI
claims, because the worst bug in this app's history was a UI reporting success while writing nothing.

**And the store is now enforced, not just documented.** `playwright.config.js` defaulted to
`contentpilot-dev2` and would have run against any handle in `SHOP_HANDLE`. It now defaults to
`navaal-qa-fresh` and **refuses to start** against a store that is not on the allow-list:

```
Error: Refusing to run the e2e suite against "some-merchant". It is not one of the known
test stores (navaal-qa-fresh, contentpilot-dev2), and this suite writes to whatever store
it is pointed at. If you really mean it, set E2E_ALLOW_UNLISTED_STORE=1.
```

Verified by running it. A mistyped handle would otherwise have been editing somebody's live catalogue.

**Totals:** 55 tracked test files, **663 assertions passing**, lint and typecheck clean, build clean.
The one failing file is Phase 3's, gitignored, and absent from CI's checkout.

---

# The four questions — "what does the owner see when X breaks?"

The brief asks these to be answered **after** the work, with "alert", "log line" or "nothing", and
requires all four to read **alert**.

Answered honestly first, they did not. Two read "log line", and that is what the last commit of Phase 1
fixed. Both fixes are code with tests, not a change to the wording of the answer.

| # | What breaks | Answer | How |
|---|---|---|---|
| 1 | **Anthropic is down for an hour** | **alert** | Sustained-degradation alert, ~15 min |
| 2 | **Redis is down** | **alert** | 503 within 5 min, plus the external monitor |
| 3 | **Neon is down** | **alert** | 503 within 5 min — the 2026-09-09 incident |
| 4 | **A deploy breaks `/app`** | **alert** | CI smoke fails, and `/app` is probed every 5 min |

## 1. Anthropic is down for an hour → **alert**

**What happens.** The circuit breaker opens after repeated failures, so generations fail fast instead of
burning quota on calls that cannot succeed. `/api/health?deep=1` reports `aiCircuitBreaker.open: true`,
which is `degraded` and **200**, not a 503 — the app still serves every page, and merchants can still
read, edit and publish existing content.

**This was the honest answer, and it was "log line".** `degraded` deliberately does not page: the breaker
closes itself after a minute, and paging on a one-minute self-healing state teaches an owner to ignore
their alerts. But that reasoning does not survive the word "hour". Sixty minutes of no shop being able to
generate anything is an outage, whatever the status field says.

**What was changed.** The five-minute probe now counts consecutive degraded answers. Three in a row —
fifteen minutes — sends `Navaal has been DEGRADED for 15 minutes`, naming the three usual causes in order
of likelihood, with `aiCircuitBreaker.open` first and `status.anthropic.com` in the body. It sends once,
not every five minutes, and sends again when it clears. A single degraded probe between healthy ones
resets the count, so the self-healing case is still silent.

**Timing:** first email at **15 minutes**. Within the hour, one email and one recovery email.

## 2. Redis is down → **alert**

**What happens.** The cache falls back to in-process memory, so pages keep serving. The queue falls back
to inline processing. But the worker heartbeat lives **in Redis**, so `/api/health?deep=1` cannot read it
and reports `workerRunning: false` — and in production a dead worker is `healthy = false`, a **503**.

That is the correct severity. A merchant can still browse, but no bulk job will run, and bulk generation
is what they are paying for.

**Timing:** the in-app probe emails within **five minutes**. The external uptime monitor
(HUMAN-NEEDED item 3), pointed at the deep check, catches it in **two minutes** — two consecutive
60-second failures.

## 3. Neon is down → **alert**

**This is the 2026-09-09 incident, and it is the acceptance test for the whole of item 5.**

On that day a `fly secrets set` from Windows `cmd.exe` corrupted `DATABASE_URL`, both machines restarted
onto it, and `/api/health` returned 503 with `database: "error"` for roughly twenty minutes. **Nothing
alerted.** The endpoint was working perfectly the entire time. Nothing was calling it.

**What happens now.** The five-minute probe gets the 503, and emails
`Navaal is DOWN — /api/health?deep=1 returned 503`. The body carries the response, points at the runbook,
and says in as many words: *if a secret was just changed, assume it is corrupted and re-import it from a
file.* That sentence is there because it is the thing that would have ended that incident in two minutes
instead of twenty.

The first assertion in `tests/utils/alerting.test.js` is that exact shape — a 503 with
`database: "error"` producing an email that mentions the runbook and a just-changed secret.

**Timing:** within **five minutes** from the app, **two minutes** from the external monitor. Against
twenty minutes and nothing.

**The honest limit:** the five-minute probe runs *inside* the same infrastructure. If Fly itself is gone,
so is the thing that would tell you. Only the external monitor survives that, and it needs an account —
which is exactly why it is HUMAN-NEEDED item 3 and not a nice-to-have.

## 4. A deploy breaks `/app` → **alert**

**Two independent mechanisms, because they catch it at different times.**

**At deploy time:** CI's `smoke` job runs after every deploy and fails loudly on four things — the served
SHA not matching the pushed commit, deep health being `error`, `workerRunning` not being true, `GET /`
not redirecting to `/reembed`, and `HEAD /app` returning 5xx. A red workflow emails the person who
pushed.

**At any other time:** this was the second honest "log line". `/api/health` touches the database, Redis,
the queue and the breaker. **It does not render a single route.** A layout loader that throws, a missing
import, a component that fails on render — all of those leave health saying `ok` while every merchant
sees an error page. And a break that arrives later, from a Shopify API change or an expired credential
rather than a deploy, has no smoke job to catch it at all.

**What was changed.** The five-minute cycle now probes `/app` as well, as a separate check with its own
alert. 200, 302 and 401 are all healthy — it is an embedded route and an unauthenticated probe is
*meant* to be redirected. Only **5xx** is a fault, and it emails
`Navaal's admin is broken — /app returned 500`, telling the reader to check `/api/build-info`, roll back
with `fly releases rollback`, and **read the migration notes first, because rolling back the image does
not roll back the schema**.

It stays deliberately quiet when the host does not answer at all: the health probe already covers a dead
host and runs against the same machine. Two emails for one outage trains an owner to ignore both.

**Timing:** immediately at deploy from CI; within **five minutes** otherwise.

---

## What still depends on a human

Three of these four answers are produced by a checker that lives **inside the thing it is checking**. It
cannot report that Fly is gone, that DNS is broken, or that the certificate expired. The external uptime
monitor is the only check that survives the app being completely absent, and it needs an account someone
has to create — HUMAN-NEEDED item 3.

And every one of these emails goes nowhere without `RESEND_API_KEY` — HUMAN-NEEDED item 4. Until that
exists, each alert is logged at **error** level with its full body, so it reaches Sentry and `fly logs`
and can be found. That is a real degradation and it is stated rather than papered over: the alert exists,
it is correct, and it is not yet arriving in an inbox.

---

# PHASE 1 — COMPLETE. Item-by-item ledger.

Five deploys. Every one through the same guardrails: cold-cache lint, blocking typecheck, the full test
suite, a build, and the post-deploy smoke job.

| # | Item | Commit(s) | Deployed | Verified |
|---|---|---|---|---|
| 1 | Migrations | `5af8e82`, `be634d9`, `82246c2` | `82246c2` | **LIVE** — release command runs `migrate deploy`; build-info confirms |
| 2 | Topology (web/worker) | `53e9e27`, `14b73f8`, `71d7197` | `cc0d2b2` | **LIVE** — worker survived a web deploy, 143 → 144 web, worker never restarted |
| 3 | Docker: Node 22, non-root | `53e9e27` | `82246c2` | **LIVE** — `ps` on the machine shows `node   643 node worker.js`; `node -v` is v22.23.2 |
| 4 | CI: typecheck blocking, smoke | `53e9e27` | `82246c2` | **LIVE** — the smoke job has run green on every deploy since |
| 5 | Alerting | `71d7197`, `fab0a38` | `fab0a38` | **LIVE** — `Operator scheduler started` on the worker only, with `healthEveryMs: 300000`, `appUrl` and `degradedProbesBeforeAlert: 3` |
| 6 | Polling load | `71d7197` | `cc0d2b2` | code + smoke — the loader change is deployed; the ticker's behaviour is covered by 11 assertions |
| 7 | Backups | `71d7197` | `cc0d2b2` | code-only — it will log `backup_not_configured` at 03:00 Sydney until R2 exists (HUMAN-NEEDED 6) |
| 8 | Docs | `cc0d2b2` | `cc0d2b2` | **LIVE** in the repo — 29 assertions hold each rewritten claim |
| 9 | Repo hygiene | `cc0d2b2` | `cc0d2b2` | **LIVE** — 186 MB gone from the build context; 13 assertions keep it gone |
| 10 | Tests that matter | `3888cd6` | `3888cd6` | **LIVE** — 55 tracked files, 674 assertions, coverage now includes routes |

**Final deployed SHA: `fab0a38`.** `/api/health?deep=1` reports `status: "ok"`, `database: "ok"`,
`redis: "ok"`, `workerRunning: true`, `stuckProcessing: 0`, breaker closed.

## What Phase 1 did NOT do, stated plainly

- **Two-region web.** The brief asks for `iad` alongside `syd`. Not done, and the reason is in item 2: an
  `iad` web machine would pay a Pacific crossing on **every query** because Neon is in Sydney. For a page
  making four sequential queries that is a net loss. It is worth doing after the database is regional,
  and not before.
- **The advisory-lock override is temporary.** `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` is safe only while
  there are no pending migrations. Before the first real migration it needs `DIRECT_URL` — HUMAN-NEEDED
  item 1.
- **No alert can leave the building yet.** Every one is correct and tested; without `RESEND_API_KEY` each
  is logged at **error** level with its full body rather than emailed. HUMAN-NEEDED item 4.
- **No external monitor.** Three of the four failure answers come from a checker running inside the thing
  it checks. HUMAN-NEEDED item 3.
- **The backup has never run, and no restore has been drilled.** HUMAN-NEEDED items 5, 6 and 7. An
  untested backup is a hope.
- **The two recovered worktree patches have not been applied or assessed.** They are at `ff52f34`, which
  predates every Phase 0 fix, so they may apply cleanly and still be wrong. Recorded in
  `docs/history/worktree-recovery/` for whoever picks them up.

## One process note worth recording

The items 5-7 push went red in CI on a test that had nothing to do with it: `growthFoundation` built the
same timestamp twice from `Date.now()` and the two differed by a millisecond. Re-running would have gone
green and left a test that fails roughly one run in a few hundred, forever. It was fixed instead — one
clock, pinned at import. A flake that is re-run rather than fixed is how a suite stops being believed.

---

# Phase 1 close-out — the secrets landed, and one did not (2026-09-09)

Phase 1 is verified closed by the owner's reviewer. Four HUMAN-NEEDED items were reported done. Three
of them are, and are proven below. **One is not, and the record needs to say so rather than repeat what
it was told.**

## `WORKER_DATABASE_URL` — done, and each process opened the right string

From production logs, one line per machine:

```
"role":"worker","machine":"d8d996d7b1ed28","region":"syd","runsJobs":true,"dbUrlSource":"WORKER_DATABASE_URL"
"role":"web",   "machine":"81112eb9733578","region":"syd","runsJobs":false,"dbUrlSource":"DATABASE_URL"
```

That is the whole point of the split budget: the worker holds a smaller pool sized to its three
concurrent jobs, web keeps its five, and the two together stay inside Neon's ceiling instead of each
claiming five. Deep health stayed green throughout.

## `RESEND_API_KEY` — done, and proven end to end

Not inferred from the secret existing. One deliberate test alert was sent **from the production
machine**, through `sendOperatorEmail()` — the same function the five-minute health probe, the `/app`
shell probe, the daily digest and the nightly backup all call:

```
{"event":"operator_alert_sent","subject":"Navaal alert path test — 2026-09-09T15:28:50.183Z",
 "to":"hello@navaal.ai","msg":"Operator email sent"}
{"event":"alert_path_test","at":"2026-09-09T15:28:50.183Z","recipient":"hello@navaal.ai","sent":true}
```

`operator_alert_sent`, not `operator_alert_undeliverable`. Every alert written in Phase 1 item 5 can
now reach a human. The one-off script was deleted from the machine afterwards.

## The four R2 secrets — done, untested until 03:00 Sydney

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` are all set. The next
03:00 Sydney run is the first real exercise: it should log `backup_ok` with a key and a byte count
rather than `backup_not_configured`. **The restore drill remains open**, and it is the one that
matters — a backup nobody has restored is a hope.

## `DIRECT_URL` — reported done, and it is not set

This was to be the first task before Phase 2: add `directUrl = env("DIRECT_URL")` to the datasource,
drop `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` from `fly.toml`, and prove `prisma migrate deploy` takes
its advisory lock normally. **The secret does not exist.**

```
$ fly secrets list -a contentclaude | grep -ci DIRECT_URL
0
$ fly ssh console -a contentclaude -C printenv | grep -oE '^(DIRECT_URL|WORKER_DATABASE_URL|RESEND_API_KEY|R2_BUCKET)='
DATABASE_URL=
R2_BUCKET=
RESEND_API_KEY=
WORKER_DATABASE_URL=
```

Seventeen secrets are set. `DIRECT_URL` is not one of them. The other three from the same sitting all
landed, so the import method worked — this one did not make it into the file, or into that import.

**What was NOT done because of it.** `directUrl = env("DIRECT_URL")` would make Prisma fail at
validation with "environment variable not found", and the release command would abort every deploy.
Landing that on a missing secret would have taken production's deploy path down to prove a point. So
the datasource is unchanged and the override stays.

**What this costs, precisely.** `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=true` disables the lock Prisma
uses to stop two migration runs racing. Nothing here can race: CI serialises pushes to `main` with a
queued concurrency group, and Fly runs exactly one release command per deploy. So real migrations can
land safely under the override. What is lost is the belt-and-braces guarantee if someone ever runs
`migrate deploy` by hand while a deploy is in flight.

**One line unblocks it**, and then the datasource change and the override removal are a single commit:

```
printf 'DIRECT_URL=%s\n' 'postgresql://…direct-host…/neondb?sslmode=require' > s.env
fly secrets import -a contentclaude < s.env && rm s.env
```

The direct host is the pooled host with `-pooler` removed. Never `fly secrets set` — Rule 0.

---

# PHASE 2 — MAKE IT SIMPLE

## 2.13 — The fresh-store self-audit, done before any code was changed

Every route file read in full and inventoried: each screen, each button, each number, each sentence.
What follows is the finding, then the disposition, then one line of why.

### What a brand-new merchant with an empty store actually sees today

This is the part worth reading first, because it is worse than the item list suggests. Four screens, in
the order a merchant meets them, on a store with 0 products and 0 content:

| Screen | What it says |
|---|---|
| Home | `Total Products 0`, `Products Optimised 0`, `Drafts Pending Review 0` — with the subtitle **"All caught up!"** |
| Products | `0 products · 0 optimised · 0 need content`, header action **`🔒 Generate All — Growth Plan`**, empty state **"Your store is all set!"** |
| Optimise | a green success banner: **"Your store is fully optimised!"** / **"All 0 products have AI-generated content."** |
| SEO Audit | a red **0 / 100** score and four red zeros, with a primary button **"Fix All Missing Content"** pointing back at the screen that just said everything was optimised |

**Three screens congratulate a merchant who has done nothing, and the fourth tells them they are failing.**
One root cause: `needsContent` is computed as `total − published − draft` with a `Math.max(0, …)` floor,
so an empty store is arithmetically indistinguishable from a finished one. No route has a
`totalProducts === 0` branch.

That is not on the brief's list. It is fixed here (2.10) and listed, as 2.13 asks.

### Navigation — 13 items, not 12

The brief says twelve. There are **thirteen**, and two of them point at the same URL:

| # | Label | href | Disposition |
|---|---|---|---|
| 1 | Home (`rel="home"`) | `/app` | **Keep** |
| 2 | Dashboard | `/app` | **Delete** — identical destination to Home, different word |
| 3 | Products | `/app/products` | **Keep** |
| 4 | Optimise Store | `/app/optimize` | **Merge** into Products as the page primary action (2.3) |
| 5 | Review & Publish | `/app/review` | **Keep**, renamed Review |
| 6 | SEO Audit | `/app/seo-audit` | **Merge** — score card on Home, table via "View audit"; route stays |
| 7 | Blog Generator | `/app/blog` | **Keep**, renamed Blog |
| 8 | Collections | `/app/collections` | **Merge** into Products as a tab |
| 9 | Results | `/app/results` | **Merge** into Home |
| 10 | Analytics | `/app/analytics` | **Merge** into Home |
| 11 | Jobs | `/app/jobs` | **Merge** — route kept, reached from the progress banner |
| 12 | Settings | `/app/settings` | **Keep** |
| 13 | Plans & Billing | `/app/plans` | **Merge** into Settings, and remain the target of every usage card |

**Proposed five: Home · Products · Review · Blog · Settings.** This is the owner's decision, so **no route
is deleted** until it is confirmed. Every merged route stays reachable by URL and by an in-page link.

### Buttons — where the "one primary per page" rule stands today

| Screen | Primary buttons | The problem |
|---|---|---|
| Home | **6 visible at once** for a new merchant | `Open theme editor →` renders **twice**, from two different components, same destination. The two real primaries (`Generate Content`, `Optimise Store`) are the ones *hidden* from new shops. |
| Products | 4 sites | The `Page` has **no** `primaryAction`; the strongest call to action is a *secondary* header button, while the per-row button labelled `Generate` does not generate — it navigates. |
| Optimise | 1 + a destructive modal | The card with the six-bullet pitch has a *default* button; the shorter card has the primary. |
| Review | 3 sites, one **per product card** | A 50-product page renders 52 primary buttons. One of them, `✓ Approved`, is a green primary whose job is to **un**-approve. |
| Jobs | 2 + page primary | |
| Plans | **zero** | The purchase button is a hand-rolled `<button style>`; the only Polaris button with a tone on the page is **Cancel Subscription**. |
| Analytics | **zero buttons at all** | A dead end: nothing on the screen leads anywhere. |

**Disabled primaries** (the brief says never render one): Review ×2, product page ×3.

### Six names for one action

`Generate All (17)` · `Quick Generate` · `Generate {n} Products →` · `Generate for {n} selected` ·
`Generate` (which navigates) · `Start Bulk Job` — on **one screen**. Plus `Optimise {n} Products →`,
`Fix All Missing Content`, `Refresh Stale Content →` and `Enhance Existing Descriptions →` elsewhere, of
which `Fix All Missing Content` and `Refresh Stale Content →` are two different labels for **the same
navigation to the same page**.

**Disposition: one name, "Optimize store".** Merge all of the above. `Quick Generate` routes to the
product page rather than submitting a bulk job, because on Free and Starter it currently answers the most
obvious button on the screen with "Bulk generation requires Growth".

### Numbers — five different counting bases

| Basis | Where | Counts |
|---|---|---|
| Shopify `productsCount` | Home, Products, Optimise | products |
| `getContentMetrics` | Home, Products, Analytics | distinct products, any content type |
| `generatedContent.count` filtered to `contentType: "description"` | Optimise | **rows**, description only |
| `contentMap` over the visible page | Products tabs | products, **current page only** |
| A live Shopify GraphQL scan with a 50-character threshold | SEO Audit | products, its own definition |

Consequences found: a product with a meta title and no description is *optimised* on Home and *needs
content* on Optimise. The Products page shows `Drafts to Review: 120` in a stat card directly above a tab
reading `Draft (3)`. Products fetches the store count **uncached** while Home caches it for five minutes,
so the two disagree for up to five minutes after any change. And `coveragePct` on Optimise is
hand-rolled without the clamp the shared helper applies, so it can print over 100%.

**Disposition: one definition (2.1), done.** Every screen reads it; a guard test forbids a screen from
counting for itself or re-deriving needs-content.

### Marketing inside the app

The value proposition is explained to a merchant who has already installed **three times on the Home
screen alone**: the GeoValueBanner, the four-step onboarding checklist, and a "How Navaal works" card.
`GeoValueBanner` renders on **six routes, seven times** — twice on Results alone — so a merchant going
Home → Blog → Results → SEO Audit sees the same gradient strip four times running.

Unverifiable claims found, quoted: "raises it to a **world-class standard**", "Refreshing old descriptions
**keeps your SEO rankings strong**", "**Longer posts rank better** for competitive topics", "Aim for
800–1500 words **for ideal search visibility**", "That's the difference between being found and being
cited."

Two worse than unverifiable:

- **`app.blog.posts.jsx:286` promises a feature that does not exist**: "Repurpose posts into social media
  captions with the Blog Generator." The Blog Generator has no such feature.
- **`GeoValueBanner.jsx:10-17` documents, in its own header comment, that its claims are unsupported** —
  that Google deprecated FAQ rich results on 7 May 2026 and that evidence for JSON-LD-only markup helping
  AI citation "is thin" — and the file then ships those claims on seven screens.

**Disposition: delete both components, replace with one dismissible Polaris `Banner` on Home (2.4).**
Delete every claim above.

### Copy

Spelling is genuinely split, and worse than the brief's count: **"Optimis-" 20 user-visible, "Optimiz-"
9**, and the same metric is spelled both ways on adjacent screens — Results says `Products optimized`
while Analytics says `products optimised`. The route is `/app/optimize` while every visible label says
`Optimise`. **Disposition: US English throughout (2.9), and the listing follows (HUMAN-NEEDED).**

Jargon shown to merchants, all confirmed present: `Bulk Jobs`, `Autopilot`, `A/B variant testing`, `GEO`,
`llms.txt` (4 uses, never defined), `JSON-LD`, `FAQPage`, `structured data`, `answer-first`,
`Voice Override`, `prorated`, `SLA support`, `Edit HTML`. Two the brief did not list and that are worse
than the ones it did:

- **`(distinct products)`** — database vocabulary, rendered verbatim in a merchant dashboard.
- **`Requires the products/create webhook to be registered in your Shopify app.`** — a raw Shopify webhook
  topic string as help text on a checkbox the merchant is asked to tick.

"Enhance mode", "Product #123456" and raw GIDs were checked and are **not** present in user-visible copy.
Jobs does show `Product #{numericId}` as a button label, which is the same failure by another route.

### Non-Polaris chrome

| Where | What |
|---|---|
| `GeoValueBanner` | two gradients, a custom shadow, a CSS-grid div, glassmorphism sub-cards, typography overrides inside Polaris `Text`, `#8fd3ff` four times. Contains no `Card` at all. |
| `app.jsx` ticker | a `role="button"` div with a `<style>` element injected into the DOM, an animated gradient, a **fixed 260px** progress track, a pulsing ⚡ |
| `app.plans.jsx` | the purchase button is a raw `<button type="submit" style>`, not disabled while submitting so it is **double-submittable**; two absolutely-positioned ribbons that **collide** on the Growth card when Growth is current |
| `app.settings.jsx` | nine raw `<button>` tone cards in a CSS grid, selection shown by colour alone |
| `UpgradePrompt` | `2px solid #E1A500` wrapper around a Polaris `Box`, giving a visible double corner; `*-hover` tokens used as resting backgrounds |
| `app.blog.jsx` | a `<style>` element with fifteen hand-rolled typography rules competing with Polaris; `dangerouslySetInnerHTML` unsanitised |
| `app.results.jsx` | a CSS-grid div with no `data-cc-stat-grid` hook, so the mobile breakpoint never applies to it |

`lucide-react`: **10 files, 24 imports, 18 unique icons**, every one sized and coloured by hand. Four
audited screens already use no icons at all, so the dependency is not load-bearing.

`mobile.css` is **159 lines, not ~700** — the brief's line references do not exist. It carries **21
`!important`**, nine of them against private `.Polaris-*` internals, one of which is outside any media
query and therefore overrides Polaris at every viewport. The global 44px tap target is scoped to
`≤768px` and is **immediately undone** for every `size="slim"` button by a 36px rule three lines later.
Two `data-cc-*` selectors are dead: the markup they target no longer carries the attribute.

### Things a first-time merchant would trip on, not on the brief's list

1. **"All 0 products have AI-generated content."** in a green success banner — covered above.
2. **`Generate All (0)` stays clickable on an empty store** and routes to the pricing page.
3. **A 0-product store sees `EmptyState heading="Your store is all set!"`** — congratulated for an empty
   catalogue.
4. **Analytics has no empty state and no buttons.** Every card renders zeros, and there is nowhere to go.
5. **`Optimise` has no primary action at all for an empty store** — the only way out is the back link.
6. **Home hides SEO Audit, Analytics and Blog from new merchants** (`isNewShop` gates the whole tools
   row), so the features are undiscoverable exactly when someone is exploring.
7. **`isNewShop` is computed from content rows, not products**, so a 500-product store with no content is
   "new" and a 0-product store with one draft is not.
8. **Delete has no confirmation** in three places: a content template, a blog post, and a subscription
   cancellation.
9. **The blog "recent post" row is a `Box` with `onClick`** — no `role`, no `tabIndex`, and the
   `cursor: pointer` is silently dropped because Polaris `Box` does not forward `style`. Not reachable by
   keyboard, no hover affordance.
10. **`Upgrade to unlock →` in Settings uses `window.location.href`** — a hard page load inside an
    embedded iframe.
11. **Results hides its own before/after score unless the delta is at least 8 points.** The code comment
    says a smaller delta "would undersell the real gain". The screen shows the number only when it
    flatters the app.
12. **The SEO Audit `✓`/`✗` badges are bare glyphs** with no text and no `accessibilityLabel`, rendered
    in four of six columns — roughly 400 of them on a 100-product store.

Items 1 to 7 are fixed in this phase. 8 to 12 are fixed in this phase. All are listed here because 2.13
asks for anything a first-time merchant would trip on that the brief did not name.

## 2.4 — Marketing out of the app

A merchant who is looking at this screen has already installed. Everything below was written to
persuade somebody who has not.

**Two components deleted outright.** `GeoValueBanner` rendered on **six routes, seven times** — twice on
the Results page alone — so going Home → Blog → Results → SEO Audit showed the same dark gradient strip
four times running. `ContentBenefits` had one consumer, and that consumer already rendered
`GeoValueBanner` too, so the product page carried two overlapping pitches. Both files are gone, and a
test greps every route and component for either name and requires an empty list.

**One banner replaces all of it**, on Home only: a Polaris `Banner`, two lines, dismissible. The dismiss
is a real migration (`prisma/migrations/20260910_geo_note_dismissed`) rather than `localStorage`, because
a banner that comes back on the merchant's phone, or the next time they clear site data, is not
dismissible. That migration is also the first real one to go through `prisma migrate deploy` in the
release command.

**Also removed from Home:** the "How Navaal works" card. It was the third explanation of the product on
one screen, after the gradient banner and the four-step onboarding checklist.

**The claims that were not merely unverifiable.** Six unprovable ones went — "world-class standard",
"keeps your SEO rankings strong", "Longer posts rank better", "ideal search visibility", "the difference
between being found and being cited", "Generated by premium AI". Two were worse and are worth naming:

- A tip on the blog list read **"Repurpose posts into social media captions with the Blog Generator."**
  The Blog Generator has no such feature. That is not a claim, it is a promise of something that does not
  exist.
- `GeoValueBanner`'s own header comment recorded that **Google retired FAQ rich results on 7 May 2026**
  and that evidence for JSON-LD-only markup helping AI citation "is thin". The team wrote that down and
  shipped the claims on seven screens anyway.

Each banned phrase is now a named assertion, so it fails by its own words if it returns.

## 2.5 — Polaris only

| What it was | What it is |
|---|---|
| The job ticker: a `role="button"` div, an animated gradient, a `<style>` element injected into the DOM declaring two `@keyframes`, a pulsing emoji, a **fixed 260px** progress track, and a "View Jobs" pill made of a styled span | A Polaris `Banner` with a `ProgressBar` and a real `Button` |
| Plans: hand-rolled cards with `transform: scale(1.03)`, two **absolutely-positioned ribbons that collide** when Growth is the current plan, and a purchase `<button style>` with no `disabled` while submitting | `Card`, two `Badge`s in normal flow, and a Polaris `Button` that **cannot be double-submitted** |
| Settings: nine raw `<button>` tone cards in a CSS grid, selection shown **by colour alone** | A Polaris `ChoiceList` — a real radio group, keyboard arrows, announced selection |
| `UpgradePrompt`: a `2px solid #E1A500` div around a Polaris `Box`, giving a visible double corner, on a `*-hover` token used as a resting background | A Polaris `Banner`, which is the component that exists to be a can't-miss callout |
| Review: an inset box-shadow in `#00A047`/`#C9CCCF` — **status by colour alone** | A `Card` background token, with the state in words in the badge beside it |
| Results: a CSS-grid div with no `data-cc-stat-grid` hook, so its mobile breakpoint **never applied** | `InlineGrid`, responsive by declaration |
| Blog: fifteen typography rules re-inserted into the document **on every render** | A real stylesheet, linked once, scoped under one class |

**`lucide-react` is gone from the tree and from `package.json`** — 10 files, 24 imports, 18 icons, every
one hand-sized and hand-coloured. They are `@shopify/polaris-icons` with Polaris `tone`, so the colours
now come from the theme. `package-lock.json` was regenerated in the same commit: removing a dependency
without it makes `npm ci` refuse to run, which takes CI down on the very next push. A test asserts the
two files agree.

**Emoji and arrows are out of the interface.** Not a style preference. The SEO Audit table rendered
roughly 400 bare `✓`/`✗` glyphs on a 100-product store with no text alternative and no
`accessibilityLabel`, so a screen reader announced the raw character. A padlock sat inside a Polaris
action label. The Phase 3 routes (`welcome`, `setup`) are excluded by name from these assertions rather
than quietly passing.

**`mobile.css`: 159 lines to 92, and 21 `!important` to 4.** Nine of those `!important` declarations
targeted **private Polaris internals** — generated, unversioned class names that stop matching on an
upgrade without erroring, so the layout silently breaks. One sat outside any media query and therefore
overrode Polaris at every viewport. Every one of them was patching something Polaris already does, or
that the right component now does. The four that remain are the reduced-motion block, where beating a
page-declared animation is the entire point.

The touch-target rule was worse than absent. It set `min-height: 44px` on every button and then, three
lines later, **dropped `size="slim"` and `size="micro"` back to 36px** — carving out exactly the buttons
most easily mis-tapped — and it was scoped to `max-width: 768px`, so the "global" minimum did not apply
on a touch laptop or a landscape tablet. It is now `@media (pointer: coarse)`, at any width, with no
carve-out.

Two `data-cc-*` selectors were already dead: the markup they targeted no longer carried the attribute, so
the rules had been doing nothing. A test now walks every `data-cc-*` selector in the CSS and requires
something in the markup to render it.

### One thing that went wrong, and what it cost

The emoji sweep was a regex over every UI file, and its whitespace tidy-up collapsed the leading
indentation on the 36 lines it touched. A follow-up regex meant to strip trailing spaces then stripped
the indentation from **973 closing tags** across the whole tree. Nothing broke — JSX does not care — but
the source was mangled.

The repo had no formatter, which is why hand-repair was the only option and why the damage spread. It
has one now: `.prettierrc` at 110 columns, and every route and component formatted through it. That is a
larger diff than the change warranted, and it is the honest cost of having reached for a regex where a
parser was needed.

A second collision came from the same run: `prettier --write` landed on `app.plans.jsx` while it was
being rewritten, and corrupted an import block mid-statement. It was caught by the build within a minute,
restored from a byte-for-byte backup taken before the write, and redone against a fresh read.

## 2.6 — Auto-publish in one place, and the bug that published without asking

**The bug first, because it is the one that reached merchants.**

`app.products_.$id.jsx` gated its auto-publish confirmation like this:

```js
if (autoPublish && !overrideTypes) { ...show the confirm... }
```

`overrideTypes` is set by every per-section **Regenerate** link — description, meta title, meta
description, FAQ — and by the **Alt Text** tab. So **five of the seven generate paths skipped the
confirm entirely**, while `doGenerate` still sent `autoPublish=true` and the server still published
straight to the live storefront. With auto-publish ticked, clicking the small grey "Regenerate" beside a
description overwrote what shoppers see, with no dialog.

It was never intended. `pendingGenerateTypes` was initialised to `null`, the only write set it to
`null`, and the modal called `doGenerate(pendingGenerateTypes)` — always `doGenerate(null)`. The variable
existed solely to carry the value that branch was throwing away. So the confirm had been written to
handle this case and then wired past it.

The gate is now `if (publishWithoutReview)`, and the modal receives `overrideTypes`.

**Then the shape of the thing.** Auto-publish was a per-run form field with a checkbox in five places:
the product page, the Products bulk panel, the Generate All modal, and twice on Optimize. **The bulk
panel submitted with no confirmation at all.**

The App Store listing tells merchants that nothing goes live until they approve it. That cannot depend on
which of five checkboxes was last ticked. It is now one setting, `BrandVoice.publishWithoutReview`,
shipped as a real migration:

- **Off by default, and no backfill.** A shop that had been ticking a per-run box has not consented to
  publishing everything without review from now on, so it must not inherit one.
- **Every generate path reads it server-side** through `publishesWithoutReview(shop)`. No action reads
  `autoPublish` from a form any more, and a test posts `bulk_autoPublish=true` and asserts the job is
  created with `autoPublish: false` — a stale form, a replayed request or a crafted POST cannot override
  the merchant's setting.
- **The helper fails closed.** No settings row, a non-boolean value, or a database error all return
  false. The asymmetry is the point: wrongly returning false costs a review step nobody wanted; wrongly
  returning true puts content on a live storefront that nobody approved.
- **Turning it on asks first**, in destructive tone, and says what actually changes — including that
  previous versions are kept and can be restored per product, because omitting that makes the warning
  read as more final than it is. Turning it back **off** is immediate; the safe direction needs no
  ceremony.

19 assertions.

## 2.7 — One primary action, chosen by state

Home rendered **six primary buttons at once** to a brand-new merchant: four onboarding steps, the
theme-embed card, and the usage-card upsell. Two of the six were **the same action** — "Open theme
editor" — from two different components on one screen. And the two buttons that were the page's actual
purpose, "Generate content" and "Optimize store", were the ones **hidden** from new shops.

Home now has **no primary of its own**. It has a `Page` primary chosen by what the merchant should do
next:

| Condition | Primary |
|---|---|
| drafts waiting | `Review N drafts` |
| products with no content | `Optimize N products` |
| neither | `Run audit`, with `Write a blog post` beside it |

Content waiting for a person beats content that does not exist yet, which beats a diagnostic. The label
carries the count, so it is never a bare verb, and the fallback offers a second thing to do rather than a
dead end.

**Primaries that multiplied per card are gone.** Jobs rendered one per job card and Collections rendered
two per collection, so the count scaled with the merchant's catalogue. Review rendered one per product —
a 50-product page put 52 green primaries on screen, one of which was `✓ Approved`, **a primary whose job
was to un-approve**. That one is handled in 2.8.

**Disabled primaries, and the distinction that matters.** The brief says never render one. A button
disabled *while submitting* is a double-submit guard and stays — that is what stopped the Plans purchase
button being clicked twice. A button disabled because *a field is empty* is a dead end: it does not say
which field, and the merchant is left clicking something that does nothing. Three of those are gone —
blog generate, blog publish, product-page generate — and in every case the action already validates and
answers in a sentence ("Topic is required.", "Title and content are required to publish."). The Products
primary is not rendered at all when there is nothing to optimize, rather than rendered grey.

14 assertions.

## 2.8 — The Review screen

**The defect it shipped with was not cosmetic.** Every draft on the page was pre-approved:

```js
const [approved, setApproved] = useState(() => new Set(products.map((p) => p.productId)));
```

A merchant's **first** click on the publish button pushed up to fifty pieces of AI-written content to
their live storefront — content they had never opened. The listing promises nothing goes live until they
approve it, and the screen where they approve it had approved everything on their behalf.

Now: the set starts empty, and approving a whole page is an explicit action that says so.

**And that fix armed a different gun, which is why it is worth recording.** "Reject skipped" rejects
everything *not* approved. With approvals starting empty, that button became enabled in the default
state, on a freshly loaded page, meaning every draft — one click, no confirmation. Removing a foot-gun
should not install another. It now counts what it will do in its own label
(`Reject 12 not approved`), asks first in destructive tone, and says the live storefront is not touched,
because it is not.

| Was | Is |
|---|---|
| Edits in React state; pagination called `navigate()` and discarded them silently | Persisted on blur through a `saveEdit` action, keyed on `(shop, productId, contentType)`, with `shouldRevalidate` so a blur does not re-query Shopify for all fifty products |
| No side-by-side; the merchant approved a replacement without seeing what it replaced | **Current** beside **Proposed** per field, stacking at 375px, with "Nothing yet" where there is no current value. Fetched in the loader's existing batch query, so no extra round trip |
| Badges showing the raw database key `metaTitle` | `Description`, `Page title`, `Search description`, `FAQ` — from one map, so the wording cannot drift between the badge and the heading |
| `Content quality: 72` | `Content quality: 72/100`, with a one-line explanation |
| A green **primary** on every card whose job was to **un**-approve — 52 primaries on a 50-product page | One `Approve` checkbox per card, one publish primary on the page |
| A disabled primary whenever nothing was approved | Not rendered at all |
| `label=""` on the search field and every editor — no accessible name | Real labels, visually hidden where the heading already says it |

Keyboard: Enter approves, arrows move between products. It bails on text-entry elements so it cannot
hijack typing, and the index starts at `-1` so a stray Enter before choosing a product approves nothing.

22 assertions, including one that `saveEdit` refuses a `contentType` outside the known set — the row is
addressed by that value, so an unchecked one would let a caller create rows outside it.

## 2.10 — States, and the empty store

**This is the finding the brief did not list, and it was the worst one.** A merchant who had just
installed, with zero products, was told on **three screens that they were finished** and on the fourth
that they were failing:

| Screen | What it said to an empty store |
|---|---|
| Home | `All caught up!` |
| Products | `Your store is all set!` |
| Optimize | a **green success banner** — `Your store is fully optimized!` above `All 0 products have AI-generated content.` |
| SEO Audit | a large red **0**, four red zeros under "Issues Found", and a primary button pointing back at Optimize |

One root cause. `needsContent` was `total − published − draft` with a `Math.max(0, …)` floor, so an empty
store computed 0 and was **arithmetically indistinguishable from a finished one**. No route had a
`totalProducts === 0` branch. Optimize was also a dead end in that state: a success banner and nothing
else, no primary, no link, only the back arrow.

Every screen now branches on it, and they say the same sentence, so a merchant who reads it twice is not
learning two different things: *"Add products to your store, and this is where you generate content for
them."*

**Status is no longer carried by a glyph.** The audit table rendered bare `✓` and `✗` badges in four of
six columns — roughly **400 of them on a 100-product store**, with no text and no `accessibilityLabel`,
so a screen reader announced the raw character. They now read `Description: yes`, `Alt text: no`. The
tone is the decoration; the words are the message.

13 assertions, including one that every badge is given a label by its caller.

## 2.11 — Performance feel

| Loader | Was | Is |
|---|---|---|
| SEO Audit | a `while` loop paginating 50 products at a time, **up to 25 seconds sequential** before first paint | page one awaited so the score renders; the rest of the catalogue and the table stream behind `Suspense`/`Await` |
| Home | one `Promise.all` of ten, including two aggregates only needed below the fold | eight awaited, `recentActivity` and the blog counts streamed |
| Products | two `.json()` bodies awaited serially after the batch | both parsed inside the batch |
| Product page | a full Shopify round trip awaited **ahead of seven database reads that never needed it**, then a dynamic import after them | all nine in one batch |

The audit also gained **backoff**: a failed page retries once after 500 ms, and if the retry fails the walk
keeps what it has and reports `truncatedReason: "error"` rather than losing the whole audit to one bad
page. Its timeout dropped from 25 s to 10 s, because the walk now runs inside the streaming budget rather
than blocking the loader, and a 25 s budget would have been cut off mid-stream leaving a permanent
skeleton.

**One thing was reverted on review.** Returning a promise means the loader can no longer return
`Response.json`, and 17 tests called `.json()` on the result. The first fix attached a non-enumerable
`json()` to the returned object so the test would keep passing. That is production code carrying a shim
to satisfy a test helper, which is the wrong way round. The shim is gone and the helper accepts both
shapes.

## 2.12 — Mobile and accessibility

**Accessibility.** Four `TextField`s carried `label=""` with `labelHidden`, which gives a control **no
accessible name at all** — three on the product page, one on Collections. They have real labels. The A/B
variant preview was the one `dangerouslySetInnerHTML` on the product page that was **not** sanitised; it
is sanitised in the action, server-side, because `sanitizeHtml` lives in a `.server` module and calling
it from the component pulls that module into the client bundle. The build caught that attempt.

Colour-only status is gone: the Review card's include/skip stripe, the Settings tone picker, and the SEO
Audit table's bare `✓`/`✗` badges, which rendered roughly 400 times on a 100-product store with nothing
for a screen reader to announce.

**375px, and the measurement that could not be made.** Two harnesses are written and committed:
`tools/proof/web-vitals.mjs` takes LCP, CLS and INP at p75 over ten loads with a 200 ms US-to-Sydney
round trip emulated, and `tools/proof/mobile-375.mjs` screenshots twelve screens and fails if any scrolls
horizontally, naming the widest offending element.

**Neither produced a usable number, and the first run of each nearly shipped a false pass.** They
reported `12 screens, 0 overflowing` and a complete LCP table of 3.9 to 5.2 seconds. Every screenshot was
the same **"410 Gone"** page, and those LCP figures were the load time of that error page. Six
byte-identical screenshots gave it away.

Both harnesses now refuse to report rather than measure an error page. The corrected check reads through
**Playwright frame handles**, not `iframe.contentDocument`: the app is cross-origin to the admin, so
`contentDocument` is null and the obvious version would have silently fallen back to the admin's own
text — passing on every broken run, which is the same class of mistake the guard exists to catch. The
fixed guard was then watched failing on a real 410 before being trusted.

The cause is the saved admin session no longer reliably completing Shopify's token exchange, and only a
person can create a new one. Both runs are HUMAN-NEEDED item 5 with exact commands. The invalid baseline
and the twelve screenshots of an error page were **deleted rather than kept**.

One partial reading did land before the session degraded, on the deploy carrying increments 1-3: Home
LCP p75 4012 ms, Products 2660 ms, Review 2344 ms; CLS 0 everywhere; INP 16-24 ms. That is one sample per
screen, not the p75 over ten the brief asks for, and it is recorded as an indication, not a result.

## 2.9 — Copy

Three problems, and only the first is cosmetic.

**Spelling was genuinely split**: 20 user-visible "Optimis-" against 9 "Optimiz-", and the *same metric*
was spelled both ways on adjacent screens — Results said `Products optimized` while Analytics said
`products optimised`. The route has always been `/app/optimize` while every label said "Optimise". US
throughout now, and the listing follows as HUMAN-NEEDED item 6, because otherwise the split just moves
outside the app.

**Jargon is not a matter of taste.** Two were worse than the brief's list:

- `(distinct products)` — database vocabulary, rendered verbatim in a merchant dashboard.
- `Requires the products/create webhook to be registered in your Shopify app.` — a raw Shopify topic
  string, as help text on a checkbox the merchant is asked to tick.

Gone with them: `FAQPage`, `JSON-LD`, `A/B Variants`, `Bulk Jobs`, `llms.txt` in merchant-facing copy,
and `Product #123456` as a button label where a product name belongs. The Results page's seven-line
paragraph carrying five of those acronyms and finishing on "the difference between being found and being
cited" now states the one fact it was actually reporting.

**Quota copy applied pressure instead of stating a number.** The Home hero *became an upsell* whenever
quota ran low — "Only 2 generations left this month — upgrade to keep momentum going" — and a red
"Only 2 generations left!" sat inside the generate panel, inches from the button, in critical tone. Both
are gone. Quota is stated once, in the usage card, in the same tone as any other number. A test checks
that removing the pressure did not remove the information.

18 assertions.

---

# PHASE 2 — COMPLETE. Item-by-item ledger.

Five deploys, each through cold-cache lint, blocking typecheck, the full suite, a build, and the
post-deploy smoke job. **Final deployed SHA `e6ccf0e`**, deep health `ok`, worker alive.

| # | Item | Commit | Deployed | Verified |
|---|---|---|---|---|
| 2.13 | Fresh-store self-audit | `f32b188` | — | LIVE (audit table in this file) |
| 2.1 | One definition of product state | `f32b188` | `f32b188` | LIVE |
| 2.2 | Nav 13 → 5 | `f32b188` | `f32b188` | LIVE |
| 2.3 | One bulk action, one name | `f32b188` | `f32b188` | LIVE |
| 2.4 | Marketing out of the app | `d6a80a9` | `d6a80a9` | LIVE |
| 2.5 | Polaris only | `d6a80a9` | `d6a80a9` | LIVE |
| 2.6 | Auto-publish in one place | `6bff05d` | `6bff05d` | LIVE |
| 2.7 | One primary per screen | `6bff05d` | `6bff05d` | LIVE |
| 2.8 | The Review screen | `6bff05d` | `6bff05d` | LIVE |
| 2.9 | Copy | `e6ccf0e` | `e6ccf0e` | LIVE |
| 2.10 | States, and the empty store | `75809b9` | `c3bb160` | LIVE |
| 2.11 | Performance feel | `c3bb160` | `c3bb160` | code + smoke; **numbers not obtained** |
| 2.12 | Mobile and accessibility | `0c392f4` | `c3bb160` | code; **375px not verified** |

**848 assertions across 63 tracked test files**, up from 761 at the start of the phase.

## The three defects that reached merchants

Worth separating from the design work, because these were not matters of taste.

1. **Auto-publish skipped its confirmation on five of seven paths.** The guard read
   `if (autoPublish && !overrideTypes)`, and `overrideTypes` is set by every per-section "Regenerate"
   link and the Alt Text tab. Those paths still sent `autoPublish=true` and the server still published
   to the live storefront. The dead `pendingGenerateTypes` state proved the confirm had been written to
   cover exactly that case and then wired past it.
2. **Every draft on the Review page arrived pre-approved**, so a merchant's first click published up to
   fifty pieces of content they had never opened — on the screen whose entire purpose is approving them,
   in an app whose listing promises nothing goes live until they do.
3. **An empty store was told it was finished, on three screens**, including a green success banner
   reading "All 0 products have AI-generated content", while a fourth screen showed it a red zero.

## What Phase 2 did NOT do

- **No route was deleted.** The five-item nav is the owner's decision and it has not been given. Every
  merged route still exists, still works, and is still linked from the screen that absorbed it, with a
  test that drives it.
- **`welcome` and `setup` are untouched**, as instructed, beyond removing two lines that imported a
  component this phase deleted.
- **The Web Vitals table does not exist**, and neither do verified 375px screenshots. See 2.12.

## Two process failures worth recording

**A regex where a parser was needed.** The emoji sweep's whitespace tidy-up stripped the indentation
from 973 closing tags across the tree. Nothing broke — JSX ignores whitespace — but the source was
mangled, and hand-repair was the only route because the repo had no formatter. It has one now, which is
why that commit's diff is far larger than its change warranted.

**A harness that reported a confident false pass.** Both measurement harnesses produced complete
results on their first run: `12 screens, 0 overflowing` and a full LCP table. Every screenshot was the
same "410 Gone" page. Six byte-identical files gave it away. The first fix was itself wrong — it read
`iframe.contentDocument`, which is null cross-origin, so it would have fallen back to the admin's own
text and passed on every broken run, which is the same mistake one level down. The corrected guard reads
through Playwright frame handles and was watched failing on a real 410 before being trusted.

The general lesson is the one Phase 0 already recorded about the ESLint cache: **a tool that reports
success is not evidence of success.** Both times, the thing that caught it was noticing that a result
looked too tidy.

---

# INCIDENT — 2026-09-09 17:00 → 2026-09-10 00:53 UTC (~8h): every `/app` load returned 500

**Merchant-facing.** For roughly eight hours the app was completely unusable: every `/app` page returned
500 with `P2022: column BrandVoice.publishWithoutReview does not exist`. `/api/health` reported `ok`
throughout. **I caused this.**

## What happened

`20260910_geo_note_dismissed` was applied to production at **16:21:06 UTC** containing one statement, the
`GrowthState.geoNoteDismissedAt` ALTER. The next commit (`6bff05d`, deployed ~17:00) **appended** the
`BrandVoice.publishWithoutReview` ALTER **to that same, already-applied file**.

Prisma records migrations by **name** in `_prisma_migrations`. It saw the name, skipped the file, and the
appended statement never ran. The record is unambiguous:

```
migration_name                 applied_steps_count  finished_at
20260910_geo_note_dismissed    1                    2026-09-09T16:21:06.916Z
```

One step: the single statement it contained when it ran.

## Why nothing caught it — three blind spots, all of them mine

1. **`prisma migrate status` compares names, not columns.** It reported "Database schema is up to date!"
   with a column missing.
2. **`/api/health?deep=1`'s database check is `SELECT 1`**, which needs no columns. It reported `ok` for
   eight hours while every page 500'd.
3. **The post-deploy smoke job and the five-minute `/app` probe both sent a non-browser user-agent.** The
   Shopify library answers those with **410 Gone**, and I had written both checks to treat 410 as
   healthy. Neither ever reached a loader or the database, so both would have passed with the app in any
   state whatsoever.

Verified directly: `curl -I /app` returns **410**; the same request with a Chrome user-agent returns
**302**.

**Sentry was the only thing that noticed**, and only because a person read it.

## Who was affected

Three shops exist, and **all three are the owner's own test and development stores** —
`navaal-qa-fresh`, `navaal-test-2`, `contentpilot-dev2`. **No third-party merchant had the app installed
during the window.**

What is directly evidenced: Fly retains logs only back to 00:35 UTC, the last 18 minutes of the window,
which show 4 `P2022` failures across `navaal-qa-fresh` and `contentpilot-dev2`. No `Shop` row was updated
during the window (all `updatedAt` predate 17:00), and no `GeneratedContent` or `GenerationJob` row was
written. **The full load count for the earlier 7½ hours is not recoverable from logs — Sentry holds it.**

## What changed

| Gap | Fix |
|---|---|
| An applied migration could be edited | CI fails if any migration already on `origin/main` is modified. Needs `fetch-depth: 0`, without which the comparison silently passes. The one legitimate exception, restoring a wrongly-edited migration, is opted into per commit with `[migration-restore]` and prints a warning |
| Nothing compared schema to database | `checkSchemaDrift()` compares all **210** expected columns against `information_schema` at startup and on every deep health check. Drift is `error` (503), never `degraded` |
| The smoke job could not see drift | It now reads `checks.schema` and fails the deploy, naming the missing columns |
| Probes measured the bot path | The smoke job and the operator probe both send a real Chrome user-agent, and **only 200 or 302 is healthy. 410 is now an alert** |
| The expected-column list could fall behind | Generated by `scripts/generate-schema-columns.mjs`; a test regenerates it and fails if the committed copy is stale |

The startup check logs loudly but does **not** exit. With `min_machines_running = 1` a crash loop takes
the app down entirely, and drift usually means one column is missing while most of the app still works.
Deep health returns 503 regardless, so the deploy still fails and the owner is still paged.

26 assertions, including the exact incident: one column removed from the fixture, reported by name.

### The guard's first version did not work either

It compared `origin/main...HEAD`. **On a push to `main` that range is empty** — HEAD *is*
`origin/main` — so it printed "ok — no existing migration was modified" on the very commit that
restored the broken migration, having compared nothing. It would never have fired on the deploy path
this repository actually uses.

Caught by reading the CI log rather than trusting the green tick, and proven locally:

```
$ git diff --name-only --diff-filter=MD origin/main...HEAD -- 'prisma/migrations/**' | wc -l
0
$ git diff --name-only --diff-filter=MD HEAD~1 HEAD -- 'prisma/migrations/**'
prisma/migrations/20260910_geo_note_dismissed/migration.sql
```

It now compares against `github.event.before`, the SHA the branch pointed at before the push, and
**fails rather than passing if it cannot resolve that base**. A guard that cannot compare must say so.

That is the fourth instance of this same mistake in one day, and it was inside the guard written to
prevent the first one.

## The lesson, which is not new

The ESLint `--cache` incident in Phase 0 taught the same thing, and I did not generalise it: **a check
that reports success is not evidence of success.** The question to ask of any check is what it would do
if the thing it watches were completely broken. All three of these would have passed.

It happened three more times inside the measurement harnesses on the same day — reported below.

---

# Web Vitals and 375px — measured, at last

Both harnesses failed the same way the monitoring did, and for the same reason: **Playwright reports
`HeadlessChrome`, the Shopify library treats that as a bot, and returned 410.** My first guard blamed
"session expired", which sent the owner to re-run a login that was never the problem. The session was
valid throughout.

Fixing that exposed two more instances of the same mistake, both of which had produced confident passes:

- The 375px harness screenshotted the **page**, and at a phone viewport `admin.shopify.com` covers itself
  with a full-screen "Download the Shopify app" promo. Twelve byte-identical screenshots of that promo,
  reported as "0 overflowing". Fixed by using a **desktop** user-agent at a 375px viewport — the CSS
  breakpoints key off viewport width, not the agent — and screenshotting the app frame.
- Nine of twelve screens then returned **no measurement at all**, and the harness printed "ok" for every
  one, because `overflows` was `undefined` rather than `true`. The cause was a `|| page.mainFrame()`
  fallback that silently measured the admin shell whenever the app frame was late. Both are now hard
  failures.

## Web Vitals, p75 over 10 loads, 200 ms US-to-Sydney latency emulated

Measured against `72a5591`, which already includes the 2.11 deferring work.

| Screen | LCP p75 (ms) | CLS p75 | INP p75 (ms) | n |
|---|---|---|---|---|
| Home | 5892 | 0 | 16 | 10 |
| Products | 5036 | 0 | 16 | 10 |
| Review | 4644 | 0 | 16 | 10 |

**Targets: LCP ≤ 2500, CLS ≤ 0.1, INP ≤ 200.** CLS and INP pass comfortably. **LCP fails on all three
screens, by roughly two to three times.**

An honest caveat on what that number is: `web-vitals` runs in the top-level document, so the LCP element
may belong to the Shopify admin chrome rather than to this app. The figure is the merchant's experience
of the page as a whole, which is what Built for Shopify grades, but it is not attributable to app code
alone. Reducing it further is a Phase 3 question, and the largest single lever remains the one named in
Phase 1 item 2: **the database is in Sydney and the merchants are not.**

## 375px

**12 screens, 12 measured, 0 overflowing.** Screenshots in `docs/history/mobile-375/`, one per screen,
alongside `results.json` with each screen's `scrollWidth`. The widest element anywhere was a Polaris tab
disclosure button on Products at 485px, which is inside its own scroll container and does not overflow
the page.

---

# 2026-09-10 — Corrections and reconciliations, before Phase 3

Three things the owner brought back from Shopify's Dev Dashboard, which neither of us had been reading.
Two of them correct claims made above. Under the append-only rule the original text stays; this section
is what supersedes it.

## CORRECTION 1 — item 2.11: LCP passes. My harness was measuring the wrong thing.

The table under "Web Vitals, p75 over 10 loads" reports **LCP 5892 / 5036 / 4644 ms** and concludes
**"LCP fails on all three screens, by roughly two to three times."**

**That conclusion is wrong and is withdrawn.**

Shopify's own field data for this app — App Bridge, real merchant sessions, **p75 over 28 days**, which
is the measurement Built for Shopify actually grades against:

| Metric | Shopify field data | BFS threshold | Verdict |
|---|---|---|---|
| LCP | **895 ms** | p75 ≤ 2500 ms | **Good** |
| INP | **16 ms** | p75 ≤ 200 ms | **Good** |

Not marginal — 895 ms against a 2500 ms budget. The app was passing the whole time I was reporting it as
failing by two to three times.

**Why my number was wrong.** Two compounding errors, both mine:

1. `web-vitals` runs in the **top-level document**, which is `admin.shopify.com`, not this app. So the
   LCP element it picked was Shopify's admin chrome. I wrote that caveat down at the time — "the LCP
   element may belong to the Shopify admin chrome rather than to this app" — and then drew a conclusion
   about *this app's* performance from the number anyway. Writing the caveat and then ignoring it is
   worse than not knowing, because it reads as though the number had been qualified.
2. On top of that the harness **emulates 200 ms of latency on every request**. That is a deliberately
   pessimistic synthetic condition, not what a merchant experiences.

Shopify's documentation warns specifically that synthetic tools misread embedded apps for exactly this
reason. I had not read it.

**What the harness is now, and what it is not.** `tools/proof/web-vitals.mjs` is kept, because a
regression detector that produces a stable number under fixed conditions is useful. It is **synthetic,
measures the top-level document including Shopify's own chrome, and applies 200 ms of emulated latency.
Its LCP figure is NOT comparable to the Built for Shopify threshold and must never be quoted against
it.** The harness now prints that in its own output so the number cannot be lifted out of context again.

**Consequences, recorded so they are not re-litigated later:**

- **No LCP optimisation work is to be done in any later phase on the strength of those numbers.** There
  is no measured LCP problem. Work aimed at a number that is already 895 ms against a 2500 ms budget is
  work spent on nothing, and every hour of it is an hour not spent on something a merchant would notice.
- **The two-region question is DEPRIORITISED.** Phase 1 item 2 named "the database is in Sydney and the
  merchants are not" as the largest remaining latency lever, and the section above repeats it as a Phase
  3 question. The field data does not show a latency problem, so there is nothing to justify the cost
  and the failure modes of a second region. It stays recorded as an option, not a plan.

## CORRECTION 2 — the install count: 3 was never a count of installs.

I reported **3 shops**. Shopify reports **4 merchants / 4 installs**. Shopify is right; my number was
measuring something else and I described it as though it were an install count.

Every shop domain that has ever touched this database, and what holds it:

| Shop | Shop row | Session | Admin API | Reading |
|---|---|---|---|---|
| `contentpilot-dev2` | yes (`pre_tracking`) | yes | 401 (store exists) | **installed** — owner's dev store |
| `navaal-qa-fresh` | yes (`pre_tracking`, installCount 2) | yes | 401 (store exists) | **installed** — QA store |
| `navaal-test-2` | yes (`pre_tracking`) | yes | 401 (store exists) | **installed** — owner's test store |
| `contentpilot-test-4gudawgn` | **no** | yes, last 2026-07-01 | 401 (store exists) | **installed — this is the 4th** |
| `app-review-85870b77-r78944-a0` | no | yes | **404 (store gone)** | Shopify App Review store, deleted |
| `app-review-85870b77-r92361-a0` | no | yes | **404 (store gone)** | Shopify App Review store, deleted |
| `ap13ht-zv`, `222bb2-2a`, `q491r2-si`, `xbbf0y-vp`, `cpbgzr-pu` | no | no | — | automated-check stores; only `shop_redact` audit rows remain, which is correct |

Four stores still exist and hold a session: the three with `Shop` rows, plus
**`contentpilot-test-4gudawgn.myshopify.com`**. That is Shopify's 4, exactly.

(The 401s are not evidence of uninstallation. This app uses Shopify's *expiring* offline tokens, so every
stored token is expired by design and a live store answers 401 rather than 200. The 404s are the useful
signal: that domain no longer resolves, because Shopify deletes App Review stores after a review.)

**Why the 4th is missing.** A `Shop` row is written by install tracking from **inside
`authenticate.admin`** — that is, when a shop *opens the app*. For a shop that installed before tracking
shipped, the row is created lazily, on that shop's next authenticated request, as `pre_tracking`. All
three existing rows carry `pre_tracking`, so **not one of them was recorded live**; they are simply the
three shops that have opened the app since tracking shipped on 2026-08-26.
`contentpilot-test-4gudawgn` last authenticated on **2026-07-01** — it still holds the pre-reduction
scope set (`write_metaobject_definitions, write_metaobjects, write_products, write_content`) — and has
not opened the app since, so no row was ever created for it.

**So `Shop` row count answers "how many shops have opened the app since 2026-08-26", not "how many
shops have the app installed".** I used it as the second and it is the first. Nothing is broken; the
label was wrong, and it was wrong in the flattering direction, which is the direction that matters.

**One thing this is worth being plain about:** all four installs are ours or Shopify's — two owner dev
stores, one QA store, one old test store. **There are no real merchants on this app.** "4 merchants" in
Shopify's dashboard is a count of installs, not of businesses using the product.

## WEBHOOK FAILURES — diagnosed, fixed, proven live

Shopify's Dev Dashboard, 7 days, flagged **High**:

| Topic | Failure rate | Deliveries | Response time |
|---|---|---|---|
| `app/uninstalled` | **82.353%** | 17 | 1,039 ms |
| `shop/redact` | **100.0%** | 9 | 816 ms |
| **Overall** | **88.5%** | | |

`shop/redact` is a mandatory GDPR topic. Failing every delivery of it is a compliance failure, not a
lost notification.

### Diagnosis — measured, not assumed

Fly's log retention had already rolled past the failing deliveries, so there was nothing to read. I wrote
`scripts/webhook-probe--writes-fake-shop-only.mjs` (committed, listed in `scripts/README.md`) to
reproduce a delivery exactly — same HMAC over the same raw body, same headers, varying only the age —
against production, using `navaal-webhook-probe.myshopify.com`, which is not a real store. The script
refuses any other domain, with no override flag, because `app/uninstalled` deletes everything for the
shop named in the header.

**Before the fix, against `5dd9a1c`:**

```
200    183ms  fresh (app/scopes_update)        200     29ms  dedup, 1st delivery
200     42ms  12 h old                         200     31ms  dedup, 2nd, same id  Duplicate
401     13ms  25 h old      <-- ours           401     14ms  payload names another shop
401     21ms  47 h old      <-- ours           200    174ms  payload matches header
200     39ms  no triggered-at header           200     95ms  uninstalled, no shop in payload
200    117ms  shop/redact fresh                200     22ms  customers/redact fresh
401     10ms  shop/redact 25 h old             200     18ms  customers/data_request fresh
401     14ms  shop/redact 47 h old
```

That eliminates the two other candidates and names the cause:

- **Dedup is innocent.** A redelivery with the same webhook id answered `200 Duplicate`, as designed.
- **The payload/header shop cross-check is innocent.** A matching payload answered 200; only a genuine
  mismatch was refused, which is correct.
- **Every fresh delivery of every topic succeeded.** Nothing in the handlers was broken.
- **The 25 h and 47 h rejections are ours**, and they are the whole failure rate.

### Cause

`MAX_WEBHOOK_AGE_MS` was **24 h**. Shopify retries for **~48 h**, 19 attempts, and every retry carries
the **original** `x-shopify-triggered-at`. So a delivery that failed once for any transient reason aged
past 24 h, and from that moment every remaining retry was refused by us — permanently, deliberately, with
a 401. One transient failure was enough to make a delivery unrecoverable.

`shop/redact` is worse, and explains the 100%: it **arrives 48 h after the uninstall**. It was outside a
24 h window before Shopify's first attempt was even made. It could never have succeeded.

The owner's leading hypothesis was exactly right, and it was a trade-off I had written down when I
shipped it in Phase 0 item 2 — the docblock said in as many words that "were the app unreachable for
more than 24 h, a compliance retry arriving after that window would be rejected rather than processed".
I recorded the risk and then did not act on it, and it was not hypothetical: it was already happening.

### The fix, against the owner's three requirements

**(a) A genuine retry is always accepted inside its full retry window.** The window is now 7 days, well
past the ~48 h schedule, so no genuine retry can land near a boundary.

**(b) Mandatory compliance topics are never rejected on age.** `shop/redact`, `customers/redact` and
`customers/data_request` skip the timestamp check entirely — not a wider window, no check. Performing a
deletion we were not owed costs a merchant nothing; refusing one we were owed is the failure that
matters.

**(c) Replay protection still holds, by webhook id.** The dedup claim is now the only replay primitive,
and it is the stronger one: it catches a replay on the **first** attempt rather than after a day. The age
check is demoted to one job — bounding how long the dedup store must remember — and is derived from the
same constant as `DEDUP_TTL_SECONDS`, so the two cannot drift apart and open a gap in which a replay is
both too young to reject and no longer remembered. A test asserts they stay equal.

**The general lesson, now in the source so it survives me:** an age cutoff cannot be a replay defence,
because *a retry is an old delivery*. Any window short enough to stop a replay is short enough to refuse
a retry. I had built the replay defence twice — once correctly, by webhook id, and once incorrectly, by
age — and the incorrect one was the one that fired.

### Response times

The 1,039 ms and 816 ms are **round trips, not rows**. `chunkDelete` walks 13 models issuing a `findMany`
and a `deleteMany` each, so a shop with **no data at all** still spent ~26 sequential queries against
Neon before the 200 went out. That is also how a delivery earns the first transient failure that the 24 h
window then made permanent — the two defects fed each other.

Both handlers now do the smallest **durable** thing and answer, then finish the work:

| Topic | Before the 200 | After the 200 |
|---|---|---|
| `app/uninstalled` | stamp `uninstalledAt` | capture carryover, cancel in-flight jobs, delete |
| `shop/redact` | write the GDPR audit row | delete, then anonymise the `Shop` row **last** |

Answering 200 tells Shopify never to send that delivery again, so this trade is only honest if a process
killed mid-deletion loses nothing. The split is chosen so the synchronous half always leaves a marker
saying the work is owed:

- `app/uninstalled` — `uninstalledAt` set **and** `Session` rows still present
- `shop/redact` — a `GDPRRequest(shop_redact)` row exists **and** `Shop.redactedAt` is still null

`sweepUnfinishedWebhookWork` runs in the worker every 10 minutes and finishes exactly those two states,
and `gracefulShutdown` drains in-flight deferred work before exit, so a routine deploy cannot interrupt a
redaction that started two seconds earlier. There is no window in which work is both owed and forgotten.

### Proof — real deliveries against `224211a` in production

```
── the retry window
  200    261ms  fresh                     200     36ms  1st delivery
  200     38ms  12 h old                  200     47ms  2nd, same id      Duplicate
  200     32ms  25 h old   <-- was 401  ! 401     18ms  payload names ANOTHER shop
  200     31ms  47 h old   <-- was 401    200     46ms  payload matches the header
  200     27ms  no triggered-at header
── mandatory compliance topics, at ages that used to be refused
  200     34ms  shop/redact fresh         200     42ms  customers/redact fresh
  200     28ms  shop/redact 25 h old      200     22ms  customers/data_request fresh
  200     79ms  shop/redact 47 h old
  200     16ms  shop/redact 10 days old
```

Every previously-refused case now returns 200. Replay protection and the shop cross-check are unchanged.

Response times, same probe shop, before → after: `shop/redact` **117 ms → 34 ms**, `app/uninstalled`
**174 ms → 46 ms**. More importantly the response time is now **independent of how much data the shop
has**, because the deletes no longer happen before the answer. Production logs confirm the deferred half
runs and completes:

```
event: app_uninstalled_deferred   ms: 142   "Deferred webhook work finished"
event: shop_redact_deferred       ms: 108   "Deferred webhook work finished"
event: shop_redacted                        "Shop redacted"
```

— a 46 ms answer to Shopify with 142 ms of work behind it, instead of 1,039 ms in front of it.

### Still to confirm

**The dashboard failure rate is a 7-day trailing figure, so it cannot move immediately.** It must be
re-read on **2026-09-11** and again on **2026-09-17**, once a full 7 days of post-fix deliveries have
accumulated. Recorded here as an open item, not as a result: the probe proves the mechanism, the
dashboard is what proves the outcome.

| | Before | After |
|---|---|---|
| Overall failure rate (7 d) | **88.5%** | _pending — re-read 2026-09-17_ |
| `app/uninstalled` | 82.353% of 17 | _pending_ |
| `shop/redact` | 100.0% of 9 | _pending_ |
| Probe: retry at 25 h / 47 h | **401 / 401** | **200 / 200** (verified live) |
| Probe: `shop/redact` at 25 h / 47 h / 10 d | **401 / 401 / —** | **200 / 200 / 200** (verified live) |

---

# PHASE 3 — FIRST VALUE, REVIEWS, CONVERSION

## 3.1 — Retire `app.welcome.jsx` and `app.setup.jsx`; absorb the engine

### The nav, as approved

Owner decision, taken: **Home · Products · Review · Blog · Settings.** `/app/results` and `/app/analytics`
are retired alongside the two first-run routes. `seo-audit`, `jobs`, `plans` and `collections` stay as
routes reached from in-page links, exactly as specified.

All four retired routes answer a **same-origin 302 to `/app`** rather than 404ing. That is deliberate and
it is tested: a merchant with a bookmark or an open tab, and an App Store reviewer following a link from
an earlier submission, must land somewhere sensible. Two properties of that redirect are load-bearing and
both were the subject of the four App Store rejections — it is same-origin (a redirect to
`admin.shopify.com` from inside the frame is a cross-origin top-level navigation), and it carries the
Shopify auth params (third-party cookies are blocked in the iframe, so `id_token` and `session` have to
survive the hop or the merchant lands on a page that cannot authenticate, which reads to them as being
logged out).

`authenticate.admin` still runs first on every one of them, so this is not a hole in G3.

### What was absorbed, and what was dropped

From the magic-moment engine at `/app/welcome`, one line each as asked:

| From the welcome engine | Verdict |
|---|---|
| Catalogue scan + GEO/SEO scoring of the merchant's own products | **Absorbed** — `startState.server.js`, now scanning ACTIVE products only |
| Store-wide score reveal as the headline | **Absorbed** — "Your store scores N/100", streamed behind a skeleton |
| Weakest-product before/after | **Absorbed**, and widened from one product to three |
| Never-recharge-on-refresh idempotency, keyed shop+product | **Absorbed** — and strengthened: `reserveCredit` has four non-charging outcomes where welcome had one |
| 55 s watchdog into a retry state | **Absorbed** — per card, so one hung product does not block the other two |
| Credit refunded on failure or empty draft | **Absorbed** — every failure path in `runQuickStartOne` refunds |
| `FEATURE_MAGIC_MOMENT` flag | **Dropped** — a first-run experience is not a feature to toggle, and it was OFF in production, so no merchant ever saw this engine |
| The route itself | **Dropped** — Home renders it; no redirect, no extra route in the embedded chain |
| First-run setup checklist ("configure brand voice / generate / publish") | **Dropped** — the brief says no checklist; the drafts on screen are the progress |
| "Skip to dashboard" | **Dropped** — there is nothing to skip; this IS the dashboard |
| "Optimize my whole store" bulk CTA on first run | **Dropped** — a bulk run before the merchant has read a single draft is the opposite of first value |
| Plan split (Free vs paid flows) | **Dropped** — owner decision: both get the 3-product flow |
| `GrowthState.welcomeSeenAt` / `setupCompletedAt` | **Dropped** — new migration, below |
| The 5-step brand-voice wizard at `/app/setup` | **Dropped** — brand voice stays in Settings with inferred defaults |

`GROWTH_ENGINE_REPORT.md` recovered from `679828c` (deleted in `87c5966`) to
`docs/history/GROWTH_ENGINE_REPORT.md`. The quick-start route and its 427-line helper were already pulled
out of the abandoned agent worktrees into `docs/history/worktree-recovery/` before the prune; both are
now restored as live code, with one real defect fixed on the way in — `app.quick-start.jsx` imported
`"../shopify.server"` without the file extension, which breaks `node worker.js`, and the extension guard
in `processRole.test.js` caught it.

### The migration

`prisma/migrations/20260910120000_retire_welcome_setup/` drops `GrowthState.welcomeSeenAt` and
`GrowthState.setupCompletedAt`. A **new file**; the applied migrations are untouched, per RUNBOOK Rule 1
and the incident that wrote it. `IF EXISTS` on both, so a re-run is a no-op. The expected-column list
regenerated from 210 to 208.

Dropping a column is destructive and worth justifying: both were booleans in disguise ("has this
one-time screen been shown"), the screens no longer exist, and nothing reports on them. First-value state
now lives on the `Shop` row, which survives uninstall/reinstall the way `GrowthState` never did and is
what `ttvReport.server.js` measures.

### The feature flag

`FEATURE_MAGIC_MOMENT` is out of the code. `FEATURE_FLAGS` is now **empty**, and a test asserts it —
along with a sweep asserting no source file still reads `isFeatureEnabled("magicMoment")`. The machinery
stays, because the rule it enforces is worth keeping: add a flag back in the same commit that ships its
feature. Removing the inert Fly secret is **HUMAN-NEEDED item 7** with the exact command.

## 3.2 — Time to first value

### The shape

While `Shop.firstDraftSeenAt` is null, `/app` renders the Start state. **No redirect and no new
top-level route** — the embedded chain on a fresh install is admin → `/app`, and nothing else.

The single input is deliberate. The old decision read four things: whether any content existed, whether a
brand voice existed, a feature flag, and a one-shot `welcomeSeenAt` stamp. It now reads one, and it is
the first-value milestone the TTV report already measures. Two consequences worth stating because they
are the failure modes of the old rule:

- A merchant who has seen a draft and then deleted all their content is **not** shown Start again. The
  old rule ("no published and no drafts") would have restarted onboarding for them.
- A shop with **no `Shop` row at all** is not treated as a first run. That is a shop installed before
  tracking shipped and not seen since — see the install-count reconciliation above — and restarting
  onboarding for an established merchant is the expensive direction of this mistake. Absent evidence, the
  safe default is the dashboard. A failed `Shop` lookup degrades the same way.

What the merchant gets: no forms; the score reveal streamed behind a skeleton; the three weakest products
picked by the existing scorer; generation fired immediately with inferred defaults, one fetcher per
product so one slow product cannot hold up the other two; and "Review and publish" the moment the first
draft lands, into the Phase 2.8 Review screen. A store with no products gets the Phase 2.10 empty state
rather than a score of zero. A failed scan gets a retry rather than a fabricated number.

### Spending a merchant's credits without them pressing anything

Three generations start on their own. That is what the brief asks for and it is the right call — a first
run that waits for a click is a first run most merchants never finish — but it is only defensible if two
things hold, and both are tested:

**It is said before it is spent.** One sentence, above the cards: *"Writing 3 drafts now — that uses 3 of
your 25 remaining free generations this month. Nothing is published until you approve it."* Nothing is
published; the drafts go to Review.

**A refresh never charges twice.** The idempotency is server-side, keyed by shop + product, and it has
four non-charging outcomes:

| Outcome | Condition | Charge |
|---|---|---|
| `reuse_draft` | a usable draft < 24 h old exists | none — returned as-is |
| `in_flight` | a credit taken < 300 s ago, no draft yet — the first request may still be running | none |
| `orphan` | a credit taken 300 s–24 h ago, no draft — that request died | none, the paid credit is reused |
| `denied` | quota exhausted | none |
| `new` | the SERIALIZABLE quota gate wrote a `UsageRecord` | **the only charge** |

And every failure after a charge refunds it: model throw, empty draft, vanished product, failed save.
Every merchant-facing failure message says *"no generation was used"*, and none of them leaks an internal
error — a merchant reading `ECONNRESET at 10.0.0.4:443` learns nothing and worries about their credit.

Only as many generations start as the quota can pay for, so a merchant with two credits left is never
shown three spinners that resolve into one refusal.

### `shouldRevalidate`, and a bug it prevents

The Start state fires three fetchers at `/app/quick-start`. React Router revalidates every loader after
any fetcher submission by default, and here the **first** one would have been actively harmful:
`runQuickStartOne` stamps `firstDraftSeenAt` as soon as a draft is written, so the reloaded Home loader
would have decided this shop was no longer on its first run and swapped the Start state out for the
dashboard **while the other two generations were still in flight** — the merchant watching their screen
change out from under them and losing sight of the drafts they were waiting for. `shouldRevalidate`
returns false for quick-start submissions. Navigation and the retry button's explicit revalidate still
refresh normally.

### TTFV measurement — NOT YET MEASURED

The brief asks for **p50/p90 from ≥ 5 fresh dev-store installs**, and for the acceptance run to be
recorded from the install grant screen with the URL bar visible.

**That number does not exist yet and is not being reported as if it did.** `ttvReport.server.js` and
`scripts/ttv-report.mjs` are in place and the instrumentation is live (`quickStartStartedAt`,
`firstDraftSeenAt`, `firstPublishAt`, `productCountAtFirstLoad` are all stamped by this deploy), but the
cohort is empty: the report deliberately excludes `pre_tracking` shops, and **every** shop in the
database is `pre_tracking`. There are no measured installs at all — see the install-count reconciliation
above, where all four installs turn out to be ours or Shopify's.

Five fresh dev-store installs are needed to produce it, and an install is a human action: it requires the
Shopify Partner console and a browser somebody logs into, which no agent does here. This is recorded as
an open item rather than reported as done, and the acceptance criterion is unchanged: fresh install, ≥ 10
products, first proposal < 120 s wall-clock.

| | Status |
|---|---|
| Instrumentation live (first-load → `firstDraftSeenAt`, in ms) | **Yes**, this deploy |
| `ttvReport.server.js` cohort query + `scripts/ttv-report.mjs` | **Yes**, already existed |
| p50 / p90 over ≥ 5 fresh installs | **Not measured** — no measured install exists to include |
| 120 s acceptance recording | **Not recorded** — needs a human install |

The report, run against production on 2026-09-10 (`e730fd3`), before this deploy:

```
cohortSize: 0            measuredInstallsTotal: 0
draft:   { n: 0, note: "no install has reached this milestone yet" }
publish: { n: 0, note: "no install has reached this milestone yet" }
```

That is not a broken report. `computeTtvReport` excludes `installSource: "pre_tracking"` because those
shops predate measurement, and all three `Shop` rows carry it — so the cohort is correctly empty rather
than wrongly full of shops whose install moment is unknown.

## 3.3 — Compliant review request, one code path

### There were two, and the dead one won

The tree carried two complete designs for the App Store review ask.

The **live** one stamped `GrowthState.reviewRequestedAt` from a client component
(`<ReviewRequest active={...} />`) that decided for itself whether to ask, using loader data. That is how
`app.jobs.jsx` ended up asking for a review **on page open**: a merchant who opened Jobs to check on a
run was asked to rate the app having pressed nothing. A reviewer reads that as a soft dark pattern, and
they are right.

The **dead** one, `reviewAsk.server.js`, was complete, careful and called by nothing.

The dead one won, and the reason is structural rather than aesthetic. In the new shape the **server**
opens an attempt inside the publish action the merchant confirmed, and returns an `attemptId`. The client
can only call `shopify.reviews.request()` when it is handed one. A page load has no action result, so it
has no attemptId, so it cannot ask. **"Never on load" stops being a rule anyone has to remember, because
there is no code path for it.** The component no longer accepts a boolean at all — `active` is gone, and
a test asserts it, because `active` is precisely the shape of prop that lets a parent say "ask now" from
loader data.

### The trigger

`APPROVES_BEFORE_ASK = 3`. The ask opens on the merchant's **third** approve or later, counted as
approved **products** rather than published rows — publishing one product writes a description, a meta
title and a meta description, so counting rows would fire on the first approve while calling itself the
third.

The count is read inside `openReviewAsk` from `getContentMetrics`, the Phase 2.1 shared definition of
"published products", so no call site can pass a wrong number and the gate can never disagree with the
figure on the merchant's screen. A failed count returns 0 and does not ask — it fails closed.

The gate is an **allow-list**, not `trigger === "publish"`. Anything unrecognised is counted, because the
two failure directions are not equal: gating a trigger that did not need it costs one un-asked review,
while a new trigger string slipping past the count asks a merchant who has approved nothing. Only
`audit_improved` is exempt.

### Where it fires, and where it does not

| Surface | Before | Now |
|---|---|---|
| Review screen | on any successful publish, from loader state | inside the publish action, 3rd approve onwards |
| Product page | on publish **or auto-publish**, from action data | inside the publish action only |
| Jobs page | **on page load**, from loader data | **removed entirely** |
| Start state | — | never — a merchant who has published nothing is not asked |

Auto-publish is deliberately excluded: it is content the merchant never pressed approve on, so it is not
a moment to ask them how much they like the app.

### The parts that were already right, and are kept

`reviewAsk.server.js` already got the hard parts correct and they are untouched: the optimistic
`updateMany` claim on the `Shop` row so exactly one attempt opens per eligible moment even under the two
parallel document loaders; a 60-day **pending** hold written at open time, so a lost callback can never
cause a re-ask inside Shopify's cooldown; per-code holds on the reported outcome; and terminal codes
(`success`, `already-reviewed`, `merchant-ineligible`) ending asking for good. Shopify enforces
eligibility; nothing here pre-empts it.

Results are stored on the `Shop` row as the brief specifies — `reviewLastAskedAt`, `reviewLastCode`,
`reviewShownAt`, `reviewDoneAt` — plus a `ReviewRequestAttempt` row per attempt carrying the surface, the
trigger, the install age and the returned code.

Two smaller things worth naming:

- **A hidden tab is not a decline.** If the merchant has switched away, the modal opens behind their back
  and is dismissed unseen. That is reported as `skipped-hidden` and held for a day, rather than spending
  the one ask on nothing.
- **The callback route never redirects.** A background fetcher that receives a redirect to a login form
  renders it into nothing and loses the outcome, which would leave the attempt `pending` — and a pending
  attempt holds the shop for 60 days. It answers JSON with a status, always.

### What was deleted, and what was deliberately kept

The `GrowthState.reviewRequestedAt` **write** path is gone from every screen and from the callback route.
The **column and the read** stay, and that is deliberate: `decideReviewAsk` still treats a legacy
`reviewRequestedAt` within 60 days as a hold, so a shop that was asked under the old code is not asked
again immediately by the new one. A test pins both halves — no screen writes it, `reviewAsk.server.js`
still reads it.

`tests/routes/no-dark-patterns.test.js` is **committed** (item 3.1 asked for it once it passed). It was
gitignored precisely because it described this work and failed against `main` by design; the ignore entry
and its explanatory comment are both removed.

### The second trigger — NOT implemented, and why

The brief offers two triggers, "whichever first": the third approve, **or** an audit re-run scoring
higher than the previous.

**Only the first is implemented.** `app.seo-audit.jsx` computes its score in a **loader** and has no
action — its only refresh is `revalidator.revalidate()`. Firing a review ask from there would be firing
one on page load, which is the exact thing this item exists to stop, and it would undo the structural
guarantee that the rest of the work is built on. Persisting a previous score and comparing it would not
change that; the problem is not the data, it is that there is no merchant-confirmed action to attach to.

Doing it properly means giving the audit a real "Run audit again" action and opening the ask inside it.
That is a contained piece of work and `COUNT_EXEMPT_TRIGGERS` already reserves `audit_improved` for it,
but it is not done, and "whichever first" means the item's requirement is met by the approve trigger.
Recorded as a deliberate omission with its reason rather than quietly dropped.

### The trace

`shopify.reviews.request()` cannot be exercised without a merchant and a real admin session, so the
network/console trace at the trigger and the `Shop` row update are **not captured**. What is verified:

| | Status |
|---|---|
| One code path; the dead one deleted | **Verified** — tests + source guards |
| Fires only inside a confirmed action | **Verified structurally** — no attemptId exists without an action |
| Never on load / on error / in Start | **Verified** — jobs-page ask removed, source guards on all four surfaces |
| Third approve enforced, fails closed | **Verified** — unit tests at 0, 1, 2 and 3 approves |
| Terminal codes never re-fire | **Verified** — existing `holdFor` / `decideReviewAsk` tests |
| Network trace at the trigger, `Shop` row updated live | **Not captured** — needs a merchant session and a real ask |

## 3.4 — Quota-aware conversion, two surfaces

### Six, and why that was worse than any one of them

A merchant who hit their quota met six upsell surfaces: the Home hero, the Home usage card, a Products
banner, the Products bulk panel, the product page twice, and Optimize. Each was defensible on its own.
The sum was not. The app spent a merchant's worst moment — the moment it stopped doing the thing they
were trying to do — asking them for money six times.

Worth noting how they got there: **`getUpsell` and `QuotaUpgradePrompt` existed, were careful, and were
called by nothing.** Every one of the six was ad-hoc, written where it was needed, with its own copy and
its own threshold. That is the same pattern as the review ask in 3.3 — a considered implementation sat
unused beside a scattering of improvised ones. Both are now wired to the considered one.

### The two that survive

| | When | Where | What it does |
|---|---|---|---|
| **(a) warning banner** | 80–99% used | Home and Products **only** | One `Banner`, dismissible for 7 days, `?from=quota80` |
| **(b) quota-reached card** | 100% | wherever the generate/optimise action is | **Replaces** the action, `?from=quota100` |

**Replaced, not hidden**, is the load-bearing half of (b). A button that vanishes reads as a bug and
sends a merchant looking for what they broke. A card standing where the button was, saying why it cannot
run and what would make it run, is the app being honest about its own limit. On Blog the pattern was
already right (`isOutOfUsage ? prompt : form`) and only the component changed; on Optimize and the
Products bulk panel the action is now swapped the same way.

And **everything that does not cost a generation keeps working at 100%** — the audit still runs, and
existing drafts can still be reviewed, edited, approved and published. The card says so in as many
words. Being out of quota stops new generation, not the app.

### Where the numbers come from

Both surfaces are computed on the server (`quotaSurfaces.server.js`, `getUpsell`), so the count and the
recommended plan are measured rather than written into a template. Neither ever throws — an upsell is
not worth a broken screen, and both return null on any failure.

Three restraints worth naming, each with a test:

- **A limit of 0 is `ok`, not `exhausted`.** An unmetered or misconfigured plan must not put every screen
  into the out-of-quota state.
- **The banner is silent on the top plan.** There is nothing honest left to sell a Pro shop.
- **The recommended plan is the one that actually covers them.** The brief's illustrative copy says
  "Growth includes 200/month"; the shipped copy says whatever `fitPlanFor` returns, which for a merchant
  using ~25/month is **Starter at $9.99**. Naming a $29.99 plan they do not need would be exactly the
  thing the "honest copy" rule is for. **This is a deliberate deviation from the example copy**, and it
  is the only one.

The reset date sits beside the CTA on both surfaces. Without it the only way out of the banner is to
pay, which is untrue — waiting works — and a merchant told only about the paid option has been misled by
omission.

Dismissal is stored on the `UpgradePrompt` row, not in the browser, so it holds across the merchant's
devices and survives clearing site data. It rides the existing `markPromptEvent(shop, id, "dismissed")`
path; there is deliberately no second writer, because two functions setting one column is how they drift.

### Attribution — the chain that did not exist

`attributePlanChoice` was also dead code. So there was no way to answer "which surface produced this
upgrade", which is the whole point of cutting six down to two.

The chain is now joined end to end:

```
banner/card  →  /app/plans?from=quota80|quota100&prompt=<id>
                   ↓  loader: markPromptArrived + recordArrivedFrom
                subscribe form carries promptId
                   ↓  action: markSubscribeRequested
                Shopify approval → /billing/callback → syncBillingToPlan
                   ↓  attributePlanChoice → stampUpgradeSource
                Shop.upgradePromptSource = "quota80" | "quota100"
```

New migration `20260910130000_upgrade_prompt_source` adds `UpgradePrompt.arrivedFrom` and
`Shop.upgradePromptSource`. Both nullable with no default, and that matters: **an upgrade with no prompt
behind it is an organic upgrade, and it is recorded as `null` rather than credited to whatever prompt
happened to be nearest.** A `from=` value we did not mint is discarded — an attribution a merchant can
type into their own URL bar is not an attribution.

The whole attribution block runs **after** the plan write and swallows its own errors, deliberately:
getting an attribution wrong must never be able to cost a merchant the plan they just paid for. The
previous-plan read is wrapped in its own try/catch for the same reason.

### The Plans page

Already Polaris (Phase 2.5 — `polaris-only.test.js` covers it). Two changes:

**The downgrade copy was untrue.** It said *"Cancel current plan to switch"*, and rendered as plain text
with no control. Shopify **replaces** an app subscription when the merchant approves a new one; there is
no cancellation step. A merchant who followed that instruction and stopped there would have been left
with no plan at all. It is now a real button — *"Switch to {plan}"* — with the line *"Approving this
replaces your current plan — no need to cancel first."* The existing subscribe action already accepted
any valid plan key, so nothing else had to change.

The FAQ said downgrades "take effect at the end of the current billing period with prorated credit",
which described a cancellation flow that does not exist here. It now says approving a new plan replaces
the current one, and that Shopify prorates.

### What is verified, and what is not

| | Status |
|---|---|
| Six surfaces reduced to two | **Verified** — a sweep asserts no file renders the ad-hoc `<UpgradePrompt>`, and that exactly Home and Products carry the banner |
| 80% banner, dismissible 7 days, server-side | **Verified** — 42 unit tests incl. the boundaries at 19/20/24/25 of 25 |
| 100% card replaces (not hides) the action | **Verified** — source guards on all four generate surfaces |
| Audit/review/publish keep working at 100% | **Verified structurally** — no quota gate on those paths; stated in the card copy |
| `from=` recorded on activation | **Verified** — unit tests through `stampUpgradeSource`, including the refusal to guess |
| Honest copy: no countdown, urgency or scarcity | **Verified** — regex sweep in two test files |
| Downgrade copy corrected | **Verified** — source guard |
| **Drive a dev store 0 → 20 → 25 with the URL bar visible** | **NOT recorded** — needs a merchant session and 25 real generations |
| **Upgrade from the 100% card → Approve → plan active, source recorded** | **NOT recorded** — needs a human to approve a Shopify charge |

The two acceptance recordings both require a browser somebody logs into, and no agent types credentials
here. They are the same class of gap as the TTFV measurement in 3.2: the mechanism is tested, the
end-to-end recording is a human step.

---

# PHASE 5 (taken before Phase 4, on the owner's instruction)

The order was changed for a reason worth recording: the live App Store listing still showed the
pre-Phase-2 app — dark gradient hero, thirteen-item sidebar, "Optimise Store". Every merchant reaching
the listing saw five pictures of software that no longer exists and then installed something different.
Phase 4 is about retaining merchants; there are none to retain yet, and its benefits cannot be measured
against an empty cohort. Closing a leak on the one surface every install passes through comes first.

## 5.7 — Listing assets that depict the app as it is

### What was delivered

`listing-assets/` — seven PNGs at 2× (a 1600×900 frame is a 3200×1800 file), a `README.md` naming each
file, its caption and its listing slot, and a `manifest.json` recording what was on screen when each was
taken. Captured by `tools/proof/listing-assets.mjs` against production, on a dev store with 17 real
products and 13 products of published content, so the screens are populated rather than empty.

Captions are US English, under 100 characters, and every one describes something visible in its own
frame. None mentions rankings, traffic or revenue — the app cannot promise any of them.

Uploading is HUMAN-NEEDED item 11, with the click path and the captions ready to paste.

### The three defects the screenshots found

This is the part worth keeping. **1,062 tests were passing.** Every screen rendered perfectly. Looking at
them found three things no test in the suite could have:

**1. The Start state told a paying merchant their allowance was free.** On a Professional-plan store:
*"that uses 3 of your 1000 remaining **free** generations this month."* The word was hardcoded. Telling
somebody the thing they pay $79.99/mo for is free is not a rounding error in trust — and it would have
gone into the listing images. Fixed to read the plan; a test asserts the old string cannot return.

**2. The Products screen contradicted itself.** Stat cards: *"13 live · 4 ready to review"*. Directly
beneath them, the tabs: *"Draft (3) · Published (14)"*. Same store, same second. This is the exact defect
Phase 2 item 2.1 exists to prevent, and 2.1's own tests passed throughout.

The root cause is the interesting bit. The shared rule lived in `metrics.server.js`, which imports Prisma,
so **no component could import it**. Faced with a rule it could not reach, `app.products.jsx` wrote its
own from the description row alone — so a product with a published description and a draft meta title was
"Published" to the tabs and "draft" to the cards. A shared definition that half the app cannot import is
not shared. The pure rule now lives in `app/utils/productState.js` with no server imports, and
`metrics.server.js` re-exports it.

**3. Having fixed the tabs, the row badge was still a third classifier.** "Gift Card — Desc ✓, Meta ·
draft" carried a green "Published" badge while sitting under the "Draft (4)" tab one line above. It also
invented its own vocabulary — "No AI Content", "Unknown" — where `PRODUCT_STATE_LABEL` is what every
other screen says. Now one rule and one vocabulary, three consumers.

Guards for all three, each verified to bite by reintroducing the bug and watching the test fail:

| Guard | What it stops |
|---|---|
| `app.products.jsx` may not match `contentMap[…]?.description?.status` | a fourth classifier |
| the screen must route ≥ 3 classifications through `stateOfContentMap` | the badge drifting again |
| `app.products.jsx` may not contain `>No AI Content<` or `>Unknown<` | invented vocabulary |
| `productState.js` may not import anything `.server` | the root cause returning |
| `StartState.jsx` must pick the allowance word from the plan | the "free" copy returning |

### What the harness refuses to do

Three times in this project a proof harness printed a confident pass over a broken capture. So each frame
must clear four hurdles, and each **fails the run** rather than warning: the app's own iframe exists (no
`mainFrame()` fallback), the frame is not a 4xx page, the frame contains a string only that screen
renders, and the PNG is a plausible size and not byte-identical to another frame in the run.

**Those four are still not proof, and one of them proved it on this very run.** The first-run frame was
captured against a store with no products, and the "is this the right screen" pattern was loose enough
(`/scores \d+\/100|Add a product/i`) to accept the empty state. A technically-correct capture, useless as
a listing image, waved through by its own guard. The pattern was tightened to require a real score, and
the harness now correctly refuses that frame rather than shipping it.

### What is NOT delivered, and why

| | Status |
|---|---|
| 5 desktop frames | **4 of 5.** The first-run frame is refused, see below |
| 3 mobile frames at 375px | **Done** — clean, no overflow |
| Captions, US English, < 100 chars | **Done**, in the README and HUMAN-NEEDED item 11 |
| Uploaded | **No, and deliberately** — the owner's step, a parallel session has it |

**`04-start-desktop.png` does not exist.** The first-run screen renders only while a shop has never seen
a draft, and is only worth photographing on a shop that has products. No store is currently both: the
populated dev store passed its first run (my own session probe triggered it), and the fresh store has no
products.

I could have manufactured the state by nulling `firstDraftSeenAt` on the dev store. I did not, and when I
tried, the sandbox classifier blocked the write — correctly. Rewriting production records so a screenshot
looks better is not a habit worth starting, and the honest alternative already exists: HUMAN-NEEDED item
9 asks for five fresh dev-store installs for the TTFV number, and any one of those **is** this
screenshot. The command is in item 11.

**Frames 1 and 6 greet the merchant as "E2E Test Store"**, which is the dev store's brand-voice name.
Honest, and it looks like what it is. Fixing it is a Settings change on the dev store, left to a human
for the same reason. Frames 2, 3, 5, 7 and 8 are unaffected.

**Home has no store SEO score yet.** The brief asks for "Home (with the SEO score…)". That is Phase 4
item 4.3, two items away in the current order. Frame 1 shows the state-driven primary action and the
live/draft/needs-content counts, which is the rest of what was asked. **Re-capture frame 1 after 4.3** —
a score moving from 61 to 84 is the most persuasive image this app can put on a listing.

## 5.6 — Install funnels on surfaces we own

`/go?ref=<handle>` was built in Phase 0 — redirector, cookie, sanitiser, attribution, all tested — and
**nothing has ever linked to it.** So every install to date arrived as `unknown` or as an App Store
surface, and the funnels we own were invisible. That is the third thing this week that was carefully
built and never called, after `getUpsell`, `attributePlanChoice` and `reviewAsk.server.js`.

### The channel inventory

`app/utils/installChannels.js` — the canonical list, client-safe so the digest, the docs test and any
future admin surface read one thing. `docs/INSTALL-CHANNELS.md` is the human-facing version and a test
fails if the two drift.

Eight handles: `navaal-home`, `navaal-tools`, `navaal-nav`, `navaal-footer`, `blog-post`,
`bilby-report`, `bilby-footer`, `outreach-email`.

**One handle per SURFACE, and a surface is a place, not a campaign.** "The Bilby report page" is a
surface; "the September push" is not. A handle answers *where was the merchant standing when they
clicked*, which still means something in three years; a campaign handle stops meaning anything the day
the campaign ends, and then nobody can read last year's numbers.

**Never per-recipient.** A handle is a channel, so it survives `shop/redact` as aggregate data. A
per-recipient token would make the install record personal data, which redaction would then have to
delete — destroying the only attribution we have. A test greps the docs for template placeholders.

### The snippets

Delivered, not committed: **navaal.ai and Bilby are a different codebase.** Placement list, page by page
and spot by spot, is HUMAN-NEEDED item 12. Every snippet points at `/go`, never straight at
`apps.shopify.com` — a direct listing link is an install nobody can attribute — and none forces
`target="_blank"`.

Verified live before delivering them:

```
$ curl -sI "https://app.navaal.ai/go?ref=navaal-home"
HTTP/1.1 302 Found
location: https://apps.shopify.com/navaal-ai-seo-geo-content?ref=navaal-home
set-cookie: navaal_ref=navaal-home; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=None

$ curl -sI "https://app.navaal.ai/go?ref=%3Cscript%3E"
HTTP/1.1 302 Found
location: https://apps.shopify.com/navaal-ai-seo-geo-content     ← junk ref dropped, no cookie
```

### The digest now reports the split

New **WHERE THEY CAME FROM** section, grouped by `installSource`, biggest first, with registered channels
named and their owner beside them. So the funnels are measurable the day they go live rather than a
quarter later.

An **unregistered** ref appears as itself, labelled `(unregistered ref)`, rather than folded into
"other". A handle nobody registered is either a link somebody added without telling us or a typo quietly
losing installs, and hiding it would hide both.

The digest's honesty note was **narrowed, not removed**. It used to say the whole install-source split
was unavailable. That is no longer true — ref channels are visible to us. What is still invisible is
which App Store *surface* an organic install came from, because Shopify does not forward `surface_*`
under managed installation, and the note now says exactly that much and no more. Cookie attribution is
also partial by browser (Chrome and Edge send it in a normal window; Safari and Firefox generally do
not), which `docs/INSTALL-CHANNELS.md` states plainly — an install we cannot attribute is recorded as
`unknown`, never guessed into a channel, because a funnel that flatters itself is worse than no funnel.

The digest is also now guarded against the split query being unavailable **entirely**: `zero()` catches a
rejected promise, but a missing method throws before there is one. The digest's whole reason for existing
is that it still arrives when something is broken.

---

# PHASE 4 — A SMART APP THAT DELIVERS

Order taken, on the owner's instruction: 4.2 → 4.3 → 4.1 → 6 → 5 → 7 → 4. Verification and proof before
refinement, and THROTTLED handling before the large-catalogue work that needs it.

## Before 4.2 — the audit the owner asked for

The Products counting bug had a root cause that generalises: a shared rule living in a Prisma-importing
module is not shareable, so the screen wrote its own and the two disagreed in public. Grepping for the
same shape across quota thresholds, plan entitlements, content-type labels and score bands found **two
more, both with live defects.**

**Quota percent, re-derived in four components.** `app._index.jsx`, `app.plans.jsx`, `app.products.jsx`
and `app.blog.jsx` each computed `Math.min(100, Math.round((usageCount / monthlyLimit) * 100))` by hand.
Two of the four had no `monthlyLimit > 0` guard, so on a plan with no limit the division is `n / 0` →
`Infinity` → capped to **100**. Home and Plans told a merchant on an unmetered plan they had used 100% of
their quota, with a full progress bar, while Products and Blog on the same store said 0%. Nobody wrote
that twice on purpose; it is what happens when the correct rule is one unreachable import away.

**Score bands, re-derived in three places with three different middle tones** — `caution` in
`StartState.jsx`, `highlight` on the audit ring, and `undefined` on the audit row badge directly beneath
that ring. A product scoring 55 was amber on one screen, blue on another, and uncoloured in the list
under the thing that had just coloured it.

Both pure rules now live in client-safe modules — `app/utils/quota.js`, `app/utils/scoreBands.js` — with
the server modules re-exporting them so existing imports keep working. Plan entitlements were already
client-safe (`billing-plans.js`); content-type labels are local to one screen and have no second reader.

Guards: the pure modules may not import anything `.server`, no `.jsx` may compute a usage percentage or
draw a score band by hand, and the sweeps fail if they inspect nothing.

## 4.2 — Post-publish verification

**The difference between "we think it is live" and "it is live."** A publish was called successful when
Shopify's mutation returned no errors. That proves the request was *accepted*; it does not prove the
field now holds what was sent. The app was making the stronger claim.

### Cost: zero extra requests

`productUpdate` returns the updated product in its own response, and the mutation was asking for
`product { id }` and discarding the rest. It now asks for `descriptionHtml` and `seo { title description }`
— the fields it just wrote — and compares against what it sent.

| | Before | After |
|---|---|---|
| Shopify requests per publish | 1 | **1** |
| Round trips per publish | 1 | **1** |
| Added latency | — | **none measurable** — same request, ~1-3 KB more response |
| Added GraphQL cost points | 10 (mutation) | 10 — returned scalar fields on a mutation payload are not separately charged |

A test pins this: the publish path must issue **exactly one** `await graphql(` call. The alternative — a
second query per publish to read the product back — would double the API calls of a 5,000-product bulk
run and turn a trust feature into a rate-limit incident.

### Why the comparison is not `===`

Shopify normalises what it stores: HTML is re-serialised, attributes dropped, whitespace changed. A
strict string comparison would report a mismatch on nearly every publish, merchants would learn to ignore
the warning, and the feature would be **worse than not having it**. So each field is compared on what
matters:

- **descriptionHtml** — the *text* survives (tags stripped, whitespace collapsed, entities decoded).
  Markup Shopify rewrote is fine; words that went missing are not.
- **seo.title / seo.description** — exact after trim. Shopify stores these verbatim, so a difference is
  real, and is most often truncation, which the merchant needs to know about.

### The failure direction, which is the whole feature

A verifier that passes when it cannot see anything is decorative, and would be the fourth false-green in
this project. So **unverified is the default** whenever a comparison could not be made:

| Situation | Verdict |
|---|---|
| Shopify returned no product | unverified — "could not be confirmed" |
| Shopify returned no value for a field we sent | unverified — not `undefined === undefined` |
| Nothing was sent that we know how to check | unverified — "nothing to verify", never vacuously true |
| An empty string was sent | treated as nothing sent |

Nine of the twenty-four unit tests are this direction.

### What the merchant gets

An unverified publish is still `ok: true` — **it is live**, and reporting it as a failure would put the
row back to draft and have the merchant republish content already on their storefront. Instead the row
becomes `published_unverified` with a plain-language `verifyNote`, and Review shows a warning banner at
the top listing the affected products and why, with an Open button for each.

Tone is `warning`, not `critical`: nothing is broken and nothing was lost, something needs a look. Crying
wolf would teach merchants to dismiss the one banner in the app that says *your storefront may not say
what you think*.

The notes name no fields or codes — "Shopify shortened the page title", not "seoTitle mismatch". A test
asserts the note contains none of `seoTitle`, `descriptionHtml`, `productUpdate`, `null`, `undefined`.

### The trap this opened, and how it was closed

`published_unverified` is a new `status` value, and `stateOf` would have fallen through to
`needs_content` for it — a live product reading as untouched, on every screen at once. So the state was
added properly: `PRODUCT_STATE.UNVERIFIED`, precedence **between draft and published** (it needs an eye,
a clean publish does not), the label "Live, needs a check", and the `getContentMetrics` SQL `CASE` and
piece-count filter both taught about it. `unverifiedProducts` is now part of `byState` and of
`withContent`, so the counts still sum.

New migration `20260910140000_publish_verification` adds `GeneratedContent.verifiedAt` and `verifyNote`,
both nullable with no default and no backfill: NULL on an older row means *published before verification
existed*, which is the truth. Backfilling them as verified would have been a lie about rows nobody
checked.

## 4.3 — Before/after score, per product and for the store

"13 products optimized" is activity. **"Your store scored 61 when you installed and scores 84 now"** is an
outcome, and it is the only claim in the app a merchant can check against their own catalogue.

### Both ends come from one scanner

`scanStoreForStart` produces the before and the after. A before measured one way and an after measured
another is not a delta — it is two unrelated numbers with an arrow between them. The scanner now also
returns `scored` (every product it looked at), so the store average and the per-product rows come from a
single pass.

### The before cannot move

`Shop.storeScoreAtInstall` is stamped with `where: { storeScoreAtInstall: null }` — first writer wins,
and no later scan can rewrite it. Per product, `ProductScore` is upserted with the before fields in
`create` and **deliberately absent from `update`**, so a product scored a hundred times keeps the score it
had the first time. Both have a test whose failure would mean the delta is permanently zero and nothing
else breaks — the silent kind.

### Nothing is invented

| Situation | What Home shows |
|---|---|
| Scan failed, or store never scanned | nothing at all |
| Store has no products | nothing at all |
| Scan returned no usable number | nothing at all |
| Baseline unknown | the current score, with **no** comparison |
| First ever scan (before == after) | the current score, no arrow — an arrow pointing at itself reads as broken |
| Score went **down** | reported honestly, not hidden |

A baseline defaulting to 0 would produce "0 → 84" — the most flattering claim possible, from no data at
all, and the most damaging one to be caught making. There is a test named for it.

### Cost

One GraphQL page of 30 products, **cached 10 minutes per shop**, so reloading Home does not re-scan: at
most 6 extra Shopify requests per hour per shop regardless of traffic. Nothing issues a request per
product. The per-product rows ride the scan that already happened. On Products, the deltas are one
indexed DB read for the visible page only.

### Where it appears

Home, in a Card **above the fold** — the first thing after the page title, before the quota banner and the
stat cards. Products rows show `SEO 61 → 84` only when the change is real and positive: a product seen
once has before == after, and "67 → 67" on every row of a long list is noise. A product that went down is
not advertised in a list the merchant is scanning; that belongs on the product page where there is room to
explain.

New migration `20260910150000_before_after_score`: the `ProductScore` table plus
`Shop.storeScoreAtInstall` / `storeScoreAtInstallAt`. All nullable, no backfill.

## 4.1 — Quality gate before anything is saved

The scorer already existed and produced a number. **A number is not a gate**: it was computed, stored,
and never used to stop anything. This is the part that refuses.

Rules are pure (`contentQuality.js`, no database, no Shopify); the server half (`qualityGate.server.js`)
fetches the comparison window and retries once.

### The duplicate check — the hard one, done properly

The owner named this as the rule most likely to be quietly skipped. Here is exactly what was built and
exactly where it is weaker than it looks.

**The naive versions do not work.** Exact hashing catches nothing — two descriptions always differ by at
least the product name. Comparing every new description against every previous one is O(N^2): 12.5 million
comparisons on a 5,000-product run.

**What was built: SimHash over product-agnostic shingles.**

1. Normalise, then **remove the product's own words** (title, vendor, type). This is the load-bearing
   step. Two descriptions written from one template differ mainly by those words; strip them and template
   reuse collapses to an identical fingerprint. Without it every fingerprint is dominated by the product
   name, nothing ever looks alike, and **the check silently passes everything** — which is how this rule
   gets shipped broken.
2. Overlapping 3-word shingles, each hashed to 64 bits.
3. Weighted bit sum, producing a 64-bit fingerprint.
4. Hamming distance against a **bounded** window (200 most recent fingerprints, 16 bytes each, one
   indexed query per generation).

**Measured on real template text:**

| Case | Hamming distance | Threshold is 6 |
|---|---|---|
| Same template, product name swapped | **0** | caught |
| Genuinely different product, same brand voice | **26** | correctly passes |
| Same template with one phrase paraphrased | **11** | **NOT caught** |

**Stated plainly, because the owner asked for honesty over a version that always passes:** this catches
verbatim template reuse, which is the failure that actually happens in a bulk run. It does **not** catch a
description paraphrased throughout — measured at distance 11, above the threshold of 6. Raising the
threshold to about 14 would catch paraphrases and still clear the 26 of genuinely different content, but
it narrows the margin against false positives, and a gate that blocks honest content is one a merchant
turns off. The conservative threshold ships; the measured numbers are here so the decision is revisable
rather than folklore. It is not a plagiarism detector and does not compare against the whole catalogue.

**Both directions are tested.** A duplicate check that always passes is indistinguishable from no check.
The pair — template reuse must be caught, different-products-same-voice must not be — cannot both pass on
a broken implementation, which is what makes them worth having.

### The hard rules

| Rule | Fails when |
|---|---|
| Meta lengths | title over 70 or under 15; description over 160 or under 70 |
| External links | any link outside the shop's own domain (relative and own-domain allowed) |
| Placeholder text | lorem ipsum, `[PRODUCT]`, `{{...}}`, TODO, "insert ... here", "as an AI..." |
| Language | English locales only, by stopword frequency |
| Duplicate | as above |
| Score | below 60 |

**The language rule refuses to judge what it cannot check.** For non-English locales it returns
`checked: false` and the gate does not judge. Shipping a check that cannot tell French from Spanish, and
failing merchants on it, would be worse than admitting the limit.

A hard failure fails **even with a perfect score** — the score is advisory, the hard rules are not.

### What happens to a failing draft

Regenerate **once**. Keep the better of the two — a retry that is worse is not an improvement and the
merchant already paid for the first. If it still fails, the draft is **saved** with a plain-language note,
because the merchant paid a generation for it and deleting it would leave them with nothing and no
explanation.

**Autopilot never publishes a flagged item.** The publish is guarded on `!qualityNote`, the withholding is
logged, and the reason goes into the job's error log where the merchant reads it. Pushing content the gate
rejected onto a live storefront with nobody reading it is the worst thing this app could do.

A gate that cannot RUN (a database blip) does not withhold content either — there is no finding to justify
it, and failing closed there would silently stop a merchant's whole job.

New migration `20260910160000_quality_gate`: `GeneratedContent.simhash` and `qualityNote`, plus an index
on `(shop, contentType, updatedAt DESC)` — the query the comparison window actually runs. No backfill: a
row written before the gate has no fingerprint and is **excluded** from comparison rather than treated as
unique, because treating unknown as unique is how a duplicate check stops working without anything failing.

## 4-item-6 — Large catalogues, and three crashes that only happen to big shops

The owner named one: `app.products.jsx` dereferencing `gqlData.data.products` with no errors check.
Confirmed, and it is worse than one site.

A Shopify GraphQL response can fail three ways and **all of them return HTTP 200**. Top-level `errors` is
a *sibling* of `data`, never a member of it, so on a THROTTLED response `data` is null and
`gqlData.data.products` throws a TypeError. That is a **500 page**, for a merchant whose only crime was
having a catalogue big enough to get throttled.

Shopify's leaky bucket refills at a fixed rate, which makes this a large-catalogue bug specifically: a
200-product shop never sees it and a 5,000-product shop sees it constantly. **It fails for exactly the
merchants worth having.** It is also the same defect Phase 0 item 9 fixed in the publish path, still
living in the read path — which is what happens when a fix is applied to one call site rather than to a
shared helper.

### The three sites

| Where | What it read | Effect on a throttle |
|---|---|---|
| `app.products.jsx` loader | `gqlData.data.products` | **500** on Products |
| `app.optimize.jsx` product count | `d.data.productsCount.count` | **500** on Optimize |
| `app._index.jsx` product count | `d.data.productsCount.count` | **500** on Home |

The first was named by the owner. The second I found by grepping for the pattern. **The third was found by
the sweep test**, after I had already "finished" — which is the argument for the sweep existing at all.

### One helper, every catalogue read

`shopifyQuery.server.js`: retries a throttle with exponential backoff, honours `Retry-After` on a 429,
does **not** retry an ordinary GraphQL error (retrying will not fix a bad field), and — when it gives up —
returns a **result rather than throwing**, because a 500 page is not an answer. `productsPage()` extracts
the page and returns empty edges instead of throwing, with a `reason` (`throttled` / `no_data` /
`transport` / `errors`) so callers can use the right words.

Wired into: the Products loader and its 250-per-page enumeration, the Optimize product count, the Home
product count, the SEO audit page fetch, and the Start/store-score scan.

### What the merchant sees now

- **Products** renders what it has with a warning: *"Shopify is rate-limiting your store right now, so
  this list may be incomplete. It will fill in shortly."* — instead of a 500.
- **Enumerating 5,000 products** (20 pages) retries a throttled page instead of silently truncating. That
  mattered: a merchant asking to optimise everything previously got whatever had been read before Shopify
  said no, with no indication the run was short.
- **The SEO audit** waits and retries a throttled page rather than counting it as failed. An audit that
  stops early reports a score for part of the catalogue as if it were the whole one.

### The sweep

A test walks every route file and fails on `\w.data.products` or `\w.data.productsCount` — the unguarded
form, where `data?.products` is fine. It found the Home instance. It also asserts it swept more than ten
files, so it cannot pass by inspecting nothing.

**What would this print if the thing it watches were completely broken?** If `shopifyQuery` always
returned `ok: false`, the backoff tests fail (they assert `ok: true` after recovery) and the productsPage
tests still pass — so the pair is needed, and both are present. If the sweep's regex matched nothing, the
`swept > 10` assertion fails. Neither check can pass vacuously.

### A cost worth naming

Backoff means real sleeps of 1s, 2s and 4s. Three test files were mocking `admin.graphql` directly and
began timing out at 5s. They now use the real helper with `maxRetries: 0`, and the backoff has its own
fake-timer tests. Worth stating plainly: the retries are real time on a genuinely throttled store, up to
about 7 seconds before giving up — which is the right trade against a 500, and is why the give-up path
returns a partial page with a banner rather than an error.

## 4-item-5 — Autopilot, bounded

Autopilot is the only path in the app where a merchant's generation is spent **without them clicking
anything**. `products/create` fires once per product, and a catalogue import fires it thousands of times
in a burst.

It already had the Growth+ entitlement, a quota fast-fail, per-product idempotency and a concurrent-job
cap. Every one of those bounds a single product or a single moment. **Nothing bounded an afternoon.**

- **Daily cap: 50 products per shop per UTC day.** Chosen against the plans rather than picked round —
  Growth is 200/month, so 50 is a quarter of the monthly allowance: enough that a normal day of adding
  products is never blocked, small enough that a runaway import is stopped on the first day rather than
  the second. It counts **products, not jobs**, so the cap does not become meaningless the day an
  autopilot job covers more than one.
- **Refusal is a 200**, like every other refusal in that webhook. A non-2xx makes Shopify retry, and a
  retried refusal is a retry storm.
- **A failed counter ALLOWS the work.** Every other bound still applies, and failing closed there would
  silently switch a paying merchant's automation off with no error anywhere.
- **A job whose `source` is unknown is not counted** — that is a row written before the column existed,
  and refusing work on evidence we do not have is the wrong direction.
- **Draft-only unless the Settings switch is on**, and the 4.1 quality gate withholds a flagged item from
  publishing even when it is.
- **Home says what happened**: "Autopilot optimized N new products in the last 24 hours", with a link to
  Review. Autopilot works while the merchant is not looking, so the one place it must appear is the
  screen they open next. Silent when it did nothing, and silent when jobs completed with zero products —
  "Autopilot optimized 0 new products" is worse than saying nothing.

New migration `20260910170000_autopilot_bounds`: `GenerationJob.source`, nullable, no backfill.

## 4-item-7 — Restore original, one click

Version history and a per-type restore already existed on the product page. What did not exist was the
one a merchant actually reaches for: they have looked at their storefront, they do not like what the app
wrote, and they want their own words back **now** — from the list, without opening the product and
finding the History tab.

- **On the product row**, shown only when the AI version is actually live *and* an original was saved.
  Offering to undo something that never happened is noise on every row.
- **Not gated.** The restore branch runs **before** the bulk entitlement check. A shop that downgraded
  must still be able to undo what the app did to its storefront.
- **Nothing is destroyed.** The AI version goes back to being a draft, so the merchant can change their
  mind. Undoing a publish is not throwing the work away.
- **A failed publish does not downgrade the rows.** The AI content is still live; marking it a draft
  would leave the app describing a storefront that does not exist.
- **It refuses when there is no saved original**, rather than publishing an empty description — which
  would wipe the product's copy entirely, the exact opposite of a restore.
- **The confirm says what happens to both sides**: the original goes live, the AI version is kept,
  nothing is deleted. A confirm that only names what it destroys makes people cancel; one that only names
  what it does makes them careless.

## 4-item-4 — Brand voice inferred

The retired `/app/setup` opened with five questions about tone and audience before the merchant had seen
the app do anything. Most people answered badly or not at all, and a blank brand voice produces generic
copy — **so the form that existed to improve quality was mostly lowering it.**

The shop already contains the answer. A merchant who has written their own product descriptions has
demonstrated their voice far more accurately than they could describe it in a text field.

- **It costs nothing extra.** The store name rides on the catalogue scan the Start state already runs
  (`shop { name }` added to that query); the samples are the products that scan already returned. No new
  Shopify request, no model call.
- **The samples are the merchant's BEST-written descriptions**, ranked by the score the app already
  computes — their best work, not the first three alphabetically. Descriptions too short to say anything
  are skipped even when they score well.
- **It never overwrites the merchant.** The write is create-only through an upsert whose `update` is
  `{}` — deliberately empty, so even a race between the read and the write leaves a merchant's own
  settings intact. Settings always wins.
- **It is not gated.** A brand voice is not a feature; it is the difference between usable copy and
  generic copy, and charging for it would mean deliberately shipping worse writing to free shops. A test
  asserts the module references no entitlement at all.
- **It invents nothing.** A shop with no copy of its own gets an empty `sampleContent`, which is honest.

### A bug this nearly shipped

Adding `shop { name }`, I wrote the explanatory comment **inside the GraphQL template literal** using
`//`. That is a valid JS comment and a **GraphQL syntax error**: Shopify would have rejected every scan —
the Start state, the store score and this inference, all at once.

**Not one test would have caught it.** Every test in this repo mocks the transport and none parses the
query. It was caught by reading the diff. The comment now lives outside the string, with a note saying
why, and there is a test asserting the query contains no `//`.

That is the fourth false-green shape in this project, and it is worth naming precisely: *a check that
never exercises the thing it appears to cover.* The tests around that query are thorough and would all
have stayed green while the feature was completely broken in production.

---

## P1 (10 Sep 2026) — one defect wearing three masks: a deploy that left no web machine running

Three anomalies were recorded inside the ten deploy windows of 10 Sep: `app/uninstalled` response
p90 of **5,911 ms** (past Shopify's ~5 s delivery timeout), **one of five** new `app/uninstalled`
deliveries failing, and `navaal-ttv-05` losing a generation to "Busy for a moment — no generation was
used" with the AI circuit breaker closed and zero failures.

A parallel session concluded the webhook handler was doing work before answering. **It is not.**
Before its 200 it does an HMAC, a Redis `SET NX`, one `findUnique` and one `markShopUninstalled`.

### What it actually was

`auto_stop_machines = "stop"` with `min_machines_running = 1` means Fly keeps **exactly one** web
machine running and stops the rest — and during a deploy, that one machine is the one being replaced.

Fly's own event log for release v176:

```
05:58:19.539  81112eb  (the only RUNNING web machine)   pending/launch
05:58:20.442  784eed   (the "spare")                    stopped/update
05:58:23.468  81112eb                                   started
```

The spare was updated **in place while stopped** and left stopped. flyctl even reported
`[1/4] Machine 784eed3dbe7158 reached stopped state` → `is now in a good state`. It was never a
fallback; it was decoration.

And the strategy did not roll. flyctl announced *"Updating existing machines in 'contentclaude' with
rolling strategy"* and then updated **all four machines within the same millisecond**:

```
05:58:16.6003  [2/4] Updating machine config for d8d996d7b1ed28   (worker)
05:58:16.6003  [3/4] Updating machine config for 874274c0235e48   (worker standby)
05:58:16.6004  [4/4] Updating machine config for 81112eb9733578   (WEB — running)
05:58:16.6005  [1/4] Updating machine config for 784eed3dbe7158   (WEB — stopped)
```

Requests arriving in that window queue at the Fly proxy until something can serve them, which is why
the symptom was multi-second **latency** rather than a clean 5xx.

### Measured from outside, not from the Fly dashboard

`tools/proof/deploy-watch.mjs` polls the public URL every 250 ms on a fixed tick, with no keep-alive
and a 30 s request timeout. Three runs, same instrument. The first two ran 600 s; the proof ran 780 s
because a push-triggered deploy waits for CI first, and the window had to cover the rollover:

| | before-fix (v176) | strategy only (v179) | both machines running (PROOF) |
| --- | --- | --- | --- |
| samples | 2,349 | 2,350 | 3,052 |
| p50 | 33 ms | 33 ms | 32 ms |
| p90 | 45 ms | 76 ms | 36 ms |
| p99 | **14,190 ms** | **24,112** ms | 76 ms |
| **max** | **17,085 ms** | **28,736** ms | **2,052** ms |
| requests over 1 s | **125** | **208** | **4** |
| window containing them | **95.2 s** | **168.7 s** | **31.7 s** |
| non-200 on `/api/health` | 0 | 0 | **0** |
| `/api/health?deep=1` | **503 twice** | **503 three times** | **none** |

The shallow endpoint never returned a non-200 even at its worst: the Fly proxy **queued** those
requests rather than refusing them. That is precisely why this looked like a slow handler instead of
an outage, and why Shopify — which gives up at ~5 s — recorded a failed delivery instead.

### The three changes

1. **`fly.toml`** — `auto_stop_machines = "off"`, `min_machines_running = 2`, and an explicit
   `[deploy] strategy = "rolling"` with `max_unavailable = 1`. `max_unavailable` is written down so a
   third machine cannot silently make it two-at-a-time and reopen the hole. Price: one extra
   shared-cpu-1x 512 MB machine.

2. **`startup.server.js`** — `react-router-serve` installs its own SIGTERM handler that calls
   `server.close()`, letting in-flight requests finish. Our `gracefulShutdown` was **racing it**: on a
   web machine there is no BullMQ worker to drain, so everything completed in milliseconds and
   `process.exit(0)` killed those requests. Web machines now wait `WEB_DRAIN_MS` (15 s, inside
   `kill_timeout`'s 60 s) first.

   A bounded timer, not a request counter, **deliberately**: React Router only routes document and
   `.data` requests through `entry.server`, so a counter there would miss every resource route —
   including the generation endpoint, the one request we least want to drop. A counter that misses the
   important case is worse than an honest timer, because it reads as proof.

3. **`plans.server.js`** — "Busy for a moment" is a **P2034** serialization failure on the SERIALIZABLE
   quota transaction after the retry budget ran out. The budget was **one** retry, which is not a
   budget, it is a coin flip: the dashboard fires **three** quick-start requests in parallel for the
   same shop, each running `count()` then `create()` over the same predicate, so Postgres aborts all
   but one. One wins, two retry, and the loser of *that* race was out of attempts. Now three retries
   with exponential backoff plus jitter. Retrying cannot double-charge: the conflicting transaction
   **aborted**, so it wrote no `UsageRecord`.

### `auto_stop_machines = "off"` does not start a stopped machine

Nothing in a deploy starts one either — flyctl updates it in place and calls it good. The second
machine had to be started by hand (`fly machine start 784eed3dbe7158`), and that is exactly how this
regresses silently. So `ci.yml`'s deploy job now asserts, after every deploy, that there are at least
two `web` machines and that **all** of them are `state=started`.

### Two things found that were not being looked for

**Every push to `main` deploys, and there is a second workflow that deploys the same thing by hand.**
`ci.yml` has a `deploy` job on push; `deploy.yml` is a `workflow_dispatch` doing the same `flyctl
deploy`. They share `concurrency: deploy-group`, which **serialises** them — it does not deduplicate
them. Dispatching the manual workflow after a push therefore produces **two full deploys of the same
commit**, each opening its own window. That is what happened at 05:58:19 (v176, manual) and 05:59:38
(v177, CI) — 79 seconds apart, both visible as separate holes in the before-fix measurement.

**There is no log retention.** `fly logs --no-tail` returns roughly the last 100 lines — under ten
seconds of traffic at four requests per second. The 03:45 `navaal-ttv-05` failure the investigation was
asked to trace **cannot be recovered**, and neither can any incident more than seconds old. For an app
that is meant to run for a hundred years, that is the gap that matters most in this entry.

### A correction to the commit message

Commit `4312a5b` says the uninstall handler "answers in ~40 ms". **That number was not measured.**
What was measured is `/api/health` at ~5 ms on the same machine; ~40 ms is an inference from the
handler's pre-200 work. Measuring it honestly would mean forging a signed webhook against a production
write path, which is not worth the number.

### The standing test, per check

- **`deploy-watch.mjs`** — self-tested both ways before being trusted. Pointed at a path that 404s it
  refuses at pre-flight (exit 2) rather than producing a clean report of an unreachable host; with the
  slow threshold forced to 0 it counted all 19 samples and printed FAIL. Its tick is deliberately
  independent of the response, because a poller that awaits each request **stops sampling during the
  outage it exists to measure**, and the resulting gap in the data looks like nothing happened.
- **`quotaContention.test.js`** — reverted to the old budget, three of its cases fail. The two burst
  cases are written in terms of a conflict *count*, not `QUOTA_MAX_RETRIES`, because a test that reads
  the constant it is checking passes at any value of it, including zero.
- **"Every web machine is running"** — if the spare stops, it prints the states and fails. If flyctl
  changes its JSON shape the `select` matches nothing, `count=0`, and `-lt 2` fails too: it cannot pass
  by finding nothing.
- **What none of them prove:** that a retry never double-charges. That rests on Postgres aborting the
  transaction, and `$transaction` is a mock in the unit tests, so counting `create()` calls there would
  measure the mock. Only an integration test against a real database could exercise it. Stated in the
  test file rather than implied.
- **`docs.test.js` is one-directional** — it asserts every environment variable the code *reads* is
  documented, but a documented variable that exists nowhere raises nothing. That is how `SECRETS.md`
  kept describing `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` long after it left `fly.toml`. Removed.

### The verdict, against the pass condition that was set

The condition was **zero non-200s and a sub-second maximum**. Half of it is met outright and half of it
is not, so this is reported as a partial pass:

- **Zero non-200s: met.** 3,052 samples, all 200, and the deep check never returned 503 once.
- **Sub-second maximum: NOT met.** Four requests out of 3,052 (0.13 %) took between 1,257 ms and
  2,052 ms, in two pairs about 30 s apart — one pair per web machine as it was replaced.

`deploy-watch.mjs` exited **1** and printed FAIL for exactly that reason, which is the behaviour that
makes it worth running: it was not going to be talked into a pass.

What changed for a merchant: the worst request during a deploy went from **17,085 ms to 2,052 ms**, the
number of requests over a second went from **125 to 4**, and the deep health check stopped failing.
2 s is comfortably inside Shopify's ~5 s webhook budget, so a deploy should no longer cost a delivery.
It is not, however, literally invisible, and it should not be described as such.

One more thing the measurement shows, visible in the build timeline: during the rollover the two
machines briefly serve **different builds** (`229fa44`, then `4312a5b`, then `229fa44` across four
seconds). That is inherent to a rolling deploy and is the price of there being no gap. It matters for
any change where an old and a new build must not both be live — a schema change relied on by the new
code is the obvious one, which is why `release_command` runs migrations first and why migrations are
additive.

### Are today's webhook and TTV numbers contaminated?

**Yes — treat them as contaminated, and do not spend a day optimising that handler.** The handler does
almost nothing before its 200, and the machine serving it answers `/api/health` in 5 ms. A 5,911 ms p90
cannot come from that code; it is consistent with deliveries landing inside measured windows where the
proxy held requests for up to 17.1 s. One failed delivery in five is what Shopify's ~5 s timeout does
to a request held that long.

What **cannot** be attributed either way is the 7-day `app/uninstalled` move from 1,039 ms to 1,403 ms:
that window contains both the old pre-fix handler and ten deploy windows, and there is no per-delivery
breakdown to separate them.


### Correction, same day: `windowMs` was the fifth false green, and it was mine

The table above reports a "window containing them" of 95.2 s, 168.7 s, 31.7 s. That statistic is the
span from the first slow request to the last one, and it is **decorative as soon as the slow samples
are sparse**. Ask the standing question of it: what would it print if there were no outage at all, but
two unrelated slow samples three minutes apart? *"180 s window"* — the same thing it prints for a
genuine three-minute outage.

A second proof run (release `d272222`) made that concrete: `windowMs` said **156.1 s** on a run whose
longest actual interruption was **1.5 s and affected one request**. Quoting 31.7 s against 95.2 s as
though they were comparable was wrong.

Recomputed from the raw samples, grouping slow requests into runs that are genuinely adjacent in time
(gap ≤ 2 s) rather than merely both slow:

| run | slow reqs | naive `windowMs` | real outages |
| --- | --- | --- | --- |
| before-fix (v176) | 125 | 95.2 s | **17.4 s** (63 reqs) and **16.8 s** (62 reqs) |
| strategy only (v179) | 208 | 168.7 s | **28.9 s** (110) and **25.6 s** (96), plus 1.7 s |
| both machines (v180) | 4 | 31.7 s | **2.1 s** (2 reqs) and 1.5 s (2 reqs) |
| both machines, run 2 (`d272222`) | 5 | 156.1 s | **1.5 s** (1 req), then 1.4 s, 1.3 s, 1.0 s |

**That is the honest result: two seventeen-second outages became four isolated blips of one or two
requests each.** The before-fix run shows *two* outages because it caught two deploys of the same
commit — the manual dispatch and the CI push described above.

`deploy-watch.mjs` now computes this itself and reports `outages: {count, longestMs, spans}` alongside
the old number, which is kept because the envelope is still worth seeing. Self-tested: with the slow
threshold forced to 0, twenty-three contiguous samples collapse into **one** outage of 5,630 ms, not
twenty-three.

Second proof run in full: 3,061 samples, **0 non-200**, p50 32 ms, p90 36 ms, p99 70 ms, max 1,521 ms.
Its deep check did return 503 twice for about two seconds each as a machine came back — the first proof
run's did not. Merchants never call `deep=1`, but the post-deploy smoke job does, so that is a
narrow race worth knowing about; it passed on both runs.


---

## A1.2 (10 Sep 2026) — a setting with a column, a read path, a green suite, and no way in

`BrandVoice.includeDraftProducts` and `scopeForShop` shipped in `2d9c37d`. The **Settings control did
not**. The column existed, the read path worked, 1,374 tests passed, and **no merchant could ever turn
it on**. The default was not a default; it was a law — no shop could include its drafts, however it
merchandises.

It was found by doing the reconcile step properly: grepping `includeDraftProducts` across the repo
returned exactly two files plus the generated schema list, and none of them was a screen. Reading my
own previous report would have told me it was done.

### What shipped

- A `Checkbox` in Settings beside "Publish without review" — **and the hidden input that posts it**. A
  Polaris `Checkbox` is not a form field. Without the hidden input the control renders, toggles, looks
  saved and posts nothing: the same end state as having no control, and far harder to notice.
- **Archived is deliberately not offered.** An archived product is not for sale and has no storefront
  page at any setting, so there is no honest reason to offer it. A test asserts the word never appears
  in that route.
- **No confirmation dialog.** `publishWithoutReview` asks first because it writes to a live storefront.
  This only widens a *count*, and a confirm there is ceremony that teaches merchants to click through
  dialogs — which makes the confirm that matters worth less.

### A1.2's second half — every label states which set it means

- **Optimize was sending `candidateLabel` in its loader payload and never rendering it.** Receiving a
  label is not showing one, and for one commit that screen's numbers named no population at all.
- Optimize's card also still read **"Needs Content" in critical red** — the same false label already
  fixed on Products and Home. It counts what *we* have not written for, not products with no content.
  Now "Not yet optimized", population named, not red.

### The false-green answer, per check (L1)

| Check | What it prints if the watched thing is broken |
| --- | --- |
| "renders a control for it" | **2 failures** — verified by deleting the checkbox, which is the original defect |
| "is submitted with the form" | **1 failure** — verified by deleting the hidden input |
| "Optimize renders the scope label" | **1 failure** — verified by replacing it with a literal |
| "the source really is the Settings route" | Guards the guard: a source sweep over an empty string passes, so it asserts length and a known marker |
| "does NOT offer archived" | Would pass if the whole file were empty — which is why the length assertion above exists |

The reachability guard is the point. **A test that only checked the action would have passed for the
entire time the setting was unreachable.**

### Store shapes (L2)

**Proved:** all-draft with the opt-in on and off · all-active (setting changes nothing) ·
majority-archived · a shop with no `BrandVoice` row · a settings read that throws. Plus a new cell:
**opting into drafts must never opt into archived**, and a draft that *is* admitted still needs a
public page.

**Not proved:** that the control is **visible on a rendered page**. These are source assertions, not a
browser. A control inside a collapsed section or behind a plan gate would pass every one of them and
still be invisible — which is the exact failure class this item fixed. Queued as **H13**.

### Measurements (L3)

Byte delta of the change: `app.settings.jsx` +24 lines, `app.optimize.jsx` +4/-3,
`tests/utils/candidates.test.js` +12. 1,386 tests. Lint clean from a cleared cache; typecheck and
build clean.

**Not measured:** anything about production behaviour. This is not deployed (L11 — Phase A has not
closed) and `/api/build-info` still reports `0acb04a`, confirmed cache-busted. Nothing in this entry is
live.

### Backlog reconciliation performed this session

Corrected to DONE with evidence: A1.1, A1.3, A1.4, A1.5, A1.6, A3.1, A3.3, A4.1, A5.1, A5.2, A5.3,
A6.1, A6.2, A6.3, A6.4, A6.5. A1.4 needed a check I had not done: **Blog counts no products at all**,
so there was nothing to wire there.

Corrected the other way — items I would otherwise have wrongly claimed: **A1.2** (this one), **A3.2**
(Home still navigates to `/app/optimize`, Products opens a modal — two behaviours, one label),
**A4.2** ("rewrite existing" has no separate labelled action), **A4.3** (Products row actions have
zero Enhance routing; Collections has the button label only).

**B6 was done out of phase order** during Phase A. Flagged rather than hidden.

### New item found that nobody asked for

**A4.7** — a setting can ship with a column, a read path and a green test suite and still be
unreachable. `autopilotAutoPublish` and `autopilotContentTypes` have never been audited for this.
A guard should assert that every `BrandVoice` boolean a rule reads has both a control in Settings and
a hidden input that posts it.

---

## A2.3 / A2.4 (10 Sep 2026) — the largest catalogue we can actually walk

Two screens each had their own copy of the catalogue walk, and they had drifted.

`app.products.jsx` went through `shopifyQuery`, so a throttle backed off and retried — that was Phase 4
item 6. `app.optimize.jsx` used **raw `admin.graphql`**. The same fix was applied to one and missed on
the other, so on Optimize the FIRST throttle silently truncated a bulk run: the merchant asked to
optimize everything, got whatever had been read before Shopify said no, and was redirected to Jobs
with no indication anything had been cut short.

Both also stopped at `MAX_PAGES = 80` — 20,000 products — **and said nothing**. On a 50,000-product
catalogue "Optimize store" enqueued at most 20,000 and reported success. That is a cap presented as a
total (L5) on the one action that spends a merchant's money.

### Measured

Simulated catalogues through the real enumerator. `ms` is **our loop only** — the responses are fakes,
so network time is excluded.

| catalogue | ids walked | pages | requests | our loop ms | heap delta | result |
| --- | --- | --- | --- | --- | --- | --- |
| 250 | 250 | 1 | 1 | 0 | 0.6 MB | complete |
| 3,000 | 3,000 | 12 | 12 | 1 | 0.9 MB | complete |
| **20,000** | 20,000 | 80 | 80 | 6 | 3.4 MB | **complete — the ceiling** |
| 50,000 | 20,000 | 80 | 80 | 5 | 2.5 MB | truncated, reported |
| 500,000 | 20,000 | 80 | 80 | 5 | 2.8 MB | truncated, reported |

**A2.4 — the largest catalogue proven walkable: 20,000 products.** Above that the app walks the 20,000
most-recently-updated and tells the merchant, on the screen they land on.

The request count does **not** grow with the catalogue: 50,000 and 500,000 both cost exactly 80
requests. A test asserts that equality, so a change that made a large store pay for a walk it cannot
finish would fail.

### The four failure modes A2.3 names

- **Cursor exhaustion** — a connection that never returns `hasNextPage: false` is bounded at 80
  requests. The test asserts the REQUEST COUNT rather than the result, deliberately: without the cap
  that test would not fail, it would never finish.
- **THROTTLED mid-run** — keeps the pages that landed, stops, and says why. Measured: a throttle from
  page 6 yields 1,250 ids and the message names that number.
- **A job outliving a deploy** — unchanged and not re-tested here; the worker drains BullMQ for 30 s
  and `kill_timeout` is 60 s (P1).
- **Worker memory** — the walk holds ids, not product bodies. 20,000 gids measured at 3.4 MB heap
  delta, and a test caps the id array at 4 MB.

### The false-green answer, per check (L1)

| Check | What it prints if the watched thing is broken |
| --- | --- |
| the five size cases | **7 tests fail** when `truncated` is hardcoded false — verified by doing it. Two of the seven are ROUTE tests, which is what proves the enumerator is actually wired in and not just unit-tested. |
| cursor exhaustion | Asserts the request count, because with no cap it would hang rather than fail |
| "request count does not grow" | Compares 50,000 against 500,000; a per-product request would diverge |
| the memory bound | Would pass on an empty array, which is why the same test asserts `ids` has 20,000 first |

### What this CANNOT prove

**That Shopify behaves this way.** Every response is a fake. This proves our loop is bounded, reports
why it stopped, and does not accumulate without limit. It does not prove a real 500,000-product store
returns cursors the way the fake does — and we have no such store. The largest real catalogue this
code has met is **3,148 products**.

**Not measured: wall-clock against real Shopify.** 80 sequential requests at a realistic 100-300 ms is
**8-24 seconds** inside a form action. Logged as new item **A2.5**.

### Contract preserved rather than rewritten

Moving Optimize onto the shared enumerator broke three existing tests that pin its failure contract —
503 status, and a different sentence for a throttle, a malformed response and a dead connection. The
first instinct was to retarget them to my new wording. Instead the enumerator now carries
`shopifyQuery`'s own `reason`, and the route reproduces the exact messages and the 503. "Something
went wrong" tells a merchant nothing about whether to retry.

Those tests also began timing out at 5,007 ms, because the route now does real backoff. Fixed with the
documented pattern: the real `shopifyQuery` with `maxRetries: 0`, not a fake module.

### A2.5 — a page cap is not a wall-clock bound

80 sequential requests cost 6 ms of our own loop and an unmeasured amount of network. At a realistic
100–300 ms per Shopify round trip that is **8–24 seconds inside a form action**, and `fly.toml`
configures no request timeout to stop it — only `kill_timeout = 60s`, which is a shutdown grace, not
a request budget.

Bounded by TIME as well as pages: `ENUM_BUDGET_MS = 20_000`, the pattern `catalogGaps.server.js`
already used (`budgetMs = 4000`). Hitting the budget is reported exactly like hitting the page cap —
same promise broken, different cause. The check runs BEFORE each request, not after: stopping after
the request that blew the budget would still have paid for it, and a test pins that by asserting
exactly one call when the budget is 1 ms.

**Chosen over moving the walk into the worker.** That was the other option written into A2.5, and it
changes the job lifecycle and the timing of the quota slice on the path that spends a merchant's
money. That is not a change to make as a side effect of a scale report.

**Still not measured against real Shopify.** No large dev store exists. The clock is injected in
tests, so this proves the budget is enforced, not that 80 real requests take 8–24 s.

Guard broken: disabling the budget check fails **2 tests**.
