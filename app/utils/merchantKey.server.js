/**
 * C0.7 / P5.5 — bring your own AI key, at Pro.
 *
 * The decision this implements is recorded in `04-DECISIONS.md` and was made
 * before any of this was written: **a generation run on a merchant's own key
 * costs them ZERO credits, and is still RECORDED.** A credit is a unit of model
 * spend; when the merchant pays for the inference there is no spend to charge
 * for. Charging anyway would mean paying us $79.99, paying Anthropic, and still
 * being capped at 4,000 — a trade no merchant would take, which would make the
 * feature a promise on a plan card that nobody can use.
 *
 * ── The rules that are not negotiable (L9) ─────────────────────────────────
 *
 * The key is stored encrypted; it is **never logged, never returned to the
 * client, never in an error message — not the key, not a prefix, not a length**.
 * Nothing in this file returns key material to a caller outside the generation
 * path, and `keyStatusFor()` is the shape every loader must use.
 *
 * ── Why validation on save is required rather than nice ────────────────────
 *
 * A key that first fails at 2am halfway through a bulk job is a support ticket
 * and a refund. One real, cheap call at save time turns that into a form error
 * the merchant can act on while they still have the key on their clipboard.
 *
 * ── Why a failure PAUSES rather than falling back ──────────────────────────
 *
 * Silently continuing on our key would spend our money on work the merchant
 * believes they are paying for themselves, and would do it invisibly. The job
 * stops and says so.
 */
import prisma from "../db.server.js";
import logger from "./logger.server.js";
import { encrypt, decrypt, isEnabled } from "./secretBox.server.js";
import { getEntitlements } from "./billing-plans.js";

/** The plan that may attach its own key. Read from the table, never typed. */
export const BYOK_PLAN = "pro";

/** One cheap real call. One token out is enough to prove the key authenticates. */
const VALIDATE_MODEL = "claude-haiku-4-5-20251001";
const VALIDATE_MAX_TOKENS = 1;

/**
 * Is this shop allowed to attach a key?
 *
 * Pro only, and only when the deployment is configured to encrypt. A merchant
 * on a plan without the entitlement never sees the card.
 */
export function canUseOwnKey(planName) {
  return isEnabled() && planName === BYOK_PLAN && getEntitlements(planName) !== null;
}

/**
 * What a LOADER may know about a merchant's key.
 *
 * Booleans and one timestamp. Never the key, never a prefix, never a length —
 * this is the shape that makes it impossible for a route to serialise key
 * material into a page by accident.
 *
 * @returns {Promise<{configured: boolean, saved: boolean, validatedAt: string|null,
 *   failing: boolean}>}
 */
export async function keyStatusFor(shop) {
  const configured = isEnabled();
  if (!configured) return { configured: false, saved: false, validatedAt: null, failing: false };
  const row = await prisma.shop
    .findUnique({
      where: { shop },
      select: { aiKeyCiphertext: true, aiKeyValidatedAt: true, aiKeyFailedAt: true },
    })
    .catch(() => null);
  return {
    configured: true,
    saved: !!row?.aiKeyCiphertext,
    validatedAt: row?.aiKeyValidatedAt?.toISOString() ?? null,
    failing: !!row?.aiKeyFailedAt,
  };
}

/**
 * Prove a key works, with one real call.
 *
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>} `reason` is a
 *   short code for the UI to turn into a sentence. It NEVER contains anything
 *   derived from the key, including Anthropic's own error text — an upstream
 *   message can echo a request header, and this is the one place that would
 *   leak into a merchant-visible banner.
 */
export async function validateKey(key) {
  if (typeof key !== "string" || key.trim().length === 0) return { ok: false, reason: "empty" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: VALIDATE_MODEL,
        max_tokens: VALIDATE_MAX_TOKENS,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "rejected" };
    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    // Deliberately not res.statusText and never the body: an upstream error
    // body can echo the request, and this string reaches a merchant's screen.
    return { ok: false, reason: "upstream" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/**
 * Store a validated key.
 *
 * Validation happens HERE rather than in the caller, so there is no path that
 * saves an unvalidated key — a caller that forgot to validate is a caller that
 * ships a 2am failure.
 */
export async function saveKey(shop, key) {
  if (!isEnabled()) return { ok: false, reason: "not_configured" };
  const check = await validateKey(key);
  if (!check.ok) return check;
  try {
    const { ciphertext, iv, tag } = encrypt(key.trim());
    await prisma.shop.update({
      where: { shop },
      data: {
        aiKeyCiphertext: ciphertext,
        aiKeyIv: iv,
        aiKeyTag: tag,
        aiKeyValidatedAt: new Date(),
        // A newly validated key clears the failure flag: this is the merchant
        // fixing the thing we told them about.
        aiKeyFailedAt: null,
      },
    });
    // Note what is NOT in this log line. Not the key, not a prefix, not a length.
    logger.info({ shop, event: "byok_saved" }, "merchant AI key saved and validated");
    return { ok: true };
  } catch (err) {
    logger.warn({ shop, event: "byok_save_failed", err: err?.message }, "merchant AI key save failed");
    return { ok: false, reason: "storage" };
  }
}

/** Remove a merchant's key. Always succeeds from the merchant's point of view. */
export async function removeKey(shop) {
  try {
    await prisma.shop.update({
      where: { shop },
      data: {
        aiKeyCiphertext: null,
        aiKeyIv: null,
        aiKeyTag: null,
        aiKeyValidatedAt: null,
        aiKeyFailedAt: null,
      },
    });
    logger.info({ shop, event: "byok_removed" }, "merchant AI key removed");
    return true;
  } catch (err) {
    logger.warn({ shop, err: err?.message }, "merchant AI key removal failed");
    return false;
  }
}

/**
 * The key a generation for this shop should actually use.
 *
 * Returns `{ key: null, byok: false }` when there is no usable merchant key, and
 * the caller falls back to ours — which is correct for a shop that never
 * attached one. It is NOT correct after an auth failure, which is why
 * `aiKeyFailedAt` short-circuits: a job must refuse rather than quietly move the
 * bill back to us.
 *
 * @returns {Promise<{key: string|null, byok: boolean, blocked: boolean}>}
 */
export async function resolveKeyFor(shop, planName) {
  if (!canUseOwnKey(planName)) return { key: null, byok: false, blocked: false };
  const row = await prisma.shop
    .findUnique({
      where: { shop },
      select: {
        aiKeyCiphertext: true,
        aiKeyIv: true,
        aiKeyTag: true,
        aiKeyValidatedAt: true,
        aiKeyFailedAt: true,
      },
    })
    .catch(() => null);
  if (!row?.aiKeyCiphertext) return { key: null, byok: false, blocked: false };
  if (row.aiKeyFailedAt) {
    // Known-bad. Refuse up front instead of failing halfway through a run.
    return { key: null, byok: true, blocked: true };
  }
  const key = decrypt({ ciphertext: row.aiKeyCiphertext, iv: row.aiKeyIv, tag: row.aiKeyTag });
  if (!key) {
    // Undecryptable: a rotated BYOK_ENCRYPTION_KEY, or a tampered row. Treated
    // exactly like a failure, because the merchant has to re-enter it either way.
    logger.warn({ shop, event: "byok_undecryptable" }, "stored merchant key could not be decrypted");
    return { key: null, byok: true, blocked: true };
  }
  return { key, byok: true, blocked: false };
}

/**
 * Mark a merchant's key as failing, so the next job refuses up front.
 *
 * First-writer-wins on null so a burst of concurrent failures inside one bulk
 * job writes once and does not stamp a later time on every retry.
 */
export async function markKeyFailing(shop) {
  try {
    const r = await prisma.shop.updateMany({
      where: { shop, aiKeyFailedAt: null },
      data: { aiKeyFailedAt: new Date() },
    });
    if (r.count > 0) {
      logger.warn({ shop, event: "byok_failing" }, "merchant AI key rejected mid-job — pausing");
    }
    return r.count > 0;
  } catch {
    return false;
  }
}

/**
 * Is this error the merchant's key being rejected, as opposed to anything else?
 *
 * Only 401/403 count. A 429, a 500 or a timeout is Anthropic having a moment and
 * must NOT put a merchant's working key into a failed state — that would turn a
 * transient upstream blip into a support ticket and a re-paste.
 */
export function isAuthFailure(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 401 || status === 403) return true;
  return /\b(401|403)\b/.test(String(err?.message ?? ""));
}

/** The one sentence a merchant sees when their key stops working. */
export const BYOK_PAUSED_MESSAGE =
  "Your own AI key was rejected, so this job stopped rather than continuing on our key. " +
  "Check the key in Settings and save it again to resume.";
