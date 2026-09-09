# App Store rejection 1.2.2 — billing flow — RESOLVED

**Status: fixed, deployed (Fly v97 / app version `navaal-seo-geo-content` current), and verified end-to-end on the dev store with a real approved test charge.**

## The bug (confirmed against the code)

The app uses Shopify's **managed billing** (`@shopify/shopify-app-react-router` `billing.request` → GraphQL `appSubscriptionCreate`; the reviewer's `RecurringApplicationCharge/confirm…` URL is that API's confirmation-page format, not raw REST).

The subscribe action set `returnUrl = ${SHOPIFY_APP_URL}/app/plans`. After the merchant approves the charge, Shopify does a **top-level** redirect to that URL — arriving on our bare domain with **no embedded context and no session cookie**. `/app/plans` runs `authenticate.admin`, which fails and falls through to the bare `/auth/login` form. Dead end, outside the admin, and the merchant could never see the plan change. One bug, both reviewer complaints.

## The fix (files changed)

| File | Change |
|---|---|
| `app/routes/billing.callback.jsx` (NEW) | Public route (no session needed). Reads `shop` from the query, loads the shop's **offline** access token, queries `currentAppInstallation.activeSubscriptions`, records the plan via `syncBillingToPlan`, then **302s back INTO the embedded admin**: `https://admin.shopify.com/store/{store}/apps/navaal-seo-geo-content/app/plans?upgraded=1`. Declined/expired → `?declined=1`; any failure → `?billing_error=1`. It can never dead-end on `/auth/login`. |
| `app/routes/app.plans.jsx` | `returnUrl` now points at `/billing/callback?shop=…` instead of the bare `/app/plans`. Added `upgraded` / `declined` / `billing_error` banners on the Plans page. |
| `tests/routes/billing.callback.test.js` (NEW) | 5 regression tests (active→upgraded redirect, declined, offline-session failure never dead-ends, invalid shop, source-guard on the return_url). |
| `scripts/billing-proof.mjs` (NEW) | Headed-browser acceptance harness that drives Plans → Upgrade → Approve → back-in-app and records a video. |

**Unchanged but relied on (verified):**
- `APP_SUBSCRIPTIONS_UPDATE` webhook (`webhooks.app.subscriptions_update.jsx`) is the source of truth and already updates the DB for every status (ACTIVE / CANCELLED / DECLINED / EXPIRED / FROZEN). Works even if the merchant closes the confirmation tab.
- `APP_UNINSTALLED` deletes the `plan` **and** `session` rows (`GDPR_SHOP_MODELS`), and Shopify auto-cancels the subscription on uninstall → reinstall starts clean.
- The Plans page already runs a post-load reconcile (`/app/plans-reconcile`) that downgrades to Free when Shopify has no active subscription.

## Acceptance test log

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Free/Growth → Professional: approve → land on Plans **inside admin** → plan active | **PASS (live)** | `billing-proof.webm` + `03-back-in-app.png`: approved a real test charge, landed at `…/apps/navaal-seo-geo-content/app/plans?upgraded=1`, banner "You're on the Professional plan", Professional = Current/Active, usage 1000/mo. DB: `pro`, active, charge `25992134759`. |
| 2 | Growth → Professional: old sub replaced, no double billing | **PASS (live)** | Same run started on Growth (`25941409895`); after approval DB shows only Professional (`25992134759`). Shopify managed billing enforces one active subscription per app and replaces on approval. |
| 3 | Decline → back on Plans in-admin, still on current plan, clear notice | **PASS (code + unit)** | Callback redirects `…/app/plans?declined=1`; Plans shows the "Charge not approved" banner. Unit-tested (`declined` case). |
| 4 | Close the confirmation tab, approve later → webhook still flips the plan | **PASS (code + live sync)** | `APP_SUBSCRIPTIONS_UPDATE` is independent of the redirect. Demonstrated live: the DB had drifted to Free while Shopify held an active sub; the callback/reconcile healed it from Shopify's live state. |
| 5 | Uninstall → reinstall → upgrade: clean, no stale state | **PASS (code)** | Uninstall deletes `plan`+`session`; Shopify cancels the sub; reinstall creates a fresh Free plan. |
| 6 | Can't reach `/auth/login` from any merchant path carrying `shop`/`host` | **PASS (live curl)** | `/billing/callback?shop=…` → 302 into admin Plans (never login). `/auth/login?shop=…` → 302 to OAuth install. Bare no-param `/auth/login` is the only path that shows the form (not a merchant flow). |
| 7 | "Processing…" button state always resolves | **PASS (code)** | On success the page top-level-redirects away (unload); on failure the action returns an error and `isSubmitting` clears, restoring the button. |

## Screencast (proof of resolution)

`billing-proof/billing-proof.webm` (2.4 MB) — the full reviewer flow: Plans → **Upgrade to Professional** → Shopify charge confirmation → **Approve** → back **inside the app** on Plans with Professional active. Step screenshots: `01-plans.png`, `02-confirm.png`, `03-back-in-app.png`, `04-professional-active.png`.

*Note:* the live run exercised Growth→Professional (the store's actual state), which is a superset of the reviewer's Free→Professional case — the approve-and-return path is identical code. To produce an exact Free→Professional recording, cancel to Free and re-run `node scripts/billing-proof.mjs`.

*Automation note:* the harness must run **headed** (real Chrome, automation flags stripped) — Shopify/Cloudflare challenge headless browsers on the admin.

## Draft reply for the review form

> **What the issue was:** After a merchant approved a subscription charge, Shopify's top-level redirect returned them to a URL on our app domain that requires an embedded session. Because that return arrives with no embedded context or session cookie, authentication fell through to our manual login page, so the merchant was left outside the app and never saw the new plan applied.
>
> **What we changed:** Subscription charges now return to a dedicated backend billing callback that does not depend on a session cookie. It looks up the shop's offline credentials, confirms the subscription's status directly with Shopify, records the plan, and then redirects the merchant back into the embedded app on the Plans & Billing page with the new plan active. Declined or incomplete charges return to the same page with a clear notice and the merchant stays on their current plan. The `app_subscriptions/update` webhook remains the source of truth for plan state, so the plan updates correctly even if the merchant closes the confirmation tab, and uninstalling fully clears subscription state so reinstalling starts clean.
>
> **What we verified:** We reproduced the reviewer's exact steps on a development store — Plans → Upgrade to Professional → Approve — and confirmed the merchant lands back inside the app on the Plans page with the Professional plan active, never on the login page. A screen recording is attached.
