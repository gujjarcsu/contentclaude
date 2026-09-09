import { redirect } from "react-router";
import { sanitizeRef, REF_COOKIE, REF_COOKIE_MAX_AGE } from "../utils/installTracking.server.js";
import logger from "../utils/logger.server.js";

// Attributed install link for surfaces we own (navaal.ai pages, Bilby reports,
// outreach emails). Every such link points here instead of at the App Store:
//
//   https://app.navaal.ai/go?ref=<channel-handle>
//
// We (1) set the navaal_ref cookie on app.navaal.ai and (2) forward to the App
// Store listing with ?ref= appended. The install tracker (installTracking.server.js)
// then attributes the install as "ref:<handle>" when either the cookie reaches
// the embedded install request (Chrome/Edge normal windows send it; Safari and
// Firefox generally do not) or Shopify passes ?ref through the install URL.
// Nothing is guessed: an install this cannot see is recorded as its App Store
// surface or "unknown". refs are channel handles we mint — never per-recipient.
//
// Resource route: no component, no session, no auth.
export const LISTING_URL = "https://apps.shopify.com/navaal-ai-seo-geo-content";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const ref = sanitizeRef(url.searchParams.get("ref"));
  const dest = new URL(LISTING_URL);
  const headers = new Headers({ "cache-control": "no-store" });
  if (ref) {
    dest.searchParams.set("ref", ref);
    headers.append(
      "Set-Cookie",
      `${REF_COOKIE}=${encodeURIComponent(ref)}; Path=/; Max-Age=${REF_COOKIE_MAX_AGE}; Secure; HttpOnly; SameSite=None`
    );
  }
  logger.info({ event: "install_link_click", ref: ref || null, ok: !!ref }, "install link click");
  return redirect(dest.toString(), { status: 302, headers });
};
