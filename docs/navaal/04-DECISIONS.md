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


---

## OPEN — owner only, do not decide these yourself
- [ ] Free tier model spend (~$0.75/active free install/month) — acceptable ceiling?
- [ ] Onboarding call + 1-business-day response at Enterprise — confirmed honourable? (owner said yes; keep until written)
- [ ] navaal.ai/tools — keep or cut (it exists and now carries the install link)
- [ ] Bilby ↔ Navaal bundling: one company, two products, shared probe
- [ ] Done-for-you at $750 — process before promotion
