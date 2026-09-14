-- Phase 10 Part B — the funnel, timestamps only, one row per shop. Additive,
-- nullable, no backfill: safe under a rolling deploy.
ALTER TABLE "Shop" ADD COLUMN "firstScreenAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "firstApproveAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "returnedAt" TIMESTAMP(3);
