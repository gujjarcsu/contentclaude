# CC — PHASE 12, THE CLOSING PHASE: ENGINEERING DONE, THE APP IN SIX LANGUAGES, AND NOTHING NEW AFTER THIS

Paste this whole file. It replaces `CC-PROMPT-P11.md` (moved to `_superseded/`). It is long on
purpose: it is the last building phase. When its DONE list is ticked on production, your job changes
from building to keeping, and nothing is added to this app without an explicit re-open in
`11-MASTERPLAN.md` §6.5. Read that section first — it is the definition of "ready".

Production `f974f49`, 326 columns, healthy, verified from outside. Phase 11 was the best diagnosis
this project has produced: the app was deleting `navaal-qa-fresh` every ten minutes — an old
`shop/redact` keyed on the **domain** finding the **new** Shop row each reinstall created — while
token exchange kept the app serving screens. *The domain is not the shop; the install is.* That
sentence is false green #17 and it belongs in the runbook. CW's refusal to uninstall the only live
example is why you could diagnose it in place.

**The owner's four requirements, verbatim in spirit, are the four parts of this brief:** conclude
engineering (Part E) · never break down (Part E) · exceptional results (Parts A–C) · market itself
(Part D, with CW). Every part ends in a ship gate proved on production and read by CW.

**ID note:** CW's first-run findings are FR0–FR14; CW's Phase 11 numbered a new false green "#15"
which collides with yours — theirs is **#16** (a control proved by its route) and the qa-fresh loop
is **#17**, both in `07-VERIFICATION.md`.

---

## PART A — THE SIX THINGS STILL IN FRONT OF A MERCHANT. FIRST, BEFORE ANY NEW CODE.

| | Finding (CW, live at HEAD) | Fixed means |
|---|---|---|
| **A1 — FR13, third time** | The row `[Review]` on a `Ready to review` draft is an href-less `<button>` landing on `/app/products/<id>` (primary action *Generate Content*). The numeric route works; **nothing links to it.** Twice you proved the route; nobody clicked the button. | Change the control. **Prove it with a Playwright click**: read `location.pathname` + search after navigation, assert `/app/review?product=<numeric id>`, and assert an approve control is on the landing screen. A loader test is not this. |
| **A2 — the GID false all-clear** | `/app/review?product=gid://…` now renders *"Nothing to review — you're all caught up"* on a store with three drafts pending. A false all-clear is worse than the fallback it replaced. | The GID form shows all drafts with a one-line notice that the link was malformed — or refuses with a message that is not a status. A test asserts that a malformed product param never renders the empty-state copy while drafts exist. |
| **A3 — frame 01 contradicts itself** | Home: *"Unchanged since September 14"* beside *"Autopilot optimized 15 new products in the last 24 hours"* on a 15-product store. The banner is new since 14 Sep. | One source of truth for "what changed"; the autopilot banner names a real count from the same window the score card uses. Two products of different state in a test; both lines agree. |
| **A4 — frame 04 leads with a chore** | The first-run screen's caption promises *"the 3 things holding this store back"*; the largest element is an **orange banner telling the merchant to edit their theme**. | The three findings lead; the theme-embed prompt is secondary and dismissible on first run, promoted only after the first publish. The first screen a new merchant sees is a result, never a task for them. |
| **A5 — the French store wrote English** | `navaal-shape-fr`: `brandVoice.language` defaulted to `en` regardless of the shop; the first run extracted French `keyDifferentiators` and still set English. | **Generation language defaults from the store's primary locale at install** (`Shop.locale` / `shop.primaryLocale`, refreshed on each session like the name). The splash names the language it is writing in. Settings overrides. A test: a `fr` shop with no settings gets a French system prompt. Decided in `04-DECISIONS.md`. |
| **A6 — brand-voice ingested boilerplate** | The seeded sample began *"Your Privacy Choices: As described in our Privacy Policy, we"*. | The inference corpus excludes policy/legal/cookie text (policy pages by handle, footer blocks, a small boilerplate lexicon). If the extracted differentiators' language ≠ the language setting, the screen says the setting looks wrong. Tests for both. |

Also from CW: `schema.prisma` `binaryTargets` gains `debian-openssl-3.0.x` so CW's VM can run
read-only diags; the TTV report stops counting anonymised ghosts (R7); the matrix closes **61 of
90** routed lines — name the 29 that are fixture-only so nobody chases stores for them.

### 🚢 Ship gate A
Post the sha. **CW re-captures 01 and 04 alone** (02/03/05 are uploaded today by decision) and
re-walks the French store's first run. Then Part B.

---

## PART B — THE LEGAL PAGES: ONE POLICY, TWO PARTS, ONE GENERATOR

CW found `navaal.ai/privacy` is **not** a stale copy: it is a two-part policy — Part 1 the website
and the free Bilby scan (first-party beacon, device class, coarse location), Part 2 the app — and
`app.navaal.ai/privacy` covers only the app. A redirect would have deleted the website's only
policy. **Do not let the owner upload the privacy redirect until this part ships.**

- `legal.js` gains **Part 1** as constants, text taken from the live `navaal.ai/privacy` (read it;
  do not paraphrase it — the owner wrote it and the beacon it describes is real), with the same
  build-time guards as Part 2: a processor listed in Part 1 without a transfer basis fails the build.
- The generated page carries both parts with a table of contents; `/privacy` on the app is now the
  single policy for everything Navaal does.
- Correct `_UPLOAD-LEGAL-REDIRECTS.md`: **terms redirect now** (the 8 July terms are stale app
  terms); **privacy redirect only after this sha**, and say the sha in the file.
- The support form and the legal pages in the six languages come with Part D, locale by locale.

### 🚢 Ship gate B — CW reads both parts on `app.navaal.ai/privacy`; the owner uploads the privacy redirect after.

---

## PART C — THE FIRST RESULT A MERCHANT CAN SEE, END TO END

Everything in Phase 3 is built. None of it has run on a real batch. The owner's session makes
`navaal-ttv-03` public with a Bing key and ten published products, and runs the Crawl-holdout
workflow. **Your part is to be ready for the readout and to make it exceptional:**

- C1 — When the holdout reads out (~72 h), the merchant-facing screen shows **both arms, the
  interval, the seed, and one plain sentence** a non-statistician understands (*"Pages we submitted
  were crawled a median 31 hours sooner than pages we didn't — with this few pages the honest range
  is 9 to 52 hours"*). Never the point estimate alone. Never a verdict under five pages per arm.
- C2 — The weekly report (P3.6) fires for that store the Monday after, and the review ask (Part C
  of P7) is gated on exactly this kind of result. Prove the chain: result → report → ask, on ttv-03.
- C3 — The Lighthouse number (F13): run the harness against the now-public ttv-03 with the FAQ block
  on and off; write the weighted number into `BFS-AUDIT.md`. Under 10 points or say why not.
- C4 — Write the readout into `docs/history/` with the seed, both arms and the interval. That page
  is the first proof this app has ever produced, and Cowork will use it (anonymised, with the
  owner's consent) as the first public result once three merchants have one.

### 🚢 Ship gate C — after the readout lands; CW reads the screen and the report email.

---

## PART D — THE APP IN SIX LANGUAGES, ONE LOCALE AT A TIME, GERMAN FIRST

The listing translations are written (`LISTING-TRANSLATIONS.md`). **They may not be entered for a
locale until the app speaks it** — a translated listing for an English-only app is a false claim on
a Shopify submission. `11-MASTERPLAN.md` §6.5 B has the sequencing rule; this is the build.

**D0 — the i18n layer.** Choose the Polaris-compatible layer (`@shopify/react-i18n` or `i18next`
with the Polaris provider), extract **every merchant-visible string** — routes, components, error
messages, quota copy, the first-run splash, the review ask, the support form, the weekly report and
every email — into `locales/en.json` as the source of truth. A test fails on any hard-coded
merchant-visible string outside the catalogue (grep the JSX for string literals in text positions;
allow-list brand names and units). Dates, numbers, currency and the credit unit format by locale.
The locale comes from Shopify (`shop.primaryLocale` / the embedded-app `locale` param), overridable
in Settings. **English behaviour unchanged, proved by CW's sweep and a snapshot of the first run.**

**D1 — German (`de`).** Full catalogue translated; the legal pages and the support form generated
in German from the same constants; the generated content already writes German for a German store
(A5). A test fails on any key present in `en.json` and missing in `de.json`. Ship gate. **Then CW
enters the German listing from `LISTING-TRANSLATIONS.md` and sets the listing's Languages field.**

**D2–D6 — French, Spanish, Italian, Portuguese (Brazil), Japanese**, in that order, each the same:
catalogue + legal + support + a missing-key test + ship gate + CW enters that listing. Japanese
last because layout breaks differently: check every Polaris control with the longest strings.

**What "translated" means here:** the text in `LISTING-TRANSLATIONS.md` is the register — plain,
specific, no superlatives, the merchant addressed as you. Machine-translate nothing merchant-facing
without reading it back against that register. Keep the credit unit, plan names and the app name
untranslated.

### 🚢 Ship gate per locale. CW reads the first run in that language on a shape store set to it.

---

## PART E — ENGINEERING DONE. TWELVE LINES, EACH PROVED ON PRODUCTION.

From `11-MASTERPLAN.md` §6.5 A. Do not tick a line you have not proved the way the line says.

| | Line | What you do |
|---|---|---|
| A1 | Nothing a merchant can reach contradicts itself | CW's third confusion count ≤ 3; every number on every screen reconciles to the catalogue (Part A closes the last two). |
| A2 | Install state is Shopify's truth | Phase 11 — cite the shas and the cross-shop count (0 flagged-with-session). |
| A3 | Every scheduled job proves it fires | `scheduledWeek.test.js` — cite. Add any job created in this phase. |
| A4 | **A tested restore** | Execute the Neon restore drill once: restore the latest point-in-time to a branch, run the schema check and a row-count comparison against production, time it, write it into `RUNBOOK.md` so a second person could repeat it. If it needs a Neon API key you do not have, route it as the owner's single step and stop there — do not tick it. |
| A5 | Alerting reaches a human | Deep-health monitor + second contact (H16, owner session) + **one deliberately triggered alert** (take the health endpoint red for sixty seconds in a controlled way, or use the monitor's test-alert) received on the owner's phone — the owner confirms in the queue. |
| A6 | The clocks are in the code | Tests that go red 90 days before: Admin API 2026-04 sunset (2027-04-01), each model's deprecation date in `modelPricing.js`, `featuredImage` removal, script-tag injection end (2027-03-01), the Shopify CLI/library major you depend on. One file, one table, one test per row. |
| A7 | Failure is loud, bounded and recoverable | Break each on purpose in a test and show the merchant-facing result is a truthful screen, never a silent zero: AI provider down (circuit breaker), queue worker dead, Shopify 429, Shopify 5xx, revoked token, expired trial, failed webhook delivery, Redis down, database down. A table in `RUNBOOK.md`: failure → what the merchant sees → what the owner is told → recovery. |
| A8 | Money is exact | Credits debited exactly once per generation (concurrency test: two simultaneous generations, one debit each); the cap never overshoots; the annual 2× once ever; packs after allowance; trial credits separate; every one break-tested. Cite the tests. |
| A9 | Secrets never appear | Merchant AI key, Bing key, our keys: a test that greps every log line, error body and client payload produced by a full generation and a full holdout run. |
| A10 | The runbook | `docs/navaal/RUNBOOK.md`: the five 3 am failures — database down, Redis down, AI provider down, Shopify API version rejected, a merchant reports wrong content published — each with symptoms, first command, recovery, and who to tell. Each entry tried once (a dev store, a controlled break). |
| A11 | No untested store shape a real merchant could occupy | The 61 closed lines cited; the 29 fixture-only lines named; anything a real store could be that is NOT RUN gets a store or a stated reason. |
| A12 | App-version discipline | The standing-prompt rule; cite the last release and the Versions page. |

### 🚢 Ship gate E — the last one. Post the twelve lines with their proofs. Cowork re-verifies each from outside.

---

## PART F — STAYS ROUTED (and why nothing new is added here)

P3.4 waits on P0.10 (Level 2, owner session). P3.5 stays scoped until a real holdout has read out
(Part C). Phase 5 is gated on ten merchants and one paying. BFS Apply on 100 admin calls, which only
merchants move. **No other feature enters this app until §6.5 is re-opened by the owner.**

---

## HYGIENE — unchanged, and now the whole job

`git diff --cached --stat` before every commit · pushes branch on the suite's exit · gates read the
script's exit · toml or `extensions/` ⇒ app version · suite after the last edit · no secret printed ·
`fly secrets import` from a file · nothing you run touches EBS or a real merchant's store · a
frozen store is frozen until CW lifts it.

## DONE MEANS

- [ ] A1–A6 fixed; FR13 proved by a **click**; CW's re-walk of the French store and the third
      confusion count posted
- [ ] One two-part privacy policy generated; redirect instructions corrected
- [ ] The holdout readout screen, the report → ask chain, the Lighthouse number, the write-up
- [ ] i18n layer live with English unchanged; **German live**; French, Spanish, Italian, Portuguese,
      Japanese each live with their missing-key test; CW's listing entry per locale confirmed
- [ ] Engineering Done A1–A12, each with the proof the line names, posted for Cowork to re-verify
- [ ] `RUNBOOK.md` exists, every entry tried once
- [ ] Written back (**L18**), and `11-MASTERPLAN.md` §6.5 marked CLOSED with the date

When this is ticked, stop building. Report what is true that was not true when you started.
