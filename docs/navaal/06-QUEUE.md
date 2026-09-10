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


## OPEN

| ID | Owner | Task | Why | Done looks like |
|---|---|---|---|---|
| H2 | **CW** | Add `hello@navaal.ai` as a second UptimeRobot alert contact | Alerts go only to one inbox today | Both monitors list both contacts, read back on a fresh page load |
| H3 | **CC** | Five fresh dev-store installs, >=10 products each, let the Start state run | **Cohort complete 2026-09-10.** navaal-ttv-01..05 created with 17 products each (verified per store). Installed from the App Store listing: TTV 02, 03, 04, 05 earlier in the day; **TTV 01 (renamed Harbourline Goods) installed 15:56:34 UTC** — grant to all three drafts complete in **under 18 seconds**, store scored 34/100 (GEO 43, Traditional SEO 25), 3 drafts written. TTV 04 was later uninstalled for the webhook test, so the live cohort is 4 of the 5. **Still needs `ttv-report.mjs` run via `fly ssh` (Claude Code) to produce median/p90** | `ttv-report.mjs` shows populated median and p90 |
| H4 | **OWNER** | Screen-record ONE of those installs, URL bar visible, grant → first proposal | The 120-second acceptance recording | A single video under 120s |
| H5 | **OWNER** | Drive a dev store 0 → 20 → 25 generations, URL bar visible | Quota-surface acceptance: nothing below 20, one banner from 20, actions replaced at 25 | Recording + banner stays dismissed on reload and another device |
| H6 | **OWNER** | Upgrade from the 100% card → Approve → land back in-admin | Billing attribution chain | `diag-shop.cjs` shows `upgradePromptSource: "quota100"` |
| H7 | **CW** | Upload the re-captured listing screenshots + new captions | Listing still shows the pre-Phase-2 app | Five desktop + three mobile live on the listing |
| H8 | **CW** | Read the **Built for Shopify** status page | **Partially done 2026-09-10** — signed in and read every underlying number (see DONE row). But **no Built for Shopify section is exposed anywhere**: not in the Dev Dashboard nav (Monitoring / Logs / Versions / App settings), not on the Partner app overview, not on Distribution → App Store. Almost certainly because the app is far below the 50-install eligibility bar. **Re-check once net installs approach 50** | The BFS scorecard itself, with per-criterion states |
| H10 | **CW** | Webhook reliability readings 2026-09-11 and 2026-09-17 | 7-day trailing window; only new deliveries can move it. Both tasks verified **enabled** 2026-09-10 (next runs 09-10T23:00Z and 09-16T23:00Z) but **not bound to this computer** — see H17. Third reading BLOCKED by H14 | Scheduled tasks exist — confirm they fired |
| H11 | **CW** | Update the App Store listing feature bullets | The five live bullets omit every Phase 4 capability. **Replacement bullets drafted 2026-09-10** and held for owner approval — not submitted | New bullets live |
| H12 | **CW** | Update the listing pricing display after Phase C | Listing must match `04-DECISIONS.md` | Plans on the listing match the table |
| H13 | **CW** | Open **Settings** on a store and LOOK at the **"Include draft products"** checkbox, then tick it, Save, hard-reload, and confirm it is still ticked. Path: app → Settings → the card headed "Review before publishing" → directly under "Publish without review". | **NARROWED 2026-09-10, deployed `d21b5bb`.** Two of L15's three requirements are now proved from a LIVE render on `contentpilot-dev2`: the control is wired, and its label and help text appear in the rendered DOM text, so it is NOT inside a collapsed section. What is still unproved is that a human can SEE it and that the value persists — the screen-read harness captures the app iframe ELEMENT, so `fullPage` does not apply and the control sits below the captured viewport. | A frame showing the checkbox, and a tick that survives a hard reload. |
| H15 | **CW** | **Remove "Dedicated account manager" and "SLA support" from the live listing** | The Professional tier on the live listing promises both. `04-DECISIONS.md` forbids both by name: *"No 'SLA' or 'dedicated account manager' — at 0 reviews one unmet promise halves the rating."* This is a live promise we have already decided we cannot keep | Neither phrase appears on the public listing |
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
