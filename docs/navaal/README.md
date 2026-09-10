# docs/navaal — the guiding folder

This folder is the project's memory. It exists so that a fresh session, with no context, can be
as effective as one that has been running for hours — and so that nobody re-learns a lesson we
have already paid for.

**The goal, in one line:** be the **#1 app in the Shopify App Store SEO category**, with real
paying merchants and real revenue. Every file here exists to stop us drifting off that.

---

## READ IN TIERS — this is the efficiency rule

Reading everything every session is waste. Read the CORE every time. Read a REFERENCE file only
when the protocol says its trigger has fired.

### CORE — read in full, every session, before anything else

| File | What it is |
|---|---|
| `00-CONSTITUTION.md` | **Laws.** Each was learned by being wrong. A law beats an instruction. |
| `09-DOCTRINE.md` | **What we sell and what we refuse to say**, with the evidence for each. Outranks enthusiasm. |
| `11-MASTERPLAN.md` | **The plan.** Phases, gates, owners, the pre-mortem, and the stop conditions. |
| `01-NORTH-STAR.md` | The goal, the ladder, the scoreboard, the running log |
| `02-BACKLOG.md` | **What is left**, as items with status. Sits *under* the masterplan's phases. |
| `03-PROTOCOL.md` | How a session runs, and how work is routed when you cannot do it |

### REFERENCE — read when its trigger fires, not by default

| File | Read it before... |
|---|---|
| `04-DECISIONS.md` | ...any decision about pricing, plans, positioning or scope |
| `05-EVIDENCE.md` | ...researching anything. Store shapes, the EBS baseline, contaminated measurements. **§1–§2 superseded by `10-MARKET.md`.** |
| `10-MARKET.md` | ...any claim about competitors, pricing, the platform or what can be measured. Verified 2026-09-10 from live sources. |
| `07-VERIFICATION.md` | ...claiming anything is verified. It names the proof each claim class requires. |
| `08-ECONOMICS.md` | ...anything touching cost, quota, model spend, plan limits or margin |

### WRITE TARGETS — you write these; other people and sessions read them

| File | What it carries |
|---|---|
| `06-QUEUE.md` | Every task this session could not do, routed to whoever can |
| `CW-BRIEF.md` | **Generated.** One paste-ready prompt containing every pending CW task |
| `OWNER-CHECKLIST.md` | **Generated.** Every pending task that needs a human, each doable in minutes |
| `PROGRESS.md` (repo root) | The detail of what happened |

`CC-STANDING-PROMPT.md` is the prompt the owner pastes to start a session. It points here.

---

## WHO DOES WHAT — the routing table

Four workers touch this project. Knowing which one owns a task is what stops work parking.

| Owner | Who | Can do | Cannot do |
|---|---|---|---|
| **CC** | Claude Code, in this repo, on the owner's machine | Code, tests, migrations, CI, deploys, local scripts, reading and writing every file here | Log into anything · read the Partner or Search Console dashboards · record a video · spend money · install the app on a new store |
| **CW** | Cowork, with the owner's browser and computer | Anything in a signed-in browser: dashboards, the App Store listing, Search Console, Hostinger, uptime tooling · file work on the machine · verifying a rendered page in a real browser | Anything requiring the owner's password to be typed · approving a charge · being a human on a call |
| **COWORK** | This planning session | Research and verify from outside · competitor and market reading · write listing copy, briefs, docs · edit navaal.ai · check production endpoints · hold the strategy | Write code in this repo (that is CC's) |
| **OWNER** | Waqas | Log in, approve, pay, record, decide | — |

**The routing law:** a task you cannot do is **routed, never parked.** It goes into `06-QUEUE.md`
with an owner and a complete brief, and the session carries on with the next thing it *can* do.

---

## THE ORDER OF AUTHORITY

When two files disagree, the higher one wins, and you say so in your report.

1. **`00-CONSTITUTION.md`** — the laws. Learned by being wrong.
2. **`09-DOCTRINE.md`** — what is true about the market and therefore what we sell and never claim.
3. **`11-MASTERPLAN.md`** — the plan, its phases and its gates.
4. **`02-BACKLOG.md`** — the items, with status.
5. Everything else.

*`04-DECISIONS.md` is partly superseded as of 2026-09-10 and is being reconciled (P0.11). Treat it
as history until that closes.*

## THE FOUR RULES OF THIS FOLDER

1. **`02-BACKLOG.md` is authoritative for WHAT, never blindly for STATUS.** Reconcile it against
   the code every session and report what you corrected.
2. **Anything in `05-EVIDENCE.md` is not re-researched.** If it looks stale, re-read the primary
   source and update the file — do not quietly assume.
3. **Anything in `04-DECISIONS.md` is not reopened without new evidence.** Bring the evidence and
   stop; do not just act.
4. **If a file here is wrong, fixing it is the highest-value work available.** These files steer
   every session. A falsehood in them multiplies. Correct it, record the correction with the
   evidence, and say so at the top of your report — do not quietly edit.

*Rule 4 is not hypothetical. On 2026-09-10 this folder told sessions that a push to `main` was
not a deploy. `ci.yml:140` deploys on every push. Following the folder would have reproduced the
exact double-deploy incident the folder was written to prevent.*
