# RUNBOOK — the five 3 am failures, and what failure looks like from every side

*Phase 12 Part E, lines A4, A7 and A10. This is the one-page version for the person on call; the
long-form incident history and the secret-setting rules stay in `docs/RUNBOOK.md`. Each entry here
has been tried once — in a controlled break (a test that induces the failure and asserts what the
merchant and the owner see) or on a dev store — and names the try.*

**First move, always:**

```
curl -s "https://app.navaal.ai/api/health?deep=1" | jq
```

`status` is `ok`, `degraded` (200, something non-fatal is off) or `error` (503, the app cannot do its
job). The body names which of database, Redis, the worker, the job queue and the AI circuit breaker
is unhappy, and which build (`sha`) is answering. The daily digest (07:00 Sydney) and the deep-health
monitor (every minute; a red run emails the operator address after three consecutive failures) both
read the same endpoint, so if you were paged, this is what paged you.

**Second move, for anything that involves a merchant's store:** the read-only diags in Actions —
**Install state** (what the app believes about a shop versus what Shopify says), **Shop settings**,
**Funnel**, **First-run scores**. None writes to a store. A merchant's store is never touched by
hand; a dev store (`navaal-ttv-*`, `navaal-shape-*`) is where anything is tried.

---

## 1. Database down

**Symptoms.** `/api/health` returns 503 with `database: "error"`; every `/app` load 500s; Sentry
fills with `PrismaClientInitializationError` or `P1001`; the worker logs `database unreachable`.

**First command.**
```
curl -s "https://app.navaal.ai/api/health?deep=1" | jq '.database, .sha'
fly status -a contentclaude            # both web machines up? a restart loop points at the DB
```
Then the Neon console: is the project **suspended** (compute idle timeout), **over its limit**, or
is the pooled endpoint answering? `DATABASE_URL` in Fly secrets must be the *pooled* host.

**Recovery.** (1) Neon suspended → it resumes on the first connection; give it 30 s and re-curl.
(2) A corrupted `DATABASE_URL` (the 2026-09-09 incident: eight hours of 500s from a `%xx` stripped by
`cmd.exe`) → `fly secrets import < file`, never `set`; then `fly deploy --strategy immediate` is
NOT needed — secrets restart the machines. (3) Neon really down → status.neon.tech; nothing to do but
wait; the app is honest meanwhile (below). (4) Data damage → the restore drill, §6.

**What the merchant sees.** Every screen's loader catches the read and renders the honest fallback:
Home shows the lifetime record with *"catalogue join unavailable"* wording, never a zero; Products
says it could not read; generation is refused with a message, not queued. Nothing is silently
counted as zero (`tests/routes/health.deep.test.js` "503s when the database is unreachable, without
echoing the error"; `tests/routes/firstRun.test.js` "a failed Shop lookup degrades to the dashboard,
not to Start").

**Who is told.** The deep-health monitor emails the operator after three red minutes; the daily
digest carries it. **Tried:** the controlled break in `health.deep.test.js`, and for real on
2026-09-09 (`docs/RUNBOOK.md`, INCIDENT).

## 2. Redis down

**Symptoms.** `/api/health` is `degraded` with `redis: "degraded"` (200, not 503); "Start job"
answers within seconds with *"the queue is unavailable"* rather than hanging; the nightly jobs log
*"could not claim the day, running anyway"*.

**First command.**
```
curl -s "https://app.navaal.ai/api/health?deep=1" | jq '.redis, .queue'
```
Upstash console → the database's status and its request quota.

**Recovery.** Redis is a cache and a queue, never the record: the day-claims fall through to "run
anyway" (the scheduled jobs still fire; at worst a job runs on both machines), the caches miss (Shop
name, scan, catalogue join are re-read from Shopify and Postgres), and bulk jobs cannot be enqueued
until it returns — the merchant is told so. If Upstash is up but the app cannot reach it: rotate
`REDIS_URL` via `fly secrets import`.

**What the merchant sees.** Single generations work (they do not queue). Bulk: *"The job queue is
unavailable right now — nothing was started and nothing was charged."* Home and Products render from
the database. **Tried:** `tests/utils/jobRecovery.test.js` item 13 ("a Redis outage fails fast
instead of hanging Start job"), `tests/routes/health.deep.test.js` ("is degraded, not down, when
Redis is unreachable"), `tests/utils/scheduledWeek.test.js` (claims with no Redis).

## 3. AI provider down

**Symptoms.** `/api/health` is `degraded` with `aiCircuitBreaker.open: true`; generations return
*"AI service temporarily unavailable. The system will retry automatically in about a minute."*;
Sentry shows 5xx or timeouts from `api.anthropic.com`.

**First command.**
```
curl -s "https://app.navaal.ai/api/health?deep=1" | jq '.aiCircuitBreaker'
```
status.anthropic.com. A 429 is NOT this failure — it is rate-limiting, it does not open the breaker,
and it waits out `Retry-After` (capped for merchant-facing calls).

**Recovery.** Nothing to do by hand: the breaker opens after five consecutive failures and closes
itself after sixty seconds; bulk jobs pause on the breaker and resume; no credit is charged for a
failed call. If Anthropic is up and the breaker keeps re-opening, the key is the suspect: a
merchant's own key that 401s is paused for that merchant and they are told (`BYOK_PAUSED_MESSAGE`);
our key → `ANTHROPIC_API_KEY` via `fly secrets import`.

**What the merchant sees.** The sentence above on the product page and in the bulk job's status —
never an empty draft, never a charge. **Tried:** `tests/utils/circuitBreaker.test.js` ("opens after
5 consecutive failures", "auto-closes after the 60-second cooldown"), `tests/utils/aiResilience.test.js`
(429 does not trip the breaker; the wait is capped; one retry on a network error),
`tests/utils/byok.test.js` (a 401 pauses the merchant's key and says so).

## 4. Shopify rejects our API version

**Symptoms.** Every Shopify read returns 4xx with a body naming the version (Shopify retires each
version twelve months after release; ours is `2026-04`, retired **2027-04-01**, and
`tests/utils/clocks.test.js` goes red 90 days before). Home shows the lifetime record with the
"could not read" wording; Products shows a banner; the nightly walk skips every shop and says so.

**First command.**
```
curl -s "https://app.navaal.ai/api/health?deep=1" | jq '.sha'
grep -n "ApiVersion\." app/shopify.server.js
```

**Recovery.** Bump `ApiVersion` in `app/shopify.server.js`, `API_VERSION` in
`catalogueWatch.server.js` and `INSTALL_PROBE_API_VERSION` in `installState.server.js` to the current
version; `npm run test`; push (a push is a deploy); release an app version if `shopify.app.toml`
changed. Then run **Catalogue watch** and **First-run scores** on a dev store to see reads work.

**What the merchant sees.** A truthful "we could not read your catalogue just now" on every screen
that reads, never a zero and never an empty catalogue presented as real (`shopifyQuery` returns
`ok: false` on a top-level error; `productsPage` yields no edges with `ok: false`; the screens
branch on it — `tests/utils/shopifyQuery.test.js`, `tests/utils/candidatesServer.test.js`,
`tests/utils/failureModes.test.js` "a rejected API version is a read failure the merchant is told
about"). **Tried:** the controlled break in `failureModes.test.js`.

## 5. A merchant reports wrong content published

**Symptoms.** A support request (Get help → `SupportRequest` row, emailed to the operator) or a
review saying the app changed a product wrongly.

**First command.** In Actions, **Shop settings** for the domain (read-only) to see the brand voice
and language the writer was given; then in the app, the product's page: every published field has
**Restore original** (`ContentVersion` keeps the pre-publish value of every field the app wrote).

**Recovery.** (1) Ask the merchant to press Restore original on the product, or do it for them only
with their written say-so on a screen-share — the app never writes to a merchant's store by hand.
(2) If the wrong content is the LANGUAGE (Phase 12 A5: a French store written in English), Settings
now warns when the setting disagrees with the store's own copy; fix the setting, regenerate, review.
(3) If the content violated a standing claim (a certification, a warranty), `standingClaims.js` is
the guard that should have kept it; file it as a defect with the product and the draft.
(4) Never publish a correction on the merchant's behalf.

**What the merchant sees.** Restore original puts the previous value back on Shopify and the row
reads *"restored"*; the FAQ metafield and the alt text are restored with it. **Tried:**
`tests/routes/restoreOriginal.test.js` (the restore path, every field, and that a restore never
re-charges), and on `navaal-ttv-03` through `tools/proof/` (publish one draft, restore it, read the
product back).

---

## 6. The restore drill (line A4) — the procedure, and its status

**Status: NOT YET EXECUTED.** The point-in-time restore needs the Neon project's API key or console
access, which this session does not have. It is the owner's single step in `OWNER-CHECKLIST.md`;
line A4 stays unticked until it has been run once and timed. What a second person does, verbatim:

1. Neon console → the project → **Restore** → *Point in time* → choose a moment inside the last 24 h
   → restore **to a new branch** named `drill-YYYY-MM-DD` (never the main branch). Note the time
   the button was pressed.
2. Take the new branch's pooled connection string (never paste it anywhere but the shell variable).
3. From a machine with the repo: `DATABASE_URL=<branch> node scripts/schema-check.mjs` — expect
   `schema.ok: true` and the same column count `/api/build-info` deep health reports for production
   (326 at `f974f49`; the number in the health line is the truth).
4. Row counts against production, both from the branch and from the pooled production URL, read-only:
   `DATABASE_URL=<x> node -e "..."` for `Shop`, `Session`, `GeneratedContent`, `Plan`,
   `UsageRecord` — the branch counts must be ≤ production's and within the last 24 h of writes.
5. Note the time the branch became queryable. **The drill number is minutes from step 1 to step 4.**
6. Delete the branch. Write the date, the number and the counts into this section and tick A4.

The nightly R2 dump (`docs/RUNBOOK.md` §Restoring from a backup) is the second path and is exercised
by the backup job's own verification; it is not this drill.

---

## 7. Every failure, broken on purpose (line A7)

| Failure | What the merchant sees | What the owner is told | Recovery | Broken on purpose in |
|---|---|---|---|---|
| AI provider down | *"AI service temporarily unavailable. The system will retry automatically in about a minute."* — no draft, no charge | deep health `degraded`, breaker open | breaker closes itself in 60 s | `circuitBreaker.test.js`, `aiResilience.test.js` |
| Queue worker dead | "Start job" queues; the deep check 503s; stuck jobs are failed with *"resume will not re-charge"* | deep health 503 `workerRunning: false` → monitor email | Fly restarts the worker; `jobRecovery` re-queues | `health.deep.test.js` ("503s when the worker is dead"), `jobRecovery.test.js` |
| Shopify 429 | the read or publish waits out `Retry-After` and then succeeds, or reports *"Shopify is rate-limiting this store right now"* | log line, no alert (transient) | none | `adminGraphql.publish.test.js` ("honours Retry-After on 429"), `shopifyQuery.test.js` |
| Shopify 5xx / network | *"we could not read your catalogue just now"*; a publish is reported failed, never verified | log line; three in a row → digest | retry on the next load | `adminGraphql.publish.test.js` ("retries a thrown network error, then returns it as data"), `failureModes.test.js` |
| Revoked token | the shop is probed (`shop { name }`), refused → the install state is reconciled; a request from the merchant re-authenticates by token exchange | `install_state_contradicted_reverse` log; nightly count | the next visit re-installs; no deletion on a 401 | `installState.test.js`, `failureModes.test.js` |
| Expired trial | the gate denies a generation with the plan sentence and the upgrade path; nothing queued, nothing charged | none (expected) | the merchant subscribes | `billingConfig.test.js`, `failureModes.test.js` |
| Failed webhook delivery | nothing — Shopify retries for ~48 h and every retry is accepted (no age refusal on compliance topics); a duplicate is a 200 | Dev Dashboard delivery % (CW reads it) | none | `webhookRetryWindow.test.js`, `webhookWork.test.js` (the sweep finishes owed work) |
| Redis down | bulk: *"the job queue is unavailable"*; single generations work; caches miss | deep health `degraded` | Upstash back → nothing to do | `jobRecovery.test.js` item 13, `health.deep.test.js`, `scheduledWeek.test.js` |
| Database down | every loader's honest fallback; no zero invented | deep health 503 → monitor email; digest | Neon resumes / `fly secrets import` | `health.deep.test.js`, `firstRun.test.js` ("a failed Shop lookup degrades") |
| An old redact request meets a new install (#17) | nothing — the request is superseded, consumed, logged | `redaction_superseded` log | none | `webhookWork.test.js` (Phase 11 Part A) |

---

## 8. When a store "has no row" — read this before touching anything (false green #17)

A merchant's store that serves every screen and has no `Shop` row, or a row flagged uninstalled
while Shopify's Apps page says Installed, was the redact loop: an old `shop/redact` re-applied to
every new install of the same domain. Since `cd96240` that cannot recur (the request is consumed
once; a request older than the current install is superseded; the sweep and both webhooks ask
Shopify's token before acting). If you ever see the pattern again: run **Install state** for the
domain, read the LogEvent timeline it prints, and do not uninstall or reinstall the store — that
destroys the only live evidence. The domain is not the shop; the install is.
