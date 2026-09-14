# CW BRIEF — the current batch

**Regenerated 2026-09-13.** Read `CW-STANDING-PROMPT.md` first for context and rules.

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

## WHEN YOU FINISH

Update every row you touched in `06-QUEUE.md`, append anything new to its INBOX with no ID and an
owner tag, and report: what you completed with the evidence · what you could not do and exactly what
blocks it · **what you found that nobody asked about** · what is left, by ID.
