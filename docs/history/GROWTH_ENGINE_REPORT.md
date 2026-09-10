# ContentClaude — Growth Engine Report

**Date:** 2026-06-19
**Thesis:** #1 isn't won by more features — it's won by time-to-value, retention, provable outcomes, reviews/social proof, a defensible wedge (GEO — already built), and smart monetization. This pass builds the **in-app machinery** for those. The decisive non-code work (installs, marketing, the first reviews, fast support, partnerships) is the **human's job** — see the final section; it is at least as decisive as anything here.

**Verification:** prisma schema valid · typecheck ✓ · lint ✓ · build ✓ · **tests 149 pass** (+23 this pass). No regressions to metering, metrics, gating, billing, GEO engine, or the mojibake fix.

> **Discipline / shippability.** Every new capability is **flag-gated off by default** via a new feature-flag system, so the app stays launch-ready at every checkpoint. This pass ships the **backbone logic** for the highest-leverage pillars — Provable Outcomes (Phase 3), the Benchmarking Moat (Phase 4), and Compliant Reviews (Phase 6) — plus the flag keystone. These are pure, tested modules. Their **UI surfaces** and the remaining phases (1, 2, 5, 7) are specified below with status; nothing half-built is wired into a live route.

---

## Keystone — Feature-flag system — **SHIPPED**
`app/utils/featureFlags.server.js` (+ `tests/utils/featureFlags.test.js`). Env-driven registry; **all flags default OFF** (test-enforced). Enable per-env: `FEATURE_<NAME>=on`. `isFeatureEnabled(name)` / `getFlagSnapshot()`. This is what makes "big but safe" possible — incomplete work ships dark.

---

## Phase 1 — Time-to-value (5-minute magic moment) — **NEXT (flag: `magicMoment`, off)**
**Designed, not yet wired:** first-run auto-scan → compute GEO+SEO (engines exist) → auto-generate a real before→after on the merchant's own best/worst product → one-click "Optimize my store" → first-run checklist to the activation win. **Reuses:** GEO/SEO scorers, generation pipeline, `GrowthState.activationAt` (shipped this pass) to record the activation milestone. **Build next:** a first-run orchestration route + brand-voice auto-detect from existing best content.

---

## Phase 2 — Retention & anti-churn — **NEXT (flags: `continuousMonitoring`, `weeklyDigest`, off)**
**Designed:** extend Autopilot (don't duplicate) to re-scan changed products and surface drift, paced by `GrowthState.lastScanAt`; weekly health digest (in-app always; **email needs a provider — flagged**); smart alerts on score drop / missing content / schema decay; win-back for dormant shops. **Shipped enabler:** `GrowthState.lastScanAt` field + monitoring flag.
**External:** email provider (Resend/Postmark) for the email channel.

---

## Phase 3 — Provable outcomes / ROI — **ENGINE SHIPPED** (dashboard UI: NEXT, flag `resultsDashboard`)
`app/utils/roi.server.js` (+ `tests/utils/roi.test.js`):
- `computeRoiSummary()` → measured SEO Δ, **GEO Δ**, coverage %, content pieces, distinct schema types added, AEO-ready flag — **plus a time-saved value that is explicitly an estimate** (`isEstimate:true`) with a transparent `basis` string (`pieces × ${MINUTES_PER_PIECE_MANUAL} min`).
- **Honesty test-enforced:** the output JSON is asserted to contain **no** `revenue` / `traffic` / `sales` fields. Nothing fabricated.
**How to test:** `npx vitest run tests/utils/roi.test.js`.
**NEXT:** results dashboard + shareable results view (the testimonial seed) consuming this summary. Real GSC impressions/clicks land in Phase I (P1).

---

## Phase 4 — Data flywheel & moat (benchmarking) — **SHIPPED: data model + math + opt-in persistence** (UI: NEXT, flag `categoryBenchmarking`)
The durable, scale-compounding asset — and the prompt said *prioritize the schema*. Done:
- **Privacy-safe data model** (`prisma/schema.prisma`): `CategoryBenchmark` stores **only** anonymized 10-bucket score **histograms + sample count per category** — never any per-store row, so no individual shop's score is recoverable. `GrowthState.benchmarkOptIn` gates participation.
- `app/utils/benchmark.server.js` (+ `tests/utils/benchmark.test.js`): pure histogram math (`bucketIndex`, `addToBuckets`, `percentileRank`, `medianScore`, `quartileLabel`) and `recordBenchmarkSample()` / `getBenchmarkStanding()` — **double-gated** on the feature flag AND explicit opt-in, with a **MIN_SAMPLE=20 floor** before any benchmark is shown (statistical + privacy soundness).
**How to test:** `npx vitest run tests/utils/benchmark.test.js` (percentile/median correctness, malformed-input tolerance).
**NEXT:** "Your GEO score is X; category median Y; you're in the {top quartile}" UI card. **External:** opt-in consent copy + privacy-policy update before enabling the flag.
**AI-answer simulation (Phase 4):** designed — compute "does this product have what an AI assistant needs to cite it?" from the merchant's own content via the GEO breakdown (no external API for MVP); live multi-engine checks are P1 (`aiVisibilityTracker`, off).

---

## Phase 5 — Conversion & monetization — **NEXT (extends existing)**
**Designed:** smart paywall + high-intent nudges at quota cap / low GEO score / bulk-needed / first-win (reuse usage + entitlement state already present); trial optimization; **expansion revenue** via usage-based overage / add-ons (reuses the value-metric/Scale work from the GEO report) + annual framing; involuntary-churn reduction via dunning/retry messaging within Shopify's billing model. Billing stays **Shopify Billing API only**.

---

## Phase 6 — Reviews & social proof — **ENGINE SHIPPED** (modal UI: NEXT, flag `reviewPrompts`)
`app/utils/reviewPrompt.server.js` (+ `tests/utils/reviewPrompt.test.js`):
- `evaluateReviewPrompt()` gates the App Store review ask. **Compliance is enforced in code:** fires **only** on a genuine success milestone; **never after an error**; frequency-capped (min 30-day interval, 90-day cooldown after dismissal, **lifetime cap of 3**); **no incentive logic anywhere** (the module only gates timing, never rewards).
- Persistence via `GrowthState` (`reviewPromptLastAt/DismissedAt/Count`).
**How to test:** `npx vitest run tests/utils/reviewPrompt.test.js` (error-suppression, milestone gating, all three caps).
**NEXT:** the neutral, dismissible modal component + testimonial/case-study capture (consented) + the opt-in "AI-search optimized" results badge (`resultsBadge` flag). **Referral mechanic:** flagged **out of scope** unless verified within Shopify policy. **External:** App Store listing review URL.

---

## Phase 7 — Trust, performance & Built-for-Shopify — **PARTIAL (carried forward) + checklist**
Already in place from prior passes: bounded loaders / O(page) queries / metrics 4→1 / covering index (performance); circuit breaker + retries/backoff + graceful degradation + `/api/health` (reliability); Sentry hooks (`errorMonitoring.server.js`). **NEXT:** in-app support surface (help/contact widget) and a Core Web Vitals budget check.
**Built-for-Shopify readiness checklist (mapped to current requirements — NOT a claim of the badge, which is a separate application/review):**
- [x] Embedded + App Bridge · [x] Session-token auth on every route · [x] Billing via Shopify Billing API · [x] GDPR mandatory webhooks (HMAC-verified) · [x] Least-privilege scopes · [x] Polaris UI · [x] Web Vitals not regressed (skeletons, no blank-load freezes) · [ ] **In-app support contact** (build next) · [ ] **Listing assets / demo video** (owner) · [ ] **Submit BFS application** (owner/Shopify process).

---

## Plan gating (intended mapping; entitlements wired as each UI lands)
| Capability | Free (hook) | Starter | Growth | Pro/Scale |
|---|---|---|---|---|
| GEO Readiness Score (read-only) | ✓ | ✓ | ✓ | ✓ |
| ROI / results summary | ✓ (basic) | ✓ | ✓ | ✓ |
| llms.txt, GEO generation | — / limited | ✓ | ✓ | ✓ |
| Continuous monitoring + digest | — | — | ✓ | ✓ |
| Category benchmarking (moat) | — | — | ✓ | ✓ |
| AI-visibility tracker / GSC / multi-lang (P1) | — | — | — | ✓ |
UI gating + server entitlements stay in sync via the existing `getEntitlements()` / `checkEntitlement()`, as established.

---

## Feature-flag status (all OFF by default)
`magicMoment`, `continuousMonitoring`, `weeklyDigest`, `resultsDashboard`, `categoryBenchmarking`, `reviewPrompts`, `resultsBadge`, `aiVisibilityTracker` (P1), `gscIntegration` (P1), `multiLanguageSeo` (P1). Flip via env when each UI surface is verified.

---

## External / owner dependencies (flagged — not faked)
- **Email provider** (Resend/Postmark) for digest/win-back email.
- **AI-visibility API keys + cost controls** (P1); **Google OAuth/GSC** (P1).
- **Opt-in consent + privacy-policy update** before enabling benchmarking.
- **App Store review-listing URL** (review loop); **listing assets / demo video**.
- **Built-for-Shopify application** (separate Shopify process).
- **Pricing numbers** (Scale/annual) — owner decision.
- **Trademark:** keep "Claude" out of user-facing/marketing copy — use "premium AI" / brand-voice framing.

---

## What only you (the human) must do to actually reach #1 — blunt version
The code makes these *easier and self-reinforcing*; it cannot do them for you. In rough priority:
1. **Distribution / installs.** Nothing here matters without traffic to the listing. App Store SEO (title/keywords), a category/landing page, content marketing on GEO/AEO (you have a genuinely differentiated story — use it), and paid trials if the unit economics work.
2. **The first ~50 reviews.** The single biggest ranking + conversion lever, and you start at zero. The in-app review loop is compliant and well-timed, but **you** must deliver experiences worth reviewing and never incentivize. Personally ask early happy merchants (outside the app is fine, neutrally).
3. **Fast, human support.** Sub-24h, ideally sub-few-hours, support drives reviews and retention more than any feature. Be present in the support inbox and the Shopify community.
4. **Partnerships & co-marketing.** Agencies, theme vendors, Shopify Experts, complementary apps. This is how category leaders compound installs.
5. **Content/SEO + GEO marketing of the app itself.** Practice the wedge on your own listing and site — rank for "AI search optimization Shopify", "GEO for ecommerce", "get products cited in ChatGPT".
6. **Decide pricing + submit Built-for-Shopify**, and keep iterating on activation from real funnel data.

The product is being built to be best-in-class so that when you do the above, it converts and retains. That division of labor is the honest path to #1.

---

## Files this pass
**Added:** `app/utils/featureFlags.server.js`, `app/utils/roi.server.js`, `app/utils/reviewPrompt.server.js`, `app/utils/benchmark.server.js`, `tests/utils/{featureFlags,roi,reviewPrompt,benchmark}.test.js`, `GROWTH_ENGINE_REPORT.md`.
**Changed:** `prisma/schema.prisma` (`GrowthState`, `CategoryBenchmark` models).
