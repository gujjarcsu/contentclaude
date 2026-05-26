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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BrandVoice" ("additionalNotes", "avoidPhrases", "brandTone", "createdAt", "id", "keyDifferentiators", "sampleContent", "shop", "storeName", "targetAudience", "updatedAt") SELECT "additionalNotes", "avoidPhrases", "brandTone", "createdAt", "id", "keyDifferentiators", "sampleContent", "shop", "storeName", "targetAudience", "updatedAt" FROM "BrandVoice";
DROP TABLE "BrandVoice";
ALTER TABLE "new_BrandVoice" RENAME TO "BrandVoice";
CREATE UNIQUE INDEX "BrandVoice_shop_key" ON "BrandVoice"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
