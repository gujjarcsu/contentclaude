import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { BILLING_PLANS as BILLING_PLAN_BASE } from "./utils/billing-plans.js";
import { refreshOfflineToken } from "./utils/offlineToken.server.js";

// Billing test mode: always on outside production (real charges off). In
// production it's off — UNLESS explicitly overridden for pre-launch testing.
// Development stores can only approve TEST charges (never real ones), so to test
// the upgrade flow on a dev store while deployed, set BILLING_TEST_OVERRIDE=on.
// ⚠️ REMOVE that override before onboarding real merchants, or no one gets billed.
const BILLING_TEST =
  process.env.NODE_ENV !== "production" || process.env.BILLING_TEST_OVERRIDE === "on";

// Defensive guard: in production, test billing is allowed ONLY via the explicit
// override. This still catches an accidental NODE_ENV slip (which would silently
// give free subscriptions) while permitting intentional pre-launch testing.
if (
  process.env.NODE_ENV === "production" &&
  BILLING_TEST &&
  process.env.BILLING_TEST_OVERRIDE !== "on"
) {
  throw new Error("FATAL: BILLING_TEST true in production without BILLING_TEST_OVERRIDE");
}

// Server-enriched plans: base constants + server-only billing properties
export const BILLING_PLANS = Object.fromEntries(
  Object.entries(BILLING_PLAN_BASE).map(([k, v]) => [
    k,
    { ...v, currencyCode: "USD", interval: BillingInterval.Every30Days, trialDays: 7 },
  ])
);

export { BILLING_TEST };

// Build a subscription billing entry in the lineItems format the Shopify billing
// library now requires (one recurring line item per plan).
function recurringPlan(amount, currencyCode, interval, trialDays) {
  return {
    trialDays,
    lineItems: [{ amount, currencyCode, interval }],
  };
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    // Shopify now rejects non-expiring offline access tokens (HTTP 403:
    // "Non-expiring access tokens are no longer accepted"). This flag makes
    // token exchange request EXPIRING offline tokens, which the library then
    // refreshes automatically before they lapse — so the embedded app never
    // surfaces a "session expired" error during normal use.
    expiringOfflineAccessTokens: true,
  },
  // The installed @shopify/shopify-api requires each subscription plan to use the
  // lineItems format ({ trialDays, lineItems: [{ amount, currencyCode, interval }] }).
  // The older flat shape ({ amount, currencyCode, interval }) is no longer accepted
  // and throws "Must be either a one-time plan or a subscription plan with line items"
  // from appSubscriptionCreate. Build monthly + annual (2 months free) for each tier.
  billing: Object.fromEntries(
    Object.values(BILLING_PLANS).flatMap((p) => [
      [p.key, recurringPlan(p.amount, p.currencyCode, p.interval, p.trialDays)],
      [p.annualKey, recurringPlan(p.annualAmount, p.currencyCode, BillingInterval.Annual, p.trialDays)],
    ])
  ),
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;

// ── Resilient offline-token refresh ─────────────────────────────────────────────
// Expiring offline tokens last ~1 hour. The embedded admin flow RE-EXCHANGES the
// session token on expiry instead of using the refresh token; that re-exchange can
// throw a hard 500 (surfacing as "Unexpected Server Error" on every page). The
// refresh_token grant, however, works reliably — so when authenticate.admin throws
// a 500, we refresh the offline token directly and retry once. Transparent to the
// merchant; the happy path is untouched (only a thrown 500 triggers this).
function shopFromRequest(request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("shop");
    if (q) return q;
    const auth = request.headers.get("authorization");
    const jwt = (auth && auth.replace(/^Bearer\s+/i, "")) || url.searchParams.get("id_token");
    if (!jwt) return null;
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString("utf8"));
    return payload?.dest ? payload.dest.replace(/^https?:\/\//, "") : null;
  } catch {
    return null;
  }
}

const _rawAdmin = shopify.authenticate.admin.bind(shopify.authenticate);
shopify.authenticate.admin = async (request) => {
  try {
    return await _rawAdmin(request);
  } catch (err) {
    if (err instanceof Response && err.status === 500) {
      const shop = shopFromRequest(request);
      if (shop && (await refreshOfflineToken(shop))) {
        return await _rawAdmin(request);
      }
    }
    throw err;
  }
};

export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
