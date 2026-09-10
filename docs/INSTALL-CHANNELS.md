# Install channels — where installs come from, and how we know

`/go?ref=<handle>` has worked since Phase 0: the redirector, the cookie, the sanitiser and the
attribution were all built and tested. What was missing was **anything pointing at it**. Every install
therefore arrived as `unknown` or as an App Store surface, and the funnels we own were invisible.

This is the list of handles that closes that, and the snippets that go on each surface.

## The rule

**One handle per SURFACE, and a surface is a place, not a campaign.**

"The Bilby report page" is a surface. "The September push" is not. A handle answers *where was the
merchant standing when they clicked*, which still means something in three years. A campaign handle stops
meaning anything the day the campaign ends, and then nobody can read last year's numbers.

**Never per-recipient.** A handle is a channel, so it survives `shop/redact` as aggregate data. Putting a
per-recipient token in a ref would make the install record personal data, which would then have to be
deleted with the shop — destroying the only attribution we have.

## The channels

The canonical list is `app/utils/installChannels.js`. This table is generated from it and a test fails if
the two drift apart, so edit the module and not this file.

| Handle | Owner | Where it goes | Link text |
|---|---|---|---|
| `navaal-home` | navaal.ai | homepage — primary hero call to action | Get it on the Shopify App Store |
| `navaal-tools` | navaal.ai | /tools index — the card for the Shopify app | Install the Shopify app |
| `navaal-nav` | navaal.ai | site header, the one persistent nav button | Shopify app |
| `navaal-footer` | navaal.ai | global footer, under Products | Shopify app: AI SEO, AEO & GEO |
| `blog-post` | navaal.ai | blog — the end-of-post call to action block | Do this automatically for every product |
| `bilby-report` | Bilby | scan report — beside the product-content findings | Fix these with the Shopify app |
| `bilby-footer` | Bilby | global footer — the Products column, first item | Shopify app: AI SEO, AEO & GEO |
| `outreach-email` | outreach | outreach emails — the single link in the body | See it on the Shopify App Store |

## The snippets

Every link is the same shape:

```html
<a href="https://app.navaal.ai/go?ref=HANDLE" rel="noopener">LINK TEXT</a>
```

`rel="noopener"` because it leaves for the App Store. Deliberately **no `target="_blank"`** — whether a
link opens a new tab is the host page's decision, and forcing it is the kind of small rudeness that costs
more trust than it gains clicks.

Ready to paste:

```html
<!-- navaal.ai homepage hero -->
<a href="https://app.navaal.ai/go?ref=navaal-home" rel="noopener">Get it on the Shopify App Store</a>

<!-- navaal.ai /tools card -->
<a href="https://app.navaal.ai/go?ref=navaal-tools" rel="noopener">Install the Shopify app</a>

<!-- navaal.ai header nav -->
<a href="https://app.navaal.ai/go?ref=navaal-nav" rel="noopener">Shopify app</a>

<!-- navaal.ai global footer -->
<a href="https://app.navaal.ai/go?ref=navaal-footer" rel="noopener">Shopify app: AI SEO, AEO &amp; GEO</a>

<!-- navaal.ai end of a blog post -->
<a href="https://app.navaal.ai/go?ref=blog-post" rel="noopener">Do this automatically for every product</a>

<!-- Bilby scan report, beside the product-content findings -->
<a href="https://app.navaal.ai/go?ref=bilby-report" rel="noopener">Fix these with the Shopify app</a>

<!-- Bilby global footer -->
<a href="https://app.navaal.ai/go?ref=bilby-footer" rel="noopener">Shopify app: AI SEO, AEO &amp; GEO</a>

<!-- outreach email body (plain link, no tracking pixel, no per-recipient token) -->
<a href="https://app.navaal.ai/go?ref=outreach-email" rel="noopener">See it on the Shopify App Store</a>
```

**navaal.ai and Bilby are a different codebase.** These are delivered, not committed — the placement list
is HUMAN-NEEDED item 12.

## What happens after the click

1. `/go?ref=<handle>` sets the `navaal_ref` cookie on `app.navaal.ai` and 302s to the App Store listing
   with `?ref=<handle>` appended.
2. On install, `installTracking.server.js` records `installSource = "ref:<handle>"` when either the
   cookie reaches the embedded install request, or Shopify passes `?ref` through.
3. The daily digest reports the split under **WHERE THEY CAME FROM**.

## What this can and cannot see

**Attribution of our own links is real but partial, and is reported as measured.** The cookie reaches the
embedded install context in Chrome and Edge in a normal window; Safari and Firefox generally do not send
it. An install we cannot attribute is recorded as its App Store surface or as `unknown` — never guessed
into a channel, because a funnel that flatters itself is worse than no funnel.

Which **App Store surface** an organic install came from (search, category, recommendations) is still not
visible to the app: Shopify does not forward `surface_*` under managed installation. That lives in the
listing's GA4 property, and the digest says so rather than filling the gap.

## Adding a channel

1. Add it to `INSTALL_CHANNELS` in `app/utils/installChannels.js`.
2. Add the row and the snippet here (the test will tell you if you forget).
3. Put the placement in HUMAN-NEEDED, naming the page and the spot on it.

An **unregistered** ref still works and still appears in the digest, labelled `(unregistered ref)`. That
is on purpose: a handle nobody registered is either a link somebody added without telling us, or a typo
quietly losing installs, and hiding it would hide both.
