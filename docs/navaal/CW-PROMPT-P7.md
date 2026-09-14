# CW — PHASE 7 BRIEF (revised 2026-09-14, second pass): THE LEDGER, THE PRICE CARDS, THE CAPTURE

Paste this whole file. It replaces the earlier `CW-PROMPT-P7.md` in full. One current brief per
worker; nothing else in `docs/navaal/` is a CW instruction.

**Your last report was read in full, including the 28-row table in `06-QUEUE.md` §PHASE 7.** Four
things in it changed what everyone else is doing:

- **Task 2 was a no-op and you proved it rather than "fixing" it.** Privacy URL already
  `https://navaal.ai/privacy` at exactly 25/255; Shopify's form has no Terms field. CC's premise was
  wrong; you did not overwrite `/docs` to manufacture a result. Correct.
- **The 28-row table is the deliverable CC needed and could not produce from code.** Four
  populations in one viewport, the largest bigger than the catalogue a merchant can see; `14 active
  and draft` is Active only; `AI Content Published` means *published and not superseded* and moved
  30 → 27 → 24 while nothing was unpublished. CC is fixing it as a class in Part B against your table.
- **The achievement is not a shortcut.** Your Task 7 read corrected `11-MASTERPLAN.md` §2 — the
  "Visible" rung is gated on the same installs / reviews / rating as BFS, with no dashboard surface.
  That is now written into the plan.
- **The blast radius is real merchants.** `Merchants with your app: 8`; `Peter Shops — Installed`
  on 12 Sep is not one of ours. The scoreboard's "real merchants" moved from 0 to ≥1 on your read,
  and the P0 exposure population is at least three non-test shops until counted.

And the release proof was the right shape: `git merge-base --is-ancestor`, the `+0000` read off the
page, and *"proved by provenance, not by a rendered page"* kept as a distinction rather than
collapsed into a pass.

---

## ORIENT

`CW-STANDING-PROMPT.md` · `06-QUEUE.md` **INBOX (H12b) and §PHASE 7** · `07-VERIFICATION.md` #12
(with Cowork's correction under it) · `12-OFFER.md` §4 · `14-PRICING.md` §4.
`curl -s "https://app.navaal.ai/api/build-info?cb=$RANDOM"` — and re-read it mid-session.

---

## TASK 1 — H12b: EDIT THE PRICE CARDS. THE OWNER HAS READ THIS BRIEF; PASTING IT IS THE CONSENT.

You refused to edit this on 2026-09-14 because you could not tell from the screen whether it was
charging or display. That was the right refusal. It is now settled three ways: the app is on the
Billing API (`billing:` config, `billing.request()` at `app.plans.jsx:154`, one live subscription
id created through it); the released version moved nothing on this page (your 19-minute read,
Cowork's 12-minute read); and the editor shows the values as hand-typed cards. **Display, typed,
wrong in public.** Cowork's earlier claim that the release would clear it was wrong and is
corrected in `07-VERIFICATION.md` #12.

In the Partner Dashboard pricing section (the cards reading `$9.99/month or $99.90/year, 7-day
trial` etc.), via the `Edit` control on each of the three paid plans:

| Plan | Annual | Trial |
|---|---|---|
| Starter | **95.90** | **14 days** |
| Growth | **287.90** | **14 days** |
| Professional | **767.90** | **14 days** |

Monthly prices are already right. **Remove the 17% claim** (`14-PRICING.md` §4 bans it by name; the
true figure is 20% and it does not need stating). Free plan: leave it. Credits/feature lines: leave
them — H12 already put the true lines there.

**Read back on a fresh load**, then the public page cache-busted: expect `save 17%` **0**,
`7-day` **0**, `99.90` / `299.90` / `799.90` **0**, `95.90` / `287.90` / `767.90` **≥1** each,
`14-day` still present. If any card refuses the value or the form has a field you did not expect,
stop and quote it — do not improvise.

---

## TASK 2 — THE MERCHANT LEDGER. WHO ACTUALLY HAS THIS APP.

Partner Dashboard → app → App history (installs / uninstalls), read in full, oldest to newest.
For each event: date, store name, install or uninstall. Then classify each store: **ours** (`ttv-*`,
`qa-fresh`, `contentpilot-dev2`, EBS, elitepeps, anything the queue already names) or **real**.
Then, per real store: is it **currently installed**? That gives three integers the plan needs
today:

1. Real merchants currently installed (scoreboard metric 1)
2. Real merchants who ever installed (the P0 population)
3. Real merchants who uninstalled, and how long after installing

Post the ledger to the queue under §PHASE 7. **Merchant names stay in the queue file and in
`docs/history/`; never in a commit message, never in CI output.** This ledger is also what the
owner uses to decide disclosure once CC posts the A5 count, so accuracy over speed.

---

## TASK 3 — B8, WHICH YOU MAY BE ABLE TO CLOSE WITHOUT THE OWNER

`OWNER-CHECKLIST.md` carries B8: one active **Professional** subscription in our database, and
nobody knows whether it is a real charge or a `(Test)` one. The Partner Dashboard shows charges. On
2026-09-10 you read `Total earnings to date $0.00`. Read it again, and find the app's charges /
payouts list: is there any subscription charge at all, and is it flagged **(Test)**? The app history
already showed `Starter Plan $9.99 USD (Test)` on 10 Sep — the same page will show a Professional
one if it exists. Quote what you find. If earnings are still $0.00 and the only charges are marked
Test, B8 is closed and the owner's item goes away.

---

## TASK 4 — THE SUBTITLE FLAG

The editor flagged Subtitle: *"Review the updated guidance for this field and refresh your
content."* at 62/62. Open the guidance link, read it, and quote what changed — limit, banned
content, or format. **Do not rewrite the subtitle.** If the current text violates the new guidance,
route it to Cowork with the guidance quoted; approved copy comes from `12-OFFER.md`, never from a
session.

---

## TASK 5 — CAPTURE AND UPLOAD (gated on CC's Part B sha)

The store is frozen and capture-ready on your declaration; nobody mutates it until you post
`CAPTURE COMPLETE`. When CC posts the sha for the reconciled counts:

1. Re-read `/api/build-info` — the sha must be live, not merged.
2. Re-read Home and Products and confirm the four populations now agree with your table's "Real"
   column: `15` non-archived, `14 active + 1 draft`, and no count larger than the catalogue.
   **If they do not, do not capture.** Post the numbers and stop.
3. Capture all eight in the window. Look at every PNG. One sentence per unusable frame. Frame 04's
   nameless greeting is on a different store and is the owner's decision — capture it and report it.
4. Upload only with **≥3 clean desktop frames**. Read the live listing back on a fresh load.
5. Post `CAPTURE COMPLETE`.

---

## TASK 6 — THE SWEEP

Unchanged, and now with the Task 1 expectations folded in: `save 17%` 0, `7-day` 0, `99.90` 0,
`95.90` ≥1 on the public page; everything else as before. Integers.

## STILL OWNER-BLOCKED

- 0b (rendered storefront read): dev2 storefront password.
- W1 post upload: Hostinger password.

---

## ORDER

Task 1 → Task 3 → Task 2 → Task 4 → Task 6 → wait for CC's sha → Task 5.

Report claim-vs-screen first, verbatim, *could not read* when you could not. Queue under §PHASE 7.
Re-read `/api/build-info` and the Versions page mid-session — you have caught both moving before.
