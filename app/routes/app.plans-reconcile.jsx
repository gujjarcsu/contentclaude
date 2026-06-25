import { authenticate, BILLING_TEST } from "../shopify.server";
import { BILLING_PLANS } from "../utils/billing-plans.js";
import { getOrCreatePlan, syncBillingToPlan } from "../utils/plans.server";

// Resource route (loader only — no UI). The Plans page calls this via useFetcher
// AFTER first paint. billing.check() is a Shopify API round-trip; doing it here
// instead of in the Plans loader guarantees it can NEVER hold the Plans response
// open (a streamed deferred promise was being buffered by the edge proxy, so the
// page still blocked the full ~40s until billing.check resolved). Returns { changed }
// so the page revalidates only if Shopify reports a plan the webhook missed.
export const loader = async ({ request }) => {
  // authenticate.admin is inside the try on purpose: it throws a REDIRECT on an
  // auth miss, and this loader is a background fetcher.load — a followed redirect
  // would yank the embedded app to /auth/login. Swallow everything and return a
  // no-op; the Plans page's own loader handles real re-auth for the navigation.
  try {
    const { billing, session } = await authenticate.admin(request);
    const shop = session.shop;
    const before = await getOrCreatePlan(shop);
    const { appSubscriptions } = await billing.check({
      plans: Object.values(BILLING_PLANS).map((p) => p.key),
      isTest: BILLING_TEST,
    });
    await syncBillingToPlan(shop, appSubscriptions);
    const fresh = await getOrCreatePlan(shop);
    return Response.json({ changed: fresh.planName !== before.planName });
  } catch {
    return Response.json({ changed: false });
  }
};
