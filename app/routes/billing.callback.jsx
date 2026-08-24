import { redirect } from "react-router";
import { apiVersion } from "../shopify.server";
import { getFreshOfflineSession } from "../utils/offlineToken.server.js";
import { syncBillingToPlan } from "../utils/plans.server";
import { invalidateCache } from "../utils/cache.server.js";
import logger from "../utils/logger.server";

// ─── Billing return callback (PUBLIC — no session cookie required) ──────────────
//
// After a merchant approves (or declines) a subscription charge, Shopify does a
// TOP-LEVEL redirect to the subscription's return_url. That redirect arrives on
// our own domain with NO embedded context and NO session cookie, so it can never
// be handled by an authenticate.admin route — the old return_url pointed at
// /app/plans, which failed auth and dumped the merchant on the bare /auth/login
// form (the exact App Store 1.2.2 rejection).
//
// This route needs no session: it resolves the shop from the query param, reads
// the shop's OFFLINE access token, asks Shopify for the current subscription
// state, records it in our DB (the webhook is the authoritative source; this is
// belt-and-suspenders + instant UX), then 302s the merchant back INTO the
// embedded app on the Plans page. The final landing is always inside the Shopify
// admin iframe — never our bare domain.

const APP_HANDLE = "navaal-seo-geo-content";
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function adminPlansUrl(shop, query) {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/apps/${APP_HANDLE}/app/plans?${query}`;
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = (url.searchParams.get("shop") || "").trim();
  const chargeId = url.searchParams.get("charge_id");

  // No usable shop → we can't rebuild the embedded context. Send them to the
  // app's admin entry generically rather than to a dead login form.
  if (!SHOP_RE.test(shop)) {
    logger.warn({ shop, chargeId }, "Billing callback without a valid shop param");
    return redirect(`https://admin.shopify.com/apps/${APP_HANDLE}`);
  }

  try {
    // Fresh offline token (auto-refreshed if near expiry) — no cookie needed.
    const session = await getFreshOfflineSession(shop);
    if (!session?.accessToken) throw new Error("no offline session for shop");

    const res = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({
          query: `#graphql
            query BillingCallbackSubs {
              currentAppInstallation {
                activeSubscriptions { id name status createdAt currentPeriodEnd }
              }
            }`,
        }),
      }
    );
    const body = await res.json();
    const subs = (body?.data?.currentAppInstallation?.activeSubscriptions ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      currentPeriodEnd: s.currentPeriodEnd,
    }));

    // Update the DB to match Shopify. syncBillingToPlan promotes the ACTIVE
    // subscription's plan, or downgrades to Free when there is no active one.
    await syncBillingToPlan(shop, subs);
    const month = new Date().toISOString().slice(0, 7);
    await invalidateCache(`plan:${shop}`);
    await invalidateCache(`canGenerate:${shop}:${month}`);

    const hasActive = subs.some((s) => s.status === "ACTIVE");
    logger.info({ shop, chargeId, active: hasActive, count: subs.length }, "Billing callback processed");
    // Active → success; otherwise the charge was declined/expired → tell the
    // Plans page to show a clear notice while the merchant stays on Free.
    return redirect(adminPlansUrl(shop, hasActive ? "upgraded=1" : "declined=1"));
  } catch (err) {
    // Never dead-end. The APP_SUBSCRIPTIONS_UPDATE webhook and the Plans page's
    // own reconcile are the backstop for state — just get the merchant back
    // into the embedded app.
    logger.error({ shop, chargeId, err: err.message }, "Billing callback failed — redirecting into app anyway");
    return redirect(adminPlansUrl(shop, "billing_error=1"));
  }
};
