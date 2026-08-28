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

/**
 * Render an App Bridge "re-embed" page — the correct silent recovery for a
 * session-less document request that reached a login-form route from INSIDE the
 * admin (rejection #4).
 *
 * Why not a server redirect to /app? When a bare navigation drops `shop`/`host`
 * (e.g. an App-Bridge-missed <s-link> click in a cookie-blocked context), the
 * Shopify library's validateShopAndHostParams throws redirect("/auth/login").
 * Redirecting that back to /app server-side just LOOPS, because /app is missing
 * the same params. Instead we load App Bridge in the iframe — it re-establishes
 * the embedded context by talking to the parent admin (even when the URL lost
 * shop/host) — then navigate to /app, where token exchange authenticates
 * silently. This mirrors the library's own renderAppBridge recovery. A blocking
 * (non-async) App Bridge script guarantees window.open is overridden before the
 * navigation runs, so it stays embedded instead of breaking out of the admin.
 *
 * A raw Response is returned (never rendered through a React component), so it
 * MUST set its own frame-ancestors CSP — the global entry.server header only
 * applies to rendered document responses.
 *
 * @param {Request} request
 * @param {string} [targetPath]
 */
// The app's handle in the admin URL (…/apps/<handle>). Stable; from shopify.app.toml.
const APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || "navaal-seo-geo-content";

function cookieValue(request, name) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

export function renderReembedPage(request, targetPath = "/app") {
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const k of ["host", "shop", "embedded", "id_token", "locale"]) {
    const v = url.searchParams.get(k);
    if (v) params.set(k, v);
  }
  const target = url.searchParams.get("target") || targetPath;

  // Resolve the shop from the strongest signal available:
  //   host param  →  shop param  →  the persisted partitioned cookie.
  // The cookie (set on every authenticated load, Partitioned so it survives
  // incognito's third-party-cookie block) means even a TRULY host-less request
  // still knows its store — no App Bridge guessing, no 404 (2.1.1 #4 backstop).
  let shop = params.get("shop") || shopFromHost(params.get("host")) || cookieValue(request, "navaal_shop");
  if (shop && !shop.includes(".")) shop = `${shop}.myshopify.com`;
  const validShop = shop && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop) ? shop.toLowerCase() : null;

  let dest;
  if (validShop) {
    // Fully-qualified ADMIN url. No host required, no relative-path resolution,
    // so App Bridge can never 404 on it — Shopify re-enters the app embedded
    // with fresh params. This is the case that guarantees no dead-end.
    const storeHandle = validShop.replace(/\.myshopify\.com$/i, "");
    dest = `https://admin.shopify.com/store/${storeHandle}/apps/${APP_HANDLE}${target}`;
  } else {
    // No shop identity at all — last resort: navigate to the absolute app URL
    // and let App Bridge / token exchange sort it out.
    const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
    const base = `${appUrl}${target}`;
    dest = params.toString() ? `${base}?${params.toString()}` : base;
  }

  // Must allow admin.shopify.com to frame this recovery page.
  const ancestors = validShop
    ? `https://${validShop} https://admin.shopify.com`
    : "https://admin.shopify.com https://*.myshopify.com";
  const headers = new Headers({
    "content-type": "text/html;charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": `frame-ancestors ${ancestors};`,
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script data-api-key="${apiKey}" src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
</head><body>
<script>window.open(${JSON.stringify(dest)}, "_top");</script>
</body></html>`;
  return new Response(html, { headers });
}
