# DECISIONS — settled. Do not re-litigate.

> **⚠️ SUPERSEDED IN PART, 2026-09-10.** This table was set before the market research in
> `10-MARKET.md` and the doctrine in `09-DOCTRINE.md`. **Three rows are now banned outright and must
> not ship:** `llms.txt` in every tier (Shopify serves it natively on every store), "instant
> indexing" as a phrase (Google's Indexing API excludes product pages), and A/B content testing at a
> 5,000-product cap (statistically undetectable at that size — see `10-MARKET.md` §6). **The whole
> pricing table is re-decided in `11-MASTERPLAN.md` P4.0**, informed by ten real merchants rather
> than a spreadsheet. Until then, treat this file as history, not instruction. Reconciling it line
> by line is item **P0.11**.

To reopen one you must bring **new evidence**, not a preference. Say so explicitly and stop.

---

## PRICING — LOCKED 2026-09-14 BY THE OWNER

**The owner approved `14-PRICING.md` in full on 2026-09-14.** It supersedes every pricing row above
and the "re-decide in P4.0" note in the superseded banner at the top of this file. The table below
is the single source of truth for what the app bills, what the plans page shows, and what the App
Store listing says.

| | Free | Starter | Growth (recommended) | Pro |
|---|---|---|---|---|
| Monthly | $0 | $9.99 | $29.99 | $79.99 |
| Annual (save 20%) | — | $95.90 | $287.90 | $767.90 |
| Credits / month | 100 | 500 | 1,500 | 4,000 |
| Products covered | 100 | 1,000 | 5,000 | Unlimited |
| Bulk generation | ✗ — one at a time | ✓ | ✓ | ✓ |
| Trial | — | 14 days, 250 credits | 14 days, 250 credits | 14 days, 250 credits |

Credit weighting: **alt text 0 credits (unmetered), blog post 3, everything else 1.**
Uniform **2.00¢ per credit** across all three paid plans. Full-burn margin ≥ 42% on every plan.
Packs: 1,000 / $19 · 2,000 / $39 · 4,000 / $79 (one-time, Billing API).
Annual carries a **one-time 2× credit allowance in the first month**.
~~**Grandfather nobody** — there are no paying merchants, so this is the only moment the change is free.~~ **CORRECTED 2026-09-14 (B8): that premise is false and was queried rather than believed.** Production holds **one active paid subscription with a subscription id** (`activePaidWithSubscription: 1`, `pro:active 1`, read at `8831444`). Whether it is a real charge or a `(Test)` charge on a dev store is the one thing the query deliberately cannot say — it prints no shop domain and no subscription GID, because that output goes into a CI log — so it is routed to the owner in `OWNER-CHECKLIST.md`. **The change was NOT rolled back**, because every part of it is neutral-or-favourable to a Pro subscriber: credits 1,000 → 4,000, annual $799.90 → $767.90, alt text 1 → 0 credits, Pro already unlimited on products and already had bulk. Rolling back would cut their allowance to a quarter. The one line that moved against them is a blog post at 3 credits where it was 1, which is not a constraint at 4,000.

### CONTENT COUNTS — DECIDED 2026-09-14 (P5.1, recorded properly in P6.0). They are a record of OUR WORK, not a description of the storefront. Do not join them to Shopify.

`getContentMetrics` groups `GeneratedContent` by `shop` and `productId` and **joins to nothing in
Shopify**. It therefore keeps counting a product after the merchant archives it, and after they
delete it.

**That is correct, and the arithmetic proves the number is right rather than merely defensible.** On
`contentpilot-dev2` it reports 30 against 15 products actually on sale — and the 15 missing ones are
real: **17 archived products were generated for, 15 of them published to**, measured in production
by `archived-generations-diag.mjs`. 30 − 15 = 15, exactly the live count. Two numbers arrived at
from different directions and met.

**The tempting "fix" is destructive and will look like a bug fix.** Joining to product status so the
count "matches the catalogue" would destroy the only record of work this app actually performed and,
on a paid plan, **charged for**. A merchant asking *"what have I got for my credits"* would be shown
a smaller number every time they tidied their catalogue. It would also put a Shopify API call inside
a count that renders on four screens.

**The word beside the number was the defect, and only the word.** *"30 live"* and *"Live on your
storefront: 30"* were claims this data cannot support. They now read *"30 with content published"*
and *"AI Content Published — Products we have published content for"*. A test walks every `.jsx` in
`app/` and fails on any screen that describes these rows as the merchant's storefront.

**If a screen ever needs "how many of my LIVE products have content"** — that is a different number
with a different name and it needs the join. Add it beside these; do not redefine these.

The reasoning also lives at the top of `metrics.server.js`, because that is the first file a future
session opens and the change it will be tempted to make is the wrong one.

---

### ARCHIVED-PRODUCT CREDITS — DECIDED 2026-09-14 (P5.1). NO REFUND IS OWED, because no merchant paid.

The P5.1 brief required this: *"If it is non-zero, the fix is twofold — stop it happening, and
decide whether those credits are refunded."* It is non-zero. **17.**

`app.optimize.jsx` walked the catalogue with no `query` argument, so bulk optimize enqueued
generations against products merchants had deliberately archived. Under the pricing that shipped in
Phase 4 that is real credits at 2.00¢ each.

**Read from production at `0e52284`, 2026-09-14, by `archived-generations-diag.mjs`:**

| | |
|---|---|
| Archived products we generated for | **17** |
| … of those, we also published to | **15** |
| Shops holding generated content | 9 |
| Shops unreachable (uninstalled, HTTP 401) | 2, both `app-review-*` |

**All 17 are on `contentpilot-dev2`, which is our own development store.** Every other reachable
shop returned **0**, including the one where the exposure would have been largest: `r20bcm-2d` holds
**1,518 archived products** and we generated for none of them.

**So: no refund, because no merchant was charged.** That is a finding, not a judgement call — had
the number landed on a merchant shop, the answer would have been to refund, because they did not ask
for it and could not see it happening.

**What is NOT claimed.** Two shops could not be read: their offline tokens no longer authenticate,
which means the app is uninstalled there. They are reported as `reachable: false` rather than
counted as zero, because an unreachable shop is an unknown and folding it into a total is how a
reassuring number gets manufactured. Both are Shopify **App Review** stores, so a charge on either
would have been a test charge on Shopify's own reviewer sandbox.

**The same 17 also closes the "30 live" arithmetic**, which is the reason to trust it: dev2 holds
content for 33 products and has published to 30, of which 15 are archived. 30 − 15 = **15 real**,
against exactly 15 active-and-draft products on the store. Two independent numbers meeting is worth
more than either alone.

**Re-runnable, read-only:** the **Archived generations check** workflow in GitHub Actions.

---

### BYO KEY — DECIDED 2026-09-14 (P5.5), BEFORE THE CODE WAS WRITTEN

**A generation run on a merchant's own AI key costs them ZERO credits. It is still RECORDED.**

The question the brief required settling first: do generations on a merchant's own key still consume
credits for accounting?

**Why zero, and it is not close.** If a BYO-key generation still cost a credit, the merchant would be
paying us $79.99/month AND paying Anthropic directly AND still be capped at 4,000. There is no
merchant for whom that is a good trade, so the feature would exist and go unused — which is worse
than not building it, because it is a promise on a plan card that nobody can benefit from.

**What we are actually selling at Pro with a key attached is the software, not the inference.** The
credit is a unit of MODEL SPEND — `14-PRICING.md` §4.1 prices it at a uniform 2.00¢ and
`08-ECONOMICS.md` §2 derives that from measured per-generation cost. When the merchant pays for the
inference, our cost per generation falls to worker time, one database row and one Shopify API call.
Charging a spend-denominated unit for spend we did not make would be charging for nothing.

**"Zero credits" is not "unrecorded".** Every BYO generation writes a `UsageRecord` with
`credits: 0`, exactly like alt text does today. That shape already exists and is load-bearing: it is
how we keep observability, per-shop volume and the `tokensUsed` accounting without metering. A
feature that makes usage invisible would take out the only instrumentation that tells us what Pro
merchants actually do.

**What still bounds it.** Not credits — the concurrent-job cap, the autopilot daily cap of 50
products, and the Pro plan's own scope. Unlimited generations at zero marginal inference cost is an
acceptable exposure; unbounded CONCURRENCY is not, and those bounds are unchanged.

**The UI must say which, on the Settings card and on the plan card**, not in a help article: *"While
your own key is in use, generations don't count against your monthly credits."* A merchant
discovering the billing rule after the fact is the same class of failure as the trial length.

**Not negotiable, and restated here because this is the row someone will be tempted to relax
(L9):** the key is stored **encrypted**; it is **never logged, never returned to the client, never
in an error message — not the key, not a prefix, not a length**; it is **validated on save with one
real cheap call**, because a key that first fails at 2am mid-bulk-job is a support ticket and a
refund; and if it fails mid-job the job **PAUSES and tells the merchant** rather than silently
falling back to our key and our money.

---

**What this decision closes:** the first OPEN item below (free-tier model spend) is answered — the
free ceiling is ≈$1.51/shop/month and it is accepted. The rest of the arithmetic, the competitor
comparison and the eight build items are in `14-PRICING.md`; do not restate them here.

**What it does not license:** none of these numbers may appear on the App Store listing until the
code actually bills them (App Store requirement — the listing must match the app). The listing plan
table is updated only after the billing change is live in production. That is queue item H12.


---

## ⛔ ARCHIVE — THE PRICING TABLE THIS FILE USED TO CARRY. NOT INSTRUCTION. DO NOT PUBLISH.

> **Superseded in full on 2026-09-14 by `## PRICING — LOCKED` above.** Kept only as the reasoning
> that produced the locked table. **Every price, tier count and feature row below is wrong now:**
> five tiers at $19/$49/$99/$299 became four at $9.99/$29.99/$79.99, and the `llms.txt + instant
> indexing` row names two things `09-DOCTRINE.md` §2 bans outright (Shopify serves llms.txt free on
> every store; Google's Indexing API excludes product pages). **A session that publishes from this
> table publishes false prices and banned claims.** Found by CW on 2026-09-14, because two sections
> in this file both matched "§PRICING" and this one came first.

| | Free | Starter | Growth ★ | Scale | Enterprise |
|---|---|---|---|---|---|
| Monthly | $0 | $19 | $49 | $99 | $299 |
| Annual (25% off, 3 months free) | — | $171 | $441 | $891 | $2,691 |
| **Products** | 150 | 1,000 | 5,000 | 25,000 | Unlimited |
| **Generations/mo** | 150 | 1,000 | 5,000 | 25,000 | Unlimited (own key) |
| Full catalogue audit | ✓ | ✓ | ✓ | ✓ | ✓ |
| Descriptions, meta, alt, FAQ | ✓ | ✓ | ✓ | ✓ | ✓ |
| llms.txt + instant indexing | ✓ | ✓ | ✓ | ✓ | ✓ |
| Brand voice, store score | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bulk generation | — | ✓ | ✓ | ✓ | ✓ |
| Templates, version history | — | ✓ | ✓ | ✓ | ✓ |
| Indexation proof | — | ✓ | ✓ | ✓ | ✓ |
| **AI visibility** | — | 5 prompts / 1 rival / monthly | 20 / 3 / weekly | 50 / 8 / weekly | 200 / unlimited / daily |
| Visibility report email | — | monthly | weekly | weekly | weekly |
| Search Console result proof | — | — | ✓ | ✓ | ✓ |
| Autopilot, collections, blog | — | — | ✓ | ✓ | ✓ |
| A/B content testing | — | — | ✓ | ✓ | ✓ |
| Control-group proof, bulk undo | — | — | — | ✓ | ✓ |
| Multi-language | — | — | — | ✓ | ✓ |
| Markets, B2B, audit trail, roles | — | — | — | — | ✓ |
| Onboarding call, 1-business-day response | — | — | — | — | ✓ |
| Trial | — | 14 days | 14 days | 14 days | 14 days |

**Add-ons, any paid plan:** generations $10/2,000 · $25/6,000 · $50/15,000 · prompt pack $15/20 ·
extra competitor $10 each · done-for-you setup $750 one-time (contact action, not self-serve).

---

## THE REASONING, so judgement calls stay consistent

| Decision | Why |
|---|---|
| Gate on **catalogue size**, be generous on generations | Free to enforce, matches how merchants think, and bounds the one-time burst. Catalogue optimisation is a burst then maintenance, so a generous cap costs little over 12 months. |
| **Bulk at the FIRST paid tier** | Bulk is the reason anyone pays. Gating it at tier three is what made the primary button a dead end for every Free merchant. |
| **AI visibility in EVERY paid tier** | Generation is a project; monitoring is a subscription. This is the churn fix. 5 prompts at $19 costs cents and makes every paid tier recurring from day one. |
| **Audit never capped** | Competitors cap free audits at 20–25 pages. Uncapped is the hook: a 3,000-product store on Free sees all its problems and can fix 150. |
| **Enterprise = bring your own key** | Removes the COGS ceiling entirely and the merchant's fear of running out. Smart SEO validated it at $49.99. |
| **Annual 25% off, default toggle** | In a churn-prone category, prepay is the best retention money can buy, and it funds free-tier model spend. |
| **14-day trial** | Competitors run 3–7. SEO cannot prove itself in a week; the citation probe can prove itself in one run, so a longer trial favours us. |
| **Rejected generations never billed** | Costs nothing, nobody else has it, and it is a trust line for the listing. |
| **Round prices, not .99** | Reads as a business tool. We compete on proof, not on being cheapest. |
| **No "SLA" or "dedicated account manager"** — the words only; the human service stays, reworded per `12-OFFER.md` §6 | At 0 reviews one unmet promise halves the rating. "Onboarding call" and "guaranteed 1-business-day response" are keepable. |

---

## PRODUCT DECISIONS

| Decision | Locked |
|---|---|
| **No keyword rank tracker.** Use Search Console's own position data. Commodity, noisy, months of work, differentiates nothing. | ✔ |
| **Never charge for or lead with llms.txt.** Avada gives it away free with 393 reviews. | ✔ |
| **Do not compete on price at the utility layer.** SEOLab is #5 with 2,590 reviews and is entirely free. | ✔ |
| AI probes carry an honest method label naming the model and the method, on every screen and email. | ✔ |
| Five-item nav stays. Nothing is added without removing something. | ✔ |
| Two severities on every gate (L6). | ✔ |
| EBS is an instrument, not the customer (L13). | ✔ |
| **One privacy policy, two parts, one generator.** CW found `navaal.ai/privacy` is not a stale copy but a *two-part* policy — Part 1 the website and the free Bilby scan (first-party beacon, device class, coarse location), Part 2 the app — while `app.navaal.ai/privacy` covers only the app and is current. Neither alone is complete. Decision: `legal.js` gains Part 1 (website + Bilby, taken from the current navaal.ai text, kept as constants) so the generated page covers both; **only then** does `navaal.ai/privacy` redirect. The **terms** redirect is safe now (the 8 July terms are app terms, stale). Decided 2026-09-15. | ✔ |
| **Listing images ship in parts.** Three clean desktop frames (Review, Products, Settings) replace the live launch screenshots now — a live listing with three honest images beats one with Shopify-admin screenshots and a Sidekick glyph. Home and First-run are added when their frames stop contradicting themselves. Decided 2026-09-15. | ✔ |
| **Generation language defaults from the store's primary locale at install.** CW's French shape store got English drafts because `brandVoice.language` defaults to `en` regardless of the shop. A merchant must never have to find a setting to get their own language. Settings can override. Decided 2026-09-15. | ✔ |
| **Credits reset on the first of each calendar month, whatever the billing date.** CW found `/terms` says calendar month while Shopify bills every 30 days. The code already resets by calendar month; that is **merchant-favourable** (a subscriber on the 20th gets a full allowance, then a full reset on the 1st) and simple. Kept. The terms and the plans page must say the consequence out loud: *"Credits reset on the first of each calendar month, whatever your billing date. Your first, partial month carries a full allowance."* One sentence, both places, one test that they agree. Decided 2026-09-14. | ✔ |
| **The five listing feature slots after Phase 2** are `12-OFFER.md` §5.6, in that order. Blog/collection and publish-verification lines dropped; the bulk-fix line goes in the details paragraph, never a headline slot, because bulk is Growth+. Decided 2026-09-14. | ✔ |
| **`/privacy` states a transfer basis, not only processor locations.** CW: four US processors named, no international-transfer clause, and the superseded copy had one. Generated from the processor list so it cannot drift; relies on each processor's DPA / standard contractual clauses, linked. **Not legal advice** — the owner has counsel read both pages before the tenth merchant. Decided 2026-09-14. | ✔ |
| **Third-party product names (Google, ChatGPT, Bing, Perplexity) may appear in listing copy descriptively** — as the surfaces the content is *for* — never as a claimed partnership, endorsement or integration, never as a logo or wordmark in any image (4.4.3 covers Shopify's marks; ours is the stricter rule). The live subtitle `Content Google ranks and ChatGPT quotes — you approve it first` stands. Decided 2026-09-14 on CW's flag; CW found no rule against it and neither did Cowork. | ✔ |
| **The funnel is timestamps only, one row per shop, and its stages are counted independently** (installed → first screen → first draft → first approve → first publish → returned on a later day → uninstalled; Phase 10 Part B). No PII, no product content, no merchant name in any funnel log; the weekly digest to the owner is counts and median hours over non-test shops, Monday 08:30 Sydney, and does not send when there is no non-test shop. Stages are independent, not a chain, because first-screen and first-approve were stamped from 15 Sep 2026 and earlier installs have no such stamp. "Returned" means a LATER calendar day than the install day — a same-day reload is not a return. Nothing from the funnel reaches a merchant screen or the listing. | ✔ |
| **A store that has products but none on the Online Store is told that, never "add a product."** The first-run scan is scoped to Active products on the Online Store (the same population as the audit and the walk); an all-draft or trade-only store therefore scans as empty. The screen says *"Your products aren't on your Online Store yet"*, names drafts / archived / another channel, and opens the product list. "Add a product" is only for zero products. (Phase 10 Part C, the ALL_DRAFT and B2B_ONLY cells.) | ✔ |
| **The navaal-shape-* dev-store catalogues arrive by Shopify CSV import, not by API writes from the app.** CSV import publishes to the Online Store from its own column and creates variants with barcodes; the API path would need `write_publications`, a scope deliberately not held. The files are generated from the matrix's own fixtures so the store is the fixture made real. The app never writes products to any store. | ✔ |
| **Shopify's token is the fact; the app's install flag is a belief.** Before any uninstall or redaction is acted on — the `app/uninstalled` delivery, the `shop/redact` delivery, the ten-minute sweep's "owed" work, and nightly for every row — the app asks Shopify whether the shop's offline token still answers `shop { name }`. A token that answers means the shop is installed, whatever the row or the delivery says; the delivery is acknowledged and not executed (re-probed 30 s later for `app/uninstalled`). A token that is refused on an installed row is counted and logged, never stamped — deleting on a 401 is the mistake in the other direction. (Phase 11 Part A, 2026-09-15.) | ✔ |
| **A `shop/redact` request is consumed once, and never applies to a later install of the same domain.** `GDPRRequest.completedAt` marks it done; a request older than the current row's install is a request for the install before it — superseded, consumed, logged, nothing deleted. The domain is not the shop; the install is. `shop/redact` for a shop whose token still answers is recorded and marked complete, not executed: Shopify sends it 48 h after an uninstall even when the merchant reinstalled inside the window, and the data goes when the shop actually uninstalls, at uninstall time, as it always has. (Phase 11 Part A; the mechanism that deleted `navaal-qa-fresh` five times on 14 Sep.) | ✔ |
| **Who a shop is, is a classification, not a pattern.** `Shop.kind` ∈ ours / shopify / real / unclassified, default unclassified, seeded from CW's ledger through the Shop kind workflow. Our own handle is ours whatever the row says and can never be classified real. Every count that means "merchants" — the funnel, the Monday digest — counts real only, excludes anonymised ghost rows at the query, and reports unclassified as a number that is never silently a merchant. A new install is unclassified until the owner or CW says otherwise. (Phase 11 Part B.) | ✔ |
| **Generation language defaults from the store, never from "en", and without a new scope.** Shopify's `shopLocales` (the primary locale) needs `read_locales`, a scope this app does not hold and will not add (a scope change re-prompts every installed merchant). Three scope-free signals decide the default, in order: the language the catalogue's own copy is written in (detected, confidence ≥ 0.5 over ≥ 20 words), the admin locale Shopify passes to the embedded app, then the shop's country; else English. The first run names the language and its source on the splash; the brand voice is created with it; `Shop.locale` records it, refreshed on every scan; Settings overrides everything and warns when the extracted copy reads as another language than the setting. (Phase 12 A5, after `navaal-shape-fr` was written in English with French in its own keyDifferentiators.) | ✔ |
| **The first screen a new merchant sees is a result, never a task.** Until the first publish, Home leads with what the first run found — the three lowest-scoring products with their scores (durable, from ProductScore, so FR8 has a route back) and the walk's findings — and the theme-embed step is one dismissible line; the setup card is promoted only once there is published content for it to show. (Phase 12 A4, frame 04.) | ✔ |
| **One window for "what changed" on Home.** The autopilot banner counts from the score card's baseline moment and names the same date; with no baseline both fall back to the last 24 hours and say so. Two sentences about change on one screen never read from two clocks. (Phase 12 A3, frame 01.) | ✔ |
| **A malformed link is a notice, never a status.** `/app/review?product=<anything but a numeric id>` shows every draft under "That product link was malformed — showing all your drafts"; the empty state is only for no drafts. A false all-clear is worse than the fallback it replaced. (Phase 12 A2.) | ✔ |

| **The English string is the key, and a catalogue ships only to the merchant on that language.** `t("Review drafts")` returns the English in English and the catalogue's value elsewhere, so English is unchanged by construction and 4,300 source guards keep their meaning; a locale is live only when its catalogue is complete (the test refuses a missing key, a lost placeholder, an informal address, a translated credit unit or plan name). Catalogues never sit in the shared bundle: each is a lazy chunk fetched only on that locale, registered on the server at boot, awaited by the browser before hydration; the budget measures a locale on its own line. (Phase 12 D0/D1, 2026-09-15.) | ✔ |
| **A loader ships data, never a sentence; a stored English sentence is translated back by its key.** Shopify rewrites the embedded app's query string with its own locale on every document load, so a sentence made in a loader is in the wrong language on the first load and the start payload is cached — every merchant sentence is made where it is shown, by the screen's translator, from the loader's data (`blockerLine`, `windowLabel`). Sentences the app stores (a finding's note, a job's error, a verification note) are produced from a key through the English identity and translated back on the screen by that key, plain `{name}` placeholders only. The public legal pages render in every live language from the same constants, same anchors, English binding. (Phase 12 D1, found on the production read-back.) | ✔ |

---

## OPEN — owner only, do not decide these yourself
- [ ] Free tier model spend (~$0.75/active free install/month) — acceptable ceiling?
- [ ] Onboarding call + 1-business-day response at Enterprise — confirmed honourable? (owner said yes; keep until written)
- [ ] navaal.ai/tools — keep or cut (it exists and now carries the install link)
- [ ] Bilby ↔ Navaal bundling: one company, two products, shared probe
- [ ] Done-for-you at $750 — process before promotion
