/**
 * Operator email — Phase 1 item 5.
 *
 * The owner has to be TOLD, not have to look. On 2026-09-09 a corrupted
 * DATABASE_URL took production down for twenty minutes and nothing said a word:
 * `/api/health` returned 503 exactly as designed, and nobody was calling it.
 * A correct health endpoint that nothing polls is a log line, not an alert.
 *
 * One provider, chosen because it needs nothing but an API key and an HTTP call:
 * Resend. If `RESEND_API_KEY` is absent, this does NOT silently succeed — it
 * logs at error level with the full message body, so the alert still lands
 * somewhere a human looks (the logs, and Sentry via the error handler) and the
 * missing configuration is itself visible.
 */
import logger from "./logger.server.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Where operator alerts go. Not a merchant-facing address. */
export const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL || "hello@navaal.ai";
/** Resend requires a verified sender domain; navaal.ai is the one we own. */
const FROM = process.env.OPERATOR_EMAIL_FROM || "Navaal Ops <ops@navaal.ai>";

/**
 * Send an operator email. Never throws — an alerting path that can crash the
 * thing it is watching is worse than no alerting.
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendOperatorEmail({ subject, text }) {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    // Loud on purpose. This is the message that was going to be sent.
    logger.error(
      { event: "operator_alert_undeliverable", subject, body: text },
      `ALERT (no email provider configured): ${subject}`,
    );
    return { sent: false, reason: "RESEND_API_KEY not set" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: FROM, to: [OPERATOR_EMAIL], subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error(
        { event: "operator_alert_failed", status: res.status, subject, body: body.slice(0, 500) },
        `ALERT could not be emailed: ${subject}`,
      );
      return { sent: false, reason: `HTTP ${res.status}` };
    }
    logger.info({ event: "operator_alert_sent", subject, to: OPERATOR_EMAIL }, "Operator email sent");
    return { sent: true };
  } catch (err) {
    logger.error(
      { event: "operator_alert_failed", err: err.message, subject, body: text },
      `ALERT could not be emailed: ${subject}`,
    );
    return { sent: false, reason: err.message };
  }
}

/**
 * P3.6 (Phase 8) — one email to one merchant. Same transport, same "never
 * throws"; the difference is the recipient is the store's own contact address
 * and the sender reads as the app, not ops. Returns { sent, reason? }.
 */
export async function sendEmailTo({ to, subject, text, from = process.env.MERCHANT_EMAIL_FROM || "Navaal <hello@navaal.ai>" }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !subject || !text) return { sent: false, reason: "missing fields" };
  if (!apiKey) {
    logger.warn({ event: "merchant_email_unconfigured", subject }, "merchant email not sent: RESEND_API_KEY unset");
    return { sent: false, reason: "unconfigured" };
  }
  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!r.ok) {
      logger.warn({ event: "merchant_email_failed", status: r.status, subject }, "merchant email failed");
      return { sent: false, reason: `resend ${r.status}` };
    }
    return { sent: true };
  } catch (err) {
    logger.warn({ event: "merchant_email_failed", err: err?.message, subject }, "merchant email threw");
    return { sent: false, reason: err?.message ?? "failed" };
  }
}
