# P38 — worker + scheduler down since 2026-10-01 ~11:40Z

- [x] Diagnose: no deploy/secret change since v279 (16 Sep). Cache Redis client (`retryStrategy: () => null`) went to `end` on a server-side close, no `error` event, dead client reused forever on every machine
- [x] cache.server.js: drop an ended client and reconnect
- [x] api.health.jsx: real Redis PING, not getCache (which falls back silently — "redis ok" for 4 days)
- [x] ScheduledRun table (Postgres) + claimScheduledRun(); all 7 scheduled jobs claim there; unreadable marker ⇒ skip + one alert
- [x] DOWN alert: once on break, once on recovery, one reminder per 24 h
- [x] Tests: new tests/utils/p38ScheduledRun.test.js; 5 suites updated; vitest 168/168 files, 4766 tests; eslint + typecheck clean
- [x] scripts/p38-affected-shops.mjs (read-only, runs on the Fly machine): jobs + logs + Resend sends since 1 Oct
- [ ] OWNER: commit + `fly deploy` BEFORE 2026-10-06 20:00Z (next digest hour) — classifier blocks all prod actions in Claude's harness
- [ ] OWNER: proofs — deep health 200 ×3 at 5-min spacing; one test-shop generation (completed 15→16); digest exactly once on 7 Oct
- [x] Item 5 — CLOSED 2026-10-06. p38-affected-shops.mjs (read 00:36Z): 0 generation jobs since 1 Oct 11:40Z, for any shop. Shops in the window: hark-fauy0olp (installed 5 Oct 14:59Z, free, no jobs, no warnings) and contentpilot-dev2 (the only paid plan; our own dev store). The app's Resend key is send-only, so Cowork read the Resend log instead (all 653 emails back to 24 Sep): **zero emails to any merchant.** Every send went to hello@navaal.ai, navaal.aiiii@gmail.com, askebs1@gmail.com, gujjarcsu+p31 (the P31 test account) or resend.dev test addresses. The 1–6 Oct flood: 392 daily digests, 129 DOWN alerts, 30 funnel digests.
- [x] p38.json deleted (owner ruling 3)
- [x] p38-worker-redis-scheduler fast-forwarded into main (owner ruling 4); not pushed — a push to main deploys
- [x] Ruling 1: contentpilot-dev2 is "ours" already (OURS_PATTERN beats the row); the digest counted paid/live/ever from raw rows. Now per kind: ours and Shopify's never count; "shops on a paid plan" reads 0. Funnel (kindOf) and TTV (excludes it by name) were already right.
- [ ] Ruling 2: hark-fauy0olp merchant or test? — needs scripts/p38b-scheduled-audit.mjs output (prod DB + its Shopify plan)
- [ ] P38b: per-night counts for backup / billing reconcile / catalogue watch / crawl holdout, and the R2 backup list with sizes — same script; DELETE NOTHING until the owner says
- [x] P38b: admin-shell and degraded alarms follow the DOWN rule (once, recovery, one reminder a day)
- [x] P38b: ScheduledRun rows older than 30 days swept nightly at 05:00 Sydney (claimed, registered with runScheduled)
