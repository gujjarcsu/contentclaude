# HUMAN-NEEDED

Things only a human with the right logins can do. Each item says what, why, and the exact command or
click path. When one is done it moves to **Done** with the date and how it was confirmed — the record of
what was required is worth keeping.

**Setting a secret: always `fly secrets import`, never `fly secrets set`.** See the 2026-09-09 incident
in `docs/RUNBOOK.md`. A URL-encoded password contains `%xx` sequences, and Windows `cmd.exe` treats those
as variable references and strips them, so `secrets set` on the command line silently corrupts the value
and restarts both machines onto it.

## Open

Five items, all with the owner. Every one needs an account or a console the
agent cannot reach. The code for each is shipped and degrades honestly without
it.

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

**Status 2026-09-09, after the owner set the other three:** `DIRECT_URL` is **still not set**.
`fly secrets list -a contentclaude` returns seventeen names and this is not among them, and
`printenv` on the machine confirms it. `WORKER_DATABASE_URL`, `RESEND_API_KEY` and the four `R2_*`
secrets all landed in the same sitting, so the import worked; this one did not make it. Until it
exists, `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` has to stay in `fly.toml`, and the datasource cannot
take `directUrl`.

### 2. Uptime monitor from two regions (Phase 1 item 5)
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

### 3. Neon point-in-time restore, 7 days (Phase 1 item 7)
- **Why:** first line of defence for a bad migration or a mistaken delete, and much faster than restoring
  a dump.
- **Steps:** Neon console → project → Settings → **History retention** → set to **7 days**. On the free
  tier this may cap lower; if so, note the actual number here so the runbook stops promising seven.

### 4. Run the restore drill once (Phase 1 item 7)
- **Why:** an untested backup is a hope. This is the only item here that cannot be replaced by a
  credential — somebody has to actually do it once.
- **Steps:** in `docs/RUNBOOK.md` under "Restoring from a backup". Restore the most recent dump into a
  **new Neon branch**, not production, run `npx prisma migrate status` against it, and count rows in
  `Shop` and `GeneratedContent`. Record the date and the row counts in `PROGRESS.md` so the next person
  knows it has been proven at least once.

### 5. Re-run the two measurement harnesses with a fresh admin session (Phase 2 items 2.11 and 2.12)
- **Why:** both harnesses are written, committed and working. Neither can produce a number, because the
  saved Playwright session at `tests/e2e/.auth/shopify.json` does not reliably complete Shopify token
  exchange any more: embedded routes answer **410 Gone** and never recover. Only a human can create a new
  session, because `login-cdp.mjs` opens a browser for somebody to type the credentials and no agent
  ever types them.
- **What went wrong first, so it is not repeated:** the first run of each harness reported a full set of
  confident results — `12 screens, 0 overflowing` and a complete LCP table. Every screenshot was the
  same "410 Gone" page, and the LCP figures were the load time of that error page. Both harnesses now
  refuse to report rather than measure an error page, and the check reads through Playwright frame
  handles because the app is cross-origin to the admin and `iframe.contentDocument` is null.
- **Steps:**
  ```
  node tools/proof/login-cdp.mjs          # a human logs in; writes tests/e2e/.auth/shopify.json

  node tools/proof/web-vitals.mjs --label before    # against the CURRENT deploy
  node tools/proof/mobile-375.mjs                   # 12 screens at 375px

  # then, after the next deploy:
  node tools/proof/web-vitals.mjs --label after
  node tools/proof/web-vitals.mjs --compare
  ```
- **What to expect:** the harness emulates a 200 ms US-to-Sydney round trip, because measuring from
  Sydney would flatter the app by the width of the Pacific. Targets are LCP p75 <= 2.5 s, CLS <= 0.1,
  INP <= 200 ms. `mobile-375.mjs` exits non-zero if any screen scrolls horizontally and writes both the
  screenshots and a `results.json` naming the widest offending element.
- **The one partial reading I did get**, before the session degraded, on the deploy carrying increments
  1-3: Home LCP p75 4012 ms, Products 2660 ms, Review 2344 ms, CLS 0 on all three, INP 16-24 ms. It is a
  single sample per screen, not the p75-over-10 the brief asks for, and it is recorded as an indication
  rather than a result.

## Done

### `WORKER_DATABASE_URL` — the worker's own connection budget (Phase 1 item 2)
**Done 2026-09-09.** Set via `fly secrets import`. Confirmed from production logs: the worker's
`Startup complete` line reads `"dbUrlSource":"WORKER_DATABASE_URL"` and the web machine's reads
`"dbUrlSource":"DATABASE_URL"`, so each process opened the connection string meant for its role.
Deep health green throughout.

### `RESEND_API_KEY` — the alerts can now leave the building (Phase 1 item 5)
**Done 2026-09-09, and proven end to end.** A single deliberate test alert was sent from the
production machine through `sendOperatorEmail()` — the same function the five-minute health probe,
the `/app` shell probe, the daily digest and the nightly backup all use. The log line reads
`operator_alert_sent` with `"to":"hello@navaal.ai"` and the call returned `sent: true`, replacing
the `operator_alert_undeliverable` that every alert produced before. Recorded in `PROGRESS.md`.

### R2 bucket and credentials for the nightly backup (Phase 1 item 7)
**Done 2026-09-09.** All four of `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and
`R2_BUCKET` are set. The next 03:00 Sydney run is the first real test: it should log `backup_ok`
with a key and a byte count instead of `backup_not_configured`. **The restore drill is still open**
— a backup nobody has restored is a hope, not a backup.

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
