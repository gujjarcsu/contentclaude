import { renderReembedPage } from "../utils/embedded.server.js";
import logger from "../utils/logger.server.js";

// Resource route (NO component) that renders the App Bridge re-embed page.
// Routes that must recover an embedded merchant from a session-less / param-less
// state (auth.login, _index) redirect here instead of returning a raw Response
// themselves — a route WITH a component can't cleanly return a raw Response
// (React Router renders the component with it as data). This route has no
// component, so its Response (App Bridge HTML + its own frame-ancestors CSP) is
// served verbatim. See renderReembedPage for the recovery mechanism (2.1.1 #4).
export const loader = ({ request }) => {
  // REEMBED_DIAG (temporary): prove whether the backstop can resolve the shop
  // (host param / navaal_shop cookie) on this request. Remove after proof.
  try {
    const u = new URL(request.url);
    logger.info(
      {
        hasHostParam: !!u.searchParams.get("host"),
        hasShopParam: !!u.searchParams.get("shop"),
        incomingNavaalShopCookie: /(?:^|;\s*)navaal_shop=/.test(request.headers.get("cookie") || ""),
        secFetchDest: request.headers.get("sec-fetch-dest") || null,
        referer: (request.headers.get("referer") || "").slice(0, 60) || null,
      },
      "REEMBED_DIAG /reembed hit"
    );
  } catch {
    /* ignore */
  }
  return renderReembedPage(request, "/app");
};
