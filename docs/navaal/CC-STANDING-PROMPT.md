# CC STANDING PROMPT

Paste this whole file as the prompt for every Claude Code session on this repo.
It is deliberately the same every time. The state lives in `docs/navaal/`, not in the prompt.

---

You are working on **Navaal: AI SEO, AEO & GEO**, a published Shopify app.
Repo: `C:\Users\PC4\contentclaude`. Production: `app.navaal.ai` on Fly app `contentclaude`.
Listing: `apps.shopify.com/navaal-ai-seo-geo-content`.

**The goal, which never changes:** be the **#1 app in the Shopify App Store SEO category**, with
real paying merchants and real revenue. If a piece of work does not move a number on the
scoreboard in `docs/navaal/01-NORTH-STAR.md`, it is a distraction, however good an idea it is.

## 0 — ORIENT. Do this before anything else, every session.

Read, in this order, in full:
`docs/navaal/README.md` · `00-CONSTITUTION.md` · `01-NORTH-STAR.md` · `02-BACKLOG.md`
· `03-PROTOCOL.md` · `04-DECISIONS.md` · `05-EVIDENCE.md` · `06-HUMAN-QUEUE.md`
Then `PROGRESS.md` and `git log --oneline -20`.

Then reconcile: the backlog is authoritative for **WHAT**, never blindly for **STATUS**.
Check each item marked DONE against the code. Say in your report every status you corrected and
why. If you correct nothing, say that you checked and found nothing to correct.

Do not re-research anything in `05-EVIDENCE.md`. Do not reopen anything in `04-DECISIONS.md`
without new evidence — bring the evidence and stop.

## 1 — THE STANDING FIRST CHECK: is what we built actually live?

Run these two, every session, before picking work:

```
git status -sb                      # how far ahead of origin/main are we?
curl -s https://app.navaal.ai/api/build-info
```

If `shortSha` from build-info is not the tip of `origin/main`, or `main` is ahead of
`origin/main`, then **work is finished but not shipped, and no merchant has it.** As of
2026-09-10 that was true of ten commits — the entire Phase A defect fix. Say so at the top of
your report, in that case, before anything else.

**CORRECTED 2026-09-10 — this section previously said CI was "a gate, not a deploy". It is not.**
Verified in `.github/workflows/ci.yml`: the `deploy` job runs
`if: github.ref == 'refs/heads/main' && github.event_name == 'push'` (line 140) and calls
`flyctl deploy` (line 148). **A push to `main` IS a deploy.**

So shipping is ONE action, and there are TWO paths that both do it:
1. `git push origin main` — runs CI **and deploys** if CI passes, then runs the post-deploy smoke job.
2. The **Manual Deploy to Fly.io** workflow (`deploy.yml`, `workflow_dispatch`) — deploys the same
   thing again. Doing BOTH is the INFRA1 double-deploy that shipped one commit as v176 and v177,
   79 seconds apart, each opening its own outage window.

**Push, then stop and verify.** Do not also dispatch the manual workflow unless the push-triggered
deploy failed. Because a push deploys, **do not push mid-phase** — L11 says deploy at phase
boundaries, and a push is a deploy.

**Deploy is verified only by:** `/api/build-info` returning the new `shortSha`, and
`/api/health?deep=1` returning `status: ok` with `schema.ok: true` and the column count
unchanged or higher. A green CI run is not a deploy. A successful `fly deploy` is not a
verification. That is `A7.1`.

## 2 — PICK. One item at a time, in phase order.

Phases in `02-BACKLOG.md` are strictly ordered. **Never start a later phase while an earlier one
has an OPEN item.** Take the lowest-numbered OPEN item in the earliest open phase that is not
BLOCKED. PHASE INFRA runs alongside A — take an INFRA item when it unblocks the item you want.

If the item is blocked, say by what, mark it `BLOCKED by <id>`, and take the next one. If the
blocker is a human task, it goes in the human queue and you move on — you do not wait.

## 3 — DO. Under the constitution.

The whole constitution applies. These are the ones sessions keep breaking:

- **L1 — a green test is not evidence.** Verify a guard by *breaking* it: disable the thing it
  watches and show the test count that fails. Six false greens have shipped on this project
  already. Assume yours is the seventh until you have broken it.
- **L15 — a feature is not shipped until a merchant can reach it.** A column, a read path, a
  write path and a green suite prove the machinery works, not that anyone can get to the control.
  `includeDraftProducts` had all four and appeared on no screen. For anything a merchant touches,
  "done" needs three things: it exists and is wired · a merchant can **reach** it from somewhere
  they already are · it is **visible on a rendered page**, proved in a browser, not by grep.
- **L2 — the store-shape law.** Name the store shapes each fix must hold for and prove it against
  them: 10 products and 100,000 · all-draft and all-active · variant-heavy · wholesale ·
  multi-currency · non-English · one collection and 400.
- **The EBS store is a diagnostic instrument, not the customer.** Every fix is the general rule
  for every store on Shopify — small, medium, large, enterprise, wholesalers. If a fix only makes
  sense for one catalogue, it is the wrong fix.
- Small commits, tests with every change, and **never** modify a migration that already exists on
  `main`.

Hard limits, no exceptions:
- **Never write to the live EBS commercial catalogue.** No bulk optimize, no `productUpdate`, no
  `collectionUpdate`, no autopilot, no `publishWithoutReview`. Read-only against that store.
- **Never print a secret, connection string, API key or token** into output or a commit. Names only.
- Set Fly secrets with **`fly secrets import` from a file**, never `fly secrets set` — Windows
  `cmd.exe` strips `%xx` and silently corrupts the value.
- Never type the owner's credentials anywhere. If a task needs a login, it goes in the human queue.

## 4 — VERIFY. Against the running system, not against your own diff.

- Behaviour a merchant sees: prove it in a browser on a rendered page.
- A number: state the number, where you read it, and when.
- A performance claim: state the measurement and the tool. "~40 ms" with no measurement behind it
  is a defect (see `INFRA4`).
- A percentage: state the denominator next to it. 0% failure over 0 deliveries is not a pass.
- Anything captured before `d272222` (2026-09-10) is **deploy-contaminated** and is not a baseline.

## 5 — WRITE BACK. In the repo, before you finish.

- `02-BACKLOG.md` — item status, plus any new item you discovered (give it the next free ID in
  its section).
- `01-NORTH-STAR.md` §10 LOG — one line per material change.
- `06-HUMAN-QUEUE.md` — **append to INBOX as a plain bullet with NO ID.** Never assign or
  renumber an ID mid-session; another session may be editing the same file. Read that file's
  `HOW TO ADD` first. Give the exact click path or command, why it is needed, and what done looks
  like — the owner must be able to act on it in sixty seconds without asking you a question.
- `PROGRESS.md` — the detail.

Commit the write-back with the work.

## 6 — KEEP GOING.

Do not stop after one item. Loop steps 2→5 until one of these is true, then report and stop:

- the phase you are in has no unblocked OPEN item left,
- you need an owner decision that is not already settled in `04-DECISIONS.md`,
- you are about to do something irreversible or something the hard limits above forbid,
- or you have run out of context — in which case write back **first**, then say so.

Never invent work that is not in the backlog. If you think something belongs there, add it as an
item and say why; do not just build it.

## 7 — REPORT. In this shape.

1. **Is production current?** The build-info sha, the ahead-count, and whether anything is
   finished-but-unshipped. One line.
2. **What I corrected during orient.** Statuses that were wrong, and why.
3. **What I did.** Per item: the ID, the commit sha, and the evidence — including, for each
   guard, the count of tests that fail when you break it.
4. **What I could not do, and what blocks it.**
5. **What I found that nobody asked about.** (L14. This has been the most valuable section in
   every single session. Never omit it.)
6. **The next unblocked item**, by ID.

Report numbers first, interpretation second. If you could not read something, say
"could not read" — never report "no change" when what happened is "could not check".
