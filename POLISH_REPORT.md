# ContentClaude — Final Polish Round Report

**Date:** 2026-06-23
**Prod:** `https://contentclaude.fly.dev` — deployed and verified (new bundles live, immutable).
**Toolchain:** typecheck ✓ · lint ✓ · build ✓ · 149 tests ✓ (necessary, not sufficient).

> **Honesty note.** I can fetch the prod origin and confirm code/bundles/timings, but I **cannot drive the embedded OAuth'd browser**, so I cannot visually confirm a screen "paints in 2s" or that colours look right. Where the proof is visual, I say so and put it on the founder's-eyes list. I did not fabricate any browser measurement.

---

## ISSUE 1 (P0) — Plans/Analytics freeze
**Reproduced root cause (Plans).** The `/app/plans` loader `await`ed `billing.check()` — a Shopify Billing API round-trip — **first, before anything else**. On a cold embedded load the sequence was: token-exchange → **billing.check (slow/serial)** → sync → DB queries, all blocking the first paint. A slow billing call is exactly what "hangs the tooling for minutes." (Analytics had no billing.check; its loader was already parallelized, but its `productsCount` Admin call ran uncached on every load.)

**Plus a second, infra-level factor I measured:** the prod machine **cold-starts in ~16s** (Node + Prisma + BullMQ boot) when it has auto-stopped. On a first hit after idle, that 16s stacks on top of any loader latency — so "Plans froze ~40s" ≈ 16s cold boot + slow serial `billing.check`. This is separate from the route code.

**Fixes (smallest correct):**
- `app/routes/app.plans.jsx` — the DB plan (kept current by the `app_subscriptions/update` webhook) now renders **immediately**; `billing.check` + `syncBillingToPlan` are **streamed (deferred)** via `<Suspense>/<Await>` and only trigger a revalidate if they find a change the webhook missed. Billing is **no longer on the paint path.**
- `app/routes/app.analytics.jsx` — `productsCount` now uses the **same 5-min cache key** as the dashboard, so the loader is effectively DB-only on a cache hit.

**Measured (prod, `node --use-system-ca`):**
- Warm origin: `/api/health` **41–107ms**; Plans bundle **46ms**, Analytics bundle **14ms** (both `200, immutable`, new hashes → deployed).
- Cold-start (machine boot): **~16.4s** on the first call, then warm.

**Honest limits / founder's eyes:** I removed `billing.check` from the loader's blocking path (verified in code) and measured the server/origin fast — but I **could not measure the browser main-thread block time** (no embedded browser). The founder must visually confirm Plans + Analytics now paint quickly. **Recommendation:** to avoid the ~16s first-hit cold-start for real merchants, keep one machine warm (`min_machines_running` is 1, but `auto_stop_machines = "stop"` still idles it — consider `auto_stop_machines = "suspend"` or keeping it always-on) — a cost/ops decision, flagged, not changed.

---

## ISSUE 2 (P0) — Unify & label the scores
The three numbers are **genuinely different metrics**; the bug was that they were unlabelled and one was alarming-red. Now:

| Screen | Metric | Label now | Colour |
|---|---|---|---|
| Welcome / magic moment | GEO (AI-search readiness, `geo.server`) | **"GEO / AI-search score"** | success/critical (already labelled) |
| SEO Audit *(prompt said don't touch)* | Traditional SEO (`seo.server`) | "/ 100 average SEO score" | unchanged |
| **Review & Publish** | Content quality (`contentScorer`) | **"Content quality: N"** (was bare "Score: 50") | **≥75 success · ≥45 amber · <45 red** (was <60 → red) |

So a 50 on Review now reads as neutral amber, not "this content is bad — don't publish." Each score is labelled and visually distinct. (They *should* differ per product — they measure different things — so they're not "inconsistent," just previously unlabelled.) `app/routes/app.review.jsx`.

---

## ISSUE 3 (P1) — Visual consistency (bounded list, all applied)
- **Primary CTA colour:** dashboard "Optimise Store", "Upgrade Plan", and the onboarding-step CTAs now use the **brand green** (`tone="success"`) to match "Generate Content" — one primary treatment on that screen. (`app/routes/app._index.jsx`)
- **Usage progress bars:** dropped the blue `highlight` mid-band — now **brand green until the 90% critical (red) threshold** across Dashboard, Plans, Products, Analytics, Blog. (5 files)
- **Low "Content Coverage":** softened from alarming red to **amber text + neutral bar** (still signals "low"). (`app/routes/app.analytics.jsx`)
- **Blog placeholders:** the catalog-mismatched "Vitamin C" / "skincare, beauty, wellness" → **neutral, store-agnostic** prompts. (`app/routes/app.blog.jsx`)

**Founder's eyes:** these are colour/spacing changes I cannot render — please eyeball that the green CTAs and green bars look harmonious on each screen. A full app-wide button-system audit is a visual pass only you can sign off.

---

## ISSUE 4 (P2) — Products select-all freeze
**Investigated, documented as not-reproducible-from-code.** `/app/products` select-all targets only the **visible ≤50 products** (the `ResourceList items` are the 50/page `filteredProducts`, not the whole catalog), and the per-row badges/counts come from the **loader** (no heavy client computation triggered by selection). There is no O(n²) or store-wide selection that would freeze the main thread. Consistent with your "low-confidence, worn-tab" observation. I did **not** change the working list speculatively. If it reproduces on a clean load, send me the product count + a profile and I'll fix the specific cause.

---

## What still needs the founder's eyes (before submit)
1. **Visually confirm Plans + Analytics** paint fast and stay interactive on a cold *and* warm load (and decide on the warm-machine tradeoff for cold-starts).
2. **Eyeball the colour changes** (green CTAs, green usage bars, amber coverage) for harmony on each screen + mobile.
3. The standing pre-submit items: **billing-approval click-through**, **real-device mobile pass**, **App Store listing assets** (screenshots/banner/icon), **final pricing/flag decisions** (incl. flipping `FEATURE_MAGIC_MOMENT` off for real merchants — it's currently on for your test).

---

## Files changed
`app.plans.jsx` (defer billing.check), `app.analytics.jsx` (cache productsCount + soften coverage + usage bar), `app.review.jsx` (label + threshold), `app._index.jsx` (CTA colour + usage bar), `app.products.jsx` (usage bar), `app.blog.jsx` (usage bar + placeholders), `POLISH_REPORT.md`. No regressions to the magic moment, metering, plan gating, billing, deferred welcome scan, or error boundaries.
