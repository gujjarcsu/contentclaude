/**
 * Error monitoring — Sentry integration with structured-log fallback.
 *
 * Configuration:
 *   1. npm install @sentry/node
 *   2. Set SENTRY_DSN in your environment (.env.example has the key).
 *   3. Set SENTRY_ENVIRONMENT (defaults to NODE_ENV).
 *
 * Without SENTRY_DSN, all events are only written to the structured logger.
 * This is acceptable in development; in production you MUST set SENTRY_DSN
 * or errors will be invisible to your team.
 */

import logger from "./logger.server.js";

let _sentry = null;
let _initPromise = null;

/**
 * Phase 0 item 25 — initialise Sentry EAGERLY at boot.
 *
 * Init used to happen lazily, on the first captureException. Two consequences:
 * the global handlers Sentry installs at init (unhandled rejections,
 * uncaught exceptions) were never active until something had already been
 * reported by hand — which is exactly backwards, since those handlers exist to
 * catch what nothing reports by hand; and the very first error of a process was
 * racing the SDK import. `captureException` was also called in only two places
 * in the entire app, so in practice almost nothing reached Sentry at all.
 *
 * Called from startup.server.js at boot and awaited by the capture helpers.
 */
export function initErrorMonitoring() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (!process.env.SENTRY_DSN) {
      if (process.env.NODE_ENV === "production") {
        logger.warn("SENTRY_DSN is not set — runtime errors will not be reported anywhere but the logs");
      }
      _sentry = false;
      return false;
    }
    try {
      const Sentry = await import("@sentry/node");
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
        release: process.env.GIT_SHA || undefined,
        tracesSampleRate: 0.1,
        integrations: [],
      });
      _sentry = Sentry;
      logger.info({ release: process.env.GIT_SHA || "unknown" }, "Sentry error monitoring initialised");
      return Sentry;
    } catch (err) {
      logger.warn({ err: err.message }, "Sentry @sentry/node not available — errors go to the logs only");
      _sentry = false;
      return false;
    }
  })();
  return _initPromise;
}

async function getSentry() {
  if (_sentry !== null) return _sentry;
  return initErrorMonitoring();
}

/**
 * Phase 0 item 25 — a rejected promise nobody awaited, and an exception that
 * escaped every handler, are precisely the failures that never reach a manual
 * captureException call. Registered once, at boot.
 */
export function installProcessErrorHandlers() {
  if (globalThis.__navaalProcessHandlers) return;
  globalThis.__navaalProcessHandlers = true;

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(`Unhandled rejection: ${String(reason)}`);
    captureException(err, { source: "unhandledRejection" }).catch(() => {});
  });

  process.on("uncaughtException", (err) => {
    // Report, then let the process die as Node intends — a process that keeps
    // running after an uncaught exception is in an unknown state.
    captureException(err, { source: "uncaughtException" }).catch(() => {});
    logger.fatal?.({ err }, "Uncaught exception — exiting");
  });
}

/**
 * Capture an unexpected exception.
 * @param {Error} error
 * @param {Record<string, unknown>} [context]  Extra data attached to the report.
 */
export async function captureException(error, context = {}) {
  logger.error({ err: error, ...context }, error?.message ?? "Unhandled exception");

  const Sentry = await getSentry();
  if (Sentry) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  }
}

/**
 * Capture a non-fatal message (e.g. a recoverable warning worth tracking).
 * @param {string} message
 * @param {"info"|"warning"|"error"} [level]
 * @param {Record<string, unknown>} [context]
 */
export async function captureMessage(message, level = "warning", context = {}) {
  const pinoLevel = level === "error" ? "error" : level === "warning" ? "warn" : "info";
  logger[pinoLevel]({ ...context }, message);

  const Sentry = await getSentry();
  if (Sentry) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureMessage(message, level);
    });
  }
}
