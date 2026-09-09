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
