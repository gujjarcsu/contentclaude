# CW — MID-SESSION ADDENDUM (paste into the running owner session, then say "go" for Hostinger)

Cowork verified from outside at the time of writing: **production is `4d32d98`** (started 06:48 UTC),
329 columns, healthy. Two things moved under you since your ORIENT, and both open tasks you had
correctly closed:

1. **Phase 12 is live.** `/privacy` and `/terms` answer `Accept-Language` for `de fr es it pt-BR ja`
   with `Content-Language` set; the German page renders as *Datenschutzerklärung*; and
   `grep -c 'id="part-1"'` on `app.navaal.ai/privacy` returns **1** — the two-part privacy merge
   (Part B) is deployed. Re-read `/api/build-info` yourself before acting on either.
2. **The lock is set and it shipped Part A** — your finding, and it is the right finding: on Fly,
   *Deploy Secrets* releases the newest built image, not the running one. Recorded for
   `07-VERIFICATION.md` as #18. Health is green; nothing to undo.

**Answers to the three premises you flagged:**

- **`support@` on 64 pages, not 5.** You are right that it is not an in-place edit. **Do not edit
  the 64 files.** The owner answers one question when he reads this: *is `support@navaal.ai` a real
  inbox?* If yes — nothing changes on the site; note it in the queue. If no — the fix is a **mail
  alias** (`support@` → `hello@`) at the mail provider, one setting, not 64 edits; the owner does it
  in the same sitting if the provider is one he can sign into. Either way, record which.
- **"done with it" phrasing** — accepted; your read of substance over string was correct.
- **Task 13 skipped** — correct at the time. It is **open now** (see below).

## Changes to the remaining tasks

**Task 2b — both files now.** With `part-1` returning 1, upload `privacy.html` **and** `terms.html`
and both `.htaccess` lines, exactly per `_UPLOAD-LEGAL-REDIRECTS.md`. Run all four checks in its §3.

**Task 2a** — the W1 post is currently **404** live; upload it and the two hand-edits as written.

**Task 13 — ENTER ALL SIX LISTINGS.** The app speaks each locale on production. For each of
de, fr, es, it, pt-BR, ja: enter every field verbatim from `LISTING-TRANSLATIONS.md`, editor
counter wins, save, read back on a fresh load, switch the public listing to that language and
confirm the subtitle and five bullets render, then set the listing's **Languages** field to all
seven. Post per locale. This is the last Track B item that scales without the owner's time.

**Task 15 (new) — A5, the alert reaches a phone.** `LOGIN NEEDED: UptimeRobot`. Send a **test
notification** from the deep-health monitor to the owner's contact (and to `hello@` if H16 is
done). The owner confirms receipt on his phone in the queue, with the time. Engineering Done A5.

**Task 16 (new) — A4, the restore drill, if Neon can be reached.** `LOGIN NEEDED: Neon console`.
Create a branch from a point in time ten minutes ago (never touch `main`), note how long it takes,
and post the branch name and the timestamp. **Do not connect the app to it.** CC runs the schema
and row-count comparison against that branch from the queue post, then deletes it. If Neon is not
reachable today, one line and skip. Engineering Done A4.

**Task 3 re-reads at `4d32d98`, not `356684c`.** FR13 by **click** (assert the URL you land on);
the GID form; the French shape store's first run — drafts in French, splash naming the language.
And the third confusion count on a fresh qa-fresh reinstall is Engineering Done **A1**; the five
remaining shape-store walks are **A11**. Both are yours; post the numbers.

Everything else in `CW-PROMPT-OWNER-SESSION.md` stands. Say "go" when Hostinger is signed in.
