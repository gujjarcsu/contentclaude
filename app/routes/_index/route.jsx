import { redirect } from "react-router";
import { embeddedAppParams } from "../../utils/embedded.server.js";

// App root. The admin loads this (`application_url` = "/") when the merchant
// clicks the app NAME/title in the sidebar (Shopify points the app home at "/").
// A human never types "/", so this route must NEVER render the login form
// (App Store rejection 2.1.1). With `shop`/`host` we hand /app the context
// directly; otherwise we serve the App Bridge re-embed page, which restores the
// shop and lands the merchant on /app. The login form lives only at the auth
// login path, for someone typing our URL directly.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const hasContext = url.searchParams.get("shop") || url.searchParams.get("host");

  // With shop/host we can hand /app the context directly (the common admin
  // home-nav load). Preserve every param + derive shop from host.
  if (hasContext) {
    const params = embeddedAppParams(url);
    throw redirect(`/app?${params.toString()}`);
  }

  // No shop/host. The app root "/" is ONLY ever loaded from inside the admin
  // (it's the app's home target — e.g. the app name/title in the sidebar, which
  // Shopify points at "/"). A human never types "/". So a bare "/" must NEVER
  // reach the login form — serve the App Bridge re-embed page regardless of
  // whether `embedded=1` is present. /reembed restores the shop (from the
  // partitioned cookie / App Bridge) and lands the merchant on /app. The login
  // form is reserved for /auth/login typed directly. (App Store 2.1.1.)
  throw redirect(`/reembed${url.search}`);
};
