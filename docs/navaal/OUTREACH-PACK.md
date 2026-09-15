# OUTREACH PACK — what the owner sends to the thirty in `PROSPECTS.md`

**Drafted 2026-09-15 by Cowork for B0.1/C9. Nothing here has been sent. The owner sends every
message himself, from his own address, after the re-check in §2.** This file is the words; the
numbers live in `PROSPECTS.md` and are re-counted on the day.

Doctrine that governs every line below (`09-DOCTRINE.md`, `PROSPECTS.md` rules 1–5): quote *their*
number, never a market number · no barcode claim · no statistic from the W1 post in a first message ·
Google and ChatGPT named descriptively only · no "SLA", no "account manager", no "guaranteed", no
"#1" · nothing from this file goes on the listing.

---

## 1. WHAT WE ARE ACTUALLY SAYING

One sentence, and it is the same sentence in every channel:

> I looked at your public product feed and **{their number}**; the same feed is what search and
> AI shopping assistants read, so I built a tool that fills those gaps in your own voice, and you
> approve every line before it goes live.

Everything else is proof the sentence is true: the second finding when they ask "how do you know",
the free plan when they ask what it costs, and the founder answering the reply.

Why this works on a small store and not a big one: the count is *theirs*, checkable in two clicks in
their own admin, and the person who sends it is the person who built the fix. A household brand has
an agency for this; the thirty do not.

---

## 2. BEFORE EACH SEND — three minutes, not optional

1. **Re-count.** From the repo root:
   `node tools/prospects/recheck.mjs brbarbados.com` — prints today's whole-catalogue counts in the
   table's own words. **Paste the fresh number, not the table's.** If the store fixed it, do not send
   (PROSPECTS.md rule 4). If it prints `unreachable` (some stores rate-limit `products.json` — HTTP
   429), try once more an hour later; never send on a stale count.
2. **Open the store for thirty seconds.** One line in the message names what they sell, in their
   words — the product category from their own nav is enough ("your candle range", "the decals").
   That line is the difference between a founder's email and a mail-merge.
3. **Log it** in §8 before you press send, so a reply three weeks later has its context.

Batch: **five a day, six days.** The eight with an email address first (rows 1, 4, 7, 8, 16, 20, 22,
28), contact forms next, Instagram last. One follow-up after five business days; if that is silent,
stop — the list is thirty names, not a campaign.

---

## 3. FIRST MESSAGE — EMAIL (≤120 words)

Subject lines — pick one, never more than one idea:

- `{N} of {total} products on {store}`
- `Your product descriptions — a count, not a pitch`
- `{store}: one thing I noticed in your product feed`

Body:

> Hi {first name, or "there"},
>
> I build a Shopify app and, while checking stores in your category, I looked at {store}'s public
> product feed: **{fresh count — e.g. "602 of 603 products have no product type set"}**. That feed is
> what Google and AI shopping assistants read, so a gap there is a gap in how {what they sell —
> e.g. "the decals"} gets found.
>
> My app audits the whole catalogue, writes what's missing in your own brand voice, and publishes
> nothing until you approve it — edit, publish or roll back any line. There's a free plan, no card
> needed, and I read every reply myself.
>
> If it's useful, here it is: https://apps.shopify.com/navaal-ai-seo-geo-content
> If it's not, no follow-up from me beyond one more note.
>
> {Owner's name}
> Founder, Navaal · navaal.ai

Slots: `{store}` · `{fresh count}` · `{what they sell}` · `{first name}`. Nothing else changes.

---

## 4. FIRST MESSAGE — CONTACT FORM (≤80 words)

Forms strip formatting and often cap length; this fits the smallest box we saw.

> Hi — I build a Shopify app. Looking at {store}'s public product feed today: {fresh count}. That
> feed is what search and AI shopping assistants read. My app audits the whole catalogue, writes
> the gaps in your own voice, and nothing publishes until you approve it. Free plan, no card.
> https://apps.shopify.com/navaal-ai-seo-geo-content — happy to walk you through it in 15 minutes.
> {Owner's name}, Navaal, {owner email}

Put your email in the body: form replies sometimes come from a no-reply address.

---

## 5. FIRST MESSAGE — INSTAGRAM DM (≤50 words)

DMs from strangers get one line of attention. No link in the first DM (many accounts filter them);
send the link only when they answer.

> Hi — I make a Shopify app and checked {store}'s product feed today: {fresh count}. That's what
> Google and AI shopping read from. Free tool that fixes it in your own voice, you approve every
> line. Want the link?

---

## 6. WHEN THEY REPLY

**"How do you know that?"** → the second finding plus the method, both from `PROSPECTS.md`:

> Same place anyone can look: `{store}/products.json`, the public feed Shopify serves for every
> store — it's what search engines and shopping assistants read. Today it also shows
> **{second finding — e.g. "174 of 603 products have a description under 120 characters"}**. You can
> see both in your admin under Products by filtering on product type and scrolling the descriptions.

**"What does it cost?"** → the locked table, nothing else:

> Free plan: 100 credits a month, no card, covers up to 100 products. Starter is $9.99/month for
> 500 credits and 1,000 products; Growth $29.99 for 1,500 and 5,000; Pro $79.99 for 4,000 and
> unlimited. Every paid plan starts with a 14-day trial with 250 credits. Alt text costs nothing;
> a blog post is 3 credits; everything else is 1. Credits reset on the first of each calendar month.

**"Will it change my store?"** →

> Not without you. The audit is read-only. Anything it writes sits in Review until you approve it;
> you can edit before publishing, and every published product keeps its original, one click to
> restore. Nothing goes live from a first install.

**"I don't have time."** →

> Fair. Install it, let the audit run (a minute for a catalogue your size), and I'll go through the
> results with you on a 15-minute call — you decide what, if anything, to approve. Every question
> gets an answer from me within one business day.

**"Does it get me into ChatGPT / to #1?"** → the honest line, verbatim; do not soften it:

> No tool can promise where an assistant will rank or cite you, and I won't. What I can do is make
> sure every product has the description, type, meta and alt text that search and assistants read —
> and show you what changed on your own storefront after it publishes.

---

## 7. THE 20-SECOND WALKTHROUGH — for a call, a screen-share or a recording

Everything here is live today (`12-OFFER.md` §2). Say only what the screen shows.

1. **Install** from the listing. The first screen scans the catalogue on its own and writes three
   drafts (three credits of the free 100); the splash says so, and says nothing is published until
   they approve it. Nothing is written to the store. (~20 s to a finished draft — CW's read on a
   fresh store, 2026-09-14.)
2. **The score and the three blockers.** The AI-search score, labelled, with *"The 3 things holding
   this store back"* and an action each — no description, no alt text, and so on. This is their
   number from the email, now on their own screen in their own admin.
3. **Open one of the three drafts in Review.** The description is in their brand voice (inferred
   from their own catalogue), with meta title, meta description and alt text alongside.
4. **Review → edit a word → Approve → Publish.** Show the edit sticking; show the publish
   verification reading back what Shopify stored.
5. **Open the storefront product page.** The new copy is there.
6. **Restore original.** One click; the storefront shows the old copy again. This is the line that
   closes: *you are never stuck with anything it wrote.*

Skip bulk on a first call; the point is trust, not volume.

---

## 8. SEND LOG — fill before pressing send

| # | store | route used | date sent | fresh count sent | follow-up date | reply | next |
|---|---|---|---|---|---|---|---|
| 1 | brbarbados.com | info@ | | | | | |
| 2 | drformulas.com | form | | | | | |
| 3 | momarsh.com | form | | | | | |
| 4 | vftuner.com | support@ovtune | | | | | |
| 5 | mcarthurs.com | form | | | | | |
| 6 | dressmagenta.com | form | | | | | |
| 7 | www.modifieddecals.com | modifieddecals@gmail | | | | | |
| 8 | halfnuts.net | info@ | | | | | |
| 9 | omertamia.com | form | | | | | |
| 10 | unlimitedpatchworks.com | form | | | | | |
| 11 | bakeshopboyd.com | IG | | | | | |
| 12 | www.amybradleydesigns.com | form | | | | | |
| 13 | chalicecollectibles.com | form | | | | | |
| 14 | www.creamstreetlife.com | IG | | | | | |
| 15 | medicalgearoutfitters.com | form | | | | | |
| 16 | maineaimranchdogs.com | maineaim@gmail | | | | | |
| 17 | paintbynumbershome.com | form | | | | | |
| 18 | www.tauricase.com | form | | | | | |
| 19 | sheamakery.com | form | | | | | |
| 20 | battlehousefitness.com | battlehousefitness.co@gmail | | | | | |
| 21 | spentgroundscoffeeroasters.ca | form | | | | | |
| 22 | superiorviewfarm.com | info@ | | | | | |
| 23 | shop.truckmountforums.com | form | | | | | |
| 24 | brightboxes.shop | form | | | | | |
| 25 | www.hippierunner.com | form | | | | | |
| 26 | sacredwordpublishing.com | form | | | | | |
| 27 | greenthumbalt.com | form | | | | | |
| 28 | shoptriplebfarms.com | swcbeinlich@live | | | | | |
| 29 | zilla-meals.com | form | | | | | |
| 30 | shop.faithchurch.com | IG | | | | | |

Every reply, including "no", goes to `06-QUEUE.md` as a B0.3/B0.4 row in the merchant's own words:
what they did not understand, what they would pay for, what they would never pay for.

---

## 9. NEVER IN AN OUTREACH MESSAGE

`71.9%` or any W1 number · `409 stores` · barcode anything · "rank #1", "guaranteed", "instantly",
"best" · "we track your visibility in ChatGPT" · "SLA", "dedicated account manager", "24/7" ·
a screenshot of their store posted anywhere public · a second follow-up.
