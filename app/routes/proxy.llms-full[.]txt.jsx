// App Proxy route → served at the storefront as /apps/contentclaude/llms-full.txt
// Expanded variant of llms.txt with per-product attributes. See proxy.llms[.]txt.jsx.
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
    const body = await renderLlmsTxt(shop, { full: true });
    if (!body) return new Response("Not found", { status: 404 });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    logger.error({ shop, err: err.message }, "llms-full.txt render failed");
    return new Response("Temporarily unavailable", { status: 503 });
  }
};
