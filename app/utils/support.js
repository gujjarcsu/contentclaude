/**
 * P6.2 — the pure half of the support surface.
 *
 * Split from `support.server.js` for the reason this codebase already splits
 * `candidates.js` from `candidates.server.js`: the SCREEN needs the bounds and
 * the validation rules, and importing them from a `.server.js` pulls Prisma and
 * the email client into the client bundle. React Router's build catches that
 * and refuses, which is how this file came to exist.
 *
 * The validation lives HERE rather than only on the server so the field limits
 * a merchant sees are the same numbers the action enforces. A form that lets
 * you type 5,000 characters and then rejects them is a worse failure than one
 * that stops you at 4,000.
 *
 * No server-only imports. Safe in a route component.
 */
import { OPERATOR_EMAIL_PUBLIC } from "./supportContact.js";
import { T, enT } from "../i18n/index.js";

/** D1 — every sentence the support form can answer with, as a catalogue key. */
export const SUPPORT_ERRORS = Object.freeze({
  email: T("We need an email address we can reply to. Please check it and try again."),
  subject: T("Please add a subject, so we know what this is about."),
  subjectLong: T("Subject is a little long — keep it under {max} characters."),
  message: T("Please tell us a bit more — a sentence or two is enough."),
  messageLong: T("That is longer than we can take here ({max} characters). Email {email} directly."),
  tooManyOpen: T("You already have {open} questions open with us. We will work through those first — reply to any of them and it reaches the same place."),
  notStored: T("We could not save that, and we would rather say so than lose your question. Please email {email} directly."),
});
export const SUPPORT_ERROR_KEYS = Object.freeze(Object.values(SUPPORT_ERRORS));

/** Bounds, so one merchant cannot fill the table or the owner's inbox. */
export const SUBJECT_MAX = 120;
export const MESSAGE_MAX = 4000;
/** Open requests one shop may hold at once. Generous; a brake, not a gate. */
export const OPEN_LIMIT = 10;

/**
 * An address we can actually reply to.
 *
 * Deliberately permissive — the job of this check is to catch a typo that would
 * make the promise unkeepable, not to adjudicate RFC 5322. Rejecting a valid
 * unusual address is a worse failure than accepting an invalid one, because the
 * merchant is standing there with a problem and we have just refused to hear it.
 */
export function looksLikeEmail(value) {
  const v = String(value ?? "").trim();
  return v.length >= 5 && v.length <= 254 && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(v);
}

/**
 * Validate a submission. Returns `{ ok: true, clean }` or `{ ok: false, error }`
 * with a sentence a merchant can act on.
 */
export function validateSupportRequest({ replyTo, subject, message }, t = enT) {
  const r = String(replyTo ?? "").trim();
  const s = String(subject ?? "").trim();
  const m = String(message ?? "").trim();

  if (!looksLikeEmail(r)) {
    return { ok: false, error: t(SUPPORT_ERRORS.email) };
  }
  if (s.length === 0) return { ok: false, error: t(SUPPORT_ERRORS.subject) };
  if (s.length > SUBJECT_MAX) {
    return { ok: false, error: t(SUPPORT_ERRORS.subjectLong, { max: SUBJECT_MAX }) };
  }
  if (m.length < 10) {
    return { ok: false, error: t(SUPPORT_ERRORS.message) };
  }
  if (m.length > MESSAGE_MAX) {
    return { ok: false, error: t(SUPPORT_ERRORS.messageLong, { max: MESSAGE_MAX, email: OPERATOR_EMAIL_PUBLIC }) };
  }
  return { ok: true, clean: { replyTo: r, subject: s, message: m } };
}
