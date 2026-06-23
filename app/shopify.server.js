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

// Billing test mode: true on dev/staging, false in production.
const BILLING_TEST = process.env.NODE_ENV !== "production";

// Server-enriched plans: base constants + server-only billing properties
export const BILLING_PLANS = Object.fromEntries(
  Object.entries(BILLING_PLAN_BASE).map(([k, v]) => [
    k,
    { ...v, currencyCode: "USD", interval: BillingInterval.Every30Days, trialDays: 7 },
  ])
);

export { BILLING_TEST };

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {},
  billing: {
    [BILLING_PLANS.starter.key]: {
      amount: BILLING_PLANS.starter.amount,
      currencyCode: BILLING_PLANS.starter.currencyCode,
      interval: BILLING_PLANS.starter.interval,
      trialDays: BILLING_PLANS.starter.trialDays,
    },
    [BILLING_PLANS.growth.key]: {
      amount: BILLING_PLANS.growth.amount,
      currencyCode: BILLING_PLANS.growth.currencyCode,
      interval: BILLING_PLANS.growth.interval,
      trialDays: BILLING_PLANS.growth.trialDays,
    },
    [BILLING_PLANS.pro.key]: {
      amount: BILLING_PLANS.pro.amount,
      currencyCode: BILLING_PLANS.pro.currencyCode,
      interval: BILLING_PLANS.pro.interval,
      trialDays: BILLING_PLANS.pro.trialDays,
    },
    // ── Annual plans (2 months free) — additive; monthly plans above unchanged ──
    [BILLING_PLANS.starter.annualKey]: {
      amount: BILLING_PLANS.starter.annualAmount,
      currencyCode: BILLING_PLANS.starter.currencyCode,
      interval: BillingInterval.Annual,
      trialDays: BILLING_PLANS.starter.trialDays,
    },
    [BILLING_PLANS.growth.annualKey]: {
      amount: BILLING_PLANS.growth.annualAmount,
      currencyCode: BILLING_PLANS.growth.currencyCode,
      interval: BillingInterval.Annual,
      trialDays: BILLING_PLANS.growth.trialDays,
    },
    [BILLING_PLANS.pro.annualKey]: {
      amount: BILLING_PLANS.pro.annualAmount,
      currencyCode: BILLING_PLANS.pro.currencyCode,
      interval: BillingInterval.Annual,
      trialDays: BILLING_PLANS.pro.trialDays,
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
