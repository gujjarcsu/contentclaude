# CW — PHASE 11 BRIEF: THE SIX SHAPE STORES, THEN THE FIRST RUN THAT FINISHES THE CAPTURE

Paste this whole file. It replaces `CW-PROMPT-P10.md` (moved to `_superseded/`).

**Two things you did last pass are the reason the next phase is shaped the way it is.**

- **You did not uninstall `navaal-qa-fresh`.** You had the dialog open; it was the obvious way to
  force the splash and get frame 04; the freeze was yours to lift. You stopped because that store
  is the only live example of the app and Shopify disagreeing about whether a shop is installed,
  and that state cannot be recreated on demand. It is now CC's Part A, first, ahead of everything:
  a shop the app believes uninstalled is unmonitored, absent from the funnel, and one confusion away
  from a `shop/redact` deleting an installed merchant's data. **Do not touch qa-fresh until CC posts
  *"qa-fresh: CC is done with it"*.**
- **You tested the route and the control separately** and found the route right and the control
  unwired — and then named the GID trap for whoever fixes it. The button was rewired in `f77eef9`,
  two lines, **after** your read at `1e6873e`; the GID form still silently renders everything, and
  that is routed. Re-verify the button at `08d8b3e` or later before concluding either way.

Also right: flagging *do not* / *don't* against a bar of "identical" (routed), the Neon DPA link
resolving to a terms anchor (noted, not a defect), and reading F3 as fixed-in-code / could-not-read-
on-screen with both reasons on the page.

**One number from CC's funnel you should know is wrong:** *"11 real shops."* Its test-shop pattern
excludes only `ttv-*`, `qa-*`, `shape-*` and `contentpilot-dev*`, so the 11 include EBS,
`contentpilot-test` and Shopify's own reviewer and Mars stores. **Your ledger is the classification**
— 3 real ever, 2 now — and CC is replacing the pattern with an explicit kind seeded from it.

---

## ORIENT

`CW-STANDING-PROMPT.md` · `06-QUEUE.md` INBOX (top four rows) and CC's Phase 10 post ·
`docs/navaal/SHAPE-MATRIX.md` · `12-OFFER.md` §4 for captions.
`curl -s "https://app.navaal.ai/api/build-info?cb=$RANDOM"` — `08d8b3e` or later.

Store rules: **dev2 frozen** until `CAPTURE COMPLETE`; **qa-fresh untouched** until CC's "done with
it"; `ttv-03` and the new `shape-*` stores are not frozen; EBS read-only; real merchants public
pages only.

---

## TASK 1 — THE SIX `navaal-shape-*` STORES (ungated; do this while CC works Part A)

CC's Phase 10 route, verbatim in the queue: **create the six `navaal-shape-*` dev stores, import
each catalogue from the CSV CC generated (`da265c4`), install the app last, post the handles.** The
names must match the `navaal-shape-` pattern exactly — the test-shop guards key on it. Install
**last** so the first walk sees the finished catalogue, not an empty one. For each store post: the
handle, the product count after import, the shape it represents, and whether the import published
to the Online Store (CC says CSV import does, without `write_publications`). Then read the app's
first screen on each and quote it — the all-draft and B2B stores should now read *"Your products
aren't on your Online Store yet"* rather than *"add a product"*.

This closes the matrix's 75 NOT RUN cells. It is the longest task in this brief and it is not gated.

---

## TASK 2 — THE FIRST RUN THAT FINISHES THE CAPTURE (gated on CC's "done with it")

When CC posts it:

1. Uninstall and reinstall the app on `navaal-qa-fresh` **from the listing** — a genuine first run
   on a 12-product store already named Northline Supply.
2. Read, same file format: **FR8** three rows, three different product scores (or no score on the
   row); **N1** *"…of the 97 you have left"*, not 100; **FR13** the row `[Review]` on a draft opens
   `/app/review?product=<numeric>` with approve and publish on it; **FR2** *"Welcome, Northline
   Supply!"*, not "back". Quote each.
3. Capture **04** there. Then `contentpilot-dev2`: four populations agree, `1%` not `0%`, the
   Shopify-draft row as before — capture **01/06, 02/07, 03/08, 05**.
4. Every PNG looked at; one sentence per unusable frame; **≥3 clean desktop** or no upload;
   captions from `12-OFFER.md` §4; read the live listing back on a fresh load.
5. `CAPTURE COMPLETE`. Both freezes lift.

`docs/history/screen-reads/first-run-qa-fresh-2026-09-15.md`.

---

## TASK 3 — RE-READS AS CC'S SHAS LAND

- `/app/attention` Method paragraph names the multi-variant read.
- `/terms` and the in-app plans FAQ carry byte-identical reset sentences.
- `/app/review?product=gid://…` refuses with a message instead of rendering all cards.
- The funnel post says **3** real shops, and the number of unclassified.

## TASK 4 — THE SWEEP

Standing.

## TASK 5 — CLOCKS

**Webhooks: due 16 Sep** (tomorrow) — the launch-day failures should have aged out of the 7-day
window; same format as H10. App Store rank 21 Sep. The `navaal.ai` 301 check after the Hostinger
session.

## STILL OWNER-BLOCKED

Hostinger · `REMEDIATION_LOCKED_SHOPS` · F10 (one dev store public + Bing key) · P0.10 · B0.1.

---

## ORDER

Task 1 → Task 4 → **wait** for CC's "done with it" → Task 2 → Task 3 as shas land → Task 5 on the 16th.

Claim-vs-screen first, verbatim, *could not read* when you could not. Queue under
`## PHASE 11 — CW`, no IDs.
