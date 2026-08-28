import { redirect } from "react-router";
import { embeddedAppParams, isEmbeddedRequest, renderReembedPage } from "../../utils/embedded.server.js";
import { addDocumentResponseHeaders } from "../../shopify.server";

// App root. This route must NEVER dead-end a merchant on the login form when the
// request comes from inside the Shopify admin (App Store rejection 2.1.1).
//
// The admin loads the app home (`application_url` = "/") when the merchant
// clicks the app name / "Dashboard" home nav, and it sends the embedded `host`
// param but NOT always `shop`. The old code checked only `shop`, so a
// host-without-shop load fell through to `redirect("/auth/login")` (dropping
// every param) and rendered the "Shop domain" form inside the admin. Now: any
// request carrying `shop` OR `host` OR `embedded=1` is sent into `/app` with the
// shop derived from `host` when needed, so the embedded token-exchange auth runs
// and the merchant lands on the dashboard. The login form is reserved strictly
// for a true top-level visit from OUTSIDE the admin (no shop, no host).
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const hasContext = url.searchParams.get("shop") || url.searchParams.get("host");

  // With shop/host we can hand /app the context directly (the common admin
  // home-nav load). Preserve every param + derive shop from host.
  if (hasContext) {
    const params = embeddedAppParams(url);
    throw redirect(`/app?${params.toString()}`);
  }

  // Embedded (iframe) but the URL dropped shop AND host — a server redirect to
  // /app would loop. Re-embed via App Bridge instead (restores context from the
  // parent admin), then land on /app. Never the form.
  if (isEmbeddedRequest(request)) {
    return renderReembedPage(request, addDocumentResponseHeaders, "/app");
  }

  // Genuinely external, contextless visit — the only case that may see the form.
  throw redirect("/auth/login");
};
