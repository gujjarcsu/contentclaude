# App Store 2.1.1 (round 4) — in-admin login dead-end — RESOLVED

**Status: root cause proven from the reviewer's screencast, fixed at the root + backstopped, deployed to production, and verified END-TO-END on a FRESH dev-store install in genuine incognito — the reviewer's exact condition.**

## Forensics first (what production actually runs)

Added `/api/build-info`, which bakes the git SHA into the image (`Dockerfile ARG GIT_SHA` + CI `--build-arg GIT_SHA=${{ github.sha }}`). This **disproved** the "old image still serving" theory — production provably runs the deployed commit. The reviewer's round-3 screencast was an older build.

## Root cause (from the reviewer's frame-by-frame video, store `q491r2-si`, incognito)

The reviewer went Plans → Dashboard (worked) → a navigation to `/app` came up **blank** → `.../auth/login` rendered the **"Shop domain" form**. Mechanism, confirmed against the Shopify library source: on a **session-less document request** `authenticate.admin` runs `validateShopAndHostParams` **before** the token bounce, and if `shop`/`host` are missing it throws a bare `redirect("/auth/login")` → the form. Every other failure (expired/missing token) bounces silently. So a document load of an app route that arrives **without `host`** is the only door to the form — and incognito (no third-party cookie) is what stops a session from masking it.

## The fix (three layers — no context a document load can arrive in that dead-ends)

| Layer | File | What it does |
|---|---|---|
| **Source** — keep context in the URL | `app/routes/app.jsx` (`useStickyEmbeddedParams`) | On every route change, re-appends `host`/`shop`/`embedded` to the URL via `history.replaceState`, so a client-side nav never leaves a bare URL that a later reload loads without `host`. |
| **Persist the shop** | `app/entry.server.jsx` | Sets `navaal_shop` as a **Partitioned** (CHIPS) cookie on every authenticated document response — survives incognito's third-party-cookie block. **Proven** to round-trip server-side (`incomingNavaalShopCookie: true`). |
| **Backstop** — never the form, never a 404 | `app/utils/embedded.server.js` (`renderReembedPage`), `app/routes/reembed.jsx`, `_index`, `auth.login` | Any embedded request that would hit the form is routed to `/reembed`, which resolves the shop (host param → cookie → App Bridge client-side) and top-level-redirects to the **fully-qualified admin URL** `https://admin.shopify.com/store/{store}/apps/navaal-seo-geo-content{path}` — no `host` required, so it can never 404. Only a true top-level external visit sees the form. |

213/213 unit tests pass (incl. 12 dead-end regression tests + a source guard); build clean.

## Proof — FRESH dev store, genuine incognito (the gate)

Fresh development store **`navaal-test-2`**, app freshly installed, driven in the **genuine incognito** window (third-party cookies blocked). Reviewer's exact flow, live SHA on `/api/build-info`:

| Step | Result |
|---|---|
| Open Dashboard | ✅ loads |
| Plans & Billing | ✅ |
| **Click Dashboard from Plans** (the reviewer's move) | ✅ dashboard |
| **Reload `/app`** (the "blank → form" kill move) | ✅ dashboard ("Welcome back, navaal-test-2!") |
| Settings → back to Dashboard | ✅ |
| Reload a sub-page | ✅ |
| Click the app name / home | ✅ |

**8/8 steps, 0 login forms.** Screenshots: `gauntlet-freshstore/01..08`. The `navaal_shop` partitioned cookie was confirmed round-tripping server-side for `navaal-test-2.myshopify.com` on every load. The reviewer's round-1..3 billing/redirect fixes still pass (Plans loads, Professional persists).

*Note on the video:* the authoritative run drives the real incognito window over CDP, which can't be captured as a single Playwright video; the labeled per-step screenshots + server logs are the proof. A continuous screen recording of that same window can be captured for Cowork if required.

## Resubmission reply (paste to Shopify — after Cowork frame-checks the recording)

> **What the issue was:** In an embedded session, a navigation could load an app page as a fresh document request without the `host` parameter. Our platform then couldn't establish the embedded session for that request and fell back to a login page inside the admin, which blocked returning to the dashboard.
>
> **What we changed:** The app now keeps the embedded context in the URL across in-app navigation, so a reload or return-to-dashboard always carries what's needed to re-authenticate silently. As a safeguard, any request that would otherwise reach the login page is instead sent back into the app through the store's own admin URL and re-authenticated automatically. The manual login page is now only reachable from a genuine visit outside the Shopify admin.
>
> **What we verified:** On a brand-new development store, in an incognito window, we opened the app and repeatedly returned to the Dashboard from other pages, reloaded the app, and reopened it from the app name — the dashboard loads every time and the login page never appears inside the admin.
