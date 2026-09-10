# CW BRIEF — the current batch

**Regenerated 2026-09-10 from the pending `CW` rows of `06-QUEUE.md` and from `12-OFFER.md`.**
Read `CW-STANDING-PROMPT.md` first — it carries the context and the rules. This file is the work.

Five tasks, in this order. Report each as you finish it; do not batch to the end.

---

## TASK 1 — Publish the approved listing copy *(replaces H11 and H15)*

**Why first.** Two things are wrong on the live listing right now. It promises **"Dedicated account
manager"** and **"SLA support"**, which are commitments we cannot define. And the five feature
bullets describe the app as it was before two phases of change.

The approved replacement text is in **`docs/navaal/12-OFFER.md` §4**. It is already
character-counted against every Shopify limit. **Copy it exactly. Do not improve it, shorten it or
add to it** — the wording is constrained by App Store requirements 4.3.3, 4.3.4, 4.3.6 and 4.4.1.

**Do:** Partner Dashboard → Apps → Navaal → Distribution → App Store listing.

- **App introduction** → replace with §4's introduction (86 characters).
- **App details** → replace with §4's details paragraph (478 characters).
- **Feature bullets** → replace all five with §4's five bullets.
- **Search terms** → set the five in §4: `seo audit` · `product descriptions` · `meta tags` ·
  `alt text` · `ai visibility`. Complete words, one idea each, no symbols.
- **Pricing section, Professional tier** → replace the line "Dedicated account manager" with
  **"Direct access to the founder"**, and "SLA support" with **"Every question answered within one
  business day"**. Add **"Setup call when you start"** if there is room. *The service is real and the
  owner does it personally; it is the two undefined words that go.*
- **Sales channel requirements** → tick **"Merchant must have online store"**.
- Fill **every** optional field. Shopify's search engine parses the listing, and empty fields are
  wasted surface. But **do not repeat keywords to game it** — Shopify says overuse *"can DECREASE
  your app's discoverability."*
- Confirm one plan is marked **Free**, so search results show *"Free plan available"*.

Submit for review if submission is required.

**⚠️ Do NOT publish anything from `12-OFFER.md` §5.** Those bullets describe daily monitoring, AI
traffic reporting and crawl-speed proof, none of which exists yet. Advertising them would be exactly
the false promise this whole project is built to avoid.

**Done looks like:** load the public page `apps.shopify.com/navaal-ai-seo-geo-content` fresh and
search the text. Neither banned phrase appears. The new intro, details and five bullets are live.

**Paste back:** the tier's wording before and after, whether the change needed review, and how long
review is expected to take.

---

## TASK 2 — Look at the "Include draft products" checkbox with your own eyes *(H13)*

**Why.** This setting shipped with a database column, a read path, a write path and a passing test
suite — and for one commit, **no control on any screen.** No merchant could ever turn it on. It now
has a control, and two of the three requirements are proved: it is wired, and its label appears in
the rendered DOM. What is **not** proved is that a human can see it and that the value sticks.

**Do:** open the app on the dev store **`contentpilot-dev2`** (renamed *Northline Supply*) →
**Settings** → the card headed **"Review before publishing"** → directly under "Publish without
review". Scroll to it. Tick it. Save. Then **hard-reload** and look again.

**Done looks like:** a screenshot showing the checkbox on screen, and confirmation the tick survived
the hard reload.

**Paste back:** the screenshot, and whether it was above or below the fold when the page loaded.

---

## TASK 3 — Re-capture and upload the listing screenshots *(H7)*

**Why.** The listing still shows the app as it was before Phase 2 and Phase 4. Everything a merchant
sees before installing is out of date.

**Do:** capture on **`navaal-ttv-01`** (renamed *Harbourline Goods*) — 17 products, three drafts, a
store score of 34/100. **Never on the EBS store**: its catalogue is commercial and its numbers are
not representative.

Capture **five desktop** frames at **1600×900**: Home with the score · the audit results · a product
with a proposal · the review screen showing approve-before-publish · Settings. Then three mobile.

Rules, all of them Shopify's: app UI only · **no browser chrome** · no pricing anywhere in an image ·
no personal data · **every image unique** · alt text on each one.

Upload under Distribution → App Store listing → Media, replacing the existing set, and write a
caption for each saying what the merchant is looking at.

**Done looks like:** five desktop and three mobile live on the public page, checked on a fresh load.

**Paste back:** the eight captions, **and anything the app showed that looked wrong while you were
capturing** — that last part has been the most valuable output of every session on this project.

---

## TASK 4 — Read the webhook reliability figures *(H10)*

**Why.** A webhook fix shipped 2026-09-10 (commit `224211a`): the age window was 24h, but Shopify
retries for ~48h carrying the *original* triggered-at, so valid retries were rejected. The window is
now 7 days plus dedup by webhook id. The dashboard shows a **7-day trailing window**, so pre-fix
failures age out on 15 Sep — a reading from 16 Sep onward contains only post-fix deliveries.

Two scheduled tasks were meant to do this but are **not bound to this computer**, so they fire into a
browserless cloud session and produce nothing. Do it by hand.

**Do:** Partner Dashboard → Navaal → Monitoring → Webhooks. Read verbatim: overall failure rate and
severity · per-topic rate **and delivery count** for `app/uninstalled` and `shop/redact` · p90
response time · Removed-webhooks count · the per-day ok/failed split for the whole visible range.

**Baseline** (2026-09-10, ~11:00 UTC): overall **75.0% High** · `app/uninstalled` 68.182% of **22**
@ 1,403 ms · `shop/redact` 100.0% of **9** @ 816 ms · `app/scopes_update` 0% of **1** @ 534 ms ·
Removed webhooks **0** · Sep 8 = 1 ok / 18 failed, Sep 9 = 2 ok / 5 failed, Sep 10 = 5 ok / 1 failed.

**The trap:** never report an improvement from the percentage alone. **An unchanged delivery COUNT
means nothing happened**, whatever the percentage says. State the count beside every rate.

**Done looks like:** the numbers, then one line — post-fix deliveries occurred and succeeded /
occurred and failed / did not occur at all.

---

## TASK 5 — Check what Shopify's Agentic sales channel already reports

**Why.** We are about to build per-product eligibility reporting. Shopify shipped `llms.txt`,
`agents.md`, Catalog syndication and Magic without announcing any of it, and we only found out by
looking. **Before CC writes a line of that feature, we need to know what Shopify already gives the
merchant for free.**

**Do:** on a dev store, open **Settings → Sales channels → Agentic** (or the Agentic entry in the
admin sidebar). Photograph and describe: what it shows about the store's eligibility · whether it
reports **per-product** problems and in what detail · what it says about which AI channels are
active · anything about product data completeness or feed errors.

**Done looks like:** screenshots plus a plain list of what Shopify already reports, so we can build
only the difference.

**Paste back:** the list, and your honest read on whether a merchant would still need our version.

---

## NOT IN THIS BRIEF, AND WHY

- **Listing pricing display** — waits for the new plans to ship in the app. Changing the listing
  before the app matches it creates the exact promise gap we keep removing.
- **Second UptimeRobot alert contact** — blocked on an owner decision: a second contact needs a paid
  seat, and the free workaround is a Gmail forward.
- **Built for Shopify scorecard** — no BFS section is exposed anywhere in the dashboards yet, almost
  certainly because the app is far below the 50-install eligibility bar. Nothing to read today.
