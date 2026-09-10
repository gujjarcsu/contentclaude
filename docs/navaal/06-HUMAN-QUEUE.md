# HUMAN QUEUE — tasks an agent cannot do

Add here whenever you hit one. Give the exact click path or command, why it is needed, and what
"done" looks like. The owner works this list in batches through a browser session.

Status: `OPEN` · `DONE <date, how confirmed>`

---

## OPEN

| ID | Task | Why | Done looks like |
|---|---|---|---|
| H1 | Connect a **Google Search Console** property and verify it | Blocks D2, D4, D5 — the entire result-proof layer | OAuth granted, property verified, domain matches the shop |
| H2 | Add `hello@navaal.ai` as a second UptimeRobot alert contact | Alerts go only to one inbox today | Both monitors list both contacts, read back on a fresh page load |
| H3 | Five fresh dev-store installs, ≥10 products each, let the Start state run | TTFV cohort is empty (`cohortSize: 0`) | `ttv-report.mjs` shows populated median and p90 |
| H4 | Screen-record ONE of those installs, URL bar visible, grant → first proposal | The 120-second acceptance recording | A single video under 120s |
| H5 | Drive a dev store 0 → 20 → 25 generations, URL bar visible | Quota-surface acceptance: nothing below 20, one banner from 20, actions replaced at 25 | Recording + banner stays dismissed on reload and another device |
| H6 | Upgrade from the 100% card → Approve → land back in-admin | Billing attribution chain | `diag-shop.cjs` shows `upgradePromptSource: "quota100"` |
| H7 | Upload the re-captured listing screenshots + new captions | Listing still shows the pre-Phase-2 app | Five desktop + three mobile live on the listing |
| H8 | Read the **Built for Shopify** status page and report every criterion verbatim, including the **number of perf calls counted** | Nobody has read the project's actual scoreboard. **BLOCKED by H13** — `dev.shopify.com/dashboard/219167540` returns 403 | Criterion list with real numbers |
| H9 | Request reindexing of `navaal.ai/apps/navaal-seo` in Search Console | Google has been reading a 404 as the app's `installUrl` | Reindex requested |
| H10 | Webhook reliability readings 2026-09-11 and 2026-09-17 | 7-day trailing window; only new deliveries can move it. Both tasks verified **enabled** 2026-09-10 (next runs 09-10T23:00Z and 09-16T23:00Z) but **not bound to this computer** — see H16. Third reading BLOCKED by H13 | Scheduled tasks exist — confirm they fired |
| H11 | Update the App Store listing feature bullets | The five live bullets omit every Phase 4 capability. **Replacement bullets drafted 2026-09-10** and held for owner approval — not submitted | New bullets live |
| H12 | Update the listing pricing display after Phase C | Listing must match `04-DECISIONS.md` | Plans on the listing match the table |
| H13 | After the Phase A deploy: open **Settings** in the app and confirm the new **"Include draft products"** checkbox is actually VISIBLE, toggles, saves, and is still on after a reload. Path: app → Settings → the card headed "Review before publishing" → the checkbox sits directly under "Publish without review". | A1.2's guards are SOURCE assertions, not a browser. A control inside a collapsed section, or behind a plan gate, would pass every test and still be invisible. This is the exact failure class the item fixed, so it must not be verified only by source. | Checkbox visible without expanding anything; tick it, Save, hard-reload, still ticked; Products header then reads "… active and draft products published to your online store" |
| H13 | **Sign Chrome into the Navaal Shopify account** | Chrome is signed in as `info@askebs.com.au`, whose org switcher offers only EBS (org 206622138). Navaal org 219167540 returns **403**. Blocks H3, H4, H5, H6, H8 and the H10 readings. The extension is blocked from `accounts.shopify.com` by Chrome, so only a human can do this | Dev Dashboard for app 368479600641 loads without 403 |
| H14 | **Remove "Dedicated account manager" and "SLA support" from the live listing** | The Professional tier on the live listing promises both. `04-DECISIONS.md` forbids both by name: *"No 'SLA' or 'dedicated account manager' — at 0 reviews one unmet promise halves the rating."* This is a live promise we have already decided we cannot keep | Neither phrase appears on the public listing |
| H15 | **Decide the UptimeRobot alert-contact route** (blocks H2) | A second contact needs a team member; UptimeRobot states team members are "Available in our Team and Scale plans", notify-only seats "sold separately". Account is free tier. Options: Gmail forward `gujjarcsu@` → `hello@navaal.ai` (free, recommended); change the account email; or buy a seat (billable — needs explicit approval) | Owner picks one |
| H16 | **Re-create the two webhook scheduled tasks with a device binding** | Both have `folders_state: FOLDERS_STATE_NONE`, `folders: []`. They fire a fresh cloud session with no browser and no access to the owner's logged-in Chrome — and their only job is to read the Partner Dashboard. They will fire, fail, and produce nothing. A binding cannot be added after creation, so they must be deleted and recreated with `requires_local_device` | Both tasks list this computer, and the 17 Sep run returns real figures |

## DONE

| ID | Task | Confirmed |
|---|---|---|
| — | Uptime monitors created | 2026-09-10 — keyword monitor on `/api/health?deep=1` matching `"status":"ok"`, plus a root monitor. Note: the root monitor is near-worthless; `/` redirects to `/reembed`, a static App Bridge shim touching no database, so it would report Up through a total database failure. |
| — | Neon history retention → 7 days | 2026-09-10 — was **6 hours**, not the 7 days the runbook promised. |
| — | App Store listing US spelling | 2026-09-10 — raw listing HTML grepped: 0 British, 23 US. |
| — | navaal.ai App Store links | 2026-09-10 — five links pointed at the pre-rename handle and returned **404**, including the `installUrl` in the `SoftwareApplication` JSON-LD. Fixed, verified live cache-busted. |
| — | navaal.ai "Coming soon" launch toggle | 2026-09-10 — `/apps` still advertised the app as coming soon with the live badge and install button hidden. Flipped, verified live. |
| — | Install attribution on navaal.ai | 2026-09-10 — `navaal-nav` + `navaal-footer` on 67 static pages, `blog-post` on 28 posts, `navaal-home` and `navaal-tools` added. All 8 handles return 302 with the ref preserved. |
| — | 4 test stores uninstalled | 2026-09-10 — to generate real webhook deliveries. |
