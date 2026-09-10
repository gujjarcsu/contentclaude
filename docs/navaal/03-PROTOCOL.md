# SESSION PROTOCOL

The owner runs one standing prompt. You self-direct. This is how a session runs.

---

## STEP 1 — ORIENT (always, every session, no exceptions)
Read in this order:
1. `docs/navaal/00-CONSTITUTION.md` — the laws
2. `docs/navaal/01-NORTH-STAR.md` — the goal and the scoreboard
3. `docs/navaal/02-BACKLOG.md` — what is left
4. `docs/navaal/04-DECISIONS.md` — what is settled; do not re-litigate
5. `docs/navaal/05-EVIDENCE.md` — verified facts; do not re-research

Then **reconcile status**: `02-BACKLOG.md` is authoritative for WHAT, not for status.
Check the code and `PROGRESS.md`, correct any item whose status is wrong, and say what you
corrected. The backlog self-heals; it is never trusted blindly.

## STEP 2 — PICK
Take the **lowest-numbered unblocked OPEN item in the earliest unfinished phase.**
Never start a later phase while an earlier one has open items.
Take more than one item only if they share a root cause. Say why.
If everything in the current phase is blocked, say what blocks it and move to the next phase's
first item — but say that you did.

## STEP 3 — DO
Under the constitution. Small commits. Tests with every change.

## STEP 4 — VERIFY
- The false-green answer for every check you touched (L1).
- Break at least one guard and report the test count that fails.
- The store shapes proved, and the ones not proved (L2).
- Real numbers, or "not measured" (L3).
- From outside, cache-busted, byte deltas checked (L4).

## STEP 5 — WRITE BACK
Before finishing, update in the repo:
- `02-BACKLOG.md` — item status, and any new item you discovered
- `01-NORTH-STAR.md` §10 LOG — one line per material change
- `06-HUMAN-QUEUE.md` — anything only a human can do, with the exact click path or command.
  **Append to INBOX with no ID.** Never assign or renumber an ID mid-session; another session
  may be editing the same file. Read that file's HOW TO ADD before touching it.
- `PROGRESS.md` — the detail, as now

## STEP 6 — REPORT AND STOP
Report: what you changed · what you measured · which store shapes you proved · what you could
not do and why · **what you found that nobody asked about**.
Then **stop**. Do not start the next item. Do not deploy unless a phase just closed.

---

## THE THREE THINGS THAT WASTE A SESSION
1. Re-researching something in `05-EVIDENCE.md`.
2. Re-opening a decision in `04-DECISIONS.md`.
3. Starting a later phase while an earlier one is open.

## WHEN TO STOP AND ASK
- A law would have to be broken.
- A locked decision looks wrong **and you have new evidence** — bring the evidence, do not just act.
- The work requires writing to a live commercial catalogue.
- A phase-D feature needs its shape agreed first (see `02-BACKLOG.md` D0).
