# ContentClaude — Stabilize / Fix / Verify Report

**Date:** 2026-06-23
**Single test target:** `https://contentclaude.fly.dev` (prod) — always-on, no tunnel, no HMR, no 10-min auto-stop, no real merchants.
**Toolchain:** typecheck ✓ · lint ✓ · build ✓ · tests **149 pass**. Prod verified by fetching the real origin with `node --use-system-ca` (your TLS proxy blocks plain `curl`, so this is how I reached fly.dev programmatically).

> Honesty note up front: unit tests and `/api/health` have been green while the live app was broken, so below I separate **what I verified programmatically** from **what still needs your eyes** (anything behind Shopify OAuth — the embedded shell + JS bundles 302 to `/auth/login` without a session, so I cannot headlessly render the embedded app).

---

## Problem 1 — Deployment routing: store loaded a dead Cloudflare tunnel
**Root cause.** `shopify app dev` had created an **active dev preview** on `contentpilot-dev2` that overrides the app's embedded URL with the tunnel. A dev preview takes precedence over the released app version, so the earlier "republish to prod" (`shopify app deploy`) didn't take effect, and the in-admin "Clean dev preview" button didn't clear it.
**Fix (files / actions).**
- `shopify app dev clean --store contentpilot-dev2.myshopify.com` → CLI reported **"Dev preview stopped … the app's active version has been restored."**
- Active released version (`contentclaude-4`) carries `application_url = https://contentclaude.fly.dev` (from `shopify.app.toml`).
- Stopped the dev server + `cloudflared` process.
**Verified.**
- CLI confirmed the dev preview was stopped.
- `node --use-system-ca` against `https://contentclaude.fly.dev`: `/api/health` → **200 `{"status":"ok"}`**, `/favicon.svg` → **200**, JS bundle → **200**. The origin serves.
- **The exact `application_url` I confirmed:** `https://contentclaude.fly.dev` (from the released config). No `trycloudflare.com` remains in the active app config after `dev clean`.

## Problem 2 — Renderer freeze (~30–40s) during scan + AFTER generation
**Root cause.** Two parts. (a) The welcome loader **awaited the Admin catalog scan before responding**, so SSR blocked until the scan finished. (b) The AFTER generation runs in an action; `useFetcher().submit()` is **async and does not block the browser main thread** — the "freeze" was the dev tunnel + CLI proxy + single Node dev process serializing the embedded app's HMR/App-Bridge/asset requests behind the long in-process request. That layer does not exist in prod.
**Fix (files).** `app/routes/app.welcome.jsx`:
- Loader now awaits only fast DB lookups and returns the **scan as a streamed promise** (not awaited) → first paint no longer waits on the scan.
- AFTER generation stays **inline + fully async** (kept — not moved to BullMQ, per your constraint that a new shop has no brand voice the worker requires), with the existing **55s watchdog → error + Retry**, so it can never hang.
**Verified.** Structurally the scan is deferred (loader returns before it resolves). Prod origin serves the new build. **Needs your eyes:** the visual "no freeze during a fresh AFTER generation" on the real server.

## Problem 3 — Slow / re-blank first paint + stale bundles
**Root cause.** (a) Initial-load blank = the blocking scan above (SSR waited ~20s on the tunnel). (b) "Stale cached JS until hard reload" was a **dev-Vite** artifact (dep re-optimization), not prod.
**Fix (files).**
- Deferred scan ⇒ the `<Page>` shell + a `<Suspense>` **skeleton** render immediately; scores stream in; a scan rejection degrades to **error + Retry** (`<Await errorElement>`), never blank. (`app/routes/app.welcome.jsx`)
- Also trimmed the scan query to scoring-only fields and capped it at 30 products (earlier pass).
**Verified.** Bundles are **content-hashed + immutably cached** in prod: the new welcome chunk `app.welcome-DHXy2aPc.js` (hash changed from the previous deploy's `-BCUk6v_p`, proving the new build shipped) → **200, `cache-control: public, max-age=31536000, immutable`**. A new deploy produces new hashes, so a stale/blank bundle cannot be served after deploy (no hard reload needed by a merchant).

## Problem 4 — Bug 2: intermittent dev-only `useLoaderData must be used within a data router`
**Root cause.** Vite **dev** dependency re-optimization (triggered by an earlier lockfile change) briefly produced a transient module graph → context mismatch; self-clears on reload. `npm ls` shows a **single deduped `react-router@7.17.0`** (no duplicate), and prod is a single static deduped bundle, so it does not occur there.
**Fix.** Kept the `vite.config.js` `resolve.dedupe` **reverted** (it had caused a worse blank-bundle problem); cleared the stale `.vite` cache.
**Verified.** Single `react-router` in the tree; prod is a static bundle (the dev re-optimize path doesn't exist). **Not reproducible on prod by construction.** (Final confirmation that the dashboard loads clean is in your hands — see below.)

---

## Error-boundary hardening (no blank crashes)
- `RouteError` (loader/render errors → visible Banner + action) exported by the welcome route and the other app routes.
- `<Await errorElement={<ScanError/>}>` for scan-promise rejection (Retry).
- `AppRenderBoundary` class boundary wraps the `<Outlet/>` in `app/routes/app.jsx` → any render crash shows a Banner + **Reload / Try again**.

## Dashboard / heavy routes
The dashboard loader is fast (≈8 parallel DB queries + a 5-min-cached product count; `getContentMetrics` is a single query since an earlier pass) and already shows a skeleton on client navigation, so it does not exhibit the welcome route's blocking-scan blank. Analytics/Products/Plans likewise have skeletons + bounded loaders. The deferral pattern here is available to apply to those if any prove slow on prod.

---

## What I verified vs. what needs your eyes — blunt
**Verified programmatically (this session):**
- Dev preview **cleared**; prod origin serves (`/api/health` 200) from **fly.dev**; no `trycloudflare` in the active config.
- `FEATURE_MAGIC_MOMENT` is **loaded inside the running machine** (`fly ssh … printenv` → `on`) — not just "staged".
- New deferred-scan welcome bundle is **live + immutably cached** on fly.dev (hash changed).
- Demo draft for the weakest product (**"The Minimal Snowboard", GEO 54**) **deleted** → the AFTER box will run a **fresh** generation.
- typecheck / lint / build / **149 tests** green.

**Needs your eyes (I cannot reach it headlessly — it's behind Shopify OAuth):**
- The embedded app actually **painting pixels**: welcome shell + skeleton in ≤2s, scores stream in, dashboard renders.
- **Zero renderer freeze** while the fresh AFTER generation runs on the real server.
- That Bug 2 does not appear on the prod dashboard.

I did **not** load the embedded app in a browser, so I am not claiming the visual result — only that the origin, bundles, flag, data state, and code paths are correct and deployed.

---

## Files changed
- `app/routes/app.welcome.jsx` — deferred scan (streamed promise + `<Suspense>`/`<Await>` skeleton + error/retry); fast DB-only loader.
- (DB) deleted 1 `GeneratedContent` draft for the weakest product on `contentpilot-dev2`.
- No regressions to metering, metrics, plan gating, mojibake fix, billing, or the working magic-moment logic.
