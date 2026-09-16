# Third confusion count — `navaal-qa-fresh`, 2026-09-16

**Method, identical to counts one and two so the three compare.** *First-run reset* workflow
(`first-run-reset.yml`) on `navaal-qa-fresh.myshopify.com`, run at **05:37:47Z** from `7710be2`:
`firstDraftSeenAt` `2026-09-16T00:11:31.342Z` → `null`, verdict *"RESET — the next /app load on this
store renders the first run."* Then the app walked as a merchant meeting it for the first time:
Home (first run) → Products → Review → Blog → Settings → Plans. No uninstall, so nothing was written
into the funnel's uninstall reasons.

## THE COUNT: 3

The gate is ≤ 3. **Count one 15 · count two 4 · count three 3.**

**1. The first screen's primary button is a paid feature, and nothing says so.**
The dark primary control on the first-run screen is **"Write the rest in bulk."** On the Plans page
*Bulk runs* is a **Starter** feature; the Free card does not list it. A first-time merchant on Free
is pushed at the one button that cannot work for them, with no upgrade marker beside it. This is
FR10's class — *"Optimize store (12) · Starter"* as the primary CTA on a Free store — in a new place.

**2. Blog is fully open on Free and never says what a post costs.**
The Blog tab offers a complete form and a **"Generate Blog Post"** button with no credit cost, no
plan gate and no upgrade notice. The Plans table lists blog posts only from **Growth**
(*"Blog posts (3 credits each)"*), and the Free card omits them. So the app offers a merchant
something their plan does not include, at an unstated price.

**3. "Reject 3 not approved" reads like a bulk action.** On Review, the counter says *"0 of 3
approved"* and the red control top-right says *"Reject 3 not approved."* With nothing yet approved
the sentence can be read as *reject all three*. The weakest of the three, but a first-timer hesitates.

## WHAT IS NO LONGER CONFUSING

- **The score block.** `21/100`, then `21 AI search (GEO) — the score above` and `10 Traditional
  SEO — for comparison, not part of the score`. Both numbers are now labelled, including which one
  is not part of the score. FR6/FR7 gone.
- **Every count reconciles.** Header *"12 products in your catalog · 0 with content published ·
  3 ready to review · 9 not yet optimized"*; tiles `0 / 3 / 9`; tabs *All (12) · Not optimized (9) ·
  Draft (3) · Published (0)*. 3 + 9 = 12. FR3/FR4/FR11 gone.
- **One unit.** "credits" everywhere — Home, Products (`9 / 100 used`), Plans
  (`9 used · 91 remaining of 100`). The word "generations" does not appear. FR5/FR9/FR12 gone.
- **No "Welcome back" to a first-timer.** The first screen opens *"Let's get your store found by
  AI"*. FR1/FR2 gone on this path.
- **Settings is clean** — `Northline Supply`, Content Language English, App language *"Follow my
  Shopify admin language"*, with a line explaining which is which. No E2E residue in any field value.

## FR0 / FR8 / FR13 / FR14 — which could still be reproduced

- **FR8 — NOT reproducible, and it is fixed in its hardest case.** On qa-fresh every draft card reads
  **`At first run: 21/100`** beside a store score of 21, and the screen now carries the explanation:
  *"These 3 products all score 21: they are missing the same things, so each one's number is the same
  as the store's. We scanned 12 products to pick them."* On `contentpilot-dev2`, where the numbers
  differ, the store score is **65/100** and the three rows read **`At first run: 56/100`** with the
  same sentence — the exact case that used to print `This product: 21/100`. Product rows on
  `/app/products` carry no score at all now.
- **FR14 — NOT reproducible on any visible surface.** `9 / 100 used` on Products,
  `9 used · 91 remaining of 100` on Plans, a fraction in both places, no bare percent anywhere.
  **The accessible-label half is UNVERIFIED from here:** the app runs in a cross-origin iframe and no
  accessibility tree crosses that boundary, so CC's ProgressBar `aria-label` change could not be read.
- **FR13 — CANNOT BE TESTED BY CLICK FROM THIS HARNESS, and the mechanism is now proven.** A click
  aimed at the `[Review]` button on a *Ready to review* row lands at exactly the right CSS point and
  is a real browser event — a capture listener on the top document recorded
  `pointerdown|IFRAME|1505,758|trusted=true` and the same for `mousedown`, `mouseup`, `click` — but
  its **target is the `<iframe>` element in the top document.** The extension dispatches input on the
  top frame's session, so an out-of-process iframe never receives it. Control: an unrelated control
  on the same screen (the *Draft on this page* tab) is equally inert. **By route the contract is
  correct:** `/app/review?product=9854392271078` renders *"Review & Publish — 1 product with draft
  content ready to review"*, the banner *"Showing one product — Opened from its row on Products.
  Approve and publish here"*, and the approve controls. **OWNER: one click settles it** — press
  *Review* on a Ready-to-review row and read the address bar.
- **FR0 — not reproducible, but on a different store.** It cannot be tested on a 12-product
  catalogue. `navaal-shape-zero` (empty) renders a proper empty state — *"Add a product and we'll
  get started"* with *"I've added one — check again"* — not a dead end.
