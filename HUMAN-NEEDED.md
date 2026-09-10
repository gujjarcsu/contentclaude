# HUMAN-NEEDED

Things only a human with the right logins can do. Each item says what, why, and the exact command or
click path. When one is done it moves to **Done** with the date and how it was confirmed — the record of
what was required is worth keeping.

**Setting a secret: always `fly secrets import`, never `fly secrets set`.** See the 2026-09-09 incident
in `docs/RUNBOOK.md`. A URL-encoded password contains `%xx` sequences, and Windows `cmd.exe` treats those
as variable references and strips them, so `secrets set` on the command line silently corrupts the value
and restarts both machines onto it.

## Open

Nine items, all with the owner. Every one needs an account, a console or a
browser session the agent cannot reach — no agent types credentials here. The
code for each is shipped and degrades honestly without it, and items 8, 9 and 10
are measurements rather than fixes: the mechanism is tested and deployed, and
what is missing is a real merchant session to record it against.

### 2. Uptime monitor from two regions (Phase 1 item 5)
- **Why:** this is the gap the 2026-09-09 incident exposed. A five-minute in-app check now exists and
  emails on failure, but it runs *inside* the same infrastructure — if Fly itself is unreachable, the
  thing that would tell you is also unreachable. An external monitor is the only check that survives the
  app being completely gone.
- **Steps:** Better Stack or UptimeRobot, free tier is enough.
  - URL `https://app.navaal.ai/api/health`, every **60 s**, from at least **two** regions (one US, one
    AU — most merchants are US, the app is in Sydney).
  - Alert after **2 consecutive failures**, to `hello@navaal.ai`.
  - Optional second monitor on `https://app.navaal.ai/api/health?deep=1` expecting the body to contain
    `"status":"ok"` — that one catches a dead worker, which the shallow check deliberately does not.

### 3. Neon point-in-time restore, 7 days (Phase 1 item 7)
- **Why:** first line of defence for a bad migration or a mistaken delete, and much faster than restoring
  a dump.
- **Steps:** Neon console → project → Settings → **History retention** → set to **7 days**. On the free
  tier this may cap lower; if so, note the actual number here so the runbook stops promising seven.

### 4. Run the restore drill once (Phase 1 item 7)
- **Why:** an untested backup is a hope. This is the only item here that cannot be replaced by a
  credential — somebody has to actually do it once.
- **Steps:** in `docs/RUNBOOK.md` under "Restoring from a backup". Restore the most recent dump into a
  **new Neon branch**, not production, run `npx prisma migrate status` against it, and count rows in
  `Shop` and `GeneratedContent`. Record the date and the row counts in `PROGRESS.md` so the next person
  knows it has been proven at least once.

### 5. Re-run the two measurement harnesses with a fresh admin session (Phase 2 items 2.11 and 2.12)
- **Why:** both harnesses are written, committed and working. Neither can produce a number, because the
  saved Playwright session at `tests/e2e/.auth/shopify.json` does not reliably complete Shopify token
  exchange any more: embedded routes answer **410 Gone** and never recover. Only a human can create a new
  session, because `login-cdp.mjs` opens a browser for somebody to type the credentials and no agent
  ever types them.
- **What went wrong first, so it is not repeated:** the first run of each harness reported a full set of
  confident results — `12 screens, 0 overflowing` and a complete LCP table. Every screenshot was the
  same "410 Gone" page, and the LCP figures were the load time of that error page. Both harnesses now
  refuse to report rather than measure an error page, and the check reads through Playwright frame
  handles because the app is cross-origin to the admin and `iframe.contentDocument` is null.
- **Steps:**
  ```
  node tools/proof/login-cdp.mjs          # a human logs in; writes tests/e2e/.auth/shopify.json

  node tools/proof/web-vitals.mjs --label before    # against the CURRENT deploy
  node tools/proof/mobile-375.mjs                   # 12 screens at 375px

  # then, after the next deploy:
  node tools/proof/web-vitals.mjs --label after
  node tools/proof/web-vitals.mjs --compare
  ```
- **What to expect:** `mobile-375.mjs` exits non-zero if any screen scrolls horizontally and writes both
  the screenshots and a `results.json` naming the widest offending element. That one still matters.
- **IMPORTANT — `web-vitals.mjs` is now a regression detector only, and this item is no longer about
  Built for Shopify.** Shopify's own field data (App Bridge, real merchant sessions, p75 over 28 days —
  the measurement BFS actually grades) reads **LCP 895 ms and INP 16 ms, both Good**. The harness reads
  4644-5892 ms because it measures the TOP-LEVEL document, which is `admin.shopify.com` rather than this
  app, and adds 200 ms of emulated latency on top. Its numbers are **not comparable to the 2.5 s
  threshold** and must never be quoted against it. The harness prints that on every run now, and the
  earlier "LCP fails on all three screens" conclusion is withdrawn in `PROGRESS.md`.
  So: run it if you want a before/after around a change, not to find out whether the app is fast enough.
  The answer to that is in the Dev Dashboard, and it is yes.

### 6. Change the App Store listing to US spelling (Phase 2 item 2.9)
- **Why:** the app was split between British and US spelling of the same word — 20 user-visible
  "Optimis-" against 9 "Optimiz-", with the same metric spelled both ways on adjacent screens (Results
  said "Products optimized", Analytics said "products optimised"). The route has always been
  `/app/optimize` while every label said "Optimise". The app is now US throughout, and the listing has
  to match or the split simply moves outside the app.
- **Steps:** Partner Dashboard → the app → App listing → search the copy for "optimis", "analys",
  "favourite", "colour" and "behaviour", and change each to the US form. The app name itself
  (`Navaal: AI SEO, AEO & GEO`) is unaffected.
- **Verify:** the listing and the in-app copy use one spelling. Nothing in the app needs redeploying.

### 7. Remove the retired `FEATURE_MAGIC_MOMENT` Fly secret (Phase 3 item 3.1)
- **Why:** the flag is gone from the code. `magicMoment` gated the first-run auto-scan behind an
  environment variable, which meant the first thing a new merchant saw depended on a setting nobody had
  turned on in production — so nobody ever saw it. That engine is now the Start state on Home and runs
  for every shop unconditionally. The secret is inert, but a secret that nothing reads is a trap for the
  next person who finds it and assumes it does something.
- **Steps:**
  ```
  fly secrets unset FEATURE_MAGIC_MOMENT -a contentclaude
  ```
  `unset` (not `import`) is correct here — the runbook's import-from-file rule exists because `secrets
  set` on Windows `cmd.exe` mangles `%xx` sequences in a VALUE. Removal passes no value.
- **Then, because unset restarts every machine:**
  ```
  curl -s "https://app.navaal.ai/api/health?deep=1"
  ```
  Expect `"status":"ok"` and `"schema":{"ok":true,...}`.
- **Confirm it is gone:** `fly secrets list -a contentclaude | grep FEATURE_MAGIC_MOMENT` → no output.
- **Safe to leave for now.** Nothing reads it, and a test asserts no source file does
  (`tests/utils/featureFlags.test.js`). This is tidiness, not a fix.

### 8. Re-read the webhook failure rate on the Dev Dashboard (Phase 3, pre-phase item 1)
- **Why:** the fix is deployed and proven with signed probe deliveries — the 25 h and 47 h cases that
  returned 401 now return 200, and `shop/redact` is accepted at 10 days old. But the dashboard figure is
  a **7-day trailing rate**, so it cannot move immediately and nothing I can run will make it move.
  The probe proves the mechanism; the dashboard is what proves the outcome.
- **Where:** dev.shopify.com → the app → Monitoring → Webhooks.
- **When:** **2026-09-11** (first look — the rate should already be falling) and **2026-09-17** (a full
  7 days of post-fix deliveries).
- **What to expect:** overall was **88.5%**, `app/uninstalled` 82.353% of 17, `shop/redact` 100.0% of 9.
  Response times were 1,039 ms and 816 ms; both handlers now answer in tens of milliseconds regardless of
  how much data the shop has.
- **If it has NOT fallen:** run the probe again (`docs/RUNBOOK.md` → "Shopify's Dev Dashboard says
  webhooks are failing") and check `fly logs -a contentclaude | grep -E "deferred|webhook_sweep"`. A
  `redaction_unfinished` or `uninstall_cleanup_unfinished` line repeating for the same shop is a real
  problem; one after a deploy is the sweep doing its job.

### 9. Five fresh dev-store installs, to produce the TTFV number (Phase 3 item 3.2)
- **Why:** the brief asks for **time-to-first-value p50/p90 over ≥ 5 fresh installs**. The
  instrumentation is live and `scripts/ttv-report.mjs` works, but the cohort is **empty** — it excludes
  `pre_tracking` shops and every shop in the database is one. Verified against production:
  `cohortSize: 0`, `measuredInstallsTotal: 0`. An install is a human action: it needs the Partner
  console and a browser somebody logs into, and no agent types credentials here.
- **Steps:**
  1. Partner console → create 5 development stores. Each needs **≥ 10 products** (Shopify's sample data
     is fine) or the run measures the empty-store path instead.
  2. Install the app on each from the App Store listing, and let the Start state run. Do not click
     through to anything else first — the measurement is install → first draft on screen.
  3. For **one** of them, screen-record from the install grant screen with the **URL bar visible**
     through to the first proposal. That is the 120 s acceptance recording the brief asks for.
  4. Then:
     ```
     fly ssh console -a contentclaude -C "node /app/scripts/ttv-report.mjs"
     ```
- **What to expect:** `draft.medianSeconds` and `draft.p90Seconds` populated, `under120s` counting how
  many made the bar, and `bySource` showing `quick_start`. `smallSample: true` stays until the cohort is
  larger — five is enough to report and not enough to be confident, and the report says so itself.
- **Read `zeroProducts` before anything else.** An install with no products cannot reach a draft, and it
  is counted separately rather than dragged into the median as a failure.

### 10. The two Phase 3.4 acceptance recordings (Phase 3 item 3.4)
- **Why:** both need a browser session and real Shopify billing approval.
- **(a) Drive a dev store 0 → 20 → 25 generations with the URL bar visible.** Expect: nothing at all
  below 20; **one** banner on Home and on Products from 20; at 25 the generate and optimise actions
  **replaced** by a card, while the audit, and reviewing and publishing existing drafts, all still work.
  Dismiss the banner and confirm it stays gone on a reload and on another device.
  - The seeder exists if you would rather not spend 25 real generations:
    ```
    fly ssh console -a contentclaude -C "SEED_ACTION=seed node /app/scripts/test-seed-usage--writes-test-store-only.mjs"
    ```
    It refuses any shop it does not recognise as a test store. `SEED_ACTION=restore` removes the rows.
- **(b) Upgrade from the 100% card → Approve → land back in-admin.** Expect the plan active, and:
  ```
  fly ssh console -a contentclaude -C "node /app/scripts/diag-shop.cjs <shop>"
  ```
  showing `upgradePromptSource: "quota100"` on the `Shop` row. If it is `null`, the plan still activated
  correctly — attribution is deliberately non-fatal — but the chain did not join, and the place to look
  is whether `?prompt=` survived the round trip to Shopify's approval screen.

## Done

### 1. `DIRECT_URL` — real migrations take the advisory lock again (Phase 1 item 1)
Done 2026-09-10 by the owner; verified by the agent the same day. `fly secrets list` shows `DIRECT_URL`,
and `printenv` on the machine shows Neon's **unpooled** endpoint (`ep-wild-mode-a755klmb`, no `-pooler`).

`prisma/schema.prisma` now declares `directUrl = env("DIRECT_URL")` and
`PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` is out of `fly.toml`. Deploy `e730fd3` ran the release command with
the lock enabled:

```
3 migrations found in prisma/migrations
No pending migrations to apply.
```

No `P1002`, and `printenv | grep -c PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` → `0` on the machine.

Checked before shipping, because a datasource that cannot resolve its env vars fails the Docker build and
breaks every deploy: `prisma generate` runs at build time with neither `DATABASE_URL` nor `DIRECT_URL`
present, and succeeds with both unset. If the lock ever cannot be taken, the release command fails and
Fly keeps serving the previous version — a refused deploy, not an outage.

### `WORKER_DATABASE_URL` — the worker's own connection budget (Phase 1 item 2)
**Done 2026-09-09.** Set via `fly secrets import`. Confirmed from production logs: the worker's
`Startup complete` line reads `"dbUrlSource":"WORKER_DATABASE_URL"` and the web machine's reads
`"dbUrlSource":"DATABASE_URL"`, so each process opened the connection string meant for its role.
Deep health green throughout.

### `RESEND_API_KEY` — the alerts can now leave the building (Phase 1 item 5)
**Done 2026-09-09, and proven end to end.** A single deliberate test alert was sent from the
production machine through `sendOperatorEmail()` — the same function the five-minute health probe,
the `/app` shell probe, the daily digest and the nightly backup all use. The log line reads
`operator_alert_sent` with `"to":"hello@navaal.ai"` and the call returned `sent: true`, replacing
the `operator_alert_undeliverable` that every alert produced before. Recorded in `PROGRESS.md`.

### R2 bucket and credentials for the nightly backup (Phase 1 item 7)
**Done 2026-09-09.** All four of `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and
`R2_BUCKET` are set. The next 03:00 Sydney run is the first real test: it should log `backup_ok`
with a key and a byte count instead of `backup_not_configured`. **The restore drill is still open**
— a backup nobody has restored is a hope, not a backup.

### 4. Raise `connection_limit` on `DATABASE_URL` from 1 to 5 — Phase 0 item 15
**Done 2026-09-09.** Confirmed from the production machine: pooled Neon endpoint (`-pooler`,
`pgbouncer=true`), `connection_limit=5`, password intact. `fly logs` now shows
`✅ All startup checks passed` with no `connection_limit` warning on either machine.
One connection had meant `tryConsumeGeneration` held a SERIALIZABLE transaction while three worker slots
and every web request queued behind the same single connection, surfacing to merchants as "Timed out
fetching a new connection from the pool" under ordinary load.
**This is the change that caused the 2026-09-09 secret-corruption incident** — recorded in
`docs/RUNBOOK.md` and in `PROGRESS.md`. It is why the import-from-file rule above exists.

### 3. Turn on listing analytics so App Store install sources can be measured — Phase 0 item 2
**Done.** GA4 measurement ID `G-8H3DS31YQ8` is live on the App Store listing, so listing pageviews carry
the `surface_*` params and the server-side `shopify_app_install` event can be joined to them. This is the
only Shopify-provided way to get a search-vs-category-vs-home split: under managed installation Shopify
does **not** forward `surface_*` to the app server, which is why server-side attribution records those
installs as `unknown` (truthfully) and our own channels are attributed through `/go?ref=`.
The daily digest (Phase 1 item 5) can read GA4 now that this exists.

### 2. Confirm the App Store listing name
**Done.** https://apps.shopify.com/navaal-ai-seo-geo-content reads `Navaal: AI SEO, AEO & GEO`, matching
the in-app document title, `og:title` and nav brand line character for character.

### 1. Push the app name to Shopify (`shopify app deploy`) — Phase 0 item 1
**Done.** Deployed via the Shopify CLI from the owner's machine, so the admin sidebar now shows
`Navaal: AI SEO, AEO & GEO`. The agent could not run it: the CLI is not installed in the repo, the
auto-mode permission layer declined the `npx @shopify/cli app deploy` call, and it needs a Partner-account
login. The released version also carries the unchanged theme extension `navaal-geo-schema`.

### Sentry alert rule — Phase 0 item 25
**Done 2026-09-09.** Created by the owner; the deliberate test error produced an email, so a new issue
reaches a human. The code half (eager init, `handleError`, `unhandledRejection` / `uncaughtException`
handlers, `release: GIT_SHA` tagging) shipped in `8665a25`, and the eager init is visible in production
logs on every machine boot.

## Standing notes
- Every push to `main` deploys to Fly via `.github/workflows/ci.yml`; do not run `fly deploy` locally
  alongside a push.
- The saved admin session used by the proof harnesses lives in `tests/e2e/.auth/shopify.json` (created
  with `node scripts/login-cdp.mjs`). When it expires, re-run that script and log in yourself; no
  credentials are ever typed by the agent.
