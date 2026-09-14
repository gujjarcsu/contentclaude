# CW — PHASE 9 BRIEF: THE SECOND COUNT, THE FIVE SLOTS, THE CAPTURE

Paste this whole file. It replaces `CW-PROMPT-P8.md` (moved to `_superseded/`).

**Two of your findings became decisions today, and one unblocked you.**

- **Task 4 is unblocked.** You were right that there were no free slots and no ordering in §5, and
  right not to author listing copy. The five slots are now decided — `12-OFFER.md` **§5.6**, in
  order, verbatim. Two §4 lines are displaced; the bulk-fix line is not a slot.
- **The credit-reset mismatch** (`/terms` calendar month vs Shopify's 30 days) is a real finding and
  the resolution is the favourable one: the code already resets on the calendar month, so a
  merchant who subscribes on the 20th gets a full allowance and then a full reset on the 1st. The
  contract and the plans page will say so in one sentence; CC is making it so.
- **The missing transfer basis** in `/privacy` is going in, generated from the processor list.

And Task 1 was done the right way round — the page read in full before the listing was pointed at
it, and the stale site links noted rather than assumed fixed.

**Also: CC's Part A is live** (`978bcb8`, `a3fa978`; production `ae8ed69`). Your last report was
waiting on that sha. It has landed. Task 2 is open.

---

## ORIENT

`CW-STANDING-PROMPT.md` · `06-QUEUE.md` INBOX (top three rows) · `12-OFFER.md` **§5.6** ·
`docs/history/screen-reads/first-run-qa-fresh-2026-09-14.md` §3 (your FR0–FR14).
`curl -s "https://app.navaal.ai/api/build-info?cb=$RANDOM"` — must be `ae8ed69` or later.

Store rules unchanged: dev2 and qa-fresh frozen until `CAPTURE COMPLETE`; EBS read-only; real
merchants public pages only.

---

## TASK 1 — THE FIVE SLOTS, EXACTLY AS §5.6

In the listing editor, replace the five Feature lines with §5.6's five, **in §5.6's order**:

1. `Full catalog SEO audit, never capped by plan or store size` (58, unchanged)
2. `See what AI shopping feeds require that your products are missing` (65, new)
3. `AI descriptions, meta tags, alt text and FAQs in your own brand voice` (69, unchanged)
4. `Daily checks tell you when a theme or import breaks your product data` (69, new)
5. `Nothing publishes until you approve it. Edit, publish or roll back anytime` (74, unchanged)

Length-check before typing. Save. Read back on a fresh load. Cross-check the public page: the two
new lines present once each, the two displaced lines (`Blog posts and collection copy…`,
`Every publish is checked…`) at **0**. Then the sweep (Task 6).

---

## TASK 2 — THE SECOND COUNT. THIS IS CC'S GATE, AND ONLY YOU CAN CLOSE IT.

1. Post to the queue asking CC to run the **First-run reset** workflow on `navaal-qa-fresh` (it
   nulls `firstDraftSeenAt` for one named dev store). Confirm in the queue it ran; then walk.
2. Same file format, same stopwatch. **Re-check FR0–FR14 by name**: *fixed / changed / unchanged*,
   verbatim screen for each. CC read live: a labelled GEO headline, *"3 credits of the 97 you have
   left"*, *"This product: 31/100"*, *"Welcome, Navaal TTV 03!"*, drafts counted 75 s later, the
   Free primary action *"Write the next 3 drafts"*. Your read decides whether those hold on the
   path a merchant takes.
3. List any **new** confusion the fixes introduced. The 75-second draft count is one to watch: CC
   calls it "counted 75 s later" — say what a merchant sees during those 75 seconds.
4. **Report the number.** It was 15. If it is not materially lower, say so plainly; CC's Part A
   reopens ahead of its Phase 9 brief.
5. `navaal-ttv-02`: quote Home's credit line — CC says *"Monthly credits · 6 / 100 used"*.

`docs/history/screen-reads/first-run-qa-fresh-2026-09-14b.md`.

---

## TASK 3 — THE CAPTURE, IF TASK 2 PASSES

Only if the second count is materially lower and nothing on screen contradicts the catalogue:

- **04** from `navaal-qa-fresh` in the state Task 2 leaves it — real name, first-visit copy.
- **01/06, 02/07, 03/08, 05** from `contentpilot-dev2` (6 drafts pending). Re-read its four
  populations first; they must still agree.
- Nothing else touches either store during the window. Look at every PNG; one sentence per unusable
  frame. Upload only with **≥3 clean desktop**; captions from `12-OFFER.md` §4 language. Read the
  live listing back on a fresh load. Post `CAPTURE COMPLETE`; both freezes lift.

If Task 2 does not pass: no capture. Post the count and stop.

---

## TASK 4 — RE-READ THE LEGAL PAGES AFTER CC'S PART A SHA

When CC posts it: `/terms` carries the reset sentence verbatim and the plans page carries the same
sentence; `/privacy` carries a transfer-basis paragraph naming each US processor's DPA/SCC link.
Quote both. Then re-run yesterday's expect-0 list on both pages (`7-day`, `25 generations`,
`ten months`, `17%`, old annual prices, `support@`).

---

## TASK 5 — F3, WHEN CC POSTS ITS PART B SHA

On a dev store with a **multi-variant** product whose barcode is on a later variant (create one on
`navaal-ttv-03` if none exists — a dev store, not frozen), confirm `/app/attention` no longer grades
it "no barcode". Quote the row before and after.

---

## TASK 6 — THE SWEEP

Standing. Add the two new slot lines to expect-1 and the two displaced lines to expect-0. Privacy
host `app.navaal.ai`. `availability` stays at 0 — good addition.

## TASK 7 — WHEN THE CLOCKS SAY SO

Webhooks on or after 16 Sep; App Store rank on 21 Sep (real browser); the `navaal.ai` redirect
check once the owner has uploaded CC's files (`navaal.ai/privacy` → 301 → `app.navaal.ai/privacy`).

## STILL OWNER-BLOCKED

Hostinger session (W1 post + two redirects). `REMEDIATION_LOCKED_SHOPS`. F10 (one dev store
public + Bing key — the first proved holdout). P0.10 (Level 2). B0.1.

---

## ORDER

Task 1 → Task 6 → Task 2 → Task 3 → Task 4 and Task 5 as CC's shas land → Task 7 when due.

Claim-vs-screen first, verbatim, *could not read* when you could not. Queue under
`## PHASE 9 — CW`, no IDs. Re-read `/api/build-info` between tasks.
