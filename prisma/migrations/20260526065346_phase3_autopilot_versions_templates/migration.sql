-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContentTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentLength" TEXT NOT NULL DEFAULT 'standard',
    "contentTypes" TEXT NOT NULL DEFAULT 'description,metaTitle,metaDescription',
    "keywords" TEXT NOT NULL DEFAULT '',
    "customInstructions" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BrandVoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "storeName" TEXT NOT NULL DEFAULT '',
    "brandTone" TEXT NOT NULL DEFAULT 'professional',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "keyDifferentiators" TEXT NOT NULL DEFAULT '',
    "avoidPhrases" TEXT NOT NULL DEFAULT '',
    "sampleContent" TEXT NOT NULL DEFAULT '',
    "additionalNotes" TEXT NOT NULL DEFAULT '',
    "targetKeywords" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'en',
    "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autopilotAutoPublish" BOOLEAN NOT NULL DEFAULT false,
    "autopilotContentTypes" TEXT NOT NULL DEFAULT 'description,metaTitle,metaDescription',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BrandVoice" ("additionalNotes", "avoidPhrases", "brandTone", "createdAt", "id", "keyDifferentiators", "language", "sampleContent", "shop", "storeName", "targetAudience", "targetKeywords", "updatedAt") SELECT "additionalNotes", "avoidPhrases", "brandTone", "createdAt", "id", "keyDifferentiators", "language", "sampleContent", "shop", "storeName", "targetAudience", "targetKeywords", "updatedAt" FROM "BrandVoice";
DROP TABLE "BrandVoice";
ALTER TABLE "new_BrandVoice" RENAME TO "BrandVoice";
CREATE UNIQUE INDEX "BrandVoice_shop_key" ON "BrandVoice"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ContentVersion_shop_productId_contentType_idx" ON "ContentVersion"("shop", "productId", "contentType");

-- CreateIndex
CREATE INDEX "ContentVersion_shop_createdAt_idx" ON "ContentVersion"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ContentTemplate_shop_idx" ON "ContentTemplate"("shop");
