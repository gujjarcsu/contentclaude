import { authenticate } from "../shopify.server";
import { resolveBillingTest } from "../utils/billingTest.server.js";
import { ALL_BILLING_PLAN_KEYS } from "../utils/billing-plans.js";
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
    const { billing, session, admin } = await authenticate.admin(request);
    const shop = session.shop;
    const isTest = await resolveBillingTest(admin, shop);
    const before = await getOrCreatePlan(shop);
    // ALL six keys (monthly + annual). Passing only monthly keys made every
    // annual subscriber look unsubscribed, and this loader then wiped their
    // plan to Free on every Plans page load — while they were still billed.
    const { appSubscriptions } = await billing.check({
      plans: ALL_BILLING_PLAN_KEYS,
      isTest,
    });
    await syncBillingToPlan(shop, appSubscriptions);
    const fresh = await getOrCreatePlan(shop);
    return Response.json({ changed: fresh.planName !== before.planName });
  } catch {
    return Response.json({ changed: false });
  }
};
