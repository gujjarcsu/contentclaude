/**
 * C0.7 / P5.5 — encryption for a merchant's own AI key.
 *
 * This is the only place in the app that holds a secret belonging to someone
 * else. `04-DECISIONS.md` states the rule and L9 restates it: the key is stored
 * **encrypted** and is **never logged, never returned to the client, never in an
 * error message — not the key, not a prefix, not a length.**
 *
 * ── Why AES-256-GCM and not something simpler ──────────────────────────────
 *
 * GCM is authenticated: a ciphertext that has been altered fails to decrypt
 * rather than decrypting to garbage that then gets sent to Anthropic as if it
 * were a key. The auth tag is stored beside the ciphertext for that reason.
 *
 * The IV is random per encryption and stored with the record. Reusing an IV
 * under one key is the classic way to break GCM, so it is generated fresh on
 * every write and never derived from the shop domain or anything else stable.
 *
 * ── Fail CLOSED ────────────────────────────────────────────────────────────
 *
 * Without `BYOK_ENCRYPTION_KEY` the feature is OFF: `isEnabled()` returns false,
 * the Settings card says the feature is unavailable, and `encrypt()` throws
 * rather than storing anything. The alternative — falling back to a derived or
 * default key — would mean a merchant's API key sitting in the database
 * protected by a value that is in the source tree. There is no version of that
 * which is acceptable, so there is no fallback.
 *
 * ── Key separation ─────────────────────────────────────────────────────────
 *
 * Its own secret, not `SHOPIFY_API_SECRET`. That value is used to verify webhook
 * HMACs and is handled by library code we do not control; widening its blast
 * radius to include merchants' AI keys is not a trade worth making to save one
 * `fly secrets import`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits — the size GCM is specified for
const KEY_BYTES = 32;

/**
 * The key material, read lazily so the module can be imported anywhere.
 * Returns null when unset or malformed — never throws on import.
 */
function keyMaterial() {
  const raw = process.env.BYOK_ENCRYPTION_KEY;
  if (!raw) return null;
  let buf;
  try {
    buf = Buffer.from(String(raw).trim(), "base64");
  } catch {
    return null;
  }
  // A wrong-length key is a misconfiguration, not a merchant problem. Treating
  // it as "feature off" is right: it means no key can be stored, rather than
  // keys being stored under something weak.
  return buf.length === KEY_BYTES ? buf : null;
}

/** Whether bring-your-own-key can be offered at all on this deployment. */
export function isEnabled() {
  return keyMaterial() !== null;
}

/**
 * Encrypt a merchant secret.
 *
 * @returns {{ciphertext: string, iv: string, tag: string}} all base64
 * @throws if the feature is not configured — deliberately, so a misconfigured
 *   deployment cannot silently store a key it cannot protect.
 */
export function encrypt(plaintext) {
  const key = keyMaterial();
  if (!key) throw new Error("BYOK_NOT_CONFIGURED");
  if (typeof plaintext !== "string" || plaintext === "") {
    throw new Error("BYOK_EMPTY");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Decrypt a merchant secret.
 *
 * Returns null on ANY failure — wrong key, tampered ciphertext, missing field.
 * It does not throw and it does not say which, because the difference between
 * "wrong key" and "tampered" is information about the secret, and every caller
 * treats all of them the same way: fall back to no merchant key.
 */
export function decrypt({ ciphertext, iv, tag } = {}) {
  const key = keyMaterial();
  if (!key || !ciphertext || !iv || !tag) return null;
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const out = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}
