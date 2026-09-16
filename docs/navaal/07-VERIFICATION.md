# VERIFICATION — what proof each kind of claim requires

Read this before writing the word "verified". Every technique here exists because a claim of the
same shape was once wrong, confidently, in this project.

**The one question behind all of it:** *if the thing I am claiming were completely false, would
what I just looked at look any different?* If not, you have not verified anything.

---

## THE CLAIM CLASSES

### 1. "The guard works"
Not proved by the suite passing. **Break the thing it watches and count the failures.**
Report the count: *"disabled X → 4 tests fail."* A guard you have not broken is a guard you have
not tested; it is the single most common false green in this repo.

Also state the L1 answer explicitly: what would this print if the watched thing were completely
broken?

*Failure shapes seen here: an ESLint `--cache` that reported clean on unlinted code; a CI guard
comparing an empty commit range; a suite passing over a GraphQL query containing a `//` syntax
error; a consistency guard that compared the same RULE on two different populations and so could
never fail.*

### 2. "A merchant can use it"
Three separate things, all required (L15):
1. the control exists and is wired,
2. a merchant can **reach** it from a screen they already visit,
3. it is **visible on a rendered page**.

Source assertions prove only the first. A control in a collapsed section, behind a plan gate, or
on a route with no entry point passes every source-level test ever written for it. Prove it in a
browser — that is a `CW` task if you cannot open one, and it is routed, not skipped.

*`includeDraftProducts` had a column, a read path, a write path and a green suite, and no control
on any screen.*

### 3. "This number is right"
State the number, **where you read it**, and **when**. A number without a source is folklore (L3).
A percentage without its denominator is worse than nothing: **0% failure over 0 deliveries is not
a pass.** Always print the count beside the rate.

For anything shown to a merchant, also state its scope and its N *in the UI itself* (L5), and check
no other screen states a different value for the same fact.

### 4. "It is faster / it is fixed"
Give the measurement and the tool that took it. "~40 ms" with nothing behind it is a defect, not a
result. Compare like with like: **every latency and time-to-value figure captured before commit
`d272222` (2026-09-10) is deploy-contaminated** and is not a baseline (see `05-EVIDENCE.md` §6b).

Measure from **outside** the system under test. A harness pointed at the wrong document has
produced four false greens here — including one measuring `admin.shopify.com` instead of our own
iframe.

### 5. "It is deployed"
`/api/build-info` returns the expected `shortSha`, **and** `/api/health?deep=1` returns
`status: ok` with `schema.ok: true` and a column count that matches the migrations applied.
A green CI run is not a deploy. A successful `fly deploy` is not a verification (L19).

### 6. "The live page says X"
Fetch the **raw bytes**, cache-busted, and grep them. Never trust a summariser, a preview pane, a
file manager, or a save confirmation (L4).

**Assert the byte delta.** If you inserted 71 characters the file must grow by exactly 71. A stale
cached read once silently reverted a verified fix here; only the byte count caught it.

### 7. "It holds at scale"
Name the shape and the number: *"walked 20,000 products in 80 requests, 3.4 MB — and it reports
why it stopped."* Then say what is **simulated** versus what met a real store. The largest real
catalogue this code has met is 3,148 products; everything above that is modelled until a real one
proves otherwise, and the report must say so.

Every scale claim must answer: cursor exhaustion · a THROTTLED response mid-run · a job outliving a
deploy · worker memory · and **what the merchant is told when it stops early** (a cap is never
presented as a total, L5).

### 8. "It works for every store"
Name the shapes from `05-EVIDENCE.md` §4 that you proved it against, and the ones you did not.
"It works on the store we tested" is not done (L2). EBS is an instrument, not the customer (L13).

*1,374 tests did not find 29 defects that one real catalogue surfaced in ninety minutes.*

### 9. "The file / workflow does X"
Read the whole file and quote the line number (L16). A grep hit proves a string exists, never that
a behaviour is true.

### 10. "The external service is in the state I expect"
Read it back on a **fresh page load**, not from the confirmation screen that just told you it
worked. Screenshot or quote the value. If access failed, the finding is **"could not read"** — never
"no change", which is a different claim entirely.

---

## THE REPORTING RULES

- Numbers first, interpretation second.
- Quote verbatim what you read; paraphrase is where accuracy dies.
- **"Could not check" and "no change" are different findings.** Never substitute one for the other.
- Report what you found that nobody asked about (L14). It has been the most valuable part of every
  session so far.
- If a verification failed and you fixed it, say both — the fix and what the failure means about
  the class of thing that failed.

---

## THE FALSE GREENS, AS A CHECKLIST

Before claiming a pass, check you are not repeating one of these:

1. A cached or stale read presented as current state.
2. A tool with caching left on, reporting clean on unchecked input.
3. A guard whose comparison can never fail (empty range, same rule both sides).
4. A test suite passing over code that never actually executes.
5. A harness measuring the wrong document, page or process.
6. A feature complete in every layer except a screen a merchant can reach.
7. A document confidently describing a file nobody read to the end.
8. A page-wide scan that counted content belonging to someone else's app.
9. A read that was fresh while the cached value behind it was not.
10. Two sections in one file answering to the same name, the dead one first.
11. An exported constant with a passing test and no consumer, while a hardcoded copy ships.
12. A verified production deploy, read as proof of what Shopify serves.
13. A piped deploy gate returning the pipe's exit code, not the script's (CC, `| tail`).
14. Two hosts serving the same legal page — one current, one stale — each worker reading a different one.
15. A push chained after a failed suite with `;` (CC).
16. A control proved by its route: the URL works, the button never pointed at it — three times on one button (FR13).
17. A record deleted on a loop by a sweep that matched a domain, not an install — while the app kept serving screens.
18. Fly's *Deploy Secrets* pressed as a restart: it releases the newest built image, not the running one (CW, owner session).
19. A translated listing "rendering" in a locale that Shopify machine-translates anyway: the public page shows German before any German is published (Cowork, 2026-09-15).
20. A partial save read as a complete one: the alt text saved fine while the pictures underneath never changed, so the read-back found new text over old images (CW, 2026-09-15).
21. A read taken too early: the first cache-busted fetch straight after Publish still showed the machine translation, and `es` was half-propagated — subtitle ours, body Shopify's. One read at that moment supports either wrong conclusion; it took ~100 s to settle (CW, 2026-09-15).
22. An array assumed to be in the order a human would write it: `pricingChargeRecurring.pricingPlans` is ALPHABETICAL — free, growth, professional, starter — so filling 0..3 in brochure order puts Starter's lines on Growth's card. Read the card label for each index; never trust the index (CW, 2026-09-16).
23. A machine translation reproducing our own copy verbatim: on the unpublished Italian page our bullet 3 matched exactly once while the subtitle and bullets 1/2/4/5 scored 0 and the auto-translation line was present. A bullet-3-only test would have called Italian live — both halves of #19's test are load-bearing, and the line-absent half is the one that cannot be faked (Cowork, 2026-09-16).
24. A guard written on a SPELLING rather than on its reason, failing on correct code: `listing-frames.test.js` forbade the string `page.screenshot(`, and the fix that made every frame correct — clipping to the app frame's own bounding box — uses exactly that call. It sat red in every suite run for a day, which is how a suite stops being read (CC, 2026-09-16).
25. A source-reading guard that did not cover the file that broke: `lockedPricing.test.js` asserted "nothing anywhere still says monthlyLimit" while walking `app/` only. The one place still reading the renamed field was in `scripts/`, so a 100-credit store was seeded to 25 (CC, 2026-09-16).
26. `grep` used to validate a VALUE — it matches LINES. `printf '%s' "$X" | grep -q` fails on an empty `$X` (no line at all) and succeeds on a multi-line `$X` if *any* line matches, so a workflow's own documented empty mode was refused while a newline injection would have been accepted and interpolated into `sh -c` on a production machine. A `case` pattern matches the whole value (CC, 2026-09-16).
27. A lock enforced at the call sites that existed when it was written: `REMEDIATION_LOCKED_SHOPS` guarded five call sites, all in one file, so Review, the product page, bulk and autopilot could still write to a locked shop holding a client's catalogue. A rule about "every write" belongs at the place the writes leave the process, not at the writers you can currently name (CC, 2026-09-16).
28. **A price enforced on one screen and nowhere else.** The plans page sold blog posts under
    Growth at 3 credits each and the comparison table had no blog row at all, while `/app/blog`
    generated for any shop that asked and never named a price. A feature is "sold at N" only where
    a gate says so; a card is a claim, not an enforcement (CC, 2026-09-16).
29. **A gate believed because two of its three doors were shut.** `bulkJobs` was checked in
    Products and in Optimize, so "bulk is gated" read as true. `/app/fix` — the page the first
    screen's own dark button points at — checked nothing, and every section on it is a bulk run.
    Counting the call sites that DO check is how the previous false green (#27) happened too;
    the question is always which door is open, never how many are shut (CC, 2026-09-16).
30. **A prop proved to be PASSED, not to have ARRIVED.** Phase 14 asserted from source that all four
    quota bars set Polaris's `ariaLabelledBy`, and every assertion passed. None of them showed that
    the prop reaches the element or that the fraction is what a screen reader hears — if Polaris had
    ignored it the tests would still be green and the bar would still announce "1%". Rendering the
    component answered it in one line, and turned up a second fact no source check could: Polaris
    emits its own visually-hidden percent beside the bar (CC, 2026-09-16).

**Note on numbering (2026-09-16).** #20 to #23 were written up in `06-QUEUE.md` posts and never reached
this list, so a reader checking "am I repeating a known false green?" against the checklist saw the list
stop at 19 — a checklist with a gap in it is the shape of the thing it exists to prevent. They are
transcribed above from those posts.

---

## FALSE GREENS 8, 9 AND 10 — all three found on 2026-09-14

**8. A page-wide scan that counts someone else's page.** CW checked the live App Store listing for
statistics and testimonials by scanning the whole public page, and found the number **46,877** and
the word **testimonial** — both belonging to **Judge.me**, in Shopify's own "other apps" carousel.
Neither is our copy and neither can be removed by us.
**The rule: a claim about OUR listing is proved in the listing EDITOR, field by field**, and the
public page is used only to cross-check that the field values actually went live. A whole-page grep
over a Shopify-rendered page measures Shopify, not us — the same shape as false green 5.

**9. A read that is fresh but the value is not.** Home reported **48/100**, then **78/100** on the
same store **with no deploy between the two reads**. The read was live; the value was served from a
cache (`STORE_SCORE_TTL_S = 600` in `storeScore.server.js`) and was lagging behind published
content by far more than its own TTL.
**The rule: for any number the app computes and caches, a single read proves nothing.** Read it,
change something that must move it, read it again, and say how long the change took to appear. A
merchant who publishes and then looks at Home is in exactly that window, and a number that is
stale there is a number that is wrong there.

**10. Two sections in one file with the same name.** A brief said *"read `04-DECISIONS.md`
§PRICING"*. The file had **two** matching sections, and the one that came first was the dead one —
five tiers at $19/$49/$99/$299, plus a row naming two things `09-DOCTRINE.md` §2 bans. A session
following the brief exactly would have published false prices and banned claims.
**The rule: superseded content is renamed, not just annotated.** A heading that still answers to
the live name is reachable, and being reachable is the whole problem. This was Cowork's own bug,
introduced by appending a new section instead of replacing the old one.

**Also worth a line, from the same day:** Playwright on this computer's Linux VM dies with
*"Target page, context or browser has been closed"* unless `libxdamage1` is extracted by hand
(`apt-get download libxdamage1; dpkg-deb -x`) and `LD_LIBRARY_PATH` points at it. That error reads
exactly like a broken harness and is not one.

**11. An exported constant, a green test, and no consumer — while a hardcoded copy ships.**
Found 2026-09-14, after Phase 4 reported three verified ship gates:

```
app/utils/billing-plans.js:32        export const TRIAL_DAYS = 14;
tests/utils/trialCredits.test.js:76  expect(TRIAL_DAYS).toBe(14);
app/shopify.server.js:37             ... trialDays: 7 ...      <-- what Shopify actually receives
```

`TRIAL_DAYS` was imported by **nothing but its own test**. Production granted a **7-day** trial
while the locked table, the constant and a passing assertion all said 14 — unchanged across four
shas. And H12 had already been posted telling CW the app billed the locked numbers, so the next
move was to publish "14 days" onto a live Shopify listing the app does not honour.

**The rule, and it is two rules.** First: `expect(CONST).toBe(literal)` proves a constant equals
itself and executes no path a merchant can reach — assert on **the object actually handed to the
external service**, every key, and verify by breaking it. Second: **a locked value must have exactly
one definition and at least one non-test consumer.** Grep for the value, not the name — a second
hardcoded copy on the path to Shopify or to a screen is what makes the first one decorative. An
exported constant whose only consumer is a test asserting its own value is dead code that greps as
shipped.

**FIXED at `f38838f`, and the prescribed fix has a trap inside it that I fell into first.**

Rule one above says *"assert on the object actually handed to the external service."* I did, and
wrote it as `expect(entry.trialDays).toBe(TRIAL_DAYS)` across all six subscription entries. Then I
ran the break — `TRIAL_DAYS = 9` — and got **one** failure: the tautological assertion I was in the
middle of deleting. **Both sides of my new assertion moved with the constant, so it carried exactly
the defect it replaced, one level further out.**

So the rule needs a third clause. **Asserting on the consumer proves the WIRING. It does not prove
the VALUE.** Those are two defects — a literal on the path, and a wrong number in the one
definition — and they need two assertions:

```js
expect(entry.trialDays).toBe(TRIAL_DAYS);  // wiring: fails when a literal reappears
expect(entry.trialDays).toBe(14);          // value:  fails when the definition drifts from the doc
```

The second one restates the locked number on purpose. It is the only assertion in the pair that
connects the code to `14-PRICING.md` rather than to itself.

**Both breaks now produce 7 failures across 2 files**, demonstrated, and a third break (a stale
price string and "7-day free trial" put back on the plans page) produces 2. A guard nobody has
broken is not a guard.

**What the value-grep found once it was actually run.** The trial length was one of four: the plans
page was a complete second copy of the locked table, carrying the pre-20% annual prices
($99.90/$299.90/$799.90 against $95.90/$287.90/$767.90), the pre-B2 allowances (25/50/200/1,000
against 100/500/1,500/4,000), bulk shown as Growth-and-up after B3 moved it to Starter, and the
banned phrase **"2 months free"** rendering on every paid card. `14-PRICING.md` §4 bans that phrase
by name. Every one of those was live while 3,120 tests were green.

**And I reintroduced the class myself inside the same commit.** Having rewritten the FAQ to describe
credit weighting, I typed "3 credits" and "0 credits" into it — while `credits.js` opens with *"the
plans page and the quota surfaces show these numbers."* A second hardcoded copy, written by the
person fixing second hardcoded copies, ten minutes after reading the rule. The guard is mechanical
now because judgement demonstrably is not enough: `tests/utils/billingConfig.test.js` asserts every
constant exported from `billing-plans.js` has an importer that is not a test.

---

## A SOURCE-READING GUARD MUST STRIP COMMENTS, OR IT FIRES ON ITS OWN DOCUMENTATION

Recorded 2026-09-14 after it happened **four times in one session**, in four different files, to
four different rules:

| The guard | What it fired on |
|---|---|
| "no file may reference `SHOPIFY_API_SECRET`" | the docstring saying *"its own secret, **not** `SHOPIFY_API_SECRET`"* |
| "no column may hold part of a key" | the comment naming `aiKeyLast4` as the thing not to add |
| "no screen may say *Live on your storefront*" | the JSX comment explaining why the label was changed |
| "nothing may type the cache key by hand" | the docstring for `cacheKey()`, which quotes the key shape |

**Both directions are traps, and they pull opposite ways.** In Phase 4 a PRESENCE check passed on a
docstring that merely QUOTED the merchant copy, so deleting the copy failed nothing. These four are
the inverse: an ABSENCE check failing on the comment that explains the absence.

**The tempting fix is the wrong one.** When a guard fires on the comment justifying it, the path of
least resistance is to delete the explanation — which leaves the rule enforced and its reason
gone, so the next person removes the rule. Strip the comments instead.

**Strip BLOCK comments, not just line comments.** Three of the four were `/* */` or JSX `{/* */}`,
and a filter that only knows `^\s*//` misses every one of them:

```js
const code = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n")
   .filter((l) => !/^\s*\/\//.test(l))
   .join("\n");
```

A file is not less correct for naming the thing it refuses to do. It is usually more correct.

---

## A LOCKED VALUE HAS MORE HOMES THAN THIS REPOSITORY. ENUMERATE THEM, OR THE SWEEP IS DECORATIVE.

Found 2026-09-14 by CW, after **two** consecutive phases audited the price and called it consistent.

A locked price has **three** homes:

1. **The code** — `billing-plans.js`, and everything that derives from it.
2. **The listing fields we author** — intro, details, bullets, plan-card feature lines.
3. **Shopify's REGISTERED PLAN METADATA** — which we do not author, cannot see from the code, and
   which is the first thing a merchant reads.

The live listing showed **`$99.90/year and save 17%`** and Shopify's own **`7-day free trial`**
badge, sitting directly under our true 14-day line. Both are display only — the app is on the
Billing API, `billing:` is built by `buildBillingConfig()` from the locked table, and the one live
subscription carries an id created through that path — so nobody pays $99.90 and nobody gets 7 days.
That is lucky, not by design.

**Why both audits missed it, and this is the part to internalise.** Phase 4 checked (1) and (2) and
declared the price consistent. Phase 5 checked (1) and (2) *harder* — a value sweep reporting **0
second copies**, a break test producing **7 failures**, three new non-test importers for a constant
that had none — and declared it consistent again. **Both audits were true. Both were incomplete.**
The sweep was exhaustive within its boundary and never said where its boundary was.

**THE RULE. A claim that a value is consistent "everywhere" must first ENUMERATE every system that
stores it, including systems outside this repository.** The enumeration is the deliverable; the
sweep is only evidence about the part of it you can reach.

**And the sweep must name what it did not reach.** `tools/proof/locked-values-sweep.mjs` prints
"0 second copies" — which is true of `app/` and says nothing about Shopify's plan metadata, the
listing fields, the theme extension, or any email template. A report that is silent about its own
boundary invites the reader to supply the widest one. That is **false green #11 wearing a different
layer**: not a constant asserted against itself, but a *search space* asserted against itself.

**Practical form:** before writing "consistent everywhere", write the list of homes. If a home
cannot be checked from code, say so in the same sentence as the result, and route it to whoever can
open it.

**12. A verified production deploy, read as proof of what Shopify serves.** Found by CW
2026-09-14. `/api/build-info` matched the sha, deep health was ok, and three workers including
Cowork read that as "live" all week. The active **Shopify app version** was
`navaal-seo-geo-content-15`, created **04:34 UTC 9 Sep**. Commit `7942c30`, which escaped the AI
FAQ text in `extensions/geo-schema/blocks/faq_visible.liquid` (stored XSS on the **merchant
storefront**), landed at **11:26 UTC 9 Sep** — 6 h 52 min after the version was cut — and nothing
was released after it. Five days of green deploys; Shopify served the unescaped Liquid throughout.

**The rule:** there are **two** deploy surfaces and they are proved separately. The container is
proved by build-info + deep health. **Everything Shopify holds** — `shopify.app.toml` and
`extensions/` — is proved **only** by the Versions page showing a new active version whose created
time is after the commit. A claim that "X is live" for anything in those paths must cite a
version number, not a sha.

**Correction, same day, Cowork's error:** this entry originally said the public listing's
`save 17%` / `7-day` going to 0 would be "the tell" that the version carried the billing config.
**It does not.** CC released `p0-xss-f505584` at 06:46 UTC; at 06:58 the public page still read
`save 17%` ×3, `7-day` ×3, `99.90` ×3, `95.90` ×0 (Cowork's own cache-busted read). For a
**Billing API** app, the listing's plan cards are **typed by hand** in the Partner Dashboard's
pricing section — Shopify's "updated automatically" sentence means *without resubmission*, not
*derived from your code*. So the price has three homes and the third is **typed, not derived**: it
moves only when someone edits it. CW's refusal to edit it stands as correct process; the edit is
now routed as H12b with the owner informed, because it is display-only and one live subscriber
exists. The verified fact is: the app version proves the extension; nothing proves the listing
price except reading the listing.

## FALSE GREENS 11 AND 12 — both found on 2026-09-14, Phase 7

**11. A guard that matches nothing passes.** Part B's screen-reconciliation test asserted that a
route's loader did not do X by grepping for `export const loader`. The route declared
`export async function loader`. The regex found nothing, the "must not contain" assertion passed
over an empty string, and the guard was green while proving nothing.
**The rule: a source-reading guard must first assert it FOUND the thing it is guarding**, then
assert what that thing does or does not contain. `expect(found).not.toBeNull()` before
`expect(found).not.toMatch(...)`. A guard that can pass on an empty match is decorative.

**12. The code's premise was wrong, and only the production run could say so.** P2.2 graded
"no `onlineStoreUrl`" as BLOCKING with the note *"not available on the Online Store channel"* —
true on a public store. The first production proof put 150 blocking findings on the board and the
screen read showed every product on both dev stores carrying that line. Both storefronts 302
`/` → `/password`; Shopify returns null for every product's `onlineStoreUrl` while the store
password is on (confirmed live and in Shopify's own forums). The crawler card was wrong the same
way: *"all six reached your storefront"* — they reached the password page. **7 of 8 installed
storefronts are password-protected**; only the real store is public.
**The rule: the proof run is part of the gate, and its job is to break the premise, not to
confirm the count.** Read the screen the number came from, on more than one store, before recording
the number. Tests cannot catch a premise: every test here mocked a public storefront because the
author assumed one. The fix was one shop-level fact (`onlineStore.passwordProtection.enabled`,
validated against the schema) threaded through grading and the crawler check, and a screen that
says the true thing once instead of 27 times.

A smaller one from the same day, for the record: **`vi.mock` is hoisted above every `const` in the
file**, so a spy declared inside a `describe` and closed over by the mock factory is
`undefined` when the factory runs. `vi.hoisted(() => ({ spy: vi.fn() }))` at module scope, then
the mock. Two tests failed with "upsert is not defined" before the reason was obvious.

**13. The wait script said `::CI FAILED::` and exited 1 — and my pipe reported 0.** `bash
scripts/wait-for-deploy.sh <sha> | tail -3` returns `tail`'s status. The script did exactly what it
was written to do after false green 1; the invocation threw the answer away, and two proof runs were
launched against a build that had never deployed. **The rule: never pipe a gate.** Run it bare, or
`set -o pipefail`, and print `exit: $?` on its own line. The same push had a second slip behind it:
the last local full-suite run predated the last commit, so a hygiene test CI enforces (every script
listed in `scripts/README.md`) failed in CI and not on the laptop. **The suite runs after the last
edit, not after the last big one.**

**14. Two hosts, one page name, and each worker proved a different one.** Found 2026-09-14 by
comparing CC's Phase 6 report with CW's Task 5 read. CC generated `/privacy` and `/terms` from the
schema and scopes and verified them — on **`app.navaal.ai`** (Last updated 14 September: 14-day
trial, 250 credits, Neon, Anthropic key disclosed, `hello@`). CW read the pages the **listing links
to** — **`navaal.ai/privacy`** (4 Sep) and **`navaal.ai/terms`** (8 July, static, Hostinger): 7-day
trial, "25 generations", "two months free", no key disclosure, `support@`. **Both reports were
true.** The listing's Privacy policy URL points at the stale host. Cowork confirmed all four URLs
with cache-busted reads.
**The rule:** a claim about "the privacy page" or "the terms" names the **host**. Any document that
exists at more than one URL is verified at every URL a merchant or reviewer can reach, and the one
that is linked from the listing is the one that counts.

**Tooling facts recorded so nobody re-diagnoses them as app defects (CW, 2026-09-14):**
- The Claude-in-Chrome extension's clicks and scrolls **do not reach the app's cross-origin
  iframe**. Three clicks on *Upgrade to Growth* did nothing; Playwright worked first time. The
  earlier *"something painted over the Generate button"* and *"the iframe won't scroll"* were this,
  not the app.
- `curl` on an App Store search URL returns a ~99 KB shell with **zero result cards**. Any
  curl-based rank check is a guaranteed false green; ranking is read in a real browser. Detector
  sanity: searching `navaal` returns slot 1.
- App history in the Partner Dashboard renders in **local AEST**; the Versions page renders in
  **+0000**. Convert before comparing either to a commit time.

**15. The suite ran, showed red, and a `;` let the push through.** Phase 9 Part C: `npx vitest run
… | head; git add …; git commit …; git push`. The suite printed one failure (a hygiene test) and the
next command ran anyway because `;` does not care. Same family as 13 (a pipe returned the wrong
exit) — a gate that is *displayed* is not a gate that is *enforced*. **The rule: capture the exit
code and branch on it** — `npx vitest run > log; rc=$?; if [ $rc -eq 0 ]; then … push …; fi` — and
never `;` between a check and a push. `6d7f556` is the fix; `ae731f3` never deployed.

**16. A control proved by its route.** `/app/review?product=<id>` works and was proved working
three times (`11c5bbf`, `f77eef9`, Phase 11 Part C). The row's `[Review]` button — an href-less
`<button>` — still landed on `/app/products/<id>` every time CW clicked it. **The rule:** a
merchant-facing control is proved by **clicking it in a browser and reading where it landed**, never
by asserting on the route it was meant to reach. A loader test proves the destination exists; only
a click proves the button goes there.

**17. A sweep that matched a domain, not an install.** `navaal-qa-fresh` was deleted every ten
minutes for a day: an old `shop/redact` request, keyed on the domain, found the *new* Shop row each
reinstall created and finished the redaction again, while token exchange kept the app serving
screens. Shopify's "installed" and the app's "installed" disagreed and both were, in their own
terms, right. **The rule:** *the domain is not the shop; the install is.* Every destructive action
keyed on a shop is keyed on the install it belongs to, and probes Shopify before believing a
delivery. CW's refusal to uninstall the only live example is what made the diagnosis possible.

## FALSE GREENS 16 AND 17 — found 2026-09-15, Phase 11

**#16 — a control proved by its route.** *(CW's, numbered here so it does not collide with #15.)*
FR13 was proved twice: the loader scoped `/app/review?product=<numeric id>` correctly, a read-only
harness loaded that URL and counted one card, the row button's `onClick` read `navigate("/app/
review?product=…")` in the source. Nobody clicked the button. When CW did, it landed on
`/app/products/<id>` — the handler ran, and then the click bubbled into the `ResourceItem`'s own
`onClick`, which navigated last. **A route is not a control. The proof of a button is a click that
reads `location` afterwards** (`tools/proof/fr13-click.mjs`), not a loader test and not a grep of the
handler. Three sessions accepted the route as the proof.

**#17 — the domain is not the shop; the install is.** `navaal-qa-fresh` was installed, served every
screen, and had no Shop row: an old `shop/redact` request (12 Sep, for the 10 Sep uninstall — correct
then) was found by the ten-minute sweep on every run, matched by **domain** to the **new** row each
reinstall created, and "finished" — every per-shop row deleted, the row anonymised — minutes after
every install, five times in one day. Every guard passed; the sweep's own log line said *"Redaction
owed but incomplete — finishing"* as if it were being diligent. **Any durable "work owed" marker keyed
on an identifier that outlives the thing it was about will be re-applied to the next thing that
identifier names.** Consume the request once (`completedAt`); a request older than the current
install is for the install before it; and before deleting or flagging, ask the system that actually
knows — Shopify's token answers or it does not. In the runbook as the first thing to check when a
store "has no row".

**#19 — the locale page renders before the translation exists.** `apps.shopify.com/…?locale=de`
served a German title, German feature bullets and `14-tägige` on 2026-09-15 while the German
listing sat unpublished in the editor. Shopify machine-translates every listing into every store
locale and marks it with one line — *"Enthält automatisch übersetzten Text"* (de), *"Contient du
texte traduit automatiquement"* (fr) — so "switch the public listing to German and confirm the five
bullets render" passes on day zero with nobody having published anything. The machine copy also
uses *du* where the register decision says *Sie*. **The proof that a translation is live is the
absence of that line plus one string only we would write:** for German, bullet 3 reads
`KI-Beschreibungen, Meta-Tags, Alt-Texte und FAQs in Ihrer Markenstimme` (ours) and not
`…in deiner eigenen Markenstimme` (Shopify's). Same shape as #12: a surface that looks right for a
reason other than the change you made. Read the reason, not the surface.

**A red that was not one, recorded alongside (2026-09-15).** "`blog/feed.xml` is 8 posts behind the
index (20 vs 28)" went to CC as a build task. `scripts/gen-sitemap.cjs` line 14: the feed is *"RSS
2.0 with the 20 newest posts"* — a cap by design. The seven absent posts are all older than the
oldest item in the feed (checked page by page: July and late-August dates against a 30 Aug floor).
Nothing to regenerate; the row is withdrawn. **A count mismatch is a defect only after reading the
rule that produces the count.**

## THE LISTING UPLOADER: WHICH ROUTES CAN FIRE A POLARIS DROPZONE, AND WHICH CANNOT (CW, 2026-09-15)

Recorded so nobody tries the dead routes again. The App Store listing editor's screenshot slots are
`.Polaris-DropZone`, each wrapping a hidden `<input type=file>`.

**Cannot fire it — do not retry:**

- **A synthetic `change`/`input` event** on the input (`dispatchEvent(new Event('change',{bubbles:true}))`).
  Page script. No reaction, no network request.
- **A synthetic `drop`** on the DropZone element with a built `DataTransfer` (`dragenter`/`dragover`/`drop`).
  No preview, and `read_network_requests` returned **no requests at all**.
- **The Chrome extension's `file_upload` tool.** The file genuinely lands on the input —
  `files[0].name = "02-review-desktop.png"`, `size 210810`, `type "image/png"`, read back off the
  element — and the DropZone still ignores it. This is the trap: the *input* is correct and the
  *listing* does not change. It is page-script-originated and therefore untrusted, so Chromium does
  not fire the trusted `change` the DropZone listens for.
- **The extension's `upload_image` tool.** Accepts only a screenshot id from the computer tool, not a
  file on disk. It cannot carry a 3200×1800 asset.
- **Desktop automation of the native file dialog** (`computer_*` tools on the owner's Windows Chrome).
  `computer_resolve_access` answers: *"Browsers can only be granted in 'read' mode — you can see what
  is on screen but cannot interact."* Screenshot only. No click, no typing, so no file dialog.

**A local preview is not an upload (Cowork, `85730cd`).** The obvious success test — "the slot's
preview changed" — is wrong on its own. A DropZone that accepts a file paints it immediately from a
`blob:` object URL, before anything leaves the browser. A `blob:` or `data:` src therefore proves the
component took the file and proves nothing about Shopify having it. The test is a **hosted** `https://`
src (these are `storage.googleapis.com/shopify-app-store-partner-uploads/...`) **or** a 2xx upload
response on the wire. Anything else aborts before Save. This is the same shape as false green #20:
alt text saved fine while the pictures underneath never changed.

**Can fire it:** **Playwright `setInputFiles`.** It goes through CDP `DOM.setFileInputFiles`, so
Chromium itself fires a trusted `change`. This is how Polaris DropZones are tested.

**But not from the device VM.** Two independent blockers, both read off the machine:

1. **No display.** `DISPLAY` is empty; only `Xvfb` is installed. A headed context runs on an invisible
   virtual framebuffer. There is no window for the owner to sign in to.
2. **No process outlives one call.** Every `device_bash` call runs inside
   `bwrap --dev-bind / / --proc /proc --unshare-pid --die-with-parent`. `setsid`, `nohup` and `disown`
   all die when the call returns (confirmed twice: exit 143, and a fresh PID namespace on the next
   call). The ceiling is a single synchronous run of ≤180s — not enough for a human sign-in.

Proven, not assumed: a synchronous headed launch under Xvfb reached the editor URL and landed on
`accounts.shopify.com/lookup`, `title: "Log in — Shopify App Store"`, `fileInputs: 0`, `dropzones: 0`.
The route works; the device cannot host the sign-in.

**So the harness runs on Windows, where there is a screen:** `tools/proof/listing-upload.mjs`.
`node tools\proof\listing-upload.mjs` from `C:\Users\PC4\contentclaude`. It opens a real Chromium
window, stops at the login wall and *watches* — it never types an email, password or code — then does
all three slots one at a time, waits for each preview `src` to become a new id before the next,
sets the three alt texts, saves **once**, and reads back on a fresh load. It aborts before any Save
if a preview does not change, so a repeat of false green #20 cannot be written.


### The 2026-09-15 11:43 run: `setInputFiles` alone was silent here too

First real run on Windows. The owner signed in; the editor loaded
(`.../partner-app-submissions/1279a14cca41d4a6f8e6e3c485870b77/en`, "English listing · Live ·
Primary"). The map resolved cleanly — the three current alt texts paired with **three distinct** file
inputs (4 on the page), so Cowork's collision guard passed. Then, on slot 1:

```
preview before : storage.googleapis.com/.../833f11b5-694c-43c3-8297-24d1343c2744.jpeg
preview after  : storage.googleapis.com/.../833f11b5-694c-43c3-8297-24d1343c2744.jpeg   (unchanged)
waited         : 120000 ms
network        : []          <- not one request
ABORT: slot 1 did not take the file - stopping before any Save, so nothing is written.
```

**The guards did their job: it aborted before Save, so the listing was not touched.** Three
screenshots, three original alt texts, unchanged.

So the CDP claim needs narrowing: `setInputFiles` fires a trusted `change` in general, but on *this*
control it produced no preview, no `blob:`, and no request — the handler did not run at all. The
untested half of Playwright's file support is the one the DropZone is actually built for: **clicking
it opens Chromium's own file chooser**, which Playwright intercepts with
`page.waitForEvent('filechooser')` + `fileChooser.setFiles()`. `1c8d945` tries that first, falls back
to `setInputFiles`, and after each attempt reads `input.files` back — the one fact that separates
*the file never landed* from *the file landed and the app ignored it*. Until that run reports, the
right description of the DropZone is **"no route has fired it yet"**, not "Playwright fires it".

### RESOLVED 2026-09-15 12:58Z — no script route fires this DropZone; the owner's click does

The owner uploaded 02/03/05 by hand. **The files must be exactly 1600×900** — the editor's own
words; 3200×1800 is *rejected*. So `listing-assets/README.md` ("a 1600×900 frame is a 3200×1800
PNG") and the capture harness's 2× hurdle were both wrong, and the harness's own new guard would
have refused the files that actually work. Routed to CC at `98d1fa0`; the working files are in
`listing-assets/1600x900/`.

Final state of the route table, so nobody re-opens it:

| route | fires the DropZone |
|---|---|
| synthetic `change` / `input` on the input | no |
| synthetic `drop` with a built `DataTransfer` | no |
| extension `file_upload` (file genuinely lands on the input) | no |
| extension `upload_image` | n/a — screenshot ids only |
| desktop automation of the native dialog | n/a — browsers are read-only to `computer_*` |
| Playwright `setInputFiles` | **no** — preview unchanged 120s, empty network log |
| Playwright `filechooser` + `setFiles` | never reached — the size guard would have refused the files |
| **the owner clicking Upload image** | **yes** |

**Two more tooling facts, both found while typing the alt text (CW, 2026-09-15):**

- **A `ref`-based click does not actuate this page's sticky Save.** `computer left_click` with
  `ref` reported "Clicked on element" twice and produced **no non-GET request at all** (checked with
  a `fetch`/`XHR` recorder installed before the click) while "Unsaved changes" stayed up. A
  **coordinate** click on the sticky bar saved immediately — "App listing saved". Read the bar's
  position off a fresh screenshot each time: the page scrolls under it, and a stale y is how the
  next fact happened.
- **`+ Add` creates an empty slot that blocks Save.** A coordinate click 42px low hit *Add* instead
  of *Save* and created SCREENSHOT 4 carrying `An image is required` and `Alt text is required`.
  An empty slot fails validation, so Save cannot succeed until it is deleted. Screenshot, click,
  screenshot — never two clicks between looks.
