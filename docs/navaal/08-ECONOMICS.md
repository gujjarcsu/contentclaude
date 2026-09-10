# ECONOMICS — the model the product must not break

Read this before shipping anything that touches cost, quota, model spend, plan limits or margin.
A feature that is loss-making at full utilisation is a defect, however good it feels.

**Marked `MEASURED` or `ASSUMED` throughout. Never quote an `ASSUMED` figure as fact (L3).**
Turning the assumptions into measurements is backlog item `C0.1`, and it is cheap.

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

## 2. UNIT COSTS

| Item | Figure | Basis |
|---|---|---|
| Cost per generation | **~$0.005** | `ASSUMED` — the working figure used for pricing. Must be measured per content type; a FAQ block is not an alt text. |
| Cost per AI-visibility probe question | to be read from the probe itself | The inherited probe **already records cost in cents per run** (`ai-visibility.cjs`). `MEASURED` data exists — read it, do not estimate it. |
| Free-tier model spend | **~$0.75 / active free install / month** | `ASSUMED`, from 150 generations at the rate above. This is the number the owner must accept a ceiling on. |
| Infrastructure | Fly (web + worker) · Neon · Redis | `ASSUMED` fixed and small relative to model spend at this scale. Re-check when installs pass ~200. |

**The two costs that scale with revenue are model spend and support.** Everything else is roughly
fixed until we are much larger.

---

## 3. MARGIN BY PLAN — worst case, at 100% quota use every month

The honest way to read this table: nobody uses 100% of their quota every month after month one,
but the plan must not be loss-making if they do.

| Plan | Price | Generations | Worst-case model cost `ASSUMED` | Worst-case gross margin |
|---|---|---|---|---|
| Free | $0 | 150 | ~$0.75 | **−$0.75** — this is customer acquisition, and it is the cheapest we will ever buy |
| Starter | $19 | 1,000 | ~$5 | ~74% |
| Growth ★ | $49 | 5,000 | ~$25 | ~49% |
| Scale | $99 | 25,000 | ~$125 | **negative at full use** — see below |
| Enterprise | $299 | Unlimited, **own key** | ~$0 | ~100% on model spend |

**Scale is the plan to watch.** At full utilisation every month it loses money on the assumed
rate. It is defensible because a 25,000-product catalogue is a burst — the merchant optimises the
catalogue once and then maintains it — but that is an assumption about behaviour, and assumptions
about behaviour are how subscription businesses die.

**Therefore three hard requirements on Scale, all of them backlog items:**
- `C0.1` — measure the real cost per generation, per content type, before the pricing ships.
- `C0.2` — instrument actual monthly utilisation per plan. Alert if the Scale cohort's median
  sustained use exceeds the break-even point.
- `C0.3` — the bring-your-own-key path must be available **one tier below** Enterprise if the data
  says Scale is being used as an unlimited plan. It is the pressure valve.

**Enterprise = own key is the margin unlock.** It removes the COGS ceiling entirely and removes the
merchant's fear of running out. A competitor already validated it at $49.99 (`05-EVIDENCE.md` §2).

---

## 4. THE REVENUE LADDER

| Milestone | Paying merchants | ARPU | MRR | What it unlocks |
|---|---|---|---|---|
| First revenue | 1 | — | — | Proof the billing chain works end to end |
| Gate 1 | **50 on paid Shopify plans** | ~$40 | ~$2k | Built for Shopify eligibility |
| Traction | 100 | ~$55 | ~$5.5k | The listing starts ranking on its own |
| **Gate 3** | **~150** | **~$66** | **~$9.9k** | Top ten in category |

Category ARPU is ~$25–35 (`05-EVIDENCE.md` §2). Ours is designed at roughly double, because we
sell **proof**, not a utility. That premium is only defensible while the proof layer actually
works — which is why Phase D is the business.

---

## 5. CHURN IS WORTH MORE THAN PRICING

| Monthly churn | LTV at $58 ARPU | Enterprise value at 150 merchants |
|---|---|---|
| 5% | $1,160 | ~$174k |
| 2% | **$2,900** | **~$495k** |

Halving churn is worth more than any price rise we could survive. Everything that fights churn —
monitoring in every tier, the weekly report, annual prepay at 25% off, the 14-day trial — is
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
6. **No "SLA" and no "dedicated account manager"** — the WORDS, not the service. **REFINED
   2026-09-10:** the owner supports merchants personally and at small numbers that is a real
   advantage; the offer stays, the two undefined words go, replaced by *"Direct access to the
   founder. Every question answered within one business day. A setup call when you start."*
   Full wording in `12-OFFER.md` §6. The original reasoning still holds: at low review volume one
   unmet promise halves the rating. "Onboarding call" and "guaranteed 1-business-day response"
   are keepable and are what we say instead.
7. **Merchant-supplied AI keys are secrets** (L9). Never printed, never logged, never in an error.
8. **Every AI-visibility claim carries its honest method label** — the model, and the method. An
   overclaim here is the fastest route to a one-star review.

---

## 7. WHAT WOULD BREAK THE MODEL

Watch for these. Any one of them is worth stopping for.

- **Sustained** (not burst) generation use on Scale — see §3.
- Free installs that never convert but keep generating: the ceiling in §2 is per install, so this
  scales linearly with installs, not with revenue.
- A support load that needs a human per merchant. Done-for-you at $750 is deliberately a contact
  action, not self-serve, for exactly this reason.
- Monthly churn drifting above 5%: at that rate the acquisition cost of Gate 1 never pays back.
- Model price changes. The whole table above moves with one number; keep the assumption in one
  place in code so it can be re-priced in one edit.
