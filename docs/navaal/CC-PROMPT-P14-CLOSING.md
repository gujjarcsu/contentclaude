# CC — PHASE 14, THE CLOSING BRIEF

**Written 2026-09-16 by Cowork, from the actual picture, after the owner session and CW's §5 report.**
You have been idle since Phase 12. A great deal happened without you: the app's six locales are live
on the App Store in six languages, the owner ran the restore drill and the alert test, CW walked the
shape stores, and a safety gap was found in the lock you built. This brief is what closes
`11-MASTERPLAN.md` §6.5. **Nothing new is invented here. Every item is a defect, a gap between a
document and the code, or a read.** When these are done, Track A is maintenance.

## ORIENT (five minutes, do not skip)

Read `docs/navaal/06-QUEUE.md` from `## INBOX` down — it is long now, and it is the record of a day
you were not present for. Then `07-VERIFICATION.md`'s false-green list, which gained #19 to #23.
`git log --oneline origin/main..HEAD` is **53 commits**, all docs, tools and listing assets — `git
diff --name-only origin/main..HEAD` touching `app/`, `prisma/`, `extensions/` or the toml is
**empty**. Production serves `1e1867e`; `startedAt` moved to `2026-09-16T04:04:05Z` because the owner
imported a secret, which restarts the running image and deploys nothing. Confirm that yourself before
you believe it.

**A push to `main` IS a deploy (`ci.yml:140`).** Push once, at the end, with your code changes and
the 53 docs commits together — one deploy, not six.

## THE WORK, IN THIS ORDER

### 1. The lock is narrower than the doctrine. Close it at one choke point.

`assertWritable(shop)` is called in five places, all inside `app/utils/remediation.server.js`
(125, 148, 175, 206, 220). The four other paths that write a merchant's catalogue —
`app/routes/app.review.jsx`, `app/routes/app.products_.$id.jsx`, `app/utils/bulkProcessor.server.js`,
`app/utils/seo.server.js` — import neither `assertWritable` nor `isRemediationLocked` (grep count 0
on each). So `REMEDIATION_LOCKED_SHOPS` stops catalogue *fixes* and nothing else: a locked shop can
still be published to through Review, a product page, a bulk job or autopilot.

This is not academic. The owner has just locked **`r20bcm-2d.myshopify.com`** and
**`ebs-bathroom-and-plumbing-supplies-3.myshopify.com`** — one store, his own build, holding **a
client's real catalogue**, 1,518 archived products, with the app installed.

Put the guard at **the single place the app talks to Shopify** — the admin GraphQL mutation helper —
not at five call sites that become six. Refuse with the existing merchant-safe sentence
(`FIX_ERRORS.monitoredOnly`). Read paths stay open: a locked shop is still audited and scored.
**DONE MEANS:** a test that a locked shop is refused on each of the four surfaces plus remediation,
and a test that a locked shop's audit still runs. Then correct `CW-STANDING-PROMPT.md` §2, which
states the rule as an absolute it was not.

### 2. A1 — the last engineering gate. Three defects, all small, all presentation.

CW's count is four; the line needs ≤ 3. These three take it to one.

**FR13 — the `Review` button is wired wrong, and CW proved which half.** On Products, a
`Ready to review` row's `[Review]` opens `/app/products/<id>`, which renders `Generate Content` /
`Regenerate Content` and **no approve or publish control**. The same screen at `?product=<id>`
renders *"Showing one product — Opened from its row on Products"* **with** the approve controls. The
route is right; the link is wrong. Three sessions have now recorded this as "the button does
nothing"; it is not nothing, it is the wrong destination.

**FR8 — a row says `This product: 21/100` when 21 is the store's number.** The app already admits it
on screen: *"These 3 products all score 21: they are missing the same things, so each one's number is
the same as the store's."* So the computation is deliberate and the **label** is the defect — a row
that says "This product" must show that product's own number, or must not show a number. Seen twice
more since: on `navaal-qa-fresh` after a fresh reinstall (owner's screenshot,
`docs/history/screen-reads/qa-fresh-home-after-reinstall-2026-09-16.png`) and in H4's recording at
16 s. **This is the one defect that appears on a listing screenshot** — frame 01 is held on it.

**FR14 — `3 / 100 used` rendered as `3%`.** An integer percent hides real spend at the bottom of the
range. Show the fraction, or a percent with one decimal, or both — but never a rounded percent alone
as the primary number.

**DONE MEANS:** each fixed with a test that goes red on the old behaviour, deployed, and a line in
the queue telling CW to run the third confusion count. **You do not close A1 yourself** — CW counts,
you fix.

### 3. `scripts/test-seed-usage--writes-test-store-only.mjs` — stale, and it blocks two recordings.

It is the supported route to a Free store at its cap, and it refuses any shop outside
`/(contentpilot-dev|navaal-qa|navaal-test)/`, which is right and stays. Three defects: it reads
`plan.monthlyLimit`, renamed to `monthlyCredits` on the Prisma client by B2, so `limit` falls to the
`?? 25` default and it seeds 25 instead of 100; it **counts rows** where `plans.server.js` **sums
`credits`**; and it has no partial target, so it cannot produce the 80 % warning state that
`UpgradePrompt.jsx` surface (a) shows between 80 and 100. Add `SEED_TARGET=<credits>`, default the
cap. **DONE MEANS:** the owner can run `SEED_TARGET=85` then `SEED_TARGET=100` then
`SEED_ACTION=restore` and see the warning, the 100 % card, and a clean store — which is H5 and H6.

### 4. Two shops nobody can identify. Read-only. This may be the most valuable item here.

`zephyrin-wynter-a01g3uy4.myshopify.com` and `peter-shops-2.myshopify.com`. The owner does **not**
recognise either. Both are storefront-password-protected, so Cowork could learn nothing from outside.
They are therefore Shopify's reviewers or **merchants who found the listing and installed** — and if
either is a merchant, the scoreboard's *real merchants: 0* is wrong and B0.2 has its first data point.

Report, per shop, **without writing anything**: `installedAt`, `uninstalledAt`, plan, whether an
access token is present, product count, any generated or published content, credits used, last admin
activity, and how `installedAt` sits against the app-review window. Then say what you think each is
**and how confident you are**. Do not set `ShopKind` on a guess — that is the exact failure the field
exists to prevent, and it is why CW left them unclassified rather than flattering the digest.

### 5. The capture harness emits the wrong size, twice over.

`listing-assets/README.md` says a 3200×1800 PNG "is what Shopify wants" and CW's fix at `81fa07a`
made `tools/proof/listing-assets.mjs` emit exactly that. **The editor rejects it**: *"Desktop
screenshots must be 1600px by 900px"*, in its own words, when the owner uploaded by hand. The three
frames now live were downscaled by Cowork into `listing-assets/1600x900/`. Make the harness emit
**exactly 1600×900**, keep the fifth hurdle that reads the PNG header, fix the README — and **read
the mobile requirement off the editor's own error rather than the README**, because 750×1624 is
unverified in exactly the way 3200×1800 was.

### 6. The shop-kind workflow cannot run in its own documented mode.

Its input says "empty to list only"; empty fails its own guard in 12 s, twice, because
`printf '%s' ""` gives `grep` no line to match. One-line fix, plus the case in a test.

### 7. Hygiene, carried from Phase 12 and still open.

The app's **client secret from 4 June has never been revoked** — two live secrets, three months
apart. Confirm which one Fly holds (by name, never by value), tell the owner which to revoke in the
Partner Dashboard, and add a test that the app boots with exactly one. Separately, **correct
`11-MASTERPLAN.md` P3.4 and backlog F9**: there is no Shopify "Level 2" request form for
`read_reports`; it is an ordinary scope, so the decision is the scope policy, not a form.
Finally, **delete the Neon drill branch** `restore-drill-2026-09-16T0127Z` once you have compared it
against production and recorded the comparison — a drill that leaves litter is half a drill.

## WHAT NOT TO DO

No new features. Credit packs are named in A8 but do not exist in code; leave them absent rather than
building them to satisfy a sentence — or delete the clause. Do not touch `askebs.myshopify.com` or
either EBS domain. Do not classify a shop you cannot identify. Do not mark A1 or §6.5 CLOSED; A1 is
CW's count and §6.5 closes when its own lines do.

## THE REPORT

One message: each item DONE with its proof, or OPEN with the blocker; the one deploy's sha and the
Fly release; what you changed in the masterplan and the queue; your read on the two shops with a
confidence; and the single sentence you would use to describe what is now left before this app is
maintenance rather than construction.
