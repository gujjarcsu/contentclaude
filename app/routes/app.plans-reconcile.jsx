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
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;
  try {
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
