# CW — PHASE 5: YOUR GATES ARE OPEN, EXCEPT THE ONE THAT MATTERS MOST

Paste this whole file.

**First, the thing you should know about your last report: you were right to refuse, and you were
reading a stale world.** Your ORIENT saw `5bd4fb8` and your working copy sat at `8cb0bb6`, because
you and CC ran in parallel and CC's first commit landed after you had already oriented. Every gate
you found shut really was shut *at the moment you looked*. Since then CC shipped three gates —
`a572d20`, `7d23792`, `71c7898` — and I verified `71c7898` live myself: 240 columns, healthy.

So refusing to capture was correct, and the diff you ran to prove the products fix absent (rather
than inferring it from a sha) is exactly the right instinct. Keep it. Just re-orient before
concluding a fix does not exist — a sha you read twenty minutes ago is not the sha that is live now.

**And three of your findings were not stale at all.** Two of them are now rules in
`07-VERIFICATION.md`, and one of them was my bug:

- **False green #8 — yours.** Scanning the whole public listing page counted **Judge.me's 46,877**
  and the word **testimonial** out of Shopify's own "other apps" carousel. The rule is now written:
  a claim about *our* listing is proved in the **editor, field by field**; the public page only
  cross-checks that the saved values went live. Your method was already correct — it is now the
  documented method.
- **False green #9 — yours.** Home read **48** then **78** on the same store with **no deploy
  between**. The read was live; the cached value behind it was stale for longer than its own
  ten-minute TTL. One read of a computed-and-cached number now proves nothing.
- **False green #10 — mine.** You followed my brief to `04-DECISIONS.md` §PRICING and landed on the
  **wrong section**, because I appended a new "PRICING" heading to a file that already had one and
  the dead one came first — five tiers at $19/$49/$99/$299 and a row naming two things the doctrine
  bans. You caught a brief that would have made you publish false prices. Fixed at `87828df`: the
  locked table is now the first section, the old one is renamed so it cannot be reached by looking
  for "PRICING", and `12-OFFER.md` §1 — which carried a **third** table — now opens with the locked
  four.

---

## ORIENT

`CW-STANDING-PROMPT.md` · `00-CONSTITUTION.md` · `06-QUEUE.md` · `12-OFFER.md` §4/§5/§5.5/§6 ·
`04-DECISIONS.md` **first section** · `07-VERIFICATION.md` false greens 8–11.

```
curl -s "https://app.navaal.ai/api/build-info?cb=$RANDOM"
```
Write the sha down **and the time you read it**. Re-read it before you conclude anything is missing.

---

## ⛔ TASK 2 IS STILL SHUT, AND NOT FOR THE REASON THE QUEUE GIVES

H12 was posted at `98225dd` saying the app bills the locked numbers, which under your last brief
unblocks you to publish the plan table. **Do not publish it yet.** I read the whole billing path
after CC's report and found this:

```
app/utils/billing-plans.js:32        export const TRIAL_DAYS = 14;
app/shopify.server.js:37             ... trialDays: 7 ...
tests/utils/trialCredits.test.js:76  expect(TRIAL_DAYS).toBe(14);
```

`TRIAL_DAYS = 14` is exported, asserted by a **passing** test, and **imported by nothing.** Line 37
of `shopify.server.js` is the value that actually reaches Shopify, and it is **7** — unchanged at
`5bd4fb8`, `7d23792`, `71c7898` and HEAD.

**Production grants a 7-day trial today.** The locked table you were about to publish says
**"14 days, 250 credits"**. Publishing it would put a false statement on a Shopify submission —
which is precisely what the H12 gate exists to prevent, and the gate's own green light would have
waved it through. Your instinct in the last report — *"the live listing is currently truthful;
publishing today would break that"* — was right for one reason and is now right for another.

**The gate is: CC posts a sha for P5.0.** It is the first item in CC's Phase 5 brief. When that row
appears:

1. Open the app's own **Plans page** on the dev store and read the trial length and the credits off
   the screen. Both. **14 days and the locked credits, or you stop.**
2. Then publish the table below — **from the editor**, field by field, per false green #8.

| | Free | Starter | Growth | Pro |
|---|---|---|---|---|
| Monthly | $0 | $9.99 | $29.99 | $79.99 |
| Annual (save 20%) | — | $95.90 | $287.90 | $767.90 |
| Credits / month | 100 | 500 | 1,500 | 4,000 |
| Products covered | 100 | 1,000 | 5,000 | Unlimited |
| Bulk generation | ✗ | ✓ | ✓ | ✓ |
| Trial | — | 14 days, 250 credits | 14 days, 250 credits | 14 days, 250 credits |

Constraints unchanged and they will bite: plan feature lines are **`maxlength 40`** — the two
approved replacements in `12-OFFER.md` §5.5 are `Two description options to compare` (34) and
`Email support from the founder` (30). **No pricing in images** (4.2.2). Requirement **1.2.3** —
upgrade and downgrade without contacting support. Ship **only** what `12-OFFER.md` §4 allows; §5 is
after Phase 2 and Phase 3 ship, however much better it reads. Read every field back on a fresh load
after saving, then cross-check the public page.

---

## TASK 1 — VERIFY CC'S THREE FIXES LIVE. THIS IS THE WHOLE JOB TODAY.

CC claims, from its own live reads: **Products showing 15 of 32 with 17 archived excluded**, and
**Home 65/100 and Audit 65/100 — gap 0, was 42.** Those are CC's numbers. Get your own.

### 1a. Products — and one number CC has not yet explained

Read the page verbatim. The 17 archived demo products must be absent from the list **and** both
counts. Quote what you see.

Then look hard at the line you found last time: **"30 live"** on a store with **15** real products.
Even counting the 13 demo products published earlier that is 28, not 30. **Re-read that line now.**
If it still says 30 — or any number above the real product count — say so with the exact string.
CC has been asked to find out whether this app has ever generated or published content against an
archived product, because under the pricing that shipped, that is **spending a merchant's credits
at 2.00¢ each on products they deliberately archived.** Your read is what tells CC whether its fix
touched the number a merchant actually sees.

### 1b. Home vs the Audit — and now the cache, which is a different bug

Read both within one minute. Quote both numbers and both times.

Then do the thing false green #9 now requires, because a gap of 0 read once is also what two warm
caches look like: **read Home → publish or change something that must move the score → read Home
again → say how many seconds or minutes the change took to appear.** Your 48 → 78 with no deploy is
the only evidence anyone has that this cache misbehaves, and CC cannot close it without a second
measurement.

### 1c. Settings — confirm it stayed clean

You found `E2E Test Store` in a form `value` and then swept `value` attributes across all five
screens and found 21 values, 0 suspect. Re-run that sweep on the current build. It is cheap and it
is now the only check we trust for this class.

---

## TASK 4 — THE DEEP LINK. CHECK BEFORE YOU CONCLUDE.

Last time you found `addAppBlockId` only inside a comment at `EmbedSetupCard.jsx:47` and correctly
reported C1 unwired. **C1 shipped at `441a0cc`, after you looked.** So: open the embed setup card on
the dev store, **click the link**, and confirm the theme editor opens with the FAQ block already
added to the product template. The URL you proved is the **app `client_id`** form:

```
?template=product&addAppBlockId=1279a14cca41d4a6f8e6e3c485870b77/faq_visible&target=mainSection
```

A link correct in the source and wrong on the screen is the failure this role exists to catch.

---

## TASK 5 — THE LISTING FRAMES. STILL BLOCKED, AND NOT ON YOU.

Three of the H7 blockers are CC's and only one is confirmed fixed:

| | | |
|---|---|---|
| `frameOnly` on desktop frames | **FIXED** | `tools/proof/listing-assets.mjs:266` now always uses `frame.frameElement()` — I verified the line |
| `Welcome back, E2E Test Store!` over a "Northline Supply" badge | **OPEN** | `app/routes/app._index.jsx:761` renders a stored name that no longer matches the shop |
| the stale `/scores \d+\/100/i` harness guard | **OPEN** | you refused to loosen it and routed it; that was right |

**Do not capture until CC posts a sha for all three.** You have paid for a premature capture round
once — eight frames, three usable. Shopify wants **3–6 desktop** and a partial set on a live listing
looks worse than the current one.

When you do capture: for every frame that is **not** usable, one sentence saying precisely why.
That sentence is the whole value of the report. "Not usable" without a reason is not a finding.

---

## TASK 3 — THE LISTING SWEEP. RUN IT EVERY SESSION.

Your last counts were clean and I am not asking you to invent a new format — that table was the
right output. Repeat it, from the **editor fields**, cross-checked against the public page, with
the fetch-sanity line first (you caught a 429 with a 32-byte body that read exactly like a pass —
that check stays).

Expect **0** on: doctrine §2 phrases · `A/B variant testing` · `Priority support` · statistics ·
`first`/`best`/`only`/`#1`/`leading`/`number one` · testimonials in our own fields. Expect **1**
each on the two approved replacements. Limits: name ≤30, intro ≤100, details ≤500, bullets ≤80
each, exactly 5 search terms. **Report the integers, not an adjective.**

---

## TASK 6 — STILL OWNER-BLOCKED. DO NOT ATTEMPT.

The W1 post upload. `hpanel.hostinger.com` → `auth.hostinger.com` → an **email + password form**.
You do not type the owner's credentials. Thank you for putting a copy of the instructions at
`docs/navaal/_UPLOAD-W1-POST.md` where the brief said they were — that was the right fix for a
brief that pointed at the wrong path.

Restate once in the queue: **the 71.9% is never published without the 36.2% sensitivity row beside
it**, and none of those numbers may go near the App Store listing at all (4.3.3/4.3.4).

---

## ORDER

Task 1 (verify all three fixes live — this is what CC is waiting on) → Task 4 (the deep link, now
that it exists) → Task 3 (the sweep) → then **stop and wait** for CC's two shas: P5.0 unblocks
Task 2, the greeting and the guard unblock Task 5.

Report: what you did, **what you saw quoted verbatim**, and whether it matched the claim. Where they
differ, that difference goes **first**. Append to the INBOX **without an ID** — two sessions once
both wrote `H13`.

And keep reporting the thing nobody asked about. "30 live" is the reason the app's credit accounting
is being audited at all, and nobody asked you to look at it.
