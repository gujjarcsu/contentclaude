# CC — PHASE 13: KEEPING. CLOSE THE GATE, THEN STOP BUILDING.

Paste this whole file **after CW's owner-session report has landed in the queue** (it reacts to
that report). It replaces `CC-PROMPT-P12-CLOSING.md` (moved to `_superseded/`). Phase 12 is
verified from outside: production `4d32d98`, 329 columns, six locales answering with
`Content-Language`, `id="part-1"` on the generated privacy page. **Nothing in this brief is a new
feature.** Your job from here is to close `11-MASTERPLAN.md` §6.5 and keep the app true.

## ORIENT

`06-QUEUE.md` from `## OWNER SESSION — CW` to the end — every task CW marked done / skipped, and
every post that names you. `/api/build-info` — confirm main and production match; if origin/main is
ahead by a docs-only commit, confirm it deployed green. `OWNER-CHECKLIST.md`, `RUNBOOK.md`.

---

## PART A — CLOSE ENGINEERING DONE (the four lines you could not tick alone)

| | Line | What you do now |
|---|---|---|
| **A4** | A tested restore | CW created a Neon **branch** from a point in time and posted its name and timestamp. Run the schema check and a row-count comparison (every table) against that branch vs production; post the table and the elapsed time; **delete the branch**; write the whole procedure into `RUNBOOK.md` so a second person could repeat it. If CW could not reach Neon, A4 stays open and you say so — do not tick it on a rehearsal. |
| **A5** | Alerting reaches a human | CW sent a test notification; the owner posted the time he received it on his phone. Cite it. If the post is missing, A5 stays open. |
| **A1** | Nothing contradicts itself | CW posted the **third confusion count** on a fresh `navaal-qa-fresh` reinstall. ≤ 3 closes it. Above 3: each remaining FR item is a fix, as a class, then CW counts again — this is the one thing in this brief that may still touch code, and only this. |
| **A11** | No untested store shape | CW posted the five remaining shape-store walks. Any grading CW found wrong against the catalogue is a fix, then re-proved on that store. |

When all twelve read ✔ with the proof each line names, **mark §6.5 CLOSED with the date** and post
the twelve lines with their citations in one queue post. Cowork re-verifies each from outside.

---

## PART B — THE FIRST RESULT, END TO END (gated on CW's F10 post)

CW made `navaal-ttv-03` public, verified it in Bing, saved the key, published ten products, and
either ran the Crawl-holdout workflow or posted `F10 READY`.

- If `F10 READY` is posted and the workflow has not run: run it. Post the run id.
- **C3, the Lighthouse number (F13):** run the harness against ttv-03 with the FAQ block on and
  off; weighted home 17 / product 40 / collection 43; write the number into `BFS-AUDIT.md`. Under
  10 or say why not.
- **0b, the rendered read:** fetch a ttv-03 product page and confirm the FAQ block is
  `&lt;`-escaped in the served HTML. Post the line.
- **~72 hours after the holdout ran:** read the result. Post both arms, the interval, the seed, and
  the one plain sentence the merchant screen shows. Write it into `docs/history/` as the first proof
  this app has produced. Confirm the weekly report fires for ttv-03 the following Monday and the
  review ask is armed on that result — the chain result → report → ask, proved once.

---

## PART C — HOUSEKEEPING THAT CW'S SESSION HANDS YOU

- **Shop kind seed:** if CW posted the domain list instead of running the workflow, run it, then
  the Funnel workflow; post the reading over real shops only (expect 2 installed / 3 ever / 0
  published / unclassified 0).
- **The webhook read** (CW's Task 11): if the 7-day window has cleared and any post-fix delivery
  failed, that is a defect — trace it in Fly logs and fix it; otherwise cite the clean read and
  close H10 for good.
- **Frames 01 and 04:** if CW added them, nothing; if CW posted a contradiction on either, it is a
  fix, then CW re-captures that one frame.
- **CW's per-locale trim list** from the six listings: if the editor made CW shorten a field, check
  the app's own copy for that locale is not longer than the same limit anywhere merchant-visible.
- **Two real merchants' emails:** if the owner sent them and a reply arrives at `hello@`, the owner
  answers; you do nothing unless a reply reports a defect.

---

## PART D — THE STANDING WATCH (from now on, every session, and nothing else)

1. `/api/build-info` and `/api/health?deep=1` — main and production match, health ok.
2. The **Monday digest** arrived (first: 21 Sep 08:30 Sydney); its numbers reconcile to CW's ledger.
3. The **nightly reconciliation** ran and disagreed with Shopify on zero shops.
4. The **clock tests** (A6) are green; the day one goes red, that is the next phase and it is
   scheduled, not improvised.
5. The **support inbox** (`hello@` and `support@`, both real): any merchant report of wrong content
   published is the highest-priority item in the system, ahead of everything in this file.
6. The **funnel**: a real merchant who reaches *first draft seen* and never *first publish* within
   seven days is a B0.3 finding — post what the screen showed them, for Cowork.

**Re-open rule:** a feature enters this app only when the owner re-opens §6.5 in writing, naming
the merchant evidence that justifies it. Security fixes, platform sunsets and merchant-reported
defects need no re-open.

## HYGIENE — unchanged

`git diff --cached --stat` · pushes branch on the suite's exit · gates read the script's exit ·
toml or `extensions/` ⇒ app version · **Fly's Deploy Secrets ships the newest built image** (#18) —
never press it as a restart · suite after the last edit · no secret printed · nothing you run
touches EBS or a real merchant's store.

## DONE MEANS

- [ ] A1, A4, A5, A11 closed on evidence, or left open with the reason stated
- [ ] §6.5 marked CLOSED and the twelve lines posted with citations
- [ ] Lighthouse number in `BFS-AUDIT.md`; the rendered escape read; the holdout run id
- [ ] The holdout readout written up when it lands; report → ask proved once
- [ ] Every Part C hand-off resolved
- [ ] Written back. Then stop, and report what is true now that was not when this phase started.
