# BACKLOG — the single source of truth for WHAT IS LEFT

Status values: `OPEN` · `IN PROGRESS` · `DONE <sha>` · `VERIFIED <sha>` · `BLOCKED <by>`

**This file is authoritative for WHAT, not for STATUS.** At the start of every session,
reconcile status against the code and `PROGRESS.md`, and say what you corrected (Protocol §1).

Phases are strictly ordered. Never start a later phase while an earlier one has OPEN items.

---

## PHASE A — DEFECTS. Nothing new ships on top until A closes.

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
| A4.8 | NEW (from A4.6). Voice inference reads products and collections. **Pages and blog copy are still unread** — `collections` rode the existing scan for free, but Pages and Articles are separate connections and would each cost a request on the dashboard's hot path. Decide: fold them into a cached lower-frequency scan, or state that we learn from products and collections only. | OPEN |
| A4.9 | NEW (from A4.6). Show the Agena meta description before/after with the inferred voice applied. Needs a real generation against a real catalogue — a model call, not a code change. Cannot be done from this repo without spending model budget and a store to run it on. | BLOCKED by H3 (fresh dev-store installs) |
| A4.7 | NEW (found in A1.2 reconcile). A setting can ship with a column, a read path and a green suite and still be unreachable. Add a guard that every `BrandVoice` boolean a rule reads has a control in Settings AND a hidden input that posts it — a Polaris Checkbox is not a form field. `includeDraftProducts` was unreachable for one commit; `autopilotAutoPublish` and `autopilotContentTypes` are unaudited. | OPEN |
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
| A7.1 | Deploy Phase A. Confirm `/api/health?deep=1` ok on the new SHA. | OPEN |

---

## PHASE INFRA — carry alongside A. These are cheap and they unblock other work.

| ID | Item | Status |
|---|---|---|
| INFRA1 | Deduplicate deploys. `ci.yml` on push + `deploy.yml` on dispatch; `concurrency` serialises without deduping, so one commit shipped as v176 and v177. A duplicate deploy of an already-deployed SHA is a no-op, or remove one path. Prove: dispatch during a push, show one version. | OPEN |
| INFRA2 | **Log retention.** ~100 lines today, so no incident is traceable after minutes. Ship durable log shipping, ≥30 days. State the retention achieved. Blocks A6.6 and every future "could not reproduce". | OPEN |
| INFRA3 | Confirm the CI ≥2-web-machines assertion FAILS when one is stopped, not only when one is missing. | OPEN |
| INFRA4 | Correct `4312a5b`'s unmeasured "~40 ms" claim in PROGRESS.md — measure it or delete it. | OPEN |
| INFRA5 | Mark every latency and TTV figure captured before `d272222` as deploy-contaminated. | OPEN |
| INFRA6 | `fly secrets unset FEATURE_MAGIC_MOMENT`, then confirm deep health. | OPEN |
| INFRA7 | Restore drill: latest dump into a NEW Neon branch (never production), `prisma migrate status`, count rows in `Shop` and `GeneratedContent`, record date + counts. | OPEN |

---

## PHASE B — TRUST AND THE BADGE

| ID | Item | Status |
|---|---|---|
| B1 | Discoverable entry points for Collections, Jobs, Plans. Nav stays five items; add Home entries or a labelled secondary group. Say which and why. | OPEN |
| B2 | Reorder Home: score → what we found → the one action that fixes the most. The ~200-word FAQ-schema setup block is premature (zero published content) and sits above everything; "Run audit" is last. | OPEN |
| B3 | Collections: candidate count, filter, sort; stop instructing "generate for each" where 21 of 30 already have better copy; Enhance/Generate split (A4.3). | OPEN |
| B4 | Empty collections: warn on the action, show the has-content indicator — do not block. Several empty brand collections carry deliberate hand-written copy. Exclude catch-all utility collections. | OPEN |
| B5 | "Voice Override" on every collection row is undocumented. Say what it does, whether it is gated, selling point or dead weight. Then decide. | OPEN |
| B6 | *(completed early, during Phase A — flagged not hidden)* Dev-store residue sweep: snowboard, ski, snow, wax and every Shopify demo example. Test that fails on those strings in user-facing copy. | DONE 2f8dd98 — done OUT OF PHASE ORDER while in Phase A; flagged rather than hidden. |
| B7 | Built for Shopify audit with evidence per criterion: App Bridge latest via **script tag** · perf p75 needs ≥100 calls (report whether we have them — under 100 is *ungraded*, not passing) · storefront Lighthouse impact of `navaal-geo-schema` as a number · Asset API (confirm untouched or quote the SEO-tool exception) · Polaris · no dark patterns (A3.1 currently fails). | OPEN |
| B8 | Contextual save bars — a named BFS requirement we do not use. Settings' bottom Save button means scrolling past six cards with no unsaved-changes indication. Audit every form. | OPEN |
| B9 | Recount upsell surfaces against the Phase 3.4 budget of two. Six are visible today. | OPEN |

---

## PHASE C — PRICING. Decided. Implement as written in `04-DECISIONS.md`.

| ID | Item | Status |
|---|---|---|
| C1 | Two-axis plan definitions in `billing-plans.js` (products AND generations). | OPEN |
| C2 | Entitlements, `remainingGenerations`, `sliceToQuota`, product-cap checks in `plans.server.js`. | OPEN |
| C3 | Rebuild the Plans page to the new table, annual default, 14-day trial. | OPEN |
| C4 | Product-cap enforcement: **audit never capped, any plan, any size**; generation is what the cap limits; never block reviewing, publishing or restoring the merchant's own content. | OPEN |
| C5 | Rollover one month, capped at one allowance. Gate-rejected generations never billed (explicit, tested, on the Plans page and the listing). | OPEN |
| C6 | Add-on one-time purchases: generation packs, prompt packs, competitor slots. Done-for-you as a contact action, not self-serve. | OPEN |
| C7 | BYO AI key, Enterprise only: encrypted at rest, never logged, never returned to the client, validated on save, honest banner on failure, **never silently falls back to our key**. Report how you stored it. | OPEN |
| C8 | Verify against Shopify's current Billing API that 14 trial days, ANNUAL interval and one-time purchases all work as specified. Do not assume. | OPEN |
| C9 | Migration: grandfather existing shops at their current price for 12 months, tell them in-app what changed. Cheap now, impossible later. | OPEN |
| C10 | Report 12-month gross margin per tier at realistic (burst-then-maintenance) utilisation. Flag any tier under 70%. | OPEN |

---

## PHASE D — THE MOAT. This is the business.

| ID | Item | Status |
|---|---|---|
| D0 | **Plan and cost estimate for all of D before writing feature code.** What each part needs from the merchant, from Google, cost per shop per month, and what it shows when there is not enough data yet. STOP and report. | OPEN |
| D1 | Port the AI-visibility probe from `navaal-platform` (`apps/bilby-workers/lib/ai-visibility.cjs` 185 lines, `apps/platform/lib/ai-visibility.ts` 41 lines, plus its test). **Port, do not rewrite.** Add: per-shop scoping · question seeding from the shop's own catalogue (merchant-editable — this is also what makes the prompt-pack add-on sellable) · cadence by plan · **preserve the honest method label exactly** · surface the `rivals` field prominently, it is the pitch. Report actual cost per shop per month. | OPEN |
| D2 | Indexation proof: URL Inspection API + IndexNow. "38 of 40 indexed; these 2 are blocked and here is why." Binary, days not months. Starter+. | OPEN |
| D3 | Rich-result eligibility for the FAQ schema we already emit. Instant, binary, and it gives the theme-embed step a visible payoff. | OPEN |
| D4 | Search Console result proof: impressions, clicks, position for changed URLs, before vs after publish. Handle no property / unverified / domain mismatch / too little data honestly. Say the 2–3 day lag on screen. Growth+. | OPEN |
| D5 | Control-group holdback: random 10%, visible and opt-out, held-back products clearly marked, refuses to report until both cohorts have data, merchant can end the experiment honestly. Scale+. | OPEN |
| D6 | **The weekly report — the heartbeat and the anti-churn mechanism.** Send only when there is something to say · one email per week across the whole app · unsubscribe honoured immediately · every number links to the screen that proves it. Reuse `sendOperatorEmail` infrastructure, never its tone. | OPEN |
| D7 | NOT DOING: a keyword rank tracker. Use Search Console's own position data. | CLOSED — do not reopen |

---

## PHASE E — REACH

| ID | Item | Status |
|---|---|---|
| E1 | Non-English: either extend generation and the gate to the languages we support with both-directions tests per language, or state the supported languages in the app AND the listing and refuse gracefully. Silence is the only unacceptable answer. Handle one catalogue in several languages via Translations. Scale+. | OPEN |
| E2 | B2B / wholesale: detect B2B context (company accounts, publication scope, catalogues off the Online Store channel). Exclude unpublished products (A1.3); do not write consumer-voice copy for trade-only products. Report what Shopify actually exposes. | OPEN |
| E3 | Markets, multiple storefronts, expansion stores. Never blend markets into one store score. | OPEN |
| E4 | Enterprise operations: activity **audit trail** (say whether the Activity screen is one or just a feed), one-action **bulk undo**, safe concurrent staff use. | OPEN |

---

## PHASE F — THE FIXTURE MATRIX. Build as you go; it is a deliverable.

| ID | Item | Status |
|---|---|---|
| F1 | Store-shape fixture matrix over every axis in `05-EVIDENCE.md` §4. Report per phase which cells you proved and which you did not. A cell you did not test is a defect you have not found yet. | OPEN |
