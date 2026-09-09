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

## Standing notes
- Every push to `main` deploys to Fly via `.github/workflows/ci.yml`; do not run `fly deploy` locally alongside a push.
- The saved admin session used by the proof harnesses lives in `tests/e2e/.auth/shopify.json` (created with `node scripts/login-cdp.mjs`). When it expires, re-run that script and log in yourself; no credentials are ever typed by the agent.
