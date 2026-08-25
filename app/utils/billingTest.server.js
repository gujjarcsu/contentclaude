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
    // RECONCILE_DIAG: prove whether the partnerDevelopment lookup succeeds and
    // what isTest we resolve. A failure here fail-closes to false, which makes
    // billing.check(isTest:false) miss a TEST subscription -> false downgrade.
    _diagLog("info", { shop, status: res.status, partnerDevelopment: body?.data?.shop?.plan?.partnerDevelopment, hasErrors: !!body?.errors }, "RESOLVE_BILLING_TEST_DIAG query result");
    isDevStore = Boolean(body?.data?.shop?.plan?.partnerDevelopment);
  } catch (err) {
    _diagLog("error", { shop, err: err?.message }, "RESOLVE_BILLING_TEST_DIAG query THREW -> isTest=false (fail-closed)");
    isDevStore = false;
  }
  devStoreCache.set(shop, isDevStore);
  return isDevStore;
}

// Lazy logger import to avoid a static server-only dependency in this small util.
function _diagLog(level, obj, msg) {
  import("./logger.server.js").then((m) => m.default[level](obj, msg)).catch(() => {});
}
