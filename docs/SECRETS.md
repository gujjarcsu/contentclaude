# SECRETS — Navaal (`contentclaude`)

Every secret and environment variable this app reads, where it is set, what happens without it, and how
to rotate it.

**No secret values appear in this file, and none ever should.** This is an inventory of names.

---

## Rule 0 — how to set a secret

```bash
# 1. write the value to a file, one KEY=VALUE per line, no quotes around the value
printf 'KEY=%s\n' 'the-value' > s.env

# 2. import the file
fly secrets import -a contentclaude < s.env

# 3. delete the file
rm s.env

# 4. immediately check, because import restarts every machine
curl -s 'https://app.navaal.ai/api/health?deep=1'
```

**Never `fly secrets set KEY=value` on a command line.** On 2026-09-09 that command, run from Windows
`cmd.exe`, silently corrupted `DATABASE_URL`: the password is URL-encoded, `cmd` reads `%xx` as a variable
reference and strips it. Both machines restarted onto the broken value and production returned 503 for
twenty minutes. The full incident is in `docs/RUNBOOK.md`.

The same trap exists in PowerShell (`$`), in bash (`$`, backticks, `!` under history expansion) and in
any shell with history. A file has no shell.

To check what exists without revealing anything:

```bash
fly secrets list -a contentclaude    # names and digests only, never values
```

---

## Required — the app does not work without these

| Name | What it is | Without it |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** connection string, `?pgbouncer=true&connection_limit=5` | Nothing works. `/api/health` is 503 with `database: "error"`. |
| `SHOPIFY_API_KEY` | Client ID from the Partner Dashboard | No merchant can authenticate. |
| `SHOPIFY_API_SECRET` | Client secret. **Also verifies every webhook HMAC.** | Auth fails, and webhooks would be unverifiable, so they are rejected. |
| `SHOPIFY_APP_URL` | `https://app.navaal.ai` | OAuth redirects and the scheduled health check point at the wrong place. |
| `SCOPES` | `write_products,write_content` | Scope mismatch on install. Must match `shopify.app.toml`. |
| `ANTHROPIC_API_KEY` | Anthropic API key | Every generation fails. The circuit breaker opens and the failure is surfaced to the merchant, not swallowed. |

### `DATABASE_URL` in detail

It must be the **pooled** endpoint — hostname containing `-pooler`, with `pgbouncer=true` — and it must
carry `connection_limit=5`. Startup checks both and warns loudly if either is missing.

`connection_limit=1` was the old advice and it is actively harmful: quota consumption holds a SERIALIZABLE
transaction while every web request and every worker slot queue behind the single connection, which
surfaces to merchants as "Timed out fetching a new connection from the pool" under quite ordinary load.

---

## Optional — the app runs without these, and says so

| Name | What it is | Without it |
|---|---|---|
| `REDIS_URL` | Upstash Redis, for BullMQ | The queue falls back to **inline** processing. Bulk runs happen in the request, and `workerRunning` is reported honestly as false. |
| `SENTRY_DSN` | Sentry project DSN | Errors reach `fly logs` only. Startup warns in production. |
| `RESEND_API_KEY` | Resend API key, for operator email | Alerts and the daily digest are logged at **error** level with the full body (`operator_alert_undeliverable`), so they reach Sentry and the logs — but no inbox. |
| `WORKER_DATABASE_URL` | The same pooled string with `connection_limit=3`, used **only** by the process that runs jobs | The worker uses `DATABASE_URL`, so both processes claim the same pool size. Nothing breaks; the budget is just less precise. |
| `DIRECT_URL` | Neon **unpooled** endpoint, for migrations | `prisma migrate deploy` cannot take its advisory lock through pgbouncer. Currently worked around with `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK`. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2, for the nightly `pg_dump` | The backup logs `backup_not_configured` and **names each missing piece**. It never pretends to have run. |
| `OPERATOR_EMAIL`, `OPERATOR_EMAIL_FROM` | Override the alert recipient and sender | Defaults to `hello@navaal.ai` and `Navaal Ops <ops@navaal.ai>`. |
| `BILLING_TEST_OVERRIDE` | Forces Shopify billing test mode on or off | Test mode follows `NODE_ENV`, so production charges are live. **This is not set in production and must not be.** |
| `SHOPIFY_APP_HANDLE` | The App Store handle used to build admin deep links | Falls back to `navaal-seo-geo-content`, which is the live handle. Only matters if the handle changes. |
| `SENTRY_ENVIRONMENT` | Labels Sentry issues | Falls back to `NODE_ENV`. |
| `SHOP_CUSTOM_DOMAIN` | Adds a custom shop domain to the Shopify SDK's allow-list, for local work against a non-`myshopify.com` host | Nothing. It is a development convenience and is **not set in production**. |

---

## Set in `fly.toml`, not as secrets

These are not sensitive and live in `[env]` so they are visible in review:

`NODE_ENV=production`, `LOG_LEVEL=info`, `PORT=3000`.

`PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` used to be listed here. It is gone from
`fly.toml` — `DIRECT_URL` made it unnecessary — and this line stayed behind for
a while because the docs test only checks one direction: every variable the code
READS must be documented, but a documented variable that no longer exists
anywhere raises nothing. Worth knowing before trusting this file as an inventory.

## Optional tuning knobs (defaults are in the code)

| Variable | Default | What it does |
| --- | --- | --- |
| `WEB_DRAIN_MS` | `15000` | How long a **web** machine waits after SIGTERM for requests that are already running, before the process exits. Fly cordons the machine first, so nothing new arrives during the wait. Must stay below `kill_timeout` in `fly.toml` (60 s), or Fly SIGKILLs and the wait achieves nothing. |

---

## Provided by the platform

Never set these; Fly and CI provide them.

`FLY_PROCESS_GROUP` (decides `web` or `worker`), `FLY_MACHINE_ID`, `FLY_REGION`,
`GIT_SHA` (baked into the image by CI as a build arg, served by `/api/build-info`),
`RUN_WORKER` (set by `worker.js` itself).

---

## Tuning knobs

Defaults are correct; change one only with a reason.

`BULLMQ_CONCURRENCY` (jobs at once, default 3 — must stay under the worker's connection limit),
`BULK_THROTTLE_MS` (delay between products in a bulk run).

---

## Rotation

The order matters. Fly restarts every machine on import, so a new value is live within about a minute.

| Secret | How |
|---|---|
| `ANTHROPIC_API_KEY` | Create a new key in the Anthropic console, import it, verify a generation succeeds, **then** revoke the old key. |
| `SHOPIFY_API_SECRET` | Rotate in the Partner Dashboard and import in the same sitting. In between, **webhook verification fails and OAuth fails** — this is the one with a real window of breakage, so do it deliberately, not casually. |
| `DATABASE_URL` | Reset the Neon role password, take the **pooled** string, re-add `?pgbouncer=true&connection_limit=5`, import from a file, check deep health. This is the exact operation that broke production on 2026-09-09. |
| `REDIS_URL` | Rotate in Upstash and import. In-flight jobs recover through boot recovery; the queue is not lost. |
| `RESEND_API_KEY` | Rotate in Resend and import. Failure mode is silence in an inbox, so verify by looking for `operator_alert_sent` in `fly logs`. |
| R2 credentials | Create a new scoped token, import all four values in one file, wait for the next 03:00 Sydney run and confirm `backup_ok`, then delete the old token. |
| `SENTRY_DSN` | Rotate in Sentry and import. Verify a new issue arrives. |

After **any** rotation:

```bash
curl -s 'https://app.navaal.ai/api/health?deep=1'
fly logs -a contentclaude | grep -E 'Startup complete|STARTUP'
```

If deep health is not `ok` or `degraded`, assume the value is wrong rather than the service. Re-import
the previous value from a file. That is the fastest recovery, and it is what worked on 2026-09-09.

---

## Never in the repo

`.env` is gitignored and must stay that way. The saved admin session used by the proof harnesses lives in
`tests/e2e/.auth/shopify.json`, is gitignored, and is regenerated by a human running
`node scripts/login-cdp.mjs` — no agent ever types those credentials.
