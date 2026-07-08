// App Proxy route → served at the storefront as /apps/navaal/llms-full.txt
// Expanded variant of llms.txt with per-product attributes. See proxy.llms[.]txt.jsx.
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
    // Never a silent 404 — see proxy.llms[.]txt.jsx for the full rationale.
    const status = err instanceof Response ? err.status : undefined;
    logger.warn(
      {
        shop: shopParam,
        status,
        err: err?.message,
        kind: err instanceof Response ? "appProxy-hmac" : "appProxy-error",
      },
      "App Proxy auth rejected for llms-full.txt",
    );
    return new Response("Not found", { status: 404 });
  }
  if (!shop) {
    logger.warn({ shop: shopParam }, "App Proxy llms-full.txt: valid signature but no offline session");
    return new Response("Not found", { status: 404 });
  }

  try {
    const body = await renderLlmsTxt(shop, { full: true });
    if (!body) {
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
    logger.error({ shop, err: err.message }, "llms-full.txt render failed");
    return new Response("Temporarily unavailable", { status: 503 });
  }
};
