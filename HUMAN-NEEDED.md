# HUMAN-NEEDED

Things only a human with the right logins can do. Each item says what, why, and the exact command or
click path. When one is done it moves to **Done** with the date and how it was confirmed — the record of
what was required is worth keeping.

**Setting a secret: always `fly secrets import`, never `fly secrets set`.** See the 2026-09-09 incident
in `docs/RUNBOOK.md`. A URL-encoded password contains `%xx` sequences, and Windows `cmd.exe` treats those
as variable references and strips them, so `secrets set` on the command line silently corrupts the value
and restarts both machines onto it.

## Open

*(none)*

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
