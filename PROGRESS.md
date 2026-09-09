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
