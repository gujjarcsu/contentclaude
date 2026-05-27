-- CreateTable
CREATE TABLE "CollectionVoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "brandTone" TEXT NOT NULL DEFAULT '',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT NOT NULL DEFAULT ''
);

-- CreateIndex
CREATE INDEX "CollectionVoice_shop_idx" ON "CollectionVoice"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionVoice_shop_collectionId_key" ON "CollectionVoice"("shop", "collectionId");
