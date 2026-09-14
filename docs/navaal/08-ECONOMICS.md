# ECONOMICS — the model the product must not break

Read this before shipping anything that touches cost, quota, model spend, plan limits or margin.
A feature that is loss-making at full utilisation is a defect, however good it feels.

**Marked `MEASURED` or `ASSUMED` throughout. Never quote an `ASSUMED` figure as fact (L3).**

> **REWRITTEN 2026-09-14 (P0.6).** Two things were wrong with the previous version, and the second
> was worse than the first.
>
> **1. The unit cost was a guess, and it was wrong in both directions.** Every figure rested on
> `ASSUMED ~$0.005 per generation`. Measured against the real API through the real code path, a
> product generation is **$0.0115** (2.3× the assumption) and a blog post is **$0.0300** (6.0× the
> assumption), while alt text is **$0.000906** — one fifth of it. The old row said it itself — *"a
> FAQ block is not an alt text"* — and that is exactly why one blended number could never hold.
>
> **2. The plan table priced a business we do not sell.** §3 costed Free/Starter/Growth/**Scale**/
> **Enterprise** at $0/$19/$49/$99/$299 for 150/1,000/5,000/25,000/unlimited generations. The
> shipped, billable plans in `app/utils/billing-plans.js` are **Free $0 / 25**, **Starter $9.99 /
> 50**, **Growth $29.99 / 200**, **Pro $79.99 / 1,000**. **Not one row matched.** There is no Scale
> plan, no Enterprise plan and no bring-your-own-key path anywhere in the code or the schema —
> searched and confirmed. So the headline risk ("Scale is the plan to watch… negative at full use")
> named a plan that does not exist, and the ARPU ladder in §4 assumed a price list that was never
> shipped. Measuring the cost and plugging it into that table would have produced precise nonsense.
>
> The costs below are `MEASURED`. The margins are computed from them against the plans we actually
> bill. **The conclusion reverses the old one: every paid plan is comfortably profitable at 100%
> utilisation, in any mix.** The real exposure is on the revenue side — see §4.

---

## 1. THE SHAPE OF THE BUSINESS

Two halves, and they behave completely differently:

| | Generation | Monitoring |
|---|---|---|
| Pattern | A **burst**, then maintenance | Never finishes |
| Cost | Front-loaded, concentrated in month 1 | Small, flat, forever |
| Merchant value | Obvious immediately | Compounds |
| Effect on churn | **Causes it** — the work gets done | **Cures it** |

This single table is why the pricing is shaped the way it is: generous generation caps are
affordable *because* the burst ends, and AI-visibility monitoring sits in **every paid tier**
because it is the only part of the product that is never finished.

**Generation is the acquisition wedge. Monitoring is the business.**

---

## 2. UNIT COSTS — `MEASURED` 2026-09-14

Taken by `scripts/measure-generation-cost--spends-api-credit.mjs` through the **real**
`app/utils/ai.server.js` functions on the production machine — not a re-implementation, because a
re-implementation would measure a prompt written for the test rather than the prompt merchants are
billed for. Three samples per type, on an ordinary mid-catalogue product. Token counts are what the
Anthropic API returned; prices are Anthropic's published rates verified the same day and kept in one
place, `app/utils/modelPricing.js`.

| Content type | Model | Input tok | Output tok | **Cost / generation** | Observed range |
|---|---|---|---|---|---|
| Alt text | Haiku 4.5 | 409 | 99 | **$0.000906** | $0.000889–$0.000919 |
| Social | Haiku 4.5 | 292 | 491 | **$0.002747** | $0.002702–$0.002817 |
| Collection | Sonnet 4.6 | 291 | 282 | **$0.005103** | $0.004908–$0.005418 |
| Enhance | Sonnet 4.6 | 916 | 383 | **$0.008498** | $0.007953–$0.009018 |
| Product content | Sonnet 4.6 | 1,364 | 496 | **$0.0115** | $0.0112–$0.0118 |
| Blog post | Sonnet 4.6 | 427 | 1,917 | **$0.0300** | $0.0289–$0.0321 |

**A 33× spread between the cheapest and the dearest generation.** That is the whole reason a single
blended figure was never going to hold, and why a quota has to be understood as a count of
*credits*, not of money.

**One product generation is one credit and one API call** — description, meta title and meta
description come back together.

### Cheap-model routing is worth what it costs to maintain

Alt text runs on Haiku 4.5. On Sonnet 4.6 the same measured tokens would cost **$0.002712**, so the
routing saves **3.0×** on the single highest-volume call in the product: one per image, several
images per product, across a whole catalogue. Social is routed the same way for the same reason.

The routing table is `MODEL_FOR` in `app/utils/modelPricing.js`, with a test that fails if anything
moves alt text or social to a model above Haiku's rates. Before P0.6 this was true only by a string
literal repeated at six call sites, where nobody could see that it had been a decision.

| Item | Figure | Basis |
|---|---|---|
| Cost per generation | **$0.000906 – $0.0300, by type** | `MEASURED` — the table above |
| Free-tier model spend | **$0.29 typical, $0.75 absolute worst case**, per fully-active free install per month | `MEASURED` — 25 credits at the product rate; worst case is 25 blog posts |
| Cost per AI-visibility probe question | **not measured — and not measurable from this repo** | The inherited probe records cost in cents per run, but `ai-visibility.cjs` **is not in this repository** (searched 2026-09-14; it lives in the `navaal.ai` project). The old row read as though the number were one command away. It is not: someone with that repo has to read it out. Until then this is a blank, not an estimate. |
| Infrastructure | Fly (web + worker) · Neon · Redis | `ASSUMED` fixed and small relative to model spend at this scale. Re-check when installs pass ~200. |

**The two costs that scale with revenue are model spend and support.** Everything else is roughly
fixed until we are much larger.

---

## 3. MARGIN BY PLAN — the plans we actually bill

Plans and limits read from `app/utils/billing-plans.js`; costs from §2. "Worst case" means every
credit spent on the dearest content type — a blog post — every month, which no real merchant does
and which the business survives anyway.

| Plan | Price | Credits | Worst case (all blog) | Typical (product content) | Worst-case margin |
|---|---|---|---|---|---|
| Free | $0 | 25 | $0.75 | $0.29 | **−$0.75** — this is customer acquisition, and it is the cheapest we will ever buy |
| Starter | $9.99 | 50 | $1.50 | $0.58 | **85.0%** |
| Growth | $29.99 | 200 | $6.01 | $2.31 | **80.0%** |
| Pro | $79.99 | 1,000 | $30.03 | $11.53 | **62.5%** |

**No plan is loss-making at 100% utilisation, in any mix.** The previous version warned that the top
tier went negative at full use; that was an artefact of a 25,000-credit plan that does not exist. At
the limits we actually sell, the worst case a merchant can construct on Pro costs $30.03 against
$79.99 of revenue.

**The free tier is the number the owner must accept a ceiling on:** at most **$0.75 per fully-active
free install per month**, $0.29 at the realistic mix. It scales with installs, not with revenue — §7.

**What this changes:** cost control is no longer the binding constraint on pricing. The three old
hard requirements are re-aimed accordingly:

- ~~`C0.1` — measure the real cost per generation, per content type~~ **DONE, P0.6, 2026-09-14.**
  This section.
- `C0.2` — instrument **actual monthly utilisation per plan**. Still wanted, but now as a demand
  signal rather than a solvency alarm: a Pro cohort whose median use sits near 1,000 is telling us
  the plan is under-sized, not that it is unprofitable.
- `C0.3` — **the bring-your-own-key path does not exist in the code.** It was written here as though
  it had shipped. If it is still wanted it is a build, not a toggle. At the measured costs it is no
  longer needed as a margin unlock; it would be a *positioning* choice for merchants who want no cap.

---

## 4. THE REVENUE LADDER — and where the real exposure is

**This is where the risk actually lives.** The old ladder assumed ARPU of ~$40 → ~$66 on a price
list topping out at $299. The real list tops out at **$79.99**, and the entry paid tier is **$9.99**.

| Plan mix | ARPU |
|---|---|
| Everyone on Starter | $9.99 |
| Everyone on Growth | $29.99 |
| Everyone on Pro | $79.99 |
| **Illustration** — 50% Starter, 35% Growth, 15% Pro | **$27.49** |

That illustration is `ASSUMED` and labelled as such: the weights are a guess, because there are **no
paying merchants yet** and therefore no mix. It shows the shape. It is not a figure to quote.

| Milestone | Paying merchants | ARPU (illustrative) | MRR | What it unlocks |
|---|---|---|---|---|
| First revenue | 1 | — | — | Proof the billing chain works end to end (**P0.5**) |
| Gate 1 | **50 on paid Shopify plans** | ~$27 | ~$1.4k | Built for Shopify eligibility |
| Traction | 100 | ~$27 | ~$2.7k | The listing starts ranking on its own |
| Gate 3 | ~150 | ~$27 | ~$4.1k | Top ten in category |

Category ARPU is ~$25–35 (`05-EVIDENCE.md` §2), so the illustrative $27.49 sits **inside** the
category norm rather than at the premium the old file claimed. The previous ladder reached ~$9.9k
MRR at 150 merchants; against the real price list those same 150 merchants produce roughly **$4.1k**.

**The decision this forces, and it is the owner's:** the doctrine says we sell *proof* and should
price at roughly double the category. The shipped price list does not do that. Either the prices
move or the claim does — but they must stop contradicting each other, and until they do, no figure
in this section should be used for planning.

---

## 5. CHURN IS WORTH MORE THAN PRICING

At the illustrative $27.49 ARPU:

| Monthly churn | LTV | Enterprise value at 150 merchants |
|---|---|---|
| 5% | $550 | ~$82k |
| 2% | **$1,374** | **~$206k** |

Halving churn still more than doubles the business — which is the point, and it does not depend on
the exact ARPU. Everything that fights churn — monitoring in every tier, the weekly report, annual
prepay (shipped: every plan has an annual key at 10× monthly, two months free), the free trial — is
economics work wearing a product costume.

---

## 6. GUARDRAILS — code must respect these

These are commitments already made to merchants. Breaking one is not a trade-off, it is a defect.

1. **Generations rejected by the quality gate are never billed.** Costs us little, nobody else
   offers it, and it is a trust line on the listing.
2. **Unused generations roll over one month.** One, not indefinitely.
3. **The SEO audit is never capped** — any plan, any catalogue size. It is the hook.
4. **A cap is never presented as a total** (L5). A quota screen states what is included, what is
   used, and what happens next — once, not the same fact twice in adjacent lines.
5. **Entitlement is visible before the click** (L5, A3.1). Never a bare navigate to billing.
6. **No "SLA" and no "dedicated account manager"** — the WORDS, not the service. The owner supports
   merchants personally and at small numbers that is a real advantage; the offer stays, the two
   undefined words go, replaced by *"Direct access to the founder. Every question answered within
   one business day. A setup call when you start."* Full wording in `12-OFFER.md` §6. At low review
   volume one unmet promise halves the rating.
   **ENFORCED 2026-09-14 (P0.8):** both phrases were still shipping on the Pro plan card in
   `app/routes/app.plans.jsx`. They now carry the `12-OFFER.md` §6 wording, and
   `tests/docs/app-store-copy.test.js` fails the build if either returns to any user-visible string
   — along with superlatives (4.3.3/4.3.4) and testimonials (4.3.6/4.3.7).
7. **Merchant-supplied AI keys are secrets** (L9). Never printed, never logged, never in an error.
   *(There is no merchant-key path in the code today — see `C0.3`. This guardrail is for when there
   is one.)*
8. **Every AI-visibility claim carries its honest method label** — the model, and the method. An
   overclaim here is the fastest route to a one-star review.
9. **NEW — the cost table is re-measured, never re-estimated.** Model prices and prompt sizes both
   move. Re-run `measure-generation-cost--spends-api-credit.mjs` and update §2 when either changes.
   Prices live in `app/utils/modelPricing.js` and nowhere else.

---

## 7. WHAT WOULD BREAK THE MODEL

Watch for these. Any one of them is worth stopping for.

- **Revenue, not cost, is now the binding constraint.** The price list tops out at $79.99 while the
  doctrine claims a premium position. §4 — that contradiction is the live risk.
- Free installs that never convert but keep generating: the ceiling in §2 is **per install**, so it
  scales linearly with installs, not with revenue. At $0.29–$0.75 each that is cheap — until install
  volume is the number that grows.
- **Sustained** (not burst) use on **Pro**. Not a solvency problem at a 62.5% worst-case margin, but
  a cohort living at its 1,000 ceiling says the plan is under-sized for them — a pricing opportunity
  being missed, rather than a loss being taken.
- A support load that needs a human per merchant. Done-for-you at $750 is deliberately a contact
  action, not self-serve, for exactly this reason.
- Monthly churn drifting above 5%.
- **Model price changes, and prompt growth.** Both move the whole of §2. A longer system prompt is a
  permanent cost rise on every generation: product content already carries 1,364 input tokens, and
  input is 73% of that generation's token count.
