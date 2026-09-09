# HUMAN-NEEDED

Things only a human with the right logins can do. Each item says what, why, and the exact command or
click path. When one is done it moves to **Done** with the date and how it was confirmed — the record of
what was required is worth keeping.

**Setting a secret: always `fly secrets import`, never `fly secrets set`.** See the 2026-09-09 incident
in `docs/RUNBOOK.md`. A URL-encoded password contains `%xx` sequences, and Windows `cmd.exe` treats those
as variable references and strips them, so `secrets set` on the command line silently corrupts the value
and restarts both machines onto it.

## Open

Every one of these needs a credential, an account, or a decision the agent cannot
make. The code for each is already shipped and degrades honestly without it —
nothing here fails silently.

### 1. `DIRECT_URL` — unblock real migrations (Phase 1 item 1)
- **Why:** `prisma migrate deploy` takes a Postgres advisory lock, and advisory locks do not survive
  pgbouncer's transaction pooling, so the release command failed with `P1002 ... Timed out trying to
  acquire a postgres advisory lock` and aborted the deploy. It is currently unblocked with
  `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=true` in `fly.toml`, which is safe **only while there are no
  pending migrations** — the command is then a read of `_prisma_migrations`. Before the first real
  migration, migrations need a direct (unpooled) connection.
- **Steps:**
  1. Neon console → the project → Connection string → choose the **direct** (non-pooled) endpoint. It is
     the same host without `-pooler`.
  2. ```
     printf 'DIRECT_URL=%s\n' 'postgresql://…direct-host…/neondb?sslmode=require' > s.env
     fly secrets import -a contentclaude < s.env && rm s.env
     ```
     (**Never** `fly secrets set` — see Rule 0 in `docs/RUNBOOK.md`.)
  3. Tell me, and I will add `directUrl = env("DIRECT_URL")` to the datasource and remove the
     advisory-lock override in the same commit.

### 2. `WORKER_DATABASE_URL` — the worker's own connection budget (Phase 1 item 2)
- **Why:** web and worker are now separate machines, and each keeps its own Prisma pool. Web is on
  `connection_limit=5`. The worker runs three jobs at once and holds a connection for the length of a
  generation, so it wants 3 — the two processes together then stay inside Neon's ceiling instead of each
  claiming five. Fly has no per-process-group secrets, so the worker's string is a separate secret and
  `app/db.server.js` picks it only when the process runs jobs. **Without it nothing breaks**: the worker
  falls back to `DATABASE_URL`, which is the behaviour today.
- **Steps:** take the current pooled URL and change only the connection limit.
  ```
  fly ssh console -a contentclaude -C 'printenv DATABASE_URL'   # copy this exactly
  # same string, connection_limit=5 -> connection_limit=3
  printf 'WORKER_DATABASE_URL=%s\n' 'postgresql://…&connection_limit=3' > s.env
  fly secrets import -a contentclaude < s.env && rm s.env
  ```
  **Never** `fly secrets set` — the password is URL-encoded, and `%xx` is what corrupted production on
  2026-09-09 (Rule 0 in `docs/RUNBOOK.md`). Write the file, import the file, delete the file.
- **Verify:** immediately after the machines restart —
  ```
  curl -s 'https://app.navaal.ai/api/health?deep=1' | head -c 400
  fly logs -a contentclaude | grep 'Startup complete'
  ```
  The worker's line must read `"dbUrlSource":"WORKER_DATABASE_URL"` and the web line
  `"dbUrlSource":"DATABASE_URL"`. If deep health is anything but `ok`/`degraded`, the string is wrong:
  re-import the old one from a file.

### 3. Uptime monitor from two regions (Phase 1 item 5)
- **Why:** this is the gap the 2026-09-09 incident exposed. A five-minute in-app check now exists and
  emails on failure, but it runs *inside* the same infrastructure — if Fly itself is unreachable, the
  thing that would tell you is also unreachable. An external monitor is the only check that survives the
  app being completely gone.
- **Steps:** Better Stack or UptimeRobot, free tier is enough.
  - URL `https://app.navaal.ai/api/health`, every **60 s**, from at least **two** regions (one US, one
    AU — most merchants are US, the app is in Sydney).
  - Alert after **2 consecutive failures**, to `hello@navaal.ai`.
  - Optional second monitor on `https://app.navaal.ai/api/health?deep=1` expecting the body to contain
    `"status":"ok"` — that one catches a dead worker, which the shallow check deliberately does not.

### 4. `RESEND_API_KEY` — let the alerts actually leave the building (Phase 1 item 5)
- **Why:** the health watch and the daily digest are written and running. Without an email provider they
  log at **error** level with the full message body, so the alert still reaches Sentry and the logs — but
  nothing arrives in an inbox, which is the point.
- **Steps:** resend.com → verify the `navaal.ai` domain (DNS records) → create an API key →
  ```
  printf 'RESEND_API_KEY=%s\n' 're_…' > s.env
  fly secrets import -a contentclaude < s.env && rm s.env
  ```
  Sender defaults to `Navaal Ops <ops@navaal.ai>` and recipient to `hello@navaal.ai`; both are
  overridable with `OPERATOR_EMAIL_FROM` and `OPERATOR_EMAIL`.
- **Verify:** the next digest at 07:00 Sydney should arrive. To test sooner, look for
  `operator_alert_sent` in `fly logs`.

### 5. Neon point-in-time restore, 7 days (Phase 1 item 7)
- **Why:** first line of defence for a bad migration or a mistaken delete, and much faster than restoring
  a dump.
- **Steps:** Neon console → project → Settings → **History retention** → set to **7 days**. On the free
  tier this may cap lower; if so, note the actual number here so the runbook stops promising seven.

### 6. R2 bucket and credentials for the nightly backup (Phase 1 item 7)
- **Why:** Neon PITR does not protect against losing access to the Neon project itself — billing, account
  or provider problems. A backup inside the thing it is backing up is not a backup. One `pg_dump` a night
  goes to Cloudflare R2, which is a different company.
- **Steps:** Cloudflare dashboard → R2 → create bucket `navaal-backups` → **Manage API tokens** → create
  a token scoped to *Object Read & Write* on that bucket only. Then:
  ```
  cat > s.env <<'EOF'
  R2_ACCOUNT_ID=…
  R2_ACCESS_KEY_ID=…
  R2_SECRET_ACCESS_KEY=…
  R2_BUCKET=navaal-backups
  EOF
  fly secrets import -a contentclaude < s.env && rm s.env
  ```
  Add a lifecycle rule on the bucket to expire objects after **30 days**.
- **Verify:** at 03:00 Sydney the worker logs `backup_ok` with a key and a byte count. Until the secrets
  exist it logs `backup_not_configured` and lists exactly what is missing.

### 7. Run the restore drill once (Phase 1 item 7)
- **Why:** an untested backup is a hope. This is the only item here that cannot be replaced by a
  credential — somebody has to actually do it once.
- **Steps:** in `docs/RUNBOOK.md` under "Restoring from a backup". Restore the most recent dump into a
  **new Neon branch**, not production, run `npx prisma migrate status` against it, and count rows in
  `Shop` and `GeneratedContent`. Record the date and the row counts in `PROGRESS.md` so the next person
  knows it has been proven at least once.

## Done

### 4. Raise `connection_limit` on `DATABASE_URL` from 1 to 5 — Phase 0 item 15
**Done 2026-09-09.** Confirmed from the production machine: pooled Neon endpoint (`-pooler`,
`pgbouncer=true`), `connection_limit=5`, password intact. `fly logs` now shows
`✅ All startup checks passed` with no `connection_limit` warning on either machine.
One connection had meant `tryConsumeGeneration` held a SERIALIZABLE transaction while three worker slots
and every web request queued behind the same single connection, surfacing to merchants as "Timed out
fetching a new connection from the pool" under ordinary load.
**This is the change that caused the 2026-09-09 secret-corruption incident** — recorded in
`docs/RUNBOOK.md` and in `PROGRESS.md`. It is why the import-from-file rule above exists.

### 3. Turn on listing analytics so App Store install sources can be measured — Phase 0 item 2
**Done.** GA4 measurement ID `G-8H3DS31YQ8` is live on the App Store listing, so listing pageviews carry
the `surface_*` params and the server-side `shopify_app_install` event can be joined to them. This is the
only Shopify-provided way to get a search-vs-category-vs-home split: under managed installation Shopify
does **not** forward `surface_*` to the app server, which is why server-side attribution records those
installs as `unknown` (truthfully) and our own channels are attributed through `/go?ref=`.
The daily digest (Phase 1 item 5) can read GA4 now that this exists.

### 2. Confirm the App Store listing name
**Done.** https://apps.shopify.com/navaal-ai-seo-geo-content reads `Navaal: AI SEO, AEO & GEO`, matching
the in-app document title, `og:title` and nav brand line character for character.

### 1. Push the app name to Shopify (`shopify app deploy`) — Phase 0 item 1
**Done.** Deployed via the Shopify CLI from the owner's machine, so the admin sidebar now shows
`Navaal: AI SEO, AEO & GEO`. The agent could not run it: the CLI is not installed in the repo, the
auto-mode permission layer declined the `npx @shopify/cli app deploy` call, and it needs a Partner-account
login. The released version also carries the unchanged theme extension `navaal-geo-schema`.

### Sentry alert rule — Phase 0 item 25
**Done 2026-09-09.** Created by the owner; the deliberate test error produced an email, so a new issue
reaches a human. The code half (eager init, `handleError`, `unhandledRejection` / `uncaughtException`
handlers, `release: GIT_SHA` tagging) shipped in `8665a25`, and the eager init is visible in production
logs on every machine boot.

## Standing notes
- Every push to `main` deploys to Fly via `.github/workflows/ci.yml`; do not run `fly deploy` locally
  alongside a push.
- The saved admin session used by the proof harnesses lives in `tests/e2e/.auth/shopify.json` (created
  with `node scripts/login-cdp.mjs`). When it expires, re-run that script and log in yourself; no
  credentials are ever typed by the agent.
