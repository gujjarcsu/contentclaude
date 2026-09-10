# FUTURE APPS — parked 2026-09-10, to be discussed later

**Not for now.** Navaal comes first. These are recorded here so they are not lost and not
half-started. Each came out of the research in `10-MARKET.md`, and each carries the reason it might
work, the reason it might not, and the one thing to check before writing any code.

**Do not start any of these while Navaal has fewer than ten real merchants.** Splitting attention
across two apps with one person is how both fail.

---

## IDEA 1 — AGENTIC COMMERCE READINESS
*"Make every product buyable by an AI agent."*

**The opening.** Shopify shipped **Universal Commerce Protocol version `2026-08-25`** — we verified
`/.well-known/ucp` live on Allbirds, Olipop, Polaroid and Red Bull, and on our own dev stores.
Agentic storefronts are **on by default** for eligible stores. Copilot, Gemini and Meta already
support completing a purchase inside the assistant; ChatGPT is discovery-only on Shopify today.

Whether a product qualifies is decided by **structured attributes**, not prose: OpenAI's feed spec
requires `item_id`, `title`, `description`, `url`, `brand`, `image_url`, `price`, `availability`,
`target_countries`, `seller_name`, and recommends `group_id`/`variant_dict`, `size`, `q_and_a`,
`reviews`. Google's UCP runs off Merchant Center feeds. **A merchant has no way to see which of
their products are disqualified, or why.**

**Why it could be big:** it is tied to **revenue, not traffic**, which is a far easier sale than
SEO. It is weeks old, so nobody has merchant-side tooling. Shopify is pushing it hard, so merchant
awareness arrives without us paying for it. And catalogues change daily, so it recurs.

**Why it might not:** Shopify may build it into the Agentic sales channel itself — it is the obvious
next thing for a company that just shipped agentic storefronts and needs clean feeds. Also, agentic
storefronts are **D2C only** and require selling to US customers, which narrows the market.

**Check first:** exactly what the Agentic sales channel already reports, per product, today, with
screenshots. Build only the delta. The likely defensible delta is **cross-surface in one view**
(OpenAI + Merchant Center + Bing + Shopify) and **bulk remediation** — neither of which Shopify will
build.

---

## IDEA 2 — STORE HEALTH MONITOR ★ the strongest of the three
*"Tell me the day my store breaks."*

**The opening.** Not SEO. A typical store runs 15–25 apps, and when one silently breaks the
storefront nobody notices for weeks. Watch it every day and report the moment something changes:
duplicate or conflicting JSON-LD (a documented, recurring Shopify problem where Google resolves the
conflict unpredictably and can issue a **manual action**), canonical drift, blocked crawlers, 404'd
policy pages, broken redirects, theme updates that changed output, missing images, feed rejections,
page-speed regressions.

**Why it could be big:** **every store is the market**, not only the slice that cares about search.
It costs almost nothing to run — **no AI spend at all**, so margin is near-total and no model price
rise can hurt it. And monitoring is the most churn-resistant kind of software there is, because the
value is never finished. It also needs no OAuth, no Google verification, no Level 2 approval and no
catalogue minimum.

**Why it might not:** merchants do not feel the pain until it has already cost them, so conversion
depends on a free scan that finds something genuinely alarming. **This is the same doubt as Navaal's
own Phase 2, and the 400-store base-rate study (W1) answers both at once.**

**Check first:** run W1. If fewer than 40% of stores have an actionable finding, this idea and
Navaal's Phase 2 are both weaker than they look. **The honest question to settle before building:
is this a second app, or is it simply what Navaal becomes?** Two apps, one person, is how both fail.

---

## IDEA 3 — BING & COPILOT COMMERCE
*"Get found and get bought inside Microsoft Copilot."*

**The opening.** Bing Webmaster Tools holds the **only first-party AI-citation dataset that exists
anywhere**: total citations, the **grounding queries** that triggered them, and **citation share**
against every other site for the same query. Google's equivalent is impressions only.

And unlike Google, **Bing has a working API**: URL submission that is explicitly sanctioned for
commerce pages (~10,000/day, where Google's Indexing API excludes product pages entirely), and
`GetPageQueryStats` returning **impression position and click position separately**, which Google
does not provide at all. Copilot is a channel where a shopper can complete a purchase, not just
click through.

**Why it could be big:** almost no Shopify app touches Bing. The data is better and the API exists.
The whole area is uncontested.

**Why it might not:** merchants undervalue Bing and always have. The AI Performance report itself has
**no API** — UI only, confirmed by Microsoft in Feb 2026 — so the richest part cannot be automated,
only taught. And Microsoft could ship an API tomorrow and change the shape of the opportunity.

**Check first:** whether the AI Performance report has gained an API. Then decide the name and the
pitch — this is sold as **"Copilot"**, never as "Bing".

---

## THE HONEST RANKING

**Idea 2** on market size, running cost, churn resistance and how few approvals it needs.
**Idea 1** on revenue linkage and timing, if the Shopify-overlap check comes back clean.
**Idea 3** on how uncontested it is, but it is the narrowest and depends on a merchant's willingness
to care about a channel they have ignored for a decade.

**None of them starts until Navaal has ten real merchants.**
