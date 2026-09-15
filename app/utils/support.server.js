/**
 * P6.2 — the mechanism behind a promise the listing already makes.
 *
 * `12-OFFER.md` §6 put **"Email support from the founder"** and **"Questions
 * answered within 1 business day"** on the live App Store listing. Those are
 * live in front of merchants right now, and what stood behind them was a
 * `mailto:` link in the app footer.
 *
 * A mailto: is not a mechanism. It fails silently in every direction that
 * matters: the merchant's browser may have no mail client configured, the mail
 * may go to spam, and in every failure case **nobody learns a question was
 * asked — including us.** `09-DOCTRINE.md` is explicit that at 0 reviews a
 * single unmet promise halves the rating, and "I emailed and heard nothing" is
 * the review that does it.
 *
 * ── THE ROW IS THE RECORD. THE EMAIL IS AN ATTEMPT ON TOP OF IT. ───────────
 *
 * The question is written to the database FIRST and the email is sent after. If
 * the email fails, the question still exists with `emailedAt: null`, and the
 * owner can find every one of them. The merchant is told which of those two
 * happened rather than a cheerful "Sent!" that might be false.
 *
 * That ordering is the whole design. Emailing first and storing second would
 * mean a database failure loses a question we have already told the merchant we
 * received.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { sendOperatorEmail, OPERATOR_EMAIL } from "./notify.server.js";
// The pure half. The SCREEN needs the bounds and the rules, and importing
// them from here would pull Prisma and the email client into the client
// bundle — React Router's build refuses that, which is how the split arose.
// Re-exported so a caller never has to import both, same as candidates.server.js.
import { validateSupportRequest, OPEN_LIMIT, SUPPORT_ERRORS } from "./support.js";
import { enT } from "../i18n/index.js";
export * from "./support.js";

/**
 * Record a merchant's question, then try to email it.
 *
 * @returns {Promise<{ok: boolean, emailed: boolean, id?: string, error?: string}>}
 *   `ok` means THE QUESTION IS SAFE. `emailed` means it also reached the inbox.
 *   They are separate on purpose: the merchant is told the truth about both.
 */
export async function submitSupportRequest({ shop, replyTo, subject, message, planName, t = enT }) {
  const valid = validateSupportRequest({ replyTo, subject, message }, t);
  if (!valid.ok) return { ok: false, emailed: false, error: valid.error };

  // A brake on volume, not a gate on need — and it counts OPEN requests only,
  // so a merchant who has had ten answered is not locked out.
  try {
    const open = await prisma.supportRequest.count({ where: { shop, status: "open" } });
    if (open >= OPEN_LIMIT) {
      return {
        ok: false,
        emailed: false,
        error: t(SUPPORT_ERRORS.tooManyOpen, { open }),
      };
    }
  } catch {
    // A failed count must not stop a merchant asking for help.
  }

  let row;
  try {
    row = await prisma.supportRequest.create({
      data: {
        shop,
        replyTo: valid.clean.replyTo,
        subject: valid.clean.subject,
        message: valid.clean.message,
        planName: planName ?? null,
        appSha: process.env.GIT_SHA ?? null,
      },
    });
  } catch (err) {
    // THIS is the only case where the merchant must be told to email directly —
    // we genuinely do not have their question.
    logger.error({ shop, err: err?.message, event: "support_request_not_stored" }, "support request could not be stored");
    return {
      ok: false,
      emailed: false,
      error: t(SUPPORT_ERRORS.notStored, { email: OPERATOR_EMAIL }),
    };
  }

  // The question is safe from here. Everything below is best-effort.
  //
  // `sendOperatorEmail` returns `{ sent, reason }`, NOT a boolean. Writing
  // `const sent = await sendOperatorEmail(...)` and then `if (sent)` treats a
  // FAILED send as a success, because an object is always truthy — and the
  // merchant would be told "emailed" for a message that never left. I wrote it
  // that way first. The `=== true` is deliberate and load-bearing.
  const result = await sendOperatorEmail({
    subject: `[Support] ${valid.clean.subject}`,
    text: [
      `Shop:     ${shop}`,
      `Plan:     ${planName ?? "unknown"}`,
      `Reply to: ${valid.clean.replyTo}`,
      `App:      ${process.env.GIT_SHA ?? "unknown"}`,
      `Ref:      ${row.id}`,
      "",
      valid.clean.message,
    ].join("\n"),
  }).catch(() => ({ sent: false, reason: "threw" }));

  const sent = result?.sent === true;

  if (sent) {
    await prisma.supportRequest
      .update({ where: { id: row.id }, data: { emailedAt: new Date() } })
      .catch(() => {});
  } else {
    // Not silent. An un-emailed question is exactly what the daily check looks
    // for, and it is logged at WARN so it reaches the durable log and Sentry.
    logger.warn(
      { shop, id: row.id, event: "support_request_not_emailed" },
      "support request stored but NOT emailed — it is in the database and needs picking up",
    );
  }

  return { ok: true, emailed: !!sent, id: row.id };
}

/** Open questions, newest first. For the owner's diagnostic. */
export async function openSupportRequests(limit = 50) {
  return prisma.supportRequest.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
