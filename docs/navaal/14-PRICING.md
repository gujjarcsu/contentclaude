# PRICING — the analysis, the arithmetic, and the proposal

**2026-09-14. A PROPOSAL, not yet locked.** Costs are `MEASURED` (P0.6, `08-ECONOMICS.md` §2).
Competitor prices were read from live listings on 2026-09-10 (`10-MARKET.md` §1).
Locking this closes the owner decision at the top of `OWNER-CHECKLIST.md`.

---

## 1. THE ONE NUMBER THAT DIAGNOSES EVERYTHING

Price per credit. Not price. **Price per credit.**

| App | Price | Credits | Per credit |
|---|---|---|---|
| **Navaal today** | $29.99 | 200 | **14.99¢** |
| Smart SEO | $24.99 | 500 | 5.00¢ |
| Avada SEO | $34.95 | 1,000 | 3.50¢ |
| **Navaal proposed** | $29.99 | **1,500** | **2.00¢** |
| StoreSEO | $39.99 | 5,000 | 0.80¢ |
| StoreSEO top tier | $249.99 | 50,000 | 0.50¢ |
| ChatGPT AI Product Description | $49 | 11,000 | 0.45¢ |

**We are three times dearer per credit than the most expensive competitor in the category and
thirty-three times dearer than the cheapest.** Not by a little. By an order of magnitude.

And W1 just told us the market's actual problem is content: **44.9% of 409 stores are missing
`product_type`, 43.9% have descriptions under 120 characters.** We sell the fix for the thing that
is actually broken, and we ration it at fifteen cents a unit.

**This is the whole diagnosis. The prices are fine. The allowances are indefensible.**

---

## 2. WHAT A CREDIT COSTS US — `MEASURED`

| Content type | Model | Cost |
|---|---|---|
| Alt text | Haiku 4.5 | **$0.000906** |
| Social | Haiku 4.5 | $0.002747 |
| Collection | Sonnet 4.6 | $0.005103 |
| Enhance | Sonnet 4.6 | $0.008498 |
| Product content (description + both metas, one call) | Sonnet 4.6 | **$0.0115** |
| Blog post | Sonnet 4.6 | **$0.0300** |

A **33× spread**, which is why one blended number never held. Realistic-mix blended:
**$0.00934/credit**.

### 2.1 Credit weighting — the design move that makes everything else safe

Make a credit mean roughly one unit of cost:

- **Alt text = 0 credits. Unmetered on every plan.** It costs a thirteenth of a product generation,
  it is the highest-volume call in the product, and **AltKing gives alt text away free with 198
  reviews** — so we are matching a free competitor with something that costs us nothing.
- **Blog post = 3 credits.** It genuinely costs 2.6× a product generation.
- **Everything else = 1 credit.**

**After weighting, the worst cost per credit is $0.0115 whatever the merchant does.** A blog post at
3 credits is $0.0100/credit — *cheaper* per credit than product content. The mix stops mattering,
and every cap below can be planned against one number.

*This is honest, not clever: a merchant is charged more credits for the thing that costs more, and
nothing for the thing that costs almost nothing.*

---

## 3. THE CAP RULE

> **monthly credits ≤ price × 0.60 ÷ $0.0115**

This guarantees **≥40% gross margin even if a merchant pays once, burns the entire allowance in
month one, and cancels.** That is the only scenario where generous caps can hurt us, and this rule
makes it survivable rather than merely unlikely.

| Plan | Price | Rule ceiling | **Set at** |
|---|---|---|---|
| Starter | $9.99 | 521 | **500** |
| Growth | $29.99 | 1,565 | **1,500** |
| Pro | $79.99 | 4,173 | **4,000** |

---

## 4. THE PROPOSAL

**Prices do not move. Allowances multiply.** Same four tiers, same four prices — the listing already
shows them, nobody is paying yet, and raising prices before we have a single review or a single
proved result would be earning nothing and asking for more.

| | **Free** | **Starter** | **Growth** ★ | **Pro** |
|---|---|---|---|---|
| **Monthly** | $0 | **$9.99** | **$29.99** | **$79.99** |
| **Annual — 20% off** | — | **$95.90** | **$287.90** | **$767.90** |
| **Credits / month** | **100** *(was 25)* | **500** *(was 50)* | **1,500** *(was 200)* | **4,000** *(was 1,000)* |
| **Products covered** | 100 | 1,000 | 5,000 | Unlimited |
| **Alt text** | unmetered | unmetered | unmetered | unmetered |
| **Full catalogue audit** | ✓ never capped | ✓ | ✓ | ✓ |
| Approve before publish · rollback · version history | ✓ | ✓ | ✓ | ✓ |
| Rejected generations never billed | ✓ | ✓ | ✓ | ✓ |
| **Bulk generation** | **✗ — one at a time** | **✓** | ✓ | ✓ |
| FAQ content · collection copy | — | ✓ | ✓ | ✓ |
| Blog posts *(3 credits each)* | — | — | ✓ | ✓ |
| Autopilot on new products | — | — | ✓ | ✓ |
| Two description options to compare | — | — | ✓ | ✓ |
| Catalogue monitoring | weekly | daily | daily | daily |
| Multi-language | — | — | — | ✓ |
| **Bring your own AI key → unlimited generations** | — | — | — | **✓** |
| Setup call · direct access to the founder | — | — | — | ✓ |
| **Free trial** | — | 14 days, 250 credits | 14 days, 250 credits | 14 days, 250 credits |

**Credit packs, any paid plan, one-time:** **1,000 for $19 · 2,000 for $39 · 4,000 for $79.**
1.90–1.98¢ per credit — deliberately the same as the subscription rate, so there is no arbitrage in
either direction and no reason for a merchant to feel punished for topping up.

### 4.1 Every number margin-checked

| Plan | Price | Credits | Full-burn COGS | **Burn margin** | Per credit |
|---|---|---|---|---|---|
| Free | $0 | 100 | $1.15 | — (acquisition) | — |
| Starter | $9.99 | 500 | $5.75 | **42.4%** | 2.00¢ |
| Growth | $29.99 | 1,500 | $17.25 | **42.5%** | 2.00¢ |
| Pro | $79.99 | 4,000 | $46.00 | **42.5%** | 2.00¢ |

**Uniform 2.00¢ per credit across every tier.** No tier punishes the merchant for being small, and
the plan ladder is about *capability and scale*, not about a worse unit price.

### 4.2 What actually happens — an 800-product store on Growth

| | |
|---|---|
| Month 1, full catalogue pass (830 credits) | $9.54 |
| Months 2–12, ~40 credits/month | $5.06 |
| **12-month COGS** | **$14.61** |
| 12-month revenue | $359.88 |
| **12-month gross margin** | **95.9%** |

Steady state at realistic ~15% utilisation: **$2.59/merchant/month COGS, ~91% gross margin.**

### 4.3 Burn-and-churn — the only case that can hurt

| Plan | Paid once | Burned everything | **Kept** |
|---|---|---|---|
| Starter | $9.99 | $5.75 | **$4.24** |
| Growth | $29.99 | $17.25 | **$12.74** |
| Pro | $79.99 | $46.00 | **$33.99** |

**Positive in every case.** That is what the cap rule buys.

### 4.4 The free tier ceiling

| | |
|---|---|
| 100 credits at product-content rate | $1.15 |
| Unmetered alt text, 100 products × 4 images | $0.36 |
| **Worst realistic free install** | **≈ $1.51 / month** |

The 100-product cap is what bounds it — without it, unmetered alt text on a 10,000-image store is
unbounded. **$1.51 is the cheapest customer acquisition we will ever buy**, and it is the number the
owner is accepting a ceiling on.

---

## 5. WHY EACH DECISION IS THE WAY IT IS

**100 free credits and no bulk.** The owner's idea and it is the strongest move in the table. 100
credits is four times today's free tier and beats ChatGPT AI Product Description's 100-credit trial —
but **without bulk, a 500-product store cannot realistically use it to do the catalogue.** They would
click five hundred times. So the free tier is genuinely useful for trying the product and genuinely
insufficient for the job, and **the thing you pay for is the thing that saves the time** — which is
the honest version of a paywall. Nothing is hidden, no number is a trick, and the gate is a
capability rather than a rationed quantity.

**Prices unchanged, allowances multiplied 4–7.5×.** With zero paying merchants and zero reviews,
raising price is asking for more before having proved anything. Raising *value* at the same price is
the move that converts, and the margin data says it costs us almost nothing.

**Annual at 20%.** Every competitor displays 17% (two months free). 20% beats all of them, reads as
a real discount, and — per `08-ECONOMICS.md` §5 — halving churn more than doubles the business.
Annual prepay also **eliminates burn-and-churn entirely**, because the twelve months are already paid.

**Credits reset monthly on annual plans too**, with one month of rollover. Twelve months of credits
on day one would recreate the burn risk the cap rule exists to remove.

**The annual catalogue boost — the one thing I would add beyond the table.** Annual subscribers get
a **one-time 2× credit month** on signup, so they can do the whole catalogue at once. It costs
$17.25 on Growth against $287.90 already collected, and it solves the merchant's real problem (the
initial burst) in exchange for the twelve-month commitment. **Strategically the best-value line in
the table.**

**14-day trial with 250 credits.** Competitors run 3–7 days; Shopify recommends 14. But a trial
carrying the full Growth allowance exposes **$17.25 per abusive trial — $1,725 across a hundred of
them.** 250 credits caps that at **$2.88**, is still 2.5× the free tier, and is enough to prove the
product on a real slice of a real catalogue. Stated plainly on the plan card, never discovered later.

**Alt text unmetered.** Costs $0.000906. AltKing gives it away free. Making it free makes every
credit go further in perception and removes the pettiest possible complaint.

**Audit never capped, on every plan including Free.** Competitors cap free audits at 20–25 pages. It
is a read — it costs us nothing — and it is the hook: a 3,000-product store on Free sees every
problem it has, and then discovers it needs bulk to fix them.

**Bring your own key at Pro.** Removes the COGS ceiling entirely and lets Pro honestly promise
unlimited. Smart SEO validated the model at $49.99, so it is not exotic. It does not exist in the
code yet (`C0.3`) — this is a build, not a toggle.

---

## 6. WHAT MUST BE BUILT BEFORE THIS CAN SHIP

| | What | Why |
|---|---|---|
| 1 | **Credit weighting** — alt text 0, blog 3, rest 1 | Everything in §3 depends on it. Without it the worst case is 3× the plan. |
| 2 | **Two-axis limits** — products covered AND credits | The 100-product cap is what bounds the free tier's unmetered alt text. |
| 3 | **Bulk gating on Free** | The conversion mechanism. Must state *why* it is gated, not just refuse. |
| 4 | **Trial credit allowance**, separate from the monthly allowance | $2.88 vs $17.25 per abusive trial. |
| 5 | **Annual at 20% + the one-time 2× first month** | Retention instrument; kills burn-and-churn. |
| 6 | **Credit packs** as one-time purchases | Requires the Billing API, **not** Shopify App Pricing — it does not support one-time purchases. |
| 7 | **BYO key at Pro** | Does not exist in code or schema. A build. |
| 8 | **Grandfather nobody** | There are no paying merchants. This is the only moment this change is free. |

---

## 7. THE BUSINESS THIS PRODUCES

Mix 45% Starter / 40% Growth / 15% Pro → **ARPU $28.49**, inside the category norm of $25–35.

| Paying merchants | MRR | ARR |
|---|---|---|
| 10 | $285 | $3,419 |
| 50 *(Built for Shopify eligible)* | $1,424 | $17,094 |
| 150 *(top ten in category)* | $4,274 | $51,282 |
| 500 | $14,245 | $170,940 |
| 1,000 | $28,490 | $341,880 |

At ~91% steady-state gross margin, and **100% revenue share on the first $1M** — so the first
million is entirely ours.

**The honest reading:** 150 merchants is a $51k/year business, not a $10k/month one. The old ladder
claimed ~$9.9k MRR at 150 merchants on a price list that was never shipped. **Reaching $10k/month
needs ~350 paying merchants**, and the way there is more merchants, not a higher price — because the
category's own ceiling is $99 and it is defended by Adobe and by a company valued at $1B.

---

## 8. THE DECISION THIS CLOSES

`OWNER-CHECKLIST.md` asks: **(a) raise prices toward the premium the doctrine claims, or (b) drop
the premium claim and position inside the category?**

**This proposal is (b), with a correction to how it was framed.** The choice was never really about
price — it was about whether the *allowance* was defensible, and it was not. Positioning inside the
category at $9.99–$79.99 with **2¢ credits instead of 15¢** makes us competitive on the axis
merchants actually compare, keeps 42% margin in the worst case and 91% in reality, and leaves the
premium to be earned later — with a proved result, which is the only thing that ever justified it.

**What to lock:** one dated sentence in `04-DECISIONS.md` saying (b), plus this table.
