# THE OFFER — plans, features and listing copy

**2026-09-10.** Prices set deliberately under the nearest comparable competitor (`10-MARKET.md` §1
and §3, all read live that day). Feature allocation follows `09-DOCTRINE.md`.

> **THE RULE THAT PREVENTS THE OBVIOUS MISTAKE:** the listing may advertise **only what ships
> today**. Everything else waits. Shopify re-evaluates apps that *"no longer reflect the original
> core functionality submitted"*, and a promise on a listing that the app cannot keep is the
> one-star review this whole project is built to avoid. **§4 is the listing we publish now. §5 is
> the listing we publish after Phase 2 and Phase 3 ship — not before.**

---

## 1. THE PLANS

> **⛔ SUPERSEDED 2026-09-14. THE TABLE BELOW IS NOT THE PRICE LIST.**
> The locked plans are in **`14-PRICING.md` §4**, recorded in `04-DECISIONS.md` under
> **PRICING — LOCKED 2026-09-14**, and they are what the code bills as of `7d23792`:
>
> | | Free | Starter | Growth | Pro |
> |---|---|---|---|---|
> | Monthly | $0 | $9.99 | $29.99 | $79.99 |
> | Annual (save 20%) | — | $95.90 | $287.90 | $767.90 |
> | Credits / month | 100 | 500 | 1,500 | 4,000 |
> | Products covered | 100 | 1,000 | 5,000 | Unlimited |
> | Bulk generation | ✗ | ✓ | ✓ | ✓ |
> | Trial | — | 14 days, 250 credits | 14 days, 250 credits | 14 days, 250 credits |
>
> **Four tiers, not five. There is no Scale and no Enterprise tier.** Credits are weighted —
> alt text 0, blog post 3, everything else 1 — so "AI generations / month" below is not the same
> unit as "credits" above and the two must never be mixed in one sentence.
> The table below is kept for its **feature-to-tier allocation and its competitor column only**,
> and even those rows must be re-read against the four locked tiers before anything is published.
> Found stale by CW on 2026-09-14, while checking the listing against this file.

Annual billing is **20% off**. Trial is **14 days**, against 3–7 days from competitors and
Shopify's own recommendation of 14.

| | **Free** | **Starter** | **Growth** ★ | **Scale** | **Enterprise** |
|---|---|---|---|---|---|
| **Monthly** | $0 | **$12.99** | **$27.99** | **$44.99** | **$89** |
| **Annual (20% off)** | — | $124.70 | $268.70 | $431.90 | $854.40 |
| Nearest competitor | — | $14.99 Smart SEO · $14.99 StoreSEO · $16 IndexGPT · $19 Yoast | $29 StoreRank · $34.95 Avada · $39 Booster · $39.99 StoreSEO | $45 IndexGPT · $49 TinyIMG · $49.99 Smart SEO · $50 Kwik GEO | $99 SearchPie · $99 Avada · $99 Semrush · $99 Profound |
| **Products covered** | 100 | 1,000 | 5,000 | 25,000 | Unlimited |
| **AI generations / month** | 100 | 1,000 | 3,000 | 10,000 **or unlimited with your own AI key** | Unlimited, own key |
| **Full catalog audit** | ✓ **never capped, any plan, any size** | ✓ | ✓ | ✓ | ✓ |
| Store + per-product scores, before and after | ✓ | ✓ | ✓ | ✓ | ✓ |
| Descriptions, meta titles, meta descriptions, alt text | ✓ | ✓ | ✓ | ✓ | ✓ |
| Brand voice learned from your own catalog | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approve before publish · edit · one-click roll back | ✓ | ✓ | ✓ | ✓ | ✓ |
| Publish verified against what Shopify actually stored | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Bulk generation** | — | **✓** | ✓ | ✓ | ✓ |
| FAQ content · collection descriptions | — | ✓ | ✓ | ✓ | ✓ |
| Templates · version history | — | ✓ | ✓ | ✓ | ✓ |
| **Daily store checks + alerts** *(Phase 2)* | weekly | **daily** | daily | daily | daily |
| IndexNow submission to Bing, Yandex, Naver, Seznam, Yep *(Ph 3)* | — | ✓ | ✓ | ✓ | ✓ |
| Blog posts · autopilot on new products | — | — | ✓ | ✓ | ✓ |
| **Bulk eligibility fixes** *(Phase 2)* | — | — | ✓ | ✓ | ✓ |
| **AI traffic report** — sessions from ChatGPT, Copilot, Gemini *(Ph 3)* | — | — | ✓ | ✓ | ✓ |
| **Crawl-speed proof, measured against a holdout** *(Phase 3)* | — | — | ✓ | ✓ | ✓ |
| Weekly report | — | — | ✓ | ✓ | ✓ |
| **AI answer sampling**, per engine, method labelled *(Phase 3)* | — | — | — | ✓ | ✓ |
| Search Console indexation + impressions proof *(Phase 5)* | — | — | — | ✓ | ✓ |
| **Control-group proof** *(Phase 5, large catalogs)* | — | — | — | ✓ | ✓ |
| Multi-language · bulk undo | — | — | — | ✓ | ✓ |
| Markets · B2B · multi-store · audit trail · roles | — | — | — | — | ✓ |
| **Setup call, and every question answered within one business day, direct to the founder** | — | — | — | — | ✓ |
| **Free trial** | — | 14 days | 14 days | 14 days | 14 days |

**Add-ons, any paid plan, one-time:** generation packs **$9 / 2,000 · $22 / 6,000 · $45 / 15,000** ·
extra AI prompt pack **$12 / 20** · done-for-you setup **$690** (a contact action, never self-serve —
sell it only when the process to deliver it exists).

*One-time purchases require the **Billing API (Manual Pricing)**. Shopify App Pricing does not
support them (`10-MARKET.md`). Do not migrate while these exist.*

### Why the caps are where they are
- **Free covers 100 products** — enough for a real small store to get real value, which is the point
  of a free tier in a category where the #2 app is free with 2,596 reviews.
- **Bulk generation is at the FIRST paid tier.** Gating it at tier three is what made the primary
  button a dead end for every free merchant, and it was defect A3.1.
- **The audit is never capped, on any plan, at any catalog size.** Competitors cap free audits at
  20–25 pages. Uncapped is the hook: a 3,000-product store on Free sees every problem it has.
- **Bring-your-own-key sits at Scale, not only Enterprise.** At an assumed $0.005 per generation,
  10,000 generations costs ~$50 against a $44.99 price — the tier is loss-making at full use without
  it. BYO key removes the ceiling and a competitor validated the model at $49.99.
- ⚠️ **Every cap above is provisional on `11-MASTERPLAN.md` P0.6** — measuring the real cost per
  generation, per content type, and routing alt text to a cheap model. **Do not publish this table
  before that measurement exists.** The $0.005 figure is `ASSUMED` and has never been checked.

---

## 2. WHAT SHIPS TODAY vs WHAT DOES NOT

Verified against the repository on 2026-09-10. **This is the line the listing may not cross.**

**Live now:** full catalog audit · store and per-product scores with a before captured once ·
descriptions, meta titles, meta descriptions, alt text · FAQ content and collection copy · blog
posts · brand voice inferred from the merchant's own catalog · bulk optimize jobs · review, edit,
approve, publish · one-click restore original · version history · templates · autopilot on new
products · a quality gate that blocks near-duplicate copy and refuses to delete a merchant's own
commercial promises · publish verification that re-reads what Shopify actually stored.

**Not built yet — must not appear on the listing:** daily store checks and alerts · eligibility
grading per product · bulk eligibility fixes · IndexNow · AI traffic reporting · crawl-speed proof ·
AI answer sampling · Search Console proof · control-group proof · multi-language · markets and B2B.

---

## 3. THE POSITIONING LINE

Used on the listing, the site, the first screen and every email. **The outcome leads; the honesty is
the reason to believe, one line below** (`09-DOCTRINE.md` §0.1).

> **Get your products found by Google and AI shopping — and see whether it worked.**
> Nothing publishes until you approve it.

---

## 4. THE LISTING — publish this now

Every field checked against Shopify's limits and against requirements 4.2.2, 4.3.3, 4.3.4, 4.3.6,
4.3.7 and 4.4.1: **no statistics or data of any kind, verifiable or not · no "first", "best" or
"only" · no testimonials · no pricing in images · no keyword stuffing.**

**App name (25/30):** `Navaal: AI SEO, AEO & GEO`
*Keep it. It leads with the brand, which requirement 4.1.2 demands, and it carries the terms
merchants search. Shopify advises avoiding symbols in **keywords** — that guidance applies to the
five search terms, not the name, and those are symbol-free below.*

**App introduction (86/100):**
> Audit your catalog, fix what's missing in your brand voice, and see whether it worked.

**App details (478/500):**
> Most stores have thin product descriptions, missing meta titles and no alt text, and product data
> AI shopping assistants cannot read. Navaal audits your whole catalog, writes what is missing in
> your own brand voice, and publishes nothing until you approve it. Edit, publish or roll back any
> change. Navaal checks the copy it writes against your existing products, so it will not repeat
> itself or quietly drop a promise you already made to customers.

**Feature bullets (each ≤80):**
1. `Full catalog SEO audit, never capped by plan or store size` (58)
2. `AI descriptions, meta tags, alt text and FAQs in your own brand voice` (69)
3. `Nothing publishes until you approve it. Edit, publish or roll back anytime` (74)
4. `Blog posts and collection copy written from your own catalog` (60)
5. `Every publish is checked against what your store actually saved` (63)

**Search terms (5, complete words, one idea each, no symbols):**
`seo audit` · `product descriptions` · `meta tags` · `alt text` · `ai visibility`

**Also set:** "Merchant must have online store" under sales-channel requirements · state that the FAQ
block needs a theme app embed activated · mark one plan Free so the card reads *"Free plan
available"* in search results · fill every optional field · up to 25 structured features.

**Screenshots:** 1600×900, three to six desktop, app UI only, no browser chrome, no pricing, no
personal data, each image unique, alt text on every one. Capture on a real-looking dev store — never
on the EBS catalog.

---

## 5. THE LISTING — publish this ONLY after Phase 2 and Phase 3 ship

Do not publish any part of this early. Each line names the phase that must be live first.

**Introduction (89/100):**
> Get found by Google and AI shopping, and know the day something in your store breaks.

**Added bullets:**
- `Daily checks tell you when a theme or import breaks your product data` *(Phase 2)*
- `See what AI shopping feeds require that your products are missing` *(Phase 2 — reworded 2026-09-14 on CC's flag: the old line claimed more than the app shows; this one is exactly what `/app/attention` grades)*
- `Fix missing barcodes, option names and alt text across your catalog in bulk` *(Phase 2)*
  *(Corrected 2026-09-14 by CC when P2.6 went live: the earlier wording said "availability", which
  the app does not and cannot fix — Shopify supplies availability to every feed from inventory, so
  there is nothing to add. Barcodes are typed by the merchant or the product is marked own-brand;
  option names are proposed and applied; alt text is written at 0 credits and reviewed. Verified on
  `/app/fix`.)*
- `See sessions referred from ChatGPT, Copilot and Google AI` *(Phase 3)*
- `Compare changed pages against a holdout to see if crawling sped up` *(Phase 3)*

**Added details paragraph:**
> Navaal then checks your store every day and tells you when something breaks: a theme update that
> drops product data, an import that clears barcodes, a setting that blocks AI crawlers.

---

## 5.5 TWO LIVE OVER-CLAIMS AND THEIR APPROVED REPLACEMENTS
*Added 2026-09-14. Both are on the public listing right now — verified by fetch — and in front of
two real merchants. Plan-feature lines are `maxlength 40`; these fit.*

| Live now | Why it must go | **Approved replacement** | Chars |
|---|---|---|---|
| `A/B variant testing` | The feature is built and gated at Growth+, but the app's own button says *"Generate two options to compare"* — it produces two candidate texts for the merchant to pick between. **No traffic split, no winner measured.** "A/B testing" names a measurement we do not perform, and an SEO buyer checks. | **`Two description options to compare`** | 34 |
| `Priority support` | The same undefined-promise class as "SLA support", which §6 bans by name. There is no defined priority, no queue and no response commitment behind it. | **`Email support from the founder`** | 30 |

Fix both surfaces, not one. `app/routes/app.plans.jsx:271` carries `Priority support` inside the
app, and the A/B wording appears wherever the Growth tier is described. **P0.8's lesson was exactly
this: the listing got cleaned on 2026-09-10 and the same two phrases were still shipping inside the
app on 2026-09-14.**

## 6. HOW WE DESCRIBE THE HUMAN SERVICE

The owner can and will do this personally, and at a small number of merchants it is a genuine
advantage that no large competitor can match. **The offer stays. The two words go.**

| Never say | Say |
|---|---|
| "SLA support" | "Every question answered within one business day" |
| "Dedicated account manager" | "Direct access to the founder" |
| "24/7 support" | "Setup call when you start" |

**Why.** "SLA" means a contractual guarantee with remedies — say it without one written and it is a
promise we cannot even define. "Account manager" implies a person who exists while the owner is
asleep or ill. What we offer is better than both and it is true: the merchant gets the person who
built it. When a written SLA with defined remedies exists, we publish it and say so.
