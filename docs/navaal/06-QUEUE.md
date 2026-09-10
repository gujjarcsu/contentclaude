# QUEUE — every task this session could not do, routed to whoever can

**Nothing parks here. Everything here has an owner** (L17). A row without an owner is a bug in
this file.

| Owner | Who | Reads this via |
|---|---|---|
| **CW** | Cowork with the owner's browser and computer | `CW-BRIEF.md` — one paste-ready prompt with every pending CW task |
| **OWNER** | Waqas, in person: logins, money, recordings, decisions | `OWNER-CHECKLIST.md` |
| **COWORK** | The planning session: research, strategy, copy, navaal.ai | picked up in conversation |
| **CC** | Claude Code, next session | the backlog and this file at orient |

## HOW TO ADD — read before appending
Two sessions once both appended `H13`. A read at orient time is **not a lock**; assume another
session is editing this file right now.

- **Sessions append to INBOX below, as plain bullets, with NO ID**, tagged with an owner.
- IDs are assigned only during orient, by whichever session reconciles first.
- **IDs are immutable. Never renumber an existing row** — anything may reference one.
- If two rows somehow share an ID, the later gets a letter suffix (`H13a`). Never shift the others.
- Every entry gives: the owner · why it matters and what it unblocks · the exact click path, URL or
  command · what "done" looks like on a fresh page load · what to paste back.
- A brief its owner has to ask a question about is not finished. Write it for a stranger.

**Phase R item IDs in `02-BACKLOG.md` are `R1..R6`, not `H1..H6`.** The `H` space belongs to this
file alone.

Status: `OPEN` · `DONE <date, how confirmed>`

---

## INBOX — unnumbered, append here

- **OWNER — complete the Partner Dashboard account selection (one click, probably).** Blocks H7's upload,
  H10, H11 and H15. Every browser path on this computer lands on `accounts.shopify.com/select` with the
  title *"Log in — Partners"* — an account CHOOSER, not a password prompt, so the session exists but the
  Partners surface needs an explicit account pick. Open `https://partners.shopify.com/4937813/apps` in
  Chrome, choose the Waqas Ahmad account, and leave the tab signed in. Done looks like: that URL loads the
  app list without redirecting.
- **OWNER — H15 is the urgent one and it is still live.** The public listing promises *"Dedicated account
  manager"* and *"SLA support"* right now. `04-DECISIONS.md` forbids both by name — *"at 0 reviews one unmet
  promise halves the rating."* The approved replacement wording is already written in `12-OFFER.md`. This
  needs sixty seconds once the dashboard opens.
- **OWNER — no dev store has a realistic catalogue, which blocks every future listing screenshot.**
  `navaal-ttv-01` (the store the brief nominated) is Shopify's demo catalogue: snowboards, ski wax, a gift
  card. Capturing there is what produced the screenshots we are trying to replace. Either stock one dev
  store with ~15 plausible products of any ordinary kind, or say which store CW may use. Done looks like: a
  named store whose product list contains no Shopify demo names.
- **CW — the app's isbot filter makes any harness without a real browser user-agent look like an outage.**
  A Playwright context with the default UA gets **410** and renders **8 characters**, which is
  indistinguishable from "production is broken" — I concluded exactly that for several minutes today
  before the known-good harness read the same page fine. `tools/proof/read-screen.mjs` sets a Chrome UA;
  anything new must too. Worth a line in `07-VERIFICATION.md`.

- **CC / COWORK — what Shopify's Agentic channel already reports, read 2026-09-11 on `contentpilot-dev2`.**
  Screenshot: `docs/history/screen-reads/agentic-link0.png`. It is at `/store/<store>/apps/agentic` (an
  embedded app, not `/channels/agentic` — that URL 404s). Verbatim, it shows:
  **four channels with a binary status** — ChatGPT, Microsoft Copilot, Other channels, Shop, every one
  *"Status: Inactive"* · a master toggle *"Allow Shopify to manage for me"* · **Sources**: *"Shopify
  Catalog — 0 products in Catalog"* and *"Knowledge Base — Install"* (not installed) · a two-step
  readiness list, *"Make sure catalog access is enabled — Completed"* and *"Update policies — Not
  started"* · and the banner *"Agentic Storefronts aren't live — but your products may still be
  surfacing in AI agents."*
  **It reports NOTHING per product.** No per-product eligibility, no data-completeness detail, no feed
  errors, no reason codes. The only product-level number is a single aggregate: `0 products in Catalog`
  — on a store that has 17 products — and Shopify does not say which products or why.
  **Honest read:** the gap is real, but it is narrower and later than assumed. A merchant would still
  need us to answer *"why is that number 0, and which products?"*. But Agentic Storefronts are **not
  live yet**, and Shopify may add per-product reasons when they launch — so building full per-product
  eligibility now risks duplicating a feature that ships free. The defensible slice today is the
  diagnostic Shopify does not give: *why is your catalog count 0, and which products are excluded.*

- **ALL — the plan was rewritten 2026-09-10 (revision 2). Re-read at orient.** New authoritative files: **`09-DOCTRINE.md`** (what we sell and what we refuse to say, with the evidence), **`10-MARKET.md`** (the market and platform, verified from live sources that day), and **`11-MASTERPLAN.md`** (the plan, which now outranks `02-BACKLOG.md` for phases and order). `README.md` carries the order of authority. `04-DECISIONS.md` is **partly superseded** — llms.txt, "instant indexing" and small-catalogue A/B claims are now banned; reconciling it is P0.11. Three things changed materially: eligibility is **monitoring**, not a one-time audit; proof ships on **Bing/IndexNow first** because it needs no approvals and reads out in 72 hours; and **billing, cost-per-generation and two calendar-bound approvals moved to Phase 0**.

- **COWORK — run the eligibility base-rate study (W1) before any Phase 2 code.** 300–500 public Shopify storefronts: robots.txt agent by agent, attribute completeness from public product JSON, canonical sanity, policy pages. **Count the fraction with at least one actionable finding.** Kill criterion: **below 40% and Pillar 1 is a feature, not a product.** Two days of work that either validates or kills the phase — and the aggregate is publishable on navaal.ai, which Shopify says is an App Store ranking lever.

- **CC — the guiding folder was rebuilt 2026-09-10 by Cowork. Re-read it at orient; do not work from memory of the old shape.** What changed: files are now TIERED (CORE read every session, REFERENCE read on a trigger — see `README.md`) · every backlog item and queue row has an OWNER (`CC`/`CW`/`COWORK`/`OWNER`) · four new laws, **L16** whole-file reads, **L17** route don't park, **L18** teach the system, **L19** not live is not done · two new reference files, `07-VERIFICATION.md` (the proof each claim class needs) and `08-ECONOMICS.md` (the unit economics the product must not break) · two new phases, **G** installs and reviews and **R** reliability and retention — nothing in A–F produces a single install · Phase R items are `R1..R6` so they cannot collide with this file's `H` space · `06-HUMAN-QUEUE.md` is now `06-QUEUE.md` · the protocol is a LOOP with four stop conditions, and ends by regenerating `CW-BRIEF.md` and `OWNER-CHECKLIST.md`.

- **RESOLVED 2026-09-10 by Cowork — the file is now `06-QUEUE.md`.** CC was right: L17 and two README lines pointed at a filename that did not exist. Renamed rather than re-pointed, because `06-QUEUE.md` is the better name: this queue is no longer humans-only, it routes to CW and CC as well.

- **OWNER — Log in `flyctl` on this computer** (blocks INFRA6, and every local `fly` command). Run
  `flyctl auth login` in a terminal and complete the browser flow. Why: the local token expired
  mid-session on 2026-09-10 — `fly status -a contentclaude` returns `Error: no access token
  available`. An agent cannot do this: the flow is interactive and an agent never types the owner's
  credentials. CI is unaffected (it uses the `FLY_API_TOKEN` secret), so deploys still work; only
  local inspection is blocked. Done looks like: `fly status -a contentclaude` lists four machines.
- **OWNER — Then run INFRA6:** `fly secrets unset FEATURE_MAGIC_MOMENT -a contentclaude`, then
  `curl -s "https://app.navaal.ai/api/health?deep=1"` and confirm `status: ok`. Why: the flag is dead
  and `unset` is correct because removal passes no value. Note it RESTARTS the machines, so do it when
  a deploy would be acceptable. Done looks like: deep health `ok` and `fly secrets list` no longer
  shows the name.
- **OWNER — Run the restore drill (INFRA7)** in the Neon console: restore the latest state into a **NEW
  branch**, never production. Then against that branch run `npx prisma migrate status` and count rows
  in `Shop` and `GeneratedContent`. Why: the runbook promises a restore path nobody has ever
  exercised, and Neon retention was 6 hours until 2026-09-10 — the promise was false the whole time it
  was written. An agent has no Neon credentials here (0 matches for `DATABASE_URL` in env). Done looks
  like: the date, the branch name and the two row counts recorded in PROGRESS.md.
- **CC (next session) — Read the durable log once, to confirm it is really writing** (INFRA2's live half). After the next
  deploy: `fly ssh console --app contentclaude -C "node /app/scripts/logs.mjs --since 2h"`. Why: the
  sink is proved by unit tests with Prisma mocked — that proves what we hand Prisma, not that the
  table accepts it. Done looks like: at least one row, and `--event log_retention_swept` returning
  nothing yet (the sweep only logs when it actually deletes something).

- **CC (next session) — Verify the "partial run" banner on a rendered page (L15).** After the Phase A deploy, start a bulk
  run on a store with more than 20,000 products — or temporarily set `ENUM_MAX_PAGES` low on a dev
  store — and confirm the warning banner **"This run covers part of your catalog"** actually appears
  on `/app/jobs`. Why: the note travels in a URL query param (`/app/jobs?partial=...`) because a
  redirect discards an action's return value, and it is proved only by source assertions. A banner
  that never renders is the exact L15 failure class. Done looks like: the banner visible above the
  job list, wording readable, and it does NOT appear on a run that covered the whole catalogue.

- **COWORK — `12-OFFER.md` §4 mislabels its own App details paragraph.** The heading says **478/500**; the paragraph is **449** characters, counted from the file. 29 out. Harmless against the 500 limit, but the character counts in §4 are what we trust instead of re-counting, so fix the label. (Every other §4 count matched exactly: intro 86, bullets 58/69/74/60/63.)
- **COWORK — a pricing-plan feature line cannot hold §6's approved SLA replacement.** The field is `maxlength 40`. "Every question answered within one business day" is 47. Published "Questions answered within 1 business day" (exactly 40) instead. §6 should carry a 40-character variant so nobody has to improvise this again.
- **OWNER — one Professional feature slot is wasted.** The five slots are `1000 AI content generations/month`, `7-day free trial`, `Direct access to the founder`, `Custom onboarding`, `Questions answered within 1 business day`. Shopify **already prints "7-day trial" in the plan header**, so that line buys nothing and it is the slot "Setup call when you start" would go in. Say the word and I swap it.
- **OWNER — possible over-claim on a discovery surface.** Under *App category details -> How can merchants monitor performance*, three tags are selected: `SEO score`, `Audits`, **`Analytics`**. `12-OFFER.md` §2 lists AI traffic reporting and Search Console proof as **not built**. `Analytics` is defensible if it means the before/after scores, and it is discovery surface we would lose — so I did not touch it. Your call.
- **COWORK — the App card subtitle is flagged by Shopify and has no approved replacement.** The field carries the notice *"Review the updated guidance for this field and refresh your content."* Current text, 62/62: *"Content Google ranks and ChatGPT quotes — you approve it first"*. It names a third-party AI brand and predates §4. **§4 does not specify a subtitle**, so there was nothing approved to publish. This is the app card in every search result — it needs 62 approved characters.
- **OWNER / CC — nine optional listing fields are empty and none can be filled truthfully today:** Demo store URL · Integrations · Support portal URL · Support phone number · pricing-information URL · Google conversion ID · Facebook Pixel ID · Facebook Access Token · (Google Analytics ID and secret ARE set). `https://navaal.ai/pricing` returns **404** (checked), so the pricing URL has nothing to point at; the demo store would have to be a password-free store we own. I filled none rather than inventing.
- **CW — the six URLs already on the listing all resolve.** HTTP 200 each: `navaal.ai`, `/privacy`, `/support`, `/changelog`, `/docs`, `/docs/getting-started`. Checked 2026-09-10 with `curl -L`.
- **CW — "Merchant must have online store" was already ticked.** The *My app requires -> Shopify Online Store* checkbox read `true` before I changed anything. No change made; this is a no-change finding, not work done.
- **CW — a screenshot alt text still describes the pre-Phase-2 app.** `"One-click Optimize Store bulk generation screen"` is live on the public page. Not false, just stale — H7 replaces it.
- **CW — the Agentic INBOX entry above is dated `2026-09-11`, but the device clock and this session both read 2026-09-10.** One of the two is wrong; worth knowing before anyone reasons about the webhook 7-day window from these dates.

## OPEN

| ID | Owner | Task | Why | Done looks like |
|---|---|---|---|---|
| H2 | **CW** | Add `hello@navaal.ai` as a second UptimeRobot alert contact | Alerts go only to one inbox today | Both monitors list both contacts, read back on a fresh page load |
| H3 | **CC** | Five fresh dev-store installs, >=10 products each, let the Start state run | **Cohort complete 2026-09-10.** navaal-ttv-01..05 created with 17 products each (verified per store). Installed from the App Store listing: TTV 02, 03, 04, 05 earlier in the day; **TTV 01 (renamed Harbourline Goods) installed 15:56:34 UTC** — grant to all three drafts complete in **under 18 seconds**, store scored 34/100 (GEO 43, Traditional SEO 25), 3 drafts written. TTV 04 was later uninstalled for the webhook test, so the live cohort is 4 of the 5. **Still needs `ttv-report.mjs` run via `fly ssh` (Claude Code) to produce median/p90** | `ttv-report.mjs` shows populated median and p90 |
| H4 | **OWNER** | Screen-record ONE of those installs, URL bar visible, grant → first proposal | The 120-second acceptance recording | A single video under 120s |
| H5 | **OWNER** | Drive a dev store 0 → 20 → 25 generations, URL bar visible | Quota-surface acceptance: nothing below 20, one banner from 20, actions replaced at 25 | Recording + banner stays dismissed on reload and another device |
| H6 | **OWNER** | Upgrade from the 100% card → Approve → land back in-admin | Billing attribution chain | `diag-shop.cjs` shows `upgradePromptSource: "quota100"` |
| H7 | **CW** | Upload the re-captured listing screenshots + new captions | **BLOCKED 2026-09-11 for a reason the brief did not anticipate: `navaal-ttv-01` is stocked with Shopify's DEMO CATALOGUE.** Its numbers match the brief exactly (17 products, 3 drafts, score 34/100), but the products are, verbatim: *Gift Card* · *Selling Plans Ski Wax* · *The 3p Fulfilled Snowboard* · *The Archived Snowboard* · *The Collection Snowboard: Hydrogen*. Capturing there would put snowboards on the public listing — the exact dev-store residue L12 forbids and the reason the CURRENT screenshots were condemned. **7 of 8 frames tripped the banned-word check**; only Settings passed, because it shows no product names. The upload half is separately blocked by the Partner Dashboard wall above. **Needs: a dev store with a plausible non-demo catalogue.** | Five desktop and three mobile live, from a store that does not look like a sandbox. |
| H8 | **CW** | Read the **Built for Shopify** status page | **Partially done 2026-09-10** — signed in and read every underlying number (see DONE row). But **no Built for Shopify section is exposed anywhere**: not in the Dev Dashboard nav (Monitoring / Logs / Versions / App settings), not on the Partner app overview, not on Distribution → App Store. Almost certainly because the app is far below the 50-install eligibility bar. **Re-check once net installs approach 50** | The BFS scorecard itself, with per-criterion states |
| H10 | **CW** | Webhook reliability readings | **BLOCKED 2026-09-11 — the Partner Dashboard is not reachable from this computer.** Three independent attempts, all landing on a login wall: (1) the MCP-controlled Chrome → `accounts.shopify.com/lookup`; (2) Playwright with the stored session → `accounts.shopify.com/select`; (3) CDP into the Chrome a human logged into on port 9333 → `accounts.shopify.com/select`, page title *"Log in — Partners"*. The **dev store admin IS authenticated** in attempts 2 and 3, so this is specific to `partners.shopify.com`. `/select` is an account CHOOSER, not a password prompt, so this is probably one click for the owner. CW will not type credentials. Same wall as H11/H15. Nothing was read, so there is **no reading to report** — and per the brief's own trap, an unchanged percentage would have meant nothing anyway without the delivery COUNT beside it. | The numbers, and one line on whether post-fix deliveries occurred. |
| H11 | **CW** | Publish the approved listing copy from `12-OFFER.md` §4 — introduction, details, five bullets, five search terms, sales-channel requirement, every optional field. | **BLOCKED 2026-09-11 — the Partner Dashboard is not reachable from this computer.** Three independent attempts, all landing on a login wall: (1) the MCP-controlled Chrome → `accounts.shopify.com/lookup`; (2) Playwright with the stored session → `accounts.shopify.com/select`; (3) CDP into the Chrome a human logged into on port 9333 → `accounts.shopify.com/select`, page title *"Log in — Partners"*. The **dev store admin IS authenticated** in attempts 2 and 3, so this is specific to `partners.shopify.com`. `/select` is an account CHOOSER, not a password prompt, so this is probably one click for the owner. CW will not type credentials. | New copy live on the public page. |
| H12 | **CW** | Update the listing pricing display after Phase C | Listing must match `04-DECISIONS.md` | Plans on the listing match the table |
| H13 | **CW** | Open **Settings** on a store and LOOK at the "Include draft products" checkbox, then tick it, Save, hard-reload, and confirm it is still ticked. | **DONE 2026-09-11, seen with my own eyes on `contentpilot-dev2` (Northline Supply).** L15's third requirement is now proved. Screenshot `docs/history/screen-reads/h13-checkbox-visible.png` shows the control rendered inside the "Review before publishing" card, directly under "Publish without review", with its help text. **It is BELOW the fold on load** — y=2195 inside the app frame, absolute y=2308 in a 1440x900 viewport, so a merchant must scroll to reach it. Was unchecked; ticked; saved; **hard reload → still ticked** (`h13-after-reload.png`). | Proved. |
| H15 | **CW** | **Replace "Dedicated account manager" and "SLA support" on the live listing** with "Direct access to the founder" and "Every question answered within one business day". | **BLOCKED 2026-09-11 — the Partner Dashboard is not reachable from this computer.** Three independent attempts, all landing on a login wall: (1) the MCP-controlled Chrome → `accounts.shopify.com/lookup`; (2) Playwright with the stored session → `accounts.shopify.com/select`; (3) CDP into the Chrome a human logged into on port 9333 → `accounts.shopify.com/select`, page title *"Log in — Partners"*. The **dev store admin IS authenticated** in attempts 2 and 3, so this is specific to `partners.shopify.com`. `/select` is an account CHOOSER, not a password prompt, so this is probably one click for the owner. CW will not type credentials. **This is the most urgent CW item: the listing is live RIGHT NOW promising two things `04-DECISIONS.md` forbids by name.** | Neither phrase appears on the public listing. |
| H16 | **OWNER** | **Decide the UptimeRobot alert-contact route** (blocks H2) | A second contact needs a team member; UptimeRobot states team members are "Available in our Team and Scale plans", notify-only seats "sold separately". Account is free tier. Options: Gmail forward `gujjarcsu@` → `hello@navaal.ai` (free, recommended); change the account email; or buy a seat (billable — needs explicit approval) | Owner picks one |
| H17 | **OWNER** | **Approve the device binding for the two webhook scheduled tasks** | Both were deleted and recreated 2026-09-10 with `requires_local_device: true` (`trig_01SS3kD3gVKfSeNg4LESz6S2` 11 Sep, `trig_01TdvqbuYAcYTAoEJnNVhvhW` 17 Sep). Both returned **`not bound: no_signed_approval — this task will run in the cloud only`** and still show `folders_state: FOLDERS_STATE_NONE`. Declaring the flag is not enough; the owner must approve the binding on the computer. Until he does, both still fire into a browserless cloud session and produce nothing | Both tasks list this computer, and the 11 Sep run returns real figures |
| H18 | **OWNER** | Verify a Search Console property for the **merchant store** the app reports on (`askebs.com.au`) | H1 covered `navaal.ai` only. Probed on the Navaal account 2026-09-10: `sc-domain:askebs.com.au` and `https://askebs.com.au/` are **not verified**. D2/D4/D5 need the shop's own Search Console data, not ours | Property verified on an account the app can OAuth into, with impression data |

## DONE

| ID | Task | Confirmed |
|---|---|---|
| H14 | Chrome signed in to the Shopify developer account | 2026-09-10 — owner signed in; account is **Waqas Ahmad, `gujjarcsu@gmail.com`**, Partner org **4937813** / Dev org **219167540**. Dev Dashboard and Partner Dashboard both load. Unblocked H8 and the H10 reading. |
| — | Scoreboard numbers read from the Partner Dashboard | 2026-09-10, app overview, Last 30 days: **Total earnings to date $0.00 USD**; **Merchants with your app: 5**; **cumulative net installs 2**; **19 installs**; **17 uninstalls**, of which **16 were same-day as install**; earnings $0.00 across one-time, recurring, usage and credits; **Latest merchant feedback: "-"** (no reviews). Dev Dashboard Installs card reads **5**. |
| — | Admin performance p75 + call counts read | 2026-09-10, Monitoring → Admin performance, **7-day window** (the only range offered; BFS grades 28 days, and the app only launched 2026-09-08 so 28 days does not exist yet). **LCP p75 1,130 ms — Good**, loads 11 + 31 + 9 = **51**. **INP p75 24 ms — Good**, loads 5 + 0 + 7 = **12**. **CLS p75 0.02 — Good** overall, loads **51** — but **Sep 10 alone is 0.17 over 9 loads**, well above the 0.1 threshold. Headline: the measurement rests on ~51 loads, **far below the 100 calls needed to be graded at all**. |
| — | Webhook reading #3 | 2026-09-10 ~11:00 UTC — **identical to the post-uninstall reading**: overall 75.0% High; `app/uninstalled` 68.182% of **22** @ 1,403 ms; `shop/redact` 100.0% of **9** @ 816 ms; `app/scopes_update` 0% of **1** @ 534 ms; Removed webhooks **0** on every topic; daily Sep 8 = 1 ok / 18 failed, Sep 9 = 2 ok / 5 failed, Sep 10 = 5 ok / 1 failed; p90 Sep 10 = 5,911 ms. **No new deliveries since the uninstalls** — the count is unchanged, so this reading proves nothing new either way. |
| H1 | Google Search Console property connected and verified | 2026-09-10 — **already verified before this session**, on the `Navaal` Google account (`navaal.aiiii@gmail.com`, `authuser=2`). **Two** properties: `sc-domain:navaal.ai` (**Domain**, verified via Domain name provider) and `https://navaal.ai/` (**URL-prefix**, verified via HTML file *and* Domain name provider). Read back from the Ownership page on a fresh load. Live data present: **10 clicks, 488 impressions, 2% CTR, average position 55.1** over 28 days, last updated 10 hours ago. The Domain property covers `app.navaal.ai`, which is **not** a separate property. Does **not** cover the merchant store — see H18. |
| H9 | Reindexing requested for `/apps/navaal-seo` and `/apps` | 2026-09-10 — both inspected under the `https://navaal.ai/` property. Both returned "URL is on Google / Page is indexed", then **"Indexing requested — URL was added to a priority crawl queue"**, read back from the page after each click. |
| — | Uptime monitors created | 2026-09-10 — keyword monitor on `/api/health?deep=1` matching `"status":"ok"`, plus a root monitor. Note: the root monitor is near-worthless; `/` redirects to `/reembed`, a static App Bridge shim touching no database, so it would report Up through a total database failure. |
| — | Neon history retention → 7 days | 2026-09-10 — was **6 hours**, not the 7 days the runbook promised. |
| — | App Store listing US spelling | 2026-09-10 — raw listing HTML grepped: 0 British, 23 US. |
| — | navaal.ai App Store links | 2026-09-10 — five links pointed at the pre-rename handle and returned **404**, including the `installUrl` in the `SoftwareApplication` JSON-LD. Fixed, verified live cache-busted. |
| — | navaal.ai "Coming soon" launch toggle | 2026-09-10 — `/apps` still advertised the app as coming soon with the live badge and install button hidden. Flipped, verified live. |
| — | Install attribution on navaal.ai | 2026-09-10 — `navaal-nav` + `navaal-footer` on 67 static pages, `blog-post` on 28 posts, `navaal-home` and `navaal-tools` added. All 8 handles return 302 with the ref preserved. |
| — | 4 test stores uninstalled | 2026-09-10 — to generate real webhook deliveries. |
