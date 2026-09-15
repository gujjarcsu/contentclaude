-- Phase 11 Part A — a shop_redact request is consumed once. Additive column;
-- every request already on file is marked complete, because every one of them
-- has been processed (the sweep has run every ten minutes since) and the one
-- that was not is the one that has been re-applied to navaal-qa-fresh on
-- every install since 12 Sep. Safe under a rolling deploy.
ALTER TABLE "GDPRRequest" ADD COLUMN "completedAt" TIMESTAMP(3);
UPDATE "GDPRRequest" SET "completedAt" = "processedAt" WHERE "requestType" = 'shop_redact' AND "completedAt" IS NULL;
CREATE INDEX "GDPRRequest_requestType_completedAt_idx" ON "GDPRRequest"("requestType", "completedAt");
