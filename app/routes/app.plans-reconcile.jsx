import { authenticate } from "../shopify.server";
import { resolveBillingTest } from "../utils/billingTest.server.js";
import { ALL_BILLING_PLAN_KEYS } from "../utils/billing-plans.js";
import { getOrCreatePlan, syncBillingToPlan } from "../utils/plans.server";
import logger from "../utils/logger.server.js";

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
  // RECONCILE_DIAG: pure instrumentation to prove the 1.2.3 downgrade path.
  // Control flow is UNCHANGED — only logging added. Remove after root cause.
  let shop = "unknown", isTest = null, beforePlan = null;
  try {
    const { billing, session, admin } = await authenticate.admin(request);
    shop = session.shop;
    isTest = await resolveBillingTest(admin, shop);
    const before = await getOrCreatePlan(shop);
    beforePlan = before.planName;
    // ALL six keys (monthly + annual). Passing only monthly keys made every
    // annual subscriber look unsubscribed, and this loader then wiped their
    // plan to Free on every Plans page load — while they were still billed.
    const { appSubscriptions } = await billing.check({
      plans: ALL_BILLING_PLAN_KEYS,
      isTest,
    });
    const subs = appSubscriptions ?? [];
    logger.info(
      { shop, isTest, beforePlan, subCount: subs.length, subs: subs.map((s) => ({ name: s.name, status: s.status, test: s.test })) },
      "RECONCILE_DIAG billing.check returned"
    );
    await syncBillingToPlan(shop, appSubscriptions);
    const fresh = await getOrCreatePlan(shop);
    if (fresh.planName !== beforePlan) {
      logger.warn(
        { shop, isTest, from: beforePlan, to: fresh.planName, subCount: subs.length },
        "RECONCILE_DIAG PLAN CHANGED by reconcile"
      );
    }
    return Response.json({ changed: fresh.planName !== beforePlan });
  } catch (err) {
    // Previously swallowed silently. Log it — a throw here means we KEPT state
    // (no downgrade), so if a store still reverts, the cause is a successful
    // empty billing.check above, not this catch.
    logger.error(
      { shop, isTest, beforePlan, err: err?.message, stack: err?.stack?.split("\n").slice(0, 4) },
      "RECONCILE_DIAG threw — kept state (no downgrade)"
    );
    return Response.json({ changed: false });
  }
};
