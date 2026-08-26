import { BILLING_TEST } from "../shopify.server";

// Per-shop billing test mode.
//
// Development stores can never approve REAL app charges — Shopify's approval
// page requires a payment method those stores cannot have. They are also the
// standard vehicle for App Store review: the review team exercises paid plans
// from a partner development store. So billing against a partner development
// store is ALWAYS test:true, while every other shop follows the global
// BILLING_TEST flag (real charges in production).
//
// Fail closed: if the plan lookup fails for any reason, we charge for real —
// a merchant wrongly given a test subscription is silent revenue loss, while a
// dev store wrongly offered a real charge simply cannot approve it (visible,
// recoverable).
const devStoreCache = new Map();

// Used ONLY by the subscribe path (billing.request), where test-vs-real must be
// decided before any subscription exists. The check/cancel/reconcile paths do
// NOT use this — they read the subscription's real test flag from Shopify via
// getActiveSubscriptions (App Store 1.2.3), so a wrong isTest can never hide a
// live subscription there.
export async function resolveBillingTest(admin, shop, force = BILLING_TEST) {
  if (force) return true;
  if (devStoreCache.has(shop)) return devStoreCache.get(shop);
  try {
    const res = await admin.graphql(
      `#graphql
      query ShopPlanForBillingTest {
        shop {
          plan {
            partnerDevelopment
          }
        }
      }`
    );
    const body = await res.json();
    // Only a clean response is authoritative. On GraphQL errors treat it as a
    // failed lookup (fail closed, but do NOT cache — see below).
    if (body?.errors) throw new Error("partnerDevelopment lookup returned errors");
    const isDevStore = Boolean(body?.data?.shop?.plan?.partnerDevelopment);
    // Cache ONLY successful lookups. Caching a fail-closed false used to poison
    // this per-machine cache for the process lifetime after a single transient
    // failure, so every later subscribe on that machine charged a dev store for
    // real. A non-cached failure simply retries on the next call.
    devStoreCache.set(shop, isDevStore);
    return isDevStore;
  } catch {
    // Fail closed to a REAL charge (never cached): a merchant wrongly given a
    // test subscription is silent revenue loss, while a dev store wrongly
    // offered a real charge simply cannot approve it (visible, recoverable).
    return false;
  }
}
