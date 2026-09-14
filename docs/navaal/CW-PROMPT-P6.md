# CW — PHASE 6: UPLOAD THE FRAMES, THEN THE PRICE'S THIRD HOME

Paste this whole file. Short, because you cleared most of your queue.

**What you got right, and it was the most valuable thing in either report:**

- **You re-oriented mid-session and said so.** *"ORIENT 979b25b @ 04:16:52Z → re-read 8fa3000 @
  04:37:55Z. Re-orienting mid-session is the only reason this report is right."* That fixed the one
  real weakness in your last round. Keep it permanently.
- **You found the third home of the price.** Phase 4 and Phase 5 both audited the code and the
  listing fields and both declared the price consistent. Both were incomplete. Shopify's own
  registered plan metadata — `$99.90/year and save 17%`, and a `7-day free trial` badge under our
  true 14-day line — is not in this repo and cannot be seen from the code. **Nobody had it in the
  inventory.** It is now a rule in the guiding files.
- **You did not touch it.** Changing what a merchant is charged is a billing change, not listing
  copy, and you had only an `Edit` control and no price inputs. Correct call.
- **You left our true 14-day line in place** rather than making the card self-consistent by
  publishing something the app no longer does. That is the right instinct about which kind of
  wrongness matters.
- **Three things you got wrong and corrected before reporting** — the resource route with no loader,
  the `null`-as-value probe, the `[name=…]` selector your own earlier note had already warned you
  about. Reporting those is worth more than a clean report would have been.

**One thing I can now resolve that you could not from the screen.** You wrote: *"If Shopify charges
from its registered plan, an annual subscriber pays $99.90, not $95.90."* I read the billing path:
this app is on the **Billing API**, not Managed Pricing — `shopify.server.js` declares a `billing:`
config built from the locked table, `app.plans.jsx:154` calls `billing.request()`, and the one live
subscription carries an id created through that path. **So those figures are display, not charging.
Nobody is charged $99.90 and nobody gets a 7-day trial.** Your warning was the right warning to
raise; the answer is the benign one. It is still public and still wrong.

---

## ORIENT

`CW-STANDING-PROMPT.md` · `06-QUEUE.md` **INBOX, top three rows are new** · `07-VERIFICATION.md`
false greens 8–11 · `12-OFFER.md` §4.

```
curl -s "https://app.navaal.ai/api/build-info?cb=$RANDOM"
```
Live when this was written: **43f56a2**, 245 columns. **Re-read it mid-session**, the way you did
last time.

---

## TASK 1 — THE FRAMES. YOUR GATE IS OPEN.

CC cleared all three H7 blockers at `63fe948` and re-captured **8/8 against production**, confirmed
by looking at the PNGs rather than reading the diff: `frameOnly` gone (no Shopify wordmark, no left
nav, **no Sidekick icon** — `09-DOCTRINE.md` §2 names a Sidekick reference as a BFS rejection reason
and we were shipping it inside the listing images), the greeting now reads
`Welcome back, Northline Supply!` matching the admin badge, and the stale `/scores \d+\/100/i` guard
replaced with a **stricter** one requiring the literal `Store SEO score` label.

**Look at all eight yourself before uploading any of them.** CC's check was by eye and it was
honest, but you are the one whose eye this system trusts. Shopify wants **3–6 desktop**. For any
frame you will not upload, one sentence saying precisely why.

Then upload the set and read the live listing back on a fresh load to confirm the images showing
are the ones you uploaded.

---

## TASK 2 — THE PRICE'S THIRD HOME: DETERMINE, THEN STOP

**Do not edit anything on this screen in this session.** One question, and it decides whether this
is a cosmetic fix or a live billing defect:

In the Partner Dashboard app-pricing section, **is it "Managed pricing" or manual / display-only?**

- **Display-only** → the $99.90 / `save 17%` / 7-day badge are stale listing metadata. The fix is
  the `Edit` control on each card: annual to **95.90 / 287.90 / 767.90**, trial to **14 days**, and
  `save 17%` gone (`14-PRICING.md` §4 bans the phrase by name — the true figure is 20%). Report that
  it is safe, and I will route the edit with the owner's sign-off since there is one live
  subscription.
- **Managed pricing** → Shopify charges from those cards, the code's numbers are decoration, and
  this is a **live billing defect**, not a display bug. **Say so and stop.** Do not edit.

Quote the section heading verbatim either way. That sentence is the whole task.

---

## TASK 3 — THE LISTING SWEEP, PLUS ONE NEW LINE

Run your sweep exactly as before — editor fields, cross-checked cache-busted, fetch-sanity first.
Your H12 publish was clean work: 20 feature lines, each length-checked **before** typing, read back
on a full reload, and you caught that the **unit** was wrong as well as the number
(`AI content generations` where §1 forbids mixing it with weighted `credits`). Nobody asked you to
check the unit.

**Add to the sweep permanently:** `save 17%` and `7-day` as expect-**0** strings on the public page.
They are not in any field we author, which is exactly why they need a standing check — the sweep
that only covers what we write is the sweep that missed them.

---

## TASK 4 — STILL OWNER-BLOCKED

The W1 post upload. Hostinger shows an email + password form; you do not type the owner's
credentials. Unchanged, and thank you for moving the instructions to the path the brief named.

---

## ORDER

Task 2 first — it is one screen and one sentence, and it is the highest-stakes unknown in the
project right now. Then Task 1. Then Task 3.

Report: what you did, **what you saw quoted verbatim**, whether it matched the claim, and the
difference first where they differ. INBOX, **no ID**.
