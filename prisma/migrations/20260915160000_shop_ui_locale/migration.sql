-- Phase 12 Part D (D0) — the merchant's chosen display language for the app's
-- own screens, when they override the one Shopify's admin passes. Additive,
-- nullable (null = follow the admin locale). Safe under a rolling deploy.
ALTER TABLE "Shop" ADD COLUMN "uiLocale" TEXT;
