# ContentClaude — Final Hardening Report

**Date:** 2026-06-23
**Prod (single target):** `https://contentclaude.fly.dev` — verified live this pass.
**Toolchain:** typecheck ✓ · lint ✓ · build ✓ · **149 tests** ✓ — treated as necessary, *not* sufficient.

> **Honesty contract.** This session has repeatedly had green tests/health while the live app was broken (stale-secret 401, dead-tunnel routing, blank panes). So below I separate **what I actually exercised/measured** from **what still needs your eyes or a real store**. I do not claim any visual render, mobile pass, or 10k-product behavior I did not run.

---

## PART 1 — Reliability (verified this pass)

| Area | Status | How verified (real, not assumed) |
|---|---|---|
| **Atomic quota under concurrency** | ✅ **Proven** | Fired **12 generations truly concurrently** (forced real parallel DB connections) against the live Neon DB, limit 5 → **exactly 5 allowed, 5 usage records, plan never exceeded**, in 339ms. Serializable txn + P2034 retry = over-limit requests denied safely, never over-counted. |
| **No secret/flag leak to client** | ✅ **Proven** | Grep of the freshly-built `build/client/assets/*.js`: **no** `ANTHROPIC_API_KEY` / `SHOPIFY_API_SECRET` / `sk-ant-` / `FEATURE_MAGIC_MOMENT`. `.server.js` stripping works. |
| **Webhook idempotency (autopilot)** | ✅ **Fixed** | `webhooks/products.create`: now skips if an autopilot job for the same product is already queued/processing → no duplicate jobs / double-charge on Shopify **redelivery**. Atomic metering is the backstop. (`app/routes/webhooks.products.create.jsx`) |
| **Embedded session/auth** | ✅ **Fixed (prior turn) + confirmed** | The 401 bounce was a **stale `SHOPIFY_API_SECRET` on Fly**. Corrected from the Partner-Dashboard value (cryptographically verified it signs the real session-token JWT). `/api/health` 200 after the credential roll. |
| **Truncation-/malformed-safe AI parsing** | ✅ **Solid** | `extractTag` recovers content when the closing tag is missing (max_tokens cutoff) and still sanitises; 6 dedicated tests pass. `sanitizeHtml` strips script/style/iframe/handlers. |
| **Error boundaries on every route + shell** | ✅ **Confirmed** | `AppRenderBoundary` wraps the `<Outlet/>` in `app/routes/app.jsx` (render crashes → Banner + Reload/Try again); per-route `RouteError` (loader/render → friendly retry, never blank); welcome adds `<Await errorElement>` for the streamed scan. |
| **External-call defence** | ✅ **Solid** | Anthropic client: 45s timeout + retry/backoff + **circuit breaker** + proactive rate-limit backoff. Shopify fetches in the bulk worker: 429/THROTTLED backoff + retries. Redis cache degrades gracefully to in-memory (observed live: "stream isn't writeable" tolerated, then reconnected). |
| **Webhook HMAC + GDPR** | ✅ **Solid** | Every webhook uses `authenticate.webhook` (HMAC). The 3 GDPR mandatory topics + `app/uninstalled` do transactional cleanup. |

**Reliability gap I'm flagging (not fixed this pass):** the `generateAll` / `optimizeStore` action collects *all* product IDs **synchronously in the request** (up to 80 Admin pages × 250). On a very large catalog (~10k+), that's ~tens of sequential Admin calls inside one request → slow / possible timeout. Recommended fix: move ID-collection into the BullMQ worker. Flagged, not changed (bigger refactor; out of "smallest change" scope for this pass).

---

## PART 2 — Performance & freshness

| Item | Before | After | Verified |
|---|---|---|---|
| **Dashboard data fetch** | Admin `productsCount` **awaited sequentially**, *then* 8 DB queries | All folded into **one `Promise.all`** → latency ≈ slowest single call (productCount usually cached 5 min) | Code + build; new bundle live on prod |
| **Welcome first paint** | loader blocked ~20s on the scan | **Streamed**: shell + skeleton instant, scan fills in; scan failure → error+Retry | Deployed prior turn; prod bundle live |
| **Bundle freshness** | — | Content-hashed + `cache-control: public, max-age=31536000, immutable`; new deploy ⇒ new hashes | Fetched new `app._index-OhyNeEBT.js` & `app.welcome-DHXy2aPc.js` from fly.dev → **200 immutable** |
| **Origin latency** | — | `/api/health` **110ms**, `/favicon.svg` 15ms from fly.dev | Measured this pass (`node --use-system-ca`) |
| **Hot-path queries** | `getContentMetrics` was 4 round-trips | **1 grouped query** + covering index `(shop,status,productId)` | Prior pass; test asserts single round-trip |

**Largest scale I actually validated:** **12-way concurrency** on the quota path (passed). I did **not** have a 1k–10k-product store to test catalog-size behavior live — see human-only list. What protects scale in code today: welcome scan capped at 30 products; SEO audit capped at 500 with a 25s budget; Products list paginated 50/page with content scoped to the visible page; bulk generation runs in the BullMQ worker with a throttle. The `generateAll` ID-collection above is the one place that doesn't yet scale cleanly.

**Not done (flagged):** full streaming-deferral on *every* heavy route. I parallelized the dashboard (smallest correct fix for its specific bottleneck) and fully streamed only the welcome route (where the block was unavoidable). Analytics / Products / Plans / Optimise / Review have client-nav skeletons + bounded loaders but not initial-load streaming. Applying the welcome pattern to them is the obvious next step.

---

## PART 3 — UI/UX

**Polished in this and prior passes (in the code):** four designed states (loading skeletons, empty, error, success) on the data routes; keyboard `:focus-visible`, `prefers-reduced-motion`, `aria-hidden` on decorative icons, `aria-pressed` on the tone toggles; mobile.css reflow rules; consistent Polaris usage; the welcome before→after with the GEO-lift badge.

**Honestly NOT a completed deliverable this pass:** a full per-screen visual/design review, a complete WCAG-AA audit, and **real-device mobile** verification. I cannot load the embedded (OAuth'd) app in a browser from here, so I have **not** visually confirmed pixels, layout shift, or mobile breakpoints on the live app. These are in the human-only list — I won't fake them.

---

## PART 4 — Honest scorecard (0–100, conservative)

| Dimension | Score | Basis / what's missing |
|---|---|---|
| **Functionality** | 87 | Core flows built; magic-moment BEFORE→AFTER verified live earlier; some surfaces unconfirmed in-browser this pass. |
| **Reliability** | 90 | Atomic quota proven under concurrency; idempotent webhooks; error boundaries; circuit breaker; secret-safe; auth fixed. −for the `generateAll` scale gap + no full chaos/large-catalog test. |
| **Performance** | 85 | Welcome streamed, dashboard parallelized, immutable bundles, 110ms origin. −full per-route streaming + live large-catalog/worker-throughput numbers not gathered. |
| **UI/UX** | 83 | States designed, a11y basics, consistent Polaris, polished welcome. −full a11y audit, real-device mobile, per-screen design review, in-browser render confirmation. |
| **Revenue / Conversion** | 78 *(est.)* | Plan gating + upgrade prompts + ROI/value framing exist and are honest (no dark patterns). Outcome is market/listing-dependent — an estimate, not a measured number. |
| **Overall** | **85** | Deployment-grade and hardened; the remaining points are browser-/device-/store-dependent verification and per-route polish, not core defects. |

---

## Human-only checklist (I cannot do these; do NOT consider them done)
1. **Visually confirm the live embedded app** on prod: welcome shell+skeleton ≤~2s then scores, fresh AFTER generation with the GEO-lift badge **and no renderer freeze**, dashboard paints fast, no blank/401.
2. **Real-device mobile** pass (Shopify mobile admin + small widths).
3. **Large-catalog test** on a real 1k–10k-product store (watch the `generateAll` action + worker throughput); tell me the numbers and I'll tune.
4. **Billing approval click-through** on each paid tier (managed pricing screen → approve → cap/entitlement unlock).
5. **App Store listing assets** (real PNG screenshots, promo banner, 1200×1200 icon upload) + privacy-policy URL.
6. **Final pricing + flag decisions** (Scale tier number; when to flip `FEATURE_MAGIC_MOMENT=on` for real merchants — it's currently on for your test).

---

## What still stands between this app and #1 in its category — blunt
The product is now hardened and fast; that is necessary but **not** what wins the category. The deciding factors are mostly **out of code and yours to do**:
1. **Distribution / installs.** Nothing ranks without traffic to the listing — App Store SEO, content marketing on the GEO/AEO angle (your real differentiator), partnerships with agencies/theme vendors.
2. **The first ~50 reviews.** The single biggest ranking + conversion lever, and you start at zero. The in-app review loop is compliant and well-timed, but you must earn them with real outcomes and fast support — never incentivised.
3. **Fast human support.** Sub-day response drives reviews and retention more than any feature.
4. **Prove outcomes with real data.** The ROI surfaces are honest but estimate-based until GSC/real-traffic is wired (a flagged P1) — real before/after lift is the strongest marketing you have.
5. **Finish the verification you can only do with eyes + a real store** (the human-only list) — because, as this session proved, green tests ≠ a working screen.

Close those, and the engineering underneath is ready to convert and retain.

---

## Files changed this pass
- `app/routes/app._index.jsx` — parallelize dashboard data (productsCount folded into `Promise.all`).
- `app/routes/webhooks.products.create.jsx` — idempotent autopilot (skip duplicate pending job on redelivery).
- `HARDENING_REPORT.md` — this report.
- No regressions to: magic-moment flow, metering, plan gating, billing, mojibake fix, deferred welcome scan, error boundaries, prod routing.
