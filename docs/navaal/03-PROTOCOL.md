# SESSION PROTOCOL

The owner pastes one standing prompt and walks away. You self-direct, in a loop, until there is
genuinely nothing left that you own. This file is how a session runs.

**The shape of a session:** ORIENT once → then loop { PICK · DO · VERIFY · WRITE BACK · ROUTE }
→ HAND OFF → REPORT.

---

## STEP 0 — ORIENT (once, at the start, no exceptions)

**0a. Read the CORE in full:** `00-CONSTITUTION.md` · **`09-DOCTRINE.md`** ·
**`11-MASTERPLAN.md`** · `01-NORTH-STAR.md` · `02-BACKLOG.md` · this file.
`README.md` gives the order of authority when two files disagree. Then `PROGRESS.md` and `git log --oneline -20`. Reference files are read later, when
their trigger fires (see `README.md`).

**0b. Is what we built actually live?** (L19) Two commands:

```
git status -sb
curl -s https://app.navaal.ai/api/build-info
```

If the deployed `shortSha` is not the tip of `origin/main`, or `main` is ahead of `origin/main`,
then finished work is not reaching merchants. Say so at the top of your report, before anything
else, and treat shipping it as the first item.

**How shipping works here, verified in `ci.yml`:** the `deploy` job runs
`if: github.ref == 'refs/heads/main' && github.event_name == 'push'` (line 140) and calls
`flyctl deploy` (line 148). **A push to `main` IS a deploy.** `deploy.yml` (`workflow_dispatch`)
deploys the same thing again — doing both is the INFRA1 double-deploy. Both paths now skip a sha
that is already live, but the rule stands: **push, then verify. Do not also dispatch.**
And because a push deploys, **do not push mid-phase** (L11).

**0c. Reconcile the backlog.** It is authoritative for WHAT, never blindly for STATUS. Check each
`DONE` against the code. Report every status you corrected and why. If you corrected nothing, say
that you checked and found nothing — silence is not the same claim.

**0d. Check the folder for falsehoods.** If anything in `docs/navaal/` contradicts the code, fixing
it outranks everything else in the backlog (README rule 4, L16). Correct it, record the correction
with line numbers, and lead your report with it.

---

## STEP 1 — PICK

Take the **lowest-numbered unblocked item you own** in the earliest unfinished phase
**of `11-MASTERPLAN.md`**.
Phases are strictly ordered: never start a later phase while an earlier one has an item open
*that you own and that is not blocked*.

- Take more than one item only when they share a root cause. Say why.
- If the current phase has nothing left for you, route what remains (Step 4) and move to the next
  phase's first item — and say explicitly that you did.
- Never invent work that is not in the backlog. If something belongs there, add it as an item,
  give it an owner and a reason, and only then do it.

---

## STEP 2 — DO

Under the constitution. Small commits. Tests with every change. Never edit an applied migration.
Never write to a live commercial catalogue.

---

## STEP 3 — VERIFY

Read `07-VERIFICATION.md` and use the proof the claim class requires. At minimum:

- The false-green answer for every check you touched: what would it print if the thing it watches
  were completely broken? (L1)
- **Break at least one guard** and report the count of tests that fail.
- Store shapes proved, and the ones not proved (L2).
- Real numbers with their method, or the words "not measured" (L3).
- From outside, cache-busted, byte deltas checked (L4).
- For anything a merchant touches: reachable **and visible on a rendered page** (L15).

---

## STEP 4 — WRITE BACK, AND ROUTE

Write back into the repo, every loop, before moving on:

- `02-BACKLOG.md` — status, plus any item you discovered, **with an owner**
- `01-NORTH-STAR.md` §10 LOG — one line per material change
- `PROGRESS.md` — the detail
- `06-QUEUE.md` — everything you could not do

**Routing (L17).** Anything you could not finish gets an owner and a brief. Use this template,
appended to the INBOX section of `06-QUEUE.md` **with no ID** (IDs are assigned at orient by
whichever session reconciles first — never renumber, never assign mid-session):

```
- **[OWNER: CW | OWNER | COWORK]** <one-line title>
  WHY: what is blocked without it, and which backlog IDs it unblocks.
  DO: the exact click path, URL or command. Assume no context.
  DONE LOOKS LIKE: the specific thing that must be read back, on a fresh page load.
  PASTE BACK: exactly what to send to the next session.
```

A brief its owner has to ask a question about is not finished. Write it so a stranger could act.

---

## STEP 5 — LOOP

Go back to Step 1. **Do not stop after one item.** Keep going until one of these is true:

1. **Nothing left you own** — every remaining item in every open phase is owned by CW, COWORK or
   OWNER, or is blocked by something in the queue.
2. **An owner decision is required** that is not already settled in `04-DECISIONS.md`.
3. **A law would have to be broken**, or the work is irreversible, or it needs a live commercial
   catalogue written to.
4. **Context is running out** — in which case write back and hand off *first*, then say so.

A single blocked item is never a stop condition. Route it and take the next one.

---

## STEP 6 — HAND OFF (always, before you report)

Regenerate both handoff files from the pending rows of `06-QUEUE.md`. These are what the owner
actually acts on, so they must be current the moment you stop.

- **`CW-BRIEF.md`** — one paste-ready prompt containing **every** pending `CW` task, in priority
  order, each with its full brief. It opens with the context a fresh Cowork session needs (app,
  URLs, what is at stake) and closes with what to paste back. One prompt, all tasks, no follow-up
  questions.
- **`OWNER-CHECKLIST.md`** — every pending `OWNER` task, ordered by what it unblocks, each written
  so it can be done in minutes: the exact URL, the exact click, the exact thing to read back.

If either file has no pending items, say so in it rather than leaving a stale copy.

---

## STEP 7 — REPORT

1. **Is production current?** The deployed sha, the ahead-count, and whether anything is
   finished-but-unshipped. One line, first.
2. **What I corrected during orient** — statuses, and any falsehood in `docs/navaal/`.
3. **What I did** — per item: ID, commit sha, and the evidence, including for each guard the
   count of tests that fail when you break it.
4. **What I routed** — what went to CW, to the owner, to Cowork, and what each unblocks.
5. **What I found that nobody asked about** (L14 — the most valuable section in every session so
   far; never omit it).
6. **What I taught the system** (L18) — the law, fact or technique I added, and where.
7. **The next item**, by ID and owner.

Numbers first, interpretation second. If you could not read something, say **"could not read"** —
never report "no change" when what happened is "could not check".

---

## THE FOUR THINGS THAT WASTE A SESSION

1. Re-researching something already in `05-EVIDENCE.md`.
2. Re-opening a decision in `04-DECISIONS.md` without new evidence.
3. Starting a later phase while an earlier one has unblocked work you own.
4. Stopping on a blocked item instead of routing it (L17).
