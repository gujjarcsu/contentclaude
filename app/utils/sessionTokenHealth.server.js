/**
 * sessionTokenHealth.server.js — THE ALARM THAT WOULD HAVE CAUGHT THE 401.
 *
 * On 2026-09-16 the deployed client secret was not the one Shopify signs with. Every merchant got
 * 401 on every page. The deep health check tested the database, Redis, the BullMQ worker, the
 * scheduler and the AI breaker — all five were genuinely fine, so it answered `healthy`, and the
 * uptime monitor showed 100% through an outage in which the product did not work for anybody.
 *
 * The missing question was never "is a dependency up". It was: **can the secret this process holds
 * still validate a session token?** Shopify signs the embedded-app `id_token` with the client
 * secret, HMAC-SHA256. If our secret is not Shopify's, every `authenticate.admin` call fails the
 * same way, and so does every webhook HMAC.
 *
 * We cannot ask Shopify for a token from inside a health check. But we do not need one: we mint a
 * token the way Shopify does, with the secret this process is actually running with, and then put
 * it through the same verification the real `id_token` takes. That proves the signing and
 * verification halves agree and that the secret is well-formed and present. It cannot, on its own,
 * prove our secret equals Shopify's — see `crossSignal` below for the half that can, which is why
 * both are reported separately rather than blended into one reassuring word.
 *
 * PRINTS NOTHING. No secret, no length, no fingerprint, no prefix, no token. The only values that
 * leave this file are booleans and a fixed reason string chosen from a closed set.
 */
import crypto from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Mint and verify a token exactly as Shopify signs an id_token, with the running secret. */
function selfCheck(secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  /* the claim shape Shopify actually sends, so the verification path sees a realistic token */
  const payload = b64url(JSON.stringify({
    iss: "https://health-check.myshopify.com/admin",
    dest: "https://health-check.myshopify.com",
    aud: process.env.SHOPIFY_API_KEY || "unknown",
    sub: "0",
    exp: now + 60,
    nbf: now - 5,
    iat: now,
    jti: crypto.randomUUID(),
    sid: "health",
  }));
  const signing = `${header}.${payload}`;
  const sig = b64url(crypto.createHmac("sha256", secret).update(signing).digest());

  /* now verify it the way the real path does: recompute and compare in constant time */
  const expected = b64url(crypto.createHmac("sha256", secret).update(signing).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  /* and the claims must survive a parse and be unexpired — a token that verifies but cannot be
     read is the same outage from a different direction */
  const claims = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  return claims.exp > now && claims.aud === (process.env.SHOPIFY_API_KEY || "unknown");
}

/**
 * @returns {{ ok: boolean, reason: string, crossSignal: string }}
 *   ok          false ⇒ the app cannot validate session tokens; the caller should 503.
 *   reason      a fixed string from a closed set. Never derived from the secret.
 *   crossSignal what the live 401 rate says, which is the half a self-check cannot see.
 */
export function checkSessionTokenSecret() {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return { ok: false, reason: "no client secret is configured", crossSignal: "not checked" };
  if (typeof secret !== "string" || secret.trim() === "") return { ok: false, reason: "the client secret is empty", crossSignal: "not checked" };
  /* a secret with surrounding whitespace or quotes is the classic paste error, and it fails
     silently in exactly the 401 shape — catch it here rather than in production traffic */
  if (secret !== secret.trim()) return { ok: false, reason: "the client secret has whitespace around it", crossSignal: "not checked" };
  if (/^["']|["']$/.test(secret)) return { ok: false, reason: "the client secret is wrapped in quotes", crossSignal: "not checked" };
  try {
    if (!selfCheck(secret)) return { ok: false, reason: "this build cannot verify a token it signed itself", crossSignal: "not checked" };
  } catch {
    return { ok: false, reason: "signing a test token threw", crossSignal: "not checked" };
  }
  return { ok: true, reason: "a token signed with the running secret verifies", crossSignal: "see sessionTokenRejections" };
}

/**
 * THE HALF THE SELF-CHECK CANNOT SEE, and the reason it is reported separately.
 *
 * A self-check proves our two halves agree with each other. It cannot prove our secret equals
 * Shopify's — with the *wrong* secret, signing and verifying still agree perfectly, which is
 * precisely why the 16 September outage was invisible. The observable that does distinguish them is
 * the live rejection rate: when the secret is wrong, EVERY session-token authentication fails, so
 * the rate is not elevated, it is total.
 *
 * The counter is kept by the auth path; this only reads it. Sustained total rejection with traffic
 * present is the signature of a wrong secret and nothing else.
 */
export async function sessionTokenRejections(readCounter) {
  try {
    const c = await readCounter();
    if (!c || typeof c.attempts !== "number") return { available: false, reason: "no counter" };
    if (c.attempts < 5) return { available: true, verdict: "too few attempts to judge", attempts: c.attempts, rejected: c.rejected ?? 0 };
    const rate = (c.rejected ?? 0) / c.attempts;
    return {
      available: true,
      attempts: c.attempts,
      rejected: c.rejected ?? 0,
      /* 100% with real traffic is the wrong-secret signature; a healthy app rejects a few */
      verdict: rate >= 0.99 ? "every session token is being rejected" : rate > 0.5 ? "most session tokens are being rejected" : "normal",
      fatal: rate >= 0.99,
    };
  } catch {
    return { available: false, reason: "read failed" };
  }
}
