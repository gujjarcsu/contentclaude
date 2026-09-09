/**
 * Short-lived HMAC signatures for PUBLIC callback URLs.
 *
 * Phase 0 item 20 — /billing/callback takes `?shop=` and, with nothing else,
 * used the shop's offline token to ask Shopify for that shop's subscription
 * state and then wrote the result to the database. Anyone could call it for any
 * installed shop: an unauthenticated oracle for another merchant's plan, a way
 * to burn their Admin API budget, and a cache-busting lever — all from a URL
 * with no secret in it.
 *
 * The callback URL is built by us, so we can sign it. The signature covers the
 * shop and an expiry, so a captured link is useless a few hours later and
 * cannot be repointed at a different store.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Callback links are only meant to be followed once, minutes after issue. */
export const SIGNED_URL_TTL_MS = 6 * 60 * 60 * 1000;

function secret() {
  return process.env.SHOPIFY_API_SECRET || "";
}

/** base64url, so the value survives a query string untouched. */
function sign(payload, key) {
  return createHmac("sha256", key).update(payload, "utf8").digest("base64url");
}

/**
 * @returns {{sig: string, exp: string}} params to append to the callback URL
 */
export function signShopCallback(shop, { now = Date.now(), ttlMs = SIGNED_URL_TTL_MS, key = secret() } = {}) {
  const exp = String(now + ttlMs);
  return { sig: sign(`${shop}|${exp}`, key), exp };
}

/**
 * Verify a signed callback. Never throws.
 * @returns {{ok: boolean, reason?: "missing"|"expired"|"bad_signature"|"no_secret"}}
 */
export function verifyShopCallback(shop, { sig, exp } = {}, { now = Date.now(), key = secret() } = {}) {
  if (!key) return { ok: false, reason: "no_secret" };
  if (!sig || !exp) return { ok: false, reason: "missing" };

  const expiryMs = Number(exp);
  if (!Number.isFinite(expiryMs)) return { ok: false, reason: "bad_signature" };
  if (now > expiryMs) return { ok: false, reason: "expired" };

  const expected = Buffer.from(sign(`${shop}|${exp}`, key));
  const given = Buffer.from(String(sig));
  if (expected.length !== given.length) return { ok: false, reason: "bad_signature" };
  return timingSafeEqual(expected, given) ? { ok: true } : { ok: false, reason: "bad_signature" };
}
