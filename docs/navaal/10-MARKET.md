# MARKET — verified 2026-09-10. Do not re-research; re-read the source and update.

Everything here was read from a primary source on 2026-09-10. Where a figure is vendor-reported or
third-party, it says so. **Anything in this file is not re-researched** (README rule 2).

---

## 1. THE CATEGORY — Shopify App Store, SEO / site optimisation

Live URL: `apps.shopify.com/categories/store-design-site-optimization-seo` — **1,110 apps**.
(The older `store-design-seo` and `marketing-and-conversion-seo` URLs now 404.)

Top of the category, in rank order, with review counts read on 2026-09-10:

| # | App | Rating | Reviews | Price |
|---|---|---|---|---|
| 1 | Judge.me Product Reviews | 5.0 | 46,689 | Free plan |
| 2 | **SEOLab: All in #1 SEO** | 4.9 | **2,596** | **Free only — no paid tier** |
| 3 | Smart SEO AI & Image Optimizer | 5.0 | 953 | Free / $14.99 / $24.99 / $49.99 |
| 4 | ChatGPT AI Product Description | 4.9 | 527 | Free / $19 / **$49 (11,000 credits)** / $249 |
| 5 | StoreSEO AI SEO Optimizer | 5.0 | 743 | Free / $14.99 / $39.99 / $249.99 |
| 6 | TinyIMG | 5.0 | 2,492 | Free to install / $14 / $23 / $49 |
| 7 | AltKing (alt text) | 5.0 | 198 | **Free** |
| 8 | **IndexGPT: AI SEO for ChatGPT** | 4.9 | 143 | Free / $16 / **$45 (Prompt Tracker + Sentiment)** |
| 10 | Webrex AI SEO, Schema JSON-LD | 4.9 | 854 | Free plan |
| 11 | Avada AEO SEO Optimizer LLMs | 5.0 | 396 | **Free** |
| 19 | BOOSTER AI SEO + AEO | 4.8 | **5,476** | Free / $39 / $69 |

**Five of the top 24 are entirely free**, including the #2 app. **23 of the top 24 carry Built for
Shopify** — it is table stakes, not a differentiator. A product-*reviews* app ranks #1 in SEO.

**53% of the apps parsed across the first three category pages put AI / AEO / GEO / ChatGPT / LLM
language in their name or tagline.** The term is fully commoditised.

**The correlation, and the honest reading of it.** Every app above 500 reviews treats AEO as a
marketing word and measures nothing; every app that genuinely tracks citations has **under 143
reviews**.

The flattering reading is "substance and distribution have not met — that is our opening." The
unflattering reading is "in this category, marketing words sell and substance does not." **Both are
consistent with the data and we must not pick the comfortable one by default.**

There is also a **time confound**: every substance app is new. StoreRank launched Aug 2025, Shop
Rank Dec 2025, Kedra Apr 2026, **Kwik GEO Jun 2026 — eighteen reviews at three months old.** Low
review counts are at least partly age. Treating this as a structural market gap would be the same
correlation-as-mechanism error we attack the GEO literature for. **This is an open question with a
falsification test attached — see `09-DOCTRINE.md` §0.1.**

---

## 2. THE BOTH-HALVES COMPETITORS — our old thesis is dead

**`05-EVIDENCE.md` previously said "nobody has both halves". That was true in 2025 and is FALSE now.**

| App | Launched | Reviews | Price | What it does |
|---|---|---|---|---|
| **StoreRank AI** | 21 Aug 2025 | 28 | $29 / $79 / $149 / $289 | The closest analogue that exists: AI schema, content optimizer, FAQ generator, article autopilot, **AI Mentions Tracker (5–200 queries)**, per-platform AI traffic and revenue analytics |
| **IndexGPT** | 25 Nov 2024 | **143** | $16 / **$45** | Smart Blogger, Content Creator, Schema Builder + **Prompt Tracker + Sentiment**. The most-reviewed app doing both |
| **Kwik GEO** (GoKwik) | 11 Jun 2026 | 18 | $50 / $79 / $200 / $749 | Prompts across ChatGPT/Perplexity/Google AI, **share of voice, sentiment, per-platform citation gaps**, auto-published AI blogs. A funded infrastructure company at our exact price |
| **Vizby** | 23 Oct 2025 | 31 | $29 / $125 / $249 / $499 | Visibility tests + agents that fix gaps. $29 buys **one** model and 10 prompts; ChatGPT starts at $125 |
| **Shop Rank AI** | 4 Dec 2025 | 27 | Free / **$9.99** | Unlimited catalogue search tracking, unlimited competitor tracking, bulk fixes, "AI-attributed revenue". **The price floor** |
| **Kedra AI Index** | 27 Apr 2026 | 47 | **Free** | llms.txt/agents.md, readiness score, prompt-ranking tracking |

**What has NOT been solved by any of them:**
1. **Both halves at catalogue scale with credible measurement.** The apps with real catalogue tooling
   measure nothing; the apps that measure have thin catalogue tooling and <150 reviews.
2. **Sample-size credibility at this price.** $29–$50 buys 5–50 prompts, weekly or bi-weekly, on 1–3
   models. Same-day repeat runs return source sets with Jaccard 0.32–0.43 — **most of what they plot
   is model stochasticity.**
3. **A causal link between the content generated and the outcome measured.** Every product shows
   generation and visibility side by side. **None proves the first caused the second.** That is the
   unclaimed ground, and it is where we go.

---

## 3. THE AI-VISIBILITY MARKET OUTSIDE SHOPIFY

| Vendor | Price | Note |
|---|---|---|
| Rankscale | $20 | |
| **Otterly.ai** | **$29** (15 prompts, 4 engines, daily) | cheapest credible tracker |
| Ahrefs custom prompts | €47 | requires Ahrefs |
| Rank Prompt | $49 (150 prompts/mo, 6 engines) | |
| SE Ranking Visible | $89 | |
| Peec AI | ~€89 / €199 / €499 (third-party sourced; Peec publishes no prices) | $4M ARR in 10 months, $21M Series A Nov 2025 |
| **Profound** | **$99** Starter / $399 Growth | **$96M Series C at $1B valuation, Feb 2026**; $155M total; 700+ enterprise customers |
| **Semrush AI Visibility** | **$99/domain**, annual only | **Adobe acquired Semrush for ~$1.9B, closed Apr 2026**, explicitly as a GEO play |
| Similarweb AI Brand Visibility | $99 | |
| Evertune | $800 | 100k prompts + 25 articles/mo |
| Scrunch | $250–$417 | |

**None of them writes product descriptions, meta tags, alt text or collection copy.** They are
brand-level prompt trackers. Only Alhena claims SKU-level tracking, and publishes no paid price.

**The squeeze:** the floor is set by Shopify (free) and by free apps with thousands of reviews; the
ceiling is set at **$99** by Adobe, Profound and Similarweb. Our corridor is narrow and contested.

---

## 4. WHAT SHOPIFY NOW SHIPS FREE — verified by us, not taken on trust

We fetched these ourselves on 2026-09-10 and got **HTTP 200** on live Shopify stores
(allbirds.com, drinkolipop.com, shop.polaroid.com, redbullshopus.com):

- **`/llms.txt`**, **`/llms-full.txt`**, **`/agents.md`** — identical "Agent Instructions" documents
  naming the store, its policies, its sitemap and its agent endpoints, and pointing agents at
  `https://shop.app/SKILL.md` for cross-store catalogue search and Shop Pay checkout.
- **`/.well-known/ucp`** — Universal Commerce Protocol discovery, **version `2026-08-25`**, declaring
  `dev.ucp.shopping` over MCP, plus checkout, cart, fulfilment, discount, order and catalogue
  capabilities and Shop Pay / Google Pay payment handlers.
- Merchants customise them with theme templates **`agents.md.liquid`**, **`llms.txt.liquid`**,
  **`llms-full.txt.liquid`**.

*(Our own dev stores 302 to `/password` — they are password-protected, so this is not a
counter-example. Gymshark 404s because it is no longer a Shopify storefront.)*

Also native and free:
- **Shopify Magic** — product descriptions, blog posts, page content, *"available for free,
  regardless of your subscription plan."*
- **Shopify Catalog** — eligible products are *"automatically discoverable by AI channels"*, with
  *"title, description, options, images, price, availability and other key attributes, all
  structured in a way that AI agents can parse."* **The merchant does nothing.**
- **AI-referral analytics** — `agentic_referring_channel` in ShopifyQL, values **ChatGPT, Google AI
  Mode and Gemini, Microsoft Copilot, Shop**. Readable by an app via `shopifyqlQuery` with
  `read_reports` **and Level 2 protected customer data access**.
- Themes are **required by Shopify** to emit product rich snippets; the `structured_data` Liquid
  filter outputs `Product` / `ProductGroup` / `Article`. Canonicals, sitemap, robots.txt and title
  tags are all auto-generated.

**Consequence: the entire "generate an llms.txt" app genre is obsolete, and several apps in the top
24 still sell it as a paid-tier feature.**

---

## 5. AGENTIC COMMERCE — where product data now decides revenue

- **ChatGPT is discovery-only on Shopify today**: *"ChatGPT acts as a discovery-focused referrer
  platform"*; customers are *"redirected to buy products in your online store checkout."* Instant
  Checkout remains limited to approved partners.
- **Microsoft Copilot, Google AI Mode/Gemini and Meta support in-channel checkout** when the
  merchant activates it. **Agentic storefronts are active by default for eligible stores** (must
  sell to US customers, eligible products, policies complete, supplemental ToS accepted). D2C only —
  B2B-only products are excluded.
- **Google Universal Cart** (19 May 2026) spans Search, Gemini, YouTube and Gmail, built on
  **Merchant Center feeds**; launch merchants include Shopify merchants.
- **OpenAI product feed spec** requires `item_id`, `title`, `description`, `url`, `brand`,
  `image_url`, `price`, `availability`, `target_countries`, `seller_name`; recommends `group_id` /
  `variant_dict`, `size`, `q_and_a`, `reviews`. OpenAI ranks on *"availability, price, quality, and
  whether they are the maker or primary seller."*
- Shopify's own optimisation advice is **entirely product-data hygiene**: accurate title,
  description, images, type, vendor, collections, tags, **barcode (ISBN/UPC/GTIN)**, variants with
  option names, complete store policies.

**This is the single most important shift for our product: in agentic surfaces, the input is the
feed, not the page.** Prose still matters for the open web and for Google's index; **structured
attribute completeness is what decides eligibility.**

---

## 6. MEASUREMENT — what exists, what it costs, what it can prove

| Instrument | What it gives | Limit |
|---|---|---|
| **GSC Search Analytics API** | clicks, impressions, CTR, position by page × query × date × country × device | **50,000 rows/day/site/search-type**; 1,200 QPM; **2–3 day lag**; anonymised long-tail queries omitted from query rows but present in totals |
| **GSC BigQuery bulk export** | the same data with **no row cap**, anonymised rows retained and flagged | needs a GCP project and property-owner rights; BigQuery costs |
| **URL Inspection API** | verdict, coverage state, robots state, `lastCrawlTime`, **googleCanonical vs userCanonical**, rich results | **2,000 queries/day/property.** A 3,000-product sweep costs 1.5 days of quota — weekly sweeps fine, daily impossible |
| **GSC generative-AI report** | **impressions only**, AI Overviews + AI Mode, by page/country/device/date | **no API**, UI export only; worldwide since 31 Aug 2026 |
| **Bing Webmaster AI Performance** | total citations, cited pages, **grounding queries**, **citation share vs all sites** | **no API** (confirmed by Microsoft, Feb 2026), UI only, public preview |
| **Google Indexing API** | — | **Restricted to `JobPosting` and `BroadcastEvent` only.** Product pages are not eligible. Using it anyway is against policy |
| **IndexNow** | notifies **Bing, Yandex, Naver, Seznam, Yep** within minutes; 10,000 URLs per POST | **Google does not participate.** No published time-to-index guarantee |
| **Bing Webmaster API** | URL submission (**sanctioned for commerce pages**, ~10,000/day), **per-page query stats with separate impression and click positions** | SOAP/POX retired 31 Aug 2026 — REST only |
| **ShopifyQL** | `agentic_referring_channel`, `landing_page_path`, `traffic_type`, sessions, conversion rate | needs `read_reports` **+ Level 2 protected customer data approval** |
| **Order.customerJourneySummary** | first/last visit, referrer, UTMs, days to conversion | **30-day attribution window** — every revenue claim inherits it |

**Statistical power — the numbers that decide what we can sell to whom:**

| Endpoint | Detectable change | Products per arm, **independent randomisation** |
|---|---|---|
| Indexation rate | 60% → 75% | **152** |
| Indexation rate | 50% → 60% | 388 |
| Impressions (CV≈2) | 50% lift | 252 |
| Impressions (CV≈2) | 30% lift | 698 |
| Impressions (CV≈2) | 20% lift | 1,570 |

**⚠️ CORRECTION 2026-09-10 — these numbers assume independent units, and often we cannot have them.**
Where generated content leaks between products (internal links, collection copy, shared FAQ blocks)
the randomisation unit must be the **collection**, and that is cluster randomisation. Required n
inflates by the design effect `1 + (m−1)·ICC`. At ~100 products per collection and a modest ICC of
0.05 the design effect is about **6** — so a 20% impressions lift needs on the order of
**9,000–18,000 products**, not 3,000.

**The consequences, stated plainly:**
- **A causal traffic claim is available only to very large catalogues** — a low single-digit
  percentage of Shopify stores. It is a premium-tier feature, not the product.
- **A 10% holdback can never produce it.** Only a 50/50 split can, and that split is what creates
  the conflict of interest a stepped-wedge design exists to remove.
- **Indexation proof (150–400 per arm) and IndexNow crawl-time proof (no catalogue minimum at all)
  are what actually work for a normal store.** Lead with those.
- Any screen that shows a merchant their minimum detectable effect **must apply the design effect**,
  or it understates the requirement by roughly six times — which would be the most embarrassing
  possible failure for a company whose position is statistical honesty.

**Honest AI-visibility measurement costs**: ≥30–50 prompts × ≥7 runs/prompt/day × 4 engines ×
28 days ≈ **31,000 queries per store per window.** Same-day repeat-run source Jaccard is 0.32–0.43;
even at 28 days and 7 runs the confidence interval is **±6.5 percentage points**, so 12% → 16% is
not a detectable improvement. **This is why we do not sell prompt tracking.**

---

## 7. SOURCES

Shopify: `shopify.dev/docs/apps/launch/built-for-shopify/requirements` · `/docs/apps/launch/marketing`
· `/docs/apps/build/online-store/theme-app-extensions/configuration` · `/docs/api/liquid/filters/structured_data`
· `/docs/api/shopifyql/2026-10/schemas/sessions_and_behavior/sessions` · `/docs/api/usage/versioning`
· `help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/*` · `/manual/shopify-magic`
· `changelog.shopify.com`.
Google: `developers.google.com/search/docs/fundamentals/ai-optimization-guide` (10 Jul 2026) ·
`/docs/appearance/ai-features` · `/docs/appearance/structured-data/faqpage` (removed 15 Jun 2026) ·
`/docs/appearance/structured-data/sd-policies` · `/docs/essentials/spam-policies` (28 Aug 2026) ·
`/webmaster-tools/limits` · Search Console generative-AI report docs.
OpenAI: `developers.openai.com/api/docs/bots` · `/commerce/product-feeds/spec`.
Bing: `blogs.bing.com/webmaster/February-2026/...AI-Performance...` · `June-2026/New-AI-Visibility-Insights...`.
Studies: Ahrefs schema DiD (11 May 2026, n=1,885 vs 4,000) · Ahrefs brand-visibility correlations
(75,000 brands) · Zhang et al. arXiv 2604.25707 (29 Apr 2026) · Schulte/Bleeker/Kaufmann arXiv
2604.07585 (10 Apr 2026) · Martinez GEO survey arXiv 2607.14035 (15 Jul 2026, 45 studies) ·
Puerto et al. C-SEO Bench NeurIPS 2025 arXiv 2506.11097 · Seer Interactive recency study (2026) ·
Semrush Ghost Citations (9 Jun 2026).
App Store listings and vendor pricing pages, all fetched 2026-09-10.
