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

## PRICING — final

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
