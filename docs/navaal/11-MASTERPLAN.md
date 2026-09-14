# MASTERPLAN — how Navaal becomes #1, and stays useful for a hundred years

**Revision 2, 2026-09-10.** Built on `09-DOCTRINE.md` and `10-MARKET.md`, then rewritten after a
hostile review found four fatal flaws in revision 1. The review's central charge was right and is
recorded here so it cannot be forgotten:

> *"This is a rigorous argument for why the category's products are dishonest, followed by a roadmap
> in which no merchant has a reason to pay money at any point in the first three months."*

Revision 1 had no purchase moment. Revision 2 is organised around one.

---

## 1. THE STRATEGY, IN ONE PAGE

**What we are:** the Shopify app that **keeps a store eligible** to be found by search and AI
shopping surfaces — every day, not once — writes product content that is **evidence rather than
adjectives**, and **proves whether it worked** against a control.

**The purchase moment, named explicitly.** A merchant pays because something in their store breaks
and we tell them the day it breaks. A theme update drops the structured data. A bulk import wipes
barcodes. A developer edits robots.txt and blocks `OAI-SearchBot`. An app changes canonicals. Their
feed starts getting rejected. **Eligibility is not a state, it is a thing that decays** — and
watching it decay is a subscription, while auditing it once is a lead magnet that churns the moment
the list is empty.

**The three pillars, re-ordered by how fast each returns something a merchant can act on:**

| Pillar | What it is | Time to first value | Why defensible |
|---|---|---|---|
| **1. ELIGIBILITY MONITORING** | Daily checks across Google, Bing, OpenAI's feed spec and Shopify Catalog: crawler access, indexability, canonicals, attribute completeness, policy completeness — with **change detection and alerting** | **Minutes**, then forever | Documented and causal. Cross-surface in one view, which Shopify will never build. Bulk remediation, which Shopify will never build. Historical state, which a copycat cannot fake. |
| **2. PROOF ON BING FIRST, THEN GOOGLE** | IndexNow submission holdout → causal time-to-crawl. Then Bing citation and query data via its **REST API**. Google's engine later, for large catalogues | **72 hours** | Bing has an API; Google does not. This is the only causal loop that needs no third-party approval, no OAuth, no minimum catalogue size, and reads out inside a trial. |
| **3. EVIDENCE-DENSE CONTENT** | Specifications, materials, dimensions, compatibility, honest comparisons — from the merchant's own data, never invented | Immediate | Table stakes, priced as such. The one pillar that erodes as competitors adopt (C-SEO Bench: gains are zero-sum), so we do not build the business on it. |

**Plus the qualifying question we are not allowed to refuse.** Every prospect asks *"am I in
ChatGPT?"*. An app called "AI SEO, AEO & GEO" that answers "we don't do that" loses at hello. We
answer it with a **shared per-vertical prompt corpus** (see `09-DOCTRINE.md` §3) — honest, labelled,
per-engine, and affordable because the cost is shared across every merchant in a category.

**What we still will not do:** claim schema or llms.txt lift AI citations; generate llms.txt at all
(Shopify ships it); sell a single blended weekly "AI visibility score"; build a keyword rank
tracker; or state any number without its source, its date and its interval.

**The one sentence, used everywhere:**
> *Get your products into Google, ChatGPT and AI shopping — and see, against a control group,
> whether it worked.*

The outcome leads. The honesty is the reason to believe, one line below. **Naming the customer's
problem in their words is not overclaiming** — see `09-DOCTRINE.md` §0.1.

---

## 2. THE GOAL, WITH THE ARITHMETIC DONE HONESTLY

The owner's goal is #1 in the Shopify App Store SEO category. Here is what that actually costs, so
nobody is told a $10k/month plan is a category-domination plan.

| Rung | What it requires | What it takes |
|---|---|---|
| **Visible** | The **"Increased visibility on key merchant surfaces"** achievement — a published search-ranking boost **without** the manual design review | good standing · App Store requirements · clean uninstall · minimum installs, reviews and rating. **⚠ Re-read by CW 2026-09-14: the Partner Dashboard exposes NO criteria page or state for this achievement** (the strings do not appear on Distribution or Overview); the seven criteria come from shopify.dev only, all mandatory, and **three of them are the same merchant-utility numbers that gate BFS** — minimum installs, reviews and rating, thresholds unpublished. So this rung is not a way *around* those numbers; it is the same numbers without the design review. Two criteria (Partner standing, checkout-speed impact) have no dashboard surface at all. |
| **Credible** | Built for Shopify | **50 net installs from paid-plan shops · 5 reviews · minimum rating · LCP ≤2.5s, CLS ≤0.1, INP ≤200ms at p75 over 28 days with ≥100 calls each** |
| **Top ten among real SEO apps** | ~150 reviews at 4.9 | IndexGPT ranks #8 on **143 reviews**; SEO HERO #16 on 171. Reachable. |
| **#1 among real SEO apps** | Beat **SEOLab: 2,596 reviews, and free** | At a generous 3% install-to-review rate that is **~85,000 installs**. Years, or a deliberate free-tier land-grab. |
| **#1 in the category as displayed** | Beat **Judge.me: 46,689 reviews** | Judge.me is a product-*reviews* app that ranks first in SEO. This is not a target, it is a curiosity of how the category is composed. |

**So the honest ladder is: Visible → Credible → Top ten → #1 among SEO apps.** The first three are
this year's work. The fourth needs a distribution strategy an order of magnitude beyond writing blog
posts — free tier as land-grab, agencies and Shopify Plus partners, and **localisation**, which our
own research says makes listings *"convert up to 4x better in non-English markets"* and which
revision 1 identified as a lever and then assigned to nobody.

**Nothing below is allowed to optimise for rung four before rung two exists.**

---

## 3. THE OPERATING LOOP

Two tracks, permanently parallel — with one exception, written down because revision 1 contradicted
itself on exactly this point.

- **TRACK A — PRODUCT.** Owned by **CC**. Phases below, strictly ordered, each closing on a gate.
- **TRACK B — DEMAND.** Owned by **COWORK**, **CW**, **OWNER**. Runs from day one.

**The exception, and it is a hard gate:** *no Phase 5 (the Google proof engine) code until ten real
merchants exist and at least one has paid.* Everything else runs in parallel. Anything one track
needs from another is routed through `06-QUEUE.md` (L17) and surfaces in `CW-BRIEF.md` and
`OWNER-CHECKLIST.md`.

**Track B is the primary track, not the parallel one.** The owner's calendar is majority outreach
until ten paying merchants exist. Product work is what the agents do while that happens.

---

## 4. THIS WEEK — the two studies that decide whether the plan is right

Both are cheap. Both can falsify a load-bearing assumption before we spend months on it. **Neither
has been done, and until they are, everything after Phase 1 is a hypothesis.**

| ID | Owner | Study | Why |
|---|---|---|---|
| **W1** | COWORK | **The eligibility base-rate study.** Take 300–500 public Shopify storefronts. Run the Pillar 1 checks: robots.txt agent by agent, barcode/GTIN and attribute completeness from public product JSON, canonical sanity, policy pages, image coverage. **Count what fraction have at least one actionable finding, and how many each.** | If the default Shopify store is already eligible — and Shopify auto-generates canonicals, sitemaps, robots.txt, title tags and product schema — then Pillar 1's most common output is "everything looks fine", and the 60-second first run is a churn event, not an activation. **Two days of work either validates the pillar or kills it.** It also produces the only kind of statistic we are allowed to publish: an aggregate about the market, on navaal.ai, which Shopify says is a ranking lever. |
| **W2** | OWNER + COWORK | **The listing-copy test.** Twenty five-minute merchant calls, two listing variants: the bold claim versus the honest claim. Which do they choose, and can they tell the difference? | This falsifies or confirms `09-DOCTRINE.md` §0.1 — that honesty is a retention asset and not an acquisition asset. A week of work de-risks the entire positioning. |

**Kill criteria, written now:** if fewer than **40%** of audited stores have an actionable
eligibility finding, Pillar 1 is a feature and not a product, and the plan changes. If merchants
consistently pick the bolder claim and cannot distinguish substance, the *words* change — the
doctrine does not.

---

## 5. TRACK A — THE PRODUCT

### PHASE 0 — SURVIVAL, MONEY, AND THE CLOCKS THAT ARE ALREADY RUNNING
**Gate:** every dated obligation clear in production · a real subscription taken and refunded on a
dev store · the real cost per generation measured · both calendar-bound approvals submitted.

Revision 1 put billing forty-five items down the list, behind a six-month moat, in a company with
$0.00 revenue and an unverified billing chain. That was the single largest unquantified risk here.

| ID | Owner | Item | Deadline |
|---|---|---|---|
| P0.1 | CC | **CORRECTED 2026-09-14 — THE PREMISE WAS FALSE. No change needed, no redeploy, and the 18-day clock does not bind us.** The row said the theme extension "declares no `api_version` at all" and must be pinned to 2025-10 before 1 Oct 2026 or we would be "frozen out of our own storefront code". The observation was right and the conclusion was wrong: **a theme app extension has no `api_version` to declare.** Acting on this would have added a key the schema does not define to a file that was already correct. Evidence: **(a)** Shopify's *Configure theme app extensions* reference gives the complete property table for `shopify.extension.toml` at `type = "theme"` — `name` (required), `type` (required), `handle` (optional). There is no fourth property. Theme extensions are versioned **as part of the app version**: *"Your app configuration and all extensions are versioned together as a single app version."* **(b)** `.shopify/deploy-bundle/manifest.json`, the bundle the CLI actually built on 2026-09-09, lists `navaal-geo-schema` as `type: theme_app_extension` **carrying no `api_version` field**, while six sibling modules in the same manifest **do** carry `api_version: 2026-04`. Shopify's own bundler emits the key for the module types that have one and omits it for this one. **(c)** The 1 Oct 2026 obligation is the **React → Polaris web components cutover**: *"Version 2025-07 is the last API version to support React-based UI components… avoid being blocked from updating your extension after October 1st 2026."* Every source for it sits in the `checkout-ui-extensions`, `customer-account-ui-extensions` and `admin-extensions` doc domains, and its remedy is swapping React for Preact in an extension's `package.json`. It binds the **`ui_extension` family**. **(d)** We ship exactly one extension and it is pure Liquid — `blocks/faq_schema.liquid`, `blocks/faq_visible.liquid`, `locales/en.default.json`. A search for `react`, `@shopify/ui-extensions` and `polaris` across `extensions/` returns nothing; there is no `package.json` under it to migrate. **We ship zero UI extensions, so this deadline has nothing to bite.** The real exposure was never the extension we have — it is the day somebody adds a UI extension and nobody remembers this. **That is now a CI invariant, not a memory**: see P0.3. | ~~1 Oct 2026~~ **does not apply** |
| P0.2 | CC | **RE-VERIFIED CLEAN 2026-09-14.** Searched the whole source tree (`*.js/jsx/ts/tsx/liquid/toml/json`, excluding `node_modules`, `.shopify/` and `build/`) for every spelling — `scriptTagCreate`, `scriptTagUpdate`, `scriptTagDelete`, `script_tags`, `ScriptTag`. **Five matches, all ours, none of them the API:** `jsonLdScriptTag()` at `app/utils/geo.server.js:239` — a pure helper that builds a JSON-LD `<script>` **string** — and four references to it in `tests/utils/geo.test.js`. Nothing calls Shopify's ScriptTag API in any form. A negative is what an exhaustive search over a whole tree can actually prove, which is why this one is phrased as a search and not a spot check. `scriptTagCreate`/`Update` begin returning user errors; *"applies to all API versions, including older ones, so pinning won't defer it."* — so there is nothing to defer and nothing to do. | **1 Oct 2026** |
| P0.3 | CC | **DONE 2026-09-14.** `scripts/check-api-versions.mjs`, wired into `ci.yml` in the `test` job **before `npm ci`** (it has no dependencies — a version that has already sunset should not wait on an install to say so), and runnable locally as `npm run check:api-versions`. It asserts three things: **(1)** every pin is more than **90 days** from sunset (sunset = release + 12 months); **(2)** every extension whose type **takes** an `api_version` declares one, and it is **≥ 2025-10** — the React → Polaris floor, which is the P0.1 scare turned into an invariant; **(3)** an extension type that takes **no** `api_version` must not declare one. An **unknown** extension type is required to pin, so a type this script has not met **fails loudly** rather than being waved through. It also fails if it finds **no pins at all** — a check that passes by finding nothing is decoration. **Broken on purpose six ways, six red (L1):** theme ext declaring an `api_version` → *"does not take an api_version"*; a `ui_extension` with none → *"requires an api_version and declares none"*; one pinned at 2025-07 → *"is below 2025-10"*; Admin pin moved to April25 → *"SUNSET on 2026-04-01, 166 days ago"*; webhook pin moved to 2026-07 → *"app-level API versions disagree"*; pin renamed away → *"not a dated release"*. Clean tree passes, and the tree was restored clean afterwards. **Current reading: `ApiVersion.April26` (`app/shopify.server.js:55`, `:95`) and `[webhooks] api_version` (`shopify.app.toml:14`) both 2026-04 — 199 days of support left, sunsets 2027-04-01.** *(Correction to this row's own text: `shopify.app.toml:14` is the **webhooks** version. The Admin API pin is `ApiVersion.April26` in `app/shopify.server.js`, exported once as `apiVersion` and imported by `bulkProcessor` and `activeSubscriptions` — already one constant, one place. The check watches both.)* | ✅ done |
| P0.4 | CC | **VERIFIED OPEN 2026-09-14 — confirmed, and wider than this row said. Needs one decision before it can be fixed safely.** **The finding:** `app/root.jsx` — the root document for **every** page — read in full, 49 lines. Its `<head>` holds charset, viewport, title, description, theme-color, four `og:` tags, three icons, a `preconnect`, a `cdn.shopify.com` stylesheet, `<Meta />` and `<Links />`. There is **no App Bridge script and no `shopify-api-key` meta in it at all.** The only `app-bridge.js` string anywhere under `app/` is `app/utils/embedded.server.js:181`, inside the `/reembed` recovery page — one bounce page, not every document. **Why the app still works:** App Bridge does load, via `<AppProvider embedded apiKey={apiKey}>` at `app/routes/app.jsx:171`. Reading the installed package (`node_modules/@shopify/shopify-app-react-router/.../AppProvider/AppProvider.js:76`), that component returns `<><AppBridge/><script src=".../polaris.js"/>{children}</>`, and `AppBridge` returns `<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={apiKey} />`. So the tag is emitted **inside the route tree — in the `<body>`**, not the head. **And it stays there:** React is **18.3.1** (`react@18.3.1` installed). Hoisting a `<script>` into `<head>` is a **React 19** feature; React 18 renders it in place. So this is not a case of it being hoisted for us. **What Shopify documents:** the head, with a meta tag — *"manually add App Bridge in any framework by adding the following script tag to your app's HTML head"*, and the framework example is literally `app/root.tsx` with `<meta name="shopify-api-key" …/>` and the script inside `<head>`. So this row's premise is **sound** — unlike P0.1's. **THE DECISION, and why it is not a typo fix.** Adding the script to `root.jsx`'s head while `AppProvider` still emits its own means **app-bridge.js loads twice on every page**. Removing AppProvider's copy means `embedded={false}`, which per its own type docs also drops *"if the route is loaded outside the Shopify admin, the user will be redirected to the Shopify admin"* — behaviour tied to **App Store rejection 2.1.1**, which cost us four rejections. `root.jsx` also has **no loader**, so exposing `SHOPIFY_API_KEY` to it is a new document-load code path. **Not fixed on a guess.** The proof this needs is the **rendered document** — the real `<head>` of a real authenticated `/app` response, before and after — not a reading of the source. Until that is taken, changing the embedding path risks the one failure that takes the whole app down. **Recommended:** meta + script first in `root.jsx`'s `<head>`, `AppProvider` kept as-is, and a server-render regression test asserting App Bridge is the first script in the head — then confirm from a rendered page that a double load does not warn. | now |
| **P0.5** | **OWNER** | **Prove the billing chain with real money.** Subscribe → upgrade → downgrade → cancel on a dev store; each visible in the Partner Dashboard. Then the 100%-quota upgrade card → Approve → land back in-admin with `upgradePromptSource: "quota100"`. **Half a day. Currently the largest unquantified risk in the company.** | **this week** |
| **P0.6** | **CC** | **DONE 2026-09-14 — measured, and it found something bigger than the cost.** **(a) Measured, not estimated.** `scripts/measure-generation-cost--spends-api-credit.mjs` makes real Anthropic calls through the **real** `ai.server.js` functions on the production machine (a re-implementation would have measured a prompt written for the test, not the one merchants are billed for). 3 samples per type: **alt text $0.000906 · social $0.002747 · collection $0.005103 · enhance $0.008498 · product $0.0115 · blog $0.0300.** **The `ASSUMED ~$0.005` was wrong in both directions** — it understated a product generation by 2.3× and a blog post by 6.0×, and overstated alt text by 5×. A **33× spread** across types; one blended number could never have held. **(b) One constant, one place.** `app/utils/modelPricing.js` now holds the model ids, the published per-MTok prices and the routing table. **Zero inline model IDs remain** in `ai.server.js` (was six). **(c) The measurement was impossible before, not merely undone.** `callClaude` discarded the API's `usage` block, and `UsageRecord.tokensUsed` is written as the literal **0** at both of the only two places it is ever written. There was no data and there never would have been. Every call now emits an `ai.usage` event with real tokens and cost. **(d) Alt text routing.** It was *already* on Haiku — so the brief's ask was already true in effect, but only by a string literal nobody could see was a decision. Now a named row with a test that fails if alt text or social moves above Haiku's rates. Measured worth: **3.0×** on the highest-volume call in the product. **(e) THE FINDING THAT OUTRANKS THE COST — `08-ECONOMICS.md` priced a business we do not sell.** Its §3 costed Free/Starter/Growth/**Scale**/**Enterprise** at $0/$19/$49/$99/$299 for 150/1,000/5,000/25,000/unlimited. The shipped plans in `app/utils/billing-plans.js` are **Free $0/25, Starter $9.99/50, Growth $29.99/200, Pro $79.99/1,000**. **Not one row matched.** No Scale plan, no Enterprise plan, no bring-your-own-key path exists in the code or schema — searched and confirmed. Its headline risk named a plan we do not have. Plugging a measured cost into that table would have produced precise nonsense, so §2–§5 are rebuilt against the real plans. **(f) The conclusion reverses.** Every paid plan is comfortably profitable at 100% utilisation in any mix — worst case **85.0% / 80.0% / 62.5%**. Free costs at most **$0.75** per fully-active install per month. **Cost is no longer the binding constraint; revenue is** — the list tops out at $79.99 while the doctrine claims a premium position, and 150 merchants now model at **~$4.1k** MRR rather than the ~$9.9k the old ladder promised. **That contradiction is the owner's decision and is routed.** | ✅ done |
| P0.7 | CW | **Replace "Dedicated account manager" and "SLA support" on the live listing** with the wording in `12-OFFER.md` §6 — the service stays, the two undefined words go. Also audit the listing for **"llms.txt"** and **"instant indexing"**, both now banned. | immediately |
| P0.8 | CC | **DONE 2026-09-14.** Audited every user-visible string in `app/routes` and `app/components` against **4.3.3/4.3.4** (statistics and superlatives, *"verifiable and unverifiable"*), **4.3.6/4.3.7** (testimonials), **4.2.2** (pricing in images) and the Sidekick / Shopify-purple branding rejection. **One real breach, and it was shipping:** the Pro plan card in `app/routes/app.plans.jsx` still said **"Dedicated account manager"** and **"SLA support"** — the two phrases `08-ECONOMICS.md` guardrail 6 bans outright. P0.7 covers the listing; this was the same wording *inside the app*, which nobody had checked. Replaced with the exact `12-OFFER.md` §6 wording: *"Direct access to the founder"*, *"Setup call when you start"*, *"Every question answered within one business day"*. The **service is unchanged** — only the two undefined words go. **Clean elsewhere:** no superlatives (every `first`/`only` hit is "the first N products" or a code comment); no testimonials; `llms.txt` appears only in log messages and the functional proxy route, never in rendered copy; no Sidekick icon and no Shopify-purple hex anywhere in `app/` or `public/`; and **4.2.2 checked twice, because the frames moved under me** — I first opened the committed `01-home-desktop.png` (a plan *name* and a usage count, no price), then a parallel session **re-captured all seven frames at 00:22:53Z**, which made that reading stale. Re-checked against the new capture: no price-shaped string in any of the seven extracted texts. *(Their `04-start-desktop.png` is `ok:false` with a stated reason and correctly not written — their work, untouched.)* **Made permanent:** `tests/docs/app-store-copy.test.js`, 181 assertions, fails the build if any banned phrase returns. It strips comments first — the fix for this rule leaves a comment *saying* "SLA" to explain why it is gone, and a scanner that cannot tell those apart would fail on its own fix and get switched off. Its testimonial regex was tightened after it flagged a `<Select>` option as a testimonial by matching across newlines. | ✅ done |
| **P0.9** | **OWNER** | **Start Google OAuth app verification** for `webmasters.readonly` — assume it is a sensitive scope. Needs a published privacy policy, a verified domain, a demo video, and **3–8 weeks of Google's calendar**. Free to start, blocks the entire Google proof engine, **not started**. | **this week** |
| **P0.10** | **OWNER** | **Apply for Shopify Level 2 protected customer data access.** Required for `shopifyqlQuery`, therefore for every AI-referral number we want to show. Security questionnaire and review cycle. **Not started.** | **this week** |
| P0.11 | COWORK | **Reconcile `04-DECISIONS.md` against `09-DOCTRINE.md` line by line.** Mark every conflicted row `SUPERSEDED`. It is titled *"settled, do not re-litigate"* and is now the most out-of-date file we have — and it governs the live listing. | this week |

### PHASE 1 — TRUTH, AND THE FAILURE STATES
**Gate:** no claim in the app or listing is unsupported by the doctrine; a merchant can read the
rubric behind every score; every failure a merchant can hit says what happened and what to do.

| ID | Owner | Item |
|---|---|---|
| P1.1 | CC | Strip every unevidenced claim. A test that fails on the banned phrases in `09-DOCTRINE.md` §2. |
| P1.2 | CC | **Reframe the FAQ feature.** Keep emitting FAQPage JSON-LD (harmless); **delete the benefit claim** — Google removed the rich result and deleted the docs. Promote the **visible** FAQ content, which is the part the evidence supports. |
| P1.3 | CC | **Rebuild the store score on documented inputs only** — indexability, snippet eligibility, crawler access, canonicals, attribute completeness, freshness, evidence density. Remove schema-presence and llms.txt from the rubric. **Publish the rubric in-app.** |
| P1.4 | CC | **Never fabricate a fact.** A generation-time guard refusing any number, specification, certification or comparison absent from the merchant's own product data. Break it; report the failing test count. |
| P1.5 | CC | **Detect-and-augment structured data**: read what the theme emits, fill only gaps (`Organization`, `BreadcrumbList`, `MerchantReturnPolicy`, shipping, variant `ProductGroup` on old themes). **Never duplicate `Product`.** Re-detect when the theme changes. |
| **P1.6** | CC | **Error states are a product surface** — moved here from Phase 5, because every Phase 2 and 3 step is a support ticket if it fails silently. Throttled · model down · quota gone · no Search Console · Shopify 5xx · feed rejected. Never a stack trace, never a silent zero. |
| **P1.7** | CC | **Content-quality floor.** Uniqueness checks, a minimum density of real merchant data per description, and a rate limiter on catalogue-wide publishes. Google's scaled-content-abuse policy names our core feature; the defence is the product, not a disclaimer (`09-DOCTRINE.md` §6.5). |

### W1 CAME BACK 2026-09-14 AND PHASE 2 FAILED ITS OWN KILL CRITERION. READ THIS FIRST.

n = 409 live Shopify storefronts, two independent frames agreeing within 0.3 points. Full write-up
in `docs/research/w1-eligibility-base-rate/`. The headline cleared the bar; **the eligibility
finding did not.**

| What was measured | Stores with a finding |
|---|---|
| **Anything at all** (the headline) | **71.9%** |
| Strip `product_type` and thin descriptions — both **content**, not eligibility | **36.2% — BELOW the 40% bar** |
| OpenAI-required attributes + the policy pages agentic storefronts need | **22.7%** |
| Structured data missing or duplicated | 15.9% |
| **Crawler access blocked** | **0.5% — 2 stores in 409** |

**35.7% of all stores have NO finding except those two content checks.** And `product_type` is not
on OpenAI's required list — it is Shopify's own taxonomy field, so grading it BLOCKING would repeat
the GTIN overclaim §1 already had to walk back.

**The flagship claim is dead.** `09-DOCTRINE.md` §1 called crawler access *"a real, fixable,
unmarketed failure… nobody in our category audits this."* All three are true. **It is also nearly
absent.** Not one store in 409 blocks an AI crawler while allowing Google. Nobody audits it because
there is almost nothing to find. Keep the check — one fetch, and a total block matters enormously to
the 0.5% it fires on — but **it cannot carry a pillar.**

**What W1 actually validated is the product we already have.** 44.9% missing `product_type`, 43.9%
with descriptions under 120 characters. The market's problem is **content**, at scale, and we
already generate content.

**AND THE MOAT MOVED.** `barcode` is **not exposed in `/products.json`** — Admin API only, verified
against a live store's raw JSON. So the barcode base rate is unknown to everyone, and **no
competitor scraping from outside can grade it. We can, because we are installed.** That is a
structural moat on exactly the attribute this plan spends the most words on, and it was found by
accident while trying to measure something else.

**THEREFORE PHASE 2 IS RE-AIMED, NOT CANCELLED:**
1. **Eligibility demotes from "the subscription" to a cheap component of the free scan.** Keep every
   check — they cost one fetch each. Stop building a phase around a 22.7% base rate.
2. **Content promotes to the product.** Not volume — volume is commodity, anchored at 11,000 credits
   for $49, and a scaled-content-abuse risk (§6.5). **Evidence density** is the standard, which is
   what Zhang et al. actually supports.
3. **Pillar 1's real content is the Admin-API-only attributes** — barcode, variant option names,
   availability — the things only an installed app can see.
4. **The subscription is catalogue decay, not eligibility decay.** A bulk import wipes descriptions.
   A theme change alters output. **New products arrive unoptimised — a guaranteed recurring event in
   every active store**, unlike a robots.txt edit. That is what bills forever, and autopilot is
   already half of it.

*This is the kill criterion working exactly as designed: written in advance, measured honestly,
acted on. Two days of work instead of two months.*

---

### PHASE 2 — CATALOGUE MONITORING. The subscription. *(re-aimed 2026-09-14 by W1)*
**Gate:** a merchant is told, the day it happens, that something in their store stopped being
eligible — and has been told at least once about something they did not know.
**Blocked by W1:** if the base rate is below 40%, this phase is re-scoped before it is built.

| ID | Owner | Item |
|---|---|---|
| P2.0 | COWORK | **Document what Shopify's Agentic sales channel already reports, per product, today, with screenshots. Build only the delta.** Ground rule 5 exists because Shopify shipped llms.txt, agents.md, Catalog and Magic without telling us. The defensible delta is **cross-surface in one view** and **bulk remediation** — neither of which Shopify will build. |
| P2.1 | CC | **Crawler-access monitoring.** Fetch `robots.txt` and test-fetch as `OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`, `bingbot`, `Googlebot`, `Google-Extended`. **Diff it daily.** Blocking `OAI-SearchBot` means, in OpenAI's words, the store *"won't appear in ChatGPT search answers."* |
| P2.2 | CC | **Per-product eligibility, graded blocking / degrading / cosmetic** against each surface's actual spec (`09-DOCTRINE.md` §1). Never call a recommended field a disqualification. |
| P2.3 | CC | **Regression detection is the product**: theme changes, robots.txt diffs, attribute loss after a bulk import, canonical drift, feed rejections, policy pages disappearing. An **"eligibility uptime"** number the merchant checks. This is what bills forever; the one-time audit is the lead magnet. |
| P2.4 | CC | Indexability: `noindex`, canonical mismatch (`googleCanonical` vs `userCanonical`), sitemap membership, redirect chains. Snippet eligibility is Google's stated prerequisite for AI Overviews and AI Mode. |
| P2.5 | CC | **Verify first whether the Search Console "Search generative AI control" is readable by an app at all** — our own market file says that report has no API. If unreadable, ship it as a one-question guided check the merchant answers. **Do not build a gate on an unverified API.** |
| P2.6 | CC | **Bulk remediation.** Finding without fixing is a lead magnet. Fix barcodes, option names, availability, policies, alt text, canonicals — in bulk, with review. |
| P2.7 | CC | **The 60-second first run** rebuilt around this: scan → the three specific things blocking *this* store → fix the first in one click → "we'll watch it from here." |

### PHASE 3 — PROOF, ON BING FIRST. The fastest honest causal claim in the category.
**Gate:** a merchant sees, inside the trial, a causal result about their own store.

Revision 1 buried this at item seven of ten in the last-but-two phase. It is the best thing in the
plan: **causal, free, API-driven, no OAuth, no approvals, no catalogue minimum, reads out in 72 hours.**
Bing has a REST API. Google does not.

| ID | Owner | Item |
|---|---|---|
| P3.1 | CC | **The IndexNow crawl-time holdout.** Submit a random half of changed URLs, withhold the other half, measure time-to-crawl. Genuinely causal, zero risk (IndexNow is not a ranking factor), and we found no competitor doing it. **This is the trial's hero moment.** |
| P3.2 | CC | **Bing Webmaster REST API**: URL submission (sanctioned for commerce pages, ~10,000/day — Google has no equivalent), and **per-page query stats with separate impression and click positions**, which Google does not provide. SOAP/POX retired 31 Aug 2026 — REST only. |
| P3.3 | CC | **Teach the two reports that have no API**: Google's generative-AI performance report (impressions only) and **Bing's AI Performance** — citations, grounding queries and **citation share against competitors**, the richest free AI-citation dataset in existence. Guided in-app. We teach it; we never scrape it. |
| P3.4 | CC | **First-party AI sessions** via ShopifyQL `agentic_referring_channel` (ChatGPT, Google AI Mode/Gemini, Copilot, Shop), with Perplexity and Claude **inferred from referrer domain and labelled as inferred**. State in the UI that AI-assisted visits arriving via Google count as organic, so the number is a floor. *Gated on P0.10.* |
| P3.5 | CC | **Shared-corpus prompt sampling** (`09-DOCTRINE.md` §3): ~50 prompts × 4 engines × 7 runs/day **per vertical**, fanned out to every merchant in it. Per-engine, 4-week rolling, cited separated from mentioned, interval always shown, method labelled on every screen. Plus the honest n=1 view: the actual answer an engine gave, labelled as one observation and never trended. |
| P3.6 | CC | **The weekly report** — the heartbeat. Only when there is something true to say. One email per week across the whole app. Every number links to the screen that proves it. |

### PHASE 4 — PRICING THAT MATCHES THE MARKET WE FOUND
**Gate:** a merchant can subscribe, upgrade, downgrade and cancel, and every plan is defensible
against `10-MARKET.md` §3.

`04-DECISIONS.md`'s table predates this research and cannot survive it: the floor is free (Shopify
Magic; SEOLab at #2 with 2,596 reviews and no paid tier; Shop Rank AI at $9.99), the ceiling is
**$99** defended by Adobe-owned Semrush and by Profound at a $1B valuation, and generation volume is
anchored at **11,000 credits for $49**. A $299 tier has no market.

| ID | Owner | Item |
|---|---|---|
| P4.0 | OWNER + COWORK | **The table is drafted in `12-OFFER.md` §1**, priced under the nearest comparable competitor on every tier. Confirm it against `B0.3` — ten merchants telling us beats a spreadsheet guessing — then lock it. **Blocked by P0.6:** every cap rests on an unmeasured cost per generation. |
| P4.1 | CC | Implement it. **Audit never capped. Bulk at the first paid tier.** Never a bare navigate to billing. **Put bring-your-own-key at the $99 tier now**, not conditionally later — it removes the COGS ceiling and a competitor validated it at $49.99. |
| P4.2 | CC | **Stay on the Billing API (Manual Pricing)** while we sell one-time add-ons — **Shopify App Pricing does not support one-time purchases.** If we ever switch: since 28 Apr 2026 App Pricing sends **no `APP_SUBSCRIPTIONS_UPDATE` webhook and no `charge_id`**; state comes from `plan_handle` plus the Partner API `activeSubscription`. |
| P4.3 | CC | Grandfather existing subscribers (Shopify's default) and tell them in-app. Upgrade **and downgrade without contacting support** — App Store requirement 1.2.3. |

### PHASE 5 — THE GOOGLE PROOF ENGINE. Premium tier, large catalogues only.
**Hard gate: not before ten real merchants and one paying one.**
**Gate:** a merchant with a large catalogue sees a causal result with a correct confidence interval.

| ID | Owner | Item |
|---|---|---|
| P5.1 | CC | Search Console OAuth on the merchant's own account, plus the delegated-owner service-account path for durability. Handle no property / unverified / domain mismatch / URL-prefix-vs-domain honestly. *Gated on P0.9.* |
| P5.2 | CC | Verification assist: a theme app embed with `target: "head"` placing the META tag — Shopify names this exact use case. Needs one merchant click via deep link; **an app cannot activate an embed on the merchant's behalf.** |
| P5.3 | CC | **Use the Search Analytics API for BOTH periods. Do not use BigQuery in v1.** Bulk export **does not backfill**, so there is no pre-period until 8–12 weeks after the merchant enables it; and the API omits anonymised long-tail rows that BigQuery retains, so **a DiD spanning that seam confounds a dataset change with the treatment start date.** If sources are ever mixed, the seam falls inside a single period, never at the boundary, and it is disclosed. |
| P5.4 | CC | URL Inspection sampled at ~400/day against the 2,000/day/property cap, for canonicals, crawl time and robots state. **Never conflate "no impressions" with "not indexed".** |
| P5.5 | CC | **Stepped-wedge, not withheld.** Arm A treated weeks 0–12, arm B weeks 12–24. Every product gets optimised; the comparison is the stepped difference. **This removes the conflict of interest entirely** — revision 1 asked a paying merchant to leave half their catalogue unoptimised for twelve weeks, and then offered an opt-out that would have destroyed the randomisation. Pre-register **intention-to-treat**, state a **compliance floor (void the claim below 90% adherence)**, and put both in the consent screen. |
| P5.6 | CC | **Show the MDE before the test runs — with the design effect applied.** Compute the merchant's own CV from their pre-period; if randomisation is by collection, inflate by `1 + (m−1)·ICC`. A small catalogue is told plainly which claim is unavailable to it. **Getting this wrong understates the requirement ~6× and would be the most embarrassing possible failure for us.** |
| P5.7 | CC | The analysis: **Poisson or negative-binomial with unit fixed effects**, not `log(impressions+1)` — most product URLs have zero impressions most weeks, so a `+1` log puts most of the mass at one point and the coefficient is not a percentage. Or split honestly into *share of URLs with ≥1 impression* and *impressions conditional on being served*. **One primary metric, pre-registered.** Total-property clicks is a **guardrail**, not a second primary. Annotate core-update dates. No peeking. |
| P5.8 | CC | **Interim safety look with a hard stop:** if the treated arm underperforms control, halt and roll back. Our own content is a scaled-content-abuse risk; the experiment is also the smoke alarm. |

### PHASE 6 — RETENTION, SUPPORT AND THE THINGS ONE PERSON CANNOT WING
**Gate:** churn instrumented and ≤2%; a support system that does not need a human per merchant; a
merchant can leave with their work.

| ID | Owner | Item |
|---|---|---|
| P6.1 | CC | **Instrument churn**: install → paid → cancelled, with reason, cohorted. Halving churn is worth more than any price rise we could survive, and we cannot measure it at all today. |
| P6.2 | COWORK | **The support system.** One inbox, stated hours and timezone, a canned-response library, and the eight questions merchants actually ask answered in-app at the moment they would ask them. **No feature ships without its failure states documented.** Revision 1 had no support plan at all while `08-ECONOMICS.md` named support as one of two costs that scale with revenue. |
| P6.3 | OWNER | **Do not sell an onboarding call or a 1-business-day response until there is capacity to honour it.** One person cannot be the only engineer and the enterprise success team. |
| P6.4 | CC | Three SLOs a merchant would notice: first-result latency, bulk-job completion, uptime. |
| P6.5 | CC | **Export everything we generated**, usable without us. Right thing, listing line, and it removes the fear that blocks a first purchase. |
| P6.6 | CC | **Uninstall/reinstall as a first-class path** — proved on a dev store. A merchant who reinstalls to find their work gone leaves one star. |
| P6.7 | OWNER | **Key-person controls**: credential and repo escrow, a deploy runbook a second person could execute, and either a reserve against prepaid annual revenue or a pro-rata refund commitment in the terms. Annual prepay at 25% off converts key-person risk into a consumer-protection liability. |
| P6.8 | OWNER + COWORK | **Legal**: terms allocating responsibility for published copy, publish-time acknowledgement, subprocessor list naming model providers, a DPA, an EU AI Act transparency position, a consent policy for publishing anonymised results, and a **refund answer for a merchant whose result was null.** |

### PHASE 7 — REACH
Non-English generation with both-directions tests per language · B2B/wholesale detection (agentic
storefronts are **D2C only**; B2B-only products are excluded and we must say so) · Markets and
multiple storefronts never blended into one score · enterprise audit trail and bulk undo.

### CONTINUOUS — THE FIXTURE MATRIX
Every axis in `05-EVIDENCE.md` §4, plus one real dev store per shape that matters: all-draft,
variant-heavy, non-English, B2B-only, catalogue above the plan cap. **A cell you did not test is a
defect you have not found yet.**

---

## 6. TRACK B — DEMAND. The primary track.

**Starting point:** launched 8 September 2026. **2 net installs, 0 reviews, $0.00 earned, and every
install to date is one of our own stores. No real merchant has ever used this app.**

### B0 — Ten real merchants. Dated, named, and gated.
Revision 1 left the most important item in the document as an undated bullet.

| ID | Owner | Item | Done by |
|---|---|---|---|
| B0.1 | OWNER | **Write the list of 30 named prospects** — network, Bilby's audience, the navaal.ai list, communities where this problem is discussed. Names, not channels. | **within 7 days** |
| B0.2 | OWNER | **Ten real stores on the free tier.** Not dev stores. | **within 30 days** |
| B0.3 | COWORK | Watch every first run and write down **what they did not understand.** Ten merchants confused by the same screen outranks a hundred backlog items. | rolling |
| B0.4 | COWORK | Ask each: what would you pay for, and what would you never pay for? **This decides Phase 4, not a spreadsheet.** | rolling |
| B0.5 | OWNER | **One paying merchant.** The gate on Phase 5. | **within 60 days** |

### B1 — The listing, rebuilt within the rules
| ID | Owner | Item |
|---|---|---|
| B1.1 | COWORK | Rewrite on the current product and the doctrine. **Lead with the outcome, not the mechanism** (`09-DOCTRINE.md` §0.1). No statistics, no "first/best/only", no testimonials, no pricing in images — Shopify's rules, not preferences. |
| B1.2 | COWORK | **Five search terms**, complete words, one idea each, no symbols. Every field filled including optional. Up to 25 structured features. Do not stuff — overuse *"can DECREASE your app's discoverability."* |
| B1.3 | CW | Re-capture screenshots: **1600×900, three to six desktop**, app UI only, no browser chrome, no pricing, no PII, each unique. Video 2–3 minutes, screencast ≤25%. |
| B1.4 | CW | Upload, submit, read the public page back on a fresh load. |
| B1.5 | COWORK | Set **"Merchant must have online store"**; state that the FAQ block needs a theme app embed activated. |
| **B1.6** | **COWORK** | **Localise the listing into six languages.** Our own research: translated listings *"convert up to 4x better in non-English markets."* Highest-ROI distribution lever available to a solo operator, and the only one that scales without the owner's time. Revision 1 named it and assigned it to nobody. |

### B2 — Traffic we own. A *ranking* lever, not only a demand lever.
Shopify, verbatim: *"Driving traffic to your app from outside of Shopify can help improve your app's
ranking on the Shopify App Store."* Significant outside traffic can also list us under **Trending apps**.

| ID | Owner | Item |
|---|---|---|
| B2.1 | COWORK | Finish install attribution: `bilby-footer` and `bilby-report` still unplaced (they live in `navaal-platform`, edited via `packages/tokens/footer.html`). Then: **which ref actually converts?** |
| B2.2 | COWORK | **Publish the base-rate study from W1** on navaal.ai. An aggregate about the market is the one kind of statistic we are allowed to publish, it is genuinely useful, and it is a ranking lever. |
| **B2.3** | **COWORK** | **Publish anonymised, aggregated holdback results publicly** — with consent (P6.8). *"A moat that is invisible from the listing page is not a moat in a search-ranked marketplace."* A competitor can claim causal proof in an afternoon; they cannot publish results. **This is what makes the moat visible before install.** |
| B2.4 | COWORK | Practise what we sell on navaal.ai and Bilby. **If our own sites are not findable, we have no business selling findability.** |

### B3 — The first five reviews
| ID | Owner | Item |
|---|---|---|
| B3.1 | COWORK | Design the ask: **once, after a result that worked**, never before, never a nag, never rewarded — rewarding a 5-star review is a named BFS rejection reason. |
| B3.2 | CC | Implement it gated on a real success signal, once per shop, dismissible forever. `ReviewRequestAttempt` exists; gate it on truth, not on time. |
| B3.3 | OWNER | Ask the first ten personally, after they have had a result. |

### B4 — The achievement, then the badge
| ID | Owner | Item |
|---|---|---|
| B4.1 | CC + CW | Audit every **"Increased visibility on key merchant surfaces"** criterion — a search-ranking boost **without** the manual design review. Our real near-term target. |
| B4.2 | CC | Full BFS audit with evidence per criterion: App Bridge script tag · admin p75 LCP/CLS/INP at **≥100 calls each over 28 days** · storefront Lighthouse impact **<10 points** weighted (home 17%, product 40%, collection 43%) · Asset API (we qualify for the SEO exemption and are audited on it) · contextual save bars · no dark patterns. |
| B4.3 | OWNER | Apply only once every criterion we control passes. **Failing the same criterion three times suspends applications for three months.** |

**The circularity, stated so nobody is surprised by it:** BFS needs ≥100 measured calls; calls need
installs; installs need ranking; ranking needs BFS. **The only exits are B0 (direct outreach), B1.6
(localisation) and B2 (external traffic).** They are the least glamorous items in this document and
they are the critical path.

---

## 7. THE SCOREBOARD

| # | Metric | Now (2026-09-10) | Next gate | Who |
|---|---|---|---|---|
| 1 | **Real merchants (not our stores)** | **2** (CW ledger 2026-09-14, reconciles to Shopify's `Merchants with your app: 8` = 6 ours + 2 real; a third installed and left after one minute, reason *"Testing multiple apps"*). Both are pre-launch, password-protected, and we are their only app. | 10, then 50 | B0 — OWNER |
| 2 | **Paying merchants** | **0** | 1, then 10 | B0.5, Phase 4 |
| 3 | Net installs from paid-plan shops | 2 | 50 | Track B |
| 4 | Reviews | 0 | 5, then ~150 | B3 |
| 5 | Rating | — | ≥4.9, weighted to recency | every kept promise |
| 6 | "Increased visibility" achievement | No | Yes | B4.1 |
| 7 | Built for Shopify | Not exposed | Yes | B4.2, B4.3 |
| 8 | MRR | $0.00 | $1k, then ~$9.9k | Phase 4 + Track B |
| 9 | Monthly churn | not instrumented | ≤2% | P6.1 |
| 10 | Admin perf calls counted | ~51 over 7 days → **2026-09-14: LCP 877 ms/76 loads · INP 40 ms/26 loads · CLS 0.02/76, all Good; INP no longer "not enough data"** | ≥100 over 28 days | installs |
| 11 | **Merchants with a proved result** | **0** | 1, then 10 | Phase 3 |
| 12 | **Eligibility regressions caught and fixed** | **0** | 1, then weekly | Phase 2 |

| 13 | **App Store rank, our five terms + `seo` + `ai seo`** | **2026-09-14 baseline: not in the first ~70 results for any of the seven; SEO category (1,111 apps) not in the first 66.** Top three organic: Judge.me 46,891 reviews · SEOLab 2,613 · Smart SEO 953. Read in a real browser only (curl returns no cards). | page 1 for one term | Track B, weekly read by CW |
| 14 | **Time-to-value on a fresh install** | **~20 s** from opening the app to a finished draft on screen (CW, qa-fresh, 2026-09-14) — with **15 confusions** on the way, `docs/history/screen-reads/first-run-qa-fresh-2026-09-14.md` | under 60 s with ≤3 confusions | P2.7 / CC |

**Metrics 1, 2, 11 and 12 are the leading indicators.** Everything else follows them.
**Metric 13 is the one the goal is written in, and on 2026-09-14 it reads "absent".**

---

## 8. PRE-MORTEM

| Failure | Guard |
|---|---|
| **No purchase moment** — the flaw that sank revision 1. | Phase 2 is monitoring (recurring) not audit (one-shot); Phase 3 returns a causal result in 72 hours, inside the trial; billing is proved in Phase 0. |
| **Shopify ships our feature free.** It already did with llms.txt, agents.md, Catalog and Magic, unannounced. | Ground rule 5; P2.0 documents the delta *before* we build; monthly re-verification of `10-MARKET.md`. |
| **A funded competitor copies this in 90 days.** They can: the eligibility audit is a rules engine plus a robots.txt fetcher, three weeks' work. And they can **claim** causal proof in an afternoon, because nobody audits listing copy. | Three defences: **monitoring needs historical state** a copycat cannot fake; **B2.3 publishes results publicly** so the claim is verifiable from outside; and **B1.6 localisation** buys distribution they have to spend to match. Accept that the content pillar is copyable and price it as table stakes. |
| **The eligibility base rate is low** and the audit says "everything looks fine." | **W1 this week**, with a 40% kill criterion, before Phase 2 is built. |
| **Merchants pick the bolder claim.** | **W2 this week.** If so, the words change and the doctrine does not. |
| **The proof returns a null.** | Then we learned something true, cheaply, before a merchant did — and we publish it (B2.3). **A product that can be proved wrong is the only kind that can be proved right.** |
| **We imply significance we do not have.** | P5.6 shows the MDE **with the design effect** before the test; small catalogues are told plainly which claim is unavailable. |
| **Our own bulk content triggers a scaled-content problem.** | P1.7's quality floor; P5.8's interim stop and rollback. |
| **A platform deadline delists us.** *(Revised 2026-09-14.)* The **1 Oct** date was carrying two items and one of them was a false alarm: the theme-extension `api_version` half (P0.1) **never applied to us** — that deadline binds UI extensions and we ship none. The half that is real is **P0.2**, script tags, and it is **verified clean**. **16 Oct is IDENTIFIED, 2026-09-14: Admin API 2025-10 becomes inaccessible** (`09-DOCTRINE.md` §4 carried it all along — a previous session wrote that "nothing in the folder says what it is", which was false; it had only not looked there). **It does not bind us:** we are on **2026-04**, which sunsets 2027-04-01, and `scripts/check-api-versions.mjs` fails the build 90 days before any pin expires. **Neither October date is now an open risk.** | Phase 0 leads everything; P0.3 now puts the version check in CI — including the invariant that would catch a future UI extension on a dead version. |
| **Calendar-bound approvals block the proof engine.** Google verification is 3–8 weeks; Shopify Level 2 is a review cycle. | P0.9 and P0.10 start **this week**, months before they are needed. |
| **Support load exceeds one person.** | P6.2's system; P6.3 forbids selling what we cannot honour; P1.6 moves failure states into Phase 1. |
| **Key-person risk.** | P6.7. A productivity system is not a risk control. |
| **We drift back to unevidenced claims** because they sell more easily. | P1.1's test fails on the banned phrases. The doctrine outranks enthusiasm. |
| **Content gains erode as competitors adopt** (C-SEO Bench: zero-sum). | Only the content pillar erodes. Eligibility monitoring and proof do not: a competitor fixing their barcodes does not un-fix ours. |

---

## 9. WHAT WOULD MAKE US STOP AND RETHINK

Written now, while we are calm, so we cannot rationalise later.

- **Fewer than 40% of audited stores have an actionable eligibility finding** (W1). Pillar 1 is a
  feature, not a product.
- **Merchants consistently choose the bolder claim and cannot tell the difference** (W2). The
  positioning is wrong even though the product is right.
- **Ten real merchants use it and none finds the eligibility findings useful.** Pillar 1 is wrong.
- **The first well-powered holdback shows no effect at twelve weeks.** The content pillar is table
  stakes, and price moves to eligibility and proof.
- **Shopify ships a native cross-surface eligibility report.** Pillar 1 is gone; the answer is proof.
- **Churn above 5% after three months of paying merchants.** The product is a project, not a
  subscription, and monitoring has to carry it.
- **No paying merchant within 60 days of ten real installs.** The thing we built is not the thing
  they buy.

None of these is failure. Each is information bought honestly, which is the only kind worth having.
