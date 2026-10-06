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
- [ ] OWNER: run p38-affected-shops.mjs, hand the JSON back for the per-shop write-up
- [ ] Follow-up (not done): checkAppShellOnce and the degraded alert still re-alert hourly; ScheduledRun rows are never swept (~7/day)
