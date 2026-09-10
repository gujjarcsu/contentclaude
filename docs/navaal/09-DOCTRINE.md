# DOCTRINE — what we sell, what we refuse to say, and why

**Written 2026-09-10 from primary sources. Every claim here carries its evidence.**
This file outranks enthusiasm. If a feature idea contradicts a rule here, the rule wins and you
say so in your report.

Read this before designing any feature, writing any listing copy, or making any promise.

---

## 0. THE UNCOMFORTABLE TRUTH WE ARE BUILDING ON

We researched the evidence for what this category sells. Most of it does not hold up.

| What the category sells | What the evidence says |
|---|---|
| "Schema markup gets you cited by AI" | Ahrefs, **n=1,885 pages adding JSON-LD vs 4,000 controls**, difference-in-differences, May 2026: **−4.6% on AI Overviews**, noise elsewhere. Google's own docs: *"Structured data isn't required for generative AI search, and there's no special schema.org markup you need to add."* |
| "FAQ schema improves AI visibility" | **FAQPage rich results were removed from Google Search around May 2026; Google deleted the documentation page on 15 June 2026.** Separately, Q&A formatting measured a **5.74% DECREASE** in citation absorption (n=602 prompts, 21,143 citations, Apr 2026). |
| "llms.txt makes your store readable by AI" | **Shopify already serves `/llms.txt`, `/llms-full.txt` and `/agents.md` on every store, free, by default.** We verified this ourselves on four live stores. Google: *"You don't need to create new machine readable files, AI text files, markup, or Markdown… Google Search itself doesn't use them."* No major AI company documents reading it. |
| "GEO techniques give up to 40% more visibility" | The GEO paper (KDD 2024) measured a rewrite of a source **already present in a fixed five-document context** — it cannot speak to being retrieved at all. A **July 2026 critical survey of 45 studies** concludes: *"no reviewed technique shows a stable, longitudinal, cross-platform causal effect on organic discoverability or downstream behavior."* C-SEO Bench found dedicated methods **often hurt ranking**, and that gains **erode as adoption rises** — it is zero-sum. |
| "We track your visibility in ChatGPT" | Credible measurement needs **≥30–50 prompts × ≥7 runs/prompt/day × per-engine × 4-week rolling windows** — because *same-day* repeated runs return source sets with Jaccard 0.32–0.43. That is ~31,000 queries per store per window. **At $49/month it is not affordable, so everyone selling it at this price is selling noise as signal.** |

**We are not going to sell those things. That is the strategy, not a limitation.**

### 0.1 — THE ASSUMPTION WE ARE BETTING ON, STATED AS AN ASSUMPTION

Honesty is a **retention and rating** asset. It is **not** proven to be an acquisition asset, and we
must not pretend otherwise.

A merchant comparing "Track your ChatGPT visibility" against "Sessions referred from ChatGPT,
Copilot, Gemini/AI Mode and Shop — this is a floor" will very likely click the first. It is the
thing they came to buy, in the words they searched for. Nobody audits listing copy for truth.

**So the ban list governs what we CLAIM, not whether we NAME the customer's problem.** The listing
leads with the outcome a merchant wants; the honesty is the *reason to believe*, and it lives one
line below and everywhere inside the app.

There is also a confound in our own market reading. Every low-review "substance" app is **new** —
StoreRank Aug 2025, Shop Rank Dec 2025, Kedra Apr 2026, Kwik GEO **Jun 2026, eighteen reviews at
three months old**. Low review counts are partly age, not proof that substance does not sell. We
were treating a time-confounded correlation as a structural gap — the exact error §0 attacks the
GEO literature for.

**Falsification:** run 20 five-minute merchant calls with two listing variants. If merchants
consistently choose the bolder claim and cannot tell the difference in substance, the *positioning*
is wrong even though the *product* is right, and we change the words, not the doctrine.

Every competitor in our price band is selling a claim the evidence does not support. At zero
reviews, one merchant who checks — and merchants who buy SEO tools do check — is an existential
one-star review. **Being the app that only says what it can prove is our position.**

---

## 1. WHAT IS ACTUALLY TRUE, AND THEREFORE WHAT WE SELL

These are documented or measured, not inferred. Each is a product pillar.

### PILLAR 1 — ELIGIBILITY. Make every product qualify for the surfaces that decide.
**Documented, causal, and almost nobody markets it.**

- AI shopping results are **fed, not crawled**. OpenAI: merchants provide *"a secure, regularly
  refreshed feed… identifiers, descriptions, pricing, inventory, media, and fulfillment options."*
  Shopify syndicates this automatically via **Shopify Catalog** — *"title, description, options,
  images, price, availability, and other key attributes."* Google's UCP uses **Merchant Center feeds**.
- Therefore **attribute completeness decides eligibility** — but every finding must be **graded**,
  with its surface named, because the requirements differ per surface and we are not allowed to
  bluff:
  - **BLOCKING** — the field is *required* by that surface's spec. OpenAI's feed spec requires
    `item_id`, `title`, `description`, `url`, `brand`, `image_url`, `price`, `availability`,
    `target_countries`, `seller_name`. Missing one is a disqualification.
  - **DEGRADING** — the field is *recommended* and named as affecting ranking. OpenAI: *"recommended
    attributes—like rich media, reviews, and performance signals—improve ranking, relevance, and
    user trust."* `group_id`/`variant_dict`, `size`, `q_and_a`, `reviews` sit here.
  - **COSMETIC** — everything else.
  **GTIN is not on OpenAI's required list**, and Google Merchant Center only requires it where a
  manufacturer assigned one — own-brand and handmade goods are exempt, which is a large share of
  Shopify. *An earlier draft of this file called a missing GTIN a "binary disqualification". That
  was an overclaim, contradicted by our own market file two documents over, on the money page of a
  document about not overclaiming. It is fixed here and recorded rather than quietly deleted.*
- Google states the prerequisite for AI Overviews and AI Mode plainly: *"a page must be indexed and
  eligible to be shown in Google Search with a snippet. There are no additional technical
  requirements."* So **indexability, canonicals and snippet eligibility are the AI-visibility work.**
- **Crawler access is a real, fixable, unmarketed failure.** `OAI-SearchBot`, `PerplexityBot`,
  `Claude-SearchBot` and `bingbot` can be blocked by robots.txt, a WAF, or bot-management defaults.
  Blocking `OAI-SearchBot` means, in OpenAI's own words, the site *"won't appear in ChatGPT search
  answers."* Nobody in our category audits this.
- Google shipped a **"Search generative AI control"** in Search Console (worldwide 31 Aug 2026) that
  excludes a site from AI Overviews, AI Mode and Discover. A merchant or a previous developer may
  have switched it on. Checking it is thirty seconds of work and we found no competitor doing it on 2026-09-10.

### PILLAR 2 — CONTENT THAT IS EVIDENCE, NOT ADJECTIVES.
**Correlational, honestly framed, and it is what the strongest study actually found.**

- Zhang et al. (Apr 2026, 602 prompts / 21,143 citations / 18,151 pages): top-quartile influence
  pages had **12.5× more headings** and were **11.44× longer** (1,943 vs 170 words), with 2.31×
  higher semantic similarity to answers. Pages containing **definitions, statistics, comparisons,
  procedures** outperformed generic content by **41–77%**. Their framing: *"Surface format matters
  less than evidence density."*
- Freshness: Seer Interactive, 7,683 dated pages / 47,097 citations: **75% of cited pages were
  updated within a year, 88% within two.** Only 42% were fresh by *publish* date but 72% by *update*
  date — the freshness that gets rewarded is **maintenance**, which is a subscription behaviour.
- This is **observational, not causal**, and we say so. What it justifies is a content standard:
  every description carries specifications, materials, dimensions, compatibility, use-cases and
  honest comparisons drawn from the merchant's own data — never invented.

### PILLAR 3 — PROOF. The only defensible reason to charge a premium.
**This is the business. Three claims can be made honestly; we build exactly those.**

1. **Indexation coverage, causally.** Randomised holdback, before/after, per-URL. Cheap in sample
   size — detecting a 60%→75% indexation change needs about **152 products per arm**, so even a
   small catalogue supports it.
2. **Search visibility lift, causally.** Impressions per URL, difference-in-differences with
   pre-period adjustment, 12-week pre-registered window, reported with a confidence interval.
   Needs roughly **1,500 per arm** to detect a 20–30% lift, so it is a large-catalogue claim.
3. **Time-to-crawl on IndexNow engines, causally.** Submit for a random half of changed URLs,
   withhold the other half, measure. Zero risk, zero cost, and **nobody does it.**

Plus honest first-party description, never dressed as causation:
- **Shopify `agentic_referring_channel`** (ShopifyQL, readable via `shopifyqlQuery`) — real sessions
  from ChatGPT, Google AI Mode/Gemini, Microsoft Copilot and Shop. Perplexity and Claude are not
  first-class values and must be inferred from referrer domain, and we label that.
- **Google Search Console generative-AI performance** — impressions only, AI Overviews and AI Mode,
  no clicks, no queries, **no API**. UI export only.
- **Bing Webmaster Tools AI Performance** — total citations, cited pages, grounding queries and
  **citation share** against competitors. The richest free AI-citation dataset in existence, and
  **no API** — UI only. We teach merchants to read it; we do not scrape it.

---

## 2. THE THINGS WE WILL NEVER SAY

These are bans, not preferences. Each one has a court-admissible reason.

| Banned | Say this instead |
|---|---|
| "Get cited by ChatGPT" / "rank in AI search" | "Sessions referred from ChatGPT, Copilot, Gemini/AI Mode and Shop — measured from Shopify's own data. This is a floor: AI-assisted visits arriving via Google are counted as organic." |
| "Instant Google indexing" | "We submit to Bing, Yandex, Naver, Seznam and Yep via IndexNow within minutes of a change, and keep your Google sitemap current. Google's Indexing API is restricted to job postings and broadcast events; using it for products is against policy." |
| "We guarantee indexation" | "X% of your products were indexed at baseline; Y% after 12 weeks; your untreated control group moved X% → Z%." |
| "We improved your rankings by N positions" | Never headline average position: it is impression-weighted and moves with no ranking change. Report impressions with a confidence interval. |
| "This traffic increase was caused by our content" (no control) | "Treated products outperformed a randomly assigned holdback by N% over 12 weeks (95% CI …)." |
| "We drove $N in revenue" | "$N in orders were last-click attributed to organic sessions landing on treated pages, inside Shopify's 30-day attribution window. Attribution is not causation." |
| Any single blended "AI Visibility Score" trended weekly | Per-engine, 4-week rolling, cited-vs-mentioned separated, with the interval shown. |
| "Real-time SEO tracking" | "Search Console finalises after ~3 days; we report on data at least 3 days old so numbers don't move under you." |
| A fabricated statistic inside generated copy | Never. The GEO paper's best-performing tactic was "add statistics" **with no truthfulness constraint** — that is how an app invents a product specification and creates consumer-protection exposure for the merchant, and in agentic checkout, a sale made on a false attribute. |

**And two bans that come from Shopify's own rules, not from us:**
- **No statistics, data, or unverifiable claims anywhere in the App Store listing** — App Store
  requirement 4.3.3/4.3.4, verbatim: *"This includes verifiable and unverifiable information."*
  Also banned: *"the first", "the best", "the only"*. Our proof story lives **inside the app**,
  never on the listing.
- **No reviews or testimonials in the listing or its images** (4.3.6/4.3.7). No pricing in images
  (4.2.2/4.2.3). No Shopify trademarks, and **no Sidekick icon or Shopify-purple to denote an AI
  feature** — a named BFS rejection reason that applies directly to an app called "AI SEO".

---

## 3. THE FEATURES WE ARE REMOVING OR REFRAMING

Honesty applied to our own product, not just our marketing.

| Feature today | Verdict | Action |
|---|---|---|
| **FAQPage JSON-LD** (`extensions/geo-schema/blocks/faq_schema.liquid`) | The rich result **no longer exists**. The markup is inert. Emitting it is harmless; **claiming a benefit is not.** | Keep emitting (costs nothing, may serve non-Google consumers). **Remove every claim that it improves visibility.** Move the value to the visible FAQ content. |
| **Visible FAQ content** (`faq_visible.liquid`) | **This is the real value** — evidence density on the page, and Google requires markup to match visible content. | Promote it. It is the answer-first content, not the schema. |
| **llms.txt generation** | **Shopify ships it free on every store.** Verified live. | Never build it. Never charge for it. If we touch this area at all it is by improving `agents.md.liquid` content quality — the template Shopify exposes — not by creating the file. |
| **Product JSON-LD injection** | Shopify **requires** every Theme Store theme to emit product rich snippets, and provides the `structured_data` Liquid filter. Our extension already deliberately avoids duplicating it — that was the right call. | Keep the no-duplication rule. Move to **detect-and-augment**: fill gaps the theme leaves (`Organization`, `BreadcrumbList`, `MerchantReturnPolicy`, shipping details, variant `ProductGroup` on old themes). Detection must be continuous — themes change. |
| **"GEO score" / "AI-search readiness"** | Defensible **only** if it scores things that are documented to matter: indexability, snippet eligibility, crawler access, attribute completeness, freshness, evidence density. Indefensible if it scores schema presence or llms.txt. | Rebuild the score on Pillar 1 and 2 inputs. Publish the rubric in-app so a merchant can check our working. |
| **AI-visibility prompt tracking** (`aiVisibility` entitlement, currently unimplemented) | **REVISED 2026-09-10.** An earlier draft banned this outright on cost. That reasoning was wrong: it divided a **shared** cost by one. The prompts that matter are *category* prompts — "best waterproof dog bed under $100" — and the answer is the same for every merchant in that vertical. Run the corpus **once per vertical** and fan it out. 31,000 queries across 100 merchants in a category is ~310 each: cents. | **Build it, as a shared per-vertical corpus.** ~50 prompts × 4 engines × 7 runs/day per vertical, not per store. Report **per engine, 4-week rolling, cited separated from mentioned, with the interval**. Label the method on every screen. Never a single blended weekly score. And ship the cheap honest thing alongside it: **one observation, shown as an observation** — the actual answer an engine gave, with the brand present or absent, as something the merchant can read and act on. That is honest at n=1 *provided it is labelled as one run and never trended.* |

---

## 4. THE PLATFORM RULES THAT CAN DELIST US

Dated, verified, non-negotiable. Missing one of these ends the business, not the sprint.

| Deadline | Rule | Our status 2026-09-10 |
|---|---|---|
| **1 Oct 2026** | `scriptTagCreate`/`scriptTagUpdate` return user errors. *"The deprecation applies to all API versions, including older ones, so pinning won't defer it."* | **We use a theme app extension, not script tags — verified.** Re-verify before the date. |
| **1 Oct 2026** | Extensions on API version **2025-07 or earlier cannot be updated**. | Our extension's API version must be checked. **OPEN.** |
| **16 Oct 2026** | Admin API **2025-10 becomes inaccessible**. | We are on **2026-04** (`shopify.app.toml:14`) — safe until Apr 2027. Latest stable is 2026-07. |
| **1 Mar 2027** | Shopify **stops injecting script tags into storefronts** entirely. | Not applicable — theme app extension. |
| Ongoing | *"If your app continues to use unsupported resources after the upgrade deadline, it's **delisted** from the Shopify App Store."* Users blocked from installing for **at least seven days**. | Standing risk. A version check belongs in CI. |
| Ongoing | **App Bridge `app-bridge.js` script tag before any other script, in the `<head>` of every document.** INP is only collected for apps using it. | Present (`app/utils/embedded.server.js:181`). Verify "before any other script". |
| Ongoing | **Asset API `PUT`/`DEL` needs a `write_themes` exemption** — granted for apps that *"primarily provide search engine optimization"*. Audited when applying for BFS. | We do not write theme files. Any future `robots.txt.liquid` / `agents.md.liquid` write triggers this. |
| 7 days | Failing to respond to a **quality check** demotes the app. | Owner must watch Partner notifications. |
| 60 days | Failing a BFS criterion for 60 days revokes the badge; **failing the same criterion three times suspends applications for three months.** | Not yet applicable. |

---

## 5. HOW THE APP STORE ACTUALLY RANKS US

Signals Shopify has **published**. Anything not on this list is folklore.

- **Built for Shopify** — *"Built for Shopify apps appear higher in Shopify App Store search
  rankings"* and are ranked above other apps with search boosts. **But 23 of the top 24 apps in our
  category already have it.** It is the entry ticket, not an advantage.
- **"Increased visibility on key merchant surfaces"** — a separate, earlier achievement that
  *"grants a search ranking boost"* **without the manual design review**. Criteria: good Partner
  standing · meets App Store requirements · uninstalls cleanly · minimises checkout speed impact ·
  minimum installs · minimum reviews · minimum rating. **This is our real near-term ranking target.**
- **Positive reviews** — *"positive reviews make your app appear higher in search results and
  category pages."* The overall rating is *"weighted to prioritize recent, useful, and trustworthy
  reviews… review quality over quantity."* Recency matters more than volume.
- **External traffic** — verbatim: *"Driving traffic to your app from outside of Shopify can help
  improve your app's ranking on the Shopify App Store."* Significant outside traffic can also list
  the app under **Trending apps**. **This makes navaal.ai a ranking lever, not just a demand lever.**
- **Listing content** — *"The Shopify App Store search engine parses the information in your app
  listing."* Fill every field including optional ones. Five search terms, complete words, one idea
  each. **Keyword stuffing is an explicit penalty**: overusing terms *"can DECREASE your app's
  discoverability."* Avoid symbols — *"use 'tshirt' instead of 't-shirt'."*
- **Branded search match** — strongly-matched branded searches surface **above ads**.
- **Localisation** — translated listings *"convert up to 4x better in non-English markets."*
- **Install velocity is never named in any Shopify source.** Treat every third-party claim about it
  as unverified.

---

## 6. THE ECONOMICS THAT BOUND EVERY DECISION

The market set our price before we did.

- **Floor:** Shopify itself. `/llms.txt`, `/agents.md`, UCP discovery, Shopify Catalog syndication,
  **Shopify Magic** (free product-description generation on every plan) and **AI-referral analytics**
  are all native and free. Then free apps: **SEOLab is #2 in the category with 2,596 reviews and no
  paid tier at all.** Then **Shop Rank AI at $9.99** with unlimited catalogue and competitor tracking.
- **Ceiling:** **$99.** Profound (which raised $96M at a $1B valuation in Feb 2026) put its Starter
  tier at $99. Semrush — **acquired by Adobe for ~$1.9B, closed Apr 2026** — sells AI visibility at
  $99/domain. Similarweb, $99. That is a deliberate defence of the low end by very large companies.
- **Our corridor is $19–$99, and it is crowded**: StoreRank $29, IndexGPT $45, Kwik GEO $50 (from
  GoKwik, a funded ecommerce infrastructure company, launched June 2026), Vizby $29.
- **Generation volume is anchored cheap**: ChatGPT AI Product Description gives **11,000 credits for
  $49**. Any plan of ours that caps generations tightly will read as mean.
- **Revenue share:** we keep **100% of the first $1M**, 85% above it, minus a 2.9% processing fee.
  The first million is entirely ours — which means the only thing that matters is getting to
  merchants, not optimising margin at the third decimal place.

**Therefore:** we do not compete on generation volume (commodity, anchored at $1 per 100), and we do
not compete on prompt-tracking volume (unaffordable to do honestly). **We compete on proof and on
eligibility — the two things nobody sells and both of which are cheap to deliver.**

---

## 6.5 RISKS WE CARRY OURSELVES, NOT JUST ONES WE AVOID

**Our own core feature is a spam-policy risk.** Google's scaled content abuse policy (updated
28 Aug 2026) names *"using generative AI tools… to generate many pages without adding value for
users."* Our headline capability generates thousands of product descriptions. The defence is not a
disclaimer, it is the product: per-product differentiation, minimum merchant-data density in every
description, uniqueness checks, a rate limiter on catalogue-wide publishes, and a **hard stop** —
if a treated arm ever underperforms its control at an interim look, we halt and roll back. We sell
**evidence density**, not volume, which is what the research actually supports anyway.

**Liability for generated copy.** Ground rule 6 is a technical control; it is not a legal one and it
will fail sometimes. We need, before we take money from anyone at scale: terms that allocate
responsibility for published copy, a publish-time acknowledgement, a subprocessor list naming the
model providers, a DPA, and a position on the **EU AI Act's transparency obligations** for
AI-generated content shown to consumers.

**Google's API Services User Data Policy** applies the moment we request `webmasters.readonly` —
limited-use obligations, in-product disclosure, and a privacy-policy standard. Not optional, and it
gates the proof engine.

**Publishing nulls needs consent.** §7 of the masterplan commits us to publishing results even when
they are null. Results derived from a merchant's store data require permission and anonymisation.

**Refunds.** A merchant who paid for twelve weeks and got a null result will ask for their money
back. The answer has to exist before the question does.

**Key-person risk is not solved by a productivity system.** One person, annual prepay taken at 25%
off, and no second pair of hands is a consumer-protection exposure, not just an operational one.
Credential and repository escrow, a deploy runbook a second person could execute, and either a
reserve against prepaid annual revenue or a pro-rata refund commitment in the terms.

## 7. THE TEN GROUND RULES

1. **Never claim what we cannot prove from a source we read.** Every number in the app names its
   source and its date. Every claim in this file carries its evidence, and so must every new one.
2. **Never present a cap as a total, a sample as a census, or a correlation as a cause.**
3. **A merchant must always be able to check our working.** Every proof number links to the raw
   source — the Search Console row, the index status, the holdback assignment.
4. **Prefer the boring documented mechanism to the exciting speculative one.** Attribute
   completeness beats "GEO optimisation" because one is documented and the other is contested.
5. **The platform is the competitor.** Before building anything, check whether Shopify already ships
   it free. It shipped llms.txt, agents.md, Catalog syndication, Magic and AI-referral analytics
   without announcing any of them to us.
6. **Never write to a merchant's catalogue without approval, and never invent a fact about a
   product.** In agentic commerce a false attribute becomes a false sale.
7. **Every feature must survive the question "what would this print if it were completely broken?"**
   and the question "can a merchant reach it on a rendered page?"
8. **Ship at phase boundaries, verify from production, and treat unshipped work as undone.**
9. **The listing may carry no statistics, no superlatives, no testimonials.** Our proof lives inside
   the app. Design accordingly.
10. **When the evidence changes, this file changes first, and the change leads the report.**
    Everything here was true on 2026-09-10 and some of it will stop being true.
