-- Phase 12 A5 — the language the store was read as, and where the reading
-- came from. Additive, nullable. Safe under a rolling deploy.
ALTER TABLE "Shop" ADD COLUMN "locale" TEXT;
ALTER TABLE "Shop" ADD COLUMN "localeSource" TEXT;
