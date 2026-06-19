// App Proxy route → served at the storefront as /apps/contentclaude/llms.txt
// (see [app_proxy] in shopify.app.toml). Returns the llms.txt index of the
// merchant's catalog for AI agents / answer engines.
//
// Reachable only via Shopify's signed App Proxy; authenticate.public.appProxy
// verifies the signature and resolves the shop.
import { authenticate } from "../shopify.server";
import { renderLlmsTxt } from "../utils/llms.server.js";
import logger from "../utils/logger.server";

export const loader = async ({ request }) => {
  let shop;
  try {
    const { session } = await authenticate.public.appProxy(request);
    shop = session?.shop;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!shop) return new Response("Not found", { status: 404 });

  try {
    const body = await renderLlmsTxt(shop, { full: false });
    if (!body) return new Response("Not found", { status: 404 }); // not entitled
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    logger.error({ shop, err: err.message }, "llms.txt render failed");
    return new Response("Temporarily unavailable", { status: 503 });
  }
};
