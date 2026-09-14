// P6.2 — the privacy policy, public and unauthenticated.
//
// No `authenticate.admin`, deliberately: an App Store reviewer and a merchant
// deciding whether to install both open this with no session, and a legal
// document behind a login is not reachable. Shopify submission requires it
// reachable from the listing AND from inside the app; the app footer links here.
import { legalPage } from "../utils/legalPage.server.js";

export const loader = () => legalPage("privacy");
