# CW BRIEF — the current batch

**Regenerated 2026-09-13; the shape stores added 2026-09-15.** Read `CW-STANDING-PROMPT.md` first for context and rules.

**The correction that changes your plan:** the last CW session concluded that everything was blocked
and that no dev store had a usable catalogue. Both were checked against the repo and production, and
both were too strong.

- **Task 1 below needs no Partner Dashboard, no login and no Shopify access at all.** It is the
  single highest-value piece of work available to anyone on this project right now, because it
  decides whether a whole phase gets built.
- **`contentpilot-dev2` is clean.** Every excerpt in `listing-assets/manifest.json` was grepped for
  snowboard, ski, wax, hydrogen and gift card: **zero hits.** The demo catalogue belongs to
  `navaal-ttv-01`, not to every dev store. What is actually stale about the existing assets is the
  store *name* — they read *"Welcome back, E2E Test Store!"* and dev2 is now *Northline Supply*.

Do them in this order. Report each as you finish it.

---

## TASK 1 — The eligibility base-rate study *(W1 — needs nothing but a browser and patience)*

**Why this is first.** We are about to build a feature that tells merchants what is blocking their
products from search and AI shopping. The whole phase rests on an untested assumption: **that a
typical Shopify store actually has something wrong.** Shopify auto-generates canonicals, sitemaps,
robots.txt and title tags, requires every theme to emit product schema, and syndicates products to
AI channels with no merchant action. **If the default store is already fine, our audit's most common
output is "everything looks fine" — and a first run that says that is a churn event, not an
activation.**

**The kill criterion is written down in advance: if fewer than 40% of stores have at least one
actionable finding, the phase gets re-scoped.** We would rather learn that in two days than two
months.

**Do:** assemble **300–500 live Shopify storefronts**. Find them however is cheapest — Shopify's own
customer-story pages, `myshopify.com` directories, the `apps.shopify.com` reviews on big apps (each
reviewer names their store), BuiltWith-style lists. Record the domain list in a file so the study is
reproducible.

For each store, from the public web only — **no logins, no admin, no writes anywhere**:

1. **`robots.txt`** — fetch it, then test-fetch the homepage and one product URL with each of these
   user agents and record the status code: `OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`,
   `bingbot`, `Googlebot`. A block on `OAI-SearchBot` means, in OpenAI's own words, the store
   *"won't appear in ChatGPT search answers."*
2. **Product attribute completeness** — most storefronts expose `/products/<handle>.json` or
   `/products.json`. Pull a sample of products and record whether each has: a barcode, variant
   option names, an availability value, a price, at least one image, a product type, and a
   description longer than ~120 characters.
3. **Structured data** — is `application/ld+json` present on a product page? Is there **more than
   one** `Product` block (the duplicate-schema problem, which Google resolves unpredictably)?
4. **Canonical sanity** — does the product page's canonical point at itself?
5. **Policies** — do `/policies/terms-of-service`, `/policies/privacy-policy` and
   `/policies/refund-policy` return 200? These are required for agentic storefronts.
6. **Agent endpoints** — `/llms.txt`, `/agents.md`, `/.well-known/ucp`. Record the status code.
   *(Expect 200 on live stores — Shopify serves these natively. This is a control, not a finding.)*

**Be a good citizen:** identify yourself in the user agent for the non-UA-specific fetches, no more
than a couple of requests per second per host, and honour `robots.txt` for anything beyond the
product JSON and the policy pages.

**Done looks like** a table and four numbers:
- what percentage of stores have **at least one** actionable finding,
- the **median number** of findings per store,
- the **frequency of each individual check** failing, ranked,
- and how many stores had **zero** findings.

**Paste back:** those four numbers first, then the ranked table, then the domain list file path. And
say plainly whether the 40% bar was cleared.

*This output is also the one kind of statistic we are allowed to publish — an aggregate about the
market, on navaal.ai, which Shopify says improves App Store ranking.*

---

## TASK 2 — Re-capture the listing screenshots on `contentpilot-dev2`

**Why:** the existing eight frames say *"Welcome back, E2E Test Store!"*. The store is now
*Northline Supply*. The catalogue itself is fine — **use dev2, not `navaal-ttv-01`**, which is
stocked with Shopify's demo snowboards.

**Do:** capture **five desktop at 1600×900** — Home with the store score · the audit results · a
product with a proposal · the Review screen showing approve-before-publish · Settings — and **three
mobile**. App UI only, no browser chrome, no pricing in any image, no personal data, every image
unique, alt text on each.

**Then fix the manifest.** `listing-assets/manifest.json` still lists `04-start-desktop.png`, which
no longer exists on disk. Either capture it or remove its entry — a manifest that lies costs the
next session an hour.

**Done looks like:** eight files on disk, the manifest matching the directory exactly, and every
excerpt free of demo-store words and of the old store name. **Hold the upload** until Task 4.

**Paste back:** the eight captions, and anything the app showed that looked wrong while you were
capturing.

---

## TASK 3 — Check what Shopify's Agentic channel reports, per product

**Why:** a previous session read `/apps/agentic` and found four channels with a binary status, a
master toggle, "Shopify Catalog — 0 products in Catalog", and **nothing per product**. That is the
gap our eligibility feature exists to fill, and it is worth a second look now that a store has
products in it.

**Do:** on `contentpilot-dev2`, activate the Agentic channel if it is off, wait for Catalog to pick
up products, and then look again. Specifically: does it ever name **which** products are excluded,
and **why**? Any error or reason codes? Any completeness detail?

**Done looks like:** screenshots plus a plain list of what Shopify already reports.

**Paste back:** the list, and your honest read on whether a merchant would still need our version.

---

## TASK 4 — The moment the Partner Dashboard opens, publish the listing

**This needs one human click first:** open `https://partners.shopify.com/4937813/apps` in Chrome and
pick the **Waqas Ahmad** account. Every previous attempt landed on `accounts.shopify.com/select`, an
account chooser rather than a password prompt. **If you still land there, stop and say so — do not
try to sign in.**

Once in, from **`docs/navaal/12-OFFER.md` §4**, copied exactly — it is already character-counted
against every Shopify limit and constrained by App Store requirements 4.3.3, 4.3.4, 4.3.6 and 4.4.1:

- **App introduction** → §4's introduction.
- **App details** → §4's details paragraph.
- **Feature bullets** → all five from §4.
- **Search terms** → `seo audit` · `product descriptions` · `meta tags` · `alt text` ·
  `ai visibility`.
- **Professional tier** → replace **"Dedicated account manager"** with **"Direct access to the
  founder"**, and **"SLA support"** with **"Every question answered within one business day"**. Add
  **"Setup call when you start"** if there is room. *The service is real and the owner does it
  personally; the two undefined words are what go.*
- Tick **"Merchant must have online store"**. Confirm one plan is marked Free. Fill every optional
  field, without repeating keywords.
- Upload Task 2's screenshots.

**⚠️ Publish nothing from `12-OFFER.md` §5.** Those bullets describe daily monitoring, AI traffic
reporting and crawl-speed proof, none of which exists yet.

**Done looks like:** load the public listing fresh and search the text — neither banned phrase
present, new copy and new screenshots live.

---

## TASK 5 — Read the webhook figures, same visit

Partner Dashboard → Navaal → Monitoring → Webhooks. Read verbatim: overall failure rate and
severity · per-topic rate **and delivery count** · p90 · Removed-webhooks · the per-day ok/failed
split.

**Baseline** (2026-09-10): overall **75.0% High** · `app/uninstalled` 68.182% of **22** @ 1,403 ms ·
`shop/redact` 100.0% of **9** @ 816 ms · Sep 10 = 5 ok / 1 failed.

The pre-fix failures of Sep 8–9 have now rolled out of the 7-day window, so **this reading settles
it.** `shop/redact` deliveries from the 10 Sep uninstalls should have surfaced around 12 Sep — check
whether they arrived and succeeded, because that topic was failing 100% and it is a mandatory GDPR
topic.

**The trap:** state the delivery count beside every percentage. **0% over 0 deliveries is not a
pass**, and an unchanged count means nothing happened.

---

## ADDED 2026-09-14 BY CC — verify one theme-editor deep link (10 minutes)

**Why this is yours and not mine:** it needs a browser and a dev store's theme editor. I could not
test it from here, and a merchant-facing button that dead-ends is worse than no button, so I shipped
written instructions instead and left the button out. Confirming this turns three sentences of
instructions back into one click.

**The background.** P1.2 moved the FAQ setup card to lead with the **visible** FAQ block, because
`09-DOCTRINE.md` §3 says that is the real value and the JSON-LD is inert (Google retired FAQ rich
results on 7 May 2026). Our extension has two blocks and they are different kinds:

| Block | `target` | Kind | Deep link form |
|---|---|---|---|
| `faq_schema` | `head` | app **embed** | `?context=apps&activateAppId=<id>/<handle>` — **known to work** |
| `faq_visible` | `section` | app **block** | `?template=product&addAppBlockId=<id>/<handle>&target=mainSection` — **unverified** |

**The ambiguity to resolve.** Shopify's *Configure theme app extensions* page writes the first
segment of `addAppBlockId` as `{api_key}`, and its examples use a 32-hex value. The embed link we
know works uses the **extension UID**. Those are two different values, and I do not know which one
`addAppBlockId` wants:

- extension UID: `6470d60a-e399-bf73-6f2e-693a42909d5d1bab4ee4`
- app client_id: `1279a14cca41d4a6f8e6e3c485870b77`

**What to do.** On a dev store with the app installed (navaal-ttv-01..05), open each of these in the
browser and see which one lands on the product template with **FAQ (Navaal)** added to the main
section — rather than a 404, an empty editor, or the block missing:

```
https://<store>.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=6470d60a-e399-bf73-6f2e-693a42909d5d1bab4ee4/faq_visible&target=mainSection
https://<store>.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=1279a14cca41d4a6f8e6e3c485870b77/faq_visible&target=mainSection
```

**What done looks like:** you can say which of the two worked, with a screenshot of the theme editor
showing the **FAQ (Navaal)** block added to the main product section. If **neither** works, say so —
that is a real finding, not a failure, and the written instructions stay.

**What to paste back:** the URL that worked (or "neither"), and whether the block appeared already
added or merely pre-selected awaiting **Save**. CC will then wire it as a button in
`app/components/EmbedSetupCard.jsx`, which already carries a note saying not to guess it into place.

---

## ADDED 2026-09-14 BY CC — H7 IS UNBLOCKED. Re-run the listing capture. (20 minutes)

**Both defects you reported are fixed in `tools/proof/listing-assets.mjs`, shipped in `abedb42`.**

**1. The Sidekick problem is gone.** The screenshot target was
`f.frameOnly ? await frame.frameElement() : page`, and `frameOnly` was set on the three mobile
frames only — so all five desktop frames captured the whole Shopify admin. **The flag is deleted,
not set eight times**: it made the safe behaviour opt-in and five of eight frames did not opt in.
Every frame now captures the app frame and nothing else.

**2. The 04 guard is fixed, not loosened.** It was `/scores \d+\/100/i`, which matched nothing — the
screen says *"Store SEO score"*, and puts the number and *"/ 100"* on separate lines. It is now
`/Store SEO score\s*\d+\s*\/\s*100/i`, which is **stricter**: it requires the literal label, which
the old pattern never checked. Verified against the real `innerText` your own manifest recorded, and
against a "Calculating…" state, which it still rejects — so it cannot capture a spinner.

**Run it:**
```
node tools/proof/listing-assets.mjs
```

**ONE TRAP THAT WILL WASTE AN HOUR IF YOU HIT IT.** If a frame comes back blank, or with the title
*"Unhandled Thrown Response!"*, that is **not the app being broken**. Playwright's default
user-agent contains `HeadlessChrome`; the Shopify library classifies it as a bot and answers
**410 Gone**, React then fails to hydrate (#418, #423) and you get an error page. It cost me a real
scare during P0.4 — the capture reported "App Bridge is absent" from a page the app never served.
`listing-assets.mjs` already sends a real UA; if you write a new harness, copy the `userAgent` line
out of `tools/proof/appbridge-head.mjs`.

**What done looks like:** eight PNGs in `listing-assets/`, `manifest.json` with `ok: true` on all
eight including **04**, and **no Shopify chrome in any image** — no left nav, no top bar, no Sidekick
icon. Open two of them and look, rather than trusting `ok: true`.

**What to paste back:** the manifest's eight `ok` values, and whether 04 captured this time. If 04
still fails, paste its `error` string verbatim — it names what it saw, and that is the fastest route
to the next fix.

**While you are in the listing editor:** `12-OFFER.md` §5.5's two replacements are now live **inside
the app** (`7dc5f74`) — *"Email support from the founder"* and *"Two description options to
compare"*. The listing needs the same wording so the two surfaces stop disagreeing, which is the
whole point of §5.5. **One conflict to be aware of:** §6 prescribes *"Every question answered within
one business day"*, which is **47 characters** against the 40-character plan-feature field. It does
not fit. It needs a shorter approved variant, or the listing will say something different from the
app again.

---

## POSTED 2026-09-14 BY CC — H12 IS OPEN. The app now bills the locked numbers.

**Shipped and proved at `7d23792`:** `/api/build-info` reports it, deep health `status: ok`,
`schema.ok: true`, **239 columns** (two migrations applied), worker running, zero failed jobs.

**Until this line existed you were asked not to touch the listing plan table. You may now.**

The listing must show exactly this — it is `14-PRICING.md` §4, approved by the owner and recorded in
`04-DECISIONS.md` §PRICING, and it is what the code charges as of the sha above:

| | **Free** | **Starter** | **Growth** ★ | **Pro** |
|---|---|---|---|---|
| **Monthly** | $0 | **$9.99** | **$29.99** | **$79.99** |
| **Annual — save 20%** | — | **$95.90** | **$287.90** | **$767.90** |
| **Credits / month** | **100** | **500** | **1,500** | **4,000** |
| **Products covered** | 100 | 1,000 | 5,000 | Unlimited |
| **Alt text** | unmetered | unmetered | unmetered | unmetered |
| **Full catalogue audit** | ✓ never capped | ✓ | ✓ | ✓ |
| **Bulk generation** | **✗ — one at a time** | **✓** | ✓ | ✓ |
| Blog posts *(3 credits each)* | — | — | ✓ | ✓ |
| **Free trial** | — | 14 days, 250 credits | 14 days, 250 credits | 14 days, 250 credits |

**Three things on that table that are easy to get wrong, so please check them twice:**

1. **Annual is 20% off, and the numbers are 95.90 / 287.90 / 767.90.** Do NOT write "2 months
   free" — that is 16.7%, it is what every competitor says, and a merchant who does the arithmetic
   and finds it wrong will not believe the next number we show them.
2. **Bulk starts at STARTER, not Growth.** The code had this wrong until today and gated it at
   $29.99. It is the conversion mechanism: 100 free credits is genuinely useful for trying the
   product and genuinely insufficient for a catalogue, because without bulk a 500-product store
   would have to click 500 times.
3. **The trial is 250 credits, not the plan's monthly allowance**, and it should say so on the card
   rather than being discovered later.

**Plan-feature lines are `maxlength 40`.** One known casualty: `12-OFFER.md` §6 prescribes *"Every
question answered within one business day"*, which is **47 characters** and will not fit. It needs a
shorter approved variant before it can go on the listing — that is flagged in the app-side test with
an assertion that fires if it is ever resolved.

**What to paste back:** the four plan cards as they read on the live listing after you save, so the
listing and the app can be compared line by line.

---

## ADDED 2026-09-15 BY CC — SIX `navaal-shape-*` DEV STORES: CREATE, IMPORT, INSTALL, POST THE HANDLES (F2; ~10 minutes each)

The store-shape matrix (`docs/navaal/SHAPE-MATRIX.md`) ran every shape a fixture can reach. What a
fixture cannot reach — the screen a merchant actually sees, the AI draft, the Shopify publish — needs a
real store of that shape. The catalogues are built: five CSVs generated from the matrix's own fixtures,
under `tools/proof/fixtures/shapes/`. Creating a development store is a Partner Dashboard action, so it
is yours. **None of these stores is captured, none is frozen, none is EBS**, and every dev-store guard
and the funnel's test-shop exclusion already recognise the `navaal-shape-` prefix.

For each store, in this order — the order matters because the app's first run scores whatever is in
the catalogue at install time:

1. Partner Dashboard → Stores → **Add store → Create development store**, store name exactly as below
   (the `.myshopify.com` handle must start with `navaal-shape-`).
2. In the new store's admin: **Products → Import → choose the file → Upload and preview → Import.** Wait
   for the "import complete" email (a minute or two; the 150-row file may take five).
3. **Then** install the app on it from the Partner Dashboard (Apps → Navaal → Test on development
   store). Installing last is the point.
4. Open the app once and read `/app` with your eyes. Paste the handle and the first screen's wording
   back into `06-QUEUE.md`.

| store name | import file | what `/app` should say on the first run |
|---|---|---|
| `navaal-shape-drafts` | `alldraft.csv` — 20 drafts, none on the Online Store | *"Your products aren't on your Online Store yet"* — never "add a product" |
| `navaal-shape-variants` | `variants.csv` — 6 × 7-variant products with barcodes from variant 3, plus 1 × 100 variants with its only barcode on variant 60 | a score and three targets; later, the Catalogue screen shows *"No barcode on any of the 50 variants we read"* on the 100-variant product only |
| `navaal-shape-fr` | `fr.csv` — 8 French products | a score and three French targets; **then approve and publish ONE draft through Review** and tell me whether the draft is French and the accents survived |
| `navaal-shape-b2b` | `b2b.csv` — 12 active trade-only products, not on the Online Store | *"Your products aren't on your Online Store yet"* |
| `navaal-shape-cap` | `cap.csv` — 150 products; the Free cap is 100 | a score and three targets; on Products, the bulk confirmation should say 100 now / 50 waiting |
| `navaal-shape-zero` | no import | *"Add a product and we'll get started"* — and no screen congratulates you |

When the handles are posted, CC runs the **First-run scores** workflow and `read-screen.mjs` on each and
closes the matrix cells. If a store's first screen says something other than the column above, that
sentence is the finding — paste it verbatim.

## ADDED 2026-09-15 BY CC — TWO SHORT ONES: `navaal-qa-fresh` IS YOURS AGAIN, AND THE SHOP LEDGER NEEDS DOMAINS (15 minutes)

**1. qa-fresh: uninstall, reinstall from the listing, read the first run, capture frame 04.** The app
had been deleting that store's records ten minutes after every visit since 14 Sep (queue post, Phase
11 Part A). Fixed at `cd96240`. Uninstall from the store's Apps page, reinstall from the listing (a
genuine first run — Northline Supply's name is already on the store), read FR8, N1 and FR13 in one
pass, capture. If the first screen says anything other than the three-target splash with three
product scores, paste it verbatim. dev2 stays frozen until your `CAPTURE COMPLETE`.

**2. Classify the shops — one workflow run.** The funnel now counts only shops classified `real`, and
the ledger names stores by name, not domain. Run the **Shop kind** workflow (Actions → Shop kind →
Run) with `kinds` empty: the job summary lists every shop domain with its stored and effective kind.
Match them to your ledger (queue §PHASE 7) and run it once more with the pairs, space-separated:

```
<ebs-domain>.myshopify.com=ours <navaal-test-2-domain>=ours <app-review-…-r92361-a0>.myshopify.com=shopify <app-review-…-r78944-a0>.myshopify.com=shopify <mars-canada>.myshopify.com=shopify <mars-japan>.myshopify.com=shopify <mars-us>.myshopify.com=shopify <ace-test-uk>.myshopify.com=shopify <appstoretest4>.myshopify.com=shopify <zephyrine-wynter>.myshopify.com=real peter-shops-2.myshopify.com=real <hoodify>.myshopify.com=real
```

Our `navaal-ttv-*`, `-qa-*`, `-shape-*`, `-test-*` and `contentpilot-*` handles are ours by pattern
and need no entry; the workflow refuses `real` on any of them. Paste the summary's `tally` line back.
CC then re-runs the Funnel workflow and posts the reading over real shops only — expected 3 installed
ever, ≤ 3 saw a draft, 0 published, 1 uninstalled.

## ADDED 2026-09-15 BY CC — PHASE 12 SHIP GATES A AND B: RE-CAPTURE 01 AND 04, RE-WALK THE FRENCH STORE, READ BOTH PARTS OF /privacy (30 minutes)

Live at `356684c` (Part A) and `d3242f0` (Part B); the queue post of the same date has the detail.

1. **Frame 01 (Home, dev2):** the autopilot banner and the score card now read from one window and
   name the same date. Re-capture 01 and read the two lines together. dev2 stays frozen otherwise.
2. **Frame 04 (the first run, qa-fresh or a shape store):** until the first publish, Home leads with
   the three products the first run scored lowest and their scores; the orange theme banner is gone
   from that screen (one dismissible line instead). Re-capture 04. FR8's three scores are on this
   card now — read them.
3. **`navaal-shape-fr`:** its BrandVoice row was created before A5 and still says `en` (inference is
   create-only). Set Content Language to French in Settings — the new warning banner on that screen
   should already say the setting looks wrong — then reset the first run (First-run reset workflow)
   and read the splash: it names the language and its source. Post the draft's language.
4. **`app.navaal.ai/privacy`:** read Part 1 against `navaal.ai/privacy` — the text is the owner's,
   unchanged except `hello@navaal.ai` for the contact address. Post "both parts read"; the owner
   then uploads the privacy redirect (the instructions file says exactly when).
5. **The third confusion count** on a fresh install (qa-fresh, after the reset): post the number.

## WHEN YOU FINISH

Update every row you touched in `06-QUEUE.md`, append anything new to its INBOX with no ID and an
owner tag, and report: what you completed with the evidence · what you could not do and exactly what
blocks it · **what you found that nobody asked about** · what is left, by ID.

## ADDED 2026-09-15 BY CC — PHASE 12 SHIP GATE D1: ENTER THE GERMAN LISTING (15 minutes)

Live at `a9ffd38`: the app speaks German — every screen, the public `/privacy` and `/terms`
(`?locale=de` or a German browser), the weekly report. The queue post of the same date has the
proofs. The gate in the closing brief ("listing translations may not be entered for a locale until the
app speaks it") is met for German only.

1. Enter the German listing from `LISTING-TRANSLATIONS.md` §German — subtitle, introduction, details,
   the five feature bullets in order, the five search terms, the plan lines — verbatim. The editor's
   counter decides; post each count as it reads back.
2. Optional, if you want to see it before you enter it: on any of our stores, Settings → App language
   → Deutsch, then Home, Attention, Plans. Put it back to "Follow my Shopify admin language" after.
3. Do NOT enter French, Spanish, Italian, Portuguese or Japanese yet — those locales are not live and
   `?locale=fr` renders English by design. Each gets its own gate post.

## ADDED 2026-09-15 BY CC — PHASE 12 SHIP GATE D6: ENTER THE JAPANESE LISTING (15 minutes) — THE LAST ONE

Live at `23423bb` (follow-up `4d32d98`): the app speaks Japanese — every screen, `/privacy` and `/terms` (`?locale=ja` or a
Japanese browser), the weekly report. The queue post of the same date has the proofs and the
layout check (full-page screenshots of Home, Attention and Plans in Japanese).

1. Enter the Japanese listing from `LISTING-TRANSLATIONS.md` §Japanese, verbatim; the editor's
   counter decides (Shopify counts characters, not bytes); post each count as it reads back.
   (de, fr, es, it, pt-BR first if not yet.)
2. To see it: Settings → App language → 日本語 on any of our stores; put it back after.
3. That is all six. B3 is complete once your six counts are posted.

## ADDED 2026-09-15 BY CC — PHASE 12 SHIP GATE D5: ENTER THE BRAZILIAN PORTUGUESE LISTING (15 minutes)

Live at `33cfde1`: the app speaks Brazilian Portuguese — every screen, `/privacy` and `/terms`
(`?locale=pt-BR` or a Brazilian browser), the weekly report. The queue post of the same date has
the proofs.

1. Enter the Portuguese (Brazil) listing from `LISTING-TRANSLATIONS.md` §Portuguese, verbatim; the
   editor's counter decides; post each count as it reads back. (de, fr, es, it first if not yet.)
2. To see it: Settings → App language → Português (Brasil) on any of our stores; put it back after.
3. Not yet: ja.

## ADDED 2026-09-15 BY CC — PHASE 12 SHIP GATE D4: ENTER THE ITALIAN LISTING (15 minutes)

Live at `391feb6`: the app speaks Italian — every screen, `/privacy` and `/terms` (`?locale=it` or
an Italian browser), the weekly report. The queue post of the same date has the proofs.

1. Enter the Italian listing from `LISTING-TRANSLATIONS.md` §Italian, verbatim; the editor's counter
   decides; post each count as it reads back. (German, French and Spanish first if not yet entered.)
2. To see it: Settings → App language → Italiano on any of our stores; put it back after.
3. Not yet: pt-BR, ja.

## ADDED 2026-09-15 BY CC — PHASE 12 SHIP GATE D3: ENTER THE SPANISH LISTING (15 minutes)

Live at `36d95ee`: the app speaks Spanish — every screen, `/privacy` and `/terms` (`?locale=es` or
a Spanish browser), the weekly report. The queue post of the same date has the proofs.

1. Enter the Spanish listing from `LISTING-TRANSLATIONS.md` §Spanish, verbatim; the editor's counter
   decides; post each count as it reads back. (German and French first if not yet entered.)
2. To see it: Settings → App language → Español on any of our stores; put it back after.
3. Not yet: it, pt-BR, ja.

## ADDED 2026-09-15 BY CC — PHASE 12 SHIP GATE D2: ENTER THE FRENCH LISTING (15 minutes)

Live at `86b417c`: the app speaks French — every screen, `/privacy` and `/terms` (`?locale=fr` or
a French browser), the weekly report. The queue post of the same date has the proofs.

1. Enter the French listing from `LISTING-TRANSLATIONS.md` §French, verbatim; the editor's counter
   decides; post each count as it reads back. (German first if not yet entered.)
2. To see it: Settings → App language → Français on any of our stores; put it back after.
3. Not yet: es, it, pt-BR, ja.
