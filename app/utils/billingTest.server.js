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

export async function resolveBillingTest(admin, shop, force = BILLING_TEST) {
  if (force) return true;
  if (devStoreCache.has(shop)) return devStoreCache.get(shop);
  let isDevStore = false;
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
    isDevStore = Boolean(body?.data?.shop?.plan?.partnerDevelopment);
  } catch {
    isDevStore = false;
  }
  devStoreCache.set(shop, isDevStore);
  return isDevStore;
}
