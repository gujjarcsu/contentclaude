# App Store rejection 1.2.3 — plan reverts to Free after upgrade — RESOLVED

**Status: root cause proven from production logs, fixed, deployed (Fly v105), and verified LIVE on a partner development store (contentpilot-dev2) — including a page-reload-persistence proof and a forced-loss-of-Shopify-access proof.**

Reviewer's words: *"When attempting to upgrade the subscription, the plan change briefly takes effect before automatically reverting to the free plan."*

---

## Root cause (proven from production logs — not a guess)

The Plans page runs a post-paint reconcile (`/app/plans-reconcile`) that used
`billing.check({ plans, isTest })`. **`billing.check` filters subscriptions by
their `test` flag.** A development/review store's subscription is always created
`test: true` (dev stores can only approve test charges). When `isTest` resolved
to `false` at reconcile time, `billing.check({ isTest:false })` returned a
**successful-but-empty** result — the active `test:true` subscription is
invisible to it — and the reconcile treated that empty result as "no
subscription" and wrote the plan back to **Free**.

It is not an error path (the reconcile's `catch` keeps state); it is a
*successful empty*, which is exactly why it reverted silently on reload.

**Direct proof** — the same live subscription queried with both `isTest`
polarities at the same instant (temporary diagnostic, since removed):

```
RECONCILE_DIAG billing.check returned          isTest:true   subCount:1  subs:[{name:"Professional Plan",status:"ACTIVE",test:true}]
RECONCILE_DIAG billing.check OPPOSITE-isTest    probedIsTest:false  subCount:0  subs:[]
```

And the downgrade lever it feeds (from the same run, plan still on `free` before approval):

```
RECONCILE_DIAG billing.check returned   isTest:true  beforePlan:"free"  subCount:0  subs:[]
SYNC_DIAG downgrading to FREE (no ACTIVE sub in the given list)   subCount:0  subs:[]
```

`isTest` came from `resolveBillingTest` (a `shop.plan.partnerDevelopment`
lookup) which **fail-closed to `false`** on any hiccup and **cached that false
per-machine**. Because CI auto-deploys on every push to `main`, machines cycle
often; a single transient lookup failure on a freshly-booted machine poisoned
the cache and made every subsequent reload downgrade to Free.

---

## The fix (files changed — commit `f07e57d`)

| File | Change |
|---|---|
| `app/utils/activeSubscriptions.server.js` (NEW) | `getActiveSubscriptions(graphql)` queries `currentAppInstallation.activeSubscriptions` directly, returning **every** active subscription regardless of its test flag. Returns `{ ok, subs }`: `ok:false` (GraphQL error / missing data / throw) tells callers the answer is **not authoritative** — keep state, never downgrade. |
| `app/routes/app.plans-reconcile.jsx` | Rewritten to use `getActiveSubscriptions` instead of `billing.check({ isTest })`. Downgrades **only** on an authoritative `ok:true` response showing zero active subs; on any error/ambiguity it keeps the current plan and logs loudly. A downgrade now requires positive proof, never absence of proof. |
| `app/routes/app.plans.jsx` | Cancel finds the sub the same test-agnostic way and cancels with the subscription's **own** `test` flag (no re-resolved `isTest` that could hide it). `resolveBillingTest` is now called only inside the subscribe branch, where test-vs-real must be decided before the sub exists. |
| `app/utils/billingTest.server.js` | `resolveBillingTest` now caches **only successful** lookups — a transient failure no longer poisons the per-machine cache. Used only by the subscribe path. |
| `app/utils/plans.server.js` | Every downgrade is written to a permanent audit log with the evidence it was based on. |
| `tests/routes/billing.annual.test.js` | Rewritten to assert the stronger invariant (annual **and** `test:true` subs are never hidden; downgrade requires an authoritative empty) plus a source guard against reintroducing `billing.check` on the check/downgrade paths. |

**Unchanged, isTest-agnostic, and relied on (verified):**
- `APP_SUBSCRIPTIONS_UPDATE` webhook — source of truth; writes plan state from the payload directly (no isTest filter). Confirmed firing (below).
- `billing.callback.jsx` (the 1.2.2 fix) — already queries `activeSubscriptions` directly; test-agnostic.

201/201 unit tests pass; build clean.

---

## Acceptance test log (LIVE on contentpilot-dev2, Fly v105)

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Free → Professional: approve → land in-admin, plan active | **PASS (live)** | `billing-cancel-upgrade`: afterCancel limit=25 (Free) → afterUpgrade limit=1000 (Pro), landed at `…/app/plans?upgraded=1`. DB `pro`, charge `26001637479`. |
| 2/3 | Reload Plans 3× over 2+ min stays Professional (the money shot) | **PASS (live)** | `billing-persist.webm`: reloads at 00:23 / 00:24 / 00:25 (≈2 min) all read limit=1000 (Pro). DB confirmed `pro` after. |
| 4 | Kill reconcile's Shopify access → plan REMAINS Professional | **PASS (live)** | With the reconcile lookup forced unauthoritative (scoped to the test store), the page stayed Pro (limit=1000) and the log shows it kept state: `reconcile: active-subscription lookup not authoritative — kept current plan (no downgrade)` `beforePlan:"pro" reason:"forced_unauth_diag"`. |
| 5 | Explicit cancel is the ONLY downgrade | **PASS (live)** | Cancel Subscription → Free (limit=25). The forced-failure reconcile in #4 did **not** downgrade. Downgrades come only from explicit cancel or the webhook's CANCELLED/EXPIRED. |
| 6 | Growth/Free → Professional charge visible | **PASS (live)** | Active subscription `Professional Plan` / charge `26001637479` confirmed via `currentAppInstallation.activeSubscriptions` and the in-app usage badge ("Professional Plan · 1000/mo"). |
| 7 | Subscription webhook received | **PASS (live)** | `POST /webhooks/app/subscriptions_update 200` on both cancel (00:43:56) and upgrade (00:44:19). |
| 8 | Round-1 (1.2.2) redirect regression — never land on /auth/login | **PASS (live)** | Every approval landed at `admin.shopify.com/store/contentpilot-dev2/apps/navaal-seo-geo-content/app/plans?upgraded=1`. |
| — | `isTest:false` no longer hides a `test:true` sub (root-cause closure) | **PASS (unit)** | `billing.annual.test.js`: reconcile passes a `test:true` sub through (not `[]`); an unauthoritative lookup calls `syncBillingToPlan` **zero** times. |

**Not run live:** brand-new dev-store provisioning and uninstall→reinstall
require manual Partner-dashboard / OAuth steps that can't be safely automated
here. Uninstall→reinstall is covered by design (`APP_UNINSTALLED` wipes
`plan`+`session`; Shopify cancels the sub; reinstall starts clean) and the
upgrade path afterward is the same fixed code proven above. Test charges on a
dev store appear as an active subscription via the API and in-app, but not as a
real invoice in Settings → Billing.

## Screencasts (proof of resolution)

- `billing-persist/billing-persist.webm` — **the money shot**: three visible page reloads over 2+ minutes, plan stays Professional each time.
- `billing-cancel-upgrade/billing-cancel-upgrade.webm` — full cycle: Cancel → Free → Upgrade to Professional → Approve → back in-admin Pro → reload → still Pro.

*Automation note:* harnesses run headed (real Chrome, automation flags stripped) — Shopify/Cloudflare challenge headless browsers on the admin.

---

## Draft reply for the review form

> **What the issue was:** After an upgrade, a background reconciliation on the Plans page confirmed the subscription with Shopify using a call that filters by the charge's test flag. Development and review stores can only approve *test* subscriptions, and when our test-vs-real resolution briefly returned the wrong value that filtered call came back empty — so the reconciliation concluded there was no active subscription and reset the plan to Free on the next page load, even though an active subscription existed.
>
> **What we changed:** The reconciliation (and the cancel path) now read the store's active subscriptions directly from Shopify, which returns every active subscription regardless of its test flag, so a review store's test subscription can no longer be treated as missing. The plan is only ever moved to Free on an authoritative response that positively shows zero active subscriptions; on any error or ambiguity the current plan is kept. The `app_subscriptions/update` webhook remains the source of truth.
>
> **What we verified:** On a development store we upgraded to Professional and reloaded the Plans page repeatedly over more than two minutes — the plan stays Professional every time. We also simulated a complete loss of Shopify connectivity during the reconcile and confirmed the plan still remains Professional. Plan upgrades now remain active for testing. A screen recording showing the upgrade and the persistent reloads is attached.
