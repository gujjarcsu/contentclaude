/**
 * Scheduled operator tasks — Phase 1 item 5. Runs in the WORKER process only.
 *
 * Two jobs:
 *
 *  1. Deep health, every five minutes. Calls the app's own
 *     `/api/health?deep=1` over the public URL — deliberately the public URL, so
 *     it exercises the same path a merchant does: DNS, TLS, the proxy, and a web
 *     machine. On a 503, or on no answer at all, it emails the operator.
 *
 *     This is the check that was missing on 2026-09-09, when a corrupted
 *     DATABASE_URL took production down for twenty minutes and nothing said a
 *     word. The health endpoint was returning 503 correctly the whole time;
 *     nothing was calling it.
 *
 *  2. The daily digest, at 07:00 Australia/Sydney.
 *
 * It runs in the worker because the worker is the one process that is never
 * auto-stopped and never load-balanced — exactly one of it exists, so these fire
 * once rather than once per web machine.
 */
import logger from "./logger.server.js";
import { sendOperatorEmail } from "./notify.server.js";
import { buildDailyDigest } from "./digest.server.js";
import { claimScheduledRun, sweepOldScheduledRuns } from "./scheduledRun.server.js";
import { runNightlyBackup } from "./backup.server.js";
import { sweepUnfinishedWebhookWork } from "./webhookWork.server.js";
import { sweepOldLogs, RETENTION_DAYS } from "./logSink.server.js";
import { runScheduled } from "./schedulerHealth.server.js";

const HEALTH_INTERVAL_MS = 5 * 60 * 1000;
/** How often the worker looks for webhook work that was acknowledged but never finished. */
const WEBHOOK_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
/** INFRA2 — log retention sweep. Hourly, so a restart never skips a day. */
const LOG_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const BASE_URL = (process.env.SHOPIFY_APP_URL || "https://app.navaal.ai").replace(/\/$/, "");
const HEALTH_URL = `${BASE_URL}/api/health?deep=1`;
/** The embedded admin shell. /api/health can be perfectly healthy while this 500s. */
const APP_URL = `${BASE_URL}/app`;

/**
 * A real browser user-agent.
 *
 * The Shopify library answers a non-browser agent with 410 Gone instead of
 * redirecting to auth, and a 410 never reaches a loader or the database. A
 * probe without this measures the bot path and passes no matter what state
 * the app is in - which is exactly what happened for eight hours on
 * 2026-09-09.
 */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * P38 — every alarm here (DOWN, DEGRADED, the admin shell): once when it
 * breaks, once when it recovers, and one reminder a day while it stays broken.
 * Hourly sent 129 identical DOWN emails between 1 and 6 October, which teaches
 * the owner to stop reading them.
 */
const REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * How long `degraded` may persist before it is treated as an outage.
 *
 * A brief degrade is self-healing and must not page: Redis blips, and the AI
 * circuit breaker closes itself after a minute. But the four questions the
 * brief asks include "Anthropic is down for an hour", and an hour of every
 * generation failing is an outage no matter what the status word says. Three
 * consecutive probes — fifteen minutes — is well past self-healing and well
 * short of a merchant's whole afternoon.
 */
const DEGRADED_PROBES_BEFORE_ALERT = 3;
/** Digest bookkeeping lives in Postgres (ScheduledRun) so a worker restart cannot double-send. */
const DIGEST_HOUR_SYDNEY = 7;
/** Backups run at 03:00 Sydney — quiet hours, well clear of the digest. */
const BACKUP_HOUR_SYDNEY = 3;
/** P27 item 2 - the billing reconciliation runs at 04:00 Sydney: after the backup,
    well clear of the digest, and quiet hours for the merchants it queries. */
const RECONCILE_HOUR_SYDNEY = 4;
/** P38b — the ScheduledRun retention sweep, 05:00 Sydney, after the night's jobs have claimed. */
export const MARKER_SWEEP_HOUR_SYDNEY = 5;

let _healthTimer = null;
let _digestTimer = null;
let _sweepTimer = null;
let _logSweepTimer = null;
// In-memory is enough for the alert state: a worker restart re-alerting once on
// a genuinely broken system is the correct behavior, not a bug.
let _lastAlertAt = 0;
let _lastStatus = "ok";
let _degradedStreak = 0;
let _degradedAlerted = false;
let _degradedAlertAt = 0;
let _lastShellAlertAt = 0;
let _shellBroken = false;

/**
 * The current calendar day, hour, minute and weekday (0 = Sunday … 6 =
 * Saturday) in Sydney, whatever the machine's clock is set to.
 *
 * `weekday` was missing until Phase 10 Part B: the P3.6 weekly report read
 * it as undefined and its Monday check could never pass. The funnel digest
 * and the weekly report both read it now, and a test holds a known Monday.
 */
export function sydneyParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))).getUTCDay();
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, minute: Number(parts.minute), weekday };
}

/**
 * One deep-health probe. Exported so a test can drive it without timers.
 * @returns {Promise<{ok: boolean, status: string, alerted: boolean}>}
 */
export async function checkHealthOnce({ fetchImpl = fetch, now = Date.now() } = {}) {
  let status = "unreachable";
  let httpCode = 0;
  let body = "";

  try {
    const res = await fetchImpl(HEALTH_URL, { signal: AbortSignal.timeout(20_000) });
    httpCode = res.status;
    body = await res.text();
    try {
      status = JSON.parse(body).status ?? "unknown";
    } catch {
      status = "unparseable";
    }
  } catch (err) {
    body = err.message;
  }

  const bad = httpCode !== 200 || status === "error";
  let alerted = false;

  // ── Degraded that will not go away ──────────────────────────────────────
  //
  // `degraded` is deliberately not an alert on its own: Redis blips and the AI
  // circuit breaker closes itself. But it must not be a state the app can sit
  // in all afternoon while nobody is told. Three consecutive probes is fifteen
  // minutes, which is past self-healing.
  if (!bad && status === "degraded") {
    _degradedStreak += 1;
    // P38b — and one reminder a day while it lasts, the same rule as DOWN.
    const remind = _degradedAlerted && now - _degradedAlertAt > REMINDER_AFTER_MS;
    if (_degradedStreak >= DEGRADED_PROBES_BEFORE_ALERT && (!_degradedAlerted || remind)) {
      _degradedAlerted = true;
      _degradedAlertAt = now;
      alerted = true;
      const minutes = Math.round((_degradedStreak * HEALTH_INTERVAL_MS) / 60000);
      await sendOperatorEmail({
        subject: `Navaal has been DEGRADED for ${minutes} minutes`,
        text: [
          `Production is still answering, but something has been wrong for ${minutes} minutes`,
          "and has not recovered on its own. Merchants are probably affected even",
          "though every page still loads.",
          "",
          `URL:    ${HEALTH_URL}`,
          `status: ${status}`,
          "",
          "Response:",
          body.slice(0, 2000),
          "",
          "The usual causes, in order of likelihood:",
          "  aiCircuitBreaker.open  — the AI provider is failing. No shop can",
          "                           generate anything. Check status.anthropic.com",
          "                           and ANTHROPIC_API_KEY.",
          "  redis: degraded        — the queue has fallen back to inline work.",
          "  jobs.failedLast10Min   — generations are failing for some other reason.",
          "",
          "Runbook: docs/RUNBOOK.md — match the symptom to the section.",
        ].join("\n"),
      });
      logger.error(
        { status, streak: _degradedStreak, event: "health_watch_degraded" },
        "Sustained degradation",
      );
    }
  } else if (!bad) {
    if (_degradedAlerted) {
      await sendOperatorEmail({
        subject: "Navaal is back to normal — the degraded state cleared",
        text: `Production has recovered on its own.\n\nstatus: ${status}\nURL: ${HEALTH_URL}`,
      });
      logger.info({ event: "health_watch_degraded_recovered" }, "Degradation cleared");
    }
    _degradedStreak = 0;
    _degradedAlerted = false;
  } else {
    // A hard failure supersedes the degraded tracking.
    _degradedStreak = 0;
    _degradedAlerted = false;
  }

  if (bad) {
    const recovered = _lastStatus === "ok";
    const stale = now - _lastAlertAt > REMINDER_AFTER_MS;
    // Alert on the transition into trouble, then once a day while it lasts.
    if (recovered || stale) {
      _lastAlertAt = now;
      alerted = true;
      await sendOperatorEmail({
        subject: `Navaal is DOWN — /api/health?deep=1 returned ${httpCode || "no response"}`,
        text: [
          `The scheduled health check could not get a healthy answer from production.`,
          "",
          `URL:    ${HEALTH_URL}`,
          `HTTP:   ${httpCode || "(no response)"}`,
          `status: ${status}`,
          "",
          "Response:",
          body.slice(0, 2000),
          "",
          "Runbook: docs/RUNBOOK.md — start with the symptom that matches `status`.",
          "If a secret was just changed, assume it is corrupted and re-import it",
          "from a file (Rule 0). That is what happened on 2026-09-09.",
        ].join("\n"),
      });
    }
    logger.error({ httpCode, status, alerted, event: "health_watch_bad" }, "Scheduled health check failed");
    _lastStatus = "bad";
  } else {
    if (_lastStatus === "bad") {
      await sendOperatorEmail({
        subject: "Navaal is back — /api/health?deep=1 is healthy again",
        text: `The scheduled health check is getting healthy answers again.\n\nstatus: ${status}\nURL: ${HEALTH_URL}`,
      });
      logger.info({ event: "health_watch_recovered" }, "Scheduled health check recovered");
    }
    _lastStatus = "ok";
  }

  return { ok: !bad, status, alerted, degradedStreak: _degradedStreak };
}

/**
 * Send the digest if it is 07:00 in Sydney and today's has not gone yet.
 * Exported so a test can drive it. Redis holds the "already sent" day, so a
 * worker restart inside the hour cannot send twice.
 */
export async function maybeSendDigest({ now = new Date(), build = buildDailyDigest } = {}) {
  const { day, hour } = sydneyParts(now);
  if (hour !== DIGEST_HOUR_SYDNEY) return { sent: false, reason: "not the hour" };

  // P38 — the claim is in Postgres, and a claim that cannot be read means no send.
  const claim = await claimScheduledRun("dailyDigest", day);
  if (!claim.run) return { sent: false, reason: claim.reason };

  const { subject, text } = await build({ now });
  const result = await sendOperatorEmail({ subject, text });
  logger.info({ event: "daily_digest", day, sent: result.sent }, "Daily digest");
  return { sent: result.sent, day };
}

/**
 * Take the nightly backup if it is 03:00 in Sydney and today's has not run.
 * Phase 1 item 7. Same Redis claim as the digest, for the same reason.
 */
export async function maybeRunBackup({ now = new Date(), run = runNightlyBackup } = {}) {
  const { day, hour } = sydneyParts(now);
  if (hour !== BACKUP_HOUR_SYDNEY) return { ran: false, reason: "not the hour" };

  const claim = await claimScheduledRun("nightlyBackup", day);
  if (!claim.run) return { ran: false, reason: claim.reason };

  const result = await run({ now });
  logger.info({ event: "nightly_backup", day, ok: result.ok }, "Nightly backup attempt");
  return { ran: true, ...result };
}

/**
 * P27 item 2 - reconcile every shop's plan against Shopify, at 04:00 Sydney.
 *
 * Our plan table is a claim; Shopify is the authority. On 16 September the client
 * secret did not match Shopify's, so every billing webhook was rejected with the
 * same 401 every page load got - and nothing recorded the refusals, so afterwards
 * the app could not say which subscription changes it had missed. This asks.
 *
 * READ-ONLY, and it stays that way. A disagreement means somebody is being over-
 * or under-charged, and which direction to correct it is a decision, not a sweep.
 * It emails the owner and changes nothing.
 */
export async function maybeReconcileBilling({ now = new Date(), run = null } = {}) {
  const { day, hour } = sydneyParts(now);
  if (hour !== RECONCILE_HOUR_SYDNEY) return { ran: false, reason: "not the hour" };

  const claim = await claimScheduledRun("billingReconcile", day);
  if (!claim.run) return { ran: false, reason: claim.reason };

  const doRun = run ?? ((await import("./billingReconcile.server.js")).reconcileBilling);
  const result = await doRun({});
  return { ran: true, day, ...result };
}

/** P38b — once a night, drop ScheduledRun markers older than the retention window. */
export async function maybeSweepScheduledRuns({ now = new Date(), sweep = sweepOldScheduledRuns } = {}) {
  const { day, hour } = sydneyParts(now);
  if (hour !== MARKER_SWEEP_HOUR_SYDNEY) return { ran: false, reason: "not the hour" };

  const claim = await claimScheduledRun("scheduledRunSweep", day);
  if (!claim.run) return { ran: false, reason: claim.reason };

  const result = await sweep({ now });
  logger.info({ event: "scheduled_run_swept", day, ...result }, "Swept old scheduled-run markers");
  return { ran: true, day, ...result };
}

/**
 * Is the embedded admin still serving? — the fourth question the brief asks.
 *
 * `/api/health` can be entirely green while `/app` returns a 500. The health
 * endpoint touches the database, Redis, the queue and the breaker; it does not
 * render a single route. A bad deploy that breaks the layout loader, a missing
 * import, a component that throws on render — all of those leave health saying
 * "ok" while every merchant sees an error page.
 *
 * CI's smoke job catches this on the deploy that caused it. This catches it at
 * any other time: a Shopify API change, an expired credential, a route that
 * only fails under a real session.
 *
 * `/app` is an embedded route, so an unauthenticated probe legitimately gets a
 * redirect to authenticate — 200, 302 and 401 are all healthy answers. **5xx is
 * not.** That is the whole test: the server can still produce this route.
 */
export async function checkAppShellOnce({ fetchImpl = fetch, now = Date.now() } = {}) {
  let httpCode = 0;
  let detail = "";

  try {
    const res = await fetchImpl(APP_URL, {
      method: "HEAD",
      redirect: "manual",
      headers: { "user-agent": BROWSER_UA },
      signal: AbortSignal.timeout(20_000),
    });
    httpCode = res.status;
  } catch (err) {
    detail = err.message;
  }

  // No answer at all is already covered by the health probe, which runs against
  // the same host — reporting it twice would be two emails for one outage.
  //
  // Everything else: a browser gets 200 or 302. On 2026-09-09 this probe ran
  // every five minutes for eight hours against a completely broken app and
  // reported it healthy, because it sent no user-agent, the Shopify library
  // classified it as a bot and answered 410, and 410 counted as fine. It was
  // measuring a path that never reaches a loader or the database.
  const OK_CODES = [200, 302];
  const broken = httpCode !== 0 && !OK_CODES.includes(httpCode);
  let alerted = false;

  if (broken) {
    const stale = now - _lastShellAlertAt > REMINDER_AFTER_MS;
    if (!_shellBroken || stale) {
      _lastShellAlertAt = now;
      alerted = true;
      await sendOperatorEmail({
        subject: `Navaal's admin is broken — /app returned ${httpCode}`,
        text: [
          "The health check is passing, but the embedded admin itself will not render.",
          "Every merchant opening the app is seeing an error page right now.",
          "",
          `URL:  ${APP_URL}`,
          `HTTP: ${httpCode}`,
          "",
          "This is almost always the last deploy. Check what shipped:",
          "  curl -s https://app.navaal.ai/api/build-info",
          "and roll back if it does not match a release you trust:",
          "  fly releases -a contentclaude",
          "  fly releases rollback -a contentclaude",
          "",
          "Read prisma/migrations/README.md FIRST if the release ran a migration —",
          "rolling back the image does not roll back the schema.",
        ].join("\n"),
      });
      logger.error({ httpCode, event: "app_shell_broken" }, "The admin shell is returning 5xx");
    }
    _shellBroken = true;
  } else {
    if (_shellBroken) {
      await sendOperatorEmail({
        subject: "Navaal's admin is serving again",
        text: `/app is answering ${httpCode} again.\n\nURL: ${APP_URL}`,
      });
      logger.info({ httpCode, event: "app_shell_recovered" }, "The admin shell recovered");
    }
    _shellBroken = false;
  }

  return { ok: !broken, httpCode, alerted, detail };
}

/** Start the loops. Idempotent; worker-only (the caller enforces that). */
export function startScheduler() {
  if (_healthTimer) return;

  _healthTimer = setInterval(() => {
    checkHealthOnce().catch((err) => logger.error({ err }, "health watch threw"));
    // Separate probe, separate failure: a green health check says nothing about
    // whether the admin actually renders.
    checkAppShellOnce().catch((err) => logger.error({ err }, "app shell watch threw"));
  }, HEALTH_INTERVAL_MS);
  _healthTimer.unref?.();

  // Checked every minute; the Sydney-hour test and the Redis claim decide
  // whether anything is actually sent.
  _digestTimer = setInterval(() => {
    maybeSendDigest().catch((err) => logger.error({ err }, "digest threw"));
    maybeRunBackup().catch((err) => logger.error({ err }, "backup threw"));
    // P2.3 — the catalogue watch. Dynamic import on purpose: that module
    // imports sydneyParts from here, and a static import both ways is a
    // load-order cycle. Same Redis day-claim as the digest inside it.
    //
    // Phase 16 — each of these four now reports its outcome as well as logging
    // it. `weeklyReport` threw on EVERY tick for weeks (its import chain
    // reaches `i18n/catalogues.server.js`, whose bare JSON imports Node's own
    // ESM loader refuses) and `/api/health?deep=1` went on saying the worker
    // was fine, because a tick that dies during import never reaches the job
    // table the health check counts. `runScheduled` keeps the log line
    // unchanged and adds the counter the endpoint can see.
    runScheduled("catalogueWatch", () => import("./catalogueWatch.server.js").then((m) => m.maybeRunCatalogueWatch()), "catalogue watch threw");
    // P3.1 — the crawl-time holdout (03:00 Sydney) and P3.6 — the weekly
    // report (Monday 09:00 Sydney). Same dynamic-import reason, same day-claim.
    runScheduled("crawlHoldout", () => import("./crawlHoldout.server.js").then((m) => m.maybeRunCrawlHoldout()), "crawl holdout threw");
    runScheduled("weeklyReport", () => import("./weeklyReport.server.js").then((m) => m.maybeSendWeeklyReports()), "weekly report threw");
    // Phase 10 Part B — the funnel digest to the owner (Monday 08:30 Sydney).
    runScheduled("funnelDigest", () => import("./funnel.server.js").then((m) => m.maybeSendFunnelDigest()), "funnel digest threw");
    // P27 item 2 - the billing reconciliation (04:00 Sydney). Registered here so it
    // appears in the job table the deep health check reads: a reconciliation that
    // silently stopped running would be the same shape of failure it exists to catch.
    runScheduled("billingReconcile", () => maybeReconcileBilling(), "billing reconcile threw");
    runScheduled("scheduledRunSweep", () => maybeSweepScheduledRuns(), "scheduled-run sweep threw");
  }, 60_000);
  _digestTimer.unref?.();

  // Uninstall and redaction deletion now runs AFTER the 200 so the webhook
  // answers in milliseconds. This is the net under that: it finds work that was
  // acknowledged but never finished — a deploy or a machine stop mid-deletion —
  // and completes it. In the worker, so it runs exactly once.
  _sweepTimer = setInterval(() => {
    sweepUnfinishedWebhookWork().catch((err) => logger.error({ err }, "webhook sweep threw"));
  }, WEBHOOK_SWEEP_INTERVAL_MS);
  _sweepTimer.unref?.();

  // INFRA2 — retention. Without this the log table grows for ever, which turns
  // a fix for missing history into a slow database problem. Hourly rather than
  // daily so a restart never skips a day, and `deleteMany` on an indexed
  // `createdAt` is cheap when there is nothing to delete.
  _logSweepTimer = setInterval(() => {
    sweepOldLogs()
      .then((r) => {
        if (r.deleted > 0) {
          logger.info(
            { deleted: r.deleted, cutoff: r.cutoff, event: "log_retention_swept" },
            "Swept log events past the retention window",
          );
        }
      })
      .catch((err) => logger.error({ err }, "log retention sweep threw"));
  }, LOG_SWEEP_INTERVAL_MS);
  _logSweepTimer.unref?.();

  logger.info(
    {
      healthEveryMs: HEALTH_INTERVAL_MS,
      digestHourSydney: DIGEST_HOUR_SYDNEY,
      healthUrl: HEALTH_URL,
      appUrl: APP_URL,
      degradedProbesBeforeAlert: DEGRADED_PROBES_BEFORE_ALERT,
      webhookSweepEveryMs: WEBHOOK_SWEEP_INTERVAL_MS,
      logSweepEveryMs: LOG_SWEEP_INTERVAL_MS,
      logRetentionDays: RETENTION_DAYS,
    },
    "Operator scheduler started",
  );
}

export function stopScheduler() {
  if (_healthTimer) clearInterval(_healthTimer);
  if (_digestTimer) clearInterval(_digestTimer);
  if (_sweepTimer) clearInterval(_sweepTimer);
  _healthTimer = null;
  _digestTimer = null;
  _sweepTimer = null;
}
