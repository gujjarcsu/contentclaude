# CONSTITUTION — Navaal

Laws. Not guidance. They exist because each one was learned by being wrong.
If a law and an instruction conflict, the law wins and you say so in your report.

---

## L1 — THE FALSE-GREEN LAW
For every check, assertion, guard, sweep or harness you write or touch, ask:
**what would this print if the thing it watches were completely broken?**
If the answer is "the same thing", it is not a check.
State that answer explicitly, per check, in every report.

Better still, and now the standard: **verify a guard by breaking it.** Disable the thing it
watches and show the test count that fails. CC did this for the claim check (2 tests) and the
family skip (4 tests). That is the bar.

*Seven false-green shapes so far: the ESLint `--cache`, twelve identical 410 screenshots, a CI guard
comparing an empty commit range, a passing test suite over a GraphQL query with a `//` syntax
error, a harness measuring `admin.shopify.com` instead of our own iframe, and a setting with a column,
a read path and a green suite that no merchant could reach (L15), and a folder of
guiding documents that confidently described a workflow nobody had read to the end (L16).*

## L2 — THE STORE-SHAPE LAW
Name the store shapes every fix must hold for, and prove it against them.
"It works on the store we tested" is not done.
Shapes: catalogue size · status mix · channel publication · pre-existing content · variant
families · locale · plan · API health. See `05-EVIDENCE.md`.

*1,374 tests did not find 29 defects that one real catalogue surfaced in ninety minutes.*

## L3 — NEVER REPORT A MEASUREMENT YOU DID NOT TAKE
An unmeasured number in a commit message becomes folklore.
If you did not measure it, say "not measured".

## L4 — VERIFY FROM OUTSIDE, CACHE-BUSTED
A save confirmation is not evidence. A cached read is not evidence. A file manager showing the
right content is not evidence that the server serves it.
Check byte deltas: if you insert three characters, the file must grow by exactly three.

*A verified fix was overwritten by a stale cached read, caught only by a byte count.*

## L5 — HONESTY OUTRANKS CAPABILITY
The app may never say something that is not true, and never in our own favour.
- Two screens may not disagree about the same fact.
- A number shown to a merchant states its scope and its N.
- A cap is never presented as a total.
- A throttled or failed read is never rendered as a zero.
- We never claim authorship of the merchant's own work.
- We never claim a measurement from a source we did not read. Name the model and the method.

*At 0 reviews, one one-star review is existential. Every promise must hold on the worst day.*

## L6 — A GATE THAT BLOCKS HONEST WORK GETS SWITCHED OFF
Two severities, always. Hard-fail only what is indefensible (verbatim duplication, dropped
compliance or certification claims). Everything else warns: it saves, the merchant can publish
it, autopilot will not.

## L7 — NEVER WRITE TO A LIVE COMMERCIAL CATALOGUE
Shopify has no undo for a bulk product or collection edit, and Neon PITR covers our database,
not the merchant's Shopify data. If a task appears to require it, stop and say so.

## L8 — MIGRATIONS ARE IMMUTABLE
Never edit an applied migration. New file, new name, always.
*An `ALTER TABLE` appended to an applied migration caused an 8-hour production outage.*

## L9 — SECRETS
Never `fly secrets set` on Windows — `cmd.exe` strips `%xx` and silently corrupts the value.
Always `import` from a file, then delete the file. Never print a secret value, in output or in
an error — names only. This includes merchant-supplied AI keys.

## L10 — PURE MODULES STAY PURE
A shared rule inside a Prisma-importing `.server.js` file is not shareable. If UI needs a rule,
extract it to a client-safe module and have the server module re-export.
Corollary, learned the hard way: **an unused import of a `.server` module in a route breaks the
client build on its own.**
*This root cause has now produced five separate defects.*

## L11 — DEPLOY AT PHASE BOUNDARIES
Not per commit. *Ten deploys in two hours was itself the incident P1 investigated.*
After each deploy confirm `/api/health?deep=1` reports `status: ok` on the new SHA.

## L12 — POLARIS ONLY, AND NO DEV-STORE RESIDUE
No example in the UI may come from a store we do not serve. Derive it from the merchant's own
catalogue or make it obviously generic.
*A plumbing merchant was told to write "How to wax a snowboard for beginners".*

## L13 — THE APP IS NOT SHAPED AROUND ONE STORE
EBS is a diagnostic instrument, not the customer. Every fix is the general rule.
Small, medium, large, enterprise, wholesalers. Every store on Shopify.

## L14 — REPORT WHAT YOU FOUND THAT NOBODY ASKED ABOUT
That category has been the most valuable one in every single session. Never omit it.

## L15 — A FEATURE IS NOT SHIPPED UNTIL IT IS REACHABLE
A column, a read path, a write path and a green suite prove the machinery works.
They do not prove a merchant can get to it.

*`includeDraftProducts` had all four. It appeared in exactly two files plus the generated schema
list, and neither was a screen. No shop could include its drafts however it merchandises.*

**Source assertions are not a browser.** A control inside a collapsed section, behind a plan gate,
or on a route with no entry point passes every source-level test ever written for it.

So "done", for anything a merchant touches, requires all three:
1. the control exists and is wired,
2. a merchant can **reach** it from somewhere they already are,
3. it is **visible on a rendered page** — proved in a browser, not by grep.

*This is the sixth false-green shape, and the first that a perfect test suite guarantees you will
miss. Audit every existing setting for it, not only new ones.*

## L16 — A CLAIM ABOUT A FILE IS PROVED BY THE WHOLE FILE
Reading part of a file and inferring the rest is not reading it. Before you write down what a
file, workflow, config or schema *does* — especially into this folder, where it will steer other
sessions — read it end to end and quote the line number.

*Cowork read the first thirty lines of `ci.yml`, saw a comment saying in plain English that a push
to `main` IS a deploy, concluded the opposite, and wrote the opposite into the standing prompt.
The evidence was in its own tool output. Partial reads do not fail loudly; they fail confidently.*

Corollary: **grep tells you a string exists, never that a thing is true.** A grep hit is a pointer
to a file you now have to read.

## L17 — BLOCKED WORK IS ROUTED, NEVER PARKED
"I could not do this" is half a sentence. The other half is **who can, and exactly how.**
Every task you cannot finish goes into `06-QUEUE.md` with an owner (`CC` · `CW` · `COWORK` ·
`OWNER`) and a brief complete enough that its owner needs to ask you nothing.

Then you carry on. A session never stops because *one* item is blocked — only because *every*
item it owns is.

*Four browser tasks sat blocked on a single sign-in for a week because each session recorded the
blocker and stopped, instead of routing it to the one person who could clear it in a minute.*

## L18 — LEAVE THE SYSTEM SMARTER THAN YOU FOUND IT
A lesson that lives only in a session report is lost. If you were wrong, if a doc was wrong, if a
tool lied, or if you found a shape of failure we have not seen before: **write it into the file
that would have prevented it** — a law here, a fact in `05-EVIDENCE.md`, a technique in
`07-VERIFICATION.md` — and say in your report that you did.

The measure of a session is not only what shipped. It is whether the next session is better armed.

## L19 — WORK THAT IS NOT LIVE IS NOT DONE
A commit is not a deploy. A green CI run is not a deploy. A successful `fly deploy` is not a
verification. Done means a merchant can use it, proved by `/api/build-info` returning the sha and
`/api/health?deep=1` returning `status: ok`.

*Ten commits — the entire Phase A defect fix — sat unpushed on one machine while production served
the broken build. Every session report said "done". Every one of them was true about the code and
false about the product.*

Check it at the start of every session, before picking work. It takes one command.
