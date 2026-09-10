# NORTH STAR — Navaal

One file. Read it before starting anything. If a piece of work does not move a number
in **The Scoreboard**, it is a distraction — however good an idea it is.

Last updated: 2026-09-10

---

## 1. THE GOAL

**Be the #1 app in the Shopify App Store SEO category, with real paying merchants and real revenue.**

Not "a great app". Not "more features". Number one, measured by the App Store's own ranking,
which is driven by reviews, rating, install velocity and the Built for Shopify badge.

---

## 2. THE LADDER — what #1 actually requires

Researched from the live category page and Shopify's own docs, 2026-09-10. These are facts, not targets I invented.

| Gate | Requirement | Why it is the gate |
|---|---|---|
| **Gate 1 — Built for Shopify** | 50 net installs from shops on **paid Shopify plans**, 5 reviews, a minimum recent rating, and admin performance p75 over 28 days measured across **at least 100 calls** | **All fifteen** top apps in the category carry the badge. It is the entry ticket, not a bonus. |
| **Gate 2 — Top ten** | roughly **150 reviews at 4.9+** | IndexGPT ranks #10 on **143 reviews**. AltKing #9 on 195. SEO HERO #15 on 171. You do not need 46,000. |
| **Gate 3 — Revenue** | ~150 paying merchants at ~$66 ARPU ≈ **$9.9k MRR** | Category ARPU is ~$25–35. We sell proof, not utilities, so we can hold a premium. |

**The brutal corollary:** at low review volume, **one one-star review is existential.**
Every promise the app, the listing or a plan makes must be one we keep on the worst day.

---

## 3. THE SCOREBOARD — the only numbers that matter

Update these weekly. Nothing else belongs on this list.

| # | Metric | Now | Next gate | Source of truth |
|---|---|---|---|---|
| 1 | Paid-plan installs | **0** | 50 | Partner Dashboard |
| 2 | Reviews | **0** | 5, then 150 | App Store listing |
| 3 | Rating | **—** | stay ≥ 4.9 | App Store listing |
| 4 | Built for Shopify | **No** | Yes | Dev Dashboard |
| 5 | MRR | **$0** | $1k, then $9.9k | Partner Dashboard |
| 6 | Monthly churn | **—** | ≤ 2% | our own data |
| 7 | Perf calls counted | **<100?** | ≥100, then p75 pass | Dev Dashboard |

Installs today: 1 real store (EBS, Free tier) + test stores. **Zero paying.**

---

## 4. THE STRATEGY IN ONE PARAGRAPH

The utility layer has collapsed to free — SEOLab is #5 in the category with 2,590 reviews and
charges nothing; Avada gives llms.txt away. We cannot win there and will not try.
The AI-visibility layer is pricing at $45–$99 with almost no traction: IndexGPT gates a prompt
tracker behind its top tier, CartRank charges $99 and has **zero reviews**. Nobody has both halves.
**Our position is the loop: generate → publish → prove the citation lift → regenerate what did not land.**
Generation is the acquisition wedge. **Monitoring is the business**, because generation finishes and
monitoring never does — and that is also the answer to churn.

---

## 5. DECISIONS LOCKED — do not re-litigate

| Decision | Locked |
|---|---|
| Pricing: Free / $19 / $49 / $99 / $299 | ✔ |
| Gate on **catalogue size**, be generous on generations | ✔ |
| Bulk generation at the **first paid tier**, not the third | ✔ |
| AI-visibility tracking in **every paid tier** (5 prompts at $19) | ✔ |
| SEO audit **never capped**, on any plan, at any catalogue size | ✔ |
| Enterprise = **bring your own AI key**, unlimited | ✔ |
| Annual = **25% off** (3 months free), default toggle position | ✔ |
| Trial = **14 days** (competitors run 3–7) | ✔ |
| Generations rejected by the quality gate are **never billed** | ✔ |
| Unused generations roll over **one month** | ✔ |
| Enterprise promises **onboarding call + 1-business-day response** — never "SLA" or "dedicated account manager" | ✔ |
| **No rank tracker.** Use Search Console's own position data | ✔ |
| AI probes carry an **honest method label** naming the model and the method | ✔ |

---

## 6. WHAT WE ARE DELIBERATELY NOT DOING

This is the anti-distraction list. Every line here was a tempting idea we rejected on purpose.

- **Not** competing on price at the utility layer. We lose to free.
- **Not** charging for or leading with llms.txt. It is a free commodity now.
- **Not** building a keyword rank tracker. Commodity, noisy, months of work, differentiates nothing.
- **Not** building features shaped around EBS. EBS is a diagnostic instrument, not the customer.
- **Not** claiming AI-search coverage we did not measure. Overclaiming here is the fastest route to a 1-star.
- **Not** adding a nav item or a new screen without removing something. The five-item nav was hard won.
- **Not** optimising anything a merchant cannot see. Field data already says performance is Good.
- **Not** trusting a harness that measures the wrong document. That produced four false greens.
- **Not** chasing 46,000 reviews. 150 at 4.9 is top ten.
- **Not** deploying per commit. Ten deploys in two hours *was* the incident.

---

## 7. THE PLAN — phases, in order

Nothing new ships on top of a phase that is not finished.

| Phase | What | Status |
|---|---|---|
| **A** | 29 real-store defects: the candidate primitive, scale caps, entitlement honesty, pre-existing content, variant families, cross-screen contradictions | **CLOSED `d21b5bb`** (A4.9, A6.6 blocked) |
| **B** | Discoverability, first-run order, Built for Shopify gaps (contextual save bars, dark pattern) | Not started |
| **C** | Pricing implementation, two-axis plans, migration, BYO key | Not started |
| **D** | The moat: port the AI-visibility probe, indexation proof, rich-result eligibility, Search Console proof, control-group holdback, **the weekly report** | Not started — plan first |
| **E** | Reach: multi-language, B2B/wholesale, Markets, enterprise audit trail + bulk undo | Not started |
| **Ongoing** | The store-shape fixture matrix | Not started |

**Phase D contains the business.** Phase A is what stops us embarrassing ourselves in front of the
merchants who would otherwise have reviewed us.

---

## 8. HOW WE WORK — rules that came from being wrong

1. **The false-green test.** For every check, ask what it would print if the thing it watches were
   completely broken. If the answer is "the same thing", it is not a check. *Four false greens so far.*
2. **The store-shape test.** For every fix, name the store shapes it must hold for and prove it against
   them. "It works on the store we tested" is not done.
3. **Never report a measurement you did not take.** An unmeasured number in a commit message becomes folklore.
4. **Verify from outside, cache-busted.** A save confirmation is not evidence. A cached read is not evidence.
   *I overwrote a verified fix with a stale read on 2026-09-10 — caught only by a byte count.*
5. **One real store beats 1,258 tests.** Five phases and four false greens found none of the 29 defects
   that one real catalogue surfaced in ninety minutes.
6. **Deploy at phase boundaries.** Not per commit.
7. **Never write to a live commercial catalogue.** Shopify has no undo for a bulk product edit.

---

## 9. OPEN — owner decisions only

- [ ] Confirm the Free tier's model spend (~$0.75/active free install/month) is acceptable.
- [ ] Confirm onboarding call + 1-business-day response will be honoured at Enterprise.
- [ ] navaal.ai/tools — keep or cut (it exists and now carries the install link, so: keep?).
- [ ] Bilby ↔ Navaal bundling: one company, two products, shared probe. Worth a plan.
- [ ] Done-for-you setup at $750 — process before promotion.

---

## 10. LOG

**2026-09-10**
- Found and fixed: every App Store link on navaal.ai pointed at the pre-rename handle and returned
  **404** — five occurrences across `/apps` and `/apps/navaal-seo`, including the `installUrl` inside the
  `SoftwareApplication` JSON-LD. Fixed, verified live.
- Found and fixed: `navaal.ai/apps` still displayed **"Coming soon · Shopify App Store"** with the live
  badge and install button hidden. A documented launch toggle had never been flipped. Fixed, verified live.
  → For the entire time this app has been published, **no visitor to our own website had a working path to install it.**
- Install attribution now live on all 67 static pages: `navaal-nav`, `navaal-footer` (CW),
  plus `blog-post` on 28 posts (CW), and `navaal-home` + `navaal-tools` added today.
  Still to place: `bilby-footer`, `bilby-report` — those live in the Next.js repo, not here.
- P1 fixed by CC: a deploy left **zero web machines running**. Worst-case response **17,085 ms → 2,052 ms**.
  All timing data captured before commit `d272222` is contaminated and must not be used as a baseline.
- Competitor research completed: 8 listings, full pricing. Pricing restructured on the findings.
- Master brief issued to CC: 5 phases, ~40 items, defects first.
- Phase A, CC: candidate primitive shipped (`2d9c37d`) — one unfiltered `productsCount` was the
  origin of five wrong numbers. Found while checking it: Shopify's `Count.precision` was never read,
  so above its ceiling a CAPPED count was shown as an exact catalogue total.
- Phase A, CC: variant families (`eaa319a`) — the duplicate gate would have HARD-FAILED seven
  legitimate finish variants at Hamming distance 0. Measured: verbatim 0 · two-word edit 10 (WARN) ·
  clause rewrite 21 (PASS) · genuinely different 34. The brief's "paraphrase = 11" re-measures as 10.
- Phase A, CC: cross-screen contradictions (`2f8dd98`) and the caps (`ea6ee27`). Collections was
  UNGUARDED as well as capped — a throttled read rendered "0 collections" as fact.
- Phase A, CC: standing commercial claims (`ea6ee27`) — a rewrite deleted the merchant's two-day
  dispatch, free pickup and price match and replaced them with "Available at EBS". Now two
  severities: compliance/certification hard-fail, commercial claims warn.
- INFRA, CC: **log retention shipped** (INFRA2) — Fly keeps ~100 lines, so no incident was traceable
  minutes later and A6.6 was blocked on it. A `LogEvent` table now keeps WARN-and-above plus tagged
  events for **30 days**, written through a pino multistream so redaction has already run. No new
  vendor, no new account. Read with `scripts/logs.mjs`.
- INFRA, CC: **INFRA1's own live proof found a hole INFRA1 widened** (INFRA8). `deploy.yml` runs no
  tests; before the dedupe it double-deployed but CI also shipped the tested copy. With the duplicate
  skipped, the manual path can become the ONLY deploy — and on the proof run it deployed at 15:56:46
  while CI's tests only went green at 16:00:36. It now requires a passing test check, and fails OPEN
  on an unreadable status because it is the repair path.
- INFRA, CC: **duplicate deploys are now a no-op** (INFRA1) — both `ci.yml` and `deploy.yml` skip a
  commit that is already live. Fails safe: an unreadable `build-info` deploys rather than skips.
- **PHASE A CLOSED and DEPLOYED as `d21b5bb`** — 19 commits, `0acb04a..d21b5bb`. Verified cache-busted
  from outside: build-info matches HEAD, deep health `ok`, schema columns 229 → 230 (exactly the one
  column the new migration adds). The P1 fix held: the deploy guard logged "2 web machines, all
  started". **Every Phase A fix is now live for merchants**; before this push none of it was.
- Phase A, CC: `A4.6`/`A4.8` — the voice inference read only product descriptions, which on the real
  store were templated boilerplate, while the merchant's differentiators sat in collection copy.
  Collections AND pages now ride the existing scan for FREE — both are root connections, which
  disproved the premise A4.8 was written on. Articles deliberately excluded: blog cadence is not
  product cadence.
- Phase A, CC: `A2.3`/`A2.4` — Optimize's catalogue walk used raw `admin.graphql` with no backoff
  (Phase 4 item 6 fixed the identical loop on Products and missed this one), and BOTH stopped at
  20,000 products **silently**: on a 50,000-product store "Optimize store" enqueued 20,000 and
  reported success. One shared enumerator now, and it reports why it stopped. Largest catalogue
  proven walkable: **20,000** (80 requests, 3.4 MB, simulated).
- Phase A, CC: the guiding docs said "CI is a gate, not a deploy". `ci.yml` line 140 deploys on any
  push to `main`. Following the docs — push, then dispatch Manual Deploy — reproduces the INFRA1
  double-deploy that P1 was opened to fix. Corrected in the prompt and the human queue.
- Phase A, CC: `A1.2` (`f02c0b2`) — the drafts opt-in had a column, a read path and a green suite,
  and **no control in Settings**. No merchant could ever turn it on. Found by reconciling the
  backlog against the code rather than against memory.
