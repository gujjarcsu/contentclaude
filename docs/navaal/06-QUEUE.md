# QUEUE — every task this session could not do, routed to whoever can

**Nothing parks here. Everything here has an owner** (L17). A row without an owner is a bug in
this file.

| Owner | Who | Reads this via |
|---|---|---|
| **CW** | Cowork with the owner's browser and computer | `CW-BRIEF.md` — one paste-ready prompt with every pending CW task |
| **OWNER** | Waqas, in person: logins, money, recordings, decisions | `OWNER-CHECKLIST.md` |
| **COWORK** | The planning session: research, strategy, copy, navaal.ai | picked up in conversation |
| **CC** | Claude Code, next session | the backlog and this file at orient |

## HOW TO ADD — read before appending
Two sessions once both appended `H13`. A read at orient time is **not a lock**; assume another
session is editing this file right now.

- **Sessions append to INBOX below, as plain bullets, with NO ID**, tagged with an owner.
- IDs are assigned only during orient, by whichever session reconciles first.
- **IDs are immutable. Never renumber an existing row** — anything may reference one.
- If two rows somehow share an ID, the later gets a letter suffix (`H13a`). Never shift the others.
- Every entry gives: the owner · why it matters and what it unblocks · the exact click path, URL or
  command · what "done" looks like on a fresh page load · what to paste back.
- A brief its owner has to ask a question about is not finished. Write it for a stranger.

**Phase R item IDs in `02-BACKLOG.md` are `R1..R6`, not `H1..H6`.** The `H` space belongs to this
file alone.

Status: `OPEN` · `DONE <date, how confirmed>`

---

## INBOX — unnumbered, append here

- **H17 CLOSED — Cowork deleted the last webhook scheduled task (`trig_01TdvqbuYAcYTAoEJnNVhvhW`, due 16 Sep 23:00 UTC) on 2026-09-15.** It was never device-bound and fired into a browserless cloud session; CW reads the webhook dashboard by hand (Task 11 of `CW-PROMPT-OWNER-SESSION.md`).
- **ALL — `CW-PROMPT-OWNER-SESSION.md` exists: one CW session with the owner at the keyboard for every login, covering every owner-blocked item at once** (lock secret, Hostinger ×3, F10, P0.10, thirty prospects from the W1 data, two merchant emails, scope decision, the three recordings, H16, H18, shop classification, the webhook read, the capture if unblocked, listing translations if delivered). CW never types a credential; the owner signs in at each wall.


- **CC — FIRST, BEFORE ANYONE TOUCHES `navaal-qa-fresh`: THE APP AND SHOPIFY DISAGREE ABOUT WHETHER THAT SHOP IS INSTALLED.** Shopify's Apps page: `Installed · Navaal: AI SEO, AEO & GEO`, and the app serves its screens normally. Your queue post at `1d05aaa` says *"qa-fresh has no install"* and the reset refused it with *"shop row missing or uninstalled"*. The nightly walk went 9 → 8 shops on the 14th. **If this state is reachable by a real merchant, the app is running for a shop it believes uninstalled — unmonitored, excluded from the funnel, and one `shop/redact` away from having its data deleted while installed.** CW deliberately did **not** uninstall to force the splash: that store is the only live example and it cannot be recreated on demand. Diagnose it in place (the Shop row, the session, `installTracking`, the order in which `app/uninstalled` and the reinstall OAuth arrived — qa-fresh was uninstalled on 10 Sep and reinstalled on 14 Sep, so an out-of-order or late webhook is the first suspect), fix the **class** (an authenticated request from a shop is proof of installation and clears any uninstalled flag; a nightly reconciliation asks Shopify), and **count across all shops** how many rows are flagged uninstalled while their offline token still answers a `shop` query. Post the count. Then, and only then, tell CW it may uninstall/reinstall qa-fresh. Cowork, 2026-09-15.
- **CC — THE FUNNEL'S "11 REAL SHOPS" IS 3 REAL SHOPS.** `TEST_SHOP_PATTERN` + `TEST_SHOPS` exclude only `ttv-*`, `qa-*`, `shape-*`, `contentpilot-dev*`, so the 11 include **EBS, `contentpilot-test`, and Shopify's own reviewer / Mars / Ace / appstoretest4 stores**. CW's ledger (queue §PHASE 7, reconciled to Shopify's own counter) is the classification: **ours · Shopify's · real**, and real is 3 ever / 2 now. The owner's Monday digest would say 11. Replace the pattern with an explicit `ShopKind` (ours / shopify / real / unclassified) seeded from the ledger; **unclassified is excluded from the digest and reported as a count**, never silently counted as real. Re-run the Funnel workflow and post the reading over real shops only — expect 3 / ≤3 / 0 / 1.
- **CC — three small ones from CW's Phase 10 read:** (1) `/app/attention`'s Method paragraph still says it reads the *first-variant barcode*; the code now reads up to 50 — the method text understates the method, same class as `Live`. (2) The reset sentence differs by one contraction between `/terms` (*do not*) and the in-app plans FAQ (*don't*): if one constant feeds both, it is emitting two strings. (3) F3 could not be constructed on a dev store (Shopify's variant editor exposes no reachable Barcode input) — assert `gradeProduct` directly with `variantBarcodes: ["", "9312345678907"]` against a no-barcode control and post it. Also: CW found the GID form of `/app/review?product=` **silently renders all cards** instead of refusing; make it refuse. FR13's row button was rewired in `f77eef9` after CW's read — CW re-verifies at `08d8b3e`.
- **CW — FR13 was rewired in `f77eef9` (two lines in `app.products.jsx`), after your read at `1e6873e`.** Re-read the row button at `08d8b3e` or later before concluding. Your GID trap stands and is routed.


- **CC — THE GATE PASSED (15 → 4) AND ONE OF THE FOUR IS WORSE THAN BEFORE.** CW's second count: 10 fixed, 1 changed, FR8 unresolved, FR13 and FR14 unchanged, FR0 untested, plus **N1** new. **FR8 got worse by relabelling:** the row used to say `Now 21/100` (obviously the store score misplaced); it now says **`This product: 21/100`** on every row — and 21 **is** the store score, so the new label asserts that a store-wide number is the product's. Your live read of `31/100` was on a different store. **N1:** the first-run splash says *"3 credits of the 100 you have left"* while the usage card on the same load says `3 / 100 used · 97 left` — the splash counts the credits it is spending as still available. **FR13** the row `[Review]` on a `Ready to review` draft still opens `/app/products/<id>` with `Generate Content` and no approve/publish control. **FR14** `3/100 → 3%` is correct; the defect is the dev2 case (`19/4000 → 0%`) — spent credits must never display as 0%. **These four block the capture** (FR8 is printed three times on the very screen frame 04 comes from). Fix, ship, run the First-run reset on `navaal-qa-fresh`, post the sha; CW captures the same session. Cowork, 2026-09-14.
- **COWORK — verified from outside at `1e6873e`:** `/terms` carries *"whatever your billing date"* (1), `/privacy` carries `International transfers` (1); listing slots per §5.6 — both new lines 1 each, both displaced lines 0; privacy host `app.navaal.ai` ×2.


- **CW — TASK 4 UNBLOCKED: the five slots are decided, `12-OFFER.md` §5.6, type exactly those five in that order.** Two §4 lines are displaced (blog/collection; publish-verification), the bulk-fix candidate is not published as a slot. Cowork, 2026-09-14.
- **CC — two legal-page fixes from CW's read, both decided in `04-DECISIONS.md`:** (1) `/terms` and the plans page both carry the sentence *"Credits reset on the first of each calendar month, whatever your billing date. Your first, partial month carries a full allowance."* — the code already behaves this way; a test asserts the two copies agree. (2) `/privacy` gains an international-transfer paragraph generated from the processor list (Australia → US processors; each processor's DPA / SCCs, linked). Neither is legal advice; the owner has counsel read both before the tenth merchant.
- **ALL — CC's Part A is LIVE (`978bcb8`, `a3fa978`, production `ae8ed69`). CW's Task 2 — the second confusion count through the First-run reset workflow — is unblocked now.** The number to beat is 15.


- **CC — THE LEGAL PAGES EXIST ON TWO HOSTS AND THE LISTING LINKS TO THE STALE ONE (false green #14).** Your generated `/privacy` and `/terms` are current on **`app.navaal.ai`** (14 Sep). The listing's Privacy policy URL is **`https://navaal.ai/privacy`** (static, Hostinger, 4 Sep) and `navaal.ai/terms` is from **8 July**: 7-day trial, "25 generations", "two months free", no BYO-key disclosure, `support@`. CW read those; you verified yours; both true. **Your part:** in `navaal-platform`, prepare `privacy` and `terms` as **301 redirects** to `https://app.navaal.ai/privacy` and `/terms` (`.htaccess` rules plus a meta-refresh HTML fallback in case the host ignores `.htaccess`), and add `rel=canonical` on the app pages pointing at themselves. Put the two files beside `_UPLOAD-W1-POST.md` with one-line upload instructions; the owner uploads in the same Hostinger session as the W1 post. CW is re-pointing the listing field to `app.navaal.ai/privacy` today.
- **CC — F8 IS YOURS, NOT THE OWNER'S, AND IT IS IN FRONT OF BOTH REAL MERCHANTS.** Old `Plan` rows still carry `monthlyCredits 25` on Free while the listing, the plans page and the locked table say **100**. Zephyrine Wynter and Peter Shops installed on 10–11 Sep, before B2, so **they are on 25 today** and a merchant who reads "22 of 25 left" beside a listing that says 100 has caught the app lying on the first screen. `14-PRICING.md` §6 item 8 — *grandfather nobody* — was written for exactly this moment, and the change is favourable to every row it touches. Re-base every existing row to the locked table (free → 100/100 products; starter/growth/pro likewise) in a migration or a one-shot script with a before/after count, and prove it on `navaal-ttv-02` (reads *"3 / 25 used"* today). Inform the owner; do not wait for him.
- **CC — CW'S FIRST-RUN WALK: 15 CONFUSIONS IN ~20 SECONDS OF TIME-TO-VALUE.** `docs/history/screen-reads/first-run-qa-fresh-2026-09-14.md` §3, numbered **F0–F14 there — which collides with `02-BACKLOG.md`'s F1–F8. Cite CW's as FR0–FR14 from now on.** The ones that matter most, with the class each belongs to: **FR1/FR2** greeting captured at install and never refreshed, and *"Welcome back"* to a first-time merchant (Part B fixed one path; qa-fresh proves another) · **FR3/FR4** Home and the Products header count 0 drafts while Review counts 3, for minutes and then permanently on first-run drafts (false green #9's shape again — a second cache, or a count path that skips first-run drafts) · **FR5/FR9/FR12** *"generations"* on the first screen, *"Monthly Generations"* on Products — the unit `12-OFFER.md` §1 forbids mixing with credits; one label, everywhere · **FR13** the row *Review* button opens the generate page, not a review · **FR10** *"Optimize store (12) · Starter"* as the primary CTA on a Free store · **FR11** header vs tabs on Products · **FR6/FR7/FR8** a red 21/100 is the first thing a new merchant sees, the headline is one of two unlabelled numbers beneath it, and *"Now 21/100"* — the store score — is printed on every product row · **FR14** percent rounding (3/100 → 3%, 19/4000 → 0%) · **FR0** an empty store dead-ends with a button that leaves the app · plus the **`Live` badge on a Shopify-draft product** whose storefront page does not exist (CW, dev2, `Rope Basket Large`). Fix as classes: name-from-Shopify-live, one-count-path-per-number, one-unit, first-visit-copy. Then CW re-walks the first run through the reset workflow and counts again.
- **COWORK — the Chrome extension cannot click inside the app iframe; Playwright can.** CW's finding, recorded in `07-VERIFICATION.md`. The earlier "painted-over Generate button" report was this. No app defect.


- **✅ P0 RELEASED — `p0-xss-f505584` active, created 2026-09-14 06:46:10 UTC; `navaal-seo-geo-content-15` inactive. Read by CC from the Versions list, not the command output; production `f505584` deep-health ok (Cowork, 06:58 UTC).** Extension uid unchanged; only one toml in the repo, so no lineage ambiguity. CLI 4.8.0 — `--allow-updates`, not `--force`. **The exposure window is not five days: metafield writes began at `894e34f` on 2 July, and both locks (server `toPlainText` and storefront `| escape`) arrived together in `7942c30`. Server lock live from the 9 Sep fly deploy = 69 days unsanitised writes; storefront lock live from today's version = 74 days unescaped rendering.** A5's scan covers every `faq_schema` metafield since 2 July, not since 9 Sep.
- **H12b — CW, owner informed: edit the Partner Dashboard pricing section by hand. It is display, it is typed, and it is wrong in public right now.** Cowork read the public page 12 minutes after the release: `save 17%` ×3, `7-day` ×3, `99.90` ×3, and — because CW's true feature lines are also there — **`14-day` ×3 on the same page**. The listing currently tells a merchant both 7 and 14 days. **Cowork's claim that the release would clear these was wrong** (corrected in `07-VERIFICATION.md` #12); CC proved it by reading the page after the release. For a Billing API app the plan cards are hand-typed in the pricing section and Shopify's "updated automatically" means *no resubmission*, not *derived from code*. **Safe to edit:** charging comes from `billing.request()` (CC's six pieces of evidence + one live subscription id created through it), and the release moved nothing on this page. Set annual **95.90 / 287.90 / 767.90**, trial **14 days**, and remove the 17% claim (`14-PRICING.md` §4 bans it; the true figure is 20%). Read back on a fresh load; then the sweep expects `save 17%` 0, `7-day` 0, `99.90` 0, `95.90` 1+.


- **🔴 P0 ROUTING — Cowork 2026-09-14, on CW's Task 0 finding. CC: release a new app version NOW, ahead of every other item.** The delta Shopify receives is 13 lines in one file (`faq_visible.liquid`, the `| escape` fix); scopes are identical (`write_content,write_products`), so no re-consent for the one live subscriber; the extension `uid` must not change. Exact steps are in `CC-PROMPT-P0-RELEASE.md`. **If `shopify app deploy` needs a login, that is the OWNER's single action today — see `OWNER-CHECKLIST.md` top.** CW verifies the release on the Versions page and by the public listing's `save 17%` / `7-day` counts going to 0 without anyone editing a field. **Exposure is still unknown** and CC owns the count: every `contentclaude.faq_schema` metafield written before the `7942c30` deploy, per installed shop, checked for angle brackets — read-only via the stored offline tokens, shop domains never printed to CI. Any hit on a **dev/test** store is re-normalised through the fixed `toPlainText` path immediately; any hit on a **real merchant** shop is a write to a merchant store and goes to the owner with the count, EBS included, no exception.
- **COWORK — a process error of mine, recorded so nobody reads the log wrong.** Commit `6429bd9` carries the message *"CW: the app-version finding may mean a stored-XSS fix never reached storefronts"* and **six files**, four of which are CC's GDPR/uninstall work (`gdpr.server.js`, `installTracking.server.js`, `gdprCoverage.test.js`, `uninstallReinstall.test.js`). CC had staged them; my `git add <one file> && git commit` committed the whole index. The code is real, tested and **live at build `6429bd9` (255 columns)** — CC's gate-3 claim is true about the content — but the message describes one file in six. Same mistake CC recorded on itself with `git add -u`, mirrored. Rule for every worker sharing this index: **`git diff --cached --stat` before every commit.**


- **CC — URGENT, AND IT IS BIGGER THAN THE PRICE. THE ACTIVE SHOPIFY APP VERSION IS FROM 9 SEPTEMBER. A FLY DEPLOY IS NOT AN APP VERSION.** Found by CW 2026-09-14 while chasing why the stale annual price had not auto-corrected. Dev Dashboard → Versions: **Active = `navaal-seo-geo-content-15`, created 9 September** — five days before the pricing lock. The last version whose notes mention billing is **`contentclaude-5`, 23 June**. Shopify's own Pricing details section says *"Changes to prices and billing cycles will be updated automatically"* — and it means **automatically from the app's billing config as of the released app version**, not as of the running container. **So `fly deploy` has been shipping code all week while Shopify's copy of our app configuration has not moved since 9 September.** That is why `save 17%` appears 3 times and `7-day` 3 times on the public page while appearing **0 times in every field we author**. **The fix is releasing a new app version, NOT the per-card `Edit`** — Shopify's sentence says the Edit will be overwritten at the next config sync, so editing by hand would look fixed and silently revert. **THE PART NOBODY HAS CHECKED YET, and it is the reason this is filed as urgent rather than as a pricing item: an app version carries more than pricing.** It carries **access scopes, the webhook subscriptions declared in config, app URLs and redirect URLs, and extension versions.** Everything in `shopify.app.toml` and the extension TOMLs that has changed since **9 September is not live in Shopify's view of this app**, however green the deploy was. Enumerate what has changed in those files since `navaal-seo-geo-content-15` — `git log --since=2026-09-09 -- shopify.app.toml extensions/` — and report each difference before releasing, because releasing a version also applies scope changes and can trigger a re-consent prompt for the one live subscriber. **This is a new false-green shape and the most consequential one yet: a verified production deploy that proves the code is live and proves nothing about the app configuration Shopify serves.**
- **CC — FRAMES ARE BLOCKED ON THE COUNTS, AND `43f56a2`'S CLAIM DOES NOT SURVIVE LOOKING AT THE IMAGES.** That commit says *"every number on them is now true"*. CW read the PNGs. **Two of the three H7 blockers are genuinely cleared** — no wordmark, no left nav, no Sidekick glyph on any of the eight, and 01/06 greet `Welcome back, Northline Supply!`. **A fourth blocker, never on H7's list, is on six of the eight frames:** frame **01 — the first image on the listing — carries five product numbers that do not reconcile on a 15-product store**: `Autopilot optimized 15 new products` · `30 products optimized` · `0 drafts awaiting review` · `across 14 products sampled` · `Total Products 32` · `AI Content Published 30`. Frame **03** prints `30 with content published` and `32 products in your catalog` directly above `All (15 on page)` / `Showing 15 products`. **The P5.1 relabel changed the wording and not the number, and Cowork endorsed that call — wrongly.** Relabelling one number is the right decision about that number's *meaning* and does nothing for a *screen* that shows five counts a merchant cannot reconcile. A merchant reads the screen. **Verdict: 1 usable desktop frame (05 Settings) against Shopify's 3–6.** Also: **the greeting fix is not universal** — frame 04 reads `Welcome back!` with no store name at all, so there is a second path that never gets `storeName`. Frame 04 additionally leads with a red 33/100 under a yellow banner about Google retiring FAQ rich results: honest, and not a listing image.
- **ALL — capture only when nothing else is mutating the store.** The 8 frames were already stale by one product when taken (14 against the store's 15) because another worker's archive probe was running concurrently. Frames 02/07 fail on **store state, not code** — `Nothing to review` over a blank frame, for our approve-before-publish bullet. Several drafts left pending before the next capture fixes both without a line of code.


- **OWNER — A PRICE LIVES IN THREE PLACES AND WE ONLY EVER INVENTORIED TWO. Shopify's own registered plan metadata is stale and it is on the public listing.** Found by CW 2026-09-14, verbatim from the public page: `Starter $9.99 / month or **$99.90/year and save 17%**` and, below our own true `14-day free trial · 250 credits` line, **Shopify's own badge reading `7-day free trial`**. The editor shows the same read-only: `growth | Edit | $29.99/month or $299.90/year, 7-day trial`. **The code is right** — `TRIAL_DAYS = 14`, `annualAmount 95.9 / 287.9 / 767.9`, and `save 17%` is a phrase `14-PRICING.md` §4 bans by name. **What Cowork resolved, that CW could not from the screen:** this app is on the **Billing API**, not Managed Pricing — `app/shopify.server.js` declares a `billing:` config built by `buildBillingConfig()` from the locked table, `app/routes/app.plans.jsx:154` calls `billing.request()`, and the one live subscription carries a subscription id created through that path. So these figures are **display metadata, not the charging path**: nobody is charged $99.90 and nobody gets a 7-day trial. **It is still wrong and it is still public** — the listing advertises a price and a trial the app does not offer, which is the H12 failure mode inverted. **The owner action:** in the Partner Dashboard app-pricing section, use the `Edit` control on each plan card to set annual to 95.90 / 287.90 / 767.90 and the trial to 14 days. **Before editing, confirm one thing on that screen: whether the section is "Managed pricing" or manual/display-only.** If it says Managed Pricing, then Shopify DOES charge from these cards, the code's numbers are decoration, and this stops being a display bug and becomes a live billing defect — say so and stop rather than editing. CW did not touch it because changing what a merchant is charged is a billing change, not listing copy; that was the right call.
- **ALL — the lesson, for the guiding files: a locked price has THREE homes, not two.** (1) the code, (2) the App Store listing fields we write, (3) **Shopify's registered plan metadata, which we do not author and cannot see from the code**. Phase 4 and Phase 5 both audited (1) and (2) and both declared the price consistent. Neither looked at (3), and (3) is the one a merchant reads first on the listing. Any future claim that "the price is consistent everywhere" must name all three or it is false green #11 again at a different layer.
- **CC — `metrics.server.js` was never scoped, and that is now a deliberate decision rather than an oversight; say so in the file.** CW's diagnosis was right: the header counts come from `GeneratedContent` filtered only by `shop` and `productId`, with no join to Shopify product status, so they keep counting archived and deleted products. CC's P5.1 fix **relabelled rather than recounted** — `live` → `with content published`, and Home's `Live on your storefront` → `AI Content Published`. **That is the right call** and the reasoning in the two code comments is sound: the number is an honest record of what this app has done, and only the word "live" turned it into an unchecked claim about the storefront. But the decision now lives in two route comments and nowhere else, while `metrics.server.js` itself — the file a future session will read first — says nothing. One paragraph at the top of that file, plus a row in `04-DECISIONS.md`, closes it. Otherwise the next session "fixes" the count and quietly breaks the record.


- **OWNER — DECISION: the shipped price list contradicts the doctrine, and P0.6 cannot close the gap
  with code.** *Why it matters:* `09-DOCTRINE.md` says we sell **proof**, not a utility, and should price
  at roughly **double** the category ARPU of $25–35. The plans we actually bill
  (`app/utils/billing-plans.js`, read 2026-09-14) are **Free $0/25, Starter $9.99/50, Growth $29.99/200,
  Pro $79.99/1,000**. At an illustrative mix that is ~**$27.49** ARPU — *inside* the category norm, not
  double it. `08-ECONOMICS.md` had been modelling **$0/$19/$49/$99/$299** with a Scale and an Enterprise
  tier; **none of those exist in the code**, and its ladder promised ~**$9.9k** MRR at 150 merchants where
  the real list gives ~**$4.1k**. *What is NOT the problem:* cost. Measured, every paid plan clears
  **62.5%–85%** margin at 100% utilisation, so there is room to move prices in either direction.
  *The decision, and only you can make it:* either the **prices** rise toward the premium the doctrine
  claims, or the **doctrine's premium claim** is dropped and we position inside the category. *What done
  looks like:* one sentence in `04-DECISIONS.md` saying which, dated. Until then §4 of `08-ECONOMICS.md`
  says in writing that none of its figures should be used for planning. *Paste back:* the chosen direction.

- **OWNER — the only cost figure still `ASSUMED` needs your billing dashboards.** *Why:* `08-ECONOMICS.md`
  §2 now has every per-generation cost `MEASURED`, but infrastructure (Fly web + worker, Neon, Redis) is
  still assumed "fixed and small relative to model spend". Nothing in this repo can see an invoice. *What
  to do:* read last month's actual totals from Fly, Neon and whoever bills the Redis, and paste the three
  numbers. *What done looks like:* three USD figures with the month they cover. *Why it matters:* at 25
  installs model spend is pennies, so infrastructure may well be the **larger** line — which would change
  where the free-tier ceiling actually binds.

- **COWORK — read the AI-visibility probe's real cost per question out of the `navaal.ai` repo.**
  *Why:* `08-ECONOMICS.md` §2 claimed *"the probe already records cost in cents per run — read it, do not
  estimate it"*, as though the number were one command away. It is not: `ai-visibility.cjs` **is not in
  the contentclaude repository** (searched 2026-09-14). *What to do:* open it in the `navaal.ai` project
  and read the recorded cents-per-run. *What done looks like:* a USD-per-question figure with the date and
  the model it used. *What it unblocks:* monitoring is "the business" per §1, and it is the only part of
  the cost model with no number at all.

- **CC — P0.4 needs a rendered document before the fix, not after.** *Why:* verified 2026-09-14 that
  `app/root.jsx` carries **no App Bridge script and no `shopify-api-key` meta**; the tag is emitted by
  `<AppProvider embedded>` **inside the body**, and React is **18.3.1** so it is not hoisted (that is a
  React 19 feature). Shopify documents the head. *The blocker:* adding it to `root.jsx` while AppProvider
  still emits its own **double-loads app-bridge.js on every page**; removing AppProvider's copy means
  `embedded={false}`, which also drops the redirect-to-admin behaviour tied to **App Store rejection
  2.1.1**. *What to do:* capture the real `<head>` of an authenticated `/app` document (the H13 CDP route
  works), make the change, capture it again, and confirm no App Bridge double-load warning in the console.
  *What done looks like:* before/after head HTML, plus a server-render regression test asserting App
  Bridge is the first script in the head.

- **CC — `UsageRecord.tokensUsed` is a dead column and should either be filled or dropped.** *Why:* it is
  typed, indexed and named as if it measures something, and is written as the literal **0** at both of the
  only two places it is ever written (`plans.server.js:174`, `:430`). This is the same shape as the
  `includeDraftProducts` bug — a column with no real write path. *Why it was not fixed in P0.6:* the record
  is created inside the **serializable quota transaction before** generation runs (correct for a gate —
  the credit must be reserved first), so the real count is only known afterwards and filling it means
  threading a record id back through every caller of `tryConsumeGeneration`. That is the billing path.
  *Mitigation already shipped:* every call now emits an `ai.usage` event with real tokens and cost, which
  `logs.mjs --event ai.usage` can query. *Decide:* fill it properly, or drop the column so it stops looking
  like data.

- **CC — identify what the "16 Oct 2026" deadline actually is, or delete it.** *Why:* `11-MASTERPLAN.md`'s
  risk table says *"1 Oct and 16 Oct 2026 are three and five weeks away"*. The 1 Oct half is now resolved
  (P0.1 never applied to us; P0.2 is clean and is the real one — **1 Oct 2026: you can no longer create or
  update storefront script tags**, with **1 Mar 2027** when Shopify stops injecting them). **Nothing in the
  folder says what 16 Oct is**, and an unidentified date in a risk table is either a real deadline nobody
  is working, or a scare. Find it in Shopify's changelog or remove the reference.

- **COWORK — three corrections to the CW session report of 2026-09-13, verified from production and git.**
  **(1) The 410 is narrower than reported, and it is not ours.** A CW session concluded "any harness
  without a real browser UA looks like an outage". Tested 2026-09-13 against production: `curl`,
  `python-requests`, `HeadlessChrome`, `UptimeRobot`, `OAI-SearchBot` and `Googlebot` all get **200 with
  valid JSON** on `/api/health?deep=1` and `/api/build-info`. The 410 appears **only on `/app`**, and it
  comes from **Shopify's own auth library**, not from our `isbot` call — `app/entry.server.jsx:43` only
  picks `onAllReady` vs `onShellReady` for streaming. Our own code already documents this at
  `app/utils/scheduler.server.js:43-44`: *"The Shopify library answers a non-browser agent with 410 Gone
  instead of redirecting to auth."* **Monitoring is unaffected.** The real lesson is for harnesses:
  a page-level scrape of `/app` without a browser UA will read as an outage and is not one.
  **(2) H7 is not blocked on the catalogue.** The existing eight listing assets were captured on
  `contentpilot-dev2` and **contain no demo-store words at all** (checked every excerpt in
  `listing-assets/manifest.json` for snowboard/ski/wax/hydrogen/gift card — zero hits). The demo
  catalogue is a property of `navaal-ttv-01`, not of every dev store. What is actually stale about the
  assets is the **store name**: they read *"Welcome back, E2E Test Store!"* and dev2 has since been
  renamed *Northline Supply*. **So re-capture on dev2, not ttv-01, and H7's only real blocker is the
  Partner Dashboard upload.**
  **(3) `listing-assets/manifest.json` now references a file that no longer exists** —
  `04-start-desktop.png` was removed during the restore. Either re-capture it or drop its manifest entry;
  a manifest that lies is how the next session loses an hour.

- **OWNER — the 11 Sep webhook task fired, succeeded, and nobody has read its output.** Verified
  2026-09-13: `trig_01SS3kD3gVKfSeNg4LESz6S2` fired 2026-09-10T23:00:25Z and finished 23:06:15 with
  `SUCCEEDED`, session `cse_01JiC2Vs1ccfVNPsGwkRjkEv`. But its `folders_state` was **NONE**, so it ran in
  a browserless cloud session and cannot have reached the Partner Dashboard. **"Succeeded" means the
  session completed, not that it got the reading.** The 17 Sep task has the same defect and fires
  2026-09-16T23:00Z; its prompt was rewritten 2026-09-13 to say so honestly, to stop claiming it is bound
  to this computer, and to point at `06-QUEUE.md` — the old prompt pointed at `06-HUMAN-QUEUE.md`, which
  has not existed since the rename.

- **OWNER — complete the Partner Dashboard account selection (one click, probably).** Blocks H7's upload,
  H10, H11 and H15. Every browser path on this computer lands on `accounts.shopify.com/select` with the
  title *"Log in — Partners"* — an account CHOOSER, not a password prompt, so the session exists but the
  Partners surface needs an explicit account pick. Open `https://partners.shopify.com/4937813/apps` in
  Chrome, choose the Waqas Ahmad account, and leave the tab signed in. Done looks like: that URL loads the
  app list without redirecting.
- **OWNER — H15 is the urgent one and it is still live.** The public listing promises *"Dedicated account
  manager"* and *"SLA support"* right now. `04-DECISIONS.md` forbids both by name — *"at 0 reviews one unmet
  promise halves the rating."* The approved replacement wording is already written in `12-OFFER.md`. This
  needs sixty seconds once the dashboard opens.
- **OWNER — no dev store has a realistic catalogue, which blocks every future listing screenshot.**
  `navaal-ttv-01` (the store the brief nominated) is Shopify's demo catalogue: snowboards, ski wax, a gift
  card. Capturing there is what produced the screenshots we are trying to replace. Either stock one dev
  store with ~15 plausible products of any ordinary kind, or say which store CW may use. Done looks like: a
  named store whose product list contains no Shopify demo names.
- **CW — the app's isbot filter makes any harness without a real browser user-agent look like an outage.**
  A Playwright context with the default UA gets **410** and renders **8 characters**, which is
  indistinguishable from "production is broken" — I concluded exactly that for several minutes today
  before the known-good harness read the same page fine. `tools/proof/read-screen.mjs` sets a Chrome UA;
  anything new must too. Worth a line in `07-VERIFICATION.md`.

- **CC / COWORK — what Shopify's Agentic channel already reports, read 2026-09-11 on `contentpilot-dev2`.**
  Screenshot: `docs/history/screen-reads/agentic-link0.png`. It is at `/store/<store>/apps/agentic` (an
  embedded app, not `/channels/agentic` — that URL 404s). Verbatim, it shows:
  **four channels with a binary status** — ChatGPT, Microsoft Copilot, Other channels, Shop, every one
  *"Status: Inactive"* · a master toggle *"Allow Shopify to manage for me"* · **Sources**: *"Shopify
  Catalog — 0 products in Catalog"* and *"Knowledge Base — Install"* (not installed) · a two-step
  readiness list, *"Make sure catalog access is enabled — Completed"* and *"Update policies — Not
  started"* · and the banner *"Agentic Storefronts aren't live — but your products may still be
  surfacing in AI agents."*
  **It reports NOTHING per product.** No per-product eligibility, no data-completeness detail, no feed
  errors, no reason codes. The only product-level number is a single aggregate: `0 products in Catalog`
  — on a store that has 17 products — and Shopify does not say which products or why.
  **Honest read:** the gap is real, but it is narrower and later than assumed. A merchant would still
  need us to answer *"why is that number 0, and which products?"*. But Agentic Storefronts are **not
  live yet**, and Shopify may add per-product reasons when they launch — so building full per-product
  eligibility now risks duplicating a feature that ships free. The defensible slice today is the
  diagnostic Shopify does not give: *why is your catalog count 0, and which products are excluded.*

- **ALL — the plan was rewritten 2026-09-10 (revision 2). Re-read at orient.** New authoritative files: **`09-DOCTRINE.md`** (what we sell and what we refuse to say, with the evidence), **`10-MARKET.md`** (the market and platform, verified from live sources that day), and **`11-MASTERPLAN.md`** (the plan, which now outranks `02-BACKLOG.md` for phases and order). `README.md` carries the order of authority. `04-DECISIONS.md` is **partly superseded** — llms.txt, "instant indexing" and small-catalogue A/B claims are now banned; reconciling it is P0.11. Three things changed materially: eligibility is **monitoring**, not a one-time audit; proof ships on **Bing/IndexNow first** because it needs no approvals and reads out in 72 hours; and **billing, cost-per-generation and two calendar-bound approvals moved to Phase 0**.

- **COWORK — run the eligibility base-rate study (W1) before any Phase 2 code.** 300–500 public Shopify storefronts: robots.txt agent by agent, attribute completeness from public product JSON, canonical sanity, policy pages. **Count the fraction with at least one actionable finding.** Kill criterion: **below 40% and Pillar 1 is a feature, not a product.** Two days of work that either validates or kills the phase — and the aggregate is publishable on navaal.ai, which Shopify says is an App Store ranking lever.

- **CC — the guiding folder was rebuilt 2026-09-10 by Cowork. Re-read it at orient; do not work from memory of the old shape.** What changed: files are now TIERED (CORE read every session, REFERENCE read on a trigger — see `README.md`) · every backlog item and queue row has an OWNER (`CC`/`CW`/`COWORK`/`OWNER`) · four new laws, **L16** whole-file reads, **L17** route don't park, **L18** teach the system, **L19** not live is not done · two new reference files, `07-VERIFICATION.md` (the proof each claim class needs) and `08-ECONOMICS.md` (the unit economics the product must not break) · two new phases, **G** installs and reviews and **R** reliability and retention — nothing in A–F produces a single install · Phase R items are `R1..R6` so they cannot collide with this file's `H` space · `06-HUMAN-QUEUE.md` is now `06-QUEUE.md` · the protocol is a LOOP with four stop conditions, and ends by regenerating `CW-BRIEF.md` and `OWNER-CHECKLIST.md`.

- **RESOLVED 2026-09-10 by Cowork — the file is now `06-QUEUE.md`.** CC was right: L17 and two README lines pointed at a filename that did not exist. Renamed rather than re-pointed, because `06-QUEUE.md` is the better name: this queue is no longer humans-only, it routes to CW and CC as well.

- **OWNER — Log in `flyctl` on this computer** (blocks INFRA6, and every local `fly` command). Run
  `flyctl auth login` in a terminal and complete the browser flow. Why: the local token expired
  mid-session on 2026-09-10 — `fly status -a contentclaude` returns `Error: no access token
  available`. An agent cannot do this: the flow is interactive and an agent never types the owner's
  credentials. CI is unaffected (it uses the `FLY_API_TOKEN` secret), so deploys still work; only
  local inspection is blocked. Done looks like: `fly status -a contentclaude` lists four machines.
- **OWNER — Then run INFRA6:** `fly secrets unset FEATURE_MAGIC_MOMENT -a contentclaude`, then
  `curl -s "https://app.navaal.ai/api/health?deep=1"` and confirm `status: ok`. Why: the flag is dead
  and `unset` is correct because removal passes no value. Note it RESTARTS the machines, so do it when
  a deploy would be acceptable. Done looks like: deep health `ok` and `fly secrets list` no longer
  shows the name.
- **OWNER — Run the restore drill (INFRA7)** in the Neon console: restore the latest state into a **NEW
  branch**, never production. Then against that branch run `npx prisma migrate status` and count rows
  in `Shop` and `GeneratedContent`. Why: the runbook promises a restore path nobody has ever
  exercised, and Neon retention was 6 hours until 2026-09-10 — the promise was false the whole time it
  was written. An agent has no Neon credentials here (0 matches for `DATABASE_URL` in env). Done looks
  like: the date, the branch name and the two row counts recorded in PROGRESS.md.
- **CC (next session) — Read the durable log once, to confirm it is really writing** (INFRA2's live half). After the next
  deploy: `fly ssh console --app contentclaude -C "node /app/scripts/logs.mjs --since 2h"`. Why: the
  sink is proved by unit tests with Prisma mocked — that proves what we hand Prisma, not that the
  table accepts it. Done looks like: at least one row, and `--event log_retention_swept` returning
  nothing yet (the sweep only logs when it actually deletes something).

- **CC (next session) — Verify the "partial run" banner on a rendered page (L15).** After the Phase A deploy, start a bulk
  run on a store with more than 20,000 products — or temporarily set `ENUM_MAX_PAGES` low on a dev
  store — and confirm the warning banner **"This run covers part of your catalog"** actually appears
  on `/app/jobs`. Why: the note travels in a URL query param (`/app/jobs?partial=...`) because a
  redirect discards an action's return value, and it is proved only by source assertions. A banner
  that never renders is the exact L15 failure class. Done looks like: the banner visible above the
  job list, wording readable, and it does NOT appear on a run that covered the whole catalogue.

- **COWORK — `12-OFFER.md` §4 mislabels its own App details paragraph.** The heading says **478/500**; the paragraph is **449** characters, counted from the file. 29 out. Harmless against the 500 limit, but the character counts in §4 are what we trust instead of re-counting, so fix the label. (Every other §4 count matched exactly: intro 86, bullets 58/69/74/60/63.)
- **COWORK — a pricing-plan feature line cannot hold §6's approved SLA replacement.** The field is `maxlength 40`. "Every question answered within one business day" is 47. Published "Questions answered within 1 business day" (exactly 40) instead. §6 should carry a 40-character variant so nobody has to improvise this again.
- **OWNER — one Professional feature slot is wasted.** The five slots are `1000 AI content generations/month`, `7-day free trial`, `Direct access to the founder`, `Custom onboarding`, `Questions answered within 1 business day`. Shopify **already prints "7-day trial" in the plan header**, so that line buys nothing and it is the slot "Setup call when you start" would go in. Say the word and I swap it.
- **OWNER — possible over-claim on a discovery surface.** Under *App category details -> How can merchants monitor performance*, three tags are selected: `SEO score`, `Audits`, **`Analytics`**. `12-OFFER.md` §2 lists AI traffic reporting and Search Console proof as **not built**. `Analytics` is defensible if it means the before/after scores, and it is discovery surface we would lose — so I did not touch it. Your call.
- **COWORK — the App card subtitle is flagged by Shopify and has no approved replacement.** The field carries the notice *"Review the updated guidance for this field and refresh your content."* Current text, 62/62: *"Content Google ranks and ChatGPT quotes — you approve it first"*. It names a third-party AI brand and predates §4. **§4 does not specify a subtitle**, so there was nothing approved to publish. This is the app card in every search result — it needs 62 approved characters.
- **OWNER / CC — nine optional listing fields are empty and none can be filled truthfully today:** Demo store URL · Integrations · Support portal URL · Support phone number · pricing-information URL · Google conversion ID · Facebook Pixel ID · Facebook Access Token · (Google Analytics ID and secret ARE set). `https://navaal.ai/pricing` returns **404** (checked), so the pricing URL has nothing to point at; the demo store would have to be a password-free store we own. I filled none rather than inventing.
- **CW — the six URLs already on the listing all resolve.** HTTP 200 each: `navaal.ai`, `/privacy`, `/support`, `/changelog`, `/docs`, `/docs/getting-started`. Checked 2026-09-10 with `curl -L`.
- **CW — "Merchant must have online store" was already ticked.** The *My app requires -> Shopify Online Store* checkbox read `true` before I changed anything. No change made; this is a no-change finding, not work done.
- **CW — a screenshot alt text still describes the pre-Phase-2 app.** `"One-click Optimize Store bulk generation screen"` is live on the public page. Not false, just stale — H7 replaces it.
- **CW — the Agentic INBOX entry above is dated `2026-09-11`, but the device clock and this session both read 2026-09-10.** One of the two is wrong; worth knowing before anyone reasons about the webhook 7-day window from these dates.

- **CC — the Partner Dashboard login wall that blocked H11/H15 is one click, and Cowork got through it 2026-09-10.** `accounts.shopify.com/select` is an account CHOOSER, exactly as CC diagnosed. What worked: navigate to `partners.shopify.com/4937813/apps/368479600641/edit_listing/en`, then in the chooser page click the anchor whose text contains the owner's name. An MCP `left_click` on the element ref did **nothing** — it took a scripted `.click()` on the `<a>` to fire it. That redirects to `apps.shopify.com/services/partner-app-submissions/<token>/en`, which is the real listing editor and was fully authenticated. No credentials were typed. **The listing editor's own fields are addressed by `id`, not `name`, for everything except `appName`/`appIntroduction`/`appDetails`/`featureList.N.description` — the pricing plan feature inputs have an `id` only.**

### Appended 2026-09-14 by CW (Phase 6)

- **CC — THE FRAMES ARE NOT UPLOADABLE. `43f56a2` says "every number on them is now true"; that claim does not survive looking at the images. 1 of 8 usable, and the blocker is the metrics defect I filed in Phase 5 and which is still unfixed.** Two of H7's three blockers ARE genuinely cleared — no Shopify wordmark, no left nav, no Sidekick icon on any of the eight, and frames 01/06 greet **"Welcome back, Northline Supply!"**. But a fourth blocker, not on H7's list, is now printed on **six of the eight frames**.
  | # | frame | verdict | why, in one sentence |
  |---|---|---|---|
  | 01 | Home desktop | **NO** | Four different product counts on one image — *"Autopilot optimized **15** new products in the last 24 hours"*, *"**30** products optimized · 0 drafts awaiting review"*, *"**65** / 100 across **14** products sampled"*, *"Total Products **32**"*, *"AI Content Published **30**"* — on a store with 15 products. |
  | 02 | Review desktop | **NO** | It is the empty state — *"Nothing to review — you're all caught up"* over ~80% blank frame — so the listing image for our approve-before-publish bullet shows that screen with nothing in it. |
  | 03 | Products desktop | **NO** | *"32 products in your catalog · 14 active and draft products … · 30 with content published"* and a **30** stat card sit directly above *"All (15 on page)"* and *"Showing 15 products"*. |
  | 04 | First run | **NO** | The greeting is the nameless fallback **"Welcome back!"**, the hero is a red **33/100**, and the dominant element is a yellow warning banner whose body explains that *"Google retired FAQ rich results in May 2026, so this will not change how your pages look in Google Search."* |
  | 05 | Settings desktop | **YES** | Clean, app-only, `Northline Supply`, no contradictory number anywhere on it. |
  | 06 | Home mobile | **NO** | Same contradictions as 01, all visible in one phone-height frame. |
  | 07 | Review mobile | **NO** | Same empty state as 02. |
  | 08 | Products mobile | **NO** | Same as 03 — *"30 with content published"* and *"32 products in your catalog"* above *"All (15 on page)"*. |
  **Shopify wants 3–6 desktop. Usable desktop frames: 1.** Nothing uploaded — a partial set on a live listing is worse than the current one.
- **CC — "30 live" was RENAMED, not fixed, and `metrics.server.js` is still the cause.** The Products subtitle now reads *"30 with content published"* where it used to read *"30 live"*, and the stat card still says **AI Content Published 30**. The number is unchanged and wrong. The cause is the one filed in Phase 5 and still true at live sha `13a5a0e`: `app/utils/metrics.server.js` queries `FROM "GeneratedContent" WHERE shop = ${shop} AND "productId" LIKE ${PRODUCT_GID}` with **no join to Shopify product status**, and imports only `db.server.js` and `productState.js` — never `LIST_SCOPE_QUERY`. `app.products.jsx` was scoped; `metrics.server.js` was not. **This is now a listing-quality blocker, not just an in-app one.**
- **CC — the greeting fix is NOT universal. Frame 04 reads "Welcome back!" with no store name.** H7 blocker 2 was reported cleared on the strength of `contentpilot-dev2`, where it does read "Welcome back, Northline Supply!". On the fresh store used for frame 04 the name is absent and the fallback renders. Whatever populates the shop name has a path that leaves it empty on a store in that state.
- **CW/CC — two frames are blocked by STORE STATE, not by code, and that is cheap to fix before the next capture.** 02 and 07 are empty because every draft on `contentpilot-dev2` was published (0 ready to review), and 01/06 carry *"0 drafts awaiting review"* / *"Nothing waiting"* for the same reason. **Before the next capture round, leave several products with drafts pending** so the Review frame shows the approve-before-publish flow doing its job. Nothing else about those two frames is wrong.
- **CW — the frames are already stale against the store by one product.** Captured 05:22:32Z showing **14** active; the store read **15** at 05:45:36Z (`All (15 on page)`, `Showing 15 products`, zero demo words). Frames captured during another worker's archive/unarchive probe inherit that probe's state. **Capture when nothing else is mutating the store**, and re-read the product count immediately before and after a capture round.
- **OWNER / CC — TASK 2 ANSWERED: THE THIRD HOME IS DISPLAY-ONLY. IT IS SAFE, AND IT IS A COSMETIC FIX, NOT A BILLING DEFECT.** Section heading verbatim: **"Pricing details"**. Under it, verbatim: *"For each public plan, add a descriptive display name and briefly describe its top features."* · **"4 public plans"** · **"Changes to prices and billing cycles will be updated automatically"** · a `Manage` button. The checkbox *"I have approval to charge merchants outside of the Shopify Billing API"* is **unchecked**. Shopify states it derives these figures and updates them automatically from the app's billing configuration — they are display, not the charging source. **Nobody is charged $99.90 and nobody gets a 7-day trial.**
- **CC — AND I FOUND WHY IT HAS NOT AUTO-UPDATED, WHICH CHANGES THE RECOMMENDED FIX.** Dev Dashboard → Versions: the **Active** app version is **`navaal-seo-geo-content-15`, created 9 September 2026** — five days before the pricing lock. The most recent version whose note mentions billing is **`contentclaude-5`, 23 June 2026**: *"register GEO schema theme extension + annual billing config"*. **A Fly deploy does not resync Shopify's billing metadata; releasing a new app version does.** So the durable fix is to create and release a new app version so Shopify re-reads `buildBillingConfig()` — **not** the per-card `Edit` control, which Shopify's own sentence says will be overwritten the next time the config syncs. I edited nothing.
- **CW — TASK 3 SWEEP, and the two new standing checks FIRED on their first run.** Fetch sanity first: HTTP **200**, **201,041 bytes**, "Navaal" ×**13**. Editor fields — doctrine §2 banned phrases **0/0/0/0/0/0**; superlatives `the best`/`the first`/`the only`/`#1`/`leading`/`number one` **0 each**; `A/B variant testing` **0**; `Priority support` **0**; `ai content generations` **0**; replacements **1** and **1**; app name **25**/30, intro **86**/100, details **449**/500, bullets **58·69·74·60·63** (all ≤80), search terms **exactly 5**. Public page cross-check: `100 credits / month` 1, `1,500 credits / month` 1, `14-day free trial · 250 credits` **3**, `ai content generations` **0**.
  **`save 17%` = 3 and `7-day` = 3 on the public page, and 0 in every field we author.** That is exactly the gap the new checks exist to catch: `Starter $9.99 / month or $99.90/year and save 17%` and a `7-day free trial` badge under our true 14-day line, on all three paid cards. Both come from the stale app version above, not from any field in the editor. **These two strings stay in the sweep permanently — a sweep that only covers what we write is the sweep that missed them.**
- **OWNER — the W1 post is unchanged and still owner-blocked.** `hpanel.hostinger.com` → `auth.hostinger.com` → an email + password form; CW does not type the owner's credentials. Instructions at `docs/navaal/_UPLOAD-W1-POST.md` and `navaal.ai/blog/_UPLOAD-W1-POST.md`. **Restated: the 71.9% is never published without the 36.2% sensitivity row beside it** — same sentence, same table — **and none of the W1 numbers may go near the App Store listing at all** (4.3.3/4.3.4).
- **ALL — re-orienting caught a deploy again, the second session running.** ORIENT read **`13a5a0e`, 245 columns, started 05:42:48Z** — 31 seconds before I read it, and already newer than the `43f56a2` the brief named as live. Nothing in this report depends on a sha I read more than a few minutes before the fact it explains.

### Appended 2026-09-14 by CW (Phase 5 verification pass)

- **OWNER / CC — URGENT. THE LIVE PLAN CARDS NOW CONTRADICT THEMSELVES ON THE TRIAL, AND SHOPIFY IS SHOWING THE WRONG ANNUAL PRICE. This is the first thing to read.** H12 is published (below), and the public page now renders, verbatim, per paid plan:
  `Starter $9.99 / month or $99.90/year and save 17% · Features 500 credits / month · 14-day free trial · 250 credits · Bulk generation · 1,000 products covered · Email support from the founder · **7-day free trial**`
  The last line is **Shopify's own badge**, not ours — and the listing editor shows the same thing read-only against each plan: `growth | Edit | $29.99/month or $299.90/year, 7-day trial`, `professional | Edit | $79.99/month or $799.90/year, 7-day trial`. **The app's code is right and Shopify's registered billing metadata is stale.** Live sha `8fa3000`: `TRIAL_DAYS = 14`, `TRIAL_CREDITS = 250`, `annualAmount: 95.9 / 287.9 / 767.9`. Shopify still has **7-day** and **$99.90 / $299.90 / $799.90 at "save 17%"** — the exact figures the H12 row told me not to carry onto the listing, and the 16.7% that `14-PRICING.md` §4 bans by name. **Two consequences, and the second is money:** (1) every paid plan card now says 14-day on our line and 7-day on Shopify's, one under the other, in front of the two non-test merchants; (2) if Shopify charges from its registered plan rather than from what the app requests at subscription creation, an annual subscriber pays **$99.90 instead of $95.90**. **CW did not touch it:** there are no price inputs in the listing editor, only an `Edit` control per plan, and changing what a merchant is charged is a billing change, not listing copy. **I left our 14-day line in place because it is true** — reverting it would have made the card self-consistent by publishing something the app no longer does. Needs CC/OWNER to re-register the billing plans so Shopify's display matches the code.
- **CW — H12 IS DONE. The plan table is published, read back on a full reload, and cross-checked on the public page.** Gate satisfied first, both halves: P5.0 is live (`8fa3000`, `/api/build-info` at 04:37:55Z, after `f38838f`), and I read the app's own Plans page at 04:38:36Z — verbatim **"14-day free trial · 250 credits"**, **"Annual save 20%"**, `100 credits / month · 100 products` / `$9.99 · 500 credits / month · 1,000 products` / `$29.99 · 1,500 credits / month · 5,000 products` / `$79.99 · 4,000 credits / month · Unlimited`, and **"2 months free" appears 0 times**. Then published, 20 feature lines, every one length-checked against `maxlength 40` **before** typing and none truncated:
  · **Free** `100 credits / month` (19) · Product descriptions · Meta titles & descriptions · FAQ content · `100 products covered` (20)
  · **Starter** `500 credits / month` (19) · `14-day free trial · 250 credits` (31) · `Bulk generation` (15) · `1,000 products covered` (22) · `Email support from the founder` (30, §5.5)
  · **Growth** `1,500 credits / month` (21) · `14-day free trial · 250 credits` · `5,000 products covered` (22) · Autopilot mode · `Two description options to compare` (34, §5.5)
  · **Professional** `4,000 credits / month` (21) · `14-day free trial · 250 credits` · `Unlimited products covered` (26) · Direct access to the founder · Questions answered within 1 business day
  Read back after a **full page reload**: `AI content generations` **0**, `7-day` **0** in our fields, `14-day free trial · 250 credits` **3**. Public page cache-busted (HTTP 200, 201,041 bytes, "Navaal" ×13): every new string present at the expected count, and `ai content generations` **0**, `image alt text` **0**, `content templates` **0**, `custom onboarding` **0**.
  **The unit was wrong, not just the number.** `12-OFFER.md` §1 warns that credits are weighted — alt text 0, blog 3, everything else 1 — *"so 'AI generations / month' is not the same unit as 'credits' and the two must never be mixed in one sentence."* Every live plan line said `AI content generations`. All four now say `credits`.
- **CC — the products fix is HALF live. The list is clean; the numbers a merchant reads are not.** Read 04:17:56Z on live sha `979b25b`. **Fixed:** `All (15 on page)`, `Published on this page (15)`, `Showing 15 products`, `Select all 15 products`, 15 distinct real products, and **zero** demo-catalogue words — `LIST_SCOPE_QUERY` reached `app/routes/app.products.jsx`. **Not fixed**, verbatim from the same screen: **"32 products in your catalog · 15 active and draft products published to your online store · 30 live · 0 ready to review · 0 not yet optimized"**, and the Activity card **"AI Content Published 30"**. CC's report said "showing 15 of 32 with 17 archived excluded" — true of the list, not of the header or the Activity card.
- **CC — THE CAUSE OF "30 LIVE", FOUND. `app/utils/metrics.server.js` has no product-status scope at all.** Its query is `FROM "GeneratedContent" WHERE shop = ${shop} AND "productId" LIKE ${PRODUCT_GID}` — it groups by `productId` and never joins to Shopify product status, and it imports only `db.server.js` and `productState.js`, not `LIST_SCOPE_QUERY`. So every header count, the Activity card and `publishedProducts` include **archived** products. That is why a 15-product store reads 30. **What this does and does not prove:** it proves the counts include archived products; it does **not** prove a generation was spent after a product was archived — those `GeneratedContent` rows predate the archiving. The credit-accounting question is still open and the query to settle it is unchanged: do any rows exist for the 17 archived product ids with `createdAt` after the archive time.
- **CC — the Home/Audit gap is CLOSED. Home 65, Audit 65, read 14 seconds apart.** Home 04:19:13Z *"Store SEO score 65 / 100 · across 15 products sampled"*; SEO Audit 04:19:27Z *"65 / 100"* over *"15 products analyzed"*. Gap **0**, was 42. The *"Down N points"* framing is gone; Home now reads *"Your starting score, across the 15 products we sampled."*
- **CC — FALSE GREEN #9, SECOND MEASUREMENT TAKEN, AND I DID NOT REPRODUCE THE BUG.** `STORE_SCORE_TTL_S = 600`. Method: baseline Home → archive one real product (`Rope Basket Large`, 7800250007655) at **04:21:43Z** → poll Home. Home held **65 / "15 products sampled"** across **13 consecutive samples** and first read **"14 products sampled"** at **04:29:35Z** — **a lag of 472 s (7 m 52 s), inside the 600 s TTL.** So the cache behaved to spec in this test and the Phase-4 observation (48 → 78 with no deploy) is **not** reproduced as a TTL violation; it is more likely a stale-but-within-TTL read followed by a fresh one. **The real finding is the window, not a violation:** the Products list showed `All (14 on page)` at **04:25:13Z**, while Home still said *"15 products sampled"* — **the two screens disagreed about the same store for about eight minutes**, and a merchant who changes their catalogue sees the list update instantly and the headline score not move. Product **unarchived at 04:30:11Z**; store restored, verified `All (15 on page)`.
- **CW — Settings form values clean on the current build: 21 values swept across all five screens, 0 suspect.** `storeName` = `"Northline Supply"`, `targetKeywords` = `"kitchenware, homewares, garden supplies"`, `keyDifferentiators` = the real one-liner. `/app`, `/app/products`, `/app/review`, `/app/seo-audit` have no text inputs at all. Harness kept at `tools/proof/form-value-sweep.mjs` — it reports "could not read" separately from "clean", per rule 4.
- **CC — C1 VERIFIED ON THE SCREEN, not just in the source. The button opens the right URL and the editor accepts it.** Clicked the real control on Home; the URL it actually opened, verbatim: `https://contentpilot-dev2.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=1279a14cca41d4a6f8e6e3c485870b77/faq_visible&target=mainSection` — app `client_id` form ✓, `target=mainSection` ✓, `template=product` ✓. Followed it and the editor said verbatim **`"FAQ (Navaal)" added`**. Harness: `tools/proof/verify-deeplink-button.mjs`.
- **ALL — two traps in verifying C1 that cost me three wrong conclusions, worth `07-VERIFICATION.md`.** (1) **The control is a Polaris `<Button onClick={...}>` that calls `window.open()`. It has no `href`.** An href-based scan finds nothing and would wrongly report "C1 not wired" — which is close to what I reported in Phase 4. Click it by label and intercept `window.open` to capture the URL. (2) **The card is hidden once `embedConfirmed` is set**, so on any store that has confirmed it, the button is absent and "not present" means "already confirmed", not "not shipped". Reset with `POST /app/embed-status actionType=reset`, test, then `confirm` to restore — I did, and verified the card was hidden again afterwards.
- **CW — I reported `/app/embed-status` returning `{"message":"Unexpected Server Error"}` and then withdrew it. It is not a defect.** That route is a **resource route with an `action` and no `loader`** — its own comment says "No UI". A GET erroring there is correct. Recording it so nobody re-files it.
- **CW — my own score-cache probe produced a false positive and I caught it before reporting.** Its first sample read `null` (the score card had not rendered), and it called `null → 65` a change, printing `<<< CHANGED` after 19 s. A null is "not yet loaded", not a value. Hardened to require a non-null baseline before starting the clock and to ignore null samples; the 472 s figure above is from the hardened run. This is false green #9's own failure mode reappearing inside the tool built to measure it.
- **ALL — re-orienting mid-session caught a deploy that would have made this whole report wrong.** ORIENT read `979b25b` at 04:16:52Z. At 04:37:23Z the Plans page said "14-day free trial", which contradicted `979b25b`'s source (which says 7-day in six places). Re-reading `/api/build-info` at 04:37:55Z returned **`8fa3000`, started 04:35:55Z** — a deploy had landed mid-session. Without that re-read I would have reported the Plans page as contradicting its own build. **Re-read the sha before concluding anything, and again before reporting.**
- **OWNER — restating so it cannot be lost: the 71.9% is never published without the 36.2% sensitivity row beside it** — in the page they are in the same sentence and the same table — **and none of the W1 numbers may go near the App Store listing at all** (4.3.3/4.3.4 ban statistics, "verifiable and unverifiable"). The post is still owner-blocked: `hpanel.hostinger.com` → `auth.hostinger.com` → an email + password form. Instructions at `docs/navaal/_UPLOAD-W1-POST.md` and `navaal.ai/blog/_UPLOAD-W1-POST.md`.

### Appended 2026-09-14 by CW (Phase 4 verification pass)

- **CC — ALL THREE GATED PHASE-4 TASKS ARE SHUT, AND NOT BECAUSE A DEPLOY IS PENDING. The code does not exist.** ORIENT sha read from `/api/build-info`: **`5bd4fb87d95adc11625cde8896d2308c4e2ac062`** (`5bd4fb8`), started `2026-09-14T02:16:44.843Z`, deep health `ok`, 237 schema columns. **Zero matches for "ship gate" anywhere in this file.** Deployed `5bd4fb8` is **three commits behind local HEAD `8cb0bb6`**, and the two commits since (`0f01a2c` pricing lock, `8cb0bb6` Phase 4 prompts) touch neither defect. Proved by diff, not by absence: `git show HEAD:app/routes/app.products.jsx` and `git show 5bd4fb8:app/routes/app.products.jsx` are **identical** at line 92 — `products(first: ${PAGE_SIZE}, after: $cursor, sortKey: TITLE)`, still no status filter. **The products fix has not been written in any commit.** Task 4 likewise: `addAppBlockId` occurs exactly once in `app/`, in the explanatory comment at `app/components/EmbedSetupCard.jsx:47` — C1 is not wired.
- **CC — the archived-products defect, read off the screen 2026-09-14 02:58:59Z, with the numbers you asked for.** Verbatim: *"32 products in your catalog · 15 active and draft products published to your online store · 30 live · 0 ready to review · 0 not yet optimized"*. Tabs verbatim: **"All (32 on page)"**, **"Published on this page (30)"**, "Draft on this page (0)", "Not optimized on this page (0)", **"Showing 32 products"**. 34 demo-catalogue word hits still on the screen. The 17 archived products are present in **the list and in both counts**, unchanged.
- **CC — NEW, and bigger than the display bug: "30 live" / "AI Content Published 30" on a store with FIFTEEN real products.** Before this work `contentpilot-dev2` had 13 published demo products; 13 + 15 real = 28, not 30, so the arithmetic does not close in either direction. This is reported as a gap, not a diagnosis. **Why it is urgent rather than cosmetic:** if content is being generated against ARCHIVED products, then under `14-PRICING.md` §4 — where the whole model is 2.00¢ per credit — the app is spending a merchant's credits on products they deliberately archived. Check whether `GeneratedContent` rows exist for the 17 archived product ids with `createdAt` after the archive time. A merchant who paid $29.99 this morning would call that billing for work they did not ask for.
- **CC — the Home / SEO Audit score contradiction is SMALLER BUT NOT FIXED, and the "different sample" defence is gone.** Read 12 seconds apart on the same store: **Home 03:00:33Z — "Store SEO score / 78 / 100", "Down 6 points since September 10, across the 15 products we sampled."** **SEO Audit 03:00:45Z — "90 / 100 — Audit score, averaged across 15 products."** Gap was 42 points (48 vs 90) on 2026-09-14 02:2x; it is now **12 points**, and **both screens now name the same 15 products**, so they can no longer be explained as different samples. Two separate things to fix: (a) the 12-point gap itself; (b) **Home's score moved 48 → 78 with NO deploy** (sha unchanged at `5bd4fb8` throughout), so the earlier 48 was a stale cached value lagging hours behind published content — a merchant who publishes and then looks at Home is shown the wrong number until the cache catches up. Until both are resolved, **frames 01 and 06 still advertise a score going down.**
- **CW — Settings form values are CLEAN, swept across all five app screens.** 21 non-empty field values on `/app/settings`, **0 suspect**: `storeName` = `"Northline Supply"`, `targetKeywords` = `"kitchenware, homewares, garden supplies"`, `keyDifferentiators` = the real one-liner, `language` = `en`, `brandTone` = `scientific`. `/app`, `/app/products`, `/app/review` and `/app/seo-audit` have **no text inputs at all**, so there is nowhere else on those screens for a value to hide. Checked via DOM `value`, not `innerText` — the method that caught `E2E Test Store`.
- **OWNER / COWORK — THERE ARE NOW THREE DIFFERENT PRICE TABLES IN THE GUIDING FILES, AND THE TWO THE RULES POINT AT ARE BOTH WRONG.** The Phase 4 prompt cites *"`04-DECISIONS.md` §PRICING — LOCKED 2026-09-14"*, and standing rule 6 says every listing character comes from `12-OFFER.md`. Neither holds:
  · **`04-DECISIONS.md` §PRICING**: `$0 / $19 / $49 / $99 / $299`, **five** tiers, annual 25% off.
  · **`12-OFFER.md` §1**: `$0 / $12.99 / $27.99 / $44.99 / $89`, **five** tiers, annual 20% off.
  · **`14-PRICING.md` §4** (approved in full by the owner in commit `0f01a2c`): `$0 / $9.99 / $29.99 / $79.99`, **four** tiers — **this one matches the Phase 4 table exactly** and matches the code.
  **The lock lives in `14-PRICING.md` §4, not in `04-DECISIONS.md` §PRICING.** A session that follows the prompt to `04-DECISIONS` publishes `$19/$49/$99/$299`. Worse, `04-DECISIONS.md:26` carries the feature row **`llms.txt + instant indexing`** — `09-DOCTRINE.md` §2 bans *"instant Google indexing"* by name and §3 says never build or charge for llms.txt because Shopify serves it free. That row is doctrine-banned copy sitting in the file the prompt calls the source of truth. **Reconcile all three, then re-point rule 6.**
- **CC / OWNER — TASK 2'S OWN PREMISE IS THE REASON IT MUST STAY SHUT, with the numbers.** The prompt's rationale is *"if the listing says 1,500 credits and the app bills 200, that is a false statement in a Shopify submission."* That is exactly the current state. **Code today** (`app/utils/billing-plans.js`, `app/shopify.server.js:37`): amounts **0 / 9.99 / 29.99 / 79.99**, `monthlyLimit` **25 / 50 / 200 / 1000**, **`trialDays: 7`** baked into every plan. **The table to publish**: credits **100 / 500 / 1,500 / 4,000**, trial **14 days with 250 credits**. So prices already agree, but **allowances are overstated 4–7.5×** and the **trial is wrong by a factor of two**. `14-PRICING.md` §6 lists **eight** things that must be built first, including credit weighting, two-axis limits, a separate trial allowance, credit packs (which need the Billing API, not Shopify App Pricing) and BYO key — *"does not exist in code or schema. A build."* **Good news: the LIVE listing is currently truthful** — it says `25 / 50 / 200 / 1000 AI content generations/month` and `7-day free trial`, which is what the code bills. Publishing the new table today would break a listing that is presently accurate.
- **CW — the live listing passed a full compliance sweep, with counts rather than an adjective.** Cache-busted fetch, HTTP **200**, **201,021 bytes**, "Navaal" ×13 (fetch sanity first, because last session an HTTP **429** with a 32-byte body returned zero for every phrase and read exactly like a pass). Doctrine §2 banned phrases, 7 tested: **0 each**. `A/B variant testing` **0**, `Priority support` **0**; `Two description options to compare` **1**, `Email support from the founder` **1**. Superlatives `the best`/`the first`/`the only`/`#1`/`leading`/`number one`: **0 each**. Field lengths from the editor: app name **25**/30, introduction **86**/100, details **449**/500, bullets **58·69·74·60·63** (all ≤80), search terms **exactly 5**. Introduction and all five bullets are **byte-identical** to `12-OFFER.md` §4, verified by string comparison against the file.
- **ALL — a scanning trap worth `07-VERIFICATION.md`: you cannot audit the App Store listing page for statistics or testimonials by scanning the whole page.** Our listing page renders Shopify's "other apps" carousel, so the raw text contains `testimonial` once and `46,877` — both belong to **Judge.me**, not to us. A naive 4.3.3/4.3.6 scan flags our listing for another app's copy. **Measure the fields in the listing editor and use the public page only to confirm each string is present.**
- **OWNER — the W1 upload instructions are NOT at the path the Phase 4 prompt gives.** The prompt says `docs/navaal/_UPLOAD-W1-POST.md`; the file is at **`navaal.ai/blog/_UPLOAD-W1-POST.md`** (in the navaal.ai folder, beside the post it describes). A copy has now been placed at `docs/navaal/_UPLOAD-W1-POST.md` so both paths resolve. **Still owner-blocked and not attempted:** `hpanel.hostinger.com` redirects to `auth.hostinger.com` showing an **email + password form**, not an account chooser. **Restating so it cannot be lost: the 71.9% is never published without the 36.2% sensitivity row beside it** — in the page they are in the same sentence and the same table — and **none of the W1 numbers may go on the Shopify listing at all** (4.3.3/4.3.4 ban statistics, "verifiable and unverifiable").

### Appended 2026-09-14 by CW (second batch)

- **OWNER — THE W1 POST IS WRITTEN AND CANNOT BE PUBLISHED WITHOUT YOU. One upload, two paste-ins.** `hpanel.hostinger.com` redirects to `auth.hostinger.com` and shows an **email + password form** — not an account chooser like Shopify's, so rule 1 stops CW there and no workaround was attempted. `https://navaal.ai/blog/shopify-product-data-409-stores` returns **404** right now. **Ready on disk:** `navaal.ai/blog/shopify-product-data-409-stores.html` (36.5 KB), built by cloning the head, nav, inline CSS and footer of `best-shopify-store-monitoring-tools-2026.html` so the design is identical to a real post. Verified locally over HTTP: renders correctly, 3 tables / 22 rows, 14 nav links, 24 footer links, both JSON-LD blocks parse, exactly one `<head>`, no superlatives. Step-by-step upload plus the ready-made `blog/index.html` card (with its own SVG bar chart) and `feed.xml` item are in **`navaal.ai/blog/_UPLOAD-W1-POST.md`**. Those two shared files are NOT pre-edited on purpose: the Downloads copy of the site may be older than the server, and overwriting them could revert newer content.
  **The rule the page ships under, restated there so it survives this session:** the **71.9% never appears without the sensitivity row beside it** — in the page they are in the same sentence and the same table. Post-upload check: `curl -sL "https://navaal.ai/blog/shopify-product-data-409-stores?cb=$(date +%s)" | grep -c "36.2%"` must return **2**; if it returns 0 the page went up without the caveat and should come down. And none of these numbers may move onto the **Shopify listing** — 4.3.3/4.3.4 bans statistics there, "verifiable and unverifiable".
- **CW — the two live listing over-claims are GONE, verified on the public page.** `12-OFFER.md` §5.5 applied verbatim in the Partner listing editor: Growth slot 5 `A/B variant testing` → **`Two description options to compare`** (34), Starter slot 5 `Priority support` → **`Email support from the founder`** (30). Saved, editor re-read after a full reload, then a cache-busted public fetch: both old phrases **0**, both replacements **1**, and H15's pair still **0/0**. **The first read-back returned HTTP 429 with a 32-byte body and every phrase at zero** — which reads exactly like a clean pass. That is rule 4 in its most dangerous form and the reason the confirmed counts above come from a verified 200 (201 KB, 13 occurrences of "Navaal"). **In-app half already done by CC** — `app/routes/app.plans.jsx` now carries both approved strings, but the change is **uncommitted**, so by L19 it is not live yet.
- **CW — the Partner listing editor opened with NO account chooser this time.** `partners.shopify.com/4937813/apps/368479600641/edit_listing/en` went straight to `apps.shopify.com/services/partner-app-submissions/<token>/en`, authenticated. The chooser step recorded on 2026-09-13 is intermittent, not a standing wall. Useful coincidence: that submission token **is** the app client_id, which is the same value the working theme deep link needs.

- **CC — HOME'S STORE SEO SCORE CONTRADICTS THE APP'S OWN SEO AUDIT BY 42 POINTS.** Same store, same minute, 2026-09-14 on `contentpilot-dev2` after a `Run audit`: **Home = 48/100, "Down 36 points since September 10, across the 15 products we sampled"**; **SEO Audit = 90/100 — Audit score, averaged across 15 products**. The Audit screen already carries the disclaimer *"Measured differently from the Store SEO score on Home, which samples a smaller set"* — but a disclaimer is not a reconciliation, and this is the exact failure class `read-screen.mjs` exists to catch (*"stat cards disagreeing with the tabs directly beneath"*). Home is the first number a merchant sees **and the one a listing frame shows**, so right now frames 01 and 06 advertise a score going DOWN while the audit says the catalogue is at 90. Home's score also did not move after 15 products were published — it may be cached with no invalidation on publish.
- **CW — LISTING FRAMES RE-CAPTURED, NONE UPLOADED. 3 of 8 usable, which is not a coherent set** (Shopify wants 3-6 desktop; only 2 desktop are usable). Full verdict table: `listing-assets/FRAME-VERDICT-2026-09-14.md`. **CC's `frameOnly` fix works** — all eight are now the app iframe alone, so the Shopify wordmark, left nav, store badge and **"Sidekick conversations"** are gone from every desktop image for the first time. USABLE: 02 Review desktop, 05 Settings desktop, 07 Review mobile. HOLD: 01+06 Home (hero reads *"Down 36 points since September 10"*), 03+08 Products (archived products still listed), 04 First run (ttv-02 is still on the demo catalogue). Three blockers, in order: the products status filter, the Home-vs-Audit score contradiction, and a fresh store for frame 04.
- **CW — the Settings screen was about to put TEST JUNK on the public listing, and only a form-VALUE check caught it.** `storeName` = **`E2E Test Store`**, `targetKeywords` = **`best mobiles in usa`**, `keyDifferentiators` = **`yes genrate now`** (sic). None of it appears in `innerText`, so every text-only banned-word check this project has run would have passed frame 05 — and the previous session's check did. Fixed on the dev store to `Northline Supply` / `kitchenware, homewares, garden supplies` / a one-line description, read back on a fresh load. **The lesson for `07-VERIFICATION.md`: a banned-word check that reads only innerText is not a banned-word check.** This is the second distinct defect that hid in a form value.
- **OWNER — frame 04 (the first-run screen) needs a decision.** It cannot be captured cleanly today: `navaal-qa-fresh` has the app uninstalled, and `navaal-ttv-02` renders the first-run screen correctly but on Shopify's demo catalogue (2 Snowboard + 1 Gift Card in the frame). Either stock one ttv store the way `contentpilot-dev2` was stocked this session (the harnesses are written and reusable — `tools/proof/stock-northline.mjs`), or drop frame 04 and ship a four-desktop set. **Say which and it is 20 minutes either way.**

- **CC — THE THEME DEEP LINK IS THE `app client_id` FORM. Verified on `contentpilot-dev2`, both candidates, 2026-09-14.** Wire this one:
  `https://<store>.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=1279a14cca41d4a6f8e6e3c485870b77/faq_visible&target=mainSection`
  · **app client_id `1279a14cca41…` → WORKS.** Editor says verbatim `"FAQ (Navaal)" added`. Screenshot `docs/history/screen-reads/deeplink-app-client_id.png` shows **FAQ (Navaal) – Frequently asked q…** added and selected inside **Product information**, below Share, in the main product section.
  · **extension UID `6470d60a-e399…` → FAILS.** Verbatim: `"faq_visible" not added. There is a problem with the app block. Contact the app developer.` Screenshot `deeplink-extension-UID.png`.
  · **Added, NOT saved.** The editor shows *"Drag the app block up or down to move it to the position you want. When ready, save your changes."* and Save is live — the block is inserted into unsaved editor state and the merchant must press Save. So Shopify's `{api_key}` documentation is correct and the app-embed link's extension-UID form is the exception, not the rule. Harness: `tools/proof/verify-deeplink.mjs`.
- **CC — `app/routes/app.products.jsx` lists and counts ARCHIVED products, and this is now the ONLY thing blocking clean listing frames.** Its GraphQL query is `products(first: ${PAGE_SIZE}, after: $cursor, sortKey: TITLE)` (lines ~80 and ~92) with **no status filter**, so after archiving Shopify's 17 demo products the Products screen still lists all 32 and Home still reads *"Total Products 32"* on a store with 15 active. `statusFilter` is read from the URL at line 76 but never reaches the query. Our own `app/utils/candidates.js` documents the rule this breaks: *"an ARCHIVED one is not"* a candidate, `includeArchived` defaults off. **Merchant-visible defect, not just a fixture problem:** a merchant who archives a product still sees it in Navaal's list and in their catalogue count. Home, Review and Settings are all clean; Products is the only contaminated screen left.
- **CW — `contentpilot-dev2` (Northline Supply) IS NOW STOCKED. The screenshot blocker is gone.** 15 ordinary products created with prices, SKUs and their own images (Stoneware Mug 400ml · Cast Iron Skillet 26cm · Brass Watering Can 1.5L · Glass Storage Jar 1L · Olive Wood Serving Board · Linen Tea Towel Set of 3 · Bamboo Chopping Board · Terracotta Plant Pot 20cm · Cotton Waffle Bath Towel · Enamel Camping Mug · Ceramic Pour-Over Coffee Dripper · Wool Throw Blanket · Stainless Steel Measuring Spoons · Beeswax Food Wrap Set · Rope Basket Large). Images are **original line drawings generated for this purpose** — no stock photography, nothing third-party on the listing. All **17 demo products ARCHIVED, not deleted** (verified `{"Archived":17}`; every one restorable). The 4 leftover snowboard drafts were **rejected** (a DB-only status change — `reject` writes nothing to the catalogue). 8 real drafts published, 7 left pending so the Review frame has content. Read back on fresh loads: **Home CLEAN · Review CLEAN · Settings CLEAN · Products still contaminated** (see the CC row above). Harnesses: `tools/proof/stock-northline.mjs`, `archive-demo.mjs`, `reject-demo-drafts.mjs`, `publish-some.mjs`.
- **CW — the stale shop-name greeting fixed itself.** The app now says *"Welcome back, Northline Supply!"* — it had said *"E2E Test Store"* for four days. The name refreshed at some point during the stocking work, so whatever writes `Shop.name` does run; it just had not run since the rename. Worth CC confirming what triggers it before calling the earlier bug report closed.
- **CW — three Shopify admin routes that do NOT work, so nobody re-tries them.** (1) The products list exposes **no Import control at any viewport** and `/products/import` and `/products?modal=import` both render **zero file inputs** — the CSV route is closed, which is why the catalogue was built one product at a time. (2) The **bulk** "More actions" menu on the products list yields no menu items, while the **per-product** one does (`Duplicate product` / `Archive product` / `Delete product`) — archive per product, not in bulk. (3) On `/products/new` the description field is a rich-text editor with **no reachable surface** (no `[contenteditable]`, `role=textbox`, `.ProseMirror`, aria-label or data-testid); only its hidden `textarea[name=descriptionHtml]` is in the DOM and it is not fillable. Product type also sits in a **closed** shadow root Playwright cannot pierce. Title, price, `#file-input` and Save are all reachable normally.
- **OWNER — the new products show "Sold out" on the storefront.** Inventory quantity was never set (the quantity field was not filled during creation). It does not appear on any app screen, so it does not affect the listing frames, but a storefront-facing shot would show it, and `availability` is one of the attributes OpenAI's feed spec requires.
- **CW — 20 scratch probe files are in `tools/proof/_to_delete/`.** `rm` is not permitted on this device, so they were moved rather than deleted. Safe to delete the whole folder. The four harnesses worth keeping are named in the stocking row above.

### Appended 2026-09-14 by CW

- **ALL — W1, the eligibility base-rate study, is DONE. n = 409 live Shopify storefronts, two independent frames, public web only. Full write-up and every raw file: `docs/research/w1-eligibility-base-rate/`.**
  **The four numbers:** at least one actionable finding **294/409 = 71.9%** · median findings per store **1** (mean 1.28, max 6) · zero findings **115/409 = 28.1%** · ranked table in the write-up.
  **The 40% kill bar is CLEARED on the criterion as written.** And the two frames — Shopify stores inside the Tranco top 49,560 (n=186 usable) vs a long-tail sample (n=223 usable) — land at **72.0%** and **71.7%**, within 0.3 points, from completely different sources. The prior that the head of market would be visibly cleaner is **wrong**.
  **But the number that should change the plan:** the headline is carried by two content-quality checks. Missing `product_type` 44.9% and thin description (<120 chars) 43.9%. **Strip those two and only 36.2% of stores have any finding at all — below the bar.** **35.7% of all stores have NO finding except those two.** Narrow it further to attributes OpenAI's feed spec actually requires plus the policy pages agentic storefronts need (no price / no image / missing policy) and it is **22.7%**. Structured data alone (missing or duplicated) **15.9%**. `product_type` is **not** on OpenAI's required list (09-DOCTRINE §1) — it is Shopify's own taxonomy field, so grading it BLOCKING would repeat the GTIN overclaim §1 already had to walk back. **So the phase survives, but its most common output is a CONTENT finding, not an ELIGIBILITY one — and that is a positioning decision to make before the code is written.**
  **The null result, and it contradicts a pillar:** **crawler access is blocked on 2 stores in 409 = 0.5%.** robots.txt was read on 409/409. Per agent: OAI-SearchBot 1 · PerplexityBot 1 · Claude-SearchBot 1 · bingbot 2 · Googlebot 1. **Not one store blocks an AI crawler while allowing Google** (`altrarunning.com` blocks everything including Googlebot; `momcozy.com` blocks bingbot only). Nine further long-tail stores carry a blanket `Disallow: /` and **every one also has no reachable product page** — closed storefronts, not misconfigured open ones, so they are excluded from the base. Only ~1.6% of robots.txt files name an AI crawler group at all. 09-DOCTRINE §1 calls this "a real, fixable, unmarketed failure… Nobody in our category audits this." It is all three. **It is also nearly absent — nobody audits it because there is almost nothing to find.** Keep the check (one fetch, total block when it fires); it cannot carry a pillar.
  **Control behaved as predicted:** `/llms.txt` 100%, `/agents.md` 99.5%, `/.well-known/ucp` 100% (n=409). Shopify serves all three natively. Confirms §3 — never build them, never charge for them.
  **This is the one statistic class we may publish** (aggregate about the market, on navaal.ai, never on the listing — 4.3.3/4.3.4). **Publish the ranked table, the two-frame agreement and the crawler null. Never publish 71.9% without the sensitivity row beside it** — alone it is exactly the kind of headline this project exists not to write.
- **COWORK / CC — barcode completeness cannot be measured from the public web at any sample size.** The brief's check 2 asked for it. `barcode` is **not** exposed in `/products.json`; it is Admin-API only. Verified against a live store's raw JSON — the variant object has `sku` but no `barcode` key. Two consequences: the barcode base rate is **unknown**, and no competitor scraping from outside can grade it either — **our app, which has the Admin API, can. That is a real moat on exactly the attribute 09-DOCTRINE §1 spends the most words on.**
- **CW / CC — three errors in my own first pass, each of which would have produced a publishable but false number. Worth a line in `07-VERIFICATION.md`.** (1) **DNS starvation faked a clean crawler result** — a parallel scan at 400 concurrency saturated the resolver, **137 of 250 robots.txt fetches returned nothing**, and the analysis treated "could not read" as "allowed", reporting 0% blocked over a half-empty denominator. Re-fetched alone with retries: **248/250 returned 200.** This is rule 4 of the standing prompt failing silently inside an aggregate — "could not read" became "no finding" with nothing on screen to show it. (2) **"No product schema" was wrong by 17x** — 68 stores had no Product JSON-LD (30.6%), but **58 of them emit `itemtype="schema.org/Product"` microdata**, which Google accepts. True rate 8.0%. (3) **Canonical and duplicate-schema were both over-counted** — a canonical to `/en-us/products/x` is correct for a locale storefront, and `Product` + `ProductGroup` together is Google's recommended variant markup, not a duplicate. Canonical fell 7.7% -> 0.7%. **The general lesson: every one of these made the market look more broken than it is, i.e. every error flattered the feature we were deciding whether to build.**

- **ALL — THE PROJECT'S FOUNDING PREMISE HAS CHANGED: two stores that are NOT ours have the app installed right now, and both have kept it.** `CW-STANDING-PROMPT.md` says *"every install so far is one of our own test stores"* and *"No real merchant has ever used it."* Read from each store's own Partner Dashboard page 2026-09-14:
  · **Peter Shops** — `peter-shops-2.myshopify.com`, `amusanpeter408@gmail.com`, **China**, installed **12 Sep 3:43 am**, apps installed: **Navaal only**, still installed.
  · **Zephyrine Wynter** — `zephyrin-wynter-a01g3uy4.myshopify.com`, `wynterzephyrine@gmail.com`, **United Kingdom**, installed **11 Sep 1:44 am**, apps installed: **Navaal only**, still installed.
  · **Hoodify** installed and uninstalled inside one minute on 9 Sep ("Testing multiple apps").
  Neither appears in the Dev Dashboard store list, so neither is ours. **Being fair to the evidence:** both are gmail-registered with only our app installed, and Zephyrine's random-suffix handle looks like a freshly created store — so *"two people who are not us"* is proved; *"two established merchants"* is not. Either way the standing prompt must be rewritten, and the two live over-claims below are now in front of people who are not us.
- **OWNER — scoreboard 2026-09-14, Partner Dashboard app overview, Last 30 days.** Total earnings to date **$0.00 USD** · Merchants with your app **8** · cumulative net installs **6** (**+300%**) · **26** installs · **20** uninstalls, of which **16 same-day**, 2 at 1–14 days, 2 at 15–90 days · earnings $0.00 across all four charge types · Latest merchant feedback **"-"** (still no reviews). The 8 reconciles exactly: 6 of ours still installed (Northline Supply, Harbourline Goods, TTV 02, TTV 03, TTV 05, EBS) + Peter Shops + Zephyrine Wynter. Also in app history: 10 Sep 9:00 pm, a REDACTED store, *"Subscription charge expired — Starter Plan $9.99 USD (Test). Subscription ID 30195777692"*.

- **CC — `tools/proof/listing-assets.mjs` cannot produce a usable desktop listing frame.** Line ~205: `const target = f.frameOnly ? await frame.frameElement() : page;`. `frameOnly: true` is set only on the three mobile frames, so all five DESKTOP frames screenshot the whole Shopify admin — wordmark, left nav, store badge and **"Sidekick conversations"**, which 09-DOCTRINE §2 names as a Built-for-Shopify rejection reason for an AI app. Every desktop asset ever produced by this harness has had it. Fix: `frameOnly: true` on all frames.
- **CC — the 04 frame guard is stale.** `must: /scores \d+\/100/i` no longer matches; the app renders "Store SEO score / 34 / 100". Read on `navaal-ttv-02` 2026-09-14: the screen itself is correct ("Your starting score", 3 drafts, 34/100). CW did not loosen the guard.
- **CC — the app greets a shop name captured at install and never refreshed.** `contentpilot-dev2` was renamed to **Northline Supply** in the Dev Dashboard; our Home hero still says *"Welcome back, E2E Test Store!"* and Settings → Store Name still holds `E2E Test Store`. `navaal-ttv-03` greets the raw handle *"navaal-ttv-03"* while `navaal-ttv-02` greets *"Navaal TTV 02"*, so the fallback is inconsistent too. Any merchant who renames their store sees the stale name forever — and it is visible in the same image as the correct name in the admin chrome.
- **CW — the app is UNINSTALLED on `navaal-qa-fresh`** (Playwright sees 0 iframes in the DOM at `/apps/navaal-seo-geo-content/app`). Anything in the docs that assumes that store is a live first-run fixture is wrong.
- **OWNER / COWORK — `A/B variant testing` is live on the listing and it over-claims.** The feature IS built (`checkEntitlement(shop,"abVariants")`, Growth+, real button) but the app's own button reads *"Generate two options to compare"* — it generates two candidate texts for the merchant to choose between. **No traffic split, no winner measured.** "A/B testing" names a measurement the app does not perform, and SEO buyers check. Needs approved replacement wording (the in-app phrasing is already honest). Separately, **12-OFFER.md §2's "ships today" list omits this feature entirely** — the doc understates while the listing overstates.
- **OWNER / COWORK — `Priority support` is live on the Starter tier.** Same undefined-promise class as "SLA support", which §6 bans by name. §6 has no entry for it, so there was nothing approved to publish in its place and CW did not invent one. Also present in our own app at `app/routes/app.plans.jsx:271`.
- **OWNER — the listing's plan table bears no relation to `12-OFFER.md` §1.** Live: Free 25 generations · Starter 50 · Growth 200 · Professional 1000, all on a **7-day** trial, displayed in the order Free, Growth, Professional, Starter. §1 says Free 100 · Starter 1,000 · Growth 3,000 · Scale 10,000 · Enterprise, on a **14-day** trial, and there is no "Professional" tier in §1 at all. §1 also forbids publishing that table before the P0.6 cost-per-generation measurement exists, so this is a real fork, not a typo to fix: either §1 or the listing is wrong. (H12 owns the update; this records how far apart they are.)
- **CW — the Partner Dashboard login wall is not a wall.** Reached the live listing editor 2026-09-14, no credentials typed: navigate to `partners.shopify.com/4937813/apps/368479600641/edit_listing/en`, land on `accounts.shopify.com/select`, then a scripted `.click()` on the `<a>` whose text contains "Waqas Ahmad" (an MCP click does nothing). Redirects to `apps.shopify.com/services/partner-app-submissions/<token>/en`, fully authenticated. This is the third session to hit that chooser and the first to record that it opens; H10/H11/H15 were never blocked on a human.
- **CW — Playwright now runs on this computer's Linux VM, which is how every screen read above was taken.** `npx playwright install chromium`, then extract `libxdamage1` by hand (`apt-get download libxdamage1; dpkg-deb -x`) and export `LD_LIBRARY_PATH=$HOME/libs/usr/lib/x86_64-linux-gnu` — without it the browser dies with "Target page, context or browser has been closed", which reads exactly like a broken harness. Worth a line in `07-VERIFICATION.md`.
- **ALL — Shopify's Agentic channel now reports per-channel COMMERCE ANALYTICS, and still nothing per product.** Re-read 2026-09-14 on `contentpilot-dev2`. The master toggle **"Allow Shopify to manage for me" is already checked `true`** — there was nothing to activate — yet all four channels read "Status: Inactive". Expanding a channel now shows `Sessions 0 · Sales $0 · Orders 0 · Conversion —` plus *"Your products aren't discoverable through the Shopify Catalog. They may still appear on ChatGPT through alternate sources."* **`Shopify Catalog — 0 products in Catalog` on a 17-product store, and the element is not clickable** (checked through the shadow DOM): no drill-down, no product list, no reason code. Readiness still *"Make sure catalog access is enabled — Completed"* / *"Update policies — Not started"*, whose Review button just goes to `/settings/legal`. **Two consequences:** (1) Shopify is now shipping AI-channel session/sales/order reporting free in the admin, which overlaps `12-OFFER.md` §5's Phase-3 "AI traffic report" bullet before we have written a line of it; (2) the defensible slice is unchanged and narrow — *why is the catalog count 0, and which products are excluded.*

## OPEN

| ID | Owner | Task | Why | Done looks like |
|---|---|---|---|---|
| H2 | **CW** | Add `hello@navaal.ai` as a second UptimeRobot alert contact | Alerts go only to one inbox today | Both monitors list both contacts, read back on a fresh page load |
| H3 | **CC** | Five fresh dev-store installs, >=10 products each, let the Start state run | **Cohort complete 2026-09-10.** navaal-ttv-01..05 created with 17 products each (verified per store). Installed from the App Store listing: TTV 02, 03, 04, 05 earlier in the day; **TTV 01 (renamed Harbourline Goods) installed 15:56:34 UTC** — grant to all three drafts complete in **under 18 seconds**, store scored 34/100 (GEO 43, Traditional SEO 25), 3 drafts written. TTV 04 was later uninstalled for the webhook test, so the live cohort is 4 of the 5. **Still needs `ttv-report.mjs` run via `fly ssh` (Claude Code) to produce median/p90** | `ttv-report.mjs` shows populated median and p90 |
| H4 | **OWNER** | Screen-record ONE of those installs, URL bar visible, grant → first proposal | The 120-second acceptance recording | A single video under 120s |
| H5 | **OWNER** | Drive a dev store 0 → 20 → 25 generations, URL bar visible | Quota-surface acceptance: nothing below 20, one banner from 20, actions replaced at 25 | Recording + banner stays dismissed on reload and another device |
| H6 | **OWNER** | Upgrade from the 100% card → Approve → land back in-admin | Billing attribution chain | `diag-shop.cjs` shows `upgradePromptSource: "quota100"` |
| H7 | **CW** | Upload the re-captured listing screenshots + new captions | **STILL BLOCKED 2026-09-14, and the 2026-09-13 INBOX correction that said dev2 was clean is WRONG.** 7 of 8 frames re-captured fresh on `contentpilot-dev2` from the current build; 04 could not be. Then checked properly - full screen text, not the 140-char manifest excerpt, and then by LOOKING at the PNGs. **All 8 fail.** (a) `contentpilot-dev2` carries the SAME Shopify demo catalogue as ttv-01: /app has Snowboard x4 + Liquid + Gift Card, /app/review Snowboard x22 + Gift Card x5, /app/products snowboard x29 + Ski Wax + Oxygen + Liquid + Hydrogen + Gift Card. The old excerpts showed zero hits only because each excerpt stops at 140 chars, above the product lists. (b) **Every DESKTOP frame is a screenshot of the whole Shopify admin, not the app** - Shopify wordmark, full left nav, store badge and **'Sidekick conversations'** in all of them; 09-DOCTRINE s2 names a Sidekick reference as a BFS rejection reason for an AI app. Cause is one line in `tools/proof/listing-assets.mjs`: `const target = f.frameOnly ? await frame.frameElement() : page;` - `frameOnly` is set only on the three MOBILE frames. (c) Each desktop image contradicts itself: admin badge 'Northline Supply', app hero 'Welcome back, E2E Test Store!'. (d) **05-settings is not clean either** - its Store Name input holds the value `E2E Test Store`; innerText does not include form values, so a text-only banned-word check UNDERSTATES contamination. (e) 04: the app is UNINSTALLED on `navaal-qa-fresh` (0 iframes); on `navaal-ttv-02` the first-run screen renders correctly but the harness guard `/scores \d+\/100/i` no longer matches the current copy - **the guard is stale, not the screen**; not loosened, routed to CC. Manifest now records 04 as ok:false with that error, so it no longer points at a file that does not exist. Full write-up: `listing-assets/BANNED-WORD-CHECK-2026-09-14.md`. **Needs, all three: frameOnly on desktop frames + a dev store with a plausible non-demo catalogue + the stale shop-name greeting fixed.** The Partner Dashboard is NOT a blocker - CW reached the listing editor on 2026-09-14. | Five desktop and three mobile live, from a store that does not look like a sandbox. |
| H8 | **CW** | Read the **Built for Shopify** status page | **DONE 2026-09-14 by CW — and the 2026-09-10 conclusion that 'no Built for Shopify section is exposed anywhere' was wrong. It is at Partner Dashboard -> **Distribution**, not the Dev Dashboard.** Per-criterion states read from the icon glyph on each row (tick / circle / clipboard). **PASS:** Largest Contentful Paint < 2.5 s · Cumulative Layout Shift < 0.1 · Is embedded in the Shopify admin · Uses theme extensions to add storefront functionality. **NOT MET:** 'Meets benchmarks for 2025 Core Web Vitals' (parent) · **Interaction to Next Paint < 200 ms — verbatim 'Not enough data'** · Minimum 50 net installs from active shops on paid plans · Minimum 5 reviews since launch · Rating of 4+ stars. **MANUAL, assessed at review (clipboard icon):** Minimizes impact on storefront loading speed · Is a well integrated app · Uses Shopify design guidelines · Doesn't use Asset API. **CLS now PASSES** over the 28-day window — on 10 Sep the reading was 0.17 on Sep 10 alone. The only automated TECHNICAL blocker left is INP, and it is starved of data, not failing. Page states 'Shopify hasn't assigned your app to a specific category', so no category-specific criteria apply, and there is a live **Apply now** button. Footer: 'All automated criteria based on data from last 28 days... Checked daily around 17:00 UTC'. Evidence: `docs/history/screen-reads/bfs-2026-09-14.txt` | The BFS scorecard itself, with per-criterion states |
| H10 | **CW** | Webhook reliability readings | **DONE 2026-09-14 by CW — the Partner/Dev Dashboard IS reachable from this computer; the 'login wall' was one scripted click on the account chooser.** Dev Dashboard -> Monitoring -> Webhooks, Last 7 days (window reads Sep 7 - Sep 14). Overall **61.5% High** over **39** deliveries. Per topic, count beside every percentage: `app/uninstalled` 68.182% of **22** @1,403 ms (0 removed) - **count UNCHANGED from the 10 Sep baseline, so this topic saw no new deliveries and its rate proves nothing new**; `shop/redact` **64.286% of 14** @658 ms (0 removed) - baseline was 100.0% of 9, and 0.64286 x 14 = **exactly 9 failures**, unchanged, so **5 new deliveries arrived and ALL 5 SUCCEEDED**; `products/create` 0% of **2** @716 ms (new topic); `app/scopes_update` 0% of **1** @534 ms. p90 headline 1,099 ms (Sep 8 1099, Sep 9 1001, Sep 10 5893, Sep 11 873, Sep 12 425, Sep 13-14 0). Daily ok/failed: Sep 7 0/0, Sep 8 1/18, Sep 9 2/5, Sep 10 6/1, Sep 11 2/0, Sep 12 4/0, Sep 13 0/0, Sep 14 0/0. Removed webhooks **0** on every topic. Arithmetic reconciles: 22+14+2+1 = 39; 15+9 = 24 failures; 24/39 = 61.5%. **shop/redact is fixed** - 12 successful deliveries and 0 failures since 2026-09-10. **The brief's premise was wrong on one point:** the Sep 8-9 failures have NOT rolled out of the 7-day window; they carry the entire 61.5% and it will fall by age alone around Sep 15-16. Evidence: `docs/history/screen-reads/webhooks-2026-09-14.txt` | The numbers, and one line on whether post-fix deliveries occurred. |
| H11 | **CW** | Publish the approved listing copy from `12-OFFER.md` §4 | **DONE 2026-09-10 by Cowork — UNBLOCKED, see note.** Intro replaced (86 chars), details replaced (449), all five bullets replaced with §4 verbatim (58/69/74/60/63 — every count matched the file). Search terms replaced with §4's five (`seo audit`, `product descriptions`, `meta tags`, `alt text`, `ai visibility`); `AI SEO`, `AEO`, `ChatGPT` removed. Saved, editor re-read after a full page reload, then confirmed on a cache-busted `curl` of the public page: each new string present, old intro and old bullet 2 at **0** occurrences. **No review step exists** — the editor has only Save, no submit-for-review, no pending-review banner, and the new text was public inside a minute. Sales-channel requirement was **already ticked**. Nine optional fields left empty because none can be filled truthfully — see INBOX. | New copy live on the public page. |
| H12 | **CW** | Update the listing pricing display after Phase C | **DONE 2026-09-14 by CW.** Published from the editor, field by field, after the P5.0 gate was satisfied on both halves (live sha `8fa3000` at 04:37:55Z; Plans page read at 04:38:36Z showing *"14-day free trial · 250 credits"*, *"Annual save 20%"*, and credits 100/500/1,500/4,000 with caps 100/1,000/5,000/Unlimited). 20 feature lines, each length-checked against `maxlength 40` before typing, none truncated; read back on a full reload (`AI content generations` 0, `7-day` 0, `14-day free trial · 250 credits` 3) and cross-checked on a cache-busted public fetch. **The unit was wrong as well as the number** — every line said `AI content generations`, and §1 forbids mixing that unit with weighted `credits`. **OPEN, and it is not listing copy:** Shopify still renders `$99.90/$299.90/$799.90 · save 17%` and a `7-day free trial` badge per plan from its own registered billing metadata, which now contradicts both the code (`annualAmount: 95.9/287.9/767.9`, `TRIAL_DAYS = 14`) and our new lines. See the urgent INBOX row. | **READ THIS BEFORE YOU PUBLISH. H12'S PREMISE WAS INCOMPLETE UNTIL `f38838f` (2026-09-14).** H12 was unblocked at `98225dd` on the grounds that *"the app bills the locked numbers at `7d23792`"*. It billed most of them. It did **not** bill the trial: `TRIAL_DAYS = 14` was exported, asserted green, and imported by nothing, while the value that actually reached Shopify was a literal `trialDays: 7`. Publishing the locked table's **"14 days, 250 credits"** onto the live listing before `f38838f` would have put a false statement in a Shopify submission — and the H12 gate's own green light would have waved it through. **The app now creates every subscription, monthly and annual, with 14 trial days** (`buildBillingConfig`, asserted per key, break-tested). **Two further corrections to what you publish:** (1) the annual saving is **20%** — $95.90 / $287.90 / $767.90 — and the app previously *displayed* $99.90/$299.90/$799.90 with the words "2 months free", which is 16.7% and which `14-PRICING.md` §4 bans by name; do not carry that phrasing onto the listing. (2) The in-app comparison table showed the **pre-B2 allowances** 25/50/200/1,000 — the correct figures are **100/500/1,500/4,000**, and the INBOX note above recording the live listing as "Free 25 · Starter 50 · Growth 200 · Professional 1000, all on a 7-day trial" describes a listing that was accurate about the app at the time and is wrong about it now. | Listing must match `04-DECISIONS.md` | Plans on the listing match the table — credits, product caps, annual prices, and a 14-day / 250-credit trial |
| H13 | **CW + CC** | Prove the "Include draft products" checkbox is visible AND that its value sticks. | **DONE — both halves proved, by different workers.** **(a) Visible (CW, 2026-09-11):** `docs/history/screen-reads/h13-checkbox-visible.png` shows the control rendered in the "Review before publishing" card, under "Publish without review". It is **BELOW the fold on load** — absolute y=2308 in a 1440x900 viewport, so a merchant must scroll to reach it. **(b) Persists (CC, 2026-09-13):** three paired readings, DOM beside the STORED value, each DOM read taken from a fresh browser context and a full document load, never a re-render. **1 before:** DOM `true` / DB `true`, `updatedAt 2026-09-10T18:13:56.988Z`. **2 after untick + reload:** DOM `false` / DB `false`, `updatedAt 2026-09-13T23:21:50.705Z`. **3 after tick + reload:** DOM `true` / DB `true`, `updatedAt 2026-09-13T23:22:34.443Z`. **The DOM and the database agreed at every step, in both directions**, and `updatedAt` advanced on each write — so these are real writes, not a cached render. It began `true` (CW left it so), hence false-then-true rather than the brief's tick-then-untick; the same two directions are covered. `publishWithoutReview` stayed `false` throughout: saving one flag does not clobber its neighbour. Stored value left `true`, as CW left it. Read via `scripts/shop-settings-diag.mjs` through the **Shop settings diagnostic** workflow — local `flyctl` still has no token. | Proved: reachable, visible, and persistent both ways. |
| H15 | **CW** | **Replace "Dedicated account manager" and "SLA support" on the live listing** | **DONE 2026-09-10 by Cowork.** Professional tier **before**: `1000 AI content generations/month` + `7-day free trial` + `Dedicated account manager` + `Custom onboarding` + `SLA support`. **After**: slots 3 and 5 are now `Direct access to the founder` (28) and `Questions answered within 1 business day` (40). Verified on a cache-busted public page load: "Dedicated account manager" **0**, "SLA support" **0**, both replacements **1** each (the 18 case-insensitive "sla" hits are all inside CSS class names such as `tw-translate-x`). **§6's approved wording is 47 characters and the field is `maxlength 40`** — the 40-char variant above was used; see INBOX. "Setup call when you start" was not added: all five feature slots were already occupied. | Neither phrase appears on the public listing. |
| H16 | **OWNER** | **Decide the UptimeRobot alert-contact route** (blocks H2) | A second contact needs a team member; UptimeRobot states team members are "Available in our Team and Scale plans", notify-only seats "sold separately". Account is free tier. Options: Gmail forward `gujjarcsu@` → `hello@navaal.ai` (free, recommended); change the account email; or buy a seat (billable — needs explicit approval) | Owner picks one |
| H17 | **OWNER** | **Approve the device binding for the two webhook scheduled tasks** | Both were deleted and recreated 2026-09-10 with `requires_local_device: true` (`trig_01SS3kD3gVKfSeNg4LESz6S2` 11 Sep, `trig_01TdvqbuYAcYTAoEJnNVhvhW` 17 Sep). Both returned **`not bound: no_signed_approval — this task will run in the cloud only`** and still show `folders_state: FOLDERS_STATE_NONE`. Declaring the flag is not enough; the owner must approve the binding on the computer. Until he does, both still fire into a browserless cloud session and produce nothing | Both tasks list this computer, and the 11 Sep run returns real figures |
| H18 | ~~OWNER~~ **CLOSED 2026-09-15** — `askebs.com.au` is WordPress; the Shopify EBS store is not live; nothing to verify until a real merchant connects their own Search Console | Verify a Search Console property for the **merchant store** the app reports on (`askebs.com.au`) | H1 covered `navaal.ai` only. Probed on the Navaal account 2026-09-10: `sc-domain:askebs.com.au` and `https://askebs.com.au/` are **not verified**. D2/D4/D5 need the shop's own Search Console data, not ours | Property verified on an account the app can OAuth into, with impression data |

## DONE

| ID | Task | Confirmed |
|---|---|---|
| H14 | Chrome signed in to the Shopify developer account | 2026-09-10 — owner signed in; account is **Waqas Ahmad, `gujjarcsu@gmail.com`**, Partner org **4937813** / Dev org **219167540**. Dev Dashboard and Partner Dashboard both load. Unblocked H8 and the H10 reading. |
| — | Scoreboard numbers read from the Partner Dashboard | 2026-09-10, app overview, Last 30 days: **Total earnings to date $0.00 USD**; **Merchants with your app: 5**; **cumulative net installs 2**; **19 installs**; **17 uninstalls**, of which **16 were same-day as install**; earnings $0.00 across one-time, recurring, usage and credits; **Latest merchant feedback: "-"** (no reviews). Dev Dashboard Installs card reads **5**. |
| — | Admin performance p75 + call counts read | 2026-09-10, Monitoring → Admin performance, **7-day window** (the only range offered; BFS grades 28 days, and the app only launched 2026-09-08 so 28 days does not exist yet). **LCP p75 1,130 ms — Good**, loads 11 + 31 + 9 = **51**. **INP p75 24 ms — Good**, loads 5 + 0 + 7 = **12**. **CLS p75 0.02 — Good** overall, loads **51** — but **Sep 10 alone is 0.17 over 9 loads**, well above the 0.1 threshold. Headline: the measurement rests on ~51 loads, **far below the 100 calls needed to be graded at all**. |
| — | Webhook reading #3 | 2026-09-10 ~11:00 UTC — **identical to the post-uninstall reading**: overall 75.0% High; `app/uninstalled` 68.182% of **22** @ 1,403 ms; `shop/redact` 100.0% of **9** @ 816 ms; `app/scopes_update` 0% of **1** @ 534 ms; Removed webhooks **0** on every topic; daily Sep 8 = 1 ok / 18 failed, Sep 9 = 2 ok / 5 failed, Sep 10 = 5 ok / 1 failed; p90 Sep 10 = 5,911 ms. **No new deliveries since the uninstalls** — the count is unchanged, so this reading proves nothing new either way. |
| H1 | Google Search Console property connected and verified | 2026-09-10 — **already verified before this session**, on the `Navaal` Google account (`navaal.aiiii@gmail.com`, `authuser=2`). **Two** properties: `sc-domain:navaal.ai` (**Domain**, verified via Domain name provider) and `https://navaal.ai/` (**URL-prefix**, verified via HTML file *and* Domain name provider). Read back from the Ownership page on a fresh load. Live data present: **10 clicks, 488 impressions, 2% CTR, average position 55.1** over 28 days, last updated 10 hours ago. The Domain property covers `app.navaal.ai`, which is **not** a separate property. Does **not** cover the merchant store — see H18. |
| H9 | Reindexing requested for `/apps/navaal-seo` and `/apps` | 2026-09-10 — both inspected under the `https://navaal.ai/` property. Both returned "URL is on Google / Page is indexed", then **"Indexing requested — URL was added to a priority crawl queue"**, read back from the page after each click. |
| — | Uptime monitors created | 2026-09-10 — keyword monitor on `/api/health?deep=1` matching `"status":"ok"`, plus a root monitor. Note: the root monitor is near-worthless; `/` redirects to `/reembed`, a static App Bridge shim touching no database, so it would report Up through a total database failure. |
| — | Neon history retention → 7 days | 2026-09-10 — was **6 hours**, not the 7 days the runbook promised. |
| — | App Store listing US spelling | 2026-09-10 — raw listing HTML grepped: 0 British, 23 US. |
| — | navaal.ai App Store links | 2026-09-10 — five links pointed at the pre-rename handle and returned **404**, including the `installUrl` in the `SoftwareApplication` JSON-LD. Fixed, verified live cache-busted. |
| — | navaal.ai "Coming soon" launch toggle | 2026-09-10 — `/apps` still advertised the app as coming soon with the live badge and install button hidden. Flipped, verified live. |
| — | Install attribution on navaal.ai | 2026-09-10 — `navaal-nav` + `navaal-footer` on 67 static pages, `blog-post` on 28 posts, `navaal-home` and `navaal-tools` added. All 8 handles return 302 with the ref preserved. |
| — | 4 test stores uninstalled | 2026-09-10 — to generate real webhook deliveries. |

- **P0 — CW/CC/OWNER: THE STORED-XSS FIX IN `faq_visible.liquid` IS NOT LIVE ON MERCHANT STOREFRONTS. Read off the Dev Dashboard 2026-09-14.** The active app version **`navaal-seo-geo-content-15`** carries, verbatim from its detail page (`/apps/368479600641/versions/1121286914049`): **`Released  September 9, 2026 at 4:34 am +0000`** / **`Created  September 9, 2026 at 4:34 am +0000`**. The fix commit `7942c30` is `2026-09-09T21:26:53+10:00` = **11:26:53 UTC**. The active version was created **6 h 52 min BEFORE the fix existed**, and it is the newest version in the list — nothing has been released since. The liquid Shopify is serving is therefore the one from `bf55847` (12 Aug), where `{{ qa.name }}` and `{{ qa.acceptedAnswer.text }}` are printed **unescaped**. This is the "`fly deploy` ships code, Shopify's copy only resyncs on a new app version" trap applied to a theme app extension: `app.navaal.ai` is running `25d16c7`, which **does** contain `7942c30` and **does** contain the escaped liquid in its tree — but that tree never reached Shopify.
- **What is and is not defended right now.** The server-side half of item 18 (`toPlainText` decode-then-strip-to-fixed-point, then drop surviving `<`/`>`) IS live, and `app/utils/seo.server.js:43-44` runs every FAQ question and answer through it before the `contentclaude.faq_schema` metafield is written — so FAQ text **generated after that deploy** should reach the storefront with no angle brackets left to interpret. The exposure is content written **before** that deploy, plus the fact that the storefront-side lock — the one the commit itself calls *"the second lock, on the side the merchant actually ships"* — is simply absent. The commit message records that before `7942c30` the pipeline *"sanitised, then decoded, so `&lt;script&gt;` came back as live markup"*, i.e. the server lock was broken too, so pre-fix metafield content is the population to worry about. `faq_schema.liquid` (`{{ ... | json }}` inside `<script type="application/ld+json">`) was **not** changed by the fix and relies on that same server-side normalisation alone.
- **0b COULD NOT BE RUN — say so rather than reading it as a pass.** `contentpilot-dev2.myshopify.com` serves `/password` for every storefront path (tried the product URL bare, and with `preview_theme_id`/`_fd=0`/`pb=0`; the theme editor preview is a cross-origin iframe the parent cannot read). Reading the rendered storefront HTML needs the storefront password, and **CW does not type the owner's credentials**. This check is unblocked the moment either (a) the owner enters the password once in the same browser, or (b) storefront password protection is turned off on a dev store — an owner decision, not made here.
- **0c — the delta a new app version would ship is exactly thirteen lines, and it changes no scopes.** `git diff 7942c30^ HEAD -- extensions/` is `faq_visible.liquid | 13 ++++++++++---` and nothing else; `7942c30` is the only commit after the v15 release touching `extensions/` or `shopify.app.toml`. Version 15's registered scopes read `write_content,write_products`; `shopify.app.toml` reads `write_products,write_content` — same set, so **no scope change and no re-consent** for the one live subscription. App URL, redirect URL, proxy (`url`/`subpath`/`prefix`), webhook api_version `2026-04` and the four + three compliance subscriptions all already match the registered version. **A new version is a pure security release.** Note the extension `uid` must not change (`6470d60a-e399-bf73-6f2e-693a42909d5d1bab4ee4`) — the theme-editor deep link targets it.
- **Two things that are NOT proven and must not be assumed.** (1) Whether the FAQ block is actually placed on the two non-test merchants' themes — CW cannot see a merchant's theme, so "no merchant has it enabled" is a guess, not a finding. (2) Whether any existing `contentclaude.faq_schema` metafield value on a live shop contains markup — that needs a query CC can run server-side over `GeneratedContent`/metafield writes with `createdAt` before the `7942c30` deploy. **Do that count before deciding how urgent the release is.**

## PHASE 7 — CW, 2026-09-14

- **TASK 2 IS A NO-OP: THE PRIVACY FIELD IS NOT EMPTY, AND THERE IS NO TERMS FIELD. Nothing edited.** Read off the live listing editor (`apps.shopify.com/services/partner-app-submissions/1279a14cca41d4a6f8e6e3c485870b77/en`, reached from `partners.shopify.com/4937813/apps/368479600641/edit_listing/en`, no chooser this time, no credentials typed). **`Privacy policy URL` = `https://navaal.ai/privacy`** — the field counter itself reads **`25/255`**, and 25 is exactly that string's length. Every other resource slot is filled too: `Developer website` `https://navaal.ai` · `FAQ` `https://navaal.ai/support` · `Changelog` `https://navaal.ai/changelog` · `Tutorial` `https://navaal.ai/docs/getting-started` · `Additional app documentation` `https://navaal.ai/docs`. **Shopify's listing form has no Terms of Service field at all** — the only fields under *Resources* are those six. Both pages are live (`curl -L`: `/privacy` **200**, 25,176 bytes, `<title>Privacy Policy — Navaal AI</title>`; `/terms` **200**, 19,708 bytes, `<title>Terms of Service — Navaal AI</title>`), and the public listing page renders the privacy link **twice** and `navaal.ai/terms` **zero** times. The app's own footer now reads *"Questions, bugs, or suggestions? Get help · hello@navaal.ai · Privacy · Terms"*. **So there is no submission defect here and nothing to link.** If a terms URL is wanted on the listing it can only go in a slot that already holds a more useful link — CW did not overwrite one to invent a fix.

- **TASK 3 — EVERY NUMBER ON HOME AND PRODUCTS, READ BY EYE, WITH THE REAL COUNT BESIDE IT.** Store `contentpilot-dev2` (Northline Supply), 2026-09-14 ~07:05 UTC, **before** the Task-4 drafts were created. **The real catalogue, counted off the Shopify admin product list by status: `Active 14 · Draft 1 · Archived 17 · 32 rows in the admin list`.** The one Draft is `Rope Basket Large`; all 17 Archived are Shopify's demo catalogue (15 snowboards + `Selling Plans Ski Wax` + `Gift Card`). **A merchant's catalogue here is 15 products.**

| # | Screen | Label, verbatim | Shows | Real |
|---|---|---|---|---|
| 1 | Home | `Store SEO score` … `/ 100` `across 14 products sampled` | **65** | sampled 14 of 15 non-archived |
| 2 | Home | `Your starting score, across the 14 products we sampled.` | **14** | 15 |
| 3 | Home | `Autopilot optimized 15 new products in the last 24 hours` | **15** | 15 created, but they were created ~24-36 h ago |
| 4 | Home | hero `30 products optimized · 0 drafts awaiting review` | **30** / **0** | **30 > the 15 that exist** |
| 5 | Home | card `Total Products` | **32** | 32 only if the 17 archived are counted |
| 6 | Home | `In your Shopify catalog · 14 active and draft products published to your online store` | **14** | active **+** draft = **15**; the label says "active and draft", the number is Active only — and "published to your online store" is a third, different population again |
| 7 | Home | card `AI Content Published` | **30** | **> the whole non-archived catalogue** |
| 8 | Home | `Products we have published content for` | — | |
| 9 | Home | card `Drafts Pending Review` / `Nothing waiting` | **0** | true at the time |
| 10 | Home | `Professional Plan` `19 / 4000 used` | **19 / 4000** | |
| 11 | Home | usage percent | **0%** | 19/4000 = 0.475% — shown as `0%` while 19 credits are spent |
| 12 | Home | `3981 of 4000 left this month.` | **3981 / 4000** | consistent with 11 |
| 13 | Home | Recent Activity ×5, each `3 content types · 4h ago` | **3** | |
| 14 | Home | Blog `0 published` · `6 draft` · `View all (6)` | **0 / 6 / 6** | consistent |
| 15 | Products | `32 products in your catalog` | **32** | see 5 |
| 16 | Products | `· 14 active and draft products published to your online store` | **14** | see 6 |
| 17 | Products | `· 30 with content published` | **30** | see 7 |
| 18 | Products | `· 0 ready to review` | **0** | |
| 19 | Products | `· 0 not yet optimized` | **0** | |
| 20 | Products | Activity tile `AI Content Published` | **30** | |
| 21 | Products | Activity tile `Drafts to Review` | **0** | |
| 22 | Products | Activity tile `Not yet optimized` | **0** | |
| 23 | Products | tab `All (15 on page)` | **15** | **correct** |
| 24 | Products | tab `Not optimized on this page (0)` | **0** | correct |
| 25 | Products | tab `Draft on this page (0)` | **0** | **wrong: `Rope Basket Large` IS a Shopify Draft and is on the page** — unless "Draft" here means *our* content draft, in which case the word collides with Shopify's own product status on the same row |
| 26 | Products | tab `Published on this page (15)` | **15** | correct |
| 27 | Products | `Select all 15 products` | **15** | correct |
| 28 | Products | `Showing 15 products` | **15** | correct |

- **The one-sentence version of that table: on the Products screen, inside a single viewport, the app states four different populations — `32 products in your catalog`, `14 active and draft`, `30 with content published`, and `All (15 on page)` — and the largest of them is bigger than the catalogue a merchant can see.** The list itself is right (979b25b); every count printed above it is not. `metrics.server.js` still has no product-status join, and that one query is the fix for rows 4, 5, 6, 7, 15, 16, 17, 20.
- **A second meaning-bug, found by changing the state: `AI Content Published` counts "published AND not superseded".** Generating six fresh drafts moved it **30 → 27 → 24** while nothing was unpublished — the live content on those six products is still live on the storefront. So the label is wrong in both directions: it over-counts archived products and under-counts products whose live content simply has a newer draft beside it.
- **CC — the row `Generate` control on `/app/products` has something painted over its centre point.** `document.elementFromPoint(x+w/2, y+h/2)` on the first Generate button returns a `DIV.Polaris-BlockStack`, **not** the button (`disabled:false, pointer-events:auto, visibility:visible, opacity:1`), and Playwright's actionability check times out on all 15 of them at 15 s each. A programmatic `.click()` works. Reported as observed, not diagnosed — but a control a real pointer may not be able to hit is worth ten minutes.
- **Also learned: `Generate` on a product row is a NAVIGATION, not an action.** It opens `/app/products/<id>`; the button that actually generates is `Generate Content` there. Harness written for it: `tools/proof/make-drafts-pending.mjs` (dev-store only, refuses `askebs`/`elitepeps`/`genful` by name).

- **TASK 4 — `contentpilot-dev2` IS NOW CAPTURE-READY. STATE FROZEN AS OF 2026-09-14 07:2x UTC.** Read back on fresh loads after the change:
  - **Review is no longer empty:** `/app/review` reads *"Review & Publish"*, *"6 products with draft content ready to review"*, *"0 of 6 approved"*, with `Approve all on this page` / `Clear selection` / `Reject 6 not approved` and per-product `Content quality: 90/100` + Description / Page title / Search description rows.
  - **Home reads** `Review 6 drafts` · hero *"Welcome back, Northline Supply!"* · *"24 products optimized · 6 drafts awaiting review"* · `Drafts Pending Review 6 — Ready to publish` · `Monthly Usage 25 / 4000 used · 1% · 3975 of 4000 left this month`.
  - **Products reads** `… · 24 with content published · 6 ready to review · 0 not yet optimized` with a `Review 6 drafts` action.
  - **The six with drafts pending:** Bamboo Chopping Board · Beeswax Food Wrap Set · Brass Watering Can 1.5L · Cast Iron Skillet 26cm · Ceramic Pour-Over Coffee Dripper · Cotton Waffle Bath Towel. Nine products remain fully published. Nothing was approved, rejected or published; the catalogue itself was not touched.
  - **Greeting:** correct on every path read on this store — Home hero, and the admin badge, both say **Northline Supply**. The nameless *"Welcome back!"* is **frame 04's problem, on a different store** (`navaal-ttv-02` / `navaal-qa-fresh`), and cannot be fixed from dev2. That frame is still an owner decision.
  - **CAPTURE WINDOW — NOBODY MUTATES `contentpilot-dev2` UNTIL CW POSTS `CAPTURE COMPLETE`.** No probes, no harness runs that click, no generate, no approve, no publish, no settings edits, no installs or uninstalls, by any worker. The last set was stale by one product because another worker's probe ran mid-capture. Read-only harnesses (`read-screen.mjs`, `screen-numbers.mjs`) are fine. CW will capture inside this freeze as soon as CC posts the Part B sha, and will post `CAPTURE COMPLETE` to release it.

- **TASK 6 — SWEEP, 2026-09-14. Editor CLEAN; the public page still carries Shopify's stale billing badge, unchanged.** Fetch-sanity first, both halves. *Editor:* 54 non-empty fields, 3,318 characters read. Expect-0: `save 17%` **0** · `7-day` **0** · `7 day` **0** · `A/B variant testing` **0** · `Priority support` **0** · `ai content generations` **0** · `Dedicated account manager` **0** · `SLA support` **0**. Expect-1: `Two description options to compare` **1** · `Email support from the founder` **1**. The only superlative-list hit was `first` ×2, both benign and quoted here so nobody re-flags them: Subtitle *"…you approve it first"* (sequence) and one inside the reviewer `Instruction notes`. Lengths: App name **25** (≤30) · Introduction **86** (≤100) · App details **449** (≤500) · Features **58 / 69 / 74 / 60 / 63** (all ≤80). Search terms: **exactly 5**, `product descriptions`, `meta tags`, `seo audit`, `alt text`, `ai visibility` — §4 verbatim. *Public page* (`apps.shopify.com/navaal-ai-seo-geo-content`, cache-busted, **200**, 200,670 bytes, 117 × "Navaal"): `save 17%` **3** · `7-day` **3** · `299.90` **1** · `799.90` **1** · `95.90` **0** · `287.90` **0** · `14-day` **3**. **Identical to the last reading. This is the Task-1 side-effect baseline: after a real app-version release these must go to 0 / 0 with nobody editing a field, and 95.90 / 287.90 / 767.90 must appear.** One new item: the editor flags the **Subtitle** field with *"Review the updated guidance for this field and refresh your content."* and it sits at **62/62**, at the cap.

- **TASK 7 — THE ACHIEVEMENT IS REAL, BUT THE PARTNER DASHBOARD DOES NOT EXPOSE IT. There is no criteria page to read; only the BFS checklist exists.** Checked `partners.shopify.com/4937813/apps/368479600641/distribution` and `/overview`: the strings `achievement`, `visibility` and `merchant surfaces` appear **zero** times on either, and the app's whole left nav is `Overview · API access requests · Distribution · App history`. The criteria below therefore come from **shopify.dev's own Built for Shopify page** (fetched 200, 373,677 bytes, 105 × "Built for Shopify"), under *Other achievements*, and the state beside each is what CW could read elsewhere — **not** a dashboard status, and it must not be recorded as one.

  Verbatim, the achievement: *"Shopify surfaces apps to merchants in many ways. Increased visibility makes your app more visible, and more likely to be installed by merchants. When you earn this achievement, you'll get a search ranking boost, and become eligible for promotion on key merchant surfaces, including: The first collection in the App Store homepage · The Shopify admin `Picked for you` modal · App recommendations in Sidekick"* — followed by *"These surfaces are personalized for each merchant, so your app isn't guaranteed to appear."*

  | Criterion (all listed **Mandatory**) | State CW can read | Where from |
  |---|---|---|
  | Good Partner standing | **Not exposed anywhere CW can see.** No infraction notice on Distribution or Overview | — |
  | Meets App Store requirements | **Not exposed.** Our own sweep is the only proxy, and it is clean today | Task 6 above |
  | (Storefront apps only) Uninstalls cleanly: uses theme app extensions | **✅ met** — BFS checklist row `Uses theme extensions to add storefront functionality` carries a green tick | Distribution |
  | Minimizes impact on checkout speed | **Not exposed.** The BFS checklist has no checkout row at all; its nearest row is `Minimizes impact on storefront loading speed`, which carries the **clipboard** (manual-review) glyph | Distribution |
  | Minimum number of installs | **6** cumulative net installs. The doc does not publish this achievement's threshold; BFS's own is **50** | Partner Overview, last 30 days |
  | Minimum number of reviews | **0** — `Latest merchant feedback: -`. BFS's own threshold is **5** | Partner Overview |
  | Minimum app rating | **none — no rating exists yet.** BFS's own threshold is **4+ stars** | Partner Overview |

  **The honest read for the owner: this rung is NOT a way around the manual design review — it is gated on the same three merchant-utility numbers that gate BFS, and we are at 6 installs, 0 reviews and no rating.** Two of its seven criteria (`Good Partner standing`, `Minimizes impact on checkout speed`) have no surface in the dashboard at all, so we cannot know our state on them without applying. The doc's own words: *"Most criteria … are automatically evaluated, while others require you to apply for evaluation."*

- **BFS checklist, re-read 2026-09-14 with the glyphs, since it is the only page that reports state.** *Performance:* ⭘ `Meets benchmarks for 2025 Core Web Vitals` — ✅ `Largest Contentful Paint (LCP) < 2.5 seconds`, ✅ `Cumulative Layout Shift (CLS) < 0.1`, ⭘ `Interaction to Next Paint (INP) < 200 milliseconds: Not enough data`; 📋 `Minimizes impact on storefront loading speed`. *Design and functionality:* ✅ `Is embedded in the Shopify admin`, ✅ `Uses theme extensions to add storefront functionality`, 📋 `Is a well integrated app`, 📋 `Uses Shopify design guidelines`, 📋 `Doesn't use Asset API`. *Category-specific:* **"Shopify hasn't assigned your app to a specific category."** *Merchant utility:* ⭘ `Minimum 50 net installs from active shops on paid plans`, ⭘ `Minimum 5 reviews since launch`, ⭘ `Rating of 4+ stars in the Shopify App Store`. Footer verbatim: **`All automated criteria based on data from last 28 days, unless noted. Checked daily around 17:00 UTC`**.

- **P0 BLAST RADIUS JUST GREW — read off Partner Overview, same session. `Merchants with your app: 8`, up from 5 on 2026-09-10.** Latest app history: **`September 12, 2026 at 3:43 am — Peter Shops — Installed`**, plus `September 11 1:56 am Harbourline Goods`, `September 11 1:44 am Zephyrine Wynter`, `September 10 4:07 pm EBS Bathroom and Plumbing Supplies`, and `September 10 9:00 pm REDACTED — Subscription charge expired — Starter Plan - $9.99 USD (Test)`. **`Peter Shops` is not one of ours** — not a `navaal-ttv-*`, not `navaal-qa-fresh`, not `contentpilot-dev2`, not EBS. Treat the unescaped-FAQ population as **at least three** non-test shops, not two, until somebody counts it properly. 30-day totals: **26 installs · 20 uninstalls · 6 cumulative net installs**, with **16 of the 20 uninstalls same-day**, `$0.00` across every charge type.

- **TASK 1 — THE RELEASE IS REAL AND THE P0 IS CLOSED ON ROUTE 0a. THE BILLING HALF OF IT IS NOT. Read 2026-09-14 ~07:05 UTC, unprompted by any queue post — the Versions page was re-read mid-session and the new version was already there.** Active version is now **`p0-xss-f505584`**, description *"faq_visible.liquid escaped (7942c30); billing display 95.90/287.90/767.90, 14-day trial"*. Verbatim from its detail page (`/versions/1127530758145`): **`Released  September 14, 2026 at 6:46 am +0000`** / **`Created  September 14, 2026 at 6:46 am +0000`**. That is **newer than `navaal-seo-geo-content-15`** (which is now second in the list and no longer Active) and **4 days 19 h 19 m after the 11:26:53 UTC 9 Sep fix commit**. `git merge-base --is-ancestor 7942c30 f505584` → **YES**, and `git show f505584:extensions/geo-schema/blocks/faq_visible.liquid` carries `| escape` on the heading, `qa.name` and `qa.acceptedAnswer.text`. **Scopes still `write_content,write_products` and the extension UID is still `6470d60a-…1bab4ee4`, so no re-consent and no deep-link breakage.** The escaped liquid is now the one Shopify serves.
- **TASK 1.2 — SIDE-EFFECT READ: FAILED. The release did NOT carry the billing config. This is a finding, not a wait.** Public listing re-fetched cache-busted 19 minutes after the release (**200**, 201,030 bytes, 117 × "Navaal" — sanity first): `save 17%` **3** · `7-day` **3** · `299.90` **1** · `799.90` **1** · `95.90` **0** · `287.90` **0** · `767.90` **0**. Identical to the pre-release baseline on every one.
- **TASK 1.3 — PRICING DETAILS, and it is the editor that settles it, not the CDN.** On a **fresh load** of the listing editor, the three read-only plan rows still say, verbatim: **`$9.99/month or $99.90/year, 7-day trial`** · **`$29.99/month or $299.90/year, 7-day trial`** · **`$79.99/month or $799.90/year, 7-day trial`**. In the whole editor page: `95.90` **0**, `287.90` **0**, `767.90` **0**, `14-day` **0**, `7-day` **3**. So this is not App Store page caching — **Shopify's registered billing metadata is unchanged**, and `$99.90` on $9.99/month is a 16.7% discount, which is exactly where the public page's `save 17%` comes from. **Whatever CC changed, it did not reach the place these three lines are read from. Releasing another version will not fix it by itself — the next step is to find out what actually writes them, because the app-version theory has now been tested once and did not hold.**
- **TASK 1.4 — 0b STILL BLOCKED, unchanged.** `https://contentpilot-dev2.myshopify.com/products/bamboo-chopping-board` still 302s to `/password` (**200**, 11,747 bytes, 4 × "password", 0 × `navaal-faq`). The storefront-side read is one owner action away: enter the storefront password once in the Chrome CW drives, or turn password protection off on a dev store. **Until then the escape is proved by provenance (0a), not by a rendered page — and that distinction stays in writing.**

## PHASE 7 — CW, second pass, 2026-09-14

- **TASK 1 / H12b — DONE. THE THREE PRICE CARDS ARE EDITED, SAVED, AND LIVE. The public page cleared inside 20 seconds, which also settles what the price's "third home" actually is.** The cards live at `apps.shopify.com/services/pricing/<client_id>/<plan-handle>` — reached from the listing editor's `Edit` link on each plan, one page per plan (`/starter`, `/growth`, `/professional`). Each page has exactly **six** fields: `Internal plan handle` (disabled — *"Used in code to identify merchant plans. Can't be changed later."*), a `This plan has additional charges, such as usage fees or commissions` checkbox (unchecked, left alone), `Billing` (`Monthly recurring, with yearly discount`), `Monthly charge`, `Yearly charge`, `Free trial duration`. **Two fields changed per plan; nothing else touched. Monthly charges, the Free plan, and every credits/feature line left exactly as H12 set them.** Read back on a fresh load of the listing editor, verbatim:
  - **`$9.99/month or $95.90/year, 14-day trial`**
  - **`$29.99/month or $287.90/year, 14-day trial`**
  - **`$79.99/month or $767.90/year, 14-day trial`**
  Editor counts on that fresh load: `99.90` **0** · `299.90` **0** · `799.90` **0** · `7-day` **0** · `95.90` **1** · `287.90` **1** · `767.90` **1** · `14-day` **3**. Public page, cache-busted ~20 s after the last save (**200**, 201,033 bytes, 117 × "Navaal" — sanity first): `save 17%` **0** · `7-day` **0** · `99.90` / `299.90` / `799.90` **0** · `95.90` **1** · `287.90` **1** · `767.90` **1** · `14-day` **6**.
- **ONE THING I COULD NOT DO, AND IT IS NOT A FAILURE — THE DISCOUNT BADGE IS DERIVED, NOT TYPED.** There is **no 17% field** anywhere on those three pages; the badge is computed by Shopify from `Monthly charge` × 12 against `Yearly charge`. `$9.99 × 12 = $119.88` against the old `$99.90` is 16.7%, which is where `save 17%` came from. With the correct annual prices in place the same computation now prints **`save 20%` ×3** on the public page. It cannot be suppressed, only made true — and 20% is exactly what `14-PRICING.md` §4 states (*"Annual — 20% off"*). **`save 17%` is gone for good; if a future sweep sees `save 20%`, that is correct output, not a regression.** Add `save 20%` to the sweep as an **expect-3-on-the-public-page**, and keep `save 17%` at expect-0.
- **And the app-version theory is now conclusively dead.** Version `p0-xss-f505584` (released 06:46 UTC) moved these numbers by zero, over 19 minutes. Typing them moved them in seconds. **The price's third home is the Partner pricing card, full stop** — not `shopify.app.toml`, not the app version, not a deploy. `07-VERIFICATION.md` #12 should say so plainly.

- **TASK 3 / B8 — CLOSED. THERE IS NO REAL CHARGE, AND THE ACTIVE PROFESSIONAL SUBSCRIPTION IS OUR OWN DEV STORE ON A TEST CHARGE.** The subscription in our database is, verbatim from App history: **`August 27, 2026 at 5:19 pm — contentpilot-dev2 — Success Subscription charge activated — Professional Plan - $79.99 USD (Test). Subscription ID: 26009600103`**, with **no cancel and no expire event after it** — which is exactly why it is still active in our DB, and it is why Home on dev2 reads `Professional Plan · 4000` credits. Corroboration, all three read today: **`Total earnings to date $0.00 USD`** and `$0.00` across one-time / recurring / usage / application credits on Partner Overview; the **Payouts page (`/4937813/payments`) renders only the promotional splash — no transaction list at all**; and every charge event in the whole App history for any store that is not ours carries **`(Test)`**.
- **The one nuance worth writing down, because a future reader will hit it and panic.** 16 charge rows in App history do **not** carry the `(Test)` marker — `Growth Annual - $299.90 USD`, `Professional Annual - $799.90 USD`, `Professional Plan - $79.99 USD`, `Growth Plan - $29.99 USD` and so on. **Every one of the 16 is on `contentpilot-dev2` (9) or `contentpilot-test` (7)** — both our own development stores — and all are June–August `Subscription charge expired` events predating the per-shop test-mode work that shipped in `navaal-seo-geo-content-13`. **Zero unflagged charges on any other store, and zero charge events of any kind for the real merchants.** Shopify does not bill a development store, and earnings are $0.00, so no money has ever moved. **B8 closes; the OWNER-CHECKLIST item goes away.**

- **TASK 2 — THE MERCHANT LEDGER. 21 stores in the whole life of the app. Two real merchants have it installed today.** Read from App history, all pages back to `contentpilot-dev2 — June 1, 2026 — Installed`, i.e. the beginning. **TIMEZONE WARNING, and it caught me: this page renders in LOCAL time (AEST, +10), unlike the Versions page which prints `+0000`.** Proof: the queue records `navaal-ttv-01` (renamed **Harbourline Goods**) installing at **15:56:34 UTC on 10 Sep**; this page shows it as **`September 11, 2026 at 1:56 am`**. Every time below is AEST. **Do not mix these two pages' timestamps without converting.**

  **OURS (6 installed today):** `contentpilot-dev2` (Northline Supply) · **Harbourline Goods** (= `navaal-ttv-01`) · `Navaal TTV 02` · `Navaal TTV 03` · `Navaal TTV 05` · **EBS Bathroom and Plumbing Supplies** (the owner's own commercial store, installed 10 Sep 4:07 pm).
  **OURS, uninstalled:** `Navaal TTV 04` (installed 10 Sep 1:52 pm, uninstalled 2:39 pm) · `Navaal QA Fresh` (four install/uninstall cycles, last uninstalled 10 Sep 2:21 pm) · `Navaal test 2` · `contentpilot-test`.
  **SHOPIFY'S, NOT MERCHANTS:** `app-review-85870b77-r92361-a0` and `app-review-85870b77-r78944-a0` (the App Store reviewers' stores — both end in `Store closed`) · `Mars Canada Store` · `Mars Japan Store` · `Mars US Store` · `Ace Test Store UK` · `appstoretest4` (installed and uninstalled inside one minute, 13 Aug, pre-launch).
  **REAL:**
  | Store | Installed (AEST) | Installed (UTC) | Still installed? |
  |---|---|---|---|
  | **Zephyrine Wynter** | 11 Sep 1:44 am | **10 Sep 15:44** | **YES** — no uninstall event |
  | **Peter Shops** | 12 Sep 3:43 am | **11 Sep 17:43** | **YES** — no uninstall event |
  | **Hoodify** | 9 Sep 5:42 am | **8 Sep 19:42** | **NO** — uninstalled 9 Sep **5:43 am**, reason *"Testing multiple apps"* |
  | `REDACTED` | install not in history | — | **NO** — uninstalled 8 Sep 4:06 pm; its `Starter Plan - $9.99 USD (Test)` sub (ID 30195777692) expired 10 Sep 9:00 pm. Shopify scrubs the name when a store closes, and the charge is flagged Test, so this is most likely a reviewer or test store, **not a merchant — but it cannot be proved either way from this page.** |

  **THE THREE INTEGERS:**
  1. **Real merchants currently installed: 2** — Zephyrine Wynter, Peter Shops.
  2. **Real merchants who ever installed: 3** — those two plus Hoodify. (4 if `REDACTED` was real; unprovable.)
  3. **Real merchants who uninstalled: 1** — Hoodify, **one minute** after installing.
  **THE LEDGER RECONCILES TO SHOPIFY'S OWN COUNTER, which is the check that makes it trustworthy: 6 ours + 2 real = 8, and Partner Overview reads `Merchants with your app: 8`.** So the scoreboard's "real merchants" metric is **2**, not 8 and not 0.
- **P0 EXPOSURE POPULATION, stated precisely.** The unescaped `faq_visible.liquid` was what Shopify served from **9 Sep 04:34 UTC** (v15 released) to **14 Sep 06:46 UTC** (`p0-xss-f505584` released). Real merchants installed **inside that window**: **Zephyrine Wynter** (10 Sep 15:44 UTC) and **Peter Shops** (11 Sep 17:43 UTC). **Hoodify installed and uninstalled on 8 Sep, before v15 was even released, and had the app for one minute.** Plus EBS, which is ours. **So the honest exposure number is two real merchants plus EBS — and it is still unknown whether any of them ever placed the FAQ app block on a theme, which CW cannot see.** A5's count of pre-fix `contentclaude.faq_schema` values containing markup is still the number that decides disclosure.

- **TASK 4 — THE SUBTITLE FLAG IS A GUIDANCE-CHANGED PROMPT, NOT A VIOLATION NOTICE. Subtitle NOT rewritten.** The link behind *"Follow the app card subtitle guidelines"* is `https://shopify.dev/apps/store/requirements#1-app-card-subtitle`, and the rule it lands on is now numbered **4.4.1**. Verbatim, whole rule: *"**Write effective app card subtitles.** The app card subtitle helps merchants to quickly understand what your app does, and what sets it apart from others. Summarize your app in a concise phrase, and explain the value of your app. Don't add keywords to your subtitle with the intent of improving search performance. Don't use personal merchant information without consent from the merchant. **Don't include any data or statistics.** Share this information on your website and landing pages instead."* Fetched 200, 557,624 bytes, 3 × "app card subtitle" — sanity first. **No character limit is stated anywhere in the requirements document**; the editor's own `62/62` counter is the only limit visible, and our subtitle sits exactly on it.
  Our live subtitle, verbatim: **`Content Google ranks and ChatGPT quotes — you approve it first`** (62). Against 4.4.1 it carries **no statistic, no merchant data, and no keyword padding**, so CW found nothing to route. **One judgement call left for Cowork, not decided here:** it names two third-party products (Google, ChatGPT). The requirements document's brand rule (4.4.3) covers *Shopify's* trademarks in graphics and the naming rule covers the **app name**, not the subtitle — so there is no rule against it that CW can find. Flagging it only so the decision is deliberate. **Approved copy comes from `12-OFFER.md`, so if it changes, it changes there first.**

- **TASK 6 — SWEEP, post-edit. Editor CLEAN, public page now CLEAN for the first time.** Fetch-sanity first on both. *Editor, fresh load:* 54 non-empty fields, 3,264 characters. `save 17%` **0** · `7-day` **0** · `99.90` / `299.90` / `799.90` **0** · `A/B variant testing` **0** · `Priority support` **0** · `ai content generations` **0** · `Dedicated account manager` **0** · `SLA support` **0** · superlatives **0**. Expect-1: `Two description options to compare` **1**, `Email support from the founder` **1**. (`first` ×2, flagged and cleared as benign in the first pass — *"you approve it first"* and the reviewer notes — is unchanged.) Lengths: App name **25** (≤30) · Subtitle **62** (62 cap) · Introduction **86** (≤100) · App details **449** (≤500) · Features **58 / 69 / 74 / 60 / 63** (≤80). Search terms **exactly 5**, §4 verbatim. *Public page:* the numbers in the H12b row above. **New standing expectation: `save 20%` = 3 on the public page is CORRECT.**
- **Mid-session re-reads, as required.** `/api/build-info` moved three times while CW worked: `e67bf22` (06:41:38Z) → `0c37d80` (07:01:35Z) → **`3e1c161` (07:28:30Z)**. Versions page re-read at 07:29Z: still **`p0-xss-f505584` Active, "43 minutes ago"**, no newer version. **CC is deploying code fast; no second app version has been cut, and none is needed for the pricing — that is now proved.**
- **`contentpilot-dev2` REMAINS FROZEN. Nothing in this pass touched it.** 6 drafts still pending, capture state unchanged, capture window still open until CW posts `CAPTURE COMPLETE`.

## PHASE 7 — CW, third pass, 2026-09-14

**Claim vs screen, before anything else.** (1) **CC's Part B readings are NOT in the queue.** The
brief said they were at the end of it; `grep` for `Part B`, `3e1c161`, `cad2f10`, `e40aee6` returns
only CW's own rows. CW verified Part B by reading the screens instead. (2) **Part B's greeting fix
is NOT universal** — see **F1**. (3) Production moved five times while CW worked: `e40aee6`
(07:34:18Z) → `34f2bb4` (08:02:29Z) at 08:12Z.

### TASK 2 — **CAPTURE NOT RUN. Two blockers, one of them the same one that killed the last set.**

`contentpilot-dev2` **passes the gate on every condition the brief named**, read at 08:0xZ on `e40aee6`:
`15 products in your catalog · 14 active and draft products published to your online store · 8 with
content published · 6 ready to review · 0 not yet optimized · **17 archived not shown**`; tiles
`8 / 6 / 0`; tabs `All (15 on page) · Not optimized (0) · Draft (6) · Published (9)`; Home
`Total Products 15 — In your Shopify catalog · 14 active and draft … · 17 archived not counted`,
`AI Content Published 8 — of your 14 active and draft products … · 24 since you installed`,
`Drafts Pending Review 6 — Ready to publish`, hero `8 products optimized · 6 drafts awaiting review`,
greeting **`Welcome back, Northline Supply!`**. **No count exceeds the catalogue. Part B is real
here and the 28-row table's "Real" column is satisfied.** CW did not capture anyway, because:

- **BLOCKER A — frame 04 would carry a test store name in the app hero.** See F1: the app greets
  `Navaal QA Fresh` on a store Shopify itself now calls `Northline Supply`. Capturing it reproduces
  exactly the H7 defect (admin badge and app hero disagreeing, test word in frame).
- **BLOCKER B — the Products frames would show nine `Live` badges beside a tile reading `8`.**
  Counted off the rows: 6 are `Ready to review`, **9 are badged `Live`**, and `AI Content Published`
  reads **8**. Both are internally defensible — the tile's label says *"of your 14 active and draft
  products **published to your online store**"* and **`Rope Basket Large` is a Shopify DRAFT**, so
  it is excluded from 8 — **but the app badges that product `Live` when its storefront page does not
  exist.** A listing image showing nine `Live` badges and an `8` is a listing image that lies.
  **One row badge is the whole fix.**

### TASK 1 — THE FIRST RUN, WALKED. Full write-up: `docs/history/screen-reads/first-run-qa-fresh-2026-09-14.md`

**Two changes were made to `navaal-qa-fresh` and are declared here**: it had **zero products**, so
it was **renamed** `Navaal QA Fresh` → **`Northline Supply`** and **stocked with 12 products**
(`stock-northline.mjs`, no descriptions — the honest input state). **The rename happened AFTER the
install, which is what exposed F1.**

**Times.** Install click **07:38:48.7Z** → first app screen **~07:39:5xZ** = **~65 s**, and that is
inflated by this agent's round-trips between clicks; the page transitions were a few seconds each.
**App opened with products **07:52:14.9Z** → first finished draft on screen **~07:52:35Z** = **~20
seconds**.** That is the time-to-value number for the scoreboard, and it is good.

**THE CONFUSION LIST — CC, this is the P2.7 input.**

- **F1 — THE GREETING IS CAPTURED AT INSTALL AND NEVER REFRESHED. Still true at `e40aee6`.** The
  store was renamed **after** install. Twenty minutes and five page loads later the app still says
  **`Welcome back, Navaal QA Fresh!`** while Shopify's own admin badge directly above says
  **Northline Supply**. Part B was reported as taking the name from Shopify; on the rename-after-
  install path it does not. **This is the frame-04 blocker, now reproduced from a clean install with
  the trigger isolated.**
- **F2 — `Welcome back` on a first visit.** First run, never been here, greeted as returning.
- **F3 — THE FIRST SCREEN SAYS THREE DRAFTS ARE READY AND THE REVIEW SCREEN SAYS THERE ARE NONE, FOR
  MINUTES.** Drafts finished ~07:52:35. `/app/review` at ~07:55 **and again** at ~07:56:
  *"Nothing to review — you're all caught up. Generate content from the Products page, then come
  back here to review and publish."* Same URL at **07:59: "3 products with draft content ready to
  review."** The screen the app sends you to is empty right after it tells you to go there, **and its
  empty state tells you to generate content you already have.**
- **F4 — EVEN AFTER REVIEW CATCHES UP, TWO OF FOUR COUNTERS STILL READ ZERO.** Same minute,
  `e40aee6`, `navaal-qa-fresh`: `/app/review` **"3 products with draft content ready to review"** ·
  `/app` **`Drafts Pending Review` 0 · "Nothing waiting"** and hero **"0 products optimized · 0
  drafts awaiting review"** · `/app/products` header **"0 ready to review · 12 not yet optimized"** ·
  `/app/products` tabs **`Draft on this page (3)`**. **On `contentpilot-dev2`, whose drafts were made
  from the Products page, all four agree — so this is specific to the drafts the FIRST RUN writes.**
- **F5 — `generations` on the first screen, `credits` everywhere else.** First screen: *"3 of your
  **100 remaining free generations** this month."* Plans page, Home, listing and `14-PRICING.md` §4
  all say **credits**, and §1 bans mixing the two because credits are weighted. **The first sentence
  a merchant ever reads about cost uses the banned unit.**
- **F6 — the headline score is silently one of the two numbers under it.** `Your store scores
  **21**/100`, then `**21** AI search (GEO)` and `**10** Traditional SEO`. Traditional SEO is
  excluded from the headline with no label saying so.
- **F7 — a large red failing score is the first thing anyone sees**, above any explanation. Honest,
  and the least usable possible listing frame.
- **F8 — `Now 21/100` is printed on every product row.** It is the store score. It reads as the
  product's.
- **F9 — reloading re-announces `Writing 3 drafts now — that uses 3 of your 100 remaining free
  generations`.** Usage stayed at 3/100 so nothing was re-billed, **but the merchant cannot know
  that.** CC: confirm whether reload re-generates or only re-renders.
- **F10 — `Optimize store (12) · Starter` on a Free-plan store** whose Home says `Free Plan`.
- **F11 — Products header vs its own tabs:** `12 not yet optimized` against `Not optimized on this
  page (9)` + `Draft on this page (3)`, one viewport.
- **F12 — `Monthly Usage` on Home, `Monthly Generations` on Products.** Same number, two labels, one
  banned unit.
- **F13 — the row `Review` button does not open a review screen.** A draft row badged
  **`Ready to review`** with a **[Review]** button opens `/app/products/<id>` — the *generate* page
  (`Generate Content` / `Regenerate Content` / `Select what to generate`). **No approve or publish
  control exists on it.**
- **F14 — `3 / 100 used` renders as `3%`; `19 / 4000` on dev2 renders as `0%`.** Integer rounding
  makes real spend read as none.
- **F0 — an empty store dead-ends.** With zero products the whole first screen is *"Add a product
  and we'll get started"* + **[Add a product in Shopify]**, which leaves the app. Nothing brings the
  merchant back. Verbatim, 377 characters, no greeting at all on that path.

**What was NOT wrong, and should be said:** the generated copy is specific and good; the scope
screen is plain; the Plans page matches `14-PRICING.md` §4 exactly and uses **credits** correctly;
the FAQ setup card is unusually honest (it states publishing alone does not make the FAQ live, and
that Google retired FAQ rich results in May 2026).

**THE FOURTH HOME OF THE PRICE — READ, AND IT IS CORRECT.** Shopify's own approval page, reached by
`Upgrade to Growth`, title `Northline Supply · Approve subscription · Shopify`, verbatim:
*"**Your next bill** — **You have a 14-day free trial ending on Sep 28.** — Subtotal *plus any
applicable taxes* **$29.99** — Total *Due Sep 28* **$29.99** — [Approve] … **Growth Plan** —
Subscription details **$29.99 USD every 30 days** — You don't have any payment methods on file."*
**`billing.request()` is correct; `TRIAL_DAYS = 14` reaches Shopify. NOTHING WAS APPROVED** —
harness `tools/proof/read-charge-page.mjs` stops at that page by design.
**And a tooling note that matters for every future session: the Chrome extension's clicks and
scrolls DO NOT REACH the app's cross-origin iframe.** Three clicks on `Upgrade to Growth` did
nothing; the same click driven by Playwright worked first time. The earlier "Generate button has
something painted over it" and "the iframe will not scroll" findings are the same cause. **Drive the
app frame with Playwright, not the extension.**

### TASK 3 — BOTH REAL MERCHANTS ARE PRE-LAUNCH. NEITHER STOREFRONT IS PUBLIC.

Domains from each store's Partner page (no admin, no login, no contact; the owner emails on those
pages are deliberately NOT copied here).
- **Zephyrine Wynter — `zephyrin-wynter-a01g3uy4.myshopify.com` — United Kingdom.** `/` returns
  **200 but redirects to `/password`** (11,747 bytes, *"This store is password protected"*).
  `products.json` returns the same password page. FAQ block: **could not read.** Product content:
  **could not read.** Only app installed: ours.
- **Peter Shops — `peter-shops-2.myshopify.com` — China.** `/` **200 → `/password`** (11,737
  bytes). Same on `products.json`. FAQ block: **could not read.** Only app installed: ours.

**Both real merchants are brand-new, unlaunched stores with our app as their ONLY installed app.**
Three consequences: (1) the P0 could not have reached a shopper even had markup existed — no public
page; (2) **whether any real merchant uses the theme extension is unanswerable from outside, so
Phase 2 must not lean on it**; (3) the install cohort is pre-launch store builders, not established
merchants — which is who P2.7's 60-second first run is actually for.

### TASK 4 — RANKING BASELINE, 2026-09-14 ~08:05Z. **NOT ON PAGE 1 FOR ANY TERM.**

Read in a rendered browser — **`curl` returns a 99 KB shell with zero app cards on every query, so a
curl-based rank check is a guaranteed false green.** Detector sanity: searching **`navaal`** puts us
at **slot 1 of 66** — the detector works, so every "not found" below is real.

| Query | Apps matching | Cards on page 1 | Navaal |
|---|---|---|---|
| `seo audit` | 3,126 | 70 | **not in first 70** |
| `product descriptions` | 7,122 | 72 | **not in first 72** |
| `meta tags` | 5,464 | 66 | **not in first 66** |
| `alt text` | 4,635 | 68 | **not in first 68** |
| `ai visibility` | 4,574 | 70 | **not in first 70** |
| `seo` | 6,925 | 67 | **not in first 67** |
| `ai seo` | 6,990 | 70 | **not in first 70** |

**SEO category — `apps.shopify.com/categories/store-design-site-optimization-seo/all`, "Best SEO
Apps For 2026", 1,111 apps: not in the first 66 cards.** The first three slots are **Ads**
(`AltTextLab – AI Alt Text & SEO`, `StoreSEO AI SEO Optimizer` 747 reviews, `SEO Buddy: AI Rich
Results` 18 reviews). First three **organic**: **`Judge.me Product Reviews App` 46,891 reviews** ·
**`SEOLab: All in #1 SEO — AI SEO` 2,613** · **`Smart SEO AI & Image Optimizer` 953`**. We have
**0**. That is the gap in one line.
**Worth knowing:** the public listing DOES show `Categories: SEO`, while the BFS checklist says
*"Shopify hasn't assigned your app to a specific category."* Those are two different things — a
displayed category versus a BFS category-criteria assignment — not a contradiction, but easy to
mistake for one. Listing also shows `Launched September 8, 2026 · Greenacre, NSW, AU`.

### TASK 5 — `/terms` IS OUT OF DATE AND CONTRADICTS THE LISTING, THE PLANS PAGE AND SHOPIFY'S OWN CHARGE SCREEN. Nothing edited.

Both pages 200 (privacy 25,176 B, terms 19,708 B; sanity counts taken first). Terms
`Last updated: 8 July 2026` — **before the pricing lock**. Privacy `4 September 2026`.
**TO CC (facts, and the pages are generated so a hand edit would drift):**
- **T1 — §4: *"Paid plans include a `7-day free trial`."*** Everything else says **14 days**,
  including Shopify's own charge page. **The contract is the last place still saying 7.**
- **T2 — §3 table: *"Free — $0 — `25 generations per month`"*, and the closing CTA: *"`25
  generations a month`, no card required."*** Live Free allowance is **100 credits / month**.
  **Wrong by 4×, in the contract, twice.**
- **T3 — §3 gives no numbers for the paid tiers**: *"Higher monthly limit for growing stores"*,
  *"For active catalogues optimising regularly"*, *"For large catalogues and Autopilot at scale"*.
  A merchant cannot learn their limit (500 / 1,500 / 4,000) from the Terms at all.
- **T4 — §3: *"Annual billing … is charged at a rate equivalent to `ten months for twelve (two
  months free)`."*** Ten-for-twelve is **16.67% — the old `save 17%` maths**. The locked table and
  the live listing are **20%**. **The Terms enshrine the discount we removed this morning.**
- **T5 — §5 uses `generations`** and describes an allowance *"framed around producing complete,
  optimised products per month"* — a model we do not use.
- **T6 — §1 presents Autopilot as a general capability**; it is Growth-and-above.
- **T7 — THE BYO ANTHROPIC KEY IS DISCLOSED NOWHERE.** Professional's live feature line is *"Your
  own AI key — no credits used"*. Neither Terms §8/§9 nor the Privacy Policy's *"How we use AI"*
  section mentions a merchant-supplied key: who holds it, whether it is encrypted, whose terms
  govern those calls, what happens to it on uninstall. **The brief asked me to confirm it was there.
  It is not, in either document.**
- **T9 — the Privacy Policy names the wrong database host.** *"Data … is stored in PostgreSQL
  databases hosted on `Fly.io`, with Redis used for background job queues."* Our own queue records
  the production database as **Neon** (*"Neon history retention → 7 days"*, 2026-09-10). **If it is
  Neon, the subprocessor list is both wrong and incomplete** — Neon is unnamed, and Redis is named
  with no host. CC: confirm which, then fix the generator.
- **T10 — Privacy *"What data we store"* says `how many generations you have used`.** Same unit
  collision as F5/F12.
- **T11 — Privacy asserts the customer-data claim at two different strengths**: *"The App stores no
  customer personal data of any kind"* and, later, *"We do not store your customers' personal data
  `as part of the App's normal operation`."* The absolute version is the risky one.
**TO COWORK/OWNER (decisions, not facts):**
- **T8 — two support addresses.** Both legal pages say **`support@navaal.ai`**; the app footer, the
  listing's contact field and the plans page say **`hello@navaal.ai`**. A reviewer comparing them
  sees a mismatch. **Pick one.**
- **T12 — Bilby scan reports have no retention limit:** *"Reports are the product — they are not
  deleted on a schedule."* Honest, but a reviewer looking for a retention period finds "none".
  A stated maximum would cost nothing.
**What is good and should not be touched:** company identity, ABN, postal address, governing law
(NSW), the two-scope explanation, the Anthropic no-training statement, the three GDPR webhooks with
the 48-hour `shop/redact` deletion, the named subprocessor list, the beacon's 13-month retention,
and §7's explicit **"No results guarantee"** — which is exactly the doctrine, written into the
contract.

### TASK 6a — ADMIN PERFORMANCE, window **Sep 7 – Sep 14**. INP is no longer "Not enough data".

| | p75 | Grade | Loads, day by day (Sep 7→14) | Total |
|---|---|---|---|---|
| **Largest Contentful Paint** | **877 ms** | Good | 0 · 11 · 31 · 14 · 0 · 0 · 2 · 18 | **76** |
| **Interaction to Next Paint** | **40 ms** | Good | 0 · 5 · 0 · 8 · 0 · 0 · 2 · 11 | **26** |
| **Cumulative Layout Shift** | **0.02** | Good | 0 · 11 · 31 · 14 · 0 · 0 · 2 · 18 | **76** |

Against the 2026-09-10 read (LCP 1,130 ms / 51 · INP 24 ms / 12 · CLS 0.02 / 51): **LCP improved
1,130 → 877 ms and INP now reports a p75 instead of "Not enough data".** **The number that decides
BFS is 26 of the 100 required calls** — and it only moves when real merchants use the app, not when
we do.

### TASK 6b — SKIPPED, AS INSTRUCTED, AND HERE IS WHY.

The gate was "only if the 7-day window starts on or after 8 Sep 20:00 UTC". **The window on screen
is `Sep 7 – Sep 14` — it still contains Sep 8 and Sep 9.** The launch-day failures have not aged
out. Earliest the window clears them is ~16 Sep.

### TASK 7 — SWEEP. Both halves clean.

*Editor, fresh load:* 54 non-empty fields, 3,264 characters. Every expect-0 at **0**
(`save 17%`, `7-day`, `99.90`, `299.90`, `799.90`, `A/B variant testing`, `Priority support`,
`ai content generations`, `Dedicated account manager`, `SLA support`, superlatives). Expect-1 both
**1**. Lengths App name **25** · Subtitle **62** · Introduction **86** · App details **449** ·
Features **58/69/74/60/63**. Search terms **exactly 5**, §4 verbatim. Plan cards read back
`$9.99/month or $95.90/year, 14-day trial` · `$29.99 … $287.90 … 14-day` · `$79.99 … $767.90 …
14-day`. *Public page, cache-busted* (200, 201,033 B, 117 × "Navaal"): expect-0 all **0**;
**`save 20%` 3** · `14-day` **6** · `95.90` / `287.90` / `767.90` **1** each · both replacements
**1**. **`save 20% = 3` confirmed as the correct standing value.**

### STORE STATE AFTER THIS PASS

- **`contentpilot-dev2`: untouched, still frozen, 6 drafts pending.** The freeze holds until CW
  posts `CAPTURE COMPLETE`, which is now waiting on BLOCKER A and BLOCKER B above, not on a sha.
- **`navaal-qa-fresh`: renamed `Northline Supply`, 12 products, app installed, 3 first-run drafts,
  Free plan, 3/100 credits used, no subscription approved.** It is ready to be frame 04's source the
  moment F1 is fixed. **Nobody should mutate it either.**

## PHASE 8 — CW, 2026-09-14

**Claim vs screen first. One claim in the brief is wrong and it stops Task 4 dead.**
The brief says the three Phase 2 bullets go "into feature slots that are free or that replace weaker
§4 lines by Cowork's ordering in §5". **There are no free slots, and §5 contains no ordering.**
Shopify's own guidance, verbatim from inside the listing editor: **`Add a minimum of 3 features,
maximum of 5`**. There are exactly five `Feature` inputs, all five are full, and the **`Add` control
above Feature 1 carries `aria-disabled="true"`** — read off the DOM, not inferred. **See TASK 4.**

### TASK 1 — DONE. The listing's privacy URL now points at the generated page.

**Verified BEFORE pointing anything at it** — a listing must not link a page nobody read:
`https://app.navaal.ai/privacy` **200**, 9,569 B, `Last updated 14 September 2026`, and **public**:
a bare `curl` with no UA and no cookies returns **200** with `cache-control: public, max-age=300`.
`https://app.navaal.ai/terms` **200**, 4,275 B, same date. Checked the figures that killed the old
Terms — **`7-day` 0 · `25 generations` 0 · `ten months` 0 · `two months free` 0 · `17%` 0 · `99.90`
0 · `299.90` 0 · `799.90` 0**, on both pages. And the four things the brief promised are there:
**Anthropic ×5 · Neon ×1 · `hello@navaal.ai` ×2 (`support@` now 0) · the 14-day trial** — the last
one on **`/terms`**, not `/privacy`, which is the correct home for it (*"Paid plans include a 14-day
free trial with 250 credits, once per store."*).
**The BYO-key disclosure is better than the brief claimed:** *"If you add your own Anthropic key on
the Professional plan, the same content goes to Anthropic under **your** account instead of ours.
Your key is encrypted with AES-256-GCM before it is stored, is never written to a log, and is never
sent back to your browser — not the key, not part of it, not its length."* And the credit weighting
is finally stated in the contract: *"A product description, a meta title and description, or FAQ
content each cost 1 credit. Image alt text costs nothing. A blog post costs 3. If you select several
content types in one run, you are charged the most expensive one, not the sum."* **T5, T7, T8, T9,
T10 from the Phase 7 read are all resolved by these two pages.**
**The edit:** `Privacy policy URL` `https://navaal.ai/privacy` (25) → **`https://app.navaal.ai/privacy`**
(29). Saved. **Read back on a fresh load: `https://app.navaal.ai/privacy`.** Public listing,
cache-busted (**200**, 201,041 B, 117 × "Navaal" — sanity first): **`app.navaal.ai/privacy` ×2, and
zero remaining references to the bare `navaal.ai/privacy`.** No other field touched — there is still
no Terms field, as proved in Phase 7.
**Confirmed, since the brief flagged it:** `navaal.ai`'s own footer still carries `href="/privacy"`
and `href="/terms"`, and both still return **200** to the stale 4 Sep / 8 July copies. **Until the
owner uploads CC's redirect files, a merchant who lands on the marketing site still reads the Terms
that say 7-day and 25 generations.** The listing no longer sends anyone there; the website does.

### TASK 4 — **BLOCKED, AND NOT BY A PERMISSION. Nothing typed, nothing deleted.**

**Shopify caps the listing at five feature bullets and we are at five.** To publish any one of the
three Phase 2 lines, one of the five live §4 lines must be **deleted**. `12-OFFER.md` §5 lists the
added bullets with their phase gates and the two corrections made today, **but it does not say which
§4 line each one displaces, and it does not rank them.** Choosing which approved line to remove is
authoring listing copy, which CW does not do.
**Everything CW can settle is settled — all three candidates are under the 80-char cap:**

| Candidate (Phase 2, §5) | Chars |
|---|---|
| `Daily checks tell you when a theme or import breaks your product data` | **69** |
| `See what AI shopping feeds require that your products are missing` | **65** |
| `Fix missing barcodes, option names and alt text across your catalog in bulk` | **75** |

**The five slots they would have to displace, as they read on the listing right now:**

| Slot | Chars | Live line |
|---|---|---|
| F1 | 58 | `Full catalog SEO audit, never capped by plan or store size` |
| F2 | 69 | `AI descriptions, meta tags, alt text and FAQs in your own brand voice` |
| F3 | 74 | `Nothing publishes until you approve it. Edit, publish or roll back anytime` |
| F4 | 60 | `Blog posts and collection copy written from your own catalog` |
| F5 | 63 | `Every publish is checked against what your store actually saved` |

**COWORK: name the swaps — which candidate replaces which slot, or which candidates are dropped —
and write it into §5 as an ordering. CW will type it the same session.** One observation offered as
an observation, not a recommendation: the third candidate overlaps F2 on `alt text`, and the first
two describe monitoring, which no current §4 line covers at all.

### TASK 6 — SWEEP. Clean, both halves, with the privacy host now in it.

*Editor, fresh load:* 54 non-empty fields, 3,268 characters. Every expect-0 at **0** (`save 17%`,
`7-day`, `99.90`, `299.90`, `799.90`, `A/B variant testing`, `Priority support`, `ai content
generations`, `Dedicated account manager`, `SLA support`, superlatives, and `availability` — added
to the list because §5 records that the barcode bullet once claimed it). Expect-1 both **1**.
Lengths: App name **25** · Subtitle **62** · Introduction **86** · App details **449** · Features
**58 / 69 / 74 / 60 / 63**. Search terms **exactly 5**, §4 verbatim. Plan cards read back
`$9.99/month or $95.90/year, 14-day trial` · `$29.99 … $287.90 … 14-day` · `$79.99 … $767.90 …
14-day`. **`Privacy policy URL` = `https://app.navaal.ai/privacy`.**
*Public page, cache-busted* (**200**, 201,041 B, 117 × "Navaal"): every expect-0 **0**; `save 20%`
**3** · `14-day` **6** · `95.90` / `287.90` / `767.90` **1** each · both replacements **1** ·
**`app.navaal.ai/privacy` 2, bare `navaal.ai/privacy` 0**.

### TWO THINGS NOBODY ASKED ABOUT, BOTH IN THE NEW LEGAL PAGES

- **`/terms` resets credits on a calendar month; Shopify bills on a 30-day cycle.** Verbatim,
  `app.navaal.ai/terms`: *"Credits reset on the first of each calendar month and do not roll over."*
  Verbatim, Shopify's own approval screen (CW read it yesterday): *"**$29.99 USD every 30 days**"*,
  trial *"ending on Sep 28"*. **A merchant who subscribes on the 20th pays for a month and gets a
  credit reset eleven days in.** Either the reset should follow the billing anchor or the Terms
  should say the allowance is pro-rated in the first period. **To CC as a fact; to Cowork if the
  answer is "change the policy, not the code".**
- **The new `/privacy` names where each processor sits but no longer states a transfer basis.** The
  table gives `Anthropic — United States`, `Neon — United States`, `Upstash — United States`,
  `Sentry — United States`, `Fly.io — Sydney, Australia`, `Cloudflare R2 — Global`. The superseded
  `navaal.ai` copy had an explicit **"International transfers"** clause; this one has none. Location
  disclosure is not a transfer mechanism, and a GDPR-minded reviewer looks for the mechanism. **One
  sentence would close it. CC's call whether it belongs.**

### STATE

- **`contentpilot-dev2` and `navaal-qa-fresh`: both still frozen, untouched this pass.** dev2 holds
  6 pending drafts; qa-fresh is `Northline Supply`, 12 products, 3 first-run drafts, Free plan,
  3/100 credits, no subscription approved.
- **Waiting on CC's Part A sha for Task 2** (the second first-run count against FR0–FR14, gate = the
  number, which was **15**). Task 3's capture waits on Task 2 passing. Task 5 not due (webhooks
  ~16 Sep; rank 21 Sep).
- `/api/build-info` read at 11:25:34Z and 11:29:29Z: **`40d8a93`** (started 09:02:00Z) both times —
  **no deploy during this pass**, unlike the five yesterday.

## PHASE 9 — CW, 2026-09-14

### TASK 1 — DONE. The five slots are live, exactly as §5.6, in §5.6's order.

Verified `ae8ed69` live first, and that it **contains** `978bcb8` and `a3fa978`
(`git merge-base --is-ancestor`, all three). §5.6 read from the file and length-checked against
its own table before a key was pressed — **all five lengths match §5.6 exactly (58 / 65 / 69 / 69 /
74), all ≤80.**
Saved, then **read back on a fresh load — all five match §5.6 character for character, in order:**
`Full catalog SEO audit, never capped by plan or store size` · `See what AI shopping feeds require
that your products are missing` · `AI descriptions, meta tags, alt text and FAQs in your own brand
voice` · `Daily checks tell you when a theme or import breaks your product data` · `Nothing
publishes until you approve it. Edit, publish or roll back anytime`.
**Public page, cache-busted (200, 201,052 B, 117 × "Navaal" — sanity first):** the two new lines
**1 each**; the two displaced lines — `Blog posts and collection copy written from your own catalog`
and `Every publish is checked against what your store actually saved` — **0 each**; the three
unchanged **1 each**. Privacy field still `https://app.navaal.ai/privacy`.

### TASK 6 — SWEEP. Clean, both halves, with the new expect lists.

*Editor, fresh load:* 54 non-empty fields, 3,279 characters. Expect-0 all **0** — including both
displaced lines and `availability`. Expect-1 all **1**: both §5.5 replacements **and** both new slot
lines. Lengths App name **25** · Subtitle **62** · Introduction **86** · App details **449** ·
Features **58 / 65 / 69 / 69 / 74**. Search terms **exactly 5**, §4 verbatim. Plan cards
`$9.99/…/$95.90/…14-day` · `$29.99/…/$287.90/…14-day` · `$79.99/…/$767.90/…14-day`.
*Public:* every expect-0 **0**; `save 20%` **3** · `14-day` **6** · `95.90`/`287.90`/`767.90` **1**
each · `app.navaal.ai/privacy` **2**.

### TASK 2 — THE SECOND COUNT. **IT WAS 15. IT IS NOW 4.** Full read: `docs/history/screen-reads/first-run-qa-fresh-2026-09-14b.md`

**CC — the reset is still wanted, for exactly one item.** Please run the First-run reset workflow
against **`navaal-qa-fresh`** and confirm here. **But note what happened without it, because it is
the FR9 answer:** the splash rendered **once** on this store and then stopped — a **105-second
poll** across roughly twenty of the app's own re-renders showed the settled Home every time, and
**usage never moved off 3/100**. Yesterday it re-rendered *"Writing 3 drafts now…"* on **every**
load. **FR9 is fixed.**

**10 fixed · 1 changed · 1 unresolved · 2 unchanged · 1 untested.**

- **FIXED (10):** **FR1** — `Welcome, Northline Supply!` on the same store CW renamed *after*
  install, which is the exact trigger that broke it. **FR2** — `Welcome,` on qa-fresh's first run,
  `Welcome back,` on dev2 which is returning; state-aware, which is the right fix. **FR3** —
  `/app/review` reads `3 products with draft content ready to review` and `0 of 3 approved` on the
  first read, no lag. **FR4** — all four counters agree: Home `Drafts Pending Review 3`, hero `3
  drafts awaiting review`, Products header `3 ready to review`, tab `Draft on this page (3)`.
  **FR5** — `Writing 3 drafts now — 3 credits of the 100 you have left this month on the Free plan`;
  `generations` **0** on both screens. **FR6** — `Your AI-search (GEO) score, from the products we
  scanned just now` / `21/100`, then `21 — AI search (GEO) — the score above` and `10 — Traditional
  SEO — for comparison, not part of the score`. **FR9** — above. **FR10** — `Starter` **0**; the
  primary action is `Write the next 3 drafts`, as CC said. **FR11** — header `9 not yet optimized`
  now equals tab `Not optimized on this page (9)`. **FR12** — `Monthly credits` on both screens;
  `Monthly Generations` **0**.
- **CHANGED, not closed — FR7.** The red 21/100 is still the first thing on the page, now framed:
  *"Most stores start here: the score measures what is on your product pages, and every draft below
  moves it."* plus a new `The 3 things holding this store back` block naming each blocker with an
  action. **Much better product; still the least flattering possible listing frame.**
- **UNRESOLVED — FR8, and it is the one that blocks frame 04.** The row label is fixed (`This
  product: 21/100` instead of `Now 21/100`) **but the one row CW caught carries 21, which is exactly
  the store score.** CC reports `This product: 31/100` on another store. **If the number is still
  store-wide, the new label makes the statement worse, because it now claims the number is the
  product's.** The reset is needed to read all three rows on the splash at once. **This is the only
  thing standing between here and the capture.**
- **UNCHANGED (2): FR13** — clicked the row `[Review]` on a `Ready to review` draft: opens
  `/app/products/9854392271078`, buttons `Generate Content` · `Regenerate Content` · `Select what to
  generate` · `Two options to compare — upgrade to Growth`. **Still no approve or publish control on
  the page the button called "Review".** **FR14** — `3 / 100 used` renders `3%`; `6 / 100 used`
  renders `6%` on ttv-02.
- **UNTESTED — FR0.** The empty-store dead end cannot be re-tested on a store with 12 products. It
  needs a store with none.

**TWO NEW CONFUSIONS THE FIXES INTRODUCED.**
- **N1 — the splash and the usage card disagree by three, on one screen, without scrolling.** Splash:
  **`3 credits of the 100 you have left this month on the Free plan`**. Usage card, same page, same
  load: **`3 / 100 used`** · **`3%`** · **`97 of 100 left this month.`** The splash counts the three
  it is spending as still available. **CC read this line as "3 credits of the 97 you have left" — on
  screen it says 100.** One of the two is wrong.
- **N2 — see FR8.** `This product:` now asserts the number is the product's. That is a better label
  only if the number changed too.

**TASK 2 ITEM 5 — `navaal-ttv-02`, verbatim, CC's claim holds exactly:**
`Monthly credits` / `Attention` / `Free Plan` / **`6 / 100 used`** / `6%` / `94 of 100 left this
month.` — and **`25` appears zero times on the page.** Greeting: `Welcome, Navaal TTV 02!` (that is
the store's real Shopify name, so it is correct, not a stale capture).

### TASK 3 — **NOT CAPTURED. One item, not two. Both of yesterday's blockers are gone.**

- **Blocker A (frame 04's stale test name) is CLEARED** — FR1 above.
- **Blocker B (nine `Live` badges beside a tile reading 8) is CLEARED, and well.** `Live` now appears
  **zero** times on dev2's Products page. `Rope Basket Large` reads, verbatim: **`Attention` /
  `Published · product is a Shopify draft, not on your storefront`**. The page reconciles exactly:
  **8 rows `Published` (Success) + 1 row `Published · product is a Shopify draft…` (Attention) + 6
  `Ready to review` (Info) = 15**, tile `AI Content Published 8`, tab `Published on this page (9)`.
  **The ninth row now explains itself on the row, so the 9-against-8 no longer reads as a
  contradiction.**
- **dev2's four populations still agree**, re-read at 12:5xZ: `15 products in your catalog · 14
  active and draft products published to your online store · 8 with content published · 6 ready to
  review · 0 not yet optimized · 17 archived not shown`; tabs `All (15)` · `Not optimized (0)` ·
  `Draft (6)` · `Published (9)`; Home `Total Products 15` · `AI Content Published 8` · `Drafts
  Pending Review 6`; greeting `Welcome back, Northline Supply!`.
- **So the only thing holding the capture is FR8/N2**, because that number is printed three times on
  the screen frame 04 is taken from. **Run the reset, CW re-reads the splash, and if the three rows
  carry three different product scores the capture goes the same session.**

**Both stores remain frozen. Nothing was mutated this pass — every app read was `read-screen.mjs`
or a read-only Playwright probe.**
`/api/build-info` read three times: **`ae8ed69`** (started 12:24:48Z) at 12:36:31Z, 12:40:39Z and
12:5xZ — no deploy during this pass.

## PHASE 10 — CW, 2026-09-14 (22:4x–22:5xZ)

Production `1e6873e` (started 12:56:46Z) at every read. **Task 1 (the capture) is still waiting on
CC's Part A sha and the reset confirmation — neither is in the queue yet, so no capture was
attempted.** Tasks 2, 3 and 4 are done; Task 3 could not be closed on screen and says exactly why.

### TASK 2 — BOTH PAGES RE-READ. One near-miss worth stating precisely, seven links all 200.

**The reset sentence — the two are identical in substance, differing by one contraction.** Not a
perfect character match, which the brief asked me to confirm, so here are both in full.
`app.navaal.ai/terms`, *Plans, credits and billing*:
> **`Credits reset on the first of each calendar month, whatever your billing date. Your first,
> partial month carries a full allowance. Unused credits do not roll over.`**
In-app **Plans & Billing → Frequently Asked Questions → *When do my credits reset?*** (read on
`navaal-ttv-03`):
> **`Credits reset on the first of each calendar month, whatever your billing date. Your first,
> partial month carries a full allowance. Unused credits don't roll over.`**
**`do not` in the contract, `don't` in the app.** Same meaning, same three sentences, same order.
Flagging it only because "identical" was the bar; if the generator is meant to emit one string to
both places, it is emitting two.
**The favourable resolution is in both, which is the point:** *"Your first, partial month carries a
full allowance."* The mismatch CW raised on 14 Sep is closed on both surfaces.

**`International transfers` is live on `/privacy`. First sentence, verbatim:**
> **`Navaal operates from Australia. Some of the companies above are outside Australia, so data we
> send them leaves the country. For each one we rely on the transfer basis it publishes, linked
> here:`**
**All seven are real `href`s in the HTML and all seven answer 200:**

| Processor | Link as printed | HTTP |
|---|---|---|
| Anthropic (United States) | `www.anthropic.com/legal/data-processing-addendum` | **200** |
| Fly.io (Sydney, Australia) | `fly.io/legal/data-privacy-framework/` | **200** |
| Neon (United States) | `neon.com/dpa` | **200** — but it **redirects to `neon.com/platform-terms#3.4`** |
| Upstash (United States) | `upstash.com/static/trust/dpa.pdf` | **200** |
| Cloudflare R2 (Global) | `www.cloudflare.com/cloudflare-customer-dpa/` | **200** |
| Resend (United States) | `resend.com/legal/dpa` | **200** |
| Sentry (United States) | `sentry.io/legal/dpa/` | **200** |

**The Neon one is the only one that is not a standalone DPA document** — it lands on a section
anchor inside Neon's platform terms. It resolves and it is the right clause, so this is a note, not
a defect: if a reviewer clicks it expecting a DPA they get a terms page scrolled to §3.4. Also worth
recording: the page describes Fly.io as *"a United States company whose machines for this app run in
Sydney"* — accurate, and the sort of thing a reviewer checks.
**Expect-0 re-run, both pages, all zero:** `7-day` · `7 day` · `25 generations` · `ten months` ·
`two months free` · `17%` · `99.90` · `299.90` · `799.90` · `support@` · `generations per month`.
Expect-present: `14-day` 1 and `250 credits` 1 on `/terms`; `AES-256-GCM` 1, `Neon` 5,
`International transfers` 1 on `/privacy`; `hello@navaal.ai` 2 on each.

### TASK 3 — **F3 IS FIXED IN THE CODE. I COULD NOT READ THE ROW, AND THE PAGE'S OWN METHOD SENTENCE IS NOW WRONG IN THE OTHER DIRECTION.**

**The fix is real and correctly scoped.** `app/utils/catalogueWatch.js:293-297`, verbatim:
```
// F3 (Phase 9) — a multi-variant product whose barcodes live on variant 2+
// was graded "no barcode". The walk now reads every variant it can for such
// products and passes them here; "checked" is what was actually looked at.
const checked = Array.isArray(variantBarcodes) ? variantBarcodes : firstVariant ? [firstVariant?.barcode] : null;
const anyBarcode = (checked ?? []).some((b) => String(b ?? "").trim().length > 0);
```
and `catalogueWatch.server.js:75-79` adds a second query only for the products that need it —
*"multi-variant, first variant blank, not a draft, not exempt"* — sampling `VARIANT_BARCODE_SAMPLE`
variants, with the cost worked out in the comment: *"Ten products × (node + connection + 50
variants) ≈ 530 points, under the 1,000 cap."* `anyBarcode` passes if **any** checked variant
carries one. That is the right shape.

- **NEW FINDING, and it is the same class as `Live` — a sentence on screen that no longer matches
  what the app does.** `/app/attention`'s Method paragraph still tells the merchant, verbatim:
  *"a daily read of every product in your catalogue — title, description, vendor, product type,
  featured image and its alt text, **first-variant barcode** and option names"*. **The code reads
  every variant it can; the page still says first-variant.** This one **understates** the app rather
  than overstating it, which is the safer direction — but it is still a false description of the
  method, on the page whose whole job is to explain the method. `app/routes/app.attention.jsx:366`.
  **CC.**
- **COULD NOT READ THE ROW. Three reasons, all on screen:**
  1. **`navaal-ttv-03` has no barcode finding at all to quote.** `/app/fix` shows **zero** occurrences
     of the word `barcode` — no barcode section exists on that store — and `/app/attention` contains
     the word exactly **once**, inside the Method sentence above. There is no row.
  2. **Constructing the case needs a variant-barcode edit and Shopify's variant editor exposes no
     reachable Barcode input.** `Selling Plans Ski Wax` is the right shape (3 variants:
     `Selling Plans Ski Wax` / `Special…` / `Sample…`, variants `54045659889964`, `54045659922732`,
     `54045659955500`). Opened variants 1 and 2 directly; **no label-bound `Barcode` or `SKU` input
     is present in the DOM on either.** Three attempts, then routed — the same class as the
     already-recorded rich-text-description problem in `stock-northline.mjs`.
  3. **Even a successful edit would not show today.** The page states its own cadence — *"a daily
     read … Each product is compared with the previous day"* — and there is **no re-check control**
     on it (`/app/attention` buttons are only: the three Search Console answers, `Fix in bulk`,
     `Open in Navaal`). The row would change after the nightly walk, not on save.
- **Two ways to close it, either is quick.** CC asserts it directly against `gradeProduct` with
  `variantBarcodes: ["", "9312345678907"]` and no `variantBarcodes` for the control — that proves
  the branch without Shopify's UI at all. Or the owner types one barcode on variant
  `54045659922732` and clears variant `54045659889964` (thirty seconds in the admin), and **CW reads
  the row after the next nightly walk.**

### TASK 4 — SWEEP. Clean.

Public page, cache-busted (**200**, 201,052 B, 117 × "Navaal" — sanity first). **All five §5.6 lines
present exactly once each.** Both displaced lines **0**. Standing expect-0 all **0**, including
`availability`. `save 20%` **3** · `14-day` **6** · `95.90` / `287.90` / `767.90` **1** each ·
`Two description options to compare` **1** · `Email support from the founder` **1** ·
`app.navaal.ai/privacy` **2** · **bare `navaal.ai/privacy` 0**.

### STATE

`contentpilot-dev2` and `navaal-qa-fresh` **still frozen, untouched this pass**. `navaal-ttv-03` was
read and two variant pages were opened; **nothing on it was changed** — the barcode edit could not
be made. Task 1 waits on CC's Part A sha **and** the reset confirmation. Task 5 not due (webhooks on
or after 16 Sep; rank 21 Sep; the `navaal.ai` 301 check after the Hostinger session).

## PHASE 10 — CW, second pass, 2026-09-14 23:4x–2026-09-15 00:0xZ

Live `08d8b3e` at every read; `f77eef9`, `11c5bbf`, `1d05aaa`, `c7bfb0e`, `da265c4` all confirmed
ancestors of it. **NO CAPTURE.** The brief's step 2 says *"if any fails, no capture; post and stop"*,
and one of the three fails on screen. Nothing was mutated on either frozen store.

### **THE STOP: FR13's DESTINATION EXISTS AND IS RIGHT. THE BUTTON WAS NEVER REWIRED.**

CC reported: *"a row's [Review] opens `/app/review?product=<id>`… scoped 'Showing one product', 1
card, approve checkbox and publish control present"*. **The route is exactly that. The row's button
does not go to it.**

Navigated the three forms directly on `contentpilot-dev2`, read-only, approving nothing:

| URL | cards | scoped | approve boxes |
|---|---|---|---|
| `/app/review` | **6** | no | 6 |
| `/app/review?product=gid://shopify/Product/7800236671079` | **6** | **no** | 6 |
| `/app/review?product=7800236671079` | **1** | **yes** | **1** |

The numeric form is perfect, verbatim: **`1 product with draft content ready to review`** ·
**`Showing one product`** · **`Opened from its row on Products. Approve and publish here; the rest
of your drafts are one click away.`** · **`Show all drafts`**. That is the fix, built and working.

**But clicking the row's own `[Review]` control lands somewhere else.** Clicked it on a genuine
`Ready to review` draft row (`Bamboo Chopping Board` — `Desc · draft | Meta · draft | Ready to
review`) on **`contentpilot-dev2`**: it opens **`/app/products/7800236671079`**, the *generate* page —
`scoped: false`, **0 approve checkboxes**, buttons `Generate Content` · `Enhance Existing Content` ·
`Generate two options to compare`. **Identical to the unfixed behaviour CW read yesterday.**
Repeated on **`navaal-ttv-03`**, the store CC says it proved this on: same result —
`/app/products/10460239823148`, `scoped: false`, **0 approve checkboxes**.
**CC — the proof was of the route, not of the control. One href.**

- **Second, smaller, and a trap for whoever wires it: the GID form is silently ignored.**
  `?product=gid://shopify/Product/<id>` does not error and does not scope — it renders the full
  six-card page. Whoever rewires the button will reach for the GID, because that is what the row
  already holds, and the page will look like it works while showing every draft. **Make the
  parameter reject what it cannot use.**

### FR8 and N1 — **COULD NOT READ, and the reason is a contradiction worth more than the frame**

**`navaal-qa-fresh` IS INSTALLED. Shopify says so on its own Apps page.** CC's post says *"the
First-run reset workflow refused `navaal-qa-fresh`: 'shop row missing or uninstalled' — the app is
not installed there now"*. On screen: Shopify admin → Settings → Apps →
**`Installed` · `Navaal: AI SEO, AEO & GEO`**, and `/app` answers with the app's own screens
(`Welcome, Northline Supply!`, `Review 3 drafts`, `Store SEO score 21 / 100 across 12 products
sampled`, `Drafts Pending Review 3`).
**So the app's database and Shopify disagree about whether this shop exists.** The reset workflow
reads the app's `Shop` row and finds nothing; Shopify holds a live grant and the app serves the shop
happily. **If that state is reachable on a real merchant, the app is running for a shop it believes
uninstalled — and the nightly walk's 9 → 8 on the 14th is consistent with exactly that.** CC: find
out which side is wrong before anything reinstalls over the evidence.
**This is why CW did not uninstall and reinstall to force the splash.** It was the obvious way to
get frame 04, the freeze was mine to lift for an install, and it would have **destroyed the only
live example of the disagreement.** The frame can wait a day; that state cannot be recreated on
demand.
Consequence for the two reads: the first-run splash is spent on this store — polled the app frame
**40 times over 48 seconds** on a fresh load and the product rows never rendered, only the settled
Home. **FR8's three product scores and N1's `97 of 100 left after this` are both splash-only, so
neither could be read.** Not a pass, not a fail — **could not read**.

### `contentpilot-dev2` — every step-3 check passes

- **Four populations still agree:** `15 products in your catalog · 14 active and draft products
  published to your online store · 8 with content published · 6 ready to review · 0 not yet
  optimized · 17 archived not shown`; tabs `All (15 on page)` · `Not optimized on this page (0)` ·
  `Draft on this page (6)` · `Published on this page (9)`; Home `Total Products 15` · `AI Content
  Published 8` · `Drafts Pending Review 6` · `8 products optimized · 6 drafts awaiting review`.
- **FR14 holds on the big-denominator case:** `Monthly credits` · `Professional Plan` ·
  **`25 / 4000 used`** · **`1%`** · `3975 of 4000 left this month.` **Not `0%`.**
- **The Shopify-draft row is unchanged and still explains itself:** `Rope Basket Large` ·
  **`Attention`** · **`Published · product is a Shopify draft, not on your storefront`**. `Live`
  appears **0** times on the page.

**dev2 is capture-ready on every criterion the brief names. It is frame 04 that is not, and now
FR13 as well.**

### WHAT UNBLOCKS THE CAPTURE — two things, both small

1. **Rewire the row's `[Review]` to `/app/review?product=<numeric id>`** and make the GID form
   refuse rather than fall back. CW re-reads the button on a draft row on both stores.
2. **Decide the qa-fresh install contradiction, then recreate the first run.** Once CC has taken
   whatever evidence it needs from the mismatched state, CW uninstalls and reinstalls from the
   listing — that is a genuine first run on a 12-product store already named `Northline Supply`, and
   frame 04 comes out of it the same session, with FR8's three scores and N1's line readable at the
   same time.

Both freezes stay on. `navaal-ttv-03` was read only.
