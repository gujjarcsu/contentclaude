/**
 * Token-free webhook verification for EVERY webhook route.
 *
 * Why not authenticate.webhook() from the Shopify library:
 * it loads the shop's OFFLINE session and, when the expiring token is past its
 * 5-minute window, calls the refresh_token grant BEFORE returning the context.
 * For app/uninstalled the app has just been removed, so that refresh is
 * rejected and the library throws a bare 500 — the handler never runs, the
 * shop's data is not deleted, the uninstall is not recorded, and Shopify keeps
 * retrying into the same wall. Any store that uninstalls more than an hour
 * after its last use hits this. The mandatory shop/redact and customers/*
 * webhooks arrive 48 h later against the same expired token, so they fail too.
 * products/create, app/scopes_update and app_subscriptions/update sit on the
 * same trap: none of them needs an access token, and a shop whose token has
 * expired 500s the same way.
 *
 * These handlers need no access token at all: they only need to know the
 * request genuinely came from Shopify and which shop it is about. That is
 * exactly the HMAC check below — the same SHA-256(secret, raw body) that the
 * library performs — plus the standard headers. No session is loaded, nothing
 * is refreshed, nothing is stored.
 *
 * Three things the HMAC alone does NOT give you, all handled here:
 *
 *  1. The HMAC covers the BODY ONLY. shop / topic / triggered-at arrive as
 *     plain headers and are not signed. app/uninstalled deletes every row for
 *     the header shop, so an attacker replaying any genuine body of ours under
 *     a different x-shopify-shop-domain would wipe another merchant. Whenever
 *     the payload itself names a shop (myshopify_domain / shop_domain) it must
 *     equal the header; a mismatch is rejected.
 *  2. A captured delivery can be replayed forever. A delivery whose
 *     triggered-at is older than MAX_WEBHOOK_AGE_MS is rejected.
 *  3. Shopify redelivers on timeout/retry with the same x-shopify-webhook-id.
 *     The id is claimed once in Redis so a redelivery short-circuits instead of
 *     repeating the work (duplicate GDPR audit rows, duplicate autopilot jobs).
 *     A handler that then fails must call releaseWebhookDelivery, so the
 *     genuine retry is still allowed to run.
 *
 * Throws a Response (405 / 401 / 400) the way the library does, so React Router
 * returns it as the HTTP status.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getRedis } from "./cache.server.js";
import logger from "./logger.server.js";

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Oldest delivery we will act on. Shopify's own retry schedule finishes well
 * inside this, so a genuine retry is never refused; a replay of a captured
 * delivery a day later is. Trade-off recorded in PROGRESS.md (Phase 0 item 2):
 * were the app unreachable for more than 24 h, a compliance retry arriving
 * after that window would be rejected rather than processed.
 */
export const MAX_WEBHOOK_AGE_MS = 24 * 60 * 60 * 1000;
/** Tolerance for clock skew between Shopify and us, in the future direction. */
export const MAX_WEBHOOK_SKEW_MS = 5 * 60 * 1000;
/** How long a delivery id stays claimed — longer than Shopify's retry window. */
const DEDUP_TTL_SECONDS = 48 * 60 * 60;

export function computeWebhookHmac(rawBody, secret) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

/**
 * The shop domain the PAYLOAD claims, or null when this topic carries none.
 * products/create, app/scopes_update and app_subscriptions/update payloads have
 * no shop field — there is nothing to cross-check, and null means "no opinion".
 * Pure.
 * @returns {string|null} lower-cased domain, or null
 */
export function payloadShopDomain(payload) {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload.myshopify_domain ?? payload.shop_domain;
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return v ? v : null;
}

/**
 * The `current` scopes from an app/scopes_update payload: an array of handles
 * on the documented payload, but a comma-joined string on some deliveries.
 * Missing or empty means "nothing to write" — the route used to call
 * `payload.current.toString()`, which threw a TypeError on a missing field,
 * became a 500, and put Shopify into another retry loop. Pure.
 * @returns {string|null} comma-joined scope string, or null when there is none
 */
export function scopesFromPayload(payload) {
  const current = payload?.current;
  if (Array.isArray(current)) {
    const scopes = current.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
    return scopes.length ? scopes.join(",") : null;
  }
  if (typeof current === "string" && current.trim()) return current.trim();
  return null;
}

/**
 * Is this delivery inside the replay window? Pure.
 * A missing or unparseable header is NOT a rejection: the HMAC already proves
 * authenticity, and some deliveries legitimately omit it. Only a parseable
 * timestamp that is too old, or implausibly far in the future, fails.
 */
export function isDeliveryFresh(triggeredAt, now = Date.now(), maxAgeMs = MAX_WEBHOOK_AGE_MS) {
  if (!triggeredAt) return true;
  const t = new Date(triggeredAt).getTime();
  if (!Number.isFinite(t)) return true;
  if (t > now + MAX_WEBHOOK_SKEW_MS) return false;
  return now - t <= maxAgeMs;
}

/**
 * Claim a delivery id exactly once. Returns true when THIS request owns the
 * work, false when it is a redelivery of one already claimed.
 * Redis-less environments (dev, Redis outage) always return true — the routes
 * keep their own second guards, and dropping work is worse than repeating it.
 */
export async function claimWebhookDelivery(shop, webhookId) {
  if (!webhookId) return true;
  try {
    const redis = await getRedis();
    if (!redis) return true;
    const claim = await redis.set(`whdedup:${shop}:${webhookId}`, "1", "EX", DEDUP_TTL_SECONDS, "NX");
    return !!claim;
  } catch (err) {
    logger.warn({ shop, webhookId, err: err.message }, "Webhook dedup claim failed — processing anyway");
    return true;
  }
}

/**
 * Give a claimed delivery id back, so Shopify's retry of a delivery whose
 * handler failed is allowed to run instead of being swallowed as a duplicate.
 * Never throws.
 */
export async function releaseWebhookDelivery(shop, webhookId) {
  if (!webhookId) return;
  try {
    const redis = await getRedis();
    if (!redis) return;
    await redis.del(`whdedup:${shop}:${webhookId}`);
  } catch (err) {
    logger.warn({ shop, webhookId, err: err.message }, "Webhook dedup release failed");
  }
}

/**
 * @param {Request} request
 * @returns {Promise<{shop:string, topic:string, rawTopic:string, webhookId:string|null,
 *   triggeredAt:string|null, apiVersion:string|null, payload:any, rawBody:string,
 *   duplicate:boolean}>}
 */
export async function verifyShopifyWebhook(
  request,
  { secret = process.env.SHOPIFY_API_SECRET, dedupe = true, now = Date.now() } = {},
) {
  if (request.method !== "POST") {
    throw new Response(undefined, { status: 405, statusText: "Method not allowed" });
  }
  const rawBody = await request.text();
  const provided = request.headers.get("x-shopify-hmac-sha256") || "";
  if (!secret || !provided) {
    throw new Response(undefined, { status: 401, statusText: "Unauthorized" });
  }
  const expected = Buffer.from(computeWebhookHmac(rawBody, secret));
  const given = Buffer.from(provided);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new Response(undefined, { status: 401, statusText: "Unauthorized" });
  }
  const shop = (request.headers.get("x-shopify-shop-domain") || "").trim().toLowerCase();
  if (!SHOP_RE.test(shop)) {
    throw new Response(undefined, { status: 400, statusText: "Bad Request" });
  }
  let payload = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Response(undefined, { status: 400, statusText: "Bad Request" });
    }
  }

  // The signed body must not disagree with the unsigned shop header.
  const claimed = payloadShopDomain(payload);
  if (claimed && claimed !== shop) {
    logger.warn(
      { headerShop: shop, payloadShop: claimed, event: "webhook_shop_mismatch" },
      "Webhook shop header does not match the signed payload — rejected",
    );
    throw new Response(undefined, { status: 401, statusText: "Unauthorized" });
  }

  const triggeredAt = request.headers.get("x-shopify-triggered-at");
  if (!isDeliveryFresh(triggeredAt, now)) {
    logger.warn({ shop, triggeredAt, event: "webhook_stale" }, "Webhook delivery outside the replay window — rejected");
    throw new Response(undefined, { status: 401, statusText: "Unauthorized" });
  }

  // Topic in the library's shape (APP_UNINSTALLED) so callers can compare either way.
  const rawTopic = request.headers.get("x-shopify-topic") || "";
  const topic = rawTopic.toUpperCase().replace(/[/-]/g, "_");
  const webhookId = request.headers.get("x-shopify-webhook-id");

  const duplicate = dedupe ? !(await claimWebhookDelivery(shop, webhookId)) : false;

  return {
    shop,
    topic,
    rawTopic,
    webhookId,
    triggeredAt,
    apiVersion: request.headers.get("x-shopify-api-version"),
    payload,
    rawBody,
    duplicate,
  };
}
