/**
 * Token-free webhook verification for lifecycle + GDPR webhooks.
 *
 * Why not authenticate.webhook() from the Shopify library for these routes:
 * it loads the shop's OFFLINE session and, when the expiring token is past its
 * 5-minute window, calls the refresh_token grant BEFORE returning the context.
 * For app/uninstalled the app has just been removed, so that refresh is
 * rejected and the library throws a bare 500 — the handler never runs, the
 * shop's data is not deleted, the uninstall is not recorded, and Shopify keeps
 * retrying into the same wall. Any store that uninstalls more than an hour
 * after its last use hits this. The mandatory shop/redact and customers/*
 * webhooks arrive 48 h later against the same expired token, so they fail too.
 *
 * These handlers need no access token at all: they only need to know the
 * request genuinely came from Shopify and which shop it is about. That is
 * exactly the HMAC check below — the same SHA-256(secret, raw body) that the
 * library performs — plus the standard headers. No session is loaded, nothing
 * is refreshed, nothing is stored.
 *
 * Throws a Response (405 / 401 / 400) the way the library does, so React Router
 * returns it as the HTTP status.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function computeWebhookHmac(rawBody, secret) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

/**
 * @param {Request} request
 * @returns {Promise<{shop:string, topic:string, webhookId:string|null, triggeredAt:string|null, apiVersion:string|null, payload:any, rawBody:string}>}
 */
export async function verifyShopifyWebhook(request, { secret = process.env.SHOPIFY_API_SECRET } = {}) {
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
  // Topic in the library's shape (APP_UNINSTALLED) so callers can compare either way.
  const rawTopic = request.headers.get("x-shopify-topic") || "";
  const topic = rawTopic.toUpperCase().replace(/[/-]/g, "_");
  return {
    shop,
    topic,
    rawTopic,
    webhookId: request.headers.get("x-shopify-webhook-id"),
    triggeredAt: request.headers.get("x-shopify-triggered-at"),
    apiVersion: request.headers.get("x-shopify-api-version"),
    payload,
    rawBody,
  };
}
