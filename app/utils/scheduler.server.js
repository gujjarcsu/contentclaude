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
import { getRedis } from "./cache.server.js";
import { runNightlyBackup } from "./backup.server.js";

const HEALTH_INTERVAL_MS = 5 * 60 * 1000;
const HEALTH_URL = `${(process.env.SHOPIFY_APP_URL || "https://app.navaal.ai").replace(/\/$/, "")}/api/health?deep=1`;

/** Do not send the same alarm every five minutes for hours. */
const REALERT_AFTER_MS = 60 * 60 * 1000;
/** Digest bookkeeping lives in Redis so a worker restart cannot double-send. */
const DIGEST_KEY = "ops:digest:lastSentDay";
const DIGEST_HOUR_SYDNEY = 7;
/** Backups run at 03:00 Sydney — quiet hours, well clear of the digest. */
const BACKUP_KEY = "ops:backup:lastRunDay";
const BACKUP_HOUR_SYDNEY = 3;

let _healthTimer = null;
let _digestTimer = null;
// In-memory is enough for the alert state: a worker restart re-alerting once on
// a genuinely broken system is the correct behaviour, not a bug.
let _lastAlertAt = 0;
let _lastStatus = "ok";

/** The current hour and calendar day in Sydney, whatever the machine's clock is set to. */
export function sydneyParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
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

  if (bad) {
    const recovered = _lastStatus === "ok";
    const stale = now - _lastAlertAt > REALERT_AFTER_MS;
    // Alert on the transition into trouble, then at most hourly while it lasts.
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

  return { ok: !bad, status, alerted };
}

/**
 * Send the digest if it is 07:00 in Sydney and today's has not gone yet.
 * Exported so a test can drive it. Redis holds the "already sent" day, so a
 * worker restart inside the hour cannot send twice.
 */
export async function maybeSendDigest({ now = new Date(), build = buildDailyDigest } = {}) {
  const { day, hour } = sydneyParts(now);
  if (hour !== DIGEST_HOUR_SYDNEY) return { sent: false, reason: "not the hour" };

  try {
    const redis = await getRedis();
    if (redis) {
      // NX means the first caller in the hour wins and the rest are no-ops.
      const claimed = await redis.set(DIGEST_KEY, day, "EX", 36 * 3600, "NX");
      if (!claimed) {
        const current = await redis.get(DIGEST_KEY);
        if (current === day) return { sent: false, reason: "already sent today" };
        await redis.set(DIGEST_KEY, day, "EX", 36 * 3600);
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, "digest: could not claim the day, sending anyway");
  }

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

  try {
    const redis = await getRedis();
    if (redis) {
      const claimed = await redis.set(BACKUP_KEY, day, "EX", 36 * 3600, "NX");
      if (!claimed && (await redis.get(BACKUP_KEY)) === day) {
        return { ran: false, reason: "already ran today" };
      }
      if (!claimed) await redis.set(BACKUP_KEY, day, "EX", 36 * 3600);
    }
  } catch (err) {
    logger.warn({ err: err.message }, "backup: could not claim the day, running anyway");
  }

  const result = await run({ now });
  logger.info({ event: "nightly_backup", day, ok: result.ok }, "Nightly backup attempt");
  return { ran: true, ...result };
}

/** Start the loops. Idempotent; worker-only (the caller enforces that). */
export function startScheduler() {
  if (_healthTimer) return;

  _healthTimer = setInterval(() => {
    checkHealthOnce().catch((err) => logger.error({ err }, "health watch threw"));
  }, HEALTH_INTERVAL_MS);
  _healthTimer.unref?.();

  // Checked every minute; the Sydney-hour test and the Redis claim decide
  // whether anything is actually sent.
  _digestTimer = setInterval(() => {
    maybeSendDigest().catch((err) => logger.error({ err }, "digest threw"));
    maybeRunBackup().catch((err) => logger.error({ err }, "backup threw"));
  }, 60_000);
  _digestTimer.unref?.();

  logger.info(
    { healthEveryMs: HEALTH_INTERVAL_MS, digestHourSydney: DIGEST_HOUR_SYDNEY, healthUrl: HEALTH_URL },
    "Operator scheduler started",
  );
}

export function stopScheduler() {
  if (_healthTimer) clearInterval(_healthTimer);
  if (_digestTimer) clearInterval(_digestTimer);
  _healthTimer = null;
  _digestTimer = null;
}
