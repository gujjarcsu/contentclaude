/**
 * The GEO rubric, in a CLIENT-SAFE module.
 *
 * It lives here rather than in geo.server.js because the in-app rubric page
 * renders it, and importing a `.server` module into a client component pulls
 * server code into the browser bundle — which has broken the client build in
 * this repo before. Same split as candidates.js / candidates.server.js and
 * shopName.js / shopName.server.js.
 *
 * PURE. No imports, no I/O. geo.server.js imports these and re-exports them, so
 * the score and the published explanation read ONE table and cannot drift.
 */

/**
 * THE RUBRIC. One table, and the score and the published explanation both read
 * it, so the page a merchant checks our working on cannot drift from the maths.
 *
 * REBUILT 2026-09-14 (P1.3), re-aimed by the W1 base-rate study (n = 409 live
 * Shopify storefronts, `docs/research/w1-eligibility-base-rate/`).
 *
 * WHAT W1 CHANGED, and why each weight is what it is:
 *
 *   - STRUCTURED DATA IS GONE. It was the single largest dimension at 25 of 100
 *     points. `09-DOCTRINE.md` §3: a score is "indefensible if it scores schema
 *     presence". Shopify REQUIRES every Theme Store theme to emit product
 *     structured data, so we were awarding a quarter of the score for something
 *     the merchant's theme does for them and they cannot act on. W1 measured it
 *     at 15.9% — and most of that is duplication, not absence.
 *   - CONTENT DENSITY IS THE LARGEST DIMENSION. W1's headline finding: 43.9% of
 *     stores have product descriptions under 120 characters. That is the
 *     market's actual problem, it is the thing this app fixes, and it is what
 *     the evidence-density standard in §3 supports.
 *   - ATTRIBUTES ARE GRADED, NOT COUNTED. The old rubric scored five attributes
 *     as one undifferentiated fifth. `09-DOCTRINE.md` §1: never call a
 *     recommended field a disqualification. So each attribute carries a grade,
 *     and `productType` is COSMETIC — W1 is explicit that it is Shopify's own
 *     taxonomy field and NOT on OpenAI's required list, so grading it blocking
 *     "would repeat the GTIN overclaim §1 already had to walk back".
 *   - FRESHNESS IS IN, BUT ONLY WHEN IT IS KNOWN.
 *
 * NOT IN THIS SCORE: crawler access. W1 found it on 0.5% of stores — 2 in 409 —
 * so it cannot carry a headline. It is also not implemented anywhere in this app
 * yet (it is P2.1), so there was nothing here to demote: saying "I removed it"
 * would be claiming a change I did not make.
 *
 * `optional: true` means a dimension is skipped when its input is absent rather
 * than scored zero, and the rest is renormalised to 100. "I could not measure
 * this" and "this is missing" are different findings and must never be
 * substituted for one another.
 */
import { T } from "../i18n/index.js";

export const GEO_RUBRIC = [
  {
    key: "contentDensity",
    label: T("Description depth and specifics"),
    max: 25,
    why: T("The most common gap in the market: 43.9% of Shopify stores have product descriptions under 120 characters. Length alone is not the point \u2014 concrete, checkable details are, so measurements, materials and figures count for more than words."),
  },
  {
    key: "attributes",
    label: T("Product attributes"),
    max: 20,
    why: T("The facts a shopper or an assistant needs to tell one product from another. Graded by how much each one actually matters, never as a flat checklist."),
  },
  {
    key: "answerFirst",
    label: T("Answer-first opening"),
    max: 15,
    why: T("A first sentence that stands on its own and answers what the product is, rather than opening with a slogan."),
  },
  {
    key: "qa",
    label: T("Questions and answers"),
    max: 15,
    why: T("Real questions a customer asks, answered on the page. This is page content shoppers read, not markup."),
  },
  {
    key: "meta",
    label: T("Page title and description"),
    max: 10,
    why: T("A title within 60 characters and a description within 160, so neither is cut off where they are shown."),
  },
  {
    key: "media",
    label: T("Image alt text"),
    max: 10,
    why: T("Text describing each image. It is what a screen reader announces, and the only way anything that cannot see the picture knows what is in it."),
  },
  {
    key: "freshness",
    label: T("Recently reviewed"),
    max: 5,
    why: T("Content that has been touched in the last year. Skipped entirely when we do not know the date rather than counted against you."),
    optional: true,
  },
];

/**
 * How much each attribute matters. `09-DOCTRINE.md` §1: never call a recommended
 * field a disqualification.
 *
 *   blocking  \u2014 without it the product cannot be compared or bought
 *   degrading \u2014 it will be shown or ranked worse without it
 *   cosmetic  \u2014 nice to have; never worth alarming a merchant about
 *
 * `adminOnly` marks attributes invisible from outside the store. W1 found
 * `barcode` is NOT exposed in `/products.json` \u2014 Admin API only \u2014 so no
 * competitor scraping from outside can grade it and we can, because we are
 * installed. It is scored only when the caller actually supplies the key.
 */
export const ATTRIBUTE_GRADES = [
  { key: "price", label: "Price", grade: "blocking", weight: 8 },
  { key: "vendor", label: "Brand or vendor", grade: "degrading", weight: 5 },
  { key: "barcode", label: "Barcode (GTIN)", grade: "degrading", weight: 4, adminOnly: true },
  { key: "productType", label: "Product type", grade: "cosmetic", weight: 2 },
  { key: "tags", label: "Tags", grade: "cosmetic", weight: 1 },
];
