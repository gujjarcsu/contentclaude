// App Proxy route → served at the storefront as /apps/navaal/llms.txt
// (see [app_proxy] in shopify.app.toml). Returns the llms.txt index of the
// merchant's catalog for AI agents / answer engines.
//
// Reachable only via Shopify's signed App Proxy; authenticate.public.appProxy
// verifies the signature and resolves the shop.
import { authenticate } from "../shopify.server";
import { renderLlmsTxt, llmsTxtUpgradeNotice } from "../utils/llms.server.js";
import logger from "../utils/logger.server";

export const loader = async ({ request }) => {
  const shopParam = new URL(request.url).searchParams.get("shop") || undefined;
  let shop;
  try {
    const { session } = await authenticate.public.appProxy(request);
    shop = session?.shop;
  } catch (err) {
    // Never a silent 404: the library throws a Response(400) when the App Proxy
    // HMAC signature is invalid (usually SHOPIFY_API_SECRET mismatch), or a real
    // Error when the near-expiry offline-token refresh fails — very different root
    // causes. Log which one so this is diagnosable from `fly logs`.
    const status = err instanceof Response ? err.status : undefined;
    logger.warn(
      {
        shop: shopParam,
        status,
        err: err?.message,
        kind: err instanceof Response ? "appProxy-hmac" : "appProxy-error",
      },
      "App Proxy auth rejected for llms.txt",
    );
    return new Response("Not found", { status: 404 });
  }
  if (!shop) {
    // HMAC passed (request genuinely came through Shopify's proxy) but no offline
    // session is stored for this shop — surface it instead of a blind 404.
    logger.warn({ shop: shopParam }, "App Proxy llms.txt: valid signature but no offline session");
    return new Response("Not found", { status: 404 });
  }

  try {
    const body = await renderLlmsTxt(shop, { full: false });
    if (!body) {
      // Not entitled (Free plan) — serve a helpful 200 explaining how to enable it,
      // rather than a silent 404 that looks like the app is broken.
      return new Response(llmsTxtUpgradeNotice(shop), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=300, must-revalidate",
          "Vary": "Accept-Encoding",
        },
      });
    }
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300, must-revalidate",
        "Vary": "Accept-Encoding",
      },
    });
  } catch (err) {
    logger.error({ shop, err: err.message }, "llms.txt render failed");
    return new Response("Temporarily unavailable", { status: 503 });
  }
};
