# CW — PHASE 7 BRIEF: PROVE THE RELEASE, LINK THE LEGAL PAGES, THEN THE LAST CAPTURE

Paste this whole file. It replaces `CW-PROMPT-P0-VERIFY.md`, `CW-PROMPT-P6.md` and
`CW-PROMPT-P6B.md` (moved to `_superseded/`).

**Your Task 0 was the finding of the project** — not for cleverness, for discipline: the commit fact
from the repo first, the page's own timezone read rather than assumed, 0b reported as *could not be
run, not a pass*, and the two unprovable things named instead of implied. Three workers, including
me, read green deploys all week. You opened the page none of us did. It is false green **#12**, and
a mandatory ship-gate step for CC from now on.

---

## TASK 1 — PROVE THE RELEASE (gated on CC posting a version number)

When the queue carries CC's new version number and created time:
1. **Versions page.** Quote the active version's name and *Created* line verbatim with the `+0000`.
   It must be newer than `navaal-seo-geo-content-15` and created after **11:26:53 UTC 9 Sep**. If it
   is still v15, the release did not happen whatever CC's terminal said.
2. **Side-effect read.** Public listing: `save 17%` and `7-day`. Last time **3 / 3** on the page,
   **0** in every field we author. After a real release: **0 / 0** with nobody editing anything. If
   still 3, the release did not carry the billing config — a finding, not a wait.
3. **Pricing details.** Cards should read **95.90 / 287.90 / 767.90** and **14-day**. Quote one.
4. **0b, only if unblocked** (storefront password entered once in your browser, or protection off on
   `contentpilot-dev2` — never a real store): read the rendered product page for a FAQ containing a
   special character; say whether it is `&lt;`-escaped. Otherwise one line: *still blocked*.

---

## TASK 2 — THE TWO LEGAL URLS ON THE LISTING. NOT GATED. DO IT NOW.

CC's Phase 6 put `/privacy` and `/terms` live (HTTP 200, footer-linked on every page). The App
Store listing has a privacy-policy field, and it is empty. CC's instruction in the queue is the whole
brief: **link, don't paraphrase.** Read the exact URLs from CC's queue row, enter them in the listing
editor, save, read back on a fresh load, then confirm on the public page. A listing without a
privacy URL is a submission defect.

---

## TASK 3 — THE TABLE THAT LETS CC FIX THE SCREEN ONCE

On `contentpilot-dev2`, list **every number** visible on Home and on Products with its **exact
label**, verbatim, and the store's real product count beside it. Frame 01 alone showed six. CC is
producing the same table from its harness; yours is the one read by eye, and the comparison is the
point. Post it to the queue.

## TASK 4 — SET THE STORE UP SO THE NEXT CAPTURE IS THE LAST

Do not capture yet. But: leave **several drafts pending** so Review is not `Nothing to review` over
a blank frame; make sure the greeting shows the store name on every entry path; and write into the
queue the exact state the store is in plus **a capture window** during which nothing else may
mutate it — the last set was stale by one product because another worker's probe was running.
Generating drafts on a dev store is fine. **EBS stays read-only, always.**

## TASK 5 — CAPTURE AND UPLOAD (gated on CC's Part B sha)

When CC posts the sha for the reconciled screen: capture all eight in your announced window, look
at every PNG yourself, one sentence per unusable frame saying precisely why. Upload only with **at
least 3 clean desktop frames**. Read the live listing back on a fresh load and confirm the images
showing are the ones you uploaded.

## TASK 6 — THE SWEEP, EVERY SESSION

Editor fields, cross-checked cache-busted, fetch-sanity first. Expect **0** on doctrine phrases,
superlatives, `A/B variant testing`, `Priority support`, `ai content generations`, statistics,
testimonials in our fields, and now `save 17%` and `7-day` on the public page. Expect **1** each on
the two approved replacements. Name ≤30, intro ≤100, details ≤500, bullets ≤80, exactly 5 terms.
**Integers, not adjectives.**

## TASK 7 — ONE READ FOR TRACK B: THE ACHIEVEMENT CRITERIA

`11-MASTERPLAN.md` B4.1: the **"Increased visibility on key merchant surfaces"** achievement is our
real near-term target — a published search-ranking boost *without* the manual BFS design review.
Find its criteria page in the Partner Dashboard (Distribution, where you found the BFS scorecard) and
read every criterion with its current state, verbatim, the way you did for BFS on 2026-09-14. That
read tells the owner exactly how far the app is from the first rung.

## STILL OWNER-BLOCKED

The W1 post upload (Hostinger password). Unchanged.

---

## ORDER

Task 2 (unblocked, five minutes) → Task 3 → Task 4 → Task 7 → Task 6 → then **wait** for CC's two
posts: the version number unblocks Task 1, the Part B sha unblocks Task 5.

Report the difference between claim and screen first. Quote verbatim. *Could not read* when you could
not. INBOX, **no ID**. Re-read `/api/build-info` and the Versions page mid-session.
