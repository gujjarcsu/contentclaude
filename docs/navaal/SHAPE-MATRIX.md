# SHAPE MATRIX — every store shape, every phase, one of three words

*Phase 10 Part C (backlog F1). Data: `tests/fixtures/shapeMatrix.js`. Run: `tests/utils/shapeMatrix.test.js`. Held together by `tests/docs/shapeMatrix.test.js` — the table below is the data, verbatim, and the test refuses a PASS cell it does not run.*

**A cell you did not test is a defect you have not found yet.** That is why NOT RUN is a word in this table and not a blank, and why every NOT RUN names where it goes.

- **PASS** — `shapeMatrix.test.js` drives the real function (candidate predicate, content classifier, first-run scan through `shopifyQuery` with retries off, the catalogue walk's grader, the plan-fit arithmetic) with this shape and asserts what it does.
- **HELD** — proved elsewhere, by the named file or proof, before this matrix existed.
- **NOT RUN** — a fixture cannot reach it: it needs the AI, a Shopify write, or a real screen. Those go to the `navaal-shape-*` dev stores (F2) or are named as having no store of that size.
- **·** — the phase does not apply to that row (a plan context has no catalogue; the count phase reads a payload, not products).

## 1. The table (2026-09-15)

**Tally:** PASS 107 · HELD 15 · NOT RUN 75 · n/a 127 — 36 rows × 9 phases. Twenty-one catalogue shapes, five plan contexts, four API contexts.

| axis | shape | Count | Candidates | Content | First-run scan | Catalogue walk | Plan fit | Screens | Draft | Publish |
|---|---|---|---|---|---|---|---|---|---|---|
| catalogue size | `SIZE:EMPTY` | ✅ PASS | ✅ PASS | · | ✅ PASS | ✅ PASS | · | 🟦 HELD | · | · |
| catalogue size | `SIZE:SINGLE` | ✅ PASS | ✅ PASS | · | ✅ PASS | · | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| catalogue size | `SIZE:TINY` | ✅ PASS | · | · | ✅ PASS | · | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| catalogue size | `SIZE:ONE_PAGE` | ✅ PASS | · | · | ✅ PASS | · | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| catalogue size | `SIZE:MULTI_PAGE` | ✅ PASS | · | · | · | 🟦 HELD | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| catalogue size | `SIZE:LARGE` | ✅ PASS | · | · | · | · | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| catalogue size | `SIZE:HUGE` | ✅ PASS | · | · | · | · | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| status mix | `ALL_ACTIVE` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | 🟦 HELD | 🟦 HELD | 🟦 HELD |
| status mix | `ALL_DRAFT` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ✅ PASS | ⬜ NOT RUN | ⬜ NOT RUN |
| status mix | `MAJORITY_ARCHIVED` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| channel | `ACTIVE_NOT_PUBLISHED` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ✅ PASS | ⬜ NOT RUN | ⬜ NOT RUN |
| channel | `B2B_ONLY` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ✅ PASS | ⬜ NOT RUN | ⬜ NOT RUN |
| channel | `MULTI_CHANNEL` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| existing content | `NO_CONTENT` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| existing content | `BLANK_MARKUP_CONTENT` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| existing content | `THIN_TEMPLATED` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| existing content | `HAND_WRITTEN` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| existing content | `PARTIAL_BY_FIELD` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| existing content | `COMPLIANCE_CLAIMS` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| structure | `VARIANT_FAMILY` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| structure | `FASTENER_SIZES` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| structure | `VARIANT_HEAVY_BARCODES` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| structure | `ONE_PRODUCT_100_VARIANTS` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| structure | `MULTIPACKS` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| locale | `NON_ENGLISH` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| locale | `MULTI_LOCALE` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | · | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| plan | `PLAN:FREE_WITH_QUOTA` | · | · | · | · | · | ✅ PASS | 🟦 HELD | · | · |
| plan | `PLAN:FREE_EXHAUSTED` | · | · | · | · | · | ✅ PASS | 🟦 HELD | · | · |
| plan | `PLAN:MID_TIER` | · | · | · | · | · | ✅ PASS | ⬜ NOT RUN | · | · |
| plan | `ABOVE_PLAN_CAP` | · | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ⬜ NOT RUN | ⬜ NOT RUN | ⬜ NOT RUN |
| plan | `PLAN:ABOVE_ANY_PLAN` | · | · | · | · | · | ✅ PASS | ⬜ NOT RUN | · | · |
| plan | `PLAN:BYO_KEY` | · | · | · | · | · | ✅ PASS | 🟦 HELD | 🟦 HELD | · |
| API | `API:HEALTHY` | · | · | · | ✅ PASS | · | · | · | · | · |
| API | `API:THROTTLED` | · | · | · | ✅ PASS | 🟦 HELD | · | · | 🟦 HELD | 🟦 HELD |
| API | `API:PARTIAL_FAILURE` | · | · | · | ✅ PASS | · | · | · | 🟦 HELD | 🟦 HELD |
| API | `API:DEPLOY_MID_JOB` | · | · | · | ✅ PASS | · | · | · | 🟦 HELD | ⬜ NOT RUN |

PASS 107 · HELD 15 · NOT RUN 75 · n/a 127 — 36 rows × 9 phases.

**NOT RUN, and where each one goes:**

- `SIZE:SINGLE` / Screens → navaal-shape-* store (F2)
- `SIZE:SINGLE` / Draft → navaal-shape-* store (F2)
- `SIZE:SINGLE` / Publish → navaal-shape-* store (F2)
- `SIZE:TINY` / Screens → navaal-shape-* store (F2)
- `SIZE:TINY` / Draft → navaal-shape-* store (F2)
- `SIZE:TINY` / Publish → navaal-shape-* store (F2)
- `SIZE:ONE_PAGE` / Screens → a 250-product dev store
- `SIZE:ONE_PAGE` / Draft → a 250-product dev store
- `SIZE:ONE_PAGE` / Publish → a 250-product dev store
- `SIZE:MULTI_PAGE` / Screens → no 3,000-product dev store
- `SIZE:MULTI_PAGE` / Draft → no 3,000-product dev store
- `SIZE:MULTI_PAGE` / Publish → no 3,000-product dev store
- `SIZE:LARGE` / Screens → no 50,000-product store; Count says 10,000+
- `SIZE:LARGE` / Draft → no 50,000-product store
- `SIZE:LARGE` / Publish → no 50,000-product store
- `SIZE:HUGE` / Screens → no 500,000-product store; Count says 10,000+
- `SIZE:HUGE` / Draft → no 500,000-product store
- `SIZE:HUGE` / Publish → no 500,000-product store
- `ALL_DRAFT` / Draft → navaal-shape-* store (F2)
- `ALL_DRAFT` / Publish → navaal-shape-* store (F2)
- `MAJORITY_ARCHIVED` / Screens → navaal-shape-* store (F2)
- `MAJORITY_ARCHIVED` / Draft → navaal-shape-* store (F2)
- `MAJORITY_ARCHIVED` / Publish → navaal-shape-* store (F2)
- `ACTIVE_NOT_PUBLISHED` / Draft → navaal-shape-* store (F2)
- `ACTIVE_NOT_PUBLISHED` / Publish → navaal-shape-* store (F2)
- `B2B_ONLY` / Draft → navaal-shape-* store (F2)
- `B2B_ONLY` / Publish → navaal-shape-* store (F2)
- `MULTI_CHANNEL` / Screens → navaal-shape-* store (F2)
- `MULTI_CHANNEL` / Draft → navaal-shape-* store (F2)
- `MULTI_CHANNEL` / Publish → navaal-shape-* store (F2)
- `NO_CONTENT` / Screens → navaal-shape-* store (F2)
- `NO_CONTENT` / Draft → navaal-shape-* store (F2)
- `NO_CONTENT` / Publish → navaal-shape-* store (F2)
- `BLANK_MARKUP_CONTENT` / Screens → navaal-shape-* store (F2)
- `BLANK_MARKUP_CONTENT` / Draft → navaal-shape-* store (F2)
- `BLANK_MARKUP_CONTENT` / Publish → navaal-shape-* store (F2)
- `THIN_TEMPLATED` / Screens → navaal-shape-* store (F2)
- `THIN_TEMPLATED` / Draft → navaal-shape-* store (F2)
- `THIN_TEMPLATED` / Publish → navaal-shape-* store (F2)
- `HAND_WRITTEN` / Screens → navaal-shape-* store (F2)
- `HAND_WRITTEN` / Draft → navaal-shape-* store (F2)
- `HAND_WRITTEN` / Publish → navaal-shape-* store (F2)
- `PARTIAL_BY_FIELD` / Screens → navaal-shape-* store (F2)
- `PARTIAL_BY_FIELD` / Draft → navaal-shape-* store (F2)
- `PARTIAL_BY_FIELD` / Publish → navaal-shape-* store (F2)
- `COMPLIANCE_CLAIMS` / Screens → navaal-shape-* store (F2)
- `COMPLIANCE_CLAIMS` / Draft → navaal-shape-* store; the claims must survive the draft (09-DOCTRINE)
- `COMPLIANCE_CLAIMS` / Publish → navaal-shape-* store (F2)
- `VARIANT_FAMILY` / Screens → navaal-shape-* store (F2)
- `VARIANT_FAMILY` / Draft → navaal-shape-* store (F2)
- `VARIANT_FAMILY` / Publish → navaal-shape-* store (F2)
- `FASTENER_SIZES` / Screens → navaal-shape-* store (F2)
- `FASTENER_SIZES` / Draft → navaal-shape-* store (F2)
- `FASTENER_SIZES` / Publish → navaal-shape-* store (F2)
- `VARIANT_HEAVY_BARCODES` / Screens → navaal-shape-* store (F2)
- `VARIANT_HEAVY_BARCODES` / Draft → navaal-shape-* store (F2)
- `VARIANT_HEAVY_BARCODES` / Publish → navaal-shape-* store (F2)
- `ONE_PRODUCT_100_VARIANTS` / Screens → navaal-shape-* store (F2)
- `ONE_PRODUCT_100_VARIANTS` / Draft → navaal-shape-* store (F2)
- `ONE_PRODUCT_100_VARIANTS` / Publish → navaal-shape-* store (F2)
- `MULTIPACKS` / Screens → navaal-shape-* store (F2)
- `MULTIPACKS` / Draft → navaal-shape-* store (F2)
- `MULTIPACKS` / Publish → navaal-shape-* store (F2)
- `NON_ENGLISH` / Screens → navaal-shape-* store (F2)
- `NON_ENGLISH` / Draft → navaal-shape-* store (F2)
- `NON_ENGLISH` / Publish → navaal-shape-* store (F2)
- `MULTI_LOCALE` / Screens → navaal-shape-* store (F2)
- `MULTI_LOCALE` / Draft → navaal-shape-* store; Translations are not read, the primary locale is written
- `MULTI_LOCALE` / Publish → navaal-shape-* store (F2)
- `PLAN:MID_TIER` / Screens → a paid dev store (Phase 8 read-screen on Starter)
- `ABOVE_PLAN_CAP` / Screens → navaal-shape-cap: 150 products on Free
- `ABOVE_PLAN_CAP` / Draft → navaal-shape-* store (F2)
- `ABOVE_PLAN_CAP` / Publish → navaal-shape-* store (F2)
- `PLAN:ABOVE_ANY_PLAN` / Screens → no 20,000-product store
- `API:DEPLOY_MID_JOB` / Publish → a deploy during a publish on a navaal-shape-* store

**HELD, and by what:**

- `SIZE:EMPTY` / Screens — tests/routes/emptyStates.test.js
- `SIZE:MULTI_PAGE` / Catalogue walk — tests/utils/catalogueWatch.test.js (paging)
- `ALL_ACTIVE` / Screens — tests/routes/firstRun.test.js, tools/proof/read-screen.mjs on navaal-ttv-03
- `ALL_ACTIVE` / Draft — navaal-ttv-03 first run, Phase 8
- `ALL_ACTIVE` / Publish — tools/proof/review-scoped-proof.mjs on navaal-ttv-03
- `PLAN:FREE_WITH_QUOTA` / Screens — tests/routes/firstRun.test.js (quota sentence)
- `PLAN:FREE_EXHAUSTED` / Screens — tests/utils/startState.test.js (no credits left)
- `PLAN:BYO_KEY` / Screens — tests/utils/byok.test.js
- `PLAN:BYO_KEY` / Draft — tests/utils/byok.test.js (zero credits, recorded)
- `API:THROTTLED` / Catalogue walk — tests/utils/catalogueWatch.test.js
- `API:THROTTLED` / Draft — tests/utils/bulkProcessor.test.js
- `API:THROTTLED` / Publish — tests/utils/adminGraphql.publish.test.js
- `API:PARTIAL_FAILURE` / Draft — tests/utils/bulkProcessor.test.js
- `API:PARTIAL_FAILURE` / Publish — tests/routes/review.publish.test.js
- `API:DEPLOY_MID_JOB` / Draft — tests/utils/bulkProcessor.test.js (resume)

## 2. What the first run of the matrix found

1. **ALL_DRAFT, B2B_ONLY and ACTIVE_NOT_PUBLISHED scanned as EMPTY** — correctly: the first-run scan is scoped to Active products on the Online Store, the same scope the SEO Audit and the catalogue walk use. The empty screen then told a merchant with twenty products to "add a product and we'll get started". **Fixed in the same commit:** Home passes `totalProducts` and `candidateProducts` into the Start payload, and when the store has products but none is a candidate the screen says *"Your products aren't on your Online Store yet"*, names the three reasons (drafts, archived, another channel only), and opens Shopify's product list. The "add a product" screen is now only for a store with zero products. The `ALL_DRAFT/screens`, `B2B_ONLY/screens` and `ACTIVE_NOT_PUBLISHED/screens` cells hold it.
2. **ONE_PRODUCT_100_VARIANTS with its only barcode on variant 60** — the walk reads 50 variants (`VARIANT_BARCODE_SAMPLE`), finds none, and the finding *says* "No barcode on any of the 50 variants we read". The merchant can mark the product GTIN-exempt and the finding clears. A stated limit, not a hidden one; raising the sample costs query points on every multi-variant product and is not worth it for a shape this rare.
3. **PARTIAL_BY_FIELD** — with 25-character descriptions, a product missing its SEO title or SEO description scores 27 and a product missing the description itself scores 31. The rubric treats thin copy as no copy and weighs the SEO fields on top, so the three targets are the SEO-field gaps, not the empty descriptions. Recorded as an observation about the rubric's weights (P1.3), not a defect: every one of the nine is a weak product and the three chosen tie for weakest.
4. **BLANK_MARKUP_CONTENT** — the candidate classifier reads `<p>&nbsp;</p>` as no content (Generate), while the walk's grader sees an 18-character string and calls it "short" rather than "empty". Both surfaces act on the product; the words differ. Left as is: the grader's job is the feed's rule, which counts characters.
5. **The size axis above 3,000 has no store.** Count reads honestly at every size (`10000+` past the precision ceiling), paging is held by the catalogue-watch tests, and nothing else is proved above ONE_PAGE. That is eight NOT RUN cells with no dev store that could run them; a 50,000-product catalogue is an F10-class read on a real merchant, not a fixture.

## 3. NOT RUN → the navaal-shape-* stores (F2)

One store per shape that matters most, named so `TEST_SHOP_PATTERN` and every dev-store guard recognise them. None is captured, none is frozen, none is EBS. Nothing writes to them from the app; the catalogue arrives by CSV import.

| store | shape | import file | what the store proves that a fixture cannot |
|---|---|---|---|
| `navaal-shape-drafts` | ALL_DRAFT (20 drafts, none on the Online Store) | `tools/proof/fixtures/shapes/alldraft.csv` | the "aren't on your Online Store yet" screen on a real first run; what Products shows for 20 drafts; that nothing is written for a draft |
| `navaal-shape-variants` | VARIANT_HEAVY_BARCODES + ONE_PRODUCT_100_VARIANTS | `tools/proof/fixtures/shapes/variants.csv` | the walk's second look on real variants; the 50-of-100 finding text on the Catalogue screen; a draft and a publish on a 7-variant product |
| `navaal-shape-fr` | NON_ENGLISH (French product data) | `tools/proof/fixtures/shapes/fr.csv` | the draft is written in the product's language, not English; the publish keeps accents intact |
| `navaal-shape-b2b` | B2B_ONLY (active, not on the Online Store channel) | `tools/proof/fixtures/shapes/b2b.csv` | the screen for a trade-only store; that "not on the Online Store" is the wording, never "add a product" |
| `navaal-shape-cap` | ABOVE_PLAN_CAP (150 products on Free) | `tools/proof/fixtures/shapes/cap.csv` | the 100/50 split on the bulk confirmation; the plan-fit line on Products; alt text stops at the cap |
| `navaal-shape-zero` | EMPTY_STORE (FR0) | no import | the "add a product" screen, the four empty screens 2.10 fixed, and the funnel stamps on an install that never drafts |

The import files are generated by `scripts/shape-csv.mjs` from the same fixtures the matrix runs, and `tests/utils/shapeCsv.test.js` holds each committed file to its generator and to its shape. Shopify's CSV import publishes to the Online Store from its own `Published` column and creates variants with barcodes from plain rows — the same path that built the ttv stores, and one that needs no scope this app does not hold. Nothing here writes to a store from the app.

**Runbook, per store (CW, in the queue):** create the development store in the Partner Dashboard with the name above → Products → Import → the file → wait for the import email → install the app from the Partner Dashboard (install LAST, so the first run sees the catalogue) → post the handle. Then: the **First-run scores** workflow on the store (numbers only), `tools/proof/read-screen.mjs` on /app, /app/products and /app/catalogue, and for `navaal-shape-variants` and `navaal-shape-fr` one draft approved and published through Review, which is the Draft and Publish cell for that row.
