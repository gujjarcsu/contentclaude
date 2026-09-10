# RUNBOOK — Navaal (contentclaude)

What to do when something is wrong. Written to be followed at 3am by someone who did not write the code.

Production is one Fly app, `contentclaude`, in `syd`, serving `https://app.navaal.ai`.
Database is Neon (pooled endpoint). Queue is Upstash Redis + BullMQ. Errors go to Sentry.

**First move, always:**

```
curl -s "https://app.navaal.ai/api/health?deep=1" | jq
```

That one call tells you which of database, Redis, the worker, the job queue and the AI circuit breaker is
unhappy, and which build is answering. `status` is `ok`, `degraded` (200, something non-fatal is off) or
`error` (503, the app cannot do its job).

---

## Rule 0 — how to set a secret

**Always `fly secrets import` from a file. Never `fly secrets set` on the command line.**

```
# write the value to a temp file, one KEY=VALUE per line, no quotes
printf 'DATABASE_URL=%s\n' 'postgresql://user:pw@host/db?...' > secret.env
fly secrets import -a contentclaude < secret.env
rm secret.env

# then immediately, because import restarts every machine:
curl -s "https://app.navaal.ai/api/health?deep=1"
```

**Why this rule exists — incident, 2026-09-09, roughly 12:15–12:35 UTC.**
`DATABASE_URL` was being changed to raise `connection_limit` from 1 to 5. It was set with
`fly secrets set` from Windows `cmd.exe`. The Neon password is URL-encoded and contains `%xx` sequences;
`cmd.exe` treats `%…%` as variable references and silently strips them. The secret was stored corrupted,
both machines restarted onto it, and Prisma could not connect. `/api/health` returned **503** with
`database: "error"` for about twenty minutes. Recovery was `fly secrets import` from a file, which does
no shell interpolation.

Two things made it worse than it needed to be, and both are fixed:
- **Nothing alerted.** There was no uptime monitor and no scheduled deep-health check, so the only way to
  learn about it was to look. Phase 1 item 5 exists because of this incident: an external uptime monitor
  on `/api/health` from two regions every 60 s, plus a 5-minute deep-health check that emails on 503.
  Either one would have caught this within a minute or two.
- **A restart is not free.** `fly secrets import`/`set` restarts every machine. That is safe for in-flight
  bulk jobs now (they resume — Phase 0 item 12), but it is still a restart: do it deliberately, and check
  health straight after rather than walking away.

Applies equally on PowerShell (`$` expansion) and any shell where the value contains `%`, `$`, `!`, `^`
or backticks. The file form has no such hazard.

---

## Rule 1 — never edit a migration that has already run

**New schema change, new file.** Prisma records migrations by NAME in `_prisma_migrations`. If the name
is already recorded, the file is skipped, whatever is now inside it.

So an edited migration means the statement never runs, `prisma migrate status` still says
**"Database schema is up to date!"** because it compares names, and the deploy ships code expecting a
column that does not exist. The first merchant to touch it gets a 500.

This caused an eight-hour outage on 2026-09-09 (below). CI now fails if any migration already on
`origin/main` is modified. The one legitimate exception, restoring a wrongly-edited migration, needs
`[migration-restore]` in the commit message and prints a warning.

Full detail and naming rules: `prisma/migrations/README.md`.

---

## `/api/health?deep=1` returns 503 with `schema.ok: false`

**The database is missing columns this build needs.** Every query touching them fails with
`P2022: column ... does not exist`, so the affected screens return 500 while everything else looks fine.

The response names them:

```json
"schema": { "ok": false, "missingColumns": 1, "missing": ["BrandVoice.publishWithoutReview"] }
```

**Almost always the cause is an edited migration** (Rule 1). Check it:

```bash
fly ssh console -a contentclaude -C "npx prisma migrate status"
# "up to date" here does NOT mean the schema is correct — it compares names.

# What actually ran, and how many statements each migration contained:
#   SELECT migration_name, applied_steps_count, finished_at
#   FROM _prisma_migrations ORDER BY started_at;
```

If a migration's `applied_steps_count` is smaller than the number of statements now in its file, that
file was edited after it was applied. That is the bug.

**To fix, in this order:**

1. **Stop the bleeding.** Apply the missing DDL by hand against production. It is a plain `ALTER TABLE`;
   run exactly the statement from the migration file.
2. **Then repair the repository**, or the next deploy re-creates the problem: restore the edited file to
   the content that actually ran, and move the new statements into a **new** migration using
   `ADD COLUMN IF NOT EXISTS`, so it is a no-op on production and a real change on a fresh database.
3. Commit the restore with `[migration-restore]` so CI's immutability guard lets it through, and say why.

---

## INCIDENT — 2026-09-09 → 10, ~8 hours: every `/app` load returned 500

**Merchant-facing window:** roughly 17:00 UTC on 2026-09-09 (the `6bff05d` deploy) to 00:53 UTC on
2026-09-10, when the column was added by hand.

**What merchants saw:** every `/app` page returned 500. The app was completely unusable. `/api/health`
reported `ok` throughout.

**Cause.** `20260910_geo_note_dismissed` was applied at 16:21:06 UTC containing one statement, the
`GrowthState.geoNoteDismissedAt` ALTER. The next commit **appended** the
`BrandVoice.publishWithoutReview` ALTER to that same, already-applied file. Prisma skipped it by name.
The code shipped expecting the column; the column did not exist.

**Why nothing caught it — three separate blind spots, all of them ours:**

1. `prisma migrate status` compares **names**, not columns, and said the schema was up to date.
2. `/api/health?deep=1`'s database check is `SELECT 1`, which needs no columns, so it reported `ok`.
3. The post-deploy smoke job and the five-minute `/app` probe both sent a **non-browser user-agent**.
   The Shopify library answers those with **410 Gone**, and both treated 410 as healthy. Neither ever
   reached a loader, so both would have passed with the app in any state at all.

**Sentry was the only thing that noticed**, and only because a person read it.

**What changed as a result:** the immutability rule above with a CI guard; a schema-drift check at
startup and in deep health that reports `error`; the smoke job asserting that check; and both the smoke
job and the operator probe now sending a real Chrome user-agent and treating **anything but 200 or 302
as a failure — 410 is never healthy**.

**The lesson, which is the same one the ESLint `--cache` incident taught:** a check that reports success
is not evidence of success. Ask what the check would do if the thing it watches were completely broken.
All three of these would have passed.

## Shopify's Dev Dashboard says webhooks are failing

Dev Dashboard → Monitoring shows a failure rate per topic and a response time. It does not show why, and
Fly's log retention will usually have rolled past the deliveries by the time anyone looks. So reproduce
them:

```bash
# Runs ON the machine — it signs with SHOPIFY_API_SECRET, which only exists there.
fly ssh console -a contentclaude --machine <started-web-machine> \
  -C "node /app/scripts/webhook-probe--writes-fake-shop-only.mjs"
```

It sends real HMAC-signed deliveries at a range of ages, plus the dedup and shop-mismatch cases, and
prints the status and time for each. It only ever addresses `navaal-webhook-probe.myshopify.com`, which
is not a real store, and refuses anything else — `app/uninstalled` and `shop/redact` delete everything
for the shop named in the `x-shopify-shop-domain` header, so a probe that can be pointed at a merchant
by editing one string is not acceptable. There is no override flag. Do not add one.

Read the output like this:

| What you see | What it means |
|---|---|
| Fresh 200, old 401 | An age/replay rule of ours is refusing Shopify's retries. This is what caused the 88.5% failure rate. |
| 2nd delivery of the same id is NOT `Duplicate` | The Redis dedup claim is not working; check `REDIS_URL` and `/api/health?deep=1`. |
| Mismatch case returns 200 | The payload/header shop cross-check has regressed. That is a security defect — a genuine body of ours could be replayed under another merchant's domain. |
| Everything 200 but slow | Work is happening before the response. See below. |

**Two rules this app must keep.**

1. **Never reject a delivery on its timestamp as a replay defence.** A retry *is* an old delivery.
   Shopify retries for ~48 h carrying the original `x-shopify-triggered-at`, so any window tight enough
   to stop a replay is tight enough to refuse a retry. Replay protection is the `x-shopify-webhook-id`
   dedup claim, which catches a replay on the first attempt. The age check exists only to bound how long
   the dedup store must remember, and `MAX_WEBHOOK_AGE_MS` and `DEDUP_TTL_SECONDS` are derived from one
   constant so they cannot drift apart. The mandatory GDPR topics skip the age check entirely.

2. **A webhook answers first and works afterwards.** Deletion is ~26 sequential queries even for an empty
   shop. Whatever runs before the 200 must be the smallest thing that leaves a durable marker saying the
   work is owed; the rest goes in `finishAfterResponse`. `sweepUnfinishedWebhookWork` (worker, every
   10 min) finishes anything a killed process left behind, and shutdown drains in-flight work first.
   If you add a webhook that deletes or writes a lot, follow that shape or it will time out one day.

**Checking that the deferred half is actually running:**

```bash
fly logs -a contentclaude --no-tail | grep -E "deferred|webhook_sweep|redaction_unfinished"
```

`Deferred webhook work finished` with an `ms` field is healthy. `Deferred webhook work failed — the sweep
will finish it` means look at the next sweep. `redaction_unfinished` or `uninstall_cleanup_unfinished`
means the sweep found owed work — expected occasionally after a deploy, a standing problem if repeated
for the same shop.

## Symptom → action

### `/api/health` returns 503 with `database: "error"`

The app cannot reach Neon. In order:

1. **Was a secret just changed?** `fly secrets list -a contentclaude` shows a `DIGEST` and a date per
   secret. If `DATABASE_URL` changed in the last few minutes, assume it is corrupted (see Rule 0) and
   re-import it from a file. This is the 2026-09-09 incident and is the most likely cause.
2. **Is Neon itself up?** https://neonstatus.com, and the Neon console for the project.
3. **Is the URL still the pooled endpoint?** It must contain `-pooler` and `pgbouncer=true`, with
   `connection_limit=5` for the web process. A non-pooled URL will exhaust Neon's own connection cap
   under load and produce intermittent, not total, failure.
4. Recovery is re-importing a known-good `DATABASE_URL`. There is no code fix; do not redeploy hoping.

**What the merchant sees:** every page fails. This is a total outage, so treat it as one.

### `/api/health` returns 503 with `queue.workerRunning: false`

The BullMQ worker is not running, so no bulk job will ever start. Every page still loads, which is why
this used to be invisible.

1. `fly logs -a contentclaude | grep -i "BullMQ worker"` — the worker logs `BullMQ worker started` at
   boot. If it is missing, the process failed to start it.
2. `REDIS_URL` unset in production is a **fatal boot error** by design (`startup.server.js`), so the app
   would not be up at all — check `fly secrets list` if the app is also failing to boot.
3. Restart the machine: `fly apps restart contentclaude`. Jobs stranded by the outage recover on their
   own within 15 minutes (`recoverStuckJobs`), and merchants can Resume without being charged twice.

### `/api/health` returns 503 with `jobs.stuckProcessing > 0`

Jobs are sitting in `processing` with nothing touching them for over ten minutes, which also means the
5-minute recovery loop is not running — so the process is up but wedged.

1. Check `queue.workerRunning` in the same response. If false, treat as the case above.
2. `fly logs -a contentclaude | grep -i "Recovering stuck"` — the recovery loop logs when it acts.
3. Restart the machine. On the next boot, `recoverStuckJobs` marks them failed with a message telling the
   merchant to Resume and that nothing already generated will be charged again.

### `status: "degraded"` with `redis: "degraded"`

Redis is unreachable. Pages still work — the cache falls back to an in-process Map — but **durable jobs
do not**: `enqueueGenerationJob` fails fast (5 s) and falls back to running the job inline in the web
process, which does not survive a restart.

1. Check Upstash status and the Upstash console for the database.
2. This is genuinely degraded, not down. Do not restart the app; it recovers by itself when Redis returns.
3. If it persists, tell merchants that bulk jobs are paused; single generations are unaffected.

### `status: "degraded"` with `aiCircuitBreaker.open: true`

Five consecutive Anthropic failures tripped the breaker; no shop can generate for up to 60 seconds. It
closes itself.

1. If it stays open, check https://status.anthropic.com.
2. Check `ANTHROPIC_API_KEY` is present and the account has credit — an auth failure or a hard quota stop
   looks like a run of failures.
3. A 429 does **not** trip the breaker (Phase 0 item 23), so an open breaker means real errors, not rate
   limiting.

### The app is up but a deploy broke `/app`

1. `curl -s https://app.navaal.ai/api/build-info` — is the SHA the one you expect?
2. Roll back: `fly releases list -a contentclaude` then `fly releases rollback <version> -a contentclaude`.
3. **If the bad release ran a database migration, roll the migration back first.** See
   `docs/DEPLOYMENT.md` for the migration rollback procedure. A rollback of the image alone, against a
   schema that has moved on, is how a bad hour becomes a bad day.
4. Then fix forward on `main`. Every push to `main` deploys.

### A merchant says they paid but the app shows Free

1. `fly ssh console -a contentclaude -C "node /app/scripts/shop-install-diag.cjs"` for the shop record.
2. The authoritative source is Shopify, not our database. The `app_subscriptions/update` webhook and the
   Plans page reconcile both re-query it; the plan corrects itself within seconds of either.
3. Phase 0 item 8 removed the three ways this used to happen for real (an unordered CANCELLED during an
   upgrade, the wrong payload id field, and a callback that read a GraphQL error as "no subscription").
   If it happens again, it is a new cause: capture the shop, the time, and `fly logs` around it.

### A GDPR or compliance webhook is failing

Shopify's webhook delivery page shows the response. All seven webhook routes verify HMAC directly and
never load a session, so an expired token cannot break them (Phase 0 items 1-3).
- **401** means the HMAC did not match, the payload names a different shop than the header, or the
  delivery is more than 24 hours old. The first is a real signature problem; check `SHOPIFY_API_SECRET`.
- **500** should not happen. If it does, Sentry has it.

---

## Restoring from a backup

Two mechanisms, and they answer different disasters. Use the first one unless you cannot.

### 1. Neon point-in-time restore — for "we broke the data"

A bad migration, a mistaken delete, a script that ran against the wrong shop. Neon can restore the whole
database to a moment in time, and it is far faster than replaying a dump.

1. Neon console → the project → **Branches** → **Create branch** → *from a point in time*.
2. Pick a timestamp a few minutes **before** the damage. Err earlier; you can always branch again.
3. This creates a **new branch**. Production is untouched. Look at the data first.
4. Compare against production before promoting anything:
   ```sql
   SELECT count(*) FROM "Shop";
   SELECT count(*) FROM "GeneratedContent";
   ```
5. Only then repoint the app, by importing the branch's pooled connection string as `DATABASE_URL`
   (Rule 0 — from a file), and check deep health immediately.

History retention is a project setting, and how far back you can go is exactly that number. Confirm it
in the console rather than trusting this file (HUMAN-NEEDED item 5).

### 2. The nightly R2 dump — for "we lost Neon"

PITR lives inside the Neon project. If the account, the billing or the provider is the problem, PITR is
gone with it. The nightly `pg_dump` goes to Cloudflare R2, a different company, at 03:00 Sydney under
`neondb/<date>/contentclaude-<timestamp>.dump`.

```bash
# 1. find the dump you want
aws s3 ls s3://navaal-backups/neondb/ --recursive \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# 2. fetch it
aws s3 cp "s3://navaal-backups/neondb/2026-09-09/contentclaude-....dump" ./restore.dump \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# 3. restore into a NEW, EMPTY database — never over production
pg_restore --no-owner --no-privileges -d "$TARGET_DATABASE_URL" ./restore.dump

# 4. prove it is complete
psql "$TARGET_DATABASE_URL" -c 'SELECT count(*) FROM "Shop";'
psql "$TARGET_DATABASE_URL" -c 'SELECT count(*) FROM "GeneratedContent";'
npx prisma migrate status    # with DATABASE_URL pointed at the restored database
```

`--no-owner --no-privileges` matters: the dump carries Neon's role names, and without those flags
`pg_restore` fails on every `ALTER ... OWNER TO` against a database with different roles.

### The drill

**Do this once, deliberately, before you need it.** An untested backup is a hope, not a backup.

Restore the most recent dump into a **new Neon branch** — not production — run the three commands in
step 4, and record the date and the row counts in `PROGRESS.md`. That is the whole drill, and it converts
"we have backups" into a fact. It is HUMAN-NEEDED item 7.

---

## `backup_not_configured` in the logs at 03:00 Sydney

Not an incident. R2 credentials are not set, so the backup refuses to run and **names each missing
piece** rather than reporting success. Set them per HUMAN-NEEDED item 6, from a file.

If instead you see `backup FAILED` by email, read the reason:

- **refusing to store an empty backup** — `pg_dump` produced under 1024 bytes. Almost always a bad
  `DATABASE_URL` or a missing `pg_dump` binary in the image. An empty file that uploads cleanly is the
  worst possible outcome, because it looks like a backup, which is why this refuses.
- **a non-2xx from R2** — the credential or the bucket name is wrong, or the token is not scoped to
  write. The status code is in the email.

---

## An alert arrived, or should have

The scheduled probe runs in the **worker** every five minutes against the public
`https://app.navaal.ai/api/health?deep=1`, deliberately over the public URL so it exercises DNS, TLS, the
Fly proxy and a web machine exactly as a merchant does.

- **On 503 or no answer it emails**, once on the way into trouble, then at most hourly, then once more
  when it recovers.
- **`degraded` does not alert straight away** — Redis briefly away and an open AI circuit breaker are
  states the app rides out, and paging on them teaches you to ignore the alerts. **But degraded that has
  not cleared after three consecutive probes (fifteen minutes) does alert**, with the subject
  `Navaal has been DEGRADED for 15 minutes`. Fifteen minutes is well past self-healing: an hour of the AI
  provider being down is an outage no matter which word the status field uses.
- **`/app` is probed separately, and a 5xx from it alerts on its own.** `/api/health` touches the
  database, Redis, the queue and the breaker — it renders no route, so it stays green while a broken
  deploy shows every merchant an error page. 200, 302 and 401 from `/app` are all healthy: it is an
  embedded route and an unauthenticated probe is meant to be redirected. Only 5xx is a fault. The email
  says to check `/api/build-info` and roll back, and it says to read the migration notes first.
- **With no `RESEND_API_KEY` nothing is silently dropped.** The alert is logged at **error** level with
  the full body and `event: "operator_alert_undeliverable"`, so it still reaches Sentry and `fly logs`.
  Check there before concluding nothing fired.

```bash
fly logs -a contentclaude | grep -E 'health_watch_bad|health_watch_recovered|operator_alert'
```

**If the app is completely gone, this probe is gone too** — it runs inside the same infrastructure. The
external uptime monitor (HUMAN-NEEDED item 3) is the only check that survives that, which is exactly why
it is on the list.

## The daily digest did not arrive

Due 07:00 Australia/Sydney, from the worker. In order:

1. `RESEND_API_KEY` set? Without it, look for `operator_alert_undeliverable` — the digest is in the log.
2. Was the worker alive at 07:00 Sydney? `/api/health?deep=1` → `queue.workerRunning`.
3. The day is claimed in Redis (`ops:digest:lastSentDay`) with `SET NX`, so a restart inside the hour
   sends nothing further. That is correct behaviour, not a fault.
4. `fly logs -a contentclaude | grep daily_digest`.

---

## Standing facts

- **Deploy = push to `main`.** `.github/workflows/ci.yml` runs lint, typecheck, tests and build, then
  `flyctl deploy`. **A CI failure means no deploy, silently** — always confirm with
  `/api/build-info` rather than assuming.
- **Never run `fly deploy` locally alongside a push**; the two race.
- Machines restart on every secret change and every deploy. In-flight jobs resume.
- `fly ssh console -a contentclaude -C "node /app/<script>.mjs"` runs a one-off script on the machine;
  upload it first with `MSYS_NO_PATHCONV=1 fly ssh sftp put <local> /app/<name>.mjs -a contentclaude`.
  Anything uploaded to `/app` is wiped by the next deploy.
- `Error: The handle is invalid.` after `fly ssh` output on Windows is cosmetic; the output above it is
  real.
