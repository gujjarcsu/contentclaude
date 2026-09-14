# CC — PHASE 4: THE MONEY, AND THE THREE THINGS A MERCHANT CAN ALREADY SEE

Paste this whole file. Then work the loop until every ✅ below is true in **production**, not in a
test. You are not done when the code is written. You are done when `app.navaal.ai` bills the
locked numbers and a merchant looking at the screen sees no contradiction.

---

## ORIENT (first six minutes, every session, no exceptions)

Read, in this order, whole files — not greps (**L16**):

1. `docs/navaal/00-CONSTITUTION.md` — all 19 laws
2. `docs/navaal/03-PROTOCOL.md` — the loop you are about to run
3. `docs/navaal/07-VERIFICATION.md` — the proof each claim class needs, and the seven false greens
4. `docs/navaal/14-PRICING.md` — **now LOCKED**, §6 is your build list
5. `docs/navaal/04-DECISIONS.md` §PRICING — LOCKED 2026-09-14 — the table you are implementing
6. `docs/navaal/06-QUEUE.md` — what is already routed away from you
7. `docs/navaal/02-BACKLOG.md` — for IDs only

Then prove where you are standing:

```
curl -s https://app.navaal.ai/api/build-info
curl -s "https://app.navaal.ai/api/health?deep=1"
git log --oneline -5
git status --short
```

Production at the time this was written: **5bd4fb8**, deep health ok, schema 237 columns.
Local `main` is at **0f01a2c** (pricing locked — docs only, deliberately unpushed).
If build-info shows something newer than your local HEAD, stop and reconcile before you write a line.

---

## THE RULE THAT GOVERNS THIS ENTIRE PHASE

**A push to `main` IS a deploy** (`.github/workflows/ci.yml` line 9 says it in English; the `deploy`
job at lines 136–148 is gated on `github.event_name == 'push'` to main). So:

- Work in commits locally. **Do not push mid-phase.**
- Push only at the three SHIP GATES marked below.
- At every ship gate: push → poll `/api/build-info` until `sha` matches your commit → then
  `/api/health?deep=1` must return `status:"ok"` → then and only then record it.
- A push that deploys a half-finished billing change is the worst possible failure mode in this
  phase, because it is the one place in the app where a bug takes the merchant's money.

---

# PART A — THE THREE DEFECTS A MERCHANT CAN SEE RIGHT NOW

These come first, ahead of the money, for one reason: CW cannot capture a single clean listing
frame until A1 and A2 are fixed, and the App Store listing is what turns work into installs.
They are small. Do not let them take a day.

## A1 — Products lists and counts ARCHIVED products

**The evidence.** `app/routes/app.products.jsx`:
- line 76 reads `statusFilter` from the URL
- lines 81 and 92 issue `products(last|first: ${PAGE_SIZE}, ..., sortKey: TITLE)` — **no `query:`
  argument at all**
- line 349 issues `products(first: 250, after: $cursor)` for the counts — same omission
- lines 555–557 filter *in JavaScript, after the fetch*, and only across DRAFT / PUBLISHED /
  NEEDS_CONTENT. **ARCHIVED is not one of the cases, so archived products fall through every
  branch and are shown and counted.**

CW proved this on `contentpilot-dev2`, where 17 demo products were archived rather than deleted and
are still on the screen.

**What to do.** Push the status decision into the GraphQL query, where it belongs — not into a
post-fetch filter, because a post-fetch filter cannot fix the page counts or the cursor.

- Add a `query:` argument to **all three** `products(...)` calls.
- The baseline for every view is `-status:ARCHIVED`. A merchant who archived a product told Shopify
  they are finished with it; we do not bill them for it, count it, or offer to optimise it.
- `statusFilter` then maps onto the same argument (`status:ACTIVE`, `status:DRAFT`) so the tab the
  merchant clicks and the query we send agree.
- The JS filter at 555–557 stays, but add an explicit ARCHIVED case so the code says out loud what
  it does with the state rather than falling through.

**Proof required (all four, or it is not done):**
1. A test that asserts the emitted GraphQL string contains `-status:ARCHIVED` for the default view.
2. A test with a fixture containing an ARCHIVED product that asserts it is absent from both the
   list and the counts.
3. Full suite green, and the count goes **up** from 2,980 — a fix that does not add a test is not
   a fix (**L6**).
4. After the ship gate, the count on the live Products page on the dev store must have dropped by
   the number of archived products. Read the number. Write it down.

## A2 — Home says 48/100 and the SEO Audit says 90/100, same store, same minute

**The evidence.** CW read both screens within one minute of each other and the gap is **42 points**.
`app/routes/app._index.jsx` line 386–389 already carries a disclaimer — *"This is a sample. The SEO
Audit scores more of your catalog"* — and that disclaimer is **not true enough to survive a 42-point
gap**. A sample of 30 products drawn from a store that scores 90 does not score 48. The two numbers
come from two different rubrics: Home from `scanStoreForStart` → `storeScore` in
`app/utils/storeScore.server.js`, the audit from its own scorer.

**This is the single most damaging thing in the app.** It is on the first screen a merchant sees and
the first frame of the listing. Two numbers 42 points apart, both labelled as the store's score,
tell a merchant the app cannot count. Every claim we make about honest measurement dies there.

**What to do — in this order, and do not skip the first step.**
1. **Read both scorers end to end** (`storeScore.server.js` → `startState.server.js`'s
   `scanStoreForStart`, and whichever module the SEO Audit route actually calls). Write down, in the
   commit message, what each one measures and where they diverge. Do not guess from the numbers.
2. Decide which rubric is right. There is one rubric in this app that has been reviewed against the
   doctrine — `geoRubric.js`, after `e705938` removed the quarter of the marks it was giving away
   for something Shopify does for free. Strong prior: **that one is the truth and the other must
   move onto it.** Prove it before you act on it.
3. Make Home and the Audit report the **same rubric on the same scale**. If they legitimately
   measure different populations (30-product sample vs. whole catalogue), they must still be the
   same *rubric*, and the Home card must name the population in the number's own label, not in a
   caption below it.
4. **Never fabricate a baseline.** `storeScore.server.js` is explicit that a missing before returns
   `{available:false}` rather than 0, because "0 → 84" is the most persuasive lie the app can tell.
   Whatever you change, that property survives.
5. If the rubric change moves `storeScoreAtInstall` for existing rows, those baselines were taken
   on a rubric that no longer exists. **Do not silently re-point them at the new scale.** Null them
   with a migration and let Home show no delta until a new baseline exists. A wrong delta is worse
   than no delta.

**Proof required:** both screens read on the same dev store within the same minute, both numbers
recorded in `docs/history/`, and the difference explained by the population, not the rubric.

## A3 — Settings still holds test junk that `innerText` cannot see

CW found `E2E Test Store` living in a **form `value` attribute** on `05-settings`, invisible to
every text-based check we have run. Find it, find anything else like it, and add a check that reads
form values — not just rendered text — to whatever pre-listing sweep exists. This is a 20-minute
job that closes a class of bug, not one instance of it (**L18**).

### 🚢 SHIP GATE 1 — after A1, A2, A3
Push. Poll build-info until the sha matches. Deep health ok. Then post to the queue that CW is
unblocked for frames, naming the sha. **CW is waiting on this gate and only this gate.**

---

# PART B — IMPLEMENT THE LOCKED PRICING

`14-PRICING.md` is no longer a proposal. The owner approved it on 2026-09-14 and it is recorded in
`04-DECISIONS.md`. The code currently bills **25 / 50 / 200 / 1,000**. It must bill:

| | Free | Starter | Growth | Pro |
|---|---|---|---|---|
| Monthly | $0 | $9.99 | $29.99 | $79.99 |
| Annual (save 20%) | — | $95.90 | $287.90 | $767.90 |
| Credits / month | 100 | 500 | 1,500 | 4,000 |
| Products covered | 100 | 1,000 | 5,000 | Unlimited |
| Bulk generation | ✗ | ✓ | ✓ | ✓ |
| Trial | — | 14 days, 250 credits | same | same |

**Note the annual change.** `app/utils/billing-plans.js` today sets `annualAmount` at 10× monthly
(99.9 / 299.9 / 799.9) — that is 16.7% off, not 20%. The locked numbers are **95.90 / 287.90 /
767.90**. Change them. There are no paying merchants, so nothing is grandfathered and nothing is
disrupted; this is the only moment in this app's life when that is true.

Build the eight items **in this order**. Each one is a commit. B1 through B4 are one shippable unit.

## B1 — Credit weighting

Today every generation costs one unit of `monthlyLimit`, and the units are not comparable: alt text
costs us **$0.000906** and a blog post **$0.0300** — a **33× spread** (`08-ECONOMICS.md` §2,
`MEASURED` through the real code path in P0.6). Selling both as "one generation" means the plan's
true cost depends entirely on the mix, and the worst case is three times the plan.

The weighting, from `14-PRICING.md` §3:

| Content type | Credits |
|---|---|
| Alt text | **0** — unmetered |
| Blog post | **3** |
| Everything else (product content, collection, social, enhance) | **1** |

This collapses the worst cost per credit to **$0.0115** regardless of what the merchant generates,
which is the whole reason the ≥42% margin holds.

**Where this lands.** `app/utils/plans.server.js` is the choke point — `getMonthlyUsageCount`
counts `usageRecord` rows (line ~161), and the gate at line ~163 is `usageCount >= plan.monthlyLimit`.
Counting rows cannot express weighting.

- New migration (**new file, new name — never edit an applied migration**) adding a `credits`
  column to `usageRecord`, defaulted so existing rows keep meaning what they meant.
- The weighting table lives in **one** exported constant, beside the cost data in
  `app/utils/modelPricing.js` or its own module — not scattered at call sites. Every call site
  reads it. If a new content type is added later and is not in the table, the system must **fail
  loudly**, not default to 1 and quietly under-bill.
- Alt text at 0 credits does **not** mean alt text is unbounded. It is bounded by the product cap
  in B2. Say so in the code comment, because the next person to read it will assume it is free.

**Proof:** a test per content type asserting the credits debited; a test asserting an unknown
content type throws rather than defaults.

## B2 — Two-axis limits: products covered AND credits

The 100-product cap on Free is what makes unmetered alt text safe. Without it the free tier has no
ceiling at all. A plan is now a pair — `monthlyCredits` and `productLimit` — and both are enforced.

- Rename `monthlyLimit` → `monthlyCredits` across the codebase so nothing silently reads a credit
  budget as a generation count. There are ~30 call sites (`app.blog.jsx`, `app.optimize.jsx`,
  `app.plans.jsx`, `app.products.jsx`, `UpgradePrompt.jsx`, `quota.js`, `quotaSurfaces.server.js`,
  `plans.server.js`). Rename all of them; leave no alias.
- Add `productLimit` (`null` = unlimited at Pro).
- "Products covered" means the products the app will act on. Decide the rule, write it in the
  comment, and make the UI state it in the same words the listing will: a 3,000-product store on
  Free sees its whole catalogue's problems and can fix 100 of them. **The audit is never capped** —
  that is a locked decision in `04-DECISIONS.md` and it is the hook.
- When a merchant hits the product cap, the message says *which* limit they hit. "You've hit your
  limit" when there are credits left and products exhausted is a support ticket we pay for.

## B3 — Bulk gating on Free

Free is one-at-a-time. This is the conversion mechanism, so the refusal has to do work:

- It states **why** it is gated, in a sentence a merchant does not resent.
- It names what they get: the same generation, in bulk, from $9.99.
- It never disables the button with no explanation. A dead control teaches nothing.
- `entitlements.bulkJobs` is already `false` on Free — verify it is actually **enforced server-side**
  in `bulkProcessor.server.js` and not only hidden in the UI. A client-side-only gate is not a gate.

## B4 — Trial credits, separate from the monthly allowance

14 days, **250 credits**, held separately from the plan's monthly allowance. The reason is arithmetic:
an abusive trial on the plan allowance costs us **$17.25**; on a 250-credit trial allowance it costs
**$2.88**.

- Separate counter, separate column, separate reset semantics. Do **not** reuse the monthly bucket
  with a flag — that is how the two get confused six months from now.
- Trial state must survive a plan change mid-trial.
- One trial per shop, ever. Uninstall/reinstall does not mint a new one. Check what the existing
  shop record does on reinstall before you assume it does the right thing.

### 🚢 SHIP GATE 2 — after B1–B4
This is the gate that changes what merchants are charged. Before pushing:
- Full suite green (expect well above 2,980).
- Walk the whole billing chain on the dev store manually: Free → hits credit cap → upsell copy →
  upgrade → new allowance → downgrade. Read every number on every screen.
- Confirm `ALL_BILLING_PLAN_KEYS` still enumerates **every** plan name the app can have created,
  monthly and annual. The comment in `billing-plans.js` records what happened last time it did not:
  annual subscribers looked unsubscribed and were downgraded to Free **while still being billed.**
  If you change plan names, that list is the first thing that must change with them.
- Then push, poll, deep health.
- **Then post H12 to the queue for CW**: the code now bills the locked numbers, so the listing plan
  table may be updated. Name the sha. Until this line is posted, CW must not touch the listing.

## B5 — Annual at 20%, plus the one-time 2× first month

- `annualAmount`: 95.90 / 287.90 / 767.90.
- The first month of an annual subscription grants **2× the monthly credit allowance**, once, never
  repeating. This is the anti-burn-and-churn instrument: it front-loads the catalogue work that a
  new merchant actually wants to do in week one, which is the exact moment a monthly subscriber
  would otherwise burn the plan and cancel.
- Make "once, ever" structurally true, not a flag someone can flip. A merchant who cancels annual
  and resubscribes does not get a second 2× month.
- The plans page says "Save 20%" with both numbers visible. It does not say "2 months free" —
  20% is not two months, and a merchant who does the arithmetic and finds it wrong will not
  believe the next number we show them.

## B6 — Credit packs as one-time purchases

1,000 / $19 · 2,000 / $39 · 4,000 / $79.

**This requires the Shopify Billing API, not App Pricing.** App Pricing does not support one-time
purchases, and since **28 Apr 2026** it sends no `APP_SUBSCRIPTIONS_UPDATE` webhook and no
`charge_id`. Confirm the app's current billing path before you start — if the app is on App Pricing
today, packs are a larger change than the other seven items combined and may deserve to be split
into its own phase rather than rushed into this one. **Say so in the queue rather than half-building
it.** (**L17** — blocked work is routed, never parked.)

- Packs never expire, and they are consumed **after** the monthly allowance, never before.
- A pack purchase must be idempotent against webhook redelivery. Credits granted twice for one
  payment is the failure that ends the app's reputation.

## B7 — BYO key at Pro

Does not exist in code or schema. It removes the COGS ceiling and the merchant's fear of running
out, and Smart SEO validated it at $49.99.

- Key stored encrypted, **never logged, never returned to the client, never in an error message**.
  Not the key, not a prefix, not a length.
- Validate on save with one real cheap call. A key that fails at 2am mid-bulk-job is a support
  ticket and a refund.
- When a BYO key is in use, generations still consume credits for *accounting* or they do not —
  pick one, write the decision in `04-DECISIONS.md`, and make the UI say which.
- If the key fails mid-job, the job pauses and tells the merchant. It does **not** silently fall
  back to our key and our money.

## B8 — Grandfather nobody

Verify, do not assume: query production for any `Plan` row with `status = active` and a non-null
subscription key. Expect zero. **If it is not zero, stop and route to the owner** — a real paying
merchant changes this from a free change into one with a person on the other end of it.

### 🚢 SHIP GATE 3 — after B5–B8 (or after B5, B7, B8 if B6 is routed out)
Push. Poll. Deep health. Record.

---

# PART C — THE TWO LOOSE ENDS

## C1 — Wire the verified theme deep link

CW proved by eye which form works:

```
?template=product&addAppBlockId=1279a14cca41d4a6f8e6e3c485870b77/faq_visible&target=mainSection
```

That is the **app `client_id`** form. The extension-UID form **fails** — CW has screenshots of both
in `docs/history/screen-reads/`. Wire the working form into
`app/components/EmbedSetupCard.jsx`. Do not re-derive the ID. Do not "improve" the URL. Use the
string that was proved.

## C2 — Observe `tokensUsed` non-zero in production

`5bd4fb8` proved the write path by test, including that it can never fail a generation. It has
**never been observed non-zero in production**. A write path proved only by its own test is
**false green #? — check `07-VERIFICATION.md`**, and it is exactly the shape this project has been
burned by seven times.

Run one real generation on the dev store against production. Read the row. If `tokensUsed` is 0 or
null, the path is broken in production regardless of what the test says, and that is a P0 — every
cost number in `08-ECONOMICS.md`, and therefore the entire pricing table you just implemented,
becomes unverifiable. **Record the actual integer you read.**

---

# THE DEFINITION OF DONE

Every line true, checked in production, with the evidence written back:

- [ ] Products page shows and counts **no** archived products — number read off the live page
- [ ] Home and SEO Audit report the same rubric; any remaining gap explained by population and
      labelled on the number itself
- [ ] No test-store strings anywhere in Settings, including form values
- [ ] Credits weighted 0 / 1 / 3, unknown types throw
- [ ] Both axes enforced; limit messages name which limit was hit
- [ ] Bulk gated on Free **server-side**, with a refusal that explains and converts
- [ ] Trial: 14 days, 250 separate credits, one per shop ever
- [ ] Annual at 95.90 / 287.90 / 767.90 with a one-time 2× first month
- [ ] Packs live, idempotent, consumed after the allowance — **or** explicitly routed with a reason
- [ ] BYO key at Pro, encrypted, validated on save, never logged
- [ ] Zero active paid plans confirmed by query, not assumption
- [ ] Deep link wired from the proved string
- [ ] A production `tokensUsed` integer written down
- [ ] `04-DECISIONS.md`, `06-QUEUE.md`, `02-BACKLOG.md` and the session log all written back (**L18**)
- [ ] H12 posted to the queue so CW can update the listing

---

## WHEN TO STOP AND ROUTE INSTEAD (L17)

Only these four. Anything else, keep going.

1. It needs the owner's credentials or a card. → queue, owner, stop.
2. It needs a live-store write on the **EBS commercial catalogue**. → never. Not once. Not read-only-
   with-an-exception. → queue.
3. Three genuine attempts have failed on the same thing. → queue with what you tried and what you saw.
4. A locked decision in `04-DECISIONS.md` would have to change. → bring **evidence**, not a
   preference, and stop.

## THE FIVE LAWS BROKEN MOST — reread before each commit

- **L16** — a claim about a file is proved by the **whole file**. Grep tells you a string exists,
  never that a thing is true. This law exists because a thirty-line grep of `ci.yml` produced the
  exact opposite conclusion to the file.
- **L19** — work that is not live is not done.
- **L6** — a fix without a test is not a fix.
- **L1** — seven false-green shapes. Check `07-VERIFICATION.md` against your claim **before** you
  write the claim, not after.
- **L18** — leave the system smarter than you found it. Fix the class, not the instance.

Never print a secret. `fly secrets import` from a file — **never** `fly secrets set`, because
`cmd.exe` strips `%xx` and corrupts the value silently.

Loop until DONE is all ticked. Then report: what shipped, at which sha, what you verified and how,
what you routed and why, and every number you actually read with your own eyes.
