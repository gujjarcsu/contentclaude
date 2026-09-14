# CC — PHASE 7 BRIEF: RELEASE THE VERSION, RECONCILE THE SCREEN, THEN BUILD THE SUBSCRIPTION

Paste this whole file. It replaces `CC-PROMPT-P0-RELEASE.md` and `CC-PROMPT-P6.md` (both moved to
`_superseded/`). Phase 6 is verified closed — production `6340991`, 255 columns, healthy, and your
Review-click proof at `e67bf22` is the right shape: three readings with the middle one as control.

Four parts, strictly in order. **Part A is a P0 and it comes before everything, including the rest
of your own queue.**

---

## PART A — P0: RELEASED. WHAT REMAINS IS THE COUNT, THE WINDOW, AND THE WRITE-UP.

**A1–A4 are done and verified from outside:** `p0-xss-f505584` active, created 06:46:10 UTC;
production `f505584`, deep health ok. Reading the Versions *list* rather than the command's own
output was the right proof. `--allow-updates` over `--force` on CLI 4.8.0 was the right flag for the
right reason — you wanted it to stop if it intended to delete anything.

**Your two corrections are both accepted, and one of them was my error.**

1. **The window is 69/74 days, not five.** Metafield writes began at `894e34f` (2 July); both locks
   arrived together in `7942c30`. Server lock live from the 9 Sep fly deploy (**69 days** of
   unsanitised writes); storefront lock live from today's version (**74 days** of unescaped
   rendering). The incident write-up says both numbers and why they differ.
2. **A4's second surface was wrong, and I wrote it.** I read the page myself at 06:58: `save 17%` ×3,
   `7-day` ×3, `99.90` ×3, `95.90` ×0 — and `14-day` ×3 beside them, so the listing currently says
   both. For a Billing API app the plan cards are typed in the Partner Dashboard pricing section;
   "updated automatically" means without resubmission, not derived from code. Corrected in
   `07-VERIFICATION.md` #12 under my name. **Routed as H12b to CW with the owner informed.** Nothing
   for you here except: do not let any doc say the listing price is derived from anything.

### A5 — the exposure count, with the corrected window
For **every installed shop**, every `contentclaude.faq_schema` metafield written **since 2 July**
(`894e34f`), not since 9 Sep. Check each question and answer for `<`, `>`, or an entity that decodes
to one. Read-only via stored offline tokens through the diag workflow. **No shop domains in CI logs**
— counts per shop, number of shops, name nothing.

- Dev/test store hit → re-normalise through `toPlainText` now.
- **Real merchant shop hit → route to the owner with the count, and the owner decides disclosure.**
  EBS included, no exception. Do not remediate a merchant's store on your own authority.
- Zero hits → say so with the number of metafields read. That sentence closes the incident.

### A6 — the incident write-up, in `docs/history/`, honest in both directions
State the realistic attack path, neither dramatised nor minimised: the text that reached the
storefront was **AI output generated from the merchant's own product data** (`descriptionHtml`, up
to 64 KB raw before item 19 landed in the same commit). Exploitation required either control of the
merchant's product content — a compromised staff account, a poisoned supplier import — or a
prompt injection that made the model emit markup. Say what the app did and did not defend at each
date: 2 Jul → 9 Sep nothing; 9 Sep → 14 Sep server lock only; 14 Sep both. Say what was read in A5
and what it means. That document is what the owner sends if a merchant ever asks.

`| json`: your answer is accepted — the defence is upstream where we control it, pinned against
eight hostile payloads with break tests. Record that reasoning in the same write-up so nobody
re-litigates it.

**Then Part B.** Post the A5 integer to the queue before you start it.

---

## PART B — THE SCREEN THAT CANNOT COUNT. THIS BLOCKS THE LISTING, WHICH BLOCKS EVERYTHING.

Your `43f56a2` says *"every number on them is now true."* CW read the PNGs. Frame **01 — the first
image on the listing** — carries, on a 15-product store: `Autopilot optimized 15 new products` ·
`30 products optimized` · `0 drafts awaiting review` · `across 14 products sampled` ·
`Total Products 32` · `AI Content Published 30`. Frame 03: `30 with content published` and
`32 products in your catalog` directly above `All (15 on page)`.

You have fixed this class twice by the instance — `live` → `with content published`, and the
`Live on your storefront` label — and I endorsed the relabel, wrongly. Relabelling one number is
correct about that number's meaning and does nothing for a **screen** showing five counts a
merchant cannot reconcile. **1 usable desktop frame out of 8, against Shopify's 3–6.**

**Do it as a class, once.** Use your own harness to read every number on Home and on Products with
its label (CW is producing the same table from the screen; use whichever lands first, then compare).
For each number: what it counts, from where, and whether a merchant can reconcile it with the
product count they know. Then make the screen agree with itself. The `metrics.server.js` decision
stands — the app's published-content record is honest — but a record and a catalogue count do not
belong beside each other unlabelled, and `Total Products 32` on a 15-product store is simply wrong
(archived products, the same bug as A1 in a fourth place).

Also from CW: frame **04** greets `Welcome back!` with **no store name** — a second path that never
gets `storeName`; and its hero is a red 33/100 under a yellow banner about Google retiring FAQ rich
results. Fix the greeting path. The banner is honest; leave it, CW will not use that frame.

**Ship gate**, then post the sha so CW can capture. CW is preparing the store so this capture is the
last one: drafts pending so Review is not empty, and **nothing else mutating the store during
capture** — do not run probes against `contentpilot-dev2` once CW announces a capture window.

---

## PART C — TWO SMALL THINGS FOR TRACK B, BEFORE THE BIG PHASE

**C1 — B3.2, the review ask, gated on truth.** `ReviewRequestAttempt` exists. Implement the ask
**once per shop, only after a real success signal** — a published change whose before/after the
merchant has seen — never on time elapsed, never rewarded (rewarding a review is a named BFS
rejection reason), dismissible forever. Reviews are a gate on every rung of `11-MASTERPLAN.md` §2
and the mechanism does not exist yet.

**C2 — close your own support row** (`cmu0us9zg0003tyi8967iysxi`). It is your test submission; the
owner does not need to see it in his first support queue.

---

## PART D — PHASE 2: CATALOGUE MONITORING, RE-AIMED BY W1. THE SUBSCRIPTION.

Read `11-MASTERPLAN.md` from **"W1 CAME BACK"** through the Phase 2 table before writing a line.
The short version: eligibility failed its kill criterion (36.2% < 40% once content checks are
stripped; crawler blocking 0.5%), so **eligibility is demoted to a cheap component of the free scan**
and **content is the product** — evidence density, not volume. **The subscription is catalogue
decay:** new products arrive unoptimised (a guaranteed recurring event in every active store), bulk
imports wipe descriptions, theme changes alter output. And **the moat moved**: `barcode`, variant
option names and availability are Admin-API-only — no competitor scraping from outside can grade
them; we can, because we are installed.

**P2.0 is already answered by CW's read** (queue, 2026-09-14): Shopify's Agentic channel reports
per-channel sessions/sales/orders and **nothing per product**; `Shopify Catalog — 0 products` on a
17-product store with no drill-down and no reason code. **The delta is per-product, cross-surface in
one view, with bulk remediation.** Build only that.

**Gate for the phase:** *a merchant is told, the day it happens, that something in their catalogue
changed and needs them — and has been told at least once about something they did not know.*

Order, each a commit, ship gates at the marked points:

| | Item | Notes |
|---|---|---|
| P2.3 | **Regression detection — catalogue decay.** | Daily diff per product: description length collapse, missing `product_type`, alt text lost, canonical drift, and **new products arriving unoptimised** — you already have `webhooks.products.create`. One merchant-facing number: *"N products need attention, M since yesterday."* This is what bills forever. |
| P2.2 | **Per-product grading: BLOCKING / DEGRADING / COSMETIC**, per surface, against each spec in `09-DOCTRINE.md` §1. | Never call a recommended field a disqualification — `product_type` is Shopify taxonomy, not OpenAI's required list; GTIN is exempt for own-brand/handmade. The Admin-API-only attributes (barcode, option names, availability) are the ones nobody else can see. |
| P2.1 | Crawler-access check as a **component**, not a pillar. | One fetch each: `OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`, `bingbot`, `Googlebot`, `Google-Extended`. Diff daily. It fires on 0.5% of stores and matters enormously to them. |
| **🚢** | | |
| P2.5 | **Verify before building:** is Search Console's "generative AI control" readable by an app at all? Our own market file says no API. | If unreadable, a one-question guided check. **No gate on an unverified API.** |
| P2.4 | Indexability: `noindex`, `googleCanonical` vs `userCanonical`, sitemap membership, redirect chains. | Snippet eligibility is Google's stated prerequisite for AI Overviews. |
| P2.6 | **Bulk remediation, with review.** | Finding without fixing is a lead magnet. Barcodes, option names, availability, alt text, canonicals. Credits apply per the locked weighting; alt text stays 0. |
| **🚢** | | |
| P2.7 | **The 60-second first run**, rebuilt: scan → the three things blocking *this* store → fix the first in one click → *"we'll watch it from here."* | The activation moment. `startState.server.js` is the seam. |
| **🚢** | | |

**Boundaries that do not move:** every check is graded, never binary (L6). Every screen names its
method. No statistic leaves the app for the listing. **Never a write to the EBS catalogue** —
monitoring it is fine, remediating it is not. And `12-OFFER.md` §5 stays unpublished until this
phase is *live*, not merged.

---

## DONE MEANS

- [x] New app version released — `p0-xss-f505584`, 06:46:10 UTC
- [ ] A5 integer posted; A6 incident written with both window numbers and the attack path
- [ ] Exposure count reported; dev hits remediated; merchant hits routed
- [ ] Home and Products reconcile with the real product count; frame-04 greeting fixed; sha posted
- [ ] Review ask live, gated on a real success, once per shop
- [ ] Phase 2 through P2.7, three ship gates, each proved on production
- [ ] Every ship gate that touched `extensions/` or the toml also released a version
- [ ] Written back (**L18**)

Route only on the four reasons in `03-PROTOCOL.md`. `git diff --cached --stat` before every commit —
the index is shared and it has swept files both ways this week. Never print a secret.
