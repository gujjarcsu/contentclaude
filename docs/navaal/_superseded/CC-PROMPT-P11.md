# CC — PHASE 11 BRIEF: A SHOP THE APP THINKS IS GONE, A FUNNEL THAT COUNTS THE WRONG SHOPS, AND THE CAPTURE

Paste this whole file. It replaces `CC-PROMPT-P10.md` (moved to `_superseded/`). Production
`08d8b3e`, 324 columns, healthy, verified from outside. Phase 10 landed: the four capture blockers,
the funnel, the shape matrix (107 PASS / 15 HELD / 75 NOT RUN, every NOT RUN naming where it goes),
the "add a product" defect on all-draft and B2B stores, and — found while wiring the digest — a
weekly report that could never fire because `sydneyParts()` returned no weekday. That last one is
the most valuable find of the phase, and Part D below turns it into a class.

**Part A is first and it is a data-integrity bug with a real-merchant blast radius. Nobody touches
`navaal-qa-fresh` until you post that you have what you need from it.**

---

## PART A — THE APP AND SHOPIFY DISAGREE ABOUT WHETHER A SHOP IS INSTALLED

Shopify's Apps page for `navaal-qa-fresh`: `Installed · Navaal: AI SEO, AEO & GEO`. The app serves
its screens there normally. Your queue post at `1d05aaa` says *"qa-fresh has no install"*, and the
First-run reset refused it: *"shop row missing or uninstalled"*. The nightly walk went 9 → 8 shops
on the 14th.

**CW got as far as the uninstall dialog and stopped**, deliberately — it would have forced the
splash and frame 04, and it would have destroyed the only live example of this state. That was
the right call. That store is your evidence. Diagnose it **in place**:

1. The Shop row for that domain: does it exist, what does its uninstalled flag say, what does
   `installTracking` say, what session rows exist and are their tokens valid?
2. The sequence: qa-fresh was **uninstalled on 10 Sep** (CW: "0 iframes") and **reinstalled on
   14 Sep** from the listing. First suspects: an `app/uninstalled` webhook processed **after** the
   reinstall OAuth (late or redelivered — H10 shows this topic at 68% delivery with retries), or a
   reinstall path that authenticates without clearing the flag. The Phase 6 uninstall→reinstall
   contract was proved by test; this is the first real reinstall since, and it failed.
3. **Fix the class, not the row:** an authenticated request from a shop is proof of installation
   and clears any uninstalled state; `app/uninstalled` is ignored if a newer install exists; and a
   nightly reconciliation asks Shopify (`shop { name }` with the offline token) rather than trusting
   the flag. A test with the webhook arriving after the reinstall.
4. **Count across all shops:** rows flagged uninstalled whose offline token still answers. Post the
   integer. If any is a real merchant, say so — that merchant has been unmonitored and excluded
   from every count since the flag flipped.
5. Then post *"qa-fresh: CC is done with it"* to the queue. CW uninstalls and reinstalls from the
   listing — a genuine first run on a store already named Northline Supply — reads FR8, N1 and FR13
   in one pass, and captures frame 04.

Why this outranks everything: a shop the app believes uninstalled is unmonitored, absent from the
funnel, and — once Shopify sends `shop/redact` 48 hours after a *real* uninstall it will never
match — the data path is one confusion away from deleting an installed merchant's records.

---

## PART B — THE FUNNEL COUNTS THE WRONG SHOPS

Your first reading: *11 real shops, 7 saw a draft, 0 published, 4 uninstalled.* CW's ledger, which
reconciles to Shopify's own `Merchants with your app: 8`, says **real is 3 ever, 2 now.**
`TEST_SHOP_PATTERN` excludes `ttv-*`, `qa-*`, `shape-*`, `contentpilot-dev*` and nothing else, so
the 11 include EBS, `contentpilot-test`, and Shopify's reviewer, Mars, Ace and appstoretest4
stores. The Monday digest would tell the owner he has eleven merchants.

Replace the pattern with an explicit **`ShopKind`**: `ours` / `shopify` / `real` / `unclassified`,
seeded from the ledger in `06-QUEUE.md` §PHASE 7. **Unclassified is excluded from the digest and
reported as a count** — a shop nobody has classified is never silently a merchant. New installs
default to unclassified until the owner or CW classifies them, and the digest says how many are
waiting. Re-run the Funnel workflow; post the reading over real shops only. Expect 3 installed
ever, ≤3 saw a draft, 0 published, 1 uninstalled — and *0 published* over three real merchants is
the first true product number this app has, so say it plainly.

---

## PART C — THREE SMALL ONES FROM CW'S READ, PLUS THE GID TRAP

- `/app/attention`'s Method paragraph still says it reads the *first-variant barcode*; the code
  reads up to fifty. The page whose job is to explain the method describes the wrong one — same
  class as `Live`, understating this time. One constant feeds the method text and the query.
- The reset sentence: `/terms` says *"do not roll over"*, the in-app plans FAQ says *"don't"*. If
  one constant feeds both surfaces, it is emitting two strings; make it one.
- F3 could not be constructed on a dev store (Shopify's variant editor exposes no Barcode input
  CW could reach). Assert `gradeProduct` directly — `variantBarcodes: ["", "9312345678907"]`
  against a no-barcode control — and post the two results.
- `/app/review?product=gid://…` **silently renders all six cards**. Whoever next touches that
  button will reach for the GID, because that is what the row holds, and it will look like it
  works. Make the GID form refuse with a message. (The numeric form is right and the row button
  was rewired in `f77eef9`; CW re-verifies at `08d8b3e`.)

---

## PART D — EVERY SCHEDULED JOB PROVES IT CAN FIRE

`sydneyParts()` returned no weekday, so the weekly report compared `undefined !== 1` forever. It was
found by accident while wiring something else. Turn it into a class: **one test that advances a
simulated clock through a full week (and across the AEDT flip you already covered) and asserts
every scheduled job — the nightly walk, the daily crawler diff, the weekly report, the Monday
digest, the indexability sample — fires at least once, at the hour it claims.** A job that cannot
be shown to fire in a simulated week does not ship.

---

## STAYS ROUTED

P3.1 on a real batch, the Lighthouse number, the storefront read: the owner's F10. P3.4: P0.10.
P3.5: a real holdout. Phase 5: ten merchants. BFS Apply: 100 admin calls. The six `navaal-shape-*`
stores: CW, ungated, in progress.

## HYGIENE

`git diff --cached --stat` · pushes branch on the suite's exit (#15) · gates read the script's exit
(#13) · toml or `extensions/` ⇒ app version (#12) · suite after the last edit · no secret printed ·
**dev2 frozen; qa-fresh untouched until Part A posts "done with it"**, then it is CW's.

## DONE MEANS

- [ ] qa-fresh diagnosed in place; the class fixed with an out-of-order webhook test; the
      cross-shop count posted; "done with it" posted
- [ ] `ShopKind` replaces the pattern; unclassified counted, never counted as real; the funnel
      re-read over real shops only
- [ ] Method text, reset constant, F3 assertion, GID refusal
- [ ] The simulated-week test covers every scheduled job
- [ ] Written back (**L18**)
