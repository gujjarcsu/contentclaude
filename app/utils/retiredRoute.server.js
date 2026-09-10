/**
 * Retired routes — Phase 3, with the owner's nav decision.
 *
 * Five routes are gone: `/app/welcome` and `/app/setup` (3.1, replaced by the
 * Start state on Home) and `/app/results` and `/app/analytics` (the approved
 * five-item nav is Home · Products · Review · Blog · Settings).
 *
 * They are not deleted outright. A merchant with a bookmark, an open tab, or a
 * link in an old email must land somewhere sensible rather than on a 404 inside
 * the Shopify admin frame — and the App Store review team follows old links.
 * So each becomes a **same-origin 302 to `/app`**, carrying the Shopify auth
 * params through, because third-party cookies are blocked in the embedded
 * iframe and `id_token` / `session` have to survive the hop for token exchange
 * to work on the other side.
 *
 * Same-origin matters: a redirect to `admin.shopify.com` from inside the frame
 * is a cross-origin top-level navigation the browser will not perform silently,
 * and it is what the App Store rejections were about.
 *
 * `authenticate.admin` still runs first, so these are not a hole in the rule
 * that every non-webhook route authenticates (G3).
 */
import { redirect } from "react-router";
import { authenticate } from "../shopify.server.js";

/** The Shopify params that must survive any in-app redirect. */
const AUTH_PARAMS = ["host", "shop", "id_token", "session", "embedded", "locale", "timestamp", "hmac"];

export function authParamString(request) {
  const url = new URL(request.url);
  const p = new URLSearchParams();
  for (const k of AUTH_PARAMS) {
    const v = url.searchParams.get(k);
    if (v) p.set(k, v);
  }
  return p.toString();
}

/**
 * A loader for a route that no longer exists: authenticate, then 302 to `to`
 * on the same origin with the auth params intact.
 * @param {string} [to] path to send the merchant to
 */
export function retiredRouteLoader(to = "/app") {
  return async ({ request }) => {
    await authenticate.admin(request);
    const qs = authParamString(request);
    throw redirect(qs ? `${to}?${qs}` : to);
  };
}
