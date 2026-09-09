// Test-agnostic active-subscription lookup — the authoritative source for
// "does this shop have a live paid subscription right now?".
//
// Why this exists (App Store rejection 1.2.3): `billing.check({ isTest })`
// FILTERS subscriptions by their test flag. A development/review store's
// subscription is always created `test: true`, so `billing.check({ isTest:false })`
// returns an EMPTY-but-successful result for it — and the reconcile then read
// that as "no subscription" and downgraded the plan to Free on the next page
// load. Proven from production logs on the same live sub: isTest:true → 1 sub,
// isTest:false → 0 subs.
//
// This query hits `currentAppInstallation.activeSubscriptions` directly, which
// returns EVERY active subscription regardless of its test flag, so a wrong
// isTest can never hide a real, paid, active subscription. It is the same shape
// billing.callback.jsx already relies on.
//
// Returns { ok, subs, reason }:
//   ok:true  — authoritative answer; `subs` is the COMPLETE list of active subs
//              (possibly empty, which genuinely means "no subscription").
//   ok:false — we could NOT get an authoritative answer (GraphQL error, missing
//              data, network/auth failure). Callers MUST keep the current plan
//              and NEVER downgrade on ok:false.
const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query ActiveSubscriptionsAuthoritative {
    currentAppInstallation {
      activeSubscriptions { id name status test currentPeriodEnd }
    }
  }`;

/**
 * @param {(query: string) => Promise<{ json: () => Promise<any> }>} graphql
 *   A GraphQL caller with the same contract as admin.graphql — takes a query
 *   string, resolves to an object with a .json() method.
 */
export async function getActiveSubscriptions(graphql) {
  try {
    const res = await graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
    const body = await res.json();
    const node = body?.data?.currentAppInstallation;
    // A well-formed response ALWAYS carries currentAppInstallation with an
    // activeSubscriptions array (empty if none). GraphQL errors, a null node,
    // or a non-array mean the answer is NOT authoritative — signal ok:false so
    // the caller holds the current plan instead of downgrading on ambiguity.
    if (body?.errors || !node || !Array.isArray(node.activeSubscriptions)) {
      return {
        ok: false,
        subs: [],
        reason: body?.errors ? "graphql_errors" : "missing_data",
      };
    }
    const subs = node.activeSubscriptions.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      test: s.test,
      currentPeriodEnd: s.currentPeriodEnd,
    }));
    return { ok: true, subs };
  } catch (err) {
    return { ok: false, subs: [], reason: err?.message ?? "threw" };
  }
}

/**
 * The same authoritative lookup, for callers with NO admin context: the
 * subscriptions webhook and the public billing callback. Uses the shop's
 * offline token.
 *
 * Phase 0 item 8 — the webhook needs this because a Starter → Growth upgrade
 * emits CANCELLED (the old subscription) and ACTIVE (the new one) with no
 * ordering guarantee. Acting on the CANCELLED alone drops a paying merchant to
 * Free while Shopify keeps billing them; the only safe answer is to ask Shopify
 * what is live right now.
 *
 * @returns {Promise<{ok: boolean, subs: object[], reason?: string}>}
 *   ok:false means "no authoritative answer" — callers MUST hold the current
 *   plan rather than downgrade.
 */
export async function getActiveSubscriptionsForShop(shop) {
  try {
    const [{ getFreshOfflineSession }, { apiVersion }] = await Promise.all([
      import("./offlineToken.server.js"),
      import("../shopify.server.js"),
    ]);
    const session = await getFreshOfflineSession(shop);
    if (!session?.accessToken) return { ok: false, subs: [], reason: "no_offline_session" };

    return await getActiveSubscriptions((query) =>
      fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({ query }),
      }),
    );
  } catch (err) {
    return { ok: false, subs: [], reason: err?.message ?? "threw" };
  }
}
