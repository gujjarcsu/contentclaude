# First run — `navaal-qa-fresh` (Northline Supply), 2026-09-15

Read by CW with Playwright on the device. Uninstall → reinstall → read, in one pass.
Every line below is off a real screen, not from the repo.

## How the run was produced

1. **Uninstall.** Settings → Apps → `More actions` → `Uninstall`. Shopify's dialog, verbatim:

   > **Uninstall Navaal: AI SEO, AEO & GEO?**
   > You'll no longer be able to use the app. After uninstalling, any data managed by the app, such
   > as discounts, will be deleted.
   > A request will be sent to the app developer within 48 hours to delete all personal customer
   > information
   > Reason for uninstalling · Select all that apply · Share feedback · 0/250 · Cancel · Uninstall

   **The `Uninstall` button is `aria-disabled="true"` until a reason is chosen.** Reasons offered:
   `Testing multiple apps` · `Store is closing or pausing` · `Not using app now` ·
   `Not satisfied with app features` · `Not satisfied with customer support` · `Too expensive` ·
   `Not working properly with store` · `Other (please specify)`.
   I chose **`Other (please specify)`** and typed, verbatim:
   `QA: reinstalling to capture a genuine first run. Not a product complaint.`
   Nothing in the list was true and a false reason would have polluted our own feedback data.
   Confirmed; the app left the Installed list.

2. **Reinstall.** *Deviation from the brief, stated plainly:* the brief says "reinstall from the
   listing". **The public listing's Install button would not submit** — it is a POST form
   (`apps.shopify.com/navaal-ai-seo-geo-content/install?…`, `_method=put` + an authenticity token)
   and neither a real click nor a form submit navigated, on three attempts. I did not work around
   it. Instead I used the in-admin listing card at
   `admin.shopify.com/store/navaal-qa-fresh/apps/navaal-seo-geo-content`, which with the app
   uninstalled renders:

   > **You don't have this app installed**
   > Get Navaal: AI SEO, AEO & GEO and try again.
   > Navaal: AI SEO, AEO & GEO
   > **Content Google ranks and ChatGPT quotes — you approve it first**
   > `Install`

   That is the same OAuth grant a merchant gets, with the same scopes (`View staff and contributor
   data — Store owner, blog contributors`; `View and edit store data — Products, Online Store`).
   Granted. **This is a genuine first install; only the referrer differs.**

## What `/app` said

### FR2 — PASS. The store's real name, not a placeholder.

> ✧ **Welcome, Northline Supply!**
> 0 products optimized · 3 drafts awaiting review

### N1 — PASS. The remaining figure, not the plan total.

> Monthly credits · Attention · Free Plan
> **`3 / 100 used`** · **`3%`** · **`97 of 100 left this month.`**

Three drafts written, three credits spent, **97 left** — not 100, and **3%**, not 0%.

### The score

> Store SEO score
> **21** / 100 across 12 products sampled
> Your starting score, across the 12 products we sampled.
> How is this scored?
> This is a sample. The SEO Audit scores more of your catalog and lists what to fix.

Counts agree with the store: 12 products, 12 sampled.

> Total Products **12** — In your Shopify catalog
> AI Content Published **0** — of your 12 active products published to your online store
> Drafts Pending Review **3** — Ready to publish
> 12 products are missing something an AI shopping surface requires.
> 12 products need attention.

Recent Activity: `Brass Watering Can 1.5L` · `Stoneware Mug 400ml` · `Cast Iron Skillet 26cm`,
each `3 content types · just now`.

### FR8 — COULD NOT READ. Third attempt, same cause.

FR8 is the **three different product scores on the first-run splash**. The splash is the screen
that renders *while* the three drafts are being written — on the `navaal-shape-*` stores I caught
it because I read within seconds of the grant. Here I read at ~18 seconds and `/app` had already
become **Home**. The splash is time-boxed by the write, not dismissed by the merchant, so it cannot
be revisited. **Not a pass, not a fail — could not read**, and it will stay that way unless the
read happens inside the write window or the splash gets a durable route.

### FR13 — FAIL, unchanged, and now measured rather than inferred.

On `contentpilot-dev2`, a row reading **`Ready to review`** with a button labelled **`Review`**:

- the control is a `BUTTON` with **no `href`**
- clicking it lands on **`/app/products/7800236671079`**, headed
  `Bamboo Chopping Board · ACTIVE · $29.00 · Northline Supply · **Generate Content**`

**It does not go to `/app/review?product=<numeric>`.** The brief's unblock condition #1 is still
open. The numeric route itself is correct — proved separately on `navaal-shape-variants`:
`/app/review?product=9652284850435` → `1 product with draft content ready to review` ·
`Showing one product` · `Opened from its row on Products…` · `Show all drafts`. **The destination
exists; the row does not point at it.** A merchant told a draft is "Ready to review" and offered a
button called "Review" arrives at a page whose primary action is to **write it again**.

## The capture

`FRESH_STORE=navaal-qa-fresh node tools/proof/listing-assets.mjs` → **8/8 frames captured**, every
guard passed, frame 04 finally taken on a real catalogue (`Store SEO score 21 / 100 across 12
products sampled`) instead of failing with "the app frame never appeared".

Then I did the step the harness says only a human can do — I looked at them.

| frame | verdict |
|---|---|
| 01 home desktop | **NOT CLEAN** — contradicts itself on its face |
| 02 review desktop | **CLEAN** |
| 03 products desktop | **CLEAN** |
| 04 start desktop | **NOT CLEAN** — passes the guard, fails as a picture |
| 05 settings desktop | **CLEAN** |

**01 contradicts itself.** The score card says **`Unchanged since September 14, across the 14
products we sampled.`** and the banner immediately below it says **`Autopilot optimized 15 new
products in the last 24 hours`** — on a store with **15 products in total**. Fifteen products
optimized in a day, and the score has not moved. Whatever the two numbers each mean internally, a
merchant reads them as one claim and its refutation, stacked. This banner is new since the
2026-09-14 capture (the old manifest excerpt for 01 has no Autopilot line).

**04 fails as a picture.** Its caption is *"We score your store on install, then write the three
products holding it back."* The frame shows the score and `Welcome, Northline Supply!` — and then
the largest thing on it is an **orange warning banner, `One-time setup: put your FAQ content on
your product pages`, with four paragraphs of theme-editor instructions**. The three products the
caption promises are far below the fold and appear nowhere in the image. The first thing a
prospective installer would see in slot 4 is a wall of setup homework.

**Both desktop frames also waste roughly a third of their width** — the app renders in a centred
column and the 1600px frame carries wide empty grey gutters on both sides.

**Three clean desktop frames is exactly the brief's floor, but the two that fail are slots 1 and 4
— the hero and the first-run story. I am not posting `CAPTURE COMPLETE`.** Uploading a set whose
first image argues with itself is worse than leaving the current images up for another day.
02, 03 and 05 are good and can go up as a partial set the moment the owner wants them.
