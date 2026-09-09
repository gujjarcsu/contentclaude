# DEPLOYMENT — Navaal (`contentclaude`)

How this app is actually deployed. Not how it could be.

> **Everything here was rewritten on 2026-09-09** (Phase 1 item 8). The previous version recommended
> Railway, described a migration flow that did not exist, told you to edit `BILLING_TEST` in source
> before submitting to the App Store, listed scopes the app does not request, and said there was no
> health endpoint. All four were wrong, and each would have cost someone an afternoon. If you find
> something here that does not match reality, fix this file in the same commit — a deployment guide that
> drifts is worse than none, because people trust it.

Companion documents:

- **`docs/ARCHITECTURE.md`** — what the pieces are and how a request flows through them.
- **`docs/SECRETS.md`** — every secret by name, where it is set, and how to rotate it.
- **`docs/RUNBOOK.md`** — what to do when something is broken. Read Rule 0 before touching a secret.

---

## The short version

The app runs on **Fly.io**, app name `contentclaude`, primary region `syd`. Deploys happen **only** by
pushing to `main`; GitHub Actions runs the gates and then `fly deploy`.

```bash
git push origin main     # this is the deploy
```

There is no manual deploy step in normal operation. Do not run `fly deploy` from a laptop while a push is
in flight — two deploys racing is how a release ends up half-applied.

---

## The stack, and where each piece lives

| Piece | What | Where |
|---|---|---|
| Host | Fly.io app `contentclaude` | `syd` |
| Processes | `web` (HTTP) and `worker` (jobs) | separate machines |
| Database | Neon Postgres, **pooled** endpoint, `connection_limit=5` | `syd` |
| Queue | Upstash Redis + BullMQ | `syd` |
| AI | Anthropic API | — |
| Errors | Sentry | — |
| Alert email | Resend | — |
| Backups | Cloudflare R2, nightly `pg_dump` | — |
| Custom domain | `app.navaal.ai` | — |

Sydney is not an arbitrary choice: the database, the queue and the app are all in one region, so a query
is a local round trip. See the note on two-region web at the end of this file.

---

## Processes

`fly.toml` defines two process groups. This matters more than it looks:

```toml
[processes]
  web    = "npm run start"   # react-router-serve; serves the embedded admin
  worker = "node worker.js"  # BullMQ worker, scheduler, nightly backup. No HTTP.
```

- `[http_service]` is bound to `processes = ["web"]`, so **no request can reach the worker**.
- The worker is `shared-cpu-2x` / 1 GB with `auto_stop_machines = "off"` and 512 MB of swap. A stopped
  worker is a queue nobody drains, and a bulk run holds a product, its images and the model response at
  once, so it needs somewhere to spill rather than being OOM-killed mid-job.
- `kill_timeout = "60s"`. Fly's default is **five seconds**, and the graceful shutdown drains BullMQ for
  up to thirty, so the default hard-killed a running job on every single deploy.
- Which role a process has is read from `FLY_PROCESS_GROUP` in `app/utils/processRole.server.js`. Locally,
  with no process group set, one process does both — you do not have to start two things to develop.

**Deploying web does not restart the worker.** That is the entire point of the split, and it is proven:
see the version table under Phase 1 item 2 in `PROGRESS.md`.

---

## Migrations

`release_command = "npx prisma migrate deploy"` runs before the new release goes live. If it fails, the
release fails and Fly keeps serving the previous version — which is correct.

- Migrations live in `prisma/migrations/`. The baseline is `0_init`, generated from the live schema with
  `prisma migrate diff --from-empty` and marked applied with `prisma migrate resolve --applied 0_init`.
- **Never run `prisma db push` against production.** It diffs and applies whatever it decides, with no
  history and no way back. A column rename becomes a drop and an add.
- Rollback is documented in `prisma/migrations/README.md`. The short form: **the migration rolls back
  before the image.** `fly releases rollback` restores the code but leaves the new schema in place.

There is one temporary override: `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = "true"` in `fly.toml`. Prisma
takes a Postgres advisory lock before migrating, advisory locks are per-connection, and Neon's pgbouncer
in transaction mode does not keep a connection sticky — so the lock could never be taken and the deploy
aborted with `P1002`. The proper fix is a `directUrl` on an unpooled endpoint. It is HUMAN-NEEDED item 1,
and the override is safe only while there are no pending migrations.

---

## CI, and what it will stop

`.github/workflows/ci.yml`, on push to `main`:

1. `npm ci`
2. `npm run lint` — **blocking**
3. `npm run typecheck` — **blocking** since Phase 1 item 4
4. `npx vitest run` — **blocking**
5. `npm audit` — informative, never blocking, deliberately: it fails on transitive advisories nobody can
   act on that day, and a gate everyone learns to ignore is worse than no gate
6. `npm run build`
7. `fly deploy` with the pushed commit baked in as `GIT_SHA`
8. **`smoke`** — after the deploy, and it fails loudly:
   - `/api/build-info` `sha` equals the pushed commit, so a deploy that silently did not land is caught
   - `/api/health?deep=1` is not `error`, **and reports `workerRunning: true`**
   - `GET /` returns 302 to `/reembed`
   - `HEAD /app` is not 5xx

**Concurrency:** pull-request runs cancel each other. Pushes to `main` **queue** rather than cancelling.
Cancelling a deploy mid-flight can leave a release half-applied, and now that the release command runs
migrations, it can leave a migration half-applied.

### A trap that has already cost a deploy

`npm run lint` uses `--cache`. A cached pass is not a pass — ESLint will report clean on files it has
already seen while a new error sits in one of them. Before a commit you intend to push:

```bash
rm -rf node_modules/.cache/eslint && npm run lint
```

Group 0.D shipped three lint errors this way and turned CI red.

---

## Verifying a deploy

```bash
curl -s https://app.navaal.ai/api/build-info            # sha must match what you pushed
curl -s 'https://app.navaal.ai/api/health?deep=1'       # status ok|degraded, workerRunning true
fly status -a contentclaude                             # both groups, versions
fly logs -a contentclaude | grep 'Startup complete'     # one line per machine, with its role
```

`status: "degraded"` is not a failure. Redis briefly away and an open AI circuit breaker are both states
the app is designed to ride out. `status: "error"` means a 503, and means go to `docs/RUNBOOK.md`.

---

## Secrets

Set with `fly secrets import`, from a file, **never** `fly secrets set` on a command line:

```bash
printf 'KEY=%s\n' 'value' > s.env
fly secrets import -a contentclaude < s.env && rm s.env
curl -s 'https://app.navaal.ai/api/health?deep=1'   # import restarts every machine
```

On 2026-09-09 a `fly secrets set` from Windows `cmd.exe` corrupted `DATABASE_URL` — `cmd` reads the `%xx`
of a URL-encoded password as variable references and strips them — and took production down for twenty
minutes. The full incident is in `docs/RUNBOOK.md` and `PROGRESS.md`. The inventory, with rotation steps,
is in `docs/SECRETS.md`.

---

## Shopify configuration

`shopify.app.toml` is the source of truth. It is **not** auto-updated from a dev tunnel
(`automatically_update_urls_on_dev = false`) — one `shopify app dev` run would otherwise repoint
`application_url` at a temporary tunnel and break every production install.

- **Scopes:** `write_products,write_content`. That is all. (An older version of this file listed
  `write_metaobjects` and `write_metaobject_definitions`, which the app does not use and startup warns
  about.)
- **Webhooks** are declared in that file and registered by the CLI, including the three mandatory
  compliance topics. They are not registered by hand in the Partner Dashboard.
- **App proxy** serves the GEO files at `https://<shop>/apps/navaal/llms.txt`.

Pushing a change to `shopify.app.toml` — the app name, scopes, webhooks, proxy — needs the Shopify CLI
and a Partner login, so it is a **human step**:

```bash
npm run deploy    # shopify app deploy
```

This is separate from and unrelated to the Fly deploy.

### Billing test mode

There is **no source edit** before release. `BILLING_TEST` is derived from `NODE_ENV`, with a
`BILLING_TEST_OVERRIDE` secret for deliberate testing. Production has no override set, so live charges
are live. Do not add one and forget it.

---

## Local development

```bash
npm install
cp .env.example .env      # fill in the Shopify + Anthropic keys
npx prisma migrate dev
npm run dev               # shopify app dev
```

With no `FLY_PROCESS_GROUP`, the single local process runs both web and worker, so jobs drain without a
second terminal. With no `REDIS_URL`, the queue falls back to inline processing.

**Postgres only.** The schema has been Postgres for a long time; `prisma/schema.prisma` says so, and
switching the provider to SQLite for convenience produces a schema that cannot be migrated back.

---

## Scaling: what is done, and what is next

Everything the old version of this file listed under "500+ shops" is done — Redis-backed BullMQ, a
dedicated worker process, pooled connections, Sentry, rate-limit handling with a circuit breaker.

The next real step is **two-region web** (`iad` alongside `syd`), and it is deliberately **not** done.
A US web machine would cut roughly 200 ms of network latency and then pay roughly 200 ms **per database
query** crossing the Pacific, which for a page making four sequential queries is a straight loss. Two
regions is worth doing after the database is regional — a Neon read replica in `iad`, or a move — and not
before.
