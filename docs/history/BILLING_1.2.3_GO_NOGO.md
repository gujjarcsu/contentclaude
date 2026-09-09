# App Store 1.2.3 — Resubmission verification — GO / NO-GO

**Verdict: GO.** Every numbered item below passed on a brand-new development store
(the reviewer's exact environment) and on the original store, all live against the
deployed release (Fly **v107**, = `main` HEAD `0fb4754`). Nothing is "covered by
design" this round — everything ran live.

Reviewer's two sentences, answered: **plan changes persist** (upgrades *and*
downgrades, with no support contact and no reinstall — items 4–11), and **charges
appear correctly in the application charge history** (item 6).

Fresh store: **navaal-qa-fresh** · Original store: **contentpilot-dev2** · App: `navaal-seo-geo-content` (id 368479600641)

---

## Part 1 — Fresh-store gauntlet (navaal-qa-fresh)

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Create brand-new dev store | **PASS** | Created "Navaal QA Fresh" (`navaal-qa-fresh.myshopify.com`) in the Partner dashboard; nothing else touched. |
| 2 | Fresh OAuth install into embedded app | **PASS** | Grant screen → Install → landed in embedded app ("Welcome to Navaal"). Dev-dashboard install count 2 → 3. |
| 3 | Install-time webhook registration for this shop | **PASS** | Active version `navaal-seo-geo-content-14` registers 4 webhook subscriptions incl. **`app_subscriptions/update`** and **`app/uninstalled`** (dev-dashboard version config). Live firing confirmed in items 7 & 9. |
| 4 | Free → Professional: confirm → Approve → in-admin, quota 1000 | **PASS** | Confirm page → Approve → landed `…/app/plans?upgraded=1`, banner "You're on the Professional plan", quota **1000 remaining of 1000**. Charge `34180399334`. Fly: `Billing callback processed active:true count:1`. |
| 5 | Persistence: reload Plans 3× over 2+ min + Dashboard round-trips | **PASS** | Reloads at 01:27:17Z / 01:27:58Z / 01:29:52Z / 01:30:08Z (>2 min) + 2 Dashboard round-trips → **Professional every time** (1000/1000, "Renews 10/2/2026"). *DB note below.* |
| 6 | Subscription in this store's admin charge history | **PASS** | Settings → Apps → Navaal shows **Free trial · $79.99/mo after trial**; Settings → Billing → *View current charges* shows the active app subscription. (Dev-store **test** charges surface as an active subscription, not as a paid Past-bills invoice — expected for a review store.) |
| 7 | Plan change Growth → Professional ("Replaces your previous subscription") | **PASS** | Growth confirm text: *"Replaces your previous subscription ($29.99 every 30 days)."* Approved (`34180497638`), landed in-admin, reloaded ×2 → Professional persists. Fly `count:1` → exactly one active subscription. |
| 8 | Decline path: Cancel on confirm → back in-app, plan unchanged | **PASS** | Started an upgrade, clicked **Cancel** on Shopify's confirm page → back in-app on **Free**; reload → still Free (25/25). No charge activated. |
| 9 | Uninstall → reinstall → upgrade | **PASS** | Uninstalled → Fly `Webhook received: app/uninstalled` (01:47:53Z) + `All shop data deleted after uninstall` (clears `plan` **and** `session` rows via GDPR wipe). Reinstalled (fresh OAuth, new offline token) → **clean on Free**. Upgraded Free → Professional (`34180563174`), reload ×2 → persists. |
| 10 | Leave fresh store on Free at the end | **PASS** | Cancelled the test subscription; final state **Free (25 remaining of 25)**. Clean for any reviewer. |

## Part 2 — Regression on the original store (contentpilot-dev2)

| # | Test | Result | Evidence |
|---|---|---|---|
| 11 | Upgrade → in-admin → reload ×2 → persist; Cancel → Free persist | **PASS** | Free → Professional (`26001801319`), `…/app/plans?upgraded=1`, reload ×2 → **1000/1000**. Cancel → **Free (0 remaining of 25)**, persists on reload. Fly `count:1` on upgrade; downgrade logged only on explicit cancel. v105→v107 did not regress. |

## Part 3 — Release hygiene

| # | Test | Result | Evidence |
|---|---|---|---|
| 12 | Temp shop-scoped workaround absent from deployed; no debug branches; `.env` restored + culprit found | **PASS** | (a) Fault-injection path removed in `d3a55ba`; `grep` for `forced_unauth / fault-inject / *_DIAG / test-store` across `app/` `prisma/` = **empty**. (b) Deployed v107 = `main` HEAD `0fb4754` — proven by live production log strings matching `main` source verbatim, and by the dev2 cancel logging the *clean* downgrade message (no `forced_unauth_diag`). Reconcile runs the clean `getActiveSubscriptions` (downgrade only on authoritative empty). (c) `.env` restored from `.env.example` structure (real keys, dev-safe values); the product-list overwrite saved to `.env.corrupted-productlist-2026-07-13.txt`. **Culprit:** the overwrite is EBS storefront category/brand/colour navigation (askebs.com.au) written on **2026-07-13**; no code in this repo writes to `.env` (grep for `writeFileSync/appendFileSync .env` = empty), so it was an external save from EBS-website content work pointed at the wrong path — not the app. |
| 13 | git status clean; tests/lint/typecheck/build clean | **PASS** | `git status` → **clean** (the 28 "modified" files were pure CRLF↔LF line-ending churn — `git diff -w` empty; normalized with `core.autocrlf=true`). CI #74 on `main` HEAD = **Success**: **Lint ✓ · Unit tests ✓ · Build ✓**; Type check ✓ (runs `continue-on-error` per project config — non-blocking, ran clean). |

## Part 4 — The proof recording

| # | Test | Result | Evidence |
|---|---|---|---|
| 14 | Visible synthetic pointer + click ripples, every scene | **PASS** | A fixed-position overlay cursor (dark dot + white ring, `pointer-events:none`, max z-index) was injected into every page — app Plans **and** Shopify's admin/charge-confirmation pages — and driven per scene; re-injected after every navigation. A red click **ripple** fires on both key clicks. Pointer visible & moving in all 15 frames. |
| 15 | One screencast, exact reviewer sequence, URL visible | **PASS** | `navaal-billing-1.2.3-proof.gif` (15 frames): Plans/Free → pointer to Upgrade (ripple) → confirm page (URL & $79.99 readable) → pointer to **Approve** (ripple) → in-admin banner → **reload → still Professional** → Dashboard → back to Plans → still Professional. The real URL is shown top-of-frame as a live `location.href` readout at every transition. |
| 16 | Frame-by-frame review before handoff | **PASS** | All 15 frames reviewed: pointer visible & moving every scene; ripples on both key clicks (Professional card + **Approve**); opens on the app (Plans/Free — no login/account-chooser); **no personal email**; only `navaal-qa-fresh` appears; no permission-error flicker; URL legible at every transition. |

---

## Two honesty notes (behavior passed; evidence caveats)

1. **DB values (items 5, 9) verified by proxy, not a direct `prisma.plan` query.** The
   repo `.env` had no `DATABASE_URL` and the Fly shell isn't reachable from this session,
   so I could not run a raw DB read. Instead: the Plans page's quota ("1000 remaining of
   1000") **is** the DB-backed plan rendered on every load, and production logs confirm the
   writes (`Billing callback processed active:true count:1`; `All shop data deleted after
   uninstall`). If you want a literal DB row dump, run `DIAG_SHOP=navaal-qa-fresh.myshopify.com
   node scripts/diag-shop.cjs` on the Fly machine.

2. **The recording's URL is a live on-page readout, not the browser's own URL bar.** This
   remote session drives Chrome but can't OS-capture the window chrome or run headed Chrome
   itself. The readout shows the genuine `location.href` at each step (agreed approach). For
   the literal browser URL bar, run `node scripts/billing-review-recording.mjs` on Windows
   and OS-record the window.

**GO.** All 16 items pass.
