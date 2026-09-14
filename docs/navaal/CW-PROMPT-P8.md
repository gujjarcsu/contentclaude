# CW — PHASE 8 BRIEF: RE-POINT THE LISTING, THEN COUNT THE CONFUSIONS AGAIN

Paste this whole file. It replaces `CW-PROMPT-P7.md` (moved to `_superseded/`).

**Your first-run walk is the most useful document this project has produced about the product.**
~20 seconds to a good draft — that is the whole business — and fifteen numbered confusions on the
way, each quoted. It is now Part A of CC's brief, and the gate on that part is **your second count**,
not CC's list. Also right, all of it: refusing to capture with a stale name on frame 04 and a
*Live* badge on a draft product; reading Shopify's own charge page as the price's fourth home
(`14-day`, `$29.99 every 30 days`, nothing approved); and the tooling finding — the Chrome
extension cannot click inside the app iframe, Playwright can — which retires two earlier "defects".
All in `07-VERIFICATION.md` now.

**And you found the legal pages' two homes without knowing it.** CC verified `app.navaal.ai/privacy`
and `/terms` (current, 14 Sep). You read `navaal.ai/privacy` and `/terms` — the static Hostinger
copies the **listing links to**, 4 Sep and 8 July. Both reports were true. Cowork confirmed all four
URLs. That is false green #14 and it is your Task 1.

**ID note:** your F0–F14 collide with `02-BACKLOG.md`'s F1–F8. Everyone now calls yours **FR0–FR14**.

---

## ORIENT

`CW-STANDING-PROMPT.md` · `06-QUEUE.md` INBOX (four new rows) and `## PHASE 7 — CW` ·
`07-VERIFICATION.md` #12–#14 and the tooling notes · `12-OFFER.md` §4 and §5 (§5's second bullet
was reworded today).
`curl -s "https://app.navaal.ai/api/build-info?cb=$RANDOM"` — live was `40d8a93` when this was
written; it will move.

**Store rules:** `contentpilot-dev2` and `navaal-qa-fresh` stay frozen by your declaration until
you post `CAPTURE COMPLETE`. EBS, `askebs.com.au`, `elitepeps`: read-only. Real merchants: public
pages only.

---

## TASK 1 — RE-POINT THE LISTING'S PRIVACY URL. NOW, UNGATED.

Listing editor → `Privacy policy URL`: change `https://navaal.ai/privacy` to
**`https://app.navaal.ai/privacy`** (the current, generated page; public, unauthenticated, 14 Sep,
discloses the Anthropic key, 14-day trial, Neon, `hello@`). Save. Read back on a fresh load. Confirm
on the public page that the link now points at `app.navaal.ai`. That is the only field to touch —
there is no terms field, as you proved.

The stale `navaal.ai` copies still exist until the owner uploads CC's redirect files; note that
the marketing site's own footer still reaches them.

---

## TASK 2 — GATED ON CC'S PART A SHA: WALK THE FIRST RUN AGAIN, AND COUNT

When CC posts the Part A sha and `/api/build-info` shows it live:

1. Ask CC (queue) to run the **First-run reset** workflow against `navaal-qa-fresh` — it nulls
   `firstDraftSeenAt` for one named dev store, name-pattern guarded. Do not reinstall; the reset is
   the point.
2. Walk it exactly as before, same file format, same stopwatch. **Re-check every one of FR0–FR14
   by name** and mark each *fixed / changed / unchanged*, with the verbatim screen. Then list any
   **new** confusion the fixes introduced.
3. Report **the number**. It was 15. That number is CC's gate, and if it is not materially lower,
   say so plainly and CC goes again.
4. Also on `contentpilot-dev2` (read-only): the `Live` badge on `Rope Basket Large` — gone or
   renamed? And do the four populations still agree?
5. On `navaal-ttv-02`: Home must now read Free against **100**, not 25 (F8). Quote it.

Write-up: `docs/history/screen-reads/first-run-qa-fresh-2026-09-14b.md`.

---

## TASK 3 — THE CAPTURE, IF TASK 2 PASSES

Only if the second count is materially lower and no frame would carry a contradiction:

- **04** from `navaal-qa-fresh` in the first-run state Task 2 leaves it (real name in the hero,
  first-visit copy, no "Welcome back").
- **01/06, 02/07, 03/08, 05** from `contentpilot-dev2` (6 drafts still pending).
- Nothing else touches either store during the window.
- Look at every PNG. One sentence per unusable frame. Upload only with **≥3 clean desktop**.
  Captions from `12-OFFER.md` §4. Read the live listing back on a fresh load.
- Post `CAPTURE COMPLETE`. Both freezes lift.

If Task 2 does not pass, do not capture. Post the count and stop; the capture waits for CC's next sha.

---

## TASK 4 — §5's THREE PHASE 2 LINES ARE NOW PUBLISHABLE. PUBLISH THEM.

Phase 2 is live (`8922dde` and later). `12-OFFER.md` §5 is gated per line; **only these three
bullets** may go onto the listing, verbatim, and only into feature slots that are free or that
replace weaker §4 lines by Cowork's ordering in §5:

- `Daily checks tell you when a theme or import breaks your product data`
- `See what AI shopping feeds require that your products are missing` *(reworded today)*
- `Fix missing barcodes, option names and alt text across your catalog in bulk`

**Not** the two Phase 3 bullets (referral sessions, the crawl holdout). Length-check each before
typing (≤80). Read back on a fresh load. Cross-check the public page. Then the sweep.

---

## TASK 5 — TWO READS, WHEN THEIR CLOCKS SAY SO

- **Webhooks:** the window on screen was Sep 7–14. Re-read when it starts on or after
  **8 Sep 20:00 UTC** (~16 Sep) so the launch-day failures have aged out. Same format as H10.
- **App Store rank:** weekly, same seven queries plus the category, **real browser only**. Next
  due **21 Sep**. Today's baseline is in `11-MASTERPLAN.md` §7 metric 13.

---

## TASK 6 — THE SWEEP

Standing. Editor fields, public cross-check, fetch-sanity first. Expect `save 20%` 3, `14-day` ≥3,
replacements 1 each, everything else 0; limits; five terms; **and now the privacy link host**.

---

## STILL OWNER-BLOCKED

Hostinger (W1 post + the two legal redirects, one session). `REMEDIATION_LOCKED_SHOPS`. B0.1.

---

## ORDER

Task 1 → Task 4 → Task 6 → **wait** for CC's Part A sha → Task 2 → Task 3 → Task 5 when due.

Report claim-vs-screen first, verbatim, *could not read* when you could not. Queue under
`## PHASE 8 — CW`, no IDs. Re-read `/api/build-info` between tasks. Keep the stopwatch.
