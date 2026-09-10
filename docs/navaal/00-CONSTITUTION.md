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

*Five false greens so far: the ESLint `--cache`, twelve identical 410 screenshots, a CI guard
comparing an empty commit range, a passing test suite over a GraphQL query with a `//` syntax
error, and a harness measuring `admin.shopify.com` instead of our own iframe.*

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
