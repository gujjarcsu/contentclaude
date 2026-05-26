-- CreateTable
CREATE TABLE "BrandVoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "storeName" TEXT NOT NULL DEFAULT '',
    "brandTone" TEXT NOT NULL DEFAULT 'professional',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "keyDifferentiators" TEXT NOT NULL DEFAULT '',
    "avoidPhrases" TEXT NOT NULL DEFAULT '',
    "sampleContent" TEXT NOT NULL DEFAULT '',
    "additionalNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GeneratedContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL DEFAULT '',
    "contentType" TEXT NOT NULL,
    "originalContent" TEXT NOT NULL DEFAULT '',
    "generatedContent" TEXT NOT NULL DEFAULT '',
    "publishedContent" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "planName" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "monthlyLimit" INTEGER NOT NULL DEFAULT 10,
    "trialEndsAt" DATETIME,
    "renewsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "productId" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "completedProducts" INTEGER NOT NULL DEFAULT 0,
    "failedProducts" INTEGER NOT NULL DEFAULT 0,
    "contentTypes" TEXT NOT NULL DEFAULT 'description',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandVoice_shop_key" ON "BrandVoice"("shop");

-- CreateIndex
CREATE INDEX "GeneratedContent_shop_productId_idx" ON "GeneratedContent"("shop", "productId");

-- CreateIndex
CREATE INDEX "GeneratedContent_shop_status_idx" ON "GeneratedContent"("shop", "status");

-- CreateIndex
CREATE INDEX "GeneratedContent_shop_updatedAt_idx" ON "GeneratedContent"("shop", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedContent_shop_productId_contentType_key" ON "GeneratedContent"("shop", "productId", "contentType");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_shop_key" ON "Plan"("shop");

-- CreateIndex
CREATE INDEX "UsageRecord_shop_month_idx" ON "UsageRecord"("shop", "month");

-- CreateIndex
CREATE INDEX "UsageRecord_shop_createdAt_idx" ON "UsageRecord"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_shop_status_idx" ON "GenerationJob"("shop", "status");

-- CreateIndex
CREATE INDEX "GenerationJob_shop_createdAt_idx" ON "GenerationJob"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");
