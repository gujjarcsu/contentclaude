// Helpers for keeping the login form unreachable from inside the Shopify admin
// (App Store rejection 2.1.1). An embedded/admin request must ALWAYS be sent
// back into the app to re-authenticate silently (token exchange / bounce) — it
// must NEVER be answered with the "Shop domain" login form.

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * Decode the shop domain from Shopify's base64url `host` param.
 * `host` decodes to "{shop}.myshopify.com/admin" (or "admin.shopify.com/store/{name}").
 * Returns a validated `*.myshopify.com` domain, or null.
 */
export function shopFromHost(host) {
  if (!host) return null;
  try {
    const decoded = atob(host.replace(/-/g, "+").replace(/_/g, "/"));
    // Form 1: "{shop}.myshopify.com/admin"
    const first = decoded.split("/")[0];
    if (SHOP_RE.test(first)) return first.toLowerCase();
    // Form 2: "admin.shopify.com/store/{name}" -> "{name}.myshopify.com"
    const m = decoded.match(/store\/([a-z0-9][a-z0-9-]*)/i);
    if (m) return `${m[1].toLowerCase()}.myshopify.com`;
    return null;
  } catch {
    return null;
  }
}

/**
 * Is this request coming from inside the Shopify admin (embedded context)?
 * `host` and `embedded=1` are Shopify-provided; sec-fetch-dest covers an iframe
 * document load that somehow lost the query params. Any true here means the
 * login form must NOT be shown — re-auth silently instead.
 */
export function isEmbeddedRequest(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("embedded") === "1") return true;
  if (url.searchParams.get("host")) return true;
  const dest = request.headers.get("sec-fetch-dest");
  if (dest === "iframe" || dest === "frame") return true;
  return false;
}

/**
 * Given the incoming request's search params, return a params string that is
 * safe to hand to `/app` for embedded re-auth: preserves everything Shopify
 * sent and fills in `shop` from `host` when the param is absent (the root cause
 * of 2.1.1 — the admin home-nav sends `host` but not always `shop`).
 */
export function embeddedAppParams(url) {
  const params = new URLSearchParams(url.searchParams);
  if (!params.get("shop")) {
    const shop = shopFromHost(params.get("host"));
    if (shop) params.set("shop", shop);
  }
  return params;
}
