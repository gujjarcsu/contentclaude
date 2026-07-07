# ContentClaude — Honest Launch Audit
_Date: 2026-07-01 · No spin. Based on the actual code, not memory._

## Bottom line
The app is **functional and genuinely differentiated (GEO), but not launch-ready.** The gap is not core capability — it's **reliability, consistency, unfinished-but-hidden features, and proof.** The single biggest strategic problem: it's been polished in a dev store instead of shipped to real merchants. The fastest path to "best in category" is to close the Phase-0 list below, launch to a small cohort, and let real usage drive the rest.

Legend: 🟢 works · 🟡 rough / needs polish · 🔴 broken or missing

---

## Per-screen assessment

| Screen | State | Honest notes |
|---|---|---|
| **Dashboard** (`app._index`) | 🟢🟡 | Works. Now leads with the GEO value banner. Busy — lots of cards; needs a visual hierarchy pass. **Missing the "proof"** merchants care about (results are behind an OFF flag). |
| **Welcome / magic moment** (`app.welcome`) | 🔴 | The 5-minute "wow" first-run flow exists but is **behind `FEATURE_MAGIC_MOMENT`, which is OFF** — so real merchants never see it and land on a cold dashboard instead. This is your activation moment and it's disabled. |
| **Products list** (`app.products`) | 🟢🟡 | Works. Bulk "Generate All" is Growth-gated; the gating→upgrade flow is functional but the messaging could be crisper. |
| **Product detail** (`app.products_.$id`) | 🟢🟡 | The workhorse — generate, edit, version history, A/B variants, alt text. **1,846 lines** — biggest file, most surface area for UI inconsistency and bugs. Content is edited as raw HTML in a textarea (fine for power users, rough for others). Needs the most polish. |
| **Optimise Store** (`app.optimize`) | 🟢🟡 | Bulk pipeline works. Growth-gated. Progress now updates smoothly. |
| **Review & Publish** (`app.review`) | 🟢 | Recently improved — clear Approve/Skip, accent stripes, prominent publish. Good shape. |
| **SEO Audit** (`app.seo-audit`) | 🟢🟡 | Works; labelled scores; GEO context added. Could show GEO score alongside SEO for consistency with the wedge. |
| **Blog generator** (`app.blog`) | 🟢 | **Now working** (was crashing on a bad icon prop + publish 500 — both fixed). Preview-first editor, special instructions, FAQ/visual toggles, guidance. Verified live: generation + publish. |
| **My Blog Posts** (`app.blog.posts`) | 🟡 | Functional list; not recently reviewed for polish. |
| **Collections** (`app.collections`) | 🟡 | 510 lines, collection-voice generation. **Not reviewed recently — polish/reliability unverified.** Flagging honestly. |
| **Analytics** (`app.analytics`) | 🟢🟡 | Metrics work, cached. Reports usage/coverage, not *outcomes* (rankings/AI citations) — which is what retains. |
| **Jobs** (`app.jobs`) | 🟢 | Live progress now smooth + bigger; cancel/retry work. |
| **Settings / Brand voice** (`app.settings`) | 🟢🟡 | Works and it's important (brand voice drives generation quality). Worth a UX pass since it gates output quality. |
| **Setup / onboarding** (`app.setup`) | 🟡 | Step flow exists but competes with the (disabled) magic-moment flow — onboarding story is split/unclear. |
| **Plans & Billing** (`app.plans`) | 🟢 | **Now working** after a chain of fixes (lineItems, public distribution, iframe redirect). Test billing works on dev store. |

---

## Cross-cutting issues (these matter more than any single screen)

### 🔴 1. Reliability — the #1 risk
- **Auth/token fragility.** Expiring offline tokens (~1h) + the embedded re-exchange throwing 500 caused "Unexpected error" everywhere. I added an auto-refresh chokepoint, but **it must be proven stable over days of real use.** Until then, this is the top launch risk.
- **Background-job token edge.** Long bulk jobs / autopilot use the same offline token; a job spanning the 1-hour expiry can fail mid-run. Not yet hardened.
- **The "fix one, break three" pattern** is real and comes from me not seeing the rendered UI — runtime/visual bugs pass build+tests and slip through. Mitigation = smaller verified batches + you testing each.

### 🟡 2. Half-built, hidden features
Six features sit behind **OFF flags** — built but invisible: `magicMoment`, continuous monitoring, weekly digest, **results dashboard**, category benchmarking, **review prompts**, results badge. This is wasted effort until decided. **Each must be either finished + turned on, or cut.** The two that matter most for success — **magic-moment onboarding** and **results/proof dashboard** — are exactly the ones that are off.

### 🟡 3. Dead code / inconsistency
- `HelpSidebar` and `HelpTooltip` components exist but are **used nowhere.** Wire them or delete them.
- Design consistency has improved (green CTAs, unified score colors, GEO banner) but has **never had a holistic visual pass with human eyes** — which only you can do.

### 🟡 4. The differentiator isn't proven live
- **Storefront GEO** (llms.txt + Product/FAQ JSON-LD via the theme app embed) is built but requires the merchant to enable the theme embed, and hasn't been verified on a live, password-off storefront. The core promise ("get cited by AI") isn't demonstrably live end-to-end yet.

### 🟡 5. No proof / outcome loop
- The app shows *activity* (generations, coverage) but not *outcomes* (GEO score trend, AI citations, before/after). **Proof is what drives retention and 5-star reviews.** The results dashboard is built but off.

---

## Launch-readiness checklist

### Phase 0 — MUST fix before launch (gate)
- [ ] **Reliability holds:** confirm the token auto-refresh survives multi-day real use; harden the background-job token edge; zero known crashes.
- [ ] **Decide the flagged features:** turn on magic-moment onboarding + a results/proof view, or cut the rest. No half-features shipping.
- [ ] **Onboarding is one clear story** (magic moment as the default first run), not two competing flows.
- [ ] **Holistic design pass** (your eyes): consistent CTAs, spacing, hierarchy across all screens.
- [ ] **Verify the GEO promise live:** enable the theme app embed on a test store, confirm llms.txt + JSON-LD are actually served and valid (Google Rich Results test).
- [ ] **Remove dead code** (HelpSidebar/HelpTooltip or wire them).
- [ ] **Flip `BILLING_TEST_OVERRIDE` OFF** before real merchants (currently on for testing — real merchants would get free subscriptions).
- [ ] **Compliance:** privacy policy URL, GDPR webhooks (present ✓), data-handling clarity.

### Phase 1 — Launch
- [ ] **App Store listing:** sharp GEO headline, real screenshots, 30–60s demo video, clear pricing, keywords.
- [ ] **Submit for review** (managed billing + public distribution already set).
- [ ] **Review-ask engine:** gentle, compliant prompt *after* a merchant hits a win (never incentivized).
- [ ] **Finalize pricing** (Scale tier decision).
- [ ] **Get the first 10–50 merchants** and instrument what they actually do.

### Phase 2 — Grow (post-launch, driven by real data)
- [ ] Proof/measurement loop (GEO score trend, monthly report, category benchmarks).
- [ ] Content marketing — publish GEO guides (you'll rank for what you sell).
- [ ] Retention hooks (auto-scan new products, digests, autopilot).
- [ ] Pricing/packaging optimization from real conversion data.

---

## Honest priority order
1. **Reliability** (token stability + no crashes) — nothing else matters if it breaks.
2. **Decide + finish the onboarding "wow" and the proof view** — activation + retention.
3. **Prove the GEO promise live** on a storefront — it's your entire wedge.
4. **One design pass with your eyes** — consistency.
5. **Launch small.** Then let real merchants, not the dev store, drive Phase 2.

The capability is here. What stands between this and "best in category" is **finishing what's half-built, proving it works, and getting it in front of real merchants** — in that order.
