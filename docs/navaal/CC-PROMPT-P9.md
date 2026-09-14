# CC — PHASE 9 BRIEF: THE CONTRACT SAYS WHAT THE CODE DOES, THEN THE GRADING DEBT, THEN BFS

Paste this whole file. It replaces `CC-PROMPT-P8.md` (moved to `_superseded/`). Production
`ae8ed69`, healthy, verified from outside. Phase 8 delivered: F8 re-based (9 rows 25 → 100, none
lowered, and `getOrCreatePlan` now raises on read so it cannot recur silently), FR0–FR14 and the
`Live` badge as classes, redirects prepared, P3.1/P3.2/P3.6/P3.3 live. The IndexNow correction —
a key file cannot live at a Shopify storefront root, so the submit arm is Bing's URL Submission API
with the merchant's own key, named on screen — is exactly the kind of thing that only surfaces when
you try to build it, and you found it before building on it.

**The Part A gate is still CW's second count.** CW is walking the reset store now. If the number is
not materially below 15, Part A reopens ahead of everything below. Read the queue before starting.

---

## PART A — TWO LEGAL FIXES, DECIDED, SMALL

CW read your generated pages as a reviewer and found two things nobody asked about. Both are
decided in `04-DECISIONS.md`; your job is to make the pages say it.

**A1 — Credits reset on the calendar month; the contract and the plans page say so.** `/terms`
says *"Credits reset on the first of each calendar month"*; Shopify's approval page says *"every
30 days"*. The code already resets by calendar month, which is merchant-favourable — a subscriber
on the 20th gets a full allowance, then a full reset on the 1st — so the behaviour stays and the
copy states the consequence: *"Credits reset on the first of each calendar month, whatever your
billing date. Your first, partial month carries a full allowance."* Same sentence on `/terms` and
on the plans page; one test that the two copies agree; one test that `getMonthlyUsageCount` is
keyed on calendar month and nothing on the billing path keys it otherwise.

**A2 — `/privacy` states a transfer basis.** Four US processors are named with locations; the
superseded copy had an *International transfers* clause and the generated one does not. Add a
paragraph **generated from the processor list** (Australia → each named US processor; reliance on
that processor's DPA / standard contractual clauses, with the link), so it cannot drift when a
processor changes. Neither page is legal advice; the owner checklist already says counsel reads
both before the tenth merchant.

Ship gate. CW re-reads both pages.

---

## PART B — THE GRADING DEBT. A WRONG "BLOCKING" IS WORSE THAN NO GRADE.

Phase 2 grades 1,418 products across 9 shops nightly and shows a merchant the three things
"holding this store back". Four items in your own backlog mean some of those findings are wrong,
and a wrong BLOCKING finding on a real merchant's first screen is the exact failure `09-DOCTRINE.md`
§1 was rewritten to prevent.

| | Item | Why it is first |
|---|---|---|
| **F3** | **GTIN read on the first variant only.** A multi-variant product whose barcodes live on later variants is graded "no barcode" — wrongly, as BLOCKING. | This is the attribute the moat is built on. The fix you proposed (a second cheap query for multi-variant products, under the 1,000-point cap) — build it, and add a fixture with barcodes on variant 2+ that fails today. |
| **F4** | `acrossShops.sinceYesterday` ignores each shop's first-walk grace, so the cross-shop script reads "everything is new" on day one. | Pass `firstWalkAt` per shop or drop the aggregate; do not leave a number that lies on the day it matters most. |
| **F6** | Indexability samples 20 pages a night; a 5,000-product store takes 250 nights. | Per-plan sample size, or prioritise products with attention. Pro is "unlimited products"; say what nightly coverage actually is on the screen. |
| **F5** | `featuredImage` deprecated for `featuredMedia`. | Migrate before Shopify removes it; the watch query is the one place it is used. |

Then the one from CW's dev2 read that Part B fixed in one place: **confirm `Live` reflects product
status on every screen that shows the badge**, not only Products.

Ship gate. Post the sha; CW verifies F3 on a dev store with a multi-variant product.

---

## PART C — B4.2, THE BUILT FOR SHOPIFY AUDIT, CODE SIDE, WITH EVIDENCE PER CRITERION

CW read the dashboard (H8): LCP and CLS pass, INP now measured at 40 ms over 26 loads, the manual
criteria carry clipboard glyphs. The dashboard reports state; it does not tell us *why* we pass or
whether we would keep passing. `11-MASTERPLAN.md` B4.2 is the code-side audit, and the achievement
rung (B4.1) turned out to gate on the same numbers, so this is the only technical rung left.

For each criterion, **one paragraph of evidence and one test that would fail if it regressed**:
- App Bridge loaded via the **script tag** in the document head (P0.4 measured it; pin it).
- Admin p75 LCP / CLS / INP — the code-side budget that keeps them under threshold at ≥100 calls,
  not a one-off reading: what the heaviest route ships, and a size budget test.
- **Storefront Lighthouse impact of `navaal-geo-schema` as a number**, weighted home 17% / product
  40% / collection 43%, target under 10 points. Measure it on a dev store with the block enabled
  vs disabled. Two pure-Liquid blocks should be near zero; prove it rather than assume it.
- Asset API: we do not use it; a test greps for it.
- Polaris / design guidelines: the five-item nav, contextual save bars, no dark patterns — cite the
  tests that already enforce the nav count and the review-ask rules.
- Clean uninstall: proved in Phase 6; cite it.

Write it as `docs/navaal/BFS-AUDIT.md`, criterion by criterion, with the sha of each test. That
file is what the owner reads before pressing **Apply**, because failing the same criterion three
times suspends applications for three months.

---

## PART D — STAYS ROUTED, AND WHY

- **P3.1 on a real batch** waits on the owner's F10 twenty minutes (lock secret, one dev store
  public, Bing key, ten products, the holdout workflow). When it runs, read the result and write it
  into `docs/history/` — both arms, the interval, the seed.
- **P3.4** waits on P0.10 (Level 2, `read_reports`).
- **P3.5** stays scoped (F11) until a real holdout batch has read out. Do not start it.
- **Phase 5** is hard-gated on ten real merchants and one paying. There are two and none.

---

## HYGIENE

`git diff --cached --stat` before every commit · gates read the script's exit · any toml or
`extensions/` change releases an app version · suite after the last edit · no secret printed ·
`fly secrets import` from a file · **`contentpilot-dev2` and `navaal-qa-fresh` are frozen until CW
posts `CAPTURE COMPLETE`** — nothing you run touches them.

## DONE MEANS

- [ ] Terms and plans page carry the reset sentence; the agreement test exists
- [ ] Privacy carries a generated transfer-basis paragraph
- [ ] F3 fixed with a failing-then-passing fixture; F4, F5, F6 closed; `Live` consistent everywhere
- [ ] `BFS-AUDIT.md` with evidence and a regression test per criterion; the Lighthouse number measured
- [ ] Part A reopened and re-shipped if CW's second count says so
- [ ] Written back (**L18**)
