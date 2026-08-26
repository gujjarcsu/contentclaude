import { authenticate } from "../shopify.server";
import { getActiveSubscriptions } from "../utils/activeSubscriptions.server.js";
import { getOrCreatePlan, syncBillingToPlan } from "../utils/plans.server";
import logger from "../utils/logger.server.js";

// Resource route (loader only — no UI). The Plans page calls this via useFetcher
// AFTER first paint. Reconciling here instead of in the Plans loader guarantees
// it can NEVER hold the Plans response open. Returns { changed } so the page
// revalidates only if Shopify reports a plan the webhook missed.
//
// App Store 1.2.3 fix: this used to call `billing.check({ isTest })`, which
// FILTERS by the subscription's test flag. A dev/review store's sub is
// test:true, so when isTest resolved false the check returned a
// successful-but-EMPTY result and this reconcile downgraded the plan to Free on
// reload. It now uses a test-AGNOSTIC lookup (getActiveSubscriptions) and
// downgrades ONLY on an authoritative answer showing zero active subscriptions.
// On ANY error/ambiguity it keeps the current plan — a downgrade requires
// positive proof, never absence of proof.
export const loader = async ({ request }) => {
  // authenticate.admin is inside the try on purpose: it throws a REDIRECT on an
  // auth miss, and this loader is a background fetcher.load — a followed redirect
  // would yank the embedded app to /auth/login. Swallow everything and return a
  // no-op; the Plans page's own loader handles real re-auth for the navigation.
  let shop = "unknown";
  let beforePlan = null;
  try {
    const { session, admin } = await authenticate.admin(request);
    shop = session.shop;
    const before = await getOrCreatePlan(shop);
    beforePlan = before.planName;

    // Test-agnostic: returns EVERY active subscription (test or real). ok:false
    // means the lookup was not authoritative — keep state, never downgrade.
    let lookup = await getActiveSubscriptions(admin.graphql);
    // TEMPORARY (App Store 1.2.3 acceptance test #4): when DIAG_FORCE_UNAUTH=1,
    // simulate a total loss of Shopify access to prove live that an
    // unauthoritative answer keeps the current plan instead of downgrading.
    // Removed immediately after the live test; off unless the secret is set.
    if (process.env.DIAG_FORCE_UNAUTH === "1") {
      lookup = { ok: false, subs: [], reason: "forced_unauth_diag" };
    }
    const { ok, subs, reason } = lookup;
    if (!ok) {
      logger.warn(
        { shop, beforePlan, reason },
        "reconcile: active-subscription lookup not authoritative — kept current plan (no downgrade)"
      );
      return Response.json({ changed: false });
    }

    // Authoritative answer. syncBillingToPlan promotes to the ACTIVE sub's plan,
    // or downgrades to Free ONLY because we positively confirmed zero active subs.
    await syncBillingToPlan(shop, subs);
    const fresh = await getOrCreatePlan(shop);
    const changed = fresh.planName !== beforePlan;
    if (changed) {
      logger.info(
        { shop, from: beforePlan, to: fresh.planName, subCount: subs.length },
        "reconcile: plan reconciled from Shopify active subscriptions"
      );
    }
    return Response.json({ changed });
  } catch (err) {
    // A throw here means we KEPT state (no downgrade). Log it so a genuine
    // reconcile failure is visible rather than silently swallowed.
    logger.error(
      { shop, beforePlan, err: err?.message },
      "reconcile: threw — kept current plan (no downgrade)"
    );
    return Response.json({ changed: false });
  }
};
