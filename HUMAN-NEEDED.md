# HUMAN-NEEDED

Things only a human with the right logins can do. Each item says what, why, and the exact command or click path. Remove an item when done.

## Open

### 1. Push the app name to Shopify (`shopify app deploy`) — item 1
- **What:** `shopify.app.toml` now has `name = "Navaal: AI SEO, AEO & GEO"` (commit a9422c1). The Shopify-side config deploy that makes the admin show that name was **not** run from the agent session: the Shopify CLI is not installed in the repo, and the auto-mode permission layer declined the `npx @shopify/cli app deploy` call. It also needs a Partner-account login the agent cannot perform.
- **Command (from the repo root, logged in to the Partner account that owns client_id 1279a14…):**
  ```
  npx -y @shopify/cli@4.7.1 app deploy --force --message "Rename app to Navaal: AI SEO, AEO & GEO"
  ```
  Expect: a new app version is created and released; `shopify app info` (or the Partner Dashboard → Apps → Navaal → Configuration) shows the name **exactly** `Navaal: AI SEO, AEO & GEO`. The version also carries the unchanged theme extension `navaal-geo-schema` — that is expected.
- **Then:** in the Partner Dashboard → Distribution → App listing, set the listing name to the identical string, character for character: `Navaal: AI SEO, AEO & GEO`.

### 2. Confirm the App Store listing name
- Listing URL: https://apps.shopify.com/navaal-ai-seo-geo-content
- Must read `Navaal: AI SEO, AEO & GEO`. The in-app document title, og:title and nav brand line already use this string (deployed with commit a9422c1 via CI).

### 3. Turn on listing analytics so App Store install SOURCES can be measured (item 2)
- **What we measured (2026-09-09, real install from an App Store search onto navaal-qa-fresh):** the listing URL and Shopify's own install action carry `surface_type=search&surface_detail=<query>…`, but the app's first authenticated request (managed installation → `admin.shopify.com/store/<s>/app/grant` → app iframe) carries only `shop/host/embedded/hmac/id_token`. Shopify does not forward the surface params to the app server. Our tracker records them whenever they are present, so those installs currently record as `installSource: unknown` (truthful), and our own links are attributed through `/go?ref=`.
- **The only Shopify-provided way to get search-vs-category-vs-home splits:** Partner Dashboard → Apps → Navaal → Distribution → Manage listing → *Tracking information*: add a **Google Analytics 4 measurement ID** and a **Measurement Protocol API secret** (docs: shopify.dev/docs/apps/launch/marketing/track-listing-traffic). GA4 then receives every listing pageview with the surface params and a server-side `shopify_app_install` event (with shop_url) that can be joined to it. The daily digest (item 8) can read GA4 once this exists.
- **Cost:** ~10 minutes, one GA4 property. Until it is done, the truthful install-source report is: our channels (ref) vs. everything else.

### 4. Raise `connection_limit` on `DATABASE_URL` from 1 to 5 — Phase 0 item 15
- **What is wrong now (measured on the production machine, 2026-09-09):** the URL is already the POOLED
  Neon endpoint (`-pooler` host, `pgbouncer=true`) but carries `connection_limit=1`. One connection means
  `tryConsumeGeneration` holds a SERIALIZABLE transaction while three BullMQ worker slots and every web
  request queue behind it for the same single connection. That surfaces to merchants as
  "Timed out fetching a new connection from the pool" under quite ordinary load, and it gets worse the
  moment two people use the app at once.
- **Why the agent cannot do it:** the new value has to contain the database password. Reading the secret
  out of the machine and passing it back through a `fly secrets set` command line would put a live
  credential into shell history and into this transcript. The code-side half is already shipped: the
  startup check no longer only fires for hostnames containing `neon.tech`, and it now warns when
  `connection_limit` is below 2 (look for it in `fly logs`).
- **Exact steps:**
  1. Get the current value (it is printed only to your own terminal):
     ```
     fly ssh console -a contentclaude -C "printenv DATABASE_URL"
     ```
  2. Change `connection_limit=1` to `connection_limit=5`, keeping every other parameter
     (`pgbouncer=true`, `sslmode`, `channel_binding`) exactly as-is.
  3. Set it:
     ```
     fly secrets set DATABASE_URL="<the edited URL>" -a contentclaude
     ```
     This restarts the machine, which is safe: in-flight jobs are now resumable (Phase 0 item 12).
  4. Confirm the warning is gone: `fly logs -a contentclaude | grep STARTUP` should no longer mention
     `connection_limit`.
- **When the worker moves to its own process (Phase 1 item 2), give the worker `connection_limit=3` and
  leave the web process on 5.**

## Done
- **Sentry alert rule (Phase 0 item 25)** — created by the owner 2026-09-09; the deliberate test error
  produced an email, so a new issue now reaches a human. The code half (eager init, `handleError`,
  `unhandledRejection` / `uncaughtException` handlers, `release: GIT_SHA` tagging) shipped in `8665a25`.

## Standing notes
- Every push to `main` deploys to Fly via `.github/workflows/ci.yml`; do not run `fly deploy` locally alongside a push.
- The saved admin session used by the proof harnesses lives in `tests/e2e/.auth/shopify.json` (created with `node scripts/login-cdp.mjs`). When it expires, re-run that script and log in yourself; no credentials are ever typed by the agent.
