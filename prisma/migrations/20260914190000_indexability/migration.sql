-- P2.4 — indexability, read from the storefront itself. Nine nullable or
-- defaulted columns on ProductWatch: what the daily sitemap pass and the
-- rotating page sample found. Null means "not checked yet", never "fine".
-- Additive, no backfill: safe under a rolling deploy.
ALTER TABLE "ProductWatch" ADD COLUMN "statusShop" TEXT;
ALTER TABLE "ProductWatch" ADD COLUMN "inSitemap" BOOLEAN;
ALTER TABLE "ProductWatch" ADD COLUMN "pageCheckedAt" TIMESTAMP(3);
ALTER TABLE "ProductWatch" ADD COLUMN "pageUrl" TEXT;
ALTER TABLE "ProductWatch" ADD COLUMN "pageFinalUrl" TEXT;
ALTER TABLE "ProductWatch" ADD COLUMN "pageStatus" INTEGER;
ALTER TABLE "ProductWatch" ADD COLUMN "pageHops" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductWatch" ADD COLUMN "noindex" BOOLEAN;
ALTER TABLE "ProductWatch" ADD COLUMN "canonical" TEXT;
CREATE INDEX "ProductWatch_shop_pageCheckedAt_idx" ON "ProductWatch"("shop", "pageCheckedAt");
