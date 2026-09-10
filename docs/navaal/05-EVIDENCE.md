# EVIDENCE — verified facts. Do not re-research these.

> **⚠️ §2 (competitor pricing) and §1 (the ladder) were superseded on 2026-09-10 by
> `10-MARKET.md`, which was researched from live sources that day. Where the two disagree,
> `10-MARKET.md` wins.** This file keeps the store-shape axes (§4), the EBS baseline (§5), the
> inherited assets (§6) and the contaminated-measurement list (§6b), which remain current.

Everything here was read from a primary source on the date shown. If you think one is stale,
re-read the source and update the file — do not quietly assume.

---

## 1. THE LADDER TO #1 (2026-09-10, live category page + Shopify docs)

- **All fifteen** top apps in the SEO category carry Built for Shopify. It is the entry ticket.
- Ratings across the top 15: **4.8–5.0**.
- Review counts: **46,645 down to 142**. IndexGPT ranks #10 on **143**; AltKing #9 on 195; SEO HERO #15 on 171.
- Built for Shopify requires: **50 net installs from shops on paid Shopify plans**, **5 reviews**,
  a minimum recent rating, and admin performance p75 over 28 days across **≥100 calls**
  (under 100 calls the app is *ungraded*, not passing).
- => Top ten ≈ **BFS + 4.9 + ~150 reviews**. Not 46,000.

## 2. COMPETITOR PRICING (2026-09-10, read from each listing)

| App | Reviews | Pricing | Tracks AI citations? |
|---|---|---|---|
| SEOLab | 2,590 · 4.9 · BFS | **Free only** | No |
| Avada AI SEO Image Optimizer | 4,663 · 4.9 | $0 (100 credits) / $34.95 (1,000) / $99 (10,000) | No |
| Smart SEO | 952 · 5.0 · BFS | $0 (20 gens, 20-page audit) / $14.99 (200) / $24.99 (500) / $49.99 (**unlimited with own key**, unlimited audit) | No |
| StoreSEO | 741 · 5.0 · BFS | $0 (25 products/200 credits) / $14.99 (100) / $39.99 (250/5,000) / $249.99 (10,000/50,000, multilingual) | No |
| Avada AEO LLMs.txt | 393 · 5.0 | **Free** | No — generates only |
| IndexGPT | 143 · 4.9 · BFS | $0 / $16 / **$45** (Prompt Tracker + sentiment at top tier) | Yes, top tier only; generation is thin |
| CartRank | **0** | Free (15 prompts, 1 rival) / **$99** (50 prompts, 8 rivals) | Yes, and rival comparison — but no generation |
| Olaka ChatGPT Descriptions | 1 | $0 (50 credits) / $10 (3,000) / $20 (6,000) + credit packs | No |

**Readings that matter:**
- The utility layer has collapsed to free. We cannot win there.
- The AI-visibility layer prices at **$45–$99 with almost no traction**.
- **~~Nobody has both halves.~~ FALSIFIED 2026-09-10 — see `10-MARKET.md` §2.** StoreRank ($29),
  IndexGPT ($45), Kwik GEO ($50, from funded GoKwik), Vizby ($29), Shop Rank AI ($9.99) and Kedra
  (free) all now ship generation **and** citation tracking. What nobody has solved is credible
  measurement at this price, or a **causal** link between the content generated and the outcome
  reported. That, not "both halves", is our position.
- llms.txt is a free commodity.
- "Unlimited with own key" is a proven margin unlock.
- Category ARPU ≈ $25–35. Ours is designed at ~$66.

## 3. CHURN — the structural threat

Catalogue optimisation is a **one-time burst then maintenance**. That is what makes generous
generation caps profitable AND why merchants cancel in month four. The work is finished.

| Monthly churn | LTV at $58 ARPU | Enterprise value at 150 merchants |
|---|---|---|
| 5% | $1,160 | ~$174k |
| 2% | $2,900 | ~$495k |

**Retention beats pricing, positioning and every feature.** Monitoring is what makes the product
un-finishable, which is why AI visibility sits in every paid tier.

## 4. STORE SHAPES — the fixture axes (L2)

    catalogue size:   0 · 1 · 5 · 250 · 3,000 · 50,000 · 500,000
    status mix:       all active · all draft · majority archived · mixed
    channel:          on Online Store · not published · B2B-only · multi-channel
    existing content: none · thin templated · excellent hand-written · partial by field
    structure:        no variants · heavy variant families · multipacks · one product 100 variants
    locale:           English · non-English · multi-locale via Translations
    plan:             Free with quota · Free exhausted · mid-tier · catalogue > any plan · BYO key
    API:              healthy · THROTTLED · partial failure · deploy mid-job

## 5. THE REAL-CATALOGUE BASELINE (EBS, 2026-09-10) — an instrument, not a spec

3,148 products: **1,350 active**, 280 draft, **1,518 archived**. 395 collections.
- 46 of the 50 displayed rows already had descriptions.
- **0 of 100** sampled ACTIVE products had an empty description (two independent sort orders).
- Our own audit said "6 Missing descriptions" of 500 — the button said 3,146. ~500× apart.
- 21 of 30 sampled collections already had full hand-written copy **better than ours**, carrying
  the merchant's real differentiators.
- Seven products differing only by finish had byte-identical descriptions → SimHash distance 0.
- The audit's worst-first action queue was **entirely drafts and archived products**.

## 6. INHERITED ASSETS

- **AI-visibility probe, built and tested**, in `navaal-platform`:
  `apps/bilby-workers/lib/ai-visibility.cjs` (185 lines, writes `ai_visibility_runs` weekly),
  `apps/platform/lib/ai-visibility.ts` (41 lines), plus a test.
  Records per question: mentioned / cited / seen, cited_urls, seen_urls, **rivals**, answer,
  searches, cost in cents, errors. Carries its own honesty label in the header comment.
- navaal.ai marketing pages are **static HTML on Hostinger** under `public_html`.
  `/bilby`, `/dashboard`, `/account`, `/scoreboard` are Next.js on Fly from `navaal-platform`.
  Nav and footer in that repo are GENERATED from `packages/tokens/nav.json` and
  `packages/tokens/footer.html` via `scripts/site-nav-sync.cjs` — edit the sources.
- Install attribution live on all 67 static pages (`navaal-nav`, `navaal-footer`), 28 blog posts
  (`blog-post`), plus `navaal-home` and `navaal-tools`. Still to place: `bilby-footer`, `bilby-report`.

## 6b. CONTAMINATED MEASUREMENTS — do not baseline against these (INFRA5)

**Every latency and time-to-value figure captured before commit `d272222` (2026-09-10) is
deploy-contaminated and is not a baseline.** Until that commit a deploy left the app with **no running
web machine**: the Fly proxy queued requests for up to 17.1 s, and a routine deploy produced two
outages of 17.4 s and 16.8 s. Ten deploys happened in the two hours those numbers were gathered.

Specifically not to be trusted as baselines:
- the `app/uninstalled` webhook p90 of **5,911 ms** and the 7-day move from 1,039 ms to 1,403 ms
- the "1 of 5 deliveries failed" figure
- any TTV / first-draft timing from 2026-09-10 before `d272222`
- the `navaal-ttv-05` lost generation at 03:45 — a P2034 quota conflict, not a latency event

**The first clean baseline is the Phase A deploy, `d21b5bb`:** 3,035 samples, 0 non-200, p50 31 ms,
p90 36 ms, p99 123 ms, max 1,189 ms, one request over a second, longest real outage 1.19 s.

Also corrected (INFRA4): commit `4312a5b` claims the uninstall handler "answers in ~40 ms". **That was
never measured.** What was measured is `/api/health` at ~5 ms on the same machine; ~40 ms was an
inference from the handler's pre-200 work (an HMAC, a Redis `SET NX`, two queries). Measuring it for
real needs either a forged signed webhook against a production write path — forbidden — or log
retention, which is INFRA2.

---

## 7. FIVE FALSE GREENS — the pattern to expect

1. ESLint `--cache` reporting clean over broken code.
2. Twelve identical "410 Gone" screenshots reported as twelve passing screens.
3. A CI guard comparing an empty commit range and passing.
4. A full test suite green over a GraphQL query containing a `//` syntax error — every test mocked the transport.
5. A web-vitals harness measuring `admin.shopify.com` instead of our own iframe.

The shape: **a check that never exercises the thing it appears to cover.**

## 7b. A SEPARATE SHAPE — a safety fix that widens a different hole (2026-09-11)

Not a false green. A fix that was correct, verified, and made the system **less** safe in a dimension
nobody was looking at.

INFRA1 stopped `ci.yml` and `deploy.yml` both deploying the same commit. Correct, and proved live.
But `deploy.yml` runs **no tests**, and it had only been survivable because `ci.yml` *also* deployed
the commit after its tests went green — a tested copy always landed. Removing the duplicate removed
that accident: if the manual path wins the race it becomes the ONLY deploy, and can ship a commit
whose tests are still running or already red.

Measured on INFRA1's own proof run: the manual path deployed at **15:56:46**; CI's test job confirmed
the commit at **16:00:36**. Four minutes of shipped-but-unverified. The tests happened to pass.

**The lesson, which is the reusable part:** when you remove a redundancy, ask what that redundancy was
*accidentally* protecting. And note that this was only visible because the item demanded a LIVE proof —
a guard proved in the abstract would have shipped the regression with a green suite behind it.
