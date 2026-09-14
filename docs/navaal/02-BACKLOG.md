# BACKLOG — the items, with status

> **⚠️ RE-BASED 2026-09-10.** The phase structure below (A · INFRA · B · C · D · E · G · R · F) was
> written before the market research. **`11-MASTERPLAN.md` is now authoritative for phases, order
> and gates**; this file is the item ledger underneath it. Phase A and PHASE INFRA are closed and
> stay here as the record. The forward phases map like this:
>
> | Old | New home in `11-MASTERPLAN.md` |
> |---|---|
> | B (trust and the badge) | Phase 1 (truth) + B4 (achievement, then badge) |
> | C (pricing) | **Phase 0** (P0.5 billing proved, P0.6 cost measured) + Phase 4 (the table) |
> | D (the moat) | Phase 3 (Bing/IndexNow proof) + Phase 5 (Google engine, gated on paying merchants) |
> | E (reach) | Phase 7 |
> | G (installs and reviews) | Track B |
> | R (reliability and retention) | Phase 6 |
> | F (fixture matrix) | Continuous |
>
> **Items the doctrine now forbids are CLOSED, not OPEN** — llms.txt generation, FAQ-schema benefit
> claims, "instant indexing", and any A/B content claim on a catalogue too small to detect one.
> Reconciling every row against `09-DOCTRINE.md` is item **P0.11**.

Status: `OPEN` · `IN PROGRESS` · `DONE <sha>` · `VERIFIED <sha>` · `BLOCKED <by>` · `CLOSED`
Owner: **`CC`** code · **`CW`** browser + the owner's computer · **`COWORK`** research, strategy,
copy, navaal.ai · **`OWNER`** a human: logins, money, recordings, decisions.

**Authoritative for WHAT, never blindly for STATUS.** Reconcile against the code every session and
report what you corrected (Protocol Step 0c).

**Phases are ordered.** Never start a later phase while an earlier one has an unblocked item *you
own*. An item owned by someone else is **routed** to them (`06-QUEUE.md`) and does not stop you (L17).

**Every phase closes on a gate**, not on its rows being ticked. The gate is the thing a merchant
or the App Store can see.

---

## THE MAP

| Phase | What it buys us | Gate that closes it | Status |
|---|---|---|---|
| **A** | We stop embarrassing ourselves in front of the merchants who would have reviewed us | Every defect fixed and **live**; deep health ok on the new sha | **CLOSED `d21b5bb`** |
| **INFRA** | Incidents are traceable and deploys are safe | Log retention ≥30 days; a duplicate deploy is a no-op; a restore drill on record | 2 of 7 done |
| **B** | Trust, and the Built for Shopify badge becomes reachable | A BFS audit with evidence per criterion, and no criterion failing for a reason we control | Not started |
| **C** | We can take money, at the prices we decided | A merchant can subscribe, be billed, upgrade and downgrade — proved end to end on a real store | Not started |
| **D** | **The moat.** We can prove the product worked | A merchant sees, on their own store, a number that went up because of us — and can check it | Not started |
| **E** | Reach: the stores we currently refuse or mishandle | Multi-language, B2B and Markets each either work or refuse honestly and say so | Not started |
| **G** | **Installs and reviews.** Gate 1 of the ladder | 50 net installs on paid Shopify plans, 5 reviews, rating ≥4.9 | Not started |
| **R** | It keeps working, and merchants stay | Churn instrumented and ≤2%; an on-call story; support that does not need a human per merchant | Not started |
| **F** | The fixture matrix — built continuously, not as a phase | Every axis in `05-EVIDENCE.md` §4 has a proved cell or a named gap | Ongoing |

**Phase D contains the business. Phase G contains the revenue.** A and B are what stop us losing
before we start. It is possible to finish every product item and still have zero installs — which
is exactly why G exists as a phase with owners, and not as a wish.

---

## PHASE A — DEFECTS. **CLOSED 2026-09-10, deployed and verified as `d21b5bb`.**

Only A4.9 and A6.6 remain, both BLOCKED on human/infra tasks, not on code.

### A1 · The candidate primitive — one line, five symptoms
| ID | Item | Status |
|---|---|---|
| A1.1 | One pure tested primitive: "which products/collections may this action touch, for this shop, on this plan, now". Inputs: status, Online Store publication, whether the content type already exists, shop opt-ins, remaining quota, entitlement, plan product cap. Origin: `app.products.jsx:137` unfiltered `productsCount`, feeding `:177`. | DONE 2d9c37d |
| A1.2 | ACTIVE-only default; drafts an opt-in setting defaulting off; archived never. Every label states which set the number means. | DONE f02c0b2 |
| A1.3 | Online Store channel publication as a **separate axis** from status. An ACTIVE product unpublished from the channel has no public page. | DONE 2d9c37d |
| A1.4 | Wire every consumer: Products header · 3 Home stat cards · Products tabs · Need Content card · `Optimize store (N)` on Home AND Products · the bulk modal · Optimize screen count · SEO Audit population · Collections list · anything Blog counts. | DONE 2d9c37d — Blog counts no products at all (verified: no `productsCount`, `totalProducts` or `getContentMetrics` in `app.blog.jsx`), so there was nothing to wire there. |
| A1.5 | Do NOT change the two Home cards that are already true ("Total Products … In your Shopify catalog", "Live on your storefront … with published AI content"). Add the candidate count beside them. | DONE 2d9c37d |
| A1.6 | Sweep test: fails if any count or enumeration bypasses the primitive; asserts it inspected >N files. | DONE 2d9c37d |

### A2 · Scale and silent caps
| ID | Item | Status |
|---|---|---|
| A2.1 | No silent caps. Every sampling screen states what it sampled, out of what, why — and offers to continue. Collections said "250" on a 395-collection store. | DONE |
| A2.2 | Representative sampling. Title order clusters variant families — "first 500 by title" can be a few dozen real products wearing 500 hats. Now `UPDATED_AT` desc; archived and unpublished excluded. | DONE |
| A2.3 | Scale report: what you can PROVE correct at 50,000 and 500,000 products. Cursor exhaustion, THROTTLED mid-run, a job outliving a deploy, worker memory. | DONE — one shared `enumerateProducts.server.js`; measured 250/3,000/20,000/50,000/500,000. Found: Optimize's walk used RAW `admin.graphql` (no backoff — Phase 4 item 6 fixed Products and missed this), and BOTH capped at 20,000 silently. |
| A2.4 | Report the largest catalogue proven, and how. | DONE — **20,000 products walked completely** (80 requests, 3.4 MB heap, 6 ms of our own loop). Above that we walk the 20,000 most-recently-updated and SAY SO. Simulated, not real: the largest real catalogue this code has met is 3,148. |

### A3 · Entitlement and quota honesty — Built for Shopify blocker
| ID | Item | Status |
|---|---|---|
| A3.1 | Kill the silent redirect. `app.products.jsx:714` sends an unlabelled "Optimize store (N)" straight to `/app/plans`. Entitlement must be visible BEFORE the click: plan badge + explaining modal, or replaced by an upgrade card as Phase 3.4 does for quota. **Never a bare navigate to billing.** | DONE 2d9c37d — plan named in the label, click opens an explaining modal, the action the merchant CAN take stays available. |
| A3.2 | One behaviour for both entry points. Home (`app._index.jsx:885`) goes to `/app/optimize`; Products goes to billing. | DONE — there were THREE surfaces with this label, not two. All now deep-link to the one confirmation that states what runs against the quota and names the plan before the click. The Optimize screen keeps its distinct job, enhance mode. |
| A3.3 | The bulk confirmation modal shows two different counts (`:1083` title vs `:1091` body) and omits the one that governs the outcome. `sliceToQuota` (`app.optimize.jsx:208`) already knows. State: processed now · waiting · realistic time · what covers the rest. | DONE 2d9c37d |
| A3.4 | Audit every gated surface. `/app/jobs` is reachable on Free for a paid feature. "Generate More" on an empty state — fixed. | DONE (partial) |

### A4 · Pre-existing content
| ID | Item | Status |
|---|---|---|
| A4.1 | "Has no content at all" and "not yet optimised by us" are different states and never share a number, label, badge or colour. 46 of 50 rows had descriptions; 0 of 100 sampled actives were empty; our own audit said 6 of 500. | DONE 2d9c37d — `CONTENT_ACTION` splits GENERATE/ENHANCE/OPTIMIZED, ENHANCE is not critical-toned, cards read "Not yet optimized". |
| A4.2 | Copy and behaviour must agree. Home promises "every product missing a description"; the button targets everything without OUR content. Fix the behaviour; put "rewrite existing" behind a separate labelled action. | DONE — Home's copy fixed in `2f8dd98`; the separate labelled action is the row-level **Enhance** and the Optimize screen's existing enhance panel. |
| A4.3 | Enhance-vs-Generate **routing on the Products list row actions** and the bulk action. The primitive already exists (product page + `mode=enhance`). Routing, not new work. Same on Collections. | DONE — `rowActionLabel()` routes Review / Enhance / Generate through the SHARED classifier. Collections was done in `ea6ee27`. Bulk enhance already existed on the Optimize screen. |
| A4.4 | Stop claiming authorship of the merchant's writing. Banner now scopes to proposals; "Currently on your store" labels theirs. | DONE |
| A4.5 | `standingClaims.js` — 10 promise kinds + `recurringClaims` (a sentence repeated across a fifth of a catalogue is policy, not prose). Two severities: compliance/certification hard-fail, everything else warns. `claimsIn` no longer stops at the first pattern per sentence. | DONE |
| A2.5 | NEW (found in A2.3). The 20,000 ceiling is 80 sequential Shopify requests, and a page cap does not bound wall clock — there is no request timeout configured anywhere. | DONE — bounded by TIME as well as pages (`ENUM_BUDGET_MS = 20s`), the pattern `catalogGaps.server.js` already used. Hitting the budget reports exactly like hitting the page cap. Chose this over moving the walk into the worker: that changes the job lifecycle and the quota-slice timing on a money path, which is not a change to make as a side effect of a scale report. Still **not measured against real Shopify** — no large dev store exists. |
| A4.8 | NEW (from A4.6). Voice inference reads products and collections; pages and blog copy unread. | DONE — **the premise was wrong.** `pages` is a ROOT connection, so it rides the existing scan for free exactly as `collections` does; checking the schema disproved the assumption the item was written on. Published pages only, body sliced to 1,200 chars, scored BELOW collections (a policy page is not selling copy). **Articles deliberately excluded**: blog cadence is not product cadence and learning from it teaches the model to write blog paragraphs into descriptions. |
| A4.9 | NEW (from A4.6). Show the Agena meta description before/after with the inferred voice applied. Needs a real generation against a real catalogue — a model call, not a code change. Cannot be done from this repo without spending model budget and a store to run it on. | BLOCKED by H3 (fresh dev-store installs) |
| A4.7 | NEW (found in A1.2 reconcile). A setting can ship with a column, a read path and a green suite and still be unreachable. Guard that every `BrandVoice` boolean a rule reads has a control in Settings AND a hidden input that posts it. | DONE — `tests/routes/settingsReachability.test.js` reads the booleans from **schema.prisma**, so one added later is audited without anyone remembering. Audited `autopilotEnabled`, `autopilotAutoPublish`, `publishWithoutReview`, `includeDraftProducts`: all four reachable. Exemptions must state a reason; there are none. |
| A4.6 | Voice inference must read **collection descriptions, pages and blog copy**, not only product descriptions. Extract recurring claims into Key Differentiators, create-only upsert, invent nothing. | DONE — collections ride the existing scan (no extra request), scored just above the midpoint so genuinely good product copy still wins; `keyDifferentiators` from `recurringClaims`, create-only. **Pages and blog copy NOT included** — see A4.8. **Agena before/after NOT shown** — needs a live generation; see A4.9. |

### A5 · Variant families
| ID | Item | Status |
|---|---|---|
| A5.1 | Family detection (title stem + variant axis from options, tags, metafields, product type). Inside a family skip the duplicate check entirely; check **differentiation** instead — does the copy name the distinguishing attribute? | DONE eaa319a |
| A5.2 | Two-tier band: hard fail 0–6, warn 7–16 (saves, publishable, autopilot withholds), pass >16. Never raise the single threshold. | DONE eaa319a |
| A5.3 | Fixtures: the seven real hose products; verbatim reuse still fails; finish variants pass; plus a fastener-in-40-sizes case. Report distances. | DONE eaa319a — measured: verbatim 0 · two words changed 10 (WARN) · one clause reworded 21 (PASS) · genuinely different 34. The brief recorded the paraphrase at 11; re-measured it is 10 for a two-word edit and 21 for a clause rewrite, so the WARN band catches LIGHT paraphrase only. |

### A6 · Cross-screen contradictions
| ID | Item | Status |
|---|---|---|
| A6.1 | Two store SEO scores both called the store's score (Home 82 over 30 products; Audit 84 over 500 partial). One scanner and one sample definition, or two differently-named metrics each labelled with its N and cross-linked. | DONE 2f8dd98 — two named metrics, each with its N, cross-linked. |
| A6.2 | Header/tab contradiction, third occurrence ("2 ready to review" / "Drafts to Review 2" / "Draft (0)"). Extend the consistency test to compare header, stat card, badge AND tab. | DONE 2f8dd98 — `tests/routes/numberScope.test.js`. The old guard compared the RULE, so it passed: both sides used the same rule over different populations. This one checks the LABELS. |
| A6.3 | "Unchanged since <date>" shown on the day the baseline was stamped. Day zero says "Your starting score" or nothing. | DONE 2f8dd98 |
| A6.4 | "2/25 used · 23 remaining" and "23 of 25 left this month" — same fact twice, adjacent. | DONE 2f8dd98 |
| A6.5 | Plans FAQ omits image alt text from what counts as one generation. | DONE 2f8dd98 |
| A6.6 | Two drafts not three on first run. | BLOCKED by INFRA2 (no log retention) |

### A7 · Phase A close-out
| ID | Item | Status |
|---|---|---|
| A7.1 | Deploy Phase A. Confirm `/api/health?deep=1` ok on the new SHA. | **VERIFIED d21b5bb** — 19 commits shipped `0acb04a..d21b5bb`. Cache-busted from outside: `build-info` = `d21b5bb` = local HEAD; deep health `status: ok`, `schema.ok: true`, **columns 229 → 230**, exactly the one column the `20260910180000_candidate_scope` migration adds. All four CI jobs green; the machine guard logged "2 web machines, all started". |

---

## PHASE INFRA — carry alongside A. These are cheap and they unblock other work.

*Owner: `CC` for every INFRA row unless the row says otherwise.*

| ID | Item | Status |
|---|---|---|
| INFRA1 | Deduplicate deploys. `ci.yml` on push + `deploy.yml` on dispatch; `concurrency` serialises without deduping. | **DONE, PROVED LIVE** (`64c703b`) — dispatched `deploy.yml` during a push of the same commit. Manual read `live sha: 693db1c` (old) and DEPLOYED; CI read `live sha == target sha` and logged *"This commit is already live — skipping a duplicate deploy (INFRA1)"*. **One deploy, not two.** Whichever runs second skips, so the order does not matter. BOTH paths now skip a commit that is already live. `deploy.yml` gains a `force` input for repairing a broken deploy and a post-deploy confirmation step; `ci.yml` needs no force because a re-run after a FAILED deploy self-selects (build-info still reports the old commit). **Fails safe**: an unreadable build-info deploys rather than skips — refusing to deploy because we could not check is how a broken production stays broken. Logic proved against four cases. |
| INFRA2 | **Log retention.** ~100 lines today, so no incident is traceable after minutes. | DONE (first real read pending) — `LogEvent` table + pino MULTISTREAM sink, **30 days**, no new vendor. Stores WARN-and-above plus deliberately tagged events, NOT stdout: a table full of `GET /api/health 200` would bury the rows an investigation needs. Hooked at the STREAM so pino's `redact` has already run — a call-site hook would see raw tokens. Never blocks, never throws, bounded at 500 rows between flushes with a `log_sink_dropped` row recording any gap. Hourly retention sweep. Read with `scripts/logs.mjs --around <iso> --window 10m`. |
| INFRA3 | Confirm the CI ≥2-web-machines assertion FAILS when one is stopped, not only when one is missing. | DONE — ran the guard's exact shell against four cases. `started,started` → passes. `started,stopped` → **count=2 notStarted=1, FAILS** (the case INFRA3 asked about). `started` alone → fails. Empty output → fails, so it cannot pass by scanning nothing. Proves the LOGIC, not flyctl's output shape. |
| INFRA4 | Correct `4312a5b`'s unmeasured "~40 ms" claim in PROGRESS.md — measure it or delete it. | DONE — retracted in place (`PROGRESS.md`) rather than deleted, so the history stays honest, and restated in `05-EVIDENCE.md` §6b. **Measuring it for real is blocked**: it needs either a forged signed webhook against a production write path (forbidden, L7) or log retention (INFRA2). |
| INFRA5 | Mark every latency and TTV figure captured before `d272222` as deploy-contaminated. | DONE — `05-EVIDENCE.md` §6b now lists the specific contaminated figures (the 5,911 ms p90, the 1,039→1,403 ms move, the 1-in-5 failure, the ttv-05 loss) and names the first CLEAN baseline: `d21b5bb`, max 1,189 ms. It was previously only in the north-star log and the prompt, not in the facts file anyone reads first. |
| INFRA8 | NEW, and a hole INFRA1 WIDENED — found by running INFRA1's own live proof. `deploy.yml` runs no tests. Before INFRA1 that was survivable, because `ci.yml` also deployed the commit after its tests went green; now the duplicate is skipped, so if the manual path wins the race it becomes the ONLY deploy and can ship a commit whose tests are still running or already red. Measured on the proof run: the manual path deployed at **15:56:46**, CI's test job confirmed the commit at **16:00:36** — four minutes of shipped-but-unverified. | DONE — `deploy.yml` now requires the `Lint · Test · Build` check to be `success`. Fails **open** on an unreadable status, deliberately: it is the REPAIR path, and refusing to deploy during an incident because a status API was slow is the wrong way to be wrong. A known-bad status still refuses; `force: true` bypasses. |
| INFRA6 | `fly secrets unset FEATURE_MAGIC_MOMENT`, then confirm deep health. | **BLOCKED by human** — local `flyctl` has no token (`Error: no access token available`) and `flyctl auth login` is interactive; an agent never types the owner's credentials. Also restarts machines, so it belongs at a phase boundary. Queued. |
| INFRA7 | Restore drill: latest dump into a NEW Neon branch (never production), `prisma migrate status`, count rows in `Shop` and `GeneratedContent`, record date + counts. | **BLOCKED by human** — no Neon credentials and no `DATABASE_URL` on this machine (checked: 0 matches in env). Needs the Neon console. Queued. |

---

---

## PHASE B — TRUST AND THE BADGE
**Gate:** a Built for Shopify audit with evidence per criterion, and no criterion failing for a
reason inside our control.

| ID | Owner | Item | Status |
|---|---|---|---|
| B1 | CC | Discoverable entry points for Collections, Jobs, Plans. Nav stays five items; add Home entries or a labelled secondary group. Say which and why. | OPEN |
| B2 | CC | Reorder Home: score → what we found → the one action that fixes the most. The ~200-word FAQ-schema setup block is premature (zero published content) and sits above everything; "Run audit" is last. | OPEN |
| B3 | CC | Collections: candidate count, filter, sort; stop instructing "generate for each" where 21 of 30 already have better copy; Enhance/Generate split (A4.3). | OPEN |
| B4 | CC | Empty collections: warn on the action, show the has-content indicator — do not block. Several empty brand collections carry deliberate hand-written copy. Exclude catch-all utility collections. | OPEN |
| B5 | CC | "Voice Override" on every collection row is undocumented. Say what it does, whether it is gated, selling point or dead weight. Then decide. | OPEN |
> **⚠ NAMING COLLISION — TWO SETS OF B-IDS EXIST. Recorded 2026-09-14 (P5.3) so the next session
> does not resolve it the other way.**
>
> The **B6** and **B7** in the table below are this file's own: the dev-store residue sweep (DONE) and
> the Built for Shopify audit (OPEN). The **Phase 4 brief** independently used **B6** for credit packs
> and **B7** for bring-your-own AI key. Four rows, two ids, two meanings, and nothing in either
> document said so.
>
> **The resolution, and it is settled:** the Phase 4 items were minted as **`C0.6`** (credit packs) and
> **`C0.7`** (BYO key) in the C0 block below. The rows in this table keep the ids they have had since
> Phase A. **Do not renumber either set** — `06-QUEUE.md`, `14-PRICING.md` §6 and three commit
> messages already reference C0.6 and C0.7 by name, and re-pointing B6/B7 would silently change what
> `G11` is blocked on (it is blocked on the **BFS audit**, not on a BYO key).

| B6 | CC | *(completed early, during Phase A — flagged not hidden)* Dev-store residue sweep. | DONE 2f8dd98 |
| B7 | CC + CW | Built for Shopify audit with evidence per criterion: App Bridge latest via **script tag** · perf p75 needs ≥100 calls (report whether we have them — under 100 is *ungraded*, not passing) · storefront Lighthouse impact of `navaal-geo-schema` as a number · Asset API · Polaris · no dark patterns. **CC audits the code; the dashboard reading is a CW task** — route it. | OPEN |
| B8 | CC | Contextual save bars — a named BFS requirement we do not use. Settings' bottom Save button means scrolling past six cards with no unsaved-changes indication. Audit every form. | OPEN |
| B9 | CC | Recount upsell surfaces against the budget of two. Six are visible today. | OPEN |
| B10 | CC | **Reachability sweep of every merchant-facing setting and action** (L15, extends A4.7). Not one guard for one boolean: a test that enumerates every setting the rules read and asserts each has a control on a reachable screen. Then prove three of them on a rendered page — that part is a CW task. | OPEN |
| B11 | CC | **Uninstall and reinstall is a first-class path.** What happens to a shop's content, quota and settings on `app/uninstalled` then reinstall? A merchant who reinstalls and finds their work gone leaves a one-star review. Prove it on a dev store. | OPEN |
| B12 | CC | **Error states are a product surface.** Every failure a merchant can hit — throttled, model down, quota gone, no Search Console, Shopify 5xx — says what happened, what it means and what they can do. Never a stack trace, never a silent zero (L5). Enumerate them; fix the ones that lie. | OPEN |

---

## PHASE C — PRICING. Decided in `04-DECISIONS.md`; implement as written.
**Gate:** a merchant can subscribe, be billed, upgrade and downgrade — proved end to end on a real
store, with the money appearing where it should.

| ID | Owner | Item | Status |
|---|---|---|---|
| C0.5 | CC | **B5 — the annual one-time 2× credit month.** | **DONE 2026-09-14, sha `71c7898`.** I routed this row and then built it — the bottleneck was the deploy queue, not capacity, so the honest thing was to finish it rather than leave it open. "Once, ever" is **structural**: an `updateMany` gated on `annualBoostMonth: null`, so the first writer wins and a redelivered webhook, a resubscribe, or an uninstall/reinstall all change nothing. The column is on `Shop`, which survives uninstall, while `Plan` is deleted. It stamps WHICH month rather than a boolean, so a merchant subscribing on the 28th gets one boosted month and not two. Only an annual key grants it, because `getPlanByKey` deliberately resolves both keys to the same plan. L1: 4 breaks, 4 red. |
| C0.6 | CC | **B6 — credit packs (1,000/$19 · 2,000/$39 · 4,000/$79).** **DETERMINED 2026-09-14 (P5.4): this app is on the Shopify BILLING API, not App/Managed Pricing. Packs are therefore a small feature, not a phase.** The question mattered because App Pricing does not support one-time purchases at all, and since **28 Apr 2026** sends no `APP_SUBSCRIPTIONS_UPDATE` webhook and no `charge_id` — on that path packs would have been a larger change than the other seven B items combined. **Six pieces of evidence, and the last two are the ones that settle it:** (1) `shopify.app.toml` declares **no `[app_pricing]` block** — the plans live in `app/utils/billing-plans.js`; (2) `app/shopify.server.js` passes a `billing:` config to `shopifyApp()`, which has meaning only for the Billing API; (3) `app.plans.jsx` calls `billing.request({ plan, isTest, trialDays })`, which issues `appSubscriptionCreate`; (4) `app.plans.jsx` overrides `trialDays: 0` per request — Managed Pricing has no such override; (5) **the app subscribes to `app_subscriptions/update` AND receives it**, which Managed Pricing has not sent since 28 Apr 2026 — the handler reads `sub.name` and `sub.id` and writes `shopifyChargeId`; (6) **production has `shopifyChargeId` populated on a real row** (`anyRowEverHeldACharge: 1`, read 2026-09-14 by `paid-plans-diag.mjs`), and Managed Pricing sends no `charge_id` at all. **What the build needs, confirmed present:** the installed `@shopify/shopify-api` exposes `BillingInterval.OneTime` and `appPurchaseOneTimeCreate` (`dist/cjs/lib/billing/request.js`), so the same `billing.request` path takes a one-time plan with no new dependency. **NOT STARTED — the P5.4 brief says determine, do not build.** The two requirements below are unchanged and are the whole risk: packs are consumed **after** the monthly allowance, never before, and a purchase must be **idempotent against webhook redelivery** — credits granted twice for one payment is the failure that ends the app's reputation. | OPEN — scoped, small |
| C0.7 | CC | **✅ DONE 2026-09-14 (P5.5). Code live at `0e52284`; the encryption secret installed and the feature ENABLED at `43f56a2`.** The decision was recorded in `04-DECISIONS.md` **before the code**, as the brief required: BYOK generations cost **zero credits** and are still **recorded** (a `UsageRecord` with `credits: 0`, the shape alt text already uses — so per-shop volume and `tokensUsed` stay observable without metering). **Crypto:** AES-256-GCM, random IV per write, auth tag stored, under its **own** secret, and **failing closed** without it — no fallback, no derived key, and a wrong-length value is treated as absent. **The leak rules are mechanical, not trusted, and break-tested red three ways:** no logger call in any key-touching file may name key material; no `.slice`/`.length` of a key; no `last4` or `keyPrefix` identifier **and no such column**; and the Settings loader cannot serialise one because `keyStatusFor` is the only reader and it returns four booleans and a timestamp. **Validated on save** with one real call to the cheapest model at `max_tokens: 1` — nothing is stored on any failure path, including "Anthropic unreachable"; a 429 is distinguished from a rejection so a working key is never called wrong. **A failing key PAUSES:** only **401/403** stamps it, and the next job refuses up front rather than silently continuing on our key and our money. An undecryptable row is treated identically. **Concurrency:** the key travels in **AsyncLocalStorage**, because the bulk processor runs generations concurrently and a module-level current-key could bill one shop's job to another shop's Anthropic account — the worst bug this feature could have. **Verified on the live Settings page at `43f56a2`:** the card renders for a Professional shop, the billing rule is stated on the card itself, the input is write-only (`type="password"`, nothing prefilled), and no key material appears anywhere on the page. **One hazard, routed to the owner:** rotating `BYOK_ENCRYPTION_KEY` destroys every stored merchant key; the init workflow refuses a second run unless an exact phrase is typed. **The requirements this was built against, kept verbatim so what was promised can be checked against what shipped — written when it did not exist:** Requirements that are not negotiable: the key is stored **encrypted** and **never logged, never returned to the client, never in an error message — not the key, not a prefix, not a length** (L9); it is **validated on save with one real cheap call**, because a key that fails at 2am mid-bulk-job is a support ticket and a refund; and if it fails mid-job the job **pauses and tells the merchant** rather than silently falling back to our key and our money. One decision to make and record in `04-DECISIONS.md` first: whether generations on a merchant's own key still consume credits for accounting. Pick one and make the UI say which. | DONE |
| C0.4 | CC | **Every page load throws ~12 uncaught `pageerror`s, and it is our own markup.** Found 2026-09-14 while capturing the rendered document for P0.4, from a real authenticated `/app` load on `contentpilot-dev2`: *"Unexpected tag <<div slot=\"logo\" style=\"padding:8px 16px\">..."*, repeated **11–12 times per load**. `app/routes/app.jsx:174` puts a `<div slot="logo">` inside `<s-app-nav>`, which is a Shopify **web component** and rejects an arbitrary `<div>` as a child. **Pre-existing** — present in both the before and after captures, so P0.4 did not cause it. Uncaught exceptions on every load are a quality signal a BFS reviewer can open the console and see, and the brand logo may not be rendering at all. Re-read it with `node tools/proof/appbridge-head.mjs`. **WIDENED 2026-09-14 (P5), and the new part is worse than the original.** A probe at a 375px viewport against production (`0e52284`) counted **80 `pageerror`s across two page loads**, and they are not all the `slot="logo"` one. Also present, and not previously recorded: **React #418 ("Hydration failed because the initial UI does not match what was rendered on the server") and React #423 ("There was an error while hydrating")**. A hydration mismatch makes React throw away the server-rendered HTML and re-render the whole subtree on the client — a visible flash, wasted work on the slowest devices, and **exactly the input to the one Built for Shopify criterion we are still failing**: H8 read `Interaction to Next Paint < 200 ms` as *"Not enough data"*, and INP is what a hydration re-render damages. Found while diagnosing three failing MOBILE listing frames, which turned out to be a harness bug rather than this; the app renders correctly at 375px (1,761 chars on /app). **NOT investigated further — it is outside P5's scope and it is a real finding, so it is written down rather than half-fixed.** First step for whoever takes it: the errors were captured with `page.on("pageerror")` at 375×812 on `contentpilot-dev2`; reproduce there before changing anything, because a hydration mismatch that only appears at one viewport usually points at a responsive branch that renders differently on server and client. | OPEN |
| C0.1 | CC | **Measure the real cost per generation**, per content type, and replace the `ASSUMED` figures in `08-ECONOMICS.md`. Keep the constant in ONE place. | **DONE 2026-09-14 (P0.6), sha 1573dc3.** Measured through the real code path on the production machine: alt text **$0.000906** · social **$0.002747** · collection **$0.005103** · enhance **$0.008498** · product **$0.0115** · blog **$0.0300**. The `ASSUMED ~$0.005` was wrong **in both directions** — understating product by 2.3× and blog by 6.0×, overstating alt text by 5×. A **33× spread**. One place: `app/utils/modelPricing.js`; **zero inline model IDs** remain in `ai.server.js` (was six). Measuring also found that `08-ECONOMICS.md` was **pricing plans that do not exist** — see C0.2/C0.3. |
| C0.2 | CC | Instrument actual monthly quota utilisation per plan cohort. — **RE-AIMED 2026-09-14.** The old text said *"alert if **Scale's** median sustained use passes break-even"*. **There is no Scale plan** — the billable plans are Free/Starter/Growth/**Pro** (`app/utils/billing-plans.js`). And at the measured costs the worst case on Pro is a **62.5% margin**, so this is no longer a solvency alarm: it is a **demand signal**. A Pro cohort living at its 1,000 ceiling says the plan is under-sized for them, which is a pricing opportunity being missed rather than a loss being taken. | OPEN |
| C0.3 | CC | The bring-your-own-key path. — **CORRECTED 2026-09-14 — this row described something that does not exist.** It said to offer BYOK *"one tier below **Enterprise**"*. There is **no Enterprise plan, no Scale plan and no merchant-key path anywhere in the code or the schema** — searched and confirmed. `08-ECONOMICS.md` had written it up as though it had shipped. If it is still wanted it is a **build, not a toggle**, and at the measured costs it is no longer needed as a margin unlock — it would be a *positioning* choice for merchants who want no cap. **Blocked on the OWNER pricing decision routed to `06-QUEUE.md`.** | BLOCKED |
| C1 | CC | Two-axis plan definitions in `billing-plans.js` (products AND generations). | OPEN |
| C2 | CC | Entitlements, `remainingGenerations`, `sliceToQuota`, product-cap checks in `plans.server.js`. | OPEN |
| C3 | CC | Rebuild the Plans page to the new table, annual default, 14-day trial. | OPEN |
| C4 | CC | Product-cap enforcement: **audit never capped, any plan, any size**; generation is what the cap limits; never block reviewing, publishing or restoring the merchant's own content. | OPEN |
| C5 | CC | Rollover one month, capped at one allowance. Gate-rejected generations never billed — explicit, tested, on the Plans page and the listing. | OPEN |
| C6 | CC | Add-on one-time purchases: generation packs, prompt packs, competitor slots. Done-for-you as a contact action, not self-serve. | OPEN |
| C7 | CC | BYO AI key, Enterprise: encrypted at rest, never logged, never returned to the client, validated on save, honest banner on failure, **never silently falls back to our key** (L9). Report how you stored it. | OPEN |
| C8 | CC | Verify against Shopify's **current** Billing API that 14 trial days, ANNUAL interval and one-time purchases work as specified. Read the docs; do not assume (L16). | OPEN |
| C9 | CC | Migration: grandfather existing shops at their current price for 12 months and tell them in-app what changed. Cheap now, impossible later. | OPEN |
| C10 | CC | Report 12-month gross margin per tier at realistic (burst-then-maintenance) utilisation. Flag any tier under 70%. | OPEN |
| C11 | OWNER | **Prove the billing chain with real money**: subscribe on a dev store, upgrade, downgrade, cancel, and confirm each appears in the Partner Dashboard. A billing bug found by a merchant is a one-star review. | OPEN |

---

## PHASE D — THE MOAT. This is the business.
**Gate:** a merchant sees, on their own store, a number that went up because of us — and can click
through to check it themselves.

| ID | Owner | Item | Status |
|---|---|---|---|
| D0 | CC | **Plan and cost estimate for all of D before writing feature code.** What each part needs from the merchant, what it needs from Google, cost per shop per month, and what it shows when there is not enough data yet. STOP and report. | OPEN |
| D1 | CC | Port the AI-visibility probe from `navaal-platform` (`apps/bilby-workers/lib/ai-visibility.cjs`, `apps/platform/lib/ai-visibility.ts`, plus its test). **Port, do not rewrite.** Add per-shop scoping · question seeding from the shop's own catalogue, merchant-editable (this is what makes the prompt-pack add-on sellable) · cadence by plan · **preserve the honest method label exactly** · surface `rivals` prominently, it is the pitch. Report actual cost per shop per month from the probe's own recorded cents. | OPEN |
| D2 | CC | Indexation proof: URL Inspection API + IndexNow. "38 of 40 indexed; these 2 are blocked and here is why." Binary, days not months. Starter+. | OPEN |
| D3 | CC | Rich-result eligibility for the FAQ schema we already emit. Instant, binary, and it gives the theme-embed step a visible payoff. | OPEN |
| D4 | CC | Search Console result proof: impressions, clicks, position for changed URLs, before vs after publish. Handle no property / unverified / domain mismatch / too little data honestly. Say the 2–3 day lag on screen. Growth+. | OPEN |
| D5 | CC | Control-group holdback: random 10%, visible and opt-out, held-back products clearly marked, refuses to report until both cohorts have data, merchant can end the experiment honestly. Scale+. | OPEN |
| D6 | CC | **The weekly report — the heartbeat and the anti-churn mechanism.** Send only when there is something to say · one email per week across the whole app · unsubscribe honoured immediately · every number links to the screen that proves it. Reuse `sendOperatorEmail` infrastructure, never its tone. | OPEN |
| D7 | — | NOT DOING: a keyword rank tracker. Search Console has position data. | CLOSED — do not reopen |
| D8 | CC | **The proof must survive a merchant asking "how do you know?"** Every claim in D links to its raw source: the probe run, the Search Console row, the index status. If we cannot show the working, we cannot charge a premium for proof. | OPEN |
| D9 | OWNER | Verify a Search Console property for a **merchant** store, not just navaal.ai, so D2/D4/D5 can be developed against real data (see H18 in `06-QUEUE.md`). | OPEN |

---

## PHASE E — REACH
**Gate:** multi-language, B2B and Markets each either work, or refuse honestly and say so in the
app and on the listing. Silence is the only unacceptable answer.

| ID | Owner | Item | Status |
|---|---|---|---|
| E1 | CC | Non-English: extend generation and the gate to the languages we support with both-directions tests per language, **or** state the supported languages in the app AND the listing and refuse gracefully. Handle one catalogue in several languages via Translations. Scale+. | OPEN |
| E2 | CC | B2B / wholesale: detect B2B context (company accounts, publication scope, catalogues off the Online Store channel). Exclude unpublished products (A1.3); do not write consumer-voice copy for trade-only products. Report what Shopify actually exposes. | OPEN |
| E3 | CC | Markets, multiple storefronts, expansion stores. Never blend markets into one store score. | OPEN |
| E4 | CC | Enterprise operations: activity **audit trail**, one-action **bulk undo**, safe concurrent staff use. | OPEN |

---

## PHASE G — INSTALLS AND REVIEWS. Gate 1 of the ladder.
**Gate:** 50 net installs from shops on **paid** Shopify plans · 5 reviews · rating ≥4.9 · perf p75
graded over ≥100 calls.

Nothing in phases A–F produces a single install. This phase is the one that decides whether any of
it earns money, and most of it is **not** CC's to do — which is exactly why every row has an owner.

| ID | Owner | Item | Status |
|---|---|---|---|
| G1 | COWORK | **Rewrite the App Store listing** on the current product: the five live bullets omit every Phase 4 capability, and the Professional tier still promises "Dedicated account manager" and "SLA support", which `04-DECISIONS.md` forbids by name. Draft; the upload is a CW task. | OPEN |
| G2 | CW | Upload the rewritten listing: bullets, description, pricing display, and the re-captured screenshots. Read it back on a fresh load. | BLOCKED by H14 |
| G3 | COWORK | **The positioning line, everywhere the same.** We are the only app that does both halves: generate → publish → prove the citation lift → regenerate what did not land. One sentence, used on the listing, the site, the emails and the first screen. | OPEN |
| G4 | CC | **The first-run path is the review.** A merchant must reach one visibly correct result before they decide what they think of us. Measure it: install → first proposal → first publish. `ttv-report.mjs` exists and the cohort is empty. | OPEN |
| G5 | OWNER | Five fresh dev-store installs, ≥10 products each, let the Start state run — populates the TTV cohort and unblocks the acceptance recording. | OPEN |
| G6 | OWNER | Screen-record ONE install, URL bar visible, grant → first proposal, under 120 seconds. | BLOCKED by G5 |
| G7 | COWORK | **The review-request moment**, designed: ask once, after a merchant has seen a result that worked, never before. Never a dark pattern, never a nag. At 0 reviews the first five are the hardest and the most valuable. | OPEN |
| G8 | CC | Implement G7's ask, gated on a real success signal, once per shop, dismissible forever. | BLOCKED by G7 |
| G9 | COWORK | **Install attribution end to end.** `/go?ref=` handles are placed on 67 static pages, 28 blog posts, home and tools. Still unplaced: `bilby-footer`, `bilby-report` (they live in `navaal-platform`, edited via `packages/tokens/footer.html`). Then: which ref actually converts? | OPEN |
| G10 | COWORK | Launch surfaces that cost nothing and are ours: the navaal.ai blog, the tools pages, Bilby's audience. Write the three posts that a merchant searching for this problem would find. | OPEN |
| G11 | OWNER | Submit for Built for Shopify once B7 says every criterion we control passes. | BLOCKED by B7 |
| G12 | COWORK | **A one-page "why we are different" comparison** against the two apps that overlap us — IndexGPT ($45, tracking only, thin generation) and CartRank ($99, tracking only, zero reviews). Honest, checkable, no strawmen. | OPEN |

---

## PHASE R — IT KEEPS WORKING, AND THEY STAY
**Gate:** churn instrumented and ≤2% · an on-call story that survives the owner being asleep ·
support that does not need a human per merchant.

| ID | Owner | Item | Status |
|---|---|---|---|
| R1 | CC | **Instrument churn.** Install → paid → cancelled, with the reason where we can get it, and cohort by month. `05-EVIDENCE.md` §3 says halving churn is worth more than any price rise; today we cannot measure it at all. | OPEN |
| R2 | CC | Define and measure three SLOs a merchant would notice: first-proposal latency, bulk-job completion, and the app's own uptime. Alert on the ones that matter, not on CPU. | OPEN |
| R3 | CC | The incident story: `LogEvent` retention shipped (INFRA2) — now make it usable. One command that answers "what happened to shop X at time T". | OPEN |
| R4 | COWORK | Support that scales: the eight questions a merchant will actually ask, answered in-app at the moment they would ask them. Deflection beats a help desk. | OPEN |
| R5 | CC | **A merchant can leave with their work.** Export everything we generated for them, in a form they can use without us. It is the right thing, it is a listing line, and it removes the fear that blocks the first purchase. | OPEN |
| R6 | OWNER | Decide the alert-contact route so alerts do not go to one inbox (see H2/H16 in `06-QUEUE.md` — those are queue IDs, not phase IDs). | OPEN |

---

## PHASE F — THE FIXTURE MATRIX. Continuous, not sequential.

| ID | Owner | Item | Status |
|---|---|---|---|
| F1 | CC | Store-shape fixture matrix over every axis in `05-EVIDENCE.md` §4. Report per phase which cells you proved and which you did not. **A cell you did not test is a defect you have not found yet.** | OPEN |
| F2 | CC | One real dev store per shape that matters most: all-draft · variant-heavy · non-English · B2B-only · catalogue above the plan cap. Fixtures model reality; a real store *is* reality. | OPEN |
| F3 | CC | **GTIN is read on the first variant only** (`variants(first: 1)` to stay under the 1,000-point query cap at 100 products a page). A multi-variant product whose barcodes live on later variants is graded "no barcode" wrongly. Fix: a second, cheaper pass for multi-variant products flagged gtin, or `variantsCount` + a sampled read. | **CLOSED 2026-09-14 (Phase 9 Part B, `d7ff839`)** |
| F4 | CC | The production script's cross-shop `acrossShops.sinceYesterday` is computed without each shop's first-walk grace, so it reads as "everything is new" on a first day. Per-shop Home is correct. Pass `firstWalkAt` per shop or drop the aggregate. | **CLOSED 2026-09-14 (Phase 9 Part B, `d7ff839`)** |
| F5 | CC | `Product.featuredImage` is deprecated in favour of `featuredMedia`; the watch query still uses it (validated, working). Migrate before Shopify removes it. | **CLOSED 2026-09-14 (Phase 9 Part B, `d7ff839`)** |
| F6 | CC | Indexability samples 20 pages a night; a 5,000-product store takes 250 nights to cover. Consider a per-plan sample size or prioritising products with attention. | **CLOSED 2026-09-14 (Phase 9 Part B, `d7ff839`)** |
| F7 | CW | The first-run screen can now be captured on a dev store: the **First-run reset** workflow nulls `firstDraftSeenAt` for one named dev store (never a merchant; name-pattern guard). Frame 04. | OPEN |
| F8 | CC | **Old Plan rows carry the pre-B2 allowance.** `navaal-ttv-02` Home reads *"3 / 25 used · 22 of 25 left this month"* on Free, while the locked table (H12) says Free is 100 credits. Existing `Plan.monthlyCredits` was never re-based when B2 changed the tiers; every install older than B2 shows and enforces the old number. Needs a one-time re-base migration (data, additive) and a guard that `monthlyCredits` for a plan name equals the locked table. | OPEN |
| F9 | OWNER | **P3.4 is blocked on P0.10** — Shopify Level 2 protected customer data approval (+ `read_reports`). The classification and labelling are built and tested; the query is one loader once the approval lands. Start the application; it is a review cycle. | OPEN |
| F10 | OWNER | **The first crawl-time result needs a Bing key on a public storefront.** All dev stores are password-protected. Steps in `OWNER-CHECKLIST.md` (Phase 8 Part C): remove the password on one `navaal-ttv-*` store, verify it in Bing Webmaster Tools, paste the key in Settings, switch measurement on, set `REMEDIATION_LOCKED_SHOPS` from a file. Then publish content for ≥10 products and the Crawl holdout workflow shows both arms within 72 h. | OPEN |
| F11 | CC | **P3.5 shared-corpus prompt sampling — scoped, not started** (the brief: only if the two gates above are live with a result; F10 gates it). Design in `09-DOCTRINE.md` §3: ~50 prompts × 4 engines × 7 runs/day per vertical, fanned out per merchant; cited separated from mentioned; interval always shown; n=1 view labelled as one observation and never trended. Needs: a vertical taxonomy per shop, an engine runner with cost caps, a corpus store, and a screen that carries the method. | OPEN |
| F12 | CC | **Weekly report is proof-gated only.** It sends only in a week where a crawl batch reported. Once P2's attention diffs are a week old, consider "what changed this week" as a second true thing to say — still one email a week, still nothing in a quiet week. | OPEN |
| F13 | OWNER→CC | **The storefront Lighthouse number for `navaal-geo-schema`** (BFS criterion 3). The harness `tools/proof/lighthouse-embed.mjs` is ready (17/40/43, refuses a password page). It runs the day one `navaal-ttv-*` storefront is public (F10) or a `storefront_digest` cookie is supplied; CC records both runs and the delta in `BFS-AUDIT.md`. | OPEN |
