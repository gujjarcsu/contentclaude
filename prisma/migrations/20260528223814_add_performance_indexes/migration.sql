-- CreateIndex
CREATE INDEX "GenerationJob_status_startedAt_idx" ON "GenerationJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "UsageRecord_shop_productId_createdAt_idx" ON "UsageRecord"("shop", "productId", "createdAt");
