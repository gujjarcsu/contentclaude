# PROSPECTS — thirty stores with a finding we can name, and a way to reach them

**Built 2026-09-15 by CW for B0.1. No contact has been made. Nothing here has been sent.**

## How these thirty were chosen, and the one number I had to throw away

The starting pool is the W1 audit's 409 storefronts
(`docs/research/w1-eligibility-base-rate/auditA.jsonl`, `auditB.jsonl`). **Frame B — the long tail
— first**, because smaller stores answer founders.

The brief's example line was *"143 of 210 products have descriptions under 120 characters"*. **The
audit cannot support a sentence like that.** Every audit row has `attrs.n = 10` — it graded a
ten-product sample, and `products_seen` caps at 50 because the fetch used `?limit=50`. Writing
"143 of 210" from a ten-product sample would be the exact class of claim `09-DOCTRINE.md` exists to
stop. So I re-fetched every shortlisted store's **full public catalogue** (`products.json`,
paginated at 250) and graded **every product**. The counts below are whole-catalogue counts, taken
2026-09-15. That also made criterion (a) testable: "20–2,000 products" is measured against the real
total, not against the 50-row page.

Filters applied, in order: Frame B · desc-short or no-type ≥ 50% of the audit sample ·
`products.json` and a product page both 200 · **full catalogue between 20 and 2,000 products** ·
homepage 200 today · a contact route found on the public site · not a household brand.

**Excluded as household brands or institutions**, though they met every numeric test:
`www.nintendo.co.za` · `equipment.lesmills.com` · `www.wearetala.com` · `store.americascup.com` ·
`shop.franklloydwright.org` · `shipsstore.navymemorial.org` · `rebel8.com`.
**Excluded for no contact route:** `bakedjustsweet.com` · `www.dosebathco.com`.
**Excluded on size:** `www.theguushop.com` (2,250 products — over the cap).
`seaislandforge.com` refused the catalogue fetch (HTTP error) and is not listed.

### The number I threw away — do not let it back in

My first pass also graded "products with no barcode" and got **100% on all forty-nine stores**.
That is an artifact, not a finding: **Shopify's public `products.json` does not expose `barcode`
at all** — the variant object has no such key (checked directly: `available`, `compare_at_price`,
`created_at`, `featured_image`, `grams`, `id`, `option1–3`, `position`, `price`, `product_id`,
`requires_shipping`, `sku`, `taxable`, `title`, `updated_at`). The W1 report already says this at
line 138 and the blog post says it in its own words, so nothing published is wrong — but **no
barcode claim may go in an email to any of these stores**, because we cannot see it from outside.

## The thirty

Every finding below is a whole-catalogue count taken on 2026-09-15 and phrased the way the merchant
would check it themselves. `desc < 120 chars` is measured on the rendered text of `body_html`, not
the markup.

| # | store | products | the finding, in their terms | contact route |
|---|---|---|---|---|
| 1 | `brbarbados.com` | 977 | 977 of 977 products have a description under 120 characters | info@brbarbados.com · `/pages/contact-us` · IG @bodyrestoration |
| 2 | `drformulas.com` | 79 | 79 of 79 products have no product type set | `/pages/contact` · IG @drformulas |
| 3 | `momarsh.com` | 76 | 76 of 76 products have no product type set | `/pages/contact-us` · IG @momarsh_sws |
| 4 | `vftuner.com` | 69 | 69 of 69 products have no product type set | support@ovtune.zendesk.com |
| 5 | `mcarthurs.com` | 571 | 571 of 571 products have no product type set | `/pages/contact-us` |
| 6 | `dressmagenta.com` | 1843 | 1842 of 1843 products have a description under 120 characters | `/pages/contact-us` · IG @dressmagenta |
| 7 | `www.modifieddecals.com` | 603 | 602 of 603 products have no product type set | modifieddecals@gmail.com · `/pages/contact-us` · IG @modifieddecals |
| 8 | `halfnuts.net` | 1174 | 1170 of 1174 products have no product type set | info@halfnuts.net · `/pages/contact-us` |
| 9 | `omertamia.com` | 189 | 188 of 189 products have no product type set | `/pages/contact` · IG @omertamia |
| 10 | `unlimitedpatchworks.com` | 156 | 155 of 156 products have no product type set | `/pages/contact-us` · IG @unlimpatworks |
| 11 | `bakeshopboyd.com` | 716 | 696 of 716 products have a description under 120 characters | IG @thebakeshopboyd |
| 12 | `www.amybradleydesigns.com` | 223 | 216 of 223 products have no product type set | `/pages/contact-us` |
| 13 | `chalicecollectibles.com` | 672 | 649 of 672 products have no product type set | `/pages/contact-us` |
| 14 | `www.creamstreetlife.com` | 486 | 466 of 486 products have a description under 120 characters | IG @creamstreetwear |
| 15 | `medicalgearoutfitters.com` | 286 | 274 of 286 products have no product type set | `/pages/contact-us` |
| 16 | `maineaimranchdogs.com` | 72 | 68 of 72 products have no product type set | maineaim@gmail.com · IG @maineaimranch |
| 17 | `paintbynumbershome.com` | 1568 | 1407 of 1568 products have no product type set | `/pages/contact-us` |
| 18 | `www.tauricase.com` | 252 | 215 of 252 products have no product type set | `/pages/contact-us` |
| 19 | `sheamakery.com` | 73 | 61 of 73 products have no product type set | `/pages/contact-us` · IG @shea_shea_bakery |
| 20 | `battlehousefitness.com` | 59 | 49 of 59 products have no product type set | battlehousefitness.co@gmail.com · `/pages/contact-us` · IG @battlehouse_fitness |
| 21 | `spentgroundscoffeeroasters.ca` | 525 | 431 of 525 products have a description under 120 characters | `/pages/contact-us` · IG @spentgrounds |
| 22 | `superiorviewfarm.com` | 128 | 102 of 128 products have a description under 120 characters | info@superiorviewfarm.com · `/pages/contact` |
| 23 | `shop.truckmountforums.com` | 976 | 755 of 976 products have no product type set | `/pages/contact-us` · IG @truckmountforums |
| 24 | `brightboxes.shop` | 141 | 109 of 141 products have a description under 120 characters | `/pages/contact-us` |
| 25 | `www.hippierunner.com` | 1276 | 958 of 1276 products have no product type set | `/pages/contact` · IG @hippierunner |
| 26 | `sacredwordpublishing.com` | 360 | 260 of 360 products have no product type set | `/pages/contact-us` |
| 27 | `greenthumbalt.com` | 106 | 75 of 106 products have a description under 120 characters | `/pages/contact-us` |
| 28 | `shoptriplebfarms.com` | 250 | 174 of 250 products have no product type set | swcbeinlich@live.com · `/pages/contact-us` |
| 29 | `zilla-meals.com` | 123 | 84 of 123 products have a description under 120 characters | `/pages/contact-us` |
| 30 | `shop.faithchurch.com` | 29 | 19 of 29 products have a description under 120 characters | IG @yourfaithchurch |

## A second finding for each, kept out of the table

One finding opens a conversation; a second one is what you have ready when they reply "how do you
know?". These are the same whole-catalogue counts.

SECOND FINDINGS (kept out of the table, useful in a reply):
- `brbarbados.com` — 99 of 977 products have no image
- `momarsh.com` — 27 of 76 products have a description under 120 characters
- `vftuner.com` — 6 of 69 products have a description under 120 characters
- `mcarthurs.com` — 27 of 571 products have a description under 120 characters
- `dressmagenta.com` — 272 of 1843 products have no product type set
- `www.modifieddecals.com` — 174 of 603 products have a description under 120 characters
- `halfnuts.net` — 335 of 1174 products have a description under 120 characters
- `omertamia.com` — 38 of 189 products have a description under 120 characters
- `unlimitedpatchworks.com` — 113 of 156 products have a description under 120 characters
- `www.amybradleydesigns.com` — 5 of 223 products have a description under 120 characters
- `chalicecollectibles.com` — 137 of 672 products have a description under 120 characters
- `www.creamstreetlife.com` — 315 of 486 products have no product type set
- `medicalgearoutfitters.com` — 39 of 286 products have a description under 120 characters
- `maineaimranchdogs.com` — 4 of 72 products have a description under 120 characters
- `paintbynumbershome.com` — 6 of 1568 products have a description under 120 characters
- `sheamakery.com` — 1 of 73 products have a description under 120 characters
- `battlehousefitness.com` — 1 of 59 products have a description under 120 characters
- `spentgroundscoffeeroasters.ca` — 114 of 525 products have no image
- `shop.truckmountforums.com` — 312 of 976 products have a description under 120 characters
- `brightboxes.shop` — 11 of 141 products have no product type set
- `www.hippierunner.com` — 2 of 1276 products have a description under 120 characters
- `sacredwordpublishing.com` — 2 of 360 products have a description under 120 characters
- `greenthumbalt.com` — 60 of 106 products have no image
- `shoptriplebfarms.com` — 13 of 250 products have a description under 120 characters
- `zilla-meals.com` — 54 of 123 products have no image
- `shop.faithchurch.com` — 12 of 29 products have no product type set

## Rules for using this file

1. **No contact was made in the session that produced this file**, and none should be made from it
   without the owner sending it himself.
2. **Never quote the 71.9% without its sensitivity row.** `_UPLOAD-W1-POST.md` §2. Better: don't
   quote market statistics at all in a first email — quote *their* number, which is in the table.
3. **Nothing in this file may move onto the Shopify listing.** App Store 4.3.3/4.3.4 bans
   statistics on the listing, verifiable or not.
4. **Re-check the count before you send.** These were true on 2026-09-15. A merchant who fixed
   their catalogue last week and gets an email saying otherwise will not reply twice.
5. **No barcode claims.** See above.

## The owner's own names

The network names go here, under this heading, in the owner's words. They are the better half of
this list — a warm name beats a cold count every time.

| # | who | how the owner knows them | the store, if they have one |
|---|---|---|---|
| | | | |
