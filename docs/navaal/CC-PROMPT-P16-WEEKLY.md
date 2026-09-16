# CC — Phase 16. A job that has never run, and a health check that did not notice.

## ORIENT (read before you touch anything)

- `docs/navaal/06-QUEUE.md` — the INBOX top three rows are today's.
- `docs/navaal/07-VERIFICATION.md` — the false-green register. You will add to it.
- `docs/navaal/11-MASTERPLAN.md` §6.5 — the Engineering Done gate.

Production is `app.navaal.ai`, Fly app `contentclaude`. **A push to `main` IS a
deploy** (`ci.yml:140`). The git index is shared with two other workers: use
`git add -N` for new files and `git commit -o <paths>`, never `git add -A`.
Commit as `-c user.name="Waqas Ahmad" -c user.email="gujjarcsu@gmail.com"`.
Never edit an applied migration. Never write to `askebs.myshopify.com`.
Never print a secret — names only.

**There is an active production outage on a different axis (a client-secret
mismatch answering 401 on every embedded load). It is the owner's to fix and
it is not yours. Do not touch `SHOPIFY_API_SECRET`, do not run `fly secrets`,
do not redeploy to "clear" it.** Land your work on `main` normally; the deploy
that carries it is fine.

---

## 1. The defect. `catalogues.server.js` cannot be loaded by Node.

Read from `fly logs -a contentclaude`, 2026-09-16, machine `d8d996d7b1ed28`,
**once every 60 seconds, for as long as the log goes back**:

```
TypeError [ERR_IMPORT_ATTRIBUTE_MISSING]:
  Module "file:///app/app/i18n/locales/de.json" needs an import attribute of "type: json"
    at validateAttributes (node:internal/modules/esm/assert:88:15)
    at defaultLoad (node:internal/modules/esm/load:108:3)
    at load (file:///app/node_modules/import-in-the-middle/create-hook.mjs:615:12)
  msg: "weekly report threw"
```

`app/utils/scheduler.server.js:401` does `import("./weeklyReport.server.js")`
on a 60-second timer. That chain reaches `app/i18n/catalogues.server.js`, whose
lines 14–25 are twelve bare JSON imports (`import de from "./locales/de.json"`
and the six Polaris ones). Vite rewrites those at build time for the app
bundle. The path in the error is `file:///app/app/i18n/locales/de.json` —
**raw source, loaded by Node's own ESM loader**, where a JSON import without
`with { type: "json" }` is a hard error. So the module never loads and
`maybeSendWeeklyReports()` never runs.

**The weekly report has therefore never run in production.** P3.6 is not
shipped; it is a caught exception on a timer.

Scope it before you fix it. In the same log, from the same timer, these do
**not** throw: `catalogue watch threw`, `crawl holdout threw`, `funnel digest
threw`. So the fault is on `weeklyReport.server.js`'s import chain only. Find
out why that chain reaches the unbundled source when the other three do not —
the answer decides whether this is one file's bug or a build-shape bug that
will come back. Say which it is in your report, with the evidence.

### What to do

1. Add `with { type: "json" }` to every JSON import in
   `app/i18n/catalogues.server.js`, and to the dynamic ones in
   `app/i18n/chunks.js:13–18`, **or** read them with `fs.readFileSync` +
   `JSON.parse` if the attribute breaks the Vite client build. Whichever you
   pick, the browser chunking behaviour in `chunks.js` must not regress —
   Vite must still emit one chunk per locale and the shared bundle must still
   carry no catalogue. Prove that from the build output, not from reasoning.
2. Add a test that fails on the *current* code. Not a unit test of the
   catalogue — a test that loads `weeklyReport.server.js` **through Node's
   loader the way the scheduler does** and asserts it resolves. A test that
   goes through Vite will pass today and prove nothing.
3. Ship it.

### The proof

Not a green build, not a sha. After the deploy, a clean window of
`fly logs -a contentclaude --no-tail` covering **at least three minutes** with
**zero** `weekly report threw`. Paste the count and the window. Then confirm
the job actually ran or correctly declined (`weekly_report_run` with its
counts, or the day-claim declining because it is not Monday) — a silent log is
consistent with the module loading and also with a new way of failing quietly.

---

## 2. The reason nobody saw it for weeks. Fix that too.

`/api/health?deep=1` reports `worker running` and `jobs.failedLast10Min: 0`
while this throws sixty times an hour. The scheduler catches every job's
rejection and logs it (`scheduler.server.js:390–407`), so a job that is
100% dead is indistinguishable, to the health check, from a job that is idle.
`api.health` line 111 counts `recentFailed` and `stuckProcessing` from the
job table — a scheduler tick that dies before it reaches the job table is
counted nowhere.

Make a job that throws on every tick visible. The shape is yours to choose;
what it must satisfy: after your fix, if any one of the four scheduled imports
throws on N consecutive ticks, `?deep=1` stops saying the worker is fine. Keep
the endpoint cheap — UptimeRobot hits it every five minutes and the deep call
already costs ~370 ms on a cold read.

Then add this to `07-VERIFICATION.md` as a numbered false green, in the
register's own voice: **"`worker running` and `failedLast10Min: 0` meant only
that nothing had reached the job table. A scheduled job that throws before it
gets there was invisible, and one had been throwing every minute since the
i18n work landed."**

---

## 3. The two plan-integrity defects, carried.

Both were named in the queue and neither is closed. Confirm each against the
current code before you touch it — if one is already fixed, say so with the
commit that did it and move on.

- The **Free** plan's first screen offers a primary button that only a Starter
  subscriber can act on.
- The blog feature is presented as free and unpriced in one surface and as
  Growth / 3 credits in `plans.server.js`. One of the two is wrong. Decide
  which by what the code actually charges, then make the other match it —
  and if the code charges for something the listing implies is free, the code
  is the thing that is right and the copy changes, not the price.

---

## 4. Report

Plain prose, no headings-as-status. For each of 1, 2 and 3: what you found,
what you changed, the commit, and **the evidence that it works in production**
— log windows and counts, not build results. Where you could not prove
something, say so and say what would prove it. If you disagree with anything
above, say that first and say why; a brief is a starting position, not an
instruction to be obeyed past the point where it is wrong.
