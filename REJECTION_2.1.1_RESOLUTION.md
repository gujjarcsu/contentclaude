# App Store rejection 2.1.1 — in-admin login dead-end — RESOLVED

**Status: root cause reproduced, fixed at the root, deployed to production (Fly v108), and proven with a live 30/30 gauntlet on a partner dev store (contentpilot-dev2), pointer visible, recorded.**

Reviewer: *"Navigating back to the main app dashboard from other feature pages currently results in an error."* The error was a bare **"Log in / Shop domain"** form rendered **inside** the admin at `.../apps/navaal-seo-geo-content/auth/login` — a dead end.

---

## Root cause (one paragraph)

The app's `application_url` is the site root (`/`), so when a merchant clicks the app name / the "Dashboard" home nav, the Shopify admin loads the app **root** and sends the embedded `host` param but **not always `shop`**. The root route (`app/routes/_index/route.jsx`) checked **only** for `shop`; lacking it, it executed `throw redirect("/auth/login")` — **dropping every param, including `host`** — and the login route rendered the "Shop domain" form inside the admin iframe. The login route (`auth.login`) was supposed to auto-recover when `host` was present, but its recovery called the library's `login()` — which **throws** the intended OAuth redirect — inside a `try/catch` that **swallowed that throw** and fell through to the form, so recovery never happened. A third path (`RouteError`'s "Re-authenticate" button) did `window.location.href = "/auth/login"`, navigating the iframe straight to the same form. Incognito mattered only because it blocks the app's third-party session cookie, removing the cached session that used to mask the missing-`shop` code path for a normally-cookied browser. Net: a routine "back to dashboard" navigation dead-ended on a login form that could never advance.

Reproduced deterministically at the routing level (`scripts/repro-login-deadend.mjs`) against production — before the fix, `/?host=…&embedded=1` (no `shop`) → `302 /auth/login` → **form rendered**.

---

## The fix (files changed — commit `3bd856a`, deployed v108)

The law applied: **the login form must be unreachable from inside the admin.** It may render **only** for a true top-level visit from outside Shopify.

| File | Change |
|---|---|
| `app/utils/embedded.server.js` (NEW) | `isEmbeddedRequest` (true for `host`, `embedded=1`, or a `sec-fetch-dest: iframe` document load) + `shopFromHost` (decodes both `{shop}.myshopify.com/admin` and `admin.shopify.com/store/{name}` host encodings) + `embeddedAppParams` (fills in `shop` from `host`). |
| `app/routes/_index/route.jsx` | Any request carrying `shop` **or** `host` **or** `embedded=1` is redirected to `/app` (with `shop` derived from `host`), so the embedded token-exchange auth runs and the merchant lands on the dashboard. `/auth/login` is reserved strictly for a contextless external visit. |
| `app/routes/auth.login/route.jsx` | Embedded requests redirect to `/app` (silent re-auth via token exchange / App Bridge bounce) instead of rendering the form. The external `login()` OAuth redirect is no longer swallowed. |
| `app/components/RouteError.jsx` | The 401 "Re-authenticate" action re-enters `/app` (with the current embedded params), never the iframe login form. |
| `app/utils/useRouteLoading.js` (NEW) + 16 `app.*.jsx` routes | Secondary bug (0:04 URL/heading mismatch): every route gated its skeleton on the **global** `navigation.state`, so navigating away kept the old route's skeleton at the new URL. `useRouteLoading()` shows a route's skeleton only while **that** route is loading. |
| `tests/routes/login-deadend.test.js` (NEW) | 9 regression tests locking every form entry point + a source guard that both routes gate the form behind `isEmbeddedRequest`. |

210/210 unit tests pass; typecheck + build clean.

---

## Proof — routing reproduction, before vs after (production)

| Case | Before | After (v108) |
|---|---|---|
| `/?host=…&embedded=1` (no shop) — the exact trigger | `302 /auth/login` → **form** ❌ | `302 /app?…&shop=<derived>` → no form ✅ |
| `/?shop=…&host=…` | `/app` ✅ | `/app` ✅ |
| `/auth/login?host=…` (no shop) | **form** ❌ | `302 /app?…&shop=<derived>` → no form ✅ |
| `/` with zero params (true external visit) | form | form ✅ *(correct — outside the admin only)* |

## Proof — live gauntlet (30/30, `gauntlet-211/gauntlet-211.webm`)

Headed browser, visible cursor + click ripples, incognito simulated by clearing the app's third-party cookies so every load re-auths via token exchange. Pass condition at **every** step: "Shop domain" / "Log in" never renders inside the admin and the app frame shows real content.

- **1** Open the app fresh from the admin → dashboard loads. ✅
- **2** Visit **all 11** left-nav items in sequence — each loads with matching URL. ✅
- **3** From **each** page, click back to **Dashboard** (the reviewer's exact failing move) — dashboard loads every time (11/11). ✅
- **3b** Click the app name / app home (loads the app root `/`) from a sub-page → dashboard. ✅
- **4** Browser Back / Forward through history → no login form. ✅
- **5** Hard reload (F5) on the dashboard **and** on a sub-page → recovers to the correct page. ✅
- **6** Close the tab, reopen the app → loads. ✅

**Result: 30/30 steps passed** (`gauntlet-211/results.json`). Not automated here (needs manual Partner-dashboard/OAuth steps): a brand-new-store install and a second fresh-incognito pass — the fix is store- and cookie-agnostic (it is purely request-param logic), so these follow from the same code.

**Regression:** billing flows from rejections #1–2 re-verified after this change — Plans loads and holds Professional across reloads (`billing-persist` PASS).

*PII:* the recording shows only the dev store ("E2E Test Store" / contentpilot-dev2) — no emails or customer data.

---

## Resubmission reply (paste to Shopify)

> **What the issue was:** Our app's home URL is the site root, and when a merchant returned to the app home from a feature page the Shopify admin loaded that root with the embedded `host` parameter but without the `shop` parameter. Our root route only recognized `shop`, so it fell back to our login route and rendered a "shop domain" login form inside the admin — a dead end that blocked navigation back to the dashboard.
>
> **What we changed:** Any request that comes from inside the Shopify admin (identified by the `host`/`embedded` context) is now sent straight into the embedded app and re-authenticated silently via session-token exchange; the shop is derived from the `host` parameter when needed. The manual "shop domain" login form is now reachable only from a genuine top-level visit outside the admin, and every other re-authentication path recovers into the app instead of showing that form. We also fixed a related page heading/URL flash during navigation.
>
> **What we verified:** On a development store we opened the app, visited every navigation item, and returned to the Dashboard from each one — including clicking the app name — plus browser back/forward and full page reloads. The dashboard loads every time and the login form never appears inside the admin. Please re-test navigating back to the dashboard from any feature page.
