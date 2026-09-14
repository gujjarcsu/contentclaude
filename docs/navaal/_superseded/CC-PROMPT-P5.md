# CC — PHASE 5: THE TRIAL IS STILL 7 DAYS, AND A GREEN TEST SAYS IT IS 14

Paste this whole file.

Phase 4 was good work. Three gates, three shas, verified live, and the two items you refused to
half-build were routed rather than faked. `71c7898` is live, 240 columns, healthy — I checked it
myself. B8 is the best thing in the report: you queried production instead of believing a sentence
in a brief, found the sentence was false, and did **not** print a subscription GID into a CI log.
That is the standard.

Now the thing that got through.

---

## P5.0 — THE TRIAL LENGTH. DO THIS FIRST, BEFORE YOU READ ANYTHING ELSE.

```
app/utils/billing-plans.js:32     export const TRIAL_DAYS = 14;
app/shopify.server.js:37          { ...v, currencyCode: "USD", interval: ..., trialDays: 7 },
tests/utils/trialCredits.test.js:76   expect(TRIAL_DAYS).toBe(14);
```

**`TRIAL_DAYS` is exported, asserted by a passing test, and imported by nothing.** Line 37 of
`shopify.server.js` is the value that actually reaches Shopify when a subscription is created —
via `recurringPlan(...)` at line 85–86 — and it is hardcoded to **7**. Unchanged at `5bd4fb8`,
at `7d23792`, at `71c7898` and at `HEAD`. I checked all four.

So **production grants 7-day trials right now**, while the locked table says 14 days and a green
test says 14 days.

**Why this is the most expensive bug in the report.** You posted H12 at `98225dd` — *"the app bills
the locked numbers at 7d23792, so CW may update the listing."* CW's next move under that line is to
publish the locked plan table, which says **"14 days, 250 credits"**, onto the live App Store
listing. The listing would then state a 14-day trial that the app does not grant. That is a false
statement in a Shopify submission, and it is the exact failure the H12 gate was built to prevent —
it would have been let through by the gate's own green light.

**This is L1, in its purest form.** `expect(TRIAL_DAYS).toBe(14)` proves a constant equals itself.
It executes no code path a merchant can reach. The suite went from 2,944 to 2,980 to higher still,
and every one of those greens was compatible with a 7-day trial.

**Fix:**
1. `shopify.server.js` imports `TRIAL_DAYS` and `TRIAL_CREDITS` from `billing-plans.js`. No literal
   trial length anywhere else in the repo. Grep for the number after you change it.
2. Replace the tautological assertion with one that **breaks when the wrong value reaches Shopify**:
   assert on the object actually handed to the billing config — every plan key, monthly and annual —
   not on the constant. Then verify by breaking it: set the constant to 9, watch the test fail, put
   it back, and say in the commit how many tests failed.
3. **Sweep the class, not the instance (L18).** Every locked value must have exactly one definition
   and at least one consumer. For each of `monthlyCredits`, `productLimit`, `amount`,
   `annualAmount`, `TRIAL_CREDITS`, `TRIAL_DAYS` and the credit weights: prove there is no second
   hardcoded copy on the path to Shopify or to a screen, and prove each exported constant is
   imported by something that is not a test. **An exported constant whose only consumer is a test
   asserting its own value is dead code that greps as shipped** — that is false green #11 and I am
   adding it to `07-VERIFICATION.md`.
4. **The existing Pro subscriber's trial is not retroactively changed by this.** Do not attempt to
   modify a live subscription. Note it and move on.
5. Post to the queue, in the same row as H12, that H12's premise was **incomplete until this sha** —
   and name the sha. CW is reading that row to decide whether it may publish.

---

## ORIENT (after P5.0 is understood, before you write any other code)

Whole files, in order: `00-CONSTITUTION.md` (**L1's tally is now ten, and three of the last three
were found by reading rather than testing**) · `03-PROTOCOL.md` · `07-VERIFICATION.md` (**false
greens 8, 9, 10 are new — 10 was Cowork's own bug**) · `14-PRICING.md` · `04-DECISIONS.md`
(**restructured — see below**) · `06-QUEUE.md` · `02-BACKLOG.md`.

Then: `curl -s https://app.navaal.ai/api/build-info` and `/api/health?deep=1`, and `git log --oneline -6`.
At the time of writing: live **71c7898**, 240 columns, ok. Local HEAD **74b89f9**, pushed.

**`04-DECISIONS.md` changed under you, and you need to know why.** CW followed your Phase 4 brief to
"§PRICING" and landed on the **wrong section** — the file had two headings matching that name and
the dead one came first, carrying five tiers at $19/$49/$99/$299 and a row naming two things
`09-DOCTRINE.md` §2 bans outright. That was Cowork's bug, not yours; it is fixed at `87828df`.
The locked table is now the **first** section in the file. `12-OFFER.md` §1 carried a **third**
price table and now opens with the locked four.

---

## P5.1 — "30 LIVE" ON A STORE WITH 15 REAL PRODUCTS. THIS IS ABOUT MONEY NOW.

CW read the Products page verbatim at 02:58:59Z, before your A1 fix was live:

> "32 products in your catalog · 15 active and draft products published to your online store ·
> **30 live** · 0 ready to review · 0 not yet optimized"

The store has **15** real products. Even counting the 13 demo products that were published before
any of this, that is **28, not 30**. The arithmetic does not close, and "AI Content Published: 30"
is a headline number on the first screen a merchant sees.

Your A1 fix scoped the three **read** paths in `app.products.jsx` through `LIST_SCOPE_QUERY`, and I
verified the other readers were already scoped (`catalogGaps`, `llms.server`, `startState`,
`enumerateProducts`, `seo-audit`). **The read paths are not the question.** The question is the
**write** paths:

**Has this app ever generated or published content against an ARCHIVED product?**

Under the pricing you just shipped, that is no longer a cosmetic bug — it is **spending a
merchant's credits on products they deliberately archived**, at 2.00¢ a credit, and a merchant who
notices will say so in the review that decides whether this app has a future.

Check `bulkProcessor.server.js`, the optimize path, the autopilot path, and anything that enqueues a
generation. Then ask production: count `ContentDraft` (or equivalent) rows whose product is archived
in Shopify today. **Report the integer.** If it is non-zero, the fix is twofold — stop it happening,
and decide whether those credits are refunded. Record that decision in `04-DECISIONS.md`.

And settle the "30" itself. Either it counts something legitimate that the label describes badly, or
it counts archived products. Both are fixes; they are different fixes.

---

## P5.2 — THE SCORE CACHE, WHICH IS A SEPARATE BUG FROM THE RUBRIC

Your writeback says Home 65/100 and Audit 65/100, **gap 0, was 42**. Good — and I believe it,
because you read it live.

But CW measured **78 vs 90** at 03:00:33Z on the *pre-fix* build. Which means the original 42-point
gap was **not all rubric**. Home moved **48 → 78 on the same store with no deploy between the two
reads**. `STORE_SCORE_TTL_S = 600` — ten minutes. A value that moves 30 points with no deploy was
stale by far longer than its own TTL.

**So there are two defects and you have fixed one.** The rubric gap is closed. The staleness is not
demonstrated closed, because a gap of 0 measured once is also what a cache would show if both
numbers happened to be warm.

Prove it the way `07-VERIFICATION.md` false green #9 now requires: **read, change something that
must move the number, read again, and state how long the change took to appear.** A merchant who
publishes content and then looks at Home is standing in exactly that window. If the answer is more
than the TTL, find out why — a cache that outlives its TTL is usually a second cache.

---

## P5.3 — C0.5 IS CLOSED BUT THE BACKLOG STILL SAYS OPEN

`02-BACKLOG.md` C0.5 says B5's one-time 2× annual credit month *"did not"* ship. `71c7898` is
titled **"B5 — the one-time 2x annual credit month, structurally once-ever"** and brought the
migration that took the schema to 240 columns. The row was written before the commit and never
revisited.

Close it, and sweep the neighbours while you are there — this is the seventh false green in a
different costume: a document confidently describing code nobody re-read.

**While you are in that file, record a naming collision that will bite someone.** `02-BACKLOG.md`
already has a **B6** (dev-store residue sweep, DONE) and a **B7** (Built for Shopify audit, OPEN).
The Phase 4 brief used **B6** for credit packs and **B7** for BYO key. Four rows, two IDs, two
meanings. You handled it correctly by minting C0.6 and C0.7 — now write one line in the file saying
the collision exists, so the next session does not resolve it the other way.

---

## P5.4 — C0.6, CREDIT PACKS: DETERMINE, DO NOT BUILD

One question, and it is answerable in under an hour: **is this app on the Shopify Billing API or on
App Pricing?**

Read `shopify.server.js` and the app's Partner configuration and say which, with the evidence. It
decides whether packs are a small feature or a bigger change than the other seven B items put
together — App Pricing does not support one-time purchases and since **28 Apr 2026** sends no
`APP_SUBSCRIPTIONS_UPDATE` webhook and no `charge_id`.

**Report the answer. Do not start the build in this phase.** If it is App Pricing, packs become
their own phase with its own gate, and say so in the queue.

---

## P5.5 — C0.7, BYO KEY AT PRO: BUILD IT

The requirements are already written in the C0.7 row and they are not negotiable. The one decision
to make **first**, and to record in `04-DECISIONS.md` before you write code: **do generations on a
merchant's own key still consume credits for accounting?** Pick one, write the reasoning, make the
UI say which. Then build.

The line worth repeating because it is the one that costs real money if it is wrong: **if the
merchant's key fails mid-job, the job pauses and tells them.** It never silently falls back to our
key.

---

## P5.6 — THE LISTING FRAMES: YOUR THREE ITEMS, AND THEY GATE EVERYTHING

CW cannot assemble a publishable frame set until these are fixed, and the listing is the only path
from this work to an install. From H7:

1. **`frameOnly` — ALREADY FIXED.** `tools/proof/listing-assets.mjs:266` now always uses
   `frame.frameElement()`. Confirm it, do not redo it.
2. **The stale shop-name greeting.** `app/routes/app._index.jsx:761` renders
   `Welcome back, ${storeName}!` and every desktop frame showed **"Welcome back, E2E Test Store!"**
   over an admin badge reading **"Northline Supply"**. The app is displaying a stored name that no
   longer matches the shop. Find where `storeName` is written, and make a rename on Shopify's side
   reach it — or stop storing it and read it live. A frame that contradicts itself is unusable, and
   so is an app that greets a merchant by the wrong company name.
3. **The stale harness guard.** `/scores \d+\/100/i` in the listing-asset harness no longer matches
   the current first-run copy. CW correctly refused to loosen it and routed it to you. Fix the
   guard to match the real copy — and if the copy is what is wrong, fix the copy. **Do not widen the
   regex until it passes.** That is how false green #3 is manufactured.

When all three are done, post to the queue naming the sha, the way you did for gate 1.

---

## ORDER, BECAUSE IT MATTERS THIS TIME

P5.0 (the trial — it is actively wrong in production and it gates CW) → **ship gate** →
P5.6 (the three frame blockers — they gate CW's other half) → **ship gate** →
P5.1 (the credit-leak question — money) → P5.2 (the cache) → P5.3 (the stale rows) →
P5.4 (determine, one hour) → P5.5 (build) → **ship gate**.

Same discipline: push at gates only, poll `/api/build-info` until the sha matches, deep health ok,
then record. A push to `main` **is** a deploy.

---

## DONE MEANS

- [ ] One definition of trial length, imported by the live path; the test breaks when Shopify would
      get the wrong number; the break was demonstrated and the failure count recorded
- [ ] Every locked value: one definition, at least one non-test consumer, no second hardcoded copy
- [ ] The integer for "generations against archived products", and a decision if it is non-zero
- [ ] "30 live" either explained or fixed, and its label says what it counts
- [ ] The score cache proved by read → change → read, with the lag in seconds
- [ ] C0.5 closed; the B6/B7 ID collision written down
- [ ] Billing path named with evidence; packs scoped or deferred with a reason
- [ ] BYO key live, with the credit-accounting decision recorded first
- [ ] The greeting and the harness guard fixed, sha posted to the queue
- [ ] Everything written back (**L18**)

Stop and route only for the four reasons in `03-PROTOCOL.md`. Never print a secret — not a key, not
a prefix, not a length. `fly secrets import` from a file, never `fly secrets set`.
