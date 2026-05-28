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

async function getSentry() {
  if (_sentry !== null) return _sentry;
  if (!process.env.SENTRY_DSN) {
    _sentry = false;
    return false;
  }
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
      tracesSampleRate: 0.1,
      integrations: [],
    });
    _sentry = Sentry;
    logger.info("Sentry error monitoring initialized");
    return Sentry;
  } catch (err) {
    logger.warn({ err: err.message }, "Sentry @sentry/node not installed — run: npm install @sentry/node");
    _sentry = false;
    return false;
  }
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
