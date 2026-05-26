import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Billing test mode: true on dev/staging, false in production.
// Flip to false before App Store submission and use real Shopify partner charges.
const BILLING_TEST = process.env.NODE_ENV !== "production";

export const BILLING_PLANS = {
  starter: {
    key: "Starter Plan",
    planName: "starter",
    amount: 9.99,
    monthlyLimit: 50,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    trialDays: 7,
  },
  growth: {
    key: "Growth Plan",
    planName: "growth",
    amount: 29.99,
    monthlyLimit: 200,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    trialDays: 7,
  },
  pro: {
    key: "Professional Plan",
    planName: "pro",
    amount: 79.99,
    monthlyLimit: 1000,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
    trialDays: 7,
  },
};

export { BILLING_TEST };

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
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
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
