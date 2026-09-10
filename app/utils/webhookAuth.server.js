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
 *  2. Shopify redelivers on timeout/retry with the same x-shopify-webhook-id.
 *     The id is claimed once in Redis so a redelivery short-circuits instead of
 *     repeating the work (duplicate GDPR audit rows, duplicate autopilot jobs).
 *     A handler that then fails must call releaseWebhookDelivery, so the
 *     genuine retry is still allowed to run.
 *  3. A captured delivery can be replayed forever. That is what the dedup store
 *     above is for — see the note on MAX_WEBHOOK_AGE_MS for why the timestamp
 *     is a backstop for it and never the primitive.
 *
 * Throws a Response (405 / 401 / 400) the way the library does, so React Router
 * returns it as the HTTP status.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getRedis } from "./cache.server.js";
import logger from "./logger.server.js";

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Shopify's documented retry schedule: 19 attempts over roughly 48 hours, every
 * one of them carrying the ORIGINAL x-shopify-triggered-at. A retry that is 47
 * hours old is not a stale delivery; it is Shopify doing exactly what it says
 * it does.
 */
export const SHOPIFY_RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Oldest delivery we will act on — and why this is a BACKSTOP, not the replay
 * defence.
 *
 * This was 24 h, and that was the bug. Shopify reported an 88.5% webhook
 * failure rate: app/uninstalled 82.4%, shop/redact 100%. A signed probe against
 * production returned 200 for a fresh delivery of every topic and 401 for the
 * same delivery aged 25 h and 47 h. So a delivery that failed once for any
 * transient reason aged past 24 h and then every remaining retry in Shopify's
 * ~48 h schedule was refused — permanently, by us, on purpose.
 *
 * The lesson is that an age cutoff cannot be the replay primitive at all: any
 * window short enough to stop a replay is also short enough to refuse a genuine
 * retry, because a retry IS an old delivery. Replay protection is the
 * webhook-id dedup below, which rejects a captured delivery on the FIRST
 * replay rather than after some number of hours.
 *
 * What is left for the timestamp is one job: bound how long the dedup store has
 * to remember. So this must be (a) comfortably longer than Shopify's retry
 * window and (b) exactly equal to DEDUP_TTL_SECONDS — if the age window were
 * longer than the dedup TTL there would be a gap in which a replay is both too
 * young to reject and too old to be remembered. The two are derived from one
 * constant for that reason; the test asserts they stay equal.
 */
export const MAX_WEBHOOK_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolerance for clock skew between Shopify and us, in the future direction. */
export const MAX_WEBHOOK_SKEW_MS = 5 * 60 * 1000;
/** Kept equal to MAX_WEBHOOK_AGE_MS on purpose — see above. */
const DEDUP_TTL_SECONDS = MAX_WEBHOOK_AGE_MS / 1000;

/**
 * The mandatory compliance topics, which are NEVER rejected on their timestamp.
 *
 * These are the GDPR webhooks Shopify requires every app to answer, and failing
 * one is a compliance failure, not a dropped notification. shop/redact is sent
 * 48 h after uninstall — already at the edge of any window — and it was
 * failing 100% of deliveries. If one arrives with an implausible timestamp the
 * right answer is still to honour it: performing a deletion we were not owed
 * costs a merchant nothing, and refusing one we were owed is the failure that
 * matters. Their replay protection is the dedup claim, same as everything else.
 *
 * Compared against the raw x-shopify-topic header, lower-cased.
 */
export const MANDATORY_COMPLIANCE_TOPICS = Object.freeze([
  "shop/redact",
  "customers/redact",
  "customers/data_request",
]);

/** Is this one of the mandatory GDPR topics? Pure. */
export function isMandatoryComplianceTopic(rawTopic) {
  return MANDATORY_COMPLIANCE_TOPICS.includes(
    String(rawTopic || "")
      .trim()
      .toLowerCase(),
  );
}

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
 * Is this delivery inside the backstop window? Pure.
 *
 * A missing or unparseable header is NOT a rejection: the HMAC already proves
 * authenticity, and some deliveries legitimately omit it. Only a parseable
 * timestamp that is too old, or implausibly far in the future, fails.
 *
 * `maxAgeMs` of Infinity disables the check entirely, which is what the
 * mandatory compliance topics pass.
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
 *   duplicate:boolean, mandatory:boolean}>}
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

  // Topic in the library's shape (APP_UNINSTALLED) so callers can compare either way.
  const rawTopic = request.headers.get("x-shopify-topic") || "";
  const topic = rawTopic.toUpperCase().replace(/[/-]/g, "_");
  const webhookId = request.headers.get("x-shopify-webhook-id");

  // The age backstop, which a mandatory compliance topic is exempt from
  // entirely. Everything else gets a window far wider than Shopify's retry
  // schedule, so a genuine retry is always accepted; the dedup claim below is
  // what actually stops a replay.
  const mandatory = isMandatoryComplianceTopic(rawTopic);
  const triggeredAt = request.headers.get("x-shopify-triggered-at");
  if (!mandatory && !isDeliveryFresh(triggeredAt, now)) {
    logger.warn(
      { shop, topic: rawTopic, triggeredAt, maxAgeMs: MAX_WEBHOOK_AGE_MS, event: "webhook_stale" },
      "Webhook delivery older than the backstop window — rejected",
    );
    throw new Response(undefined, { status: 401, statusText: "Unauthorized" });
  }

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
    mandatory,
  };
}
