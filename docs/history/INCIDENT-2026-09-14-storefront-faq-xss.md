# INCIDENT — stored XSS surface on merchant storefronts via the FAQ block

**Status: closed 2026-09-14. Exposure measured: zero.**
**Written by CC. This is the document the owner sends if a merchant ever asks.**

---

## One paragraph

Between 2 July and 14 September 2026, the theme app block `faq_visible.liquid` rendered AI-generated
FAQ text on merchant product pages **without HTML escaping**, and for most of that window the app
also stored that text **without stripping markup**. Liquid does not auto-escape. Had any stored FAQ
question or answer contained an angle bracket, it would have been live HTML on the merchant's
storefront, executed in the browser of the merchant's customer. On 14 September every FAQ metafield
on every reachable installed shop was read: **5 metafields, 25 question/answer pairs, zero angle
brackets, zero entities decoding to one.** Nothing exploitable was ever stored.

## The two locks, and when each one actually took effect

There are two independent defences, and they became effective on different dates because they live
on different sides of the boundary between our server and Shopify.

| Lock | What it does | Where it lives | Committed | **Live** |
|---|---|---|---|---|
| **Server** | `toPlainText()` decodes entities, strips tags until stable, then removes every remaining `<` and `>` from FAQ text **before it is stored** | `app/utils/seo.server.js` → `faqToJsonLd` | `7942c30`, 9 Sep 11:26 UTC | **9 Sep**, with the fly deploy of that commit |
| **Storefront** | `\| escape` on every interpolation of AI text in the Liquid block | `extensions/geo-schema/blocks/faq_visible.liquid` | `7942c30`, same commit | **14 Sep 06:46 UTC**, app version `p0-xss-f505584` |

**Why the storefront lock was five days late.** `fly deploy` ships the container. It ships nothing
Shopify holds — `shopify.app.toml` and everything under `extensions/` reach Shopify only through
`shopify app deploy`, which creates and releases an *app version*. The active version was
`navaal-seo-geo-content-15`, created 04:34 UTC on 9 September — **6 h 52 min before** `7942c30`
landed. Every deploy after that was green and true about the container, and silent about the
Liquid Shopify was still serving. This is recorded as false green #12 in `07-VERIFICATION.md`, and
the ship gate now has a third step whenever a range touches `extensions/` or the toml.

## The window, honestly, in both numbers

| From | To | Days | State |
|---|---|---|---|
| **2 Jul** (`894e34f`, FAQ metafields written on every publish path) | **9 Sep** (server lock live) | **69** | Text stored **unsanitised**, rendered **unescaped**. Neither lock. |
| 9 Sep | **14 Sep** 06:46 UTC (storefront lock live) | 5 | New text sanitised on write. Text stored before 9 Sep still rendered unescaped. |
| 14 Sep | — | — | Both locks. |

So: **69 days** of unsanitised *writes*, and **74 days** of unescaped *rendering*. The two numbers
differ because a lock on the write path protects only what is written after it, while the lock on
the render path protects everything at once. The first brief on this incident said "five days" —
it dated the window from the stale version rather than from the first unsanitised write. The
correction is above.

## The realistic attack path — neither dramatised nor minimised

The text that reached the storefront was **AI output, generated from the merchant's own product
data.** The model was given `descriptionHtml` — up to 64 KB of raw HTML before item 19 (the same
commit) capped it — plus title, type, vendor and tags, and asked to write questions and answers.

For markup to have reached a customer's browser, one of two things had to happen:

1. **Control of the merchant's product content.** A compromised staff account, a poisoned supplier
   import, a third-party app writing product descriptions — anyone who could put `<script>` into a
   product description could hope the model would carry it into an answer verbatim.
2. **Prompt injection** that made the model *emit* markup it was not given.

Neither is trivial. Neither is impossible. Models do echo input, and product descriptions on real
stores are full of HTML because that is how Shopify stores them. The app relied on the model not
doing something it is known to sometimes do, and on a templating language auto-escaping when it does
not. That is the defect: not that an attack was likely, but that nothing stood between an unlikely
input and a customer's browser.

**What was and was not defended, by date:**

- **2 Jul → 9 Sep:** nothing. Raw model output stored; raw stored text rendered.
- **9 Sep → 14 Sep:** server lock only. New generations safe; old stored text still rendered raw.
- **14 Sep →:** both locks. Old text, if any had contained markup, would now render as visible text.

## What A5 read, and what it means

`scripts/xss-exposure-diag.mjs`, run against production at `0c37d80` on 14 Sep 07:03 UTC. Read-only.
For every shop that has ever generated content, it read every `contentclaude.faq_schema` metafield
through the shop's stored offline token and checked each question and each answer for `<`, `>`,
the entity forms (`&lt;`, `&#60;`, `&#x3c;` and their `>` equivalents), `</script`, and tag-like
openers (`<script`, `<img`, `<svg`, `<iframe`, `<a`, `on*=`).

| | |
|---|---|
| Shops that have generated content | 9 |
| Reachable through a stored token | 7 |
| Unreachable | 2 — both Shopify app-review stores, HTTP 401: the app is uninstalled there |
| FAQ metafields read | **5** |
| Question/answer pairs checked | **25** |
| Findings, any category, any shop | **0** |

**Why only five.** The FAQ metafield is written only when FAQ content was generated *and*
published. Most published content on these stores is description + meta; five products carried FAQ.

**The two unreachable shops.** Their metafields cannot be read because their tokens no longer
authenticate. But their *exposure* is also closed: the block that renders the metafield is our app's
theme extension, and Shopify removes app blocks when an app is uninstalled. A metafield nothing
renders is data, not a surface.

**The scan prints no shop domain and no handle** — a shop with an exposure is a shop with a
vulnerability, and that output goes into a CI log. It prints an index and a class. One correction
after the first run: the pattern that decides "dev" vs "merchant" wrongly classed two non-dev shops
as dev. With zero findings anywhere that changed nothing; the pattern is corrected so it would
route correctly next time.

**No remediation was performed on any store**, because there was nothing to remediate.

## `| json` — settled, so nobody re-litigates it

`faq_schema.liquid` renders `<script type="application/ld+json">{{ value | json }}</script>`. If
Liquid's `json` filter does not escape `<`, a `</script>` inside any FAQ string closes the block
early and everything after it is parsed as HTML.

**This codebase does not depend on knowing what the filter does, and that is the correct posture.**
Testing Shopify's filter would establish what it does today, on one platform version, from outside.
The defence sits upstream where we control it: `toPlainText` removes angle brackets outright before
storage, so **there is nothing left to close the tag with, whatever the filter does.** The same lock
protects both blocks, because both read the same metafield.

That guarantee is pinned in `tests/utils/faqEscaping.test.js` against eight hostile payloads —
including the ordering bug (decode entities *before* stripping, or `&lt;script&gt;` reassembles
after the stripper has run) and the nesting bug (`<<b>script>` leaves `<script>` after one pass) —
and it is asserted on the exact serialised string handed to Shopify. Break-tested: unescaping
`qa.name` in the block → 2 failures; removing `toPlainText` from the answer → 2 failures.

## What changed so this class cannot recur silently

1. **A third ship-gate step** (`CC-STANDING-PROMPT.md`): any range touching `extensions/` or the toml
   must also release an app version, named with the sha, and the new version number and created
   time are recorded from the Versions list — not from the command's own output.
2. **Both locks are tested**, at the sanitiser, at the metafield builder, and at the Liquid source.
3. **The exposure scan is repeatable** — the *XSS exposure check* workflow, read-only, no names.

## Timeline

| When (UTC) | What |
|---|---|
| 2026-07-02 04:24 | `894e34f` — FAQ JSON-LD metafield written on every publish path. No sanitisation. |
| 2026-09-09 04:34 | App version `navaal-seo-geo-content-15` created. Block still unescaped. |
| 2026-09-09 11:26 | `7942c30` — both locks committed. Server lock live with the fly deploy. |
| 2026-09-09 → 09-14 | Green deploys. Shopify keeps serving the v15 Liquid. |
| 2026-09-14 | CW reads the Versions page and finds v15 is still active. Escalated as P0. |
| 2026-09-14 06:46 | `p0-xss-f505584` released. Storefront lock live. |
| 2026-09-14 07:03 | A5 scan: 5 metafields, 25 pairs, zero findings. **Incident closed.** |
