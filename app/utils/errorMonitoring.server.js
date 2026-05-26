/**
 * Error monitoring — production-ready placeholder.
 *
 * To integrate Sentry:
 *   npm install @sentry/node
 *   Add SENTRY_DSN to your environment variables.
 *   Uncomment the Sentry lines below.
 *
 * To integrate Honeybadger:
 *   npm install @honeybadger-io/js
 *   Add HONEYBADGER_API_KEY to your environment variables.
 */

// import * as Sentry from "@sentry/node";
// Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });

import logger from "./logger.server.js";

/**
 * Capture an unexpected exception.
 * @param {Error} error
 * @param {Record<string, unknown>} [context]  Extra data attached to the report.
 */
export function captureException(error, context = {}) {
  logger.error({ err: error, ...context }, error?.message ?? "Unhandled exception");

  // TODO: uncomment when Sentry is configured
  // Sentry.captureException(error, { extra: context });
}

/**
 * Capture a non-fatal message (e.g. a recoverable warning worth tracking).
 * @param {string} message
 * @param {"info"|"warning"|"error"} [level]
 * @param {Record<string, unknown>} [context]
 */
export function captureMessage(message, level = "warning", context = {}) {
  const pinoLevel = level === "error" ? "error" : level === "warning" ? "warn" : "info";
  logger[pinoLevel]({ ...context }, message);

  // TODO: uncomment when Sentry is configured
  // Sentry.captureMessage(message, { level, extra: context });
}
